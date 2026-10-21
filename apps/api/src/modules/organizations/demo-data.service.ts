import { Injectable, Logger } from '@nestjs/common';
import { SYSTEM_ROLES } from '@stockiteasy/shared';
import { TenantContext } from '../../common/context';
import { PrismaService } from '../../prisma/prisma.service';
import { InventoryEngine } from '../inventory/inventory.engine';
import { ProductsService } from '../catalog/products.service';
import { SequenceService } from '../../common/sequence.service';

/** Deterministic pseudo-random generator so demo data is reproducible. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const DEMO_PRODUCTS = [
  { sku: 'OLV-001', name: "Huile d'olive extra vierge 1L", barcode: '6191001000012', cat: 0, buy: '18.000', sell: '20.924', min: 10, daily: 2.2, open: 100 },
  { sku: 'WTR-150', name: 'Eau minérale 1,5L', barcode: '6191001000159', cat: 1, buy: '0.650', sell: '0.950', min: 40, daily: 14, open: 800 },
  { sku: 'CAF-250', name: 'Café moulu 250g', barcode: '6191001000258', cat: 0, buy: '6.200', sell: '8.235', min: 15, daily: 3.1, open: 160 },
  { sku: 'SHP-400', name: 'Shampoing 400ml', barcode: '6191001000388', cat: 3, buy: '9.400', sell: '12.185', min: 12, daily: 1.2, open: 30 },
  { sku: 'BSC-210', name: 'Biscuits chocolat 210g', barcode: '6191001000555', cat: 4, buy: '1.700', sell: '2.479', min: 20, daily: 6.5, open: 350 },
  { sku: 'LAT-001', name: 'Lait demi-écrémé 1L', barcode: '6191001000999', cat: 2, buy: '1.180', sell: '1.350', min: 30, daily: 11, open: 520 },
  { sku: 'SUC-001', name: 'Sucre blanc 1kg', barcode: '6191001001002', cat: 0, buy: '1.200', sell: '1.400', min: 25, daily: 5, open: 260 },
  { sku: 'TOM-400', name: 'Concentré de tomate 400g', barcode: '6191001001101', cat: 0, buy: '2.300', sell: '2.900', min: 20, daily: 4, open: 220 },
  { sku: 'DET-3L', name: 'Lessive liquide 3L', barcode: '6191001001200', cat: 3, buy: '11.500', sell: '14.800', min: 8, daily: 0.6, open: 40 },
  { sku: 'YAO-125', name: 'Yaourt nature 125g', barcode: '6191001001309', cat: 2, buy: '0.380', sell: '0.500', min: 50, daily: 0, open: 120 },
];

/**
 * Optional demo dataset created at onboarding when the user asks for it.
 * Every record is flagged `isDemo` (and the organization too) so the UI can label
 * it clearly; it never mixes with real data of another organization.
 * History is generated through the real stock engine, so balances, costs and
 * movements are consistent.
 */
