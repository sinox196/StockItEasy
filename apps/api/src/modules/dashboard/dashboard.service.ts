import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { d, dashboardQuery } from '@stockiteasy/shared';
import { z } from 'zod';
import { TenantContext } from '../../common/context';
import { PrismaService } from '../../prisma/prisma.service';

const TZ = 'Africa/Tunis';

/** All figures are computed from live data; nothing here is cached or estimated except the explicit projections. */
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  private range(q: z.infer<typeof dashboardQuery>) {
    const to = q.to ? new Date(q.to) : new Date();
    const from = q.from ? new Date(q.from) : new Date(to.getTime() - 30 * 86400_000);
    return { from, to };
  }

  async summary(ctx: TenantContext, q: z.infer<typeof dashboardQuery>) {
    const org = ctx.organizationId;
    const { from, to } = this.range(q);
    const wh = q.warehouseId ? Prisma.sql`AND b."warehouseId" = ${q.warehouseId}::uuid` : Prisma.empty;
    const cat = q.categoryId ? Prisma.sql`AND p."categoryId" = ${q.categoryId}::uuid` : Prisma.empty;
    const swh = q.warehouseId ? Prisma.sql`AND s."warehouseId" = ${q.warehouseId}::uuid` : Prisma.empty;
    const mwh = q.warehouseId ? Prisma.sql`AND m."warehouseId" = ${q.warehouseId}::uuid` : Prisma.empty;

    const [stock] = await this.prisma.$queryRaw<{ value: string; onhand: string; reserved: string; blocked: string }[]>`
      SELECT COALESCE(SUM(b."quantityOnHand" * p."averageCost"), 0)::text AS value,
             COALESCE(SUM(b."quantityOnHand"), 0)::text AS onhand,
             COALESCE(SUM(b."quantityReserved"), 0)::text AS reserved,
             COALESCE(SUM(b."quantityBlocked"), 0)::text AS blocked
      FROM inventory_balances b JOIN products p ON p.id = b."productId"
      WHERE b."organizationId" = ${org}::uuid AND p.status <> 'ARCHIVED' ${wh} ${cat}`;

    const states = await this.prisma.$queryRaw<{ id: string; name: string; sku: string; available: string; minStock: string }[]>`
      SELECT p.id, p.name, p.sku, COALESCE(SUM(b."quantityOnHand" - b."quantityReserved" - b."quantityBlocked"), 0)::text AS available, p."minStock"::text AS "minStock"
      FROM products p LEFT JOIN inventory_balances b ON b."productId" = p.id ${wh}
      WHERE p."organizationId" = ${org}::uuid AND p.status = 'ACTIVE' ${cat}
      GROUP BY p.id`;
    const out = states.filter((s) => d(s.available).lte(0));
    const low = states.filter((s) => d(s.available).gt(0) && d(s.available).lt(d(s.minStock)));

    const [sales] = await this.prisma.$queryRaw<{ count: bigint; revenue: string; cogs: string; total: string }[]>`
      SELECT COUNT(DISTINCT s.id) AS count,
             COALESCE(SUM(l."netTotal" * (l.quantity - l."returnedQty") / NULLIF(l.quantity, 0)), 0)::text AS revenue,
             COALESCE(SUM(l."costTotal" * (l.quantity - l."returnedQty") / NULLIF(l.quantity, 0)), 0)::text AS cogs,
             COALESCE(SUM(l."lineTotal" * (l.quantity - l."returnedQty") / NULLIF(l.quantity, 0)), 0)::text AS total
      FROM sales_orders s JOIN sales_order_lines l ON l."salesOrderId" = s.id
      WHERE s."organizationId" = ${org}::uuid AND s.status <> 'CANCELLED' AND s."completedAt" BETWEEN ${from} AND ${to} ${swh}`;

    const [today] = await this.prisma.$queryRaw<{ count: bigint; total: string }[]>`
      SELECT COUNT(*) AS count, COALESCE(SUM(s.total - s."refundedTotal"), 0)::text AS total FROM sales_orders s
      WHERE s."organizationId" = ${org}::uuid AND s.status <> 'CANCELLED'
        AND (s."completedAt" AT TIME ZONE ${TZ})::date = (now() AT TIME ZONE ${TZ})::date ${swh}`;

    const pending = await this.prisma.purchaseOrder.aggregate({
      where: { organizationId: org, status: { in: ['PENDING_APPROVAL', 'APPROVED', 'SENT', 'PARTIALLY_RECEIVED'] }, warehouseId: q.warehouseId },
      _count: { _all: true },
      _sum: { total: true },
    });

    const [slow] = await this.prisma.$queryRaw<{ count: bigint; value: string }[]>`
      SELECT COUNT(*) AS count, COALESCE(SUM(x.value), 0)::text AS value FROM (
        SELECT p.id, SUM(b."quantityOnHand" * p."averageCost") AS value
        FROM products p JOIN inventory_balances b ON b."productId" = p.id ${wh}
        WHERE p."organizationId" = ${org}::uuid AND p.status = 'ACTIVE' ${cat}
        GROUP BY p.id HAVING SUM(b."quantityOnHand") > 0
          AND NOT EXISTS (SELECT 1 FROM inventory_movements m WHERE m."productId" = p.id AND m.type = 'SALE'
                          AND m."occurredAt" > now() - interval '30 days' ${mwh})
      ) x`;

    const expiring = await this.prisma.inventoryLot.findMany({
      where: { organizationId: org, quantity: { gt: 0 }, expiryDate: { lte: new Date(Date.now() + 30 * 86400_000) }, warehouseId: q.warehouseId },
      orderBy: { expiryDate: 'asc' },
      take: 10,
    });
    const recBudget = await this.prisma.replenishmentRecommendation.aggregate({
      where: { organizationId: org, status: 'OPEN', warehouseId: q.warehouseId },
      _sum: { estimatedCost: true },
      _count: { _all: true },
    });
    const activeProducts = states.length;

    const revenue = d(sales.revenue);
    const cogs = d(sales.cogs);
    const expProducts = await this.prisma.product.findMany({ where: { id: { in: expiring.map((e) => e.productId) } }, select: { id: true, name: true, sku: true } });
    const epm = new Map(expProducts.map((p) => [p.id, p]));
    return {
      period: { from, to },
      kpis: {
        stockValue: d(stock.value).toFixed(3),
        activeProducts,
        quantityOnHand: d(stock.onhand).toFixed(3),
        quantityReserved: d(stock.reserved).toFixed(3),
        quantityBlocked: d(stock.blocked).toFixed(3),
        quantityAvailable: d(stock.onhand).minus(d(stock.reserved)).minus(d(stock.blocked)).toFixed(3),
        outOfStock: out.length,
        lowStock: low.length,
        pendingPurchases: pending._count._all,
        pendingPurchasesValue: (pending._sum.total ?? new Prisma.Decimal(0)).toFixed(3),
        salesTodayCount: Number(today.count),
        salesToday: d(today.total).toFixed(3),
        salesCount: Number(sales.count),
        revenue: revenue.toFixed(3),
        cogs: cogs.toFixed(3),
        grossMargin: revenue.minus(cogs).toFixed(3),
        grossMarginRate: revenue.gt(0) ? revenue.minus(cogs).div(revenue).times(100).toFixed(2) : null,
        slowMovers: Number(slow.count),
        slowMoversValue: d(slow.value).toFixed(3),
        expiringSoon: expiring.length,
        replenishmentBudget: (recBudget._sum.estimatedCost ?? new Prisma.Decimal(0)).toFixed(3),
        openRecommendations: recBudget._count._all,
      },
      alerts: {
        outOfStock: out.slice(0, 8),
        lowStock: low.sort((a, b) => Number(a.available) - Number(b.available)).slice(0, 8),
        expiring: expiring.map((e) => ({ ...e, product: epm.get(e.productId) })),
      },
    };
  }

  async charts(ctx: TenantContext, q: z.infer<typeof dashboardQuery>) {
    const org = ctx.organizationId;
    const { from, to } = this.range(q);
    const swh = q.warehouseId ? Prisma.sql`AND s."warehouseId" = ${q.warehouseId}::uuid` : Prisma.empty;
    const mwh = q.warehouseId ? Prisma.sql`AND m."warehouseId" = ${q.warehouseId}::uuid` : Prisma.empty;
    const wh = q.warehouseId ? Prisma.sql`AND b."warehouseId" = ${q.warehouseId}::uuid` : Prisma.empty;

    const salesByDay = await this.prisma.$queryRaw<{ day: string; revenue: string; count: bigint }[]>`
      SELECT to_char((s."completedAt" AT TIME ZONE ${TZ})::date, 'YYYY-MM-DD') AS day,
             SUM(s.subtotal)::text AS revenue, COUNT(*) AS count
      FROM sales_orders s WHERE s."organizationId" = ${org}::uuid AND s.status <> 'CANCELLED'
        AND s."completedAt" BETWEEN ${from} AND ${to} ${swh}
      GROUP BY 1 ORDER BY 1`;
    const movementsByDay = await this.prisma.$queryRaw<{ day: string; inbound: string; outbound: string }[]>`
      SELECT to_char((m."occurredAt" AT TIME ZONE ${TZ})::date, 'YYYY-MM-DD') AS day,
             COALESCE(SUM(m.quantity) FILTER (WHERE m.quantity > 0 AND m.type NOT IN ('BLOCK','UNBLOCK')), 0)::text AS inbound,
             COALESCE(-SUM(m.quantity) FILTER (WHERE m.quantity < 0 AND m.type NOT IN ('BLOCK','UNBLOCK')), 0)::text AS outbound
      FROM inventory_movements m WHERE m."organizationId" = ${org}::uuid AND m."occurredAt" BETWEEN ${from} AND ${to} ${mwh}
      GROUP BY 1 ORDER BY 1`;
    const topProducts = await this.prisma.$queryRaw<{ id: string; name: string; sku: string; quantity: string; revenue: string }[]>`
      SELECT p.id, p.name, p.sku, SUM(l.quantity - l."returnedQty")::text AS quantity, SUM(l."netTotal")::text AS revenue
      FROM sales_order_lines l JOIN sales_orders s ON s.id = l."salesOrderId" JOIN products p ON p.id = l."productId"
      WHERE s."organizationId" = ${org}::uuid AND s.status <> 'CANCELLED' AND s."completedAt" BETWEEN ${from} AND ${to} ${swh}
      GROUP BY p.id ORDER BY SUM(l."netTotal") DESC LIMIT 8`;
    const byCategory = await this.prisma.$queryRaw<{ category: string | null; value: string }[]>`
      SELECT c.name AS category, COALESCE(SUM(b."quantityOnHand" * p."averageCost"), 0)::text AS value
      FROM inventory_balances b JOIN products p ON p.id = b."productId" LEFT JOIN product_categories c ON c.id = p."categoryId"
      WHERE b."organizationId" = ${org}::uuid ${wh}
      GROUP BY c.name HAVING SUM(b."quantityOnHand" * p."averageCost") > 0 ORDER BY 2 DESC`;
    const byWarehouse = await this.prisma.$queryRaw<{ warehouse: string; value: string }[]>`
      SELECT w.name AS warehouse, COALESCE(SUM(b."quantityOnHand" * p."averageCost"), 0)::text AS value
      FROM warehouses w LEFT JOIN inventory_balances b ON b."warehouseId" = w.id LEFT JOIN products p ON p.id = b."productId"
      WHERE w."organizationId" = ${org}::uuid GROUP BY w.id ORDER BY 2 DESC`;
    return {
      salesByDay: salesByDay.map((r) => ({ day: r.day, revenue: Number(r.revenue), count: Number(r.count) })),
      movementsByDay: movementsByDay.map((r) => ({ day: r.day, inbound: Number(r.inbound), outbound: Number(r.outbound) })),
      topProducts: topProducts.map((r) => ({ ...r, quantity: Number(r.quantity), revenue: Number(r.revenue) })),
      stockByCategory: byCategory.map((r) => ({ category: r.category, value: Number(r.value) })),
      valueByWarehouse: byWarehouse.map((r) => ({ warehouse: r.warehouse, value: Number(r.value) })),
    };
  }

  /* -------------------------------- Reports -------------------------------- */

  async valuation(ctx: TenantContext, warehouseId?: string) {
    const wh = warehouseId ? Prisma.sql`AND b."warehouseId" = ${warehouseId}::uuid` : Prisma.empty;
    const rows = await this.prisma.$queryRaw<{ id: string; sku: string; name: string; category: string | null; onHand: string; averageCost: string; value: string }[]>`
      SELECT p.id, p.sku, p.name, c.name AS category, COALESCE(SUM(b."quantityOnHand"), 0)::text AS "onHand",
             p."averageCost"::text AS "averageCost", COALESCE(SUM(b."quantityOnHand" * p."averageCost"), 0)::text AS value
      FROM products p LEFT JOIN inventory_balances b ON b."productId" = p.id ${wh}
      LEFT JOIN product_categories c ON c.id = p."categoryId"
      WHERE p."organizationId" = ${ctx.organizationId}::uuid AND p.status <> 'ARCHIVED'
      GROUP BY p.id, c.name ORDER BY COALESCE(SUM(b."quantityOnHand" * p."averageCost"), 0) DESC`;
    const total = rows.reduce((a, r) => a.plus(d(r.value)), d(0));
    return { total: total.toFixed(3), rows: rows.map((r) => ({ ...r, value: d(r.value).toFixed(3), onHand: d(r.onHand).toFixed(3) })) };
  }

  /** ABC on net revenue over the last N days: A = top 80 %, B = next 15 %, C = rest. */
  async abc(ctx: TenantContext, days = 90) {
    const rows = await this.prisma.$queryRaw<{ id: string; sku: string; name: string; revenue: string; quantity: string }[]>`
      SELECT p.id, p.sku, p.name, COALESCE(x.revenue, 0)::text AS revenue, COALESCE(x.quantity, 0)::text AS quantity
      FROM products p
      LEFT JOIN (
        SELECT l."productId", SUM(l."netTotal" * (l.quantity - l."returnedQty") / NULLIF(l.quantity, 0)) AS revenue,
               SUM(l.quantity - l."returnedQty") AS quantity
        FROM sales_order_lines l JOIN sales_orders s ON s.id = l."salesOrderId"
        WHERE s."organizationId" = ${ctx.organizationId}::uuid AND s.status <> 'CANCELLED'
          AND s."completedAt" > now() - make_interval(days => ${days}::int)
        GROUP BY l."productId"
      ) x ON x."productId" = p.id
      WHERE p."organizationId" = ${ctx.organizationId}::uuid AND p.status <> 'ARCHIVED'
      ORDER BY COALESCE(x.revenue, 0) DESC`;
    const total = rows.reduce((a, r) => a + Number(r.revenue), 0);
    let cumulative = 0;
    return {
      days,
      totalRevenue: total.toFixed(3),
      rows: rows.map((r) => {
        const revenue = Number(r.revenue);
        cumulative += revenue;
        const share = total > 0 ? (revenue / total) * 100 : 0;
        const cum = total > 0 ? (cumulative / total) * 100 : 100;
        const cls = revenue <= 0 ? 'C' : cum - share < 80 ? 'A' : cum - share < 95 ? 'B' : 'C';
        return { ...r, revenue: revenue.toFixed(3), share: share.toFixed(2), cumulativeShare: cum.toFixed(2), class: cls };
      }),
    };
  }

  async dormant(ctx: TenantContext, minDays = 60) {
    const rows = await this.prisma.$queryRaw<{ id: string; sku: string; name: string; onHand: string; value: string; lastSale: Date | null }[]>`
      SELECT p.id, p.sku, p.name, SUM(b."quantityOnHand")::text AS "onHand", SUM(b."quantityOnHand" * p."averageCost")::text AS value,
             (SELECT MAX(m."occurredAt") FROM inventory_movements m WHERE m."productId" = p.id AND m.type = 'SALE') AS "lastSale"
      FROM products p JOIN inventory_balances b ON b."productId" = p.id
      WHERE p."organizationId" = ${ctx.organizationId}::uuid AND p.status = 'ACTIVE'
      GROUP BY p.id HAVING SUM(b."quantityOnHand") > 0`;
    const now = Date.now();
    const result = rows
      .map((r) => ({
        ...r,
        onHand: d(r.onHand).toFixed(3),
        value: d(r.value).toFixed(3),
        daysWithoutSale: r.lastSale ? Math.floor((now - r.lastSale.getTime()) / 86400_000) : null,
      }))
      .filter((r) => r.daysWithoutSale === null || r.daysWithoutSale >= minDays)
      .sort((a, b) => Number(b.value) - Number(a.value));
    return { minDays, immobilized: result.reduce((a, r) => a.plus(d(r.value)), d(0)).toFixed(3), rows: result };
  }

  async salesByProduct(ctx: TenantContext, q: z.infer<typeof dashboardQuery>) {
    const { from, to } = this.range(q);
    const rows = await this.prisma.$queryRaw<{ id: string; sku: string; name: string; quantity: string; revenue: string; cost: string }[]>`
      SELECT p.id, p.sku, p.name, SUM(l.quantity - l."returnedQty")::text AS quantity,
             SUM(l."netTotal" * (l.quantity - l."returnedQty") / NULLIF(l.quantity, 0))::text AS revenue,
             SUM(l."costTotal" * (l.quantity - l."returnedQty") / NULLIF(l.quantity, 0))::text AS cost
      FROM sales_order_lines l JOIN sales_orders s ON s.id = l."salesOrderId" JOIN products p ON p.id = l."productId"
      WHERE s."organizationId" = ${ctx.organizationId}::uuid AND s.status <> 'CANCELLED' AND s."completedAt" BETWEEN ${from} AND ${to}
      GROUP BY p.id ORDER BY 5 DESC`;
    return {
      period: { from, to },
      rows: rows.map((r) => {
        const revenue = d(r.revenue ?? 0);
        const cost = d(r.cost ?? 0);
        return {
          ...r,
          quantity: d(r.quantity).toFixed(3),
          revenue: revenue.toFixed(3),
          cost: cost.toFixed(3),
          margin: revenue.minus(cost).toFixed(3),
          marginRate: revenue.gt(0) ? revenue.minus(cost).div(revenue).times(100).toFixed(2) : null,
        };
      }),
    };
  }
}
