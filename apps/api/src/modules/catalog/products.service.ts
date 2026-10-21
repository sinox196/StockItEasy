import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  CreateProductInput,
  d,
  internalEan13,
  priceWithTax,
  productImportRow,
  productListQuery,
  UpdateProductInput,
} from '@stockiteasy/shared';
import { z } from 'zod';
import { AuditService } from '../../common/audit.service';
import { TenantContext } from '../../common/context';
import { AppError } from '../../common/errors';
import { pageArgs, paginated } from '../../common/pagination';
import { PrismaService, Tx } from '../../prisma/prisma.service';
import { InventoryEngine } from '../inventory/inventory.engine';
import { OrganizationsService } from '../organizations/organizations.service';

type StockSummary = { onHand: string; reserved: string; blocked: string; available: string; state: 'OK' | 'LOW' | 'OUT' };

export function stockState(available: Prisma.Decimal | string | number, minStock: Prisma.Decimal | string | number): 'OK' | 'LOW' | 'OUT' {
  const a = d(available.toString());
  if (a.lte(0)) return 'OUT';
  if (a.lt(d(minStock.toString()))) return 'LOW';
  return 'OK';
}

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: InventoryEngine,
    private readonly audit: AuditService,
    private readonly orgs: OrganizationsService,
  ) {}

  private async assertRefs(tx: Tx, ctx: TenantContext, input: Partial<CreateProductInput>) {
    if (input.categoryId && !(await tx.productCategory.findFirst({ where: { id: input.categoryId, organizationId: ctx.organizationId } }))) {
      throw AppError.notFound({ categoryId: input.categoryId });
    }
    if (input.preferredSupplierId && !(await tx.supplier.findFirst({ where: { id: input.preferredSupplierId, organizationId: ctx.organizationId } }))) {
      throw AppError.notFound({ preferredSupplierId: input.preferredSupplierId });
    }
    if (input.parentId && !(await tx.product.findFirst({ where: { id: input.parentId, organizationId: ctx.organizationId } }))) {
      throw AppError.notFound({ parentId: input.parentId });
    }
  }

  private async nextInternalBarcode(tx: Tx, organizationId: string): Promise<string> {
    for (let i = 0; i < 5; i++) {
      const org = await tx.organization.update({ where: { id: organizationId }, data: { barcodeSequence: { increment: 1 } }, select: { barcodeSequence: true } });
      const code = internalEan13(org.barcodeSequence);
      const taken = await tx.productBarcode.findUnique({ where: { organizationId_code: { organizationId, code } } });
      if (!taken) return code;
    }
    throw AppError.conflict('BARCODE_TAKEN');
  }

  async create(ctx: TenantContext, input: CreateProductInput, opts: { isDemo?: boolean; occurredAt?: Date; tx?: Tx } = {}) {
    const run = async (tx: Tx) => {
      await this.orgs.assertQuota(ctx.organizationId, 'products', tx);
      await this.assertRefs(tx, ctx, input);
      const barcodes = [...new Set(input.barcodes)];
      if (input.generateBarcode && barcodes.length === 0) barcodes.push(await this.nextInternalBarcode(tx, ctx.organizationId));
      const tracking = input.hasExpiry ? 'LOT' : input.tracking;
      const product = await tx.product.create({
        data: {
          organizationId: ctx.organizationId,
          sku: input.sku,
          name: input.name,
          description: input.description,
          categoryId: input.categoryId,
          brand: input.brand,
          baseUnit: input.baseUnit,
          allowFractionalQty: input.allowFractionalQty,
          tracking,
          hasExpiry: input.hasExpiry,
          purchasePrice: input.purchasePrice,
          salePrice: input.salePrice,
          minSalePrice: input.minSalePrice,
          averageCost: input.purchasePrice,
          taxRate: input.taxRate,
          minStock: input.minStock,
          maxStock: input.maxStock,
          preferredSupplierId: input.preferredSupplierId,
          parentId: input.parentId,
          variantAttributes: (input.variantAttributes ?? undefined) as Prisma.InputJsonValue | undefined,
          status: input.status,
          isDemo: opts.isDemo ?? false,
          barcodes: { create: barcodes.map((code, i) => ({ organizationId: ctx.organizationId, code, isPrimary: i === 0 })) },
          conversions: {
            create: input.conversions.map((c) => ({ organizationId: ctx.organizationId, unitCode: c.unitCode, factor: c.factor })),
          },
          images: { create: input.imageUrls.map((url, i) => ({ organizationId: ctx.organizationId, url, position: i })) },
        },
      });
      for (const c of input.conversions.filter((c) => c.barcode)) {
        await tx.productBarcode.create({ data: { organizationId: ctx.organizationId, productId: product.id, code: c.barcode!, unitCode: c.unitCode } });
      }
      if (input.openingStock) {
        await this.engine.apply(tx, {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          productId: product.id,
          warehouseId: input.openingStock.warehouseId,
          type: 'OPENING',
          quantity: input.openingStock.quantity,
          unitCost: input.openingStock.unitCost ?? input.purchasePrice,
          referenceType: 'PRODUCT',
          referenceId: product.id,
          lotNumber: tracking === 'LOT' ? 'OPENING' : undefined,
          expiryDate: input.hasExpiry ? new Date(Date.now() + 180 * 86400_000) : undefined,
          occurredAt: opts.occurredAt,
        });
      }
      await this.audit.log(ctx, { action: 'product.create', entityType: 'Product', entityId: product.id, data: { sku: product.sku, name: product.name } }, tx);
      return product;
    };
    const product = opts.tx ? await run(opts.tx) : await this.prisma.tx(run);
    return opts.tx ? product : this.get(ctx, product.id);
  }

  async update(ctx: TenantContext, id: string, input: UpdateProductInput) {
    const updated = await this.prisma.tx(async (tx) => {
      const before = await tx.product.findFirst({ where: { id, organizationId: ctx.organizationId }, include: { barcodes: true, conversions: true } });
      if (!before) throw AppError.notFound();
      if (input.version !== undefined && input.version !== before.version) throw AppError.conflict('CONFLICT', { currentVersion: before.version });
      await this.assertRefs(tx, ctx, input);
      const { barcodes, conversions, imageUrls, version: _v, variantAttributes, ...fields } = input;
      const res = await tx.product.updateMany({
        where: { id, organizationId: ctx.organizationId, version: before.version },
        data: {
          ...fields,
          tracking: fields.hasExpiry ? 'LOT' : fields.tracking,
          variantAttributes: variantAttributes === undefined ? undefined : ((variantAttributes ?? Prisma.DbNull) as Prisma.InputJsonValue),
          version: { increment: 1 },
        },
      });
      if (res.count !== 1) throw AppError.conflict();
      if (barcodes) {
        const wanted = [...new Set(barcodes)];
        await tx.productBarcode.deleteMany({ where: { productId: id, unitCode: null, code: { notIn: wanted } } });
        for (const [i, code] of wanted.entries()) {
          await tx.productBarcode.upsert({
            where: { organizationId_code: { organizationId: ctx.organizationId, code } },
            create: { organizationId: ctx.organizationId, productId: id, code, isPrimary: i === 0 },
            update: { isPrimary: i === 0 },
          }).then(async (b) => {
            if (b.productId !== id) throw AppError.conflict('BARCODE_TAKEN');
          });
        }
      }
      if (conversions) {
        await tx.unitConversion.deleteMany({ where: { productId: id } });
        await tx.productBarcode.deleteMany({ where: { productId: id, unitCode: { not: null } } });
        for (const c of conversions) {
          await tx.unitConversion.create({ data: { organizationId: ctx.organizationId, productId: id, unitCode: c.unitCode, factor: c.factor } });
          if (c.barcode) await tx.productBarcode.create({ data: { organizationId: ctx.organizationId, productId: id, code: c.barcode, unitCode: c.unitCode } });
        }
      }
      if (imageUrls) {
        await tx.productImage.deleteMany({ where: { productId: id } });
        await tx.productImage.createMany({ data: imageUrls.map((url, i) => ({ organizationId: ctx.organizationId, productId: id, url, position: i })) });
      }
      const changes: Record<string, { from: unknown; to: unknown }> = {};
      for (const [k, v] of Object.entries(fields)) {
        const prev = (before as Record<string, unknown>)[k];
        if (v !== undefined && String(prev ?? '') !== String(v ?? '')) changes[k] = { from: prev, to: v };
      }
      await this.audit.log(ctx, { action: 'product.update', entityType: 'Product', entityId: id, data: changes }, tx);
      return id;
    });
    return this.get(ctx, updated);
  }

  /** Products with history are archived, never deleted. */
  async archive(ctx: TenantContext, id: string) {
    const product = await this.prisma.product.findFirst({ where: { id, organizationId: ctx.organizationId } });
    if (!product) throw AppError.notFound();
    await this.prisma.product.update({ where: { id }, data: { status: 'ARCHIVED', version: { increment: 1 } } });
    await this.audit.log(ctx, { action: 'product.archive', entityType: 'Product', entityId: id });
  }

  async list(ctx: TenantContext, q: z.infer<typeof productListQuery>) {
    const where: Prisma.ProductWhereInput = {
      organizationId: ctx.organizationId,
      categoryId: q.categoryId,
      status: q.status ?? { not: 'ARCHIVED' },
      ...(q.supplierId ? { OR: [{ preferredSupplierId: q.supplierId }, { supplierProducts: { some: { supplierId: q.supplierId } } }] } : {}),
    };
    if (q.search) {
      const s = q.search.trim();
      where.AND = [
        {
          OR: [
            { name: { contains: s, mode: 'insensitive' } },
            { sku: { contains: s, mode: 'insensitive' } },
            { brand: { contains: s, mode: 'insensitive' } },
            { barcodes: { some: { code: s } } },
          ],
        },
      ];
    }
    let ids: string[] | undefined;
    if (q.stockState) {
      // Stock state depends on aggregated balances: filter in SQL.
      const rows = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT p.id FROM products p
        LEFT JOIN inventory_balances b ON b."productId" = p.id ${q.warehouseId ? Prisma.sql`AND b."warehouseId" = ${q.warehouseId}::uuid` : Prisma.empty}
        WHERE p."organizationId" = ${ctx.organizationId}::uuid AND p.status <> 'ARCHIVED'
        GROUP BY p.id, p."minStock"
        HAVING ${
          q.stockState === 'OUT'
            ? Prisma.sql`COALESCE(SUM(b."quantityOnHand" - b."quantityReserved" - b."quantityBlocked"), 0) <= 0`
            : q.stockState === 'LOW'
              ? Prisma.sql`COALESCE(SUM(b."quantityOnHand" - b."quantityReserved" - b."quantityBlocked"), 0) > 0 AND COALESCE(SUM(b."quantityOnHand" - b."quantityReserved" - b."quantityBlocked"), 0) < p."minStock"`
              : Prisma.sql`COALESCE(SUM(b."quantityOnHand" - b."quantityReserved" - b."quantityBlocked"), 0) >= GREATEST(p."minStock", 0.001)`
        }`;
      ids = rows.map((r) => r.id);
      where.id = { in: ids };
    }
    const orderBy: Prisma.ProductOrderByWithRelationInput =
      q.sort === 'name' ? { name: q.order } : q.sort === 'sku' ? { sku: q.order } : q.sort === 'salePrice' ? { salePrice: q.order } : { updatedAt: q.order };
    const [items, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        orderBy,
        ...pageArgs(q),
        include: {
          category: { select: { id: true, name: true } },
          barcodes: { where: { isPrimary: true }, select: { code: true }, take: 1 },
          images: { select: { url: true }, take: 1, orderBy: { position: 'asc' } },
        },
      }),
      this.prisma.product.count({ where }),
    ]);
    const stock = await this.stockSummaries(ctx, items.map((p) => p.id), q.warehouseId);
    return paginated(
      items.map((p) => ({
        ...p,
        barcode: p.barcodes[0]?.code ?? null,
        imageUrl: p.images[0]?.url ?? null,
        salePriceTtc: priceWithTax(p.salePrice.toString(), p.taxRate.toString()).toFixed(3),
        stock: stock.get(p.id) ?? { onHand: '0.000', reserved: '0.000', blocked: '0.000', available: '0.000', state: stockState(0, p.minStock) },
      })),
      total,
      q,
    );
  }

  async stockSummaries(ctx: TenantContext, productIds: string[], warehouseId?: string): Promise<Map<string, StockSummary>> {
    if (productIds.length === 0) return new Map();
    const rows = await this.prisma.inventoryBalance.groupBy({
      by: ['productId'],
      where: { organizationId: ctx.organizationId, productId: { in: productIds }, warehouseId },
      _sum: { quantityOnHand: true, quantityReserved: true, quantityBlocked: true },
    });
    const mins = await this.prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, minStock: true } });
    const minMap = new Map(mins.map((m) => [m.id, m.minStock]));
    return new Map(
      rows.map((r) => {
        const onHand = d(r._sum.quantityOnHand?.toString() ?? 0);
        const reserved = d(r._sum.quantityReserved?.toString() ?? 0);
        const blocked = d(r._sum.quantityBlocked?.toString() ?? 0);
        const available = onHand.minus(reserved).minus(blocked);
        return [
          r.productId,
          {
            onHand: onHand.toFixed(3),
            reserved: reserved.toFixed(3),
            blocked: blocked.toFixed(3),
            available: available.toFixed(3),
            state: stockState(available.toString(), minMap.get(r.productId) ?? 0),
          },
        ];
      }),
    );
  }

  async get(ctx: TenantContext, id: string) {
    const p = await this.prisma.product.findFirst({
      where: { id, organizationId: ctx.organizationId },
      include: {
        category: { select: { id: true, name: true } },
        barcodes: { orderBy: { isPrimary: 'desc' } },
        conversions: true,
        images: { orderBy: { position: 'asc' } },
        preferredSupplier: { select: { id: true, name: true } },
        parent: { select: { id: true, name: true, sku: true } },
        variants: { select: { id: true, name: true, sku: true, variantAttributes: true } },
        supplierProducts: { include: { supplier: { select: { id: true, name: true } } } },
        balances: { include: { warehouse: { select: { id: true, name: true, code: true } } } },
      },
    });
    if (!p) throw AppError.notFound();
    const stock = (await this.stockSummaries(ctx, [id])).get(id) ?? {
      onHand: '0.000',
      reserved: '0.000',
      blocked: '0.000',
      available: '0.000',
      state: stockState(0, p.minStock),
    };
    const sale = d(p.salePrice.toString());
    const cost = d(p.averageCost.toString());
    return {
      ...p,
      stock,
      salePriceTtc: priceWithTax(p.salePrice.toString(), p.taxRate.toString()).toFixed(3),
      marginRate: sale.gt(0) ? sale.minus(cost).div(sale).times(100).toFixed(2) : null,
      stockValue: d(stock.onHand).times(cost).toFixed(3),
    };
  }

  /** Scan lookup: exact barcode (including packaging barcodes) or SKU. */
  async lookup(ctx: TenantContext, code: string, warehouseId?: string) {
    const c = code.trim();
    const barcode = await this.prisma.productBarcode.findUnique({ where: { organizationId_code: { organizationId: ctx.organizationId, code: c } } });
    let productId = barcode?.productId;
    if (!productId) {
      const bySku = await this.prisma.product.findFirst({ where: { organizationId: ctx.organizationId, sku: c.toUpperCase() }, select: { id: true } });
      productId = bySku?.id;
    }
    if (!productId) throw AppError.notFound({ code: c });
    const product = await this.get(ctx, productId);
    const unitFactor = barcode?.unitCode ? product.conversions.find((x) => x.unitCode === barcode.unitCode)?.factor.toString() ?? '1' : '1';
    const warehouseStock = warehouseId ? (await this.stockSummaries(ctx, [productId], warehouseId)).get(productId) : undefined;
    return { product, scannedUnit: barcode?.unitCode ?? product.baseUnit, unitFactor, warehouseStock: warehouseStock ?? null };
  }

  /** CSV/Excel import: validates every row; with dryRun=false creates or updates by SKU. */
  async import(ctx: TenantContext, rows: Record<string, unknown>[], dryRun: boolean) {
    const report: { row: number; sku?: string; status: 'valid' | 'invalid' | 'created' | 'updated'; errors?: { path: string; message: string }[] }[] = [];
    const parsed: { row: number; data: z.infer<typeof productImportRow> }[] = [];
    const clean = (v: unknown) => (typeof v === 'string' ? (v.trim() === '' ? undefined : v.trim()) : v ?? undefined);
    rows.forEach((raw, i) => {
      const normalized = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k.trim(), clean(v)]));
      const r = productImportRow.safeParse(normalized);
      if (r.success) {
        parsed.push({ row: i + 1, data: r.data });
        report.push({ row: i + 1, sku: r.data.sku, status: 'valid' });
      } else {
        report.push({ row: i + 1, sku: String(normalized.sku ?? ''), status: 'invalid', errors: r.error.issues.map((x) => ({ path: x.path.join('.'), message: x.message })) });
      }
    });
    const dupes = new Set(parsed.map((p) => p.data.sku).filter((s, i, a) => a.indexOf(s) !== i));
    for (const r of report) if (r.sku && dupes.has(r.sku) && r.status === 'valid') Object.assign(r, { status: 'invalid', errors: [{ path: 'sku', message: 'validation.sku' }] });
    if (dryRun) return { dryRun, report, valid: report.filter((r) => r.status === 'valid').length, invalid: report.filter((r) => r.status === 'invalid').length };

    const toImport = parsed.filter((p) => !dupes.has(p.data.sku));
    await this.prisma.tx(async (tx) => {
      const categories = new Map((await tx.productCategory.findMany({ where: { organizationId: ctx.organizationId } })).map((c) => [c.name.toLowerCase(), c.id]));
      for (const { row, data } of toImport) {
        let categoryId: string | undefined;
        if (data.category) {
          categoryId = categories.get(data.category.toLowerCase());
          if (!categoryId) {
            categoryId = (await tx.productCategory.create({ data: { organizationId: ctx.organizationId, name: data.category } })).id;
            categories.set(data.category.toLowerCase(), categoryId);
          }
        }
        const existing = await tx.product.findUnique({ where: { organizationId_sku: { organizationId: ctx.organizationId, sku: data.sku } } });
        const fields = {
          name: data.name,
          brand: data.brand,
          baseUnit: data.baseUnit ?? 'pc',
          purchasePrice: data.purchasePrice ?? '0',
          salePrice: data.salePrice ?? '0',
          taxRate: data.taxRate ?? '19',
          minStock: data.minStock ?? '0',
          maxStock: data.maxStock,
          categoryId,
        };
        let productId: string;
        if (existing) {
          await tx.product.update({ where: { id: existing.id }, data: { ...fields, version: { increment: 1 } } });
          productId = existing.id;
          report.find((r) => r.row === row)!.status = 'updated';
        } else {
          await this.orgs.assertQuota(ctx.organizationId, 'products', tx);
          productId = (await tx.product.create({ data: { ...fields, organizationId: ctx.organizationId, sku: data.sku, averageCost: fields.purchasePrice } })).id;
          report.find((r) => r.row === row)!.status = 'created';
        }
        if (data.barcode) {
          const b = await tx.productBarcode.findUnique({ where: { organizationId_code: { organizationId: ctx.organizationId, code: data.barcode } } });
          if (b && b.productId !== productId) throw AppError.conflict('BARCODE_TAKEN', { row, code: data.barcode });
          if (!b) await tx.productBarcode.create({ data: { organizationId: ctx.organizationId, productId, code: data.barcode, isPrimary: true } });
        }
      }
      await this.audit.log(ctx, { action: 'product.import', entityType: 'Product', data: { rows: toImport.length } }, tx);
    });
    return {
      dryRun,
      report,
      created: report.filter((r) => r.status === 'created').length,
      updated: report.filter((r) => r.status === 'updated').length,
      invalid: report.filter((r) => r.status === 'invalid').length,
    };
  }

  async exportCsv(ctx: TenantContext): Promise<string> {
    const products = await this.prisma.product.findMany({
      where: { organizationId: ctx.organizationId, status: { not: 'ARCHIVED' } },
      include: { category: true, barcodes: { where: { isPrimary: true }, take: 1 } },
      orderBy: { sku: 'asc' },
    });
    const stock = await this.stockSummaries(ctx, products.map((p) => p.id));
    const header = ['sku', 'name', 'barcode', 'category', 'brand', 'baseUnit', 'purchasePrice', 'salePrice', 'taxRate', 'averageCost', 'minStock', 'maxStock', 'onHand', 'available', 'status'];
    const esc = (v: unknown) => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = products.map((p) =>
      [
        p.sku, p.name, p.barcodes[0]?.code, p.category?.name, p.brand, p.baseUnit, p.purchasePrice, p.salePrice, p.taxRate, p.averageCost,
        p.minStock, p.maxStock, stock.get(p.id)?.onHand ?? '0', stock.get(p.id)?.available ?? '0', p.status,
      ].map(esc).join(','),
    );
    return '﻿' + [header.join(','), ...lines].join('\n');
  }
}