@Injectable()
export class DemoDataService {
  private readonly logger = new Logger('DemoData');

  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: InventoryEngine,
    private readonly products: ProductsService,
    private readonly seq: SequenceService,
  ) {}

  async populate(organizationId: string, userId: string, warehouseId: string, days = 45) {
    const started = Date.now();
    const ctx: TenantContext = { organizationId, userId, roleKey: 'OWNER', permissions: SYSTEM_ROLES.OWNER };
    const random = rng(42);
    const now = new Date();
    const dayStart = (offset: number) => new Date(now.getTime() - offset * 86400_000);

    const categories = await this.prisma.productCategory.findMany({ where: { organizationId }, orderBy: { createdAt: 'asc' } });
    const supplierA = await this.prisma.supplier.create({
      data: { organizationId, name: 'Société Distribution Sahel (démo)', city: 'Sousse', phone: '+216 73 000 000', leadTimeDays: 4, paymentTermsDays: 30, isDemo: true },
    });
    const supplierB = await this.prisma.supplier.create({
      data: { organizationId, name: 'Grossiste Tunis Nord (démo)', city: 'Ariana', phone: '+216 71 000 000', leadTimeDays: 7, paymentTermsDays: 15, isDemo: true },
    });
    await this.prisma.customer.create({
      data: { organizationId, name: 'Client professionnel (démo)', phone: '+216 20 000 000', creditLimit: '500', isDemo: true },
    });

    const created: { id: string; daily: number; sell: string }[] = [];
    await this.prisma.tx(async (tx) => {
      for (const [i, p] of DEMO_PRODUCTS.entries()) {
        const product = await this.products.create(
          ctx,
          {
            name: p.name,
            sku: p.sku,
            categoryId: categories[p.cat % Math.max(categories.length, 1)]?.id ?? null,
            baseUnit: 'pc',
            allowFractionalQty: false,
            tracking: 'NONE',
            hasExpiry: false,
            purchasePrice: p.buy,
            salePrice: p.sell,
            taxRate: '19',
            minStock: String(p.min),
            status: 'ACTIVE',
            barcodes: [p.barcode],
            conversions: [],
            imageUrls: [],
            preferredSupplierId: i % 2 === 0 ? supplierA.id : supplierB.id,
            openingStock: { warehouseId, quantity: String(p.open), unitCost: p.buy },
            generateBarcode: false,
          },
          { isDemo: true, occurredAt: dayStart(days + 1), tx },
        );
        await tx.supplierProduct.create({
          data: {
            organizationId,
            supplierId: i % 2 === 0 ? supplierA.id : supplierB.id,
            productId: product.id,
            unitPrice: p.buy,
            isPreferred: true,
            minOrderQty: p.daily > 8 ? '48' : null,
            packSize: p.daily > 8 ? '12' : null,
          },
        });
        created.push({ id: product.id, daily: p.daily, sell: p.sell });
      }
    });

    // Daily sales through the stock engine, oldest first.
    const settings = await this.engine.orgSettings(this.prisma, organizationId);
    for (let day = days; day >= 1; day--) {
      const date = dayStart(day);
      const weekend = [5, 6].includes(date.getUTCDay());
      await this.prisma.tx(async (tx) => {
        for (const p of created) {
          if (p.daily === 0) continue;
          const expected = p.daily * (weekend ? 1.3 : 1);
          const qty = Math.max(0, Math.round(expected + (random() - 0.5) * expected));
          if (qty === 0) continue;
          const balance = await tx.inventoryBalance.findUnique({ where: { productId_warehouseId: { productId: p.id, warehouseId } } });
          const available = Number(balance?.quantityOnHand ?? 0);
          const sold = Math.min(qty, available);
          if (sold <= 0) continue;
          const occurredAt = new Date(date.getTime() + (9 + Math.floor(random() * 9)) * 3600_000);
          const net = (Number(p.sell) * sold).toFixed(3);
          const tax = (Number(net) * 0.19).toFixed(3);
          const sale = await tx.salesOrder.create({
            data: {
              organizationId,
              number: await this.seq.next(tx, organizationId, 'V', occurredAt),
              warehouseId,
              channel: 'POS',
              subtotal: net,
              taxTotal: tax,
              total: (Number(net) + Number(tax)).toFixed(3),
              paidTotal: (Number(net) + Number(tax)).toFixed(3),
              paymentStatus: 'PAID',
              isDemo: true,
              completedAt: occurredAt,
              createdAt: occurredAt,
              createdById: userId,
            },
          });
          const r = await this.engine.apply(
            tx,
            { organizationId, userId, productId: p.id, warehouseId, type: 'SALE', quantity: sold, referenceType: 'SALE', referenceId: sale.id, occurredAt },
            settings,
          );
          await tx.salesOrderLine.create({
            data: {
              salesOrderId: sale.id,
              productId: p.id,
              quantity: sold,
              unitPrice: p.sell,
              taxRate: '19',
              netTotal: net,
              taxTotal: tax,
              lineTotal: (Number(net) + Number(tax)).toFixed(3),
              unitCost: r.unitCost.toFixed(6),
              costTotal: r.totalCost.toFixed(3),
            },
          });
          await tx.salesOrder.update({ where: { id: sale.id }, data: { costTotal: r.totalCost.toFixed(3) } });
          await tx.payment.create({ data: { organizationId, salesOrderId: sale.id, method: random() > 0.3 ? 'CASH' : 'CARD', amount: (Number(net) + Number(tax)).toFixed(3), paidAt: occurredAt } });
        }
      });
    }

    // Two historical purchase orders, fully received on time, for supplier performance.
    for (const [offset, supplier] of [[30, supplierA], [20, supplierB]] as const) {
      const sp = await this.prisma.supplierProduct.findMany({ where: { supplierId: supplier.id }, take: 2 });
      const ordered = dayStart(offset);
      await this.prisma.tx(async (tx) => {
        const lines = sp.map((s) => ({ productId: s.productId, quantity: '24', unitPrice: s.unitPrice.toString(), taxRate: '19', lineTotal: (Number(s.unitPrice) * 24 * 1.19).toFixed(3) }));
        const subtotal = lines.reduce((a, l) => a + Number(l.unitPrice) * 24, 0);
        const po = await tx.purchaseOrder.create({
          data: {
            organizationId,
            number: await this.seq.next(tx, organizationId, 'BC', ordered),
            supplierId: supplier.id,
            warehouseId,
            status: 'RECEIVED',
            orderDate: ordered,
            sentAt: ordered,
            approvedAt: ordered,
            expectedDate: new Date(ordered.getTime() + supplier.leadTimeDays * 86400_000),
            receivedAt: new Date(ordered.getTime() + (supplier.leadTimeDays - 1) * 86400_000),
            subtotal: subtotal.toFixed(3),
            taxTotal: (subtotal * 0.19).toFixed(3),
            total: (subtotal * 1.19).toFixed(3),
            isDemo: true,
            createdById: userId,
            lines: { create: lines.map((l) => ({ ...l, quantityReceived: '24' })) },
          },
          include: { lines: true },
        });
        const receivedAt = po.receivedAt!;
        const receipt = await tx.goodsReceipt.create({
          data: { organizationId, number: await this.seq.next(tx, organizationId, 'BR', receivedAt), purchaseOrderId: po.id, warehouseId, receivedAt, receivedById: userId },
        });
        for (const l of [...po.lines].sort((a, b) => a.productId.localeCompare(b.productId))) {
          const rl = await tx.goodsReceiptLine.create({ data: { receiptId: receipt.id, poLineId: l.id, productId: l.productId, quantity: l.quantity, unitCost: l.unitPrice } });
          await this.engine.apply(
            tx,
            {
              organizationId,
              userId,
              productId: l.productId,
              warehouseId,
              type: 'RECEIPT',
              quantity: l.quantity.toString(),
              unitCost: l.unitPrice.toString(),
              referenceType: 'GOODS_RECEIPT',
              referenceId: receipt.id,
              occurredAt: receivedAt,
              costSource: { type: 'GOODS_RECEIPT_LINE', id: rl.id },
            },
            settings,
          );
        }
      });
    }
    this.logger.log(`Demo data for ${organizationId} generated in ${Date.now() - started} ms`);
  }
}
