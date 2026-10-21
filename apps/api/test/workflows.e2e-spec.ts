import { randomUUID } from 'crypto';
import { addMember, adjust, API, createOrg, createProduct, createTestApp, OrgSession, stockOf, TestApp } from './helpers';

describe('Business workflows', () => {
  let t: TestApp;
  let org: OrgSession;
  let wh2: string;
  let supplierId: string;

  beforeAll(async () => {
    t = await createTestApp();
    org = await createOrg(t, 'Flows');
    const w = await t.http().post(`${API}/warehouses`).set(org.h).send({ name: 'Sfax Magasin', code: 'SFX' }).expect(201);
    wh2 = w.body.id;
    const s = await t.http().post(`${API}/suppliers`).set(org.h).send({ name: 'Fournisseur Test', leadTimeDays: 5 }).expect(201);
    supplierId = s.body.id;
  });
  afterAll(async () => t.close());

  describe('Transfers', () => {
    it('ships, receives partially and records the discrepancy', async () => {
      const p = await createProduct(t, org);
      await adjust(t, org, p.id, '10', 'IN', '4').expect(201);
      const tr = await t.http().post(`${API}/transfers`).set(org.h).send({ fromWarehouseId: org.warehouseId, toWarehouseId: wh2, lines: [{ productId: p.id, quantity: '6' }] }).expect(201);
      expect(await stockOf(t, org, p.id)).toMatchObject({ onHand: 10 });
      await t.http().post(`${API}/transfers/${tr.body.id}/ship`).set(org.h).expect(201);
      await t.http().post(`${API}/transfers/${tr.body.id}/ship`).set(org.h).expect(409);
      expect(await stockOf(t, org, p.id)).toMatchObject({ onHand: 4 });
      const over = await t.http().post(`${API}/transfers/${tr.body.id}/receive`).set(org.h).send({ lines: [{ lineId: tr.body.lines[0].id, quantityReceived: '7' }] }).expect(422);
      expect(over.body.code).toBe('OVER_RECEIPT');
      const rec = await t.http().post(`${API}/transfers/${tr.body.id}/receive`).set(org.h).send({ lines: [{ lineId: tr.body.lines[0].id, quantityReceived: '5' }] }).expect(201);
      expect(rec.body.status).toBe('RECEIVED');
      expect(await stockOf(t, org, p.id, wh2)).toMatchObject({ onHand: 5 });
    });

    it('returns in-transit goods to the source when an interrupted transfer is cancelled', async () => {
      const p = await createProduct(t, org);
      await adjust(t, org, p.id, '8', 'IN', '4').expect(201);
      const tr = await t.http().post(`${API}/transfers`).set(org.h).send({ fromWarehouseId: org.warehouseId, toWarehouseId: wh2, lines: [{ productId: p.id, quantity: '8' }] }).expect(201);
      await t.http().post(`${API}/transfers/${tr.body.id}/ship`).set(org.h).expect(201);
      expect(await stockOf(t, org, p.id)).toMatchObject({ onHand: 0 });
      await t.http().post(`${API}/transfers/${tr.body.id}/cancel`).set(org.h).expect(201);
      expect(await stockOf(t, org, p.id)).toMatchObject({ onHand: 8 });
      expect(await stockOf(t, org, p.id, wh2)).toMatchObject({ onHand: 0 });
      await t.http().post(`${API}/transfers/${tr.body.id}/receive`).set(org.h).send({ lines: [{ lineId: tr.body.lines[0].id, quantityReceived: '8' }] }).expect(409);
    });
  });

  describe('Purchasing (workflow B)', () => {
    it('approves, sends once, receives partially, then cancels the receipt', async () => {
      const p = await createProduct(t, org, { purchasePrice: '5' });
      const po = await t.http().post(`${API}/purchases`).set(org.h).send({ supplierId, warehouseId: org.warehouseId, lines: [{ productId: p.id, quantity: '20', unitPrice: '5' }] }).expect(201);
      expect(po.body.total).toBe('119');
      const early = await t.http().post(`${API}/purchases/${po.body.id}/receipts`).set(org.h).send({ lines: [{ lineId: po.body.lines[0].id, quantity: '1' }] }).expect(409);
      expect(early.body.code).toBe('INVALID_STATE');
      await t.http().post(`${API}/purchases/${po.body.id}/approve`).set(org.h).expect(200);
      await t.http().post(`${API}/purchases/${po.body.id}/send`).set(org.h).expect(200);
      // "Commande fournisseur envoyée deux fois"
      await t.http().post(`${API}/purchases/${po.body.id}/send`).set(org.h).expect(409);

      const r1 = await t.http().post(`${API}/purchases/${po.body.id}/receipts`).set(org.h).send({ lines: [{ lineId: po.body.lines[0].id, quantity: '8', unitCost: '6' }] }).expect(201);
      expect(r1.body.order.status).toBe('PARTIALLY_RECEIVED');
      expect(await stockOf(t, org, p.id)).toMatchObject({ onHand: 8 });
      const over = await t.http().post(`${API}/purchases/${po.body.id}/receipts`).set(org.h).send({ lines: [{ lineId: po.body.lines[0].id, quantity: '13' }] }).expect(422);
      expect(over.body.code).toBe('OVER_RECEIPT');

      // "Réception partielle puis annulation"
      await t.http().post(`${API}/purchases/receipts/${r1.body.receiptId}/cancel`).set(org.h).expect(200);
      await t.http().post(`${API}/purchases/receipts/${r1.body.receiptId}/cancel`).set(org.h).expect(409);
      expect(await stockOf(t, org, p.id)).toMatchObject({ onHand: 0 });
      const after = await t.http().get(`${API}/purchases/${po.body.id}`).set(org.h).expect(200);
      expect(after.body.status).toBe('SENT');
      expect(after.body.lines[0].quantityReceived).toBe('0');

      const r2 = await t.http().post(`${API}/purchases/${po.body.id}/receipts`).set(org.h).send({ lines: [{ lineId: po.body.lines[0].id, quantity: '20' }] }).expect(201);
      expect(r2.body.order.status).toBe('RECEIVED');
      expect(await stockOf(t, org, p.id)).toMatchObject({ onHand: 20 });
    });

    it('refuses to cancel a receipt whose goods were already sold', async () => {
      const p = await createProduct(t, org, { salePrice: '10' });
      const po = await t.http().post(`${API}/purchases`).set(org.h).send({ supplierId, warehouseId: org.warehouseId, lines: [{ productId: p.id, quantity: '3', unitPrice: '5' }] }).expect(201);
      await t.http().post(`${API}/purchases/${po.body.id}/approve`).set(org.h).expect(200);
      const r = await t.http().post(`${API}/purchases/${po.body.id}/receipts`).set(org.h).send({ lines: [{ lineId: po.body.lines[0].id, quantity: '3' }] }).expect(201);
      await t.http().post(`${API}/sales`).set(org.h).send({ warehouseId: org.warehouseId, lines: [{ productId: p.id, quantity: '2' }], payments: [{ method: 'CASH', amount: '23.8' }] }).expect(201);
      const res = await t.http().post(`${API}/purchases/receipts/${r.body.receiptId}/cancel`).set(org.h).expect(422);
      expect(res.body.code).toBe('INSUFFICIENT_STOCK');
    });

    it('requires approval permission', async () => {
      const buyer = await addMember(t, org, 'BUYER');
      const p = await createProduct(t, org);
      const po = await t.http().post(`${API}/purchases`).set(buyer.h).send({ supplierId, warehouseId: org.warehouseId, lines: [{ productId: p.id, quantity: '1', unitPrice: '1' }] }).expect(201);
      await t.http().post(`${API}/purchases/${po.body.id}/submit`).set(buyer.h).expect(200);
      await t.http().post(`${API}/purchases/${po.body.id}/approve`).set(buyer.h).expect(403);
      const n = await t.http().get(`${API}/notifications`).set(org.h).expect(200);
      expect(n.body.items.some((x: { type: string }) => x.type === 'PO_APPROVAL_REQUIRED')).toBe(true);
    });
  });

  describe('Sales (workflow C)', () => {
    it('handles mixed payment, credit within limit, and returns with or without restocking', async () => {
      const p = await createProduct(t, org, { salePrice: '10', minStock: '0' });
      await adjust(t, org, p.id, '10', 'IN', '6').expect(201);
      const mixed = await t.http().post(`${API}/sales`).set(org.h).send({
        warehouseId: org.warehouseId,
        lines: [{ productId: p.id, quantity: '2' }],
        payments: [{ method: 'CASH', amount: '10' }, { method: 'CARD', amount: '13.8' }],
      }).expect(201);
      expect(mixed.body).toMatchObject({ total: '23.8', paymentStatus: 'PAID', margin: '8.000' });

      const walkInCredit = await t.http().post(`${API}/sales`).set(org.h).send({ warehouseId: org.warehouseId, lines: [{ productId: p.id, quantity: '1' }], payments: [] }).expect(422);
      expect(walkInCredit.body.code).toBe('CREDIT_REQUIRES_CUSTOMER');

      const c = await t.http().post(`${API}/customers`).set(org.h).send({ name: 'Client Crédit', creditLimit: '30' }).expect(201);
      const credit = await t.http().post(`${API}/sales`).set(org.h).send({ warehouseId: org.warehouseId, customerId: c.body.id, lines: [{ productId: p.id, quantity: '2' }], payments: [{ method: 'CREDIT', amount: '23.8' }] }).expect(201);
      expect(credit.body.paymentStatus).toBe('UNPAID');
      const over = await t.http().post(`${API}/sales`).set(org.h).send({ warehouseId: org.warehouseId, customerId: c.body.id, lines: [{ productId: p.id, quantity: '1' }], payments: [] }).expect(422);
      expect(over.body.code).toBe('CREDIT_LIMIT_EXCEEDED');
      await t.http().post(`${API}/sales/${credit.body.id}/payments`).set(org.h).send({ method: 'CASH', amount: '10' }).expect(201);
      let cust = await t.prisma.customer.findUniqueOrThrow({ where: { id: c.body.id } });
      expect(cust.balance.toString()).toBe('13.8');

      const ret = await t.http().post(`${API}/sales/${credit.body.id}/returns`).set(org.h).send({ reason: 'Emballage abîmé', restock: false, lines: [{ lineId: credit.body.lines[0].id, quantity: '1' }] }).expect(201);
      expect(ret.body.status).toBe('PARTIALLY_RETURNED');
      cust = await t.prisma.customer.findUniqueOrThrow({ where: { id: c.body.id } });
      expect(cust.balance.toString()).toBe('1.9');
      // 10 − 2 − 2 + 1 returned, the returned unit is blocked pending inspection
      expect(await stockOf(t, org, p.id)).toMatchObject({ onHand: 7, blocked: 1 });
      const tooMany = await t.http().post(`${API}/sales/${credit.body.id}/returns`).set(org.h).send({ reason: 'x1', lines: [{ lineId: credit.body.lines[0].id, quantity: '2' }] }).expect(422);
      expect(tooMany.body.code).toBe('RETURN_EXCEEDS_SOLD');
    });

    it('enforces the minimum price unless the user can approve', async () => {
      const p = await createProduct(t, org, { salePrice: '10', minSalePrice: '9' });
      await adjust(t, org, p.id, '5', 'IN', '6').expect(201);
      const cashier = await addMember(t, org, 'CASHIER');
      const res = await t.http().post(`${API}/sales`).set(cashier.h).send({ warehouseId: org.warehouseId, lines: [{ productId: p.id, quantity: '1', discountRate: '20' }], payments: [{ method: 'CASH', amount: '9.52' }] }).expect(422);
      expect(res.body.code).toBe('PRICE_BELOW_MINIMUM');
      await t.http().post(`${API}/sales`).set(org.h).send({ warehouseId: org.warehouseId, lines: [{ productId: p.id, quantity: '1', discountRate: '20' }], payments: [{ method: 'CASH', amount: '9.52' }] }).expect(201);
    });

    it('cancels a sale and puts the stock back', async () => {
      const p = await createProduct(t, org, { salePrice: '10' });
      await adjust(t, org, p.id, '3', 'IN', '6').expect(201);
      const s = await t.http().post(`${API}/sales`).set(org.h).send({ warehouseId: org.warehouseId, lines: [{ productId: p.id, quantity: '3' }], payments: [{ method: 'CASH', amount: '35.7' }] }).expect(201);
      expect(await stockOf(t, org, p.id)).toMatchObject({ onHand: 0 });
      await t.http().post(`${API}/sales/${s.body.id}/cancel`).set(org.h).expect(200);
      expect(await stockOf(t, org, p.id)).toMatchObject({ onHand: 3 });
    });
  });

  describe('Physical inventory & offline sync (workflow D)', () => {
    it('counts, validates variances as movements', async () => {
      const p1 = await createProduct(t, org);
      const p2 = await createProduct(t, org);
      await adjust(t, org, p1.id, '10', 'IN', '2').expect(201);
      await adjust(t, org, p2.id, '4', 'IN', '2').expect(201);
      const count = await t.http().post(`${API}/stock-counts`).set(org.h).send({ warehouseId: org.warehouseId, scope: 'PARTIAL', productIds: [p1.id, p2.id] }).expect(201);
      expect(count.body.lines).toHaveLength(2);
      await t.http().put(`${API}/stock-counts/${count.body.id}/lines`).set(org.h).send({ productId: p1.id, countedQty: '8' }).expect(200);
      await t.http().put(`${API}/stock-counts/${count.body.id}/lines`).set(org.h).send({ productId: p2.id, countedQty: '2', mode: 'add' }).expect(200);
      await t.http().put(`${API}/stock-counts/${count.body.id}/lines`).set(org.h).send({ productId: p2.id, countedQty: '3', mode: 'add' }).expect(200);
      const v = await t.http().post(`${API}/stock-counts/${count.body.id}/validate`).set(org.h).expect(201);
      expect(v.body.adjustments).toBe(2);
      expect(await stockOf(t, org, p1.id)).toMatchObject({ onHand: 8 });
      expect(await stockOf(t, org, p2.id)).toMatchObject({ onHand: 5 });
      await t.http().post(`${API}/stock-counts/${count.body.id}/validate`).set(org.h).expect(409);
    });

    it('syncs offline operations once, reports conflicts instead of overwriting, and rejects invalid ones', async () => {
      const p = await createProduct(t, org);
      await adjust(t, org, p.id, '10', 'IN', '2').expect(201);
      const clerk = await addMember(t, org, 'EMPLOYEE');
      const count = await t.http().post(`${API}/stock-counts`).set(org.h).send({ warehouseId: org.warehouseId, scope: 'PARTIAL', productIds: [p.id] }).expect(201);
      const snapshot = await t.http().get(`${API}/sync/snapshot?warehouseId=${org.warehouseId}`).set(clerk.h).expect(200);
      const line = snapshot.body.counts.find((c: { id: string }) => c.id === count.body.id).lines[0];

      // Meanwhile a colleague counts the same line online.
      await t.http().put(`${API}/stock-counts/${count.body.id}/lines`).set(org.h).send({ productId: p.id, countedQty: '9' }).expect(200);

      const opId = randomUUID();
      const ops = {
        deviceId: 'device-1',
        operations: [
          { clientOpId: opId, type: 'STOCK_COUNT_LINE', createdAt: new Date().toISOString(), baseVersion: line.version, payload: { countId: count.body.id, productId: p.id, countedQty: '7' } },
          { clientOpId: randomUUID(), type: 'STOCK_ADJUSTMENT', createdAt: new Date().toISOString(), payload: { productId: p.id, warehouseId: org.warehouseId, direction: 'OUT', quantity: '500', reason: 'LOST' } },
          { clientOpId: randomUUID(), type: 'STOCK_ADJUSTMENT', createdAt: new Date().toISOString(), payload: { productId: p.id, warehouseId: org.warehouseId, direction: 'OUT', quantity: '1', reason: 'DAMAGED' } },
        ],
      };
      const res = await t.http().post(`${API}/sync/push`).set(clerk.h).send(ops).expect(201);
      expect(res.body.results.map((r: { status: string }) => r.status)).toEqual(['CONFLICT', 'REJECTED', 'APPLIED']);
      expect(res.body.results[0].result.countedQty).toBe('9');
      expect(res.body.results[1].error.code).toBe('INSUFFICIENT_STOCK');

      // Reconnection replay: nothing is applied twice.
      const replay = await t.http().post(`${API}/sync/push`).set(clerk.h).send(ops).expect(201);
      expect(replay.body.results.map((r: { status: string }) => r.status)).toEqual(['DUPLICATE', 'DUPLICATE', 'DUPLICATE']);
      expect(await stockOf(t, org, p.id)).toMatchObject({ onHand: 9 });

      // The user explicitly keeps their count: a new operation without the stale base version.
      const keep = await t.http().post(`${API}/sync/push`).set(clerk.h).send({ deviceId: 'device-1', operations: [{ clientOpId: randomUUID(), type: 'STOCK_COUNT_LINE', createdAt: new Date().toISOString(), payload: { countId: count.body.id, productId: p.id, countedQty: '7' } }] }).expect(201);
      expect(keep.body.results[0].status).toBe('APPLIED');
    });

    it('rejects sync from a user whose token expired', async () => {
      await t.http().post(`${API}/sync/push`).set({ Authorization: 'Bearer expired', 'X-Organization-Id': org.orgId }).send({ deviceId: 'd', operations: [] }).expect(401);
    });
  });

  describe('Stock Autopilot (workflow B/F)', () => {
    it('recommends from history, explains itself, and turns an approval into a draft PO', async () => {
      const p = await createProduct(t, org, { minStock: '5', purchasePrice: '3', salePrice: '5' });
      await t.http().put(`${API}/suppliers/${supplierId}/products`).set(org.h).send({ productId: p.id, unitPrice: '3', isPreferred: true, leadTimeDays: 5 }).expect(200);
      // 30 days of sales history, 3 units/day, written through the stock engine with past dates.
      const engine = t.app.get((await import('../src/modules/inventory/inventory.engine')).InventoryEngine);
      await t.prisma.tx((tx) =>
        engine.apply(tx, { organizationId: org.orgId, productId: p.id, warehouseId: org.warehouseId, type: 'ADJUSTMENT_IN', quantity: '100', unitCost: '3', occurredAt: new Date(Date.now() - 31 * 86400_000) }),
      );
      for (let day = 30; day >= 1; day--) {
        await t.prisma.tx((tx) =>
          engine.apply(tx, { organizationId: org.orgId, productId: p.id, warehouseId: org.warehouseId, type: 'SALE', quantity: '3', occurredAt: new Date(Date.now() - day * 86400_000) }),
        );
      }
      await t.http().post(`${API}/replenishment/run`).set(org.h).expect(200);
      const recs = await t.http().get(`${API}/replenishment/recommendations`).set(org.h).expect(200);
      const rec = recs.body.items.find((r: { productId: string }) => r.productId === p.id);
      expect(rec).toBeDefined();
      expect(rec.method).toBe('FORECAST');
      expect(Number(rec.averageDaily)).toBeCloseTo(3, 0);
      expect(rec.supplierId).toBe(supplierId);
      expect(rec.reasons.length).toBeGreaterThan(0);
      expect(rec.assumptions.leadTimeDays).toBe(5);

      const viewer = await addMember(t, org, 'VIEWER');
      await t.http().post(`${API}/replenishment/recommendations/${rec.id}/decision`).set(viewer.h).send({ decision: 'APPROVE' }).expect(403);
      const d = await t.http().post(`${API}/replenishment/recommendations/${rec.id}/decision`).set(org.h).send({ decision: 'MODIFY', quantity: '40' }).expect(200);
      expect(d.body.status).toBe('MODIFIED');
      const po = await t.http().get(`${API}/purchases/${d.body.purchaseOrderId}`).set(org.h).expect(200);
      expect(po.body).toMatchObject({ status: 'DRAFT', source: 'AUTOPILOT' });
      expect(po.body.lines[0].quantity).toBe('40');
      await t.http().post(`${API}/replenishment/recommendations/${rec.id}/decision`).set(org.h).send({ decision: 'APPROVE' }).expect(409);

      const plan = await t.http().post(`${API}/replenishment/budget-plan`).set(org.h).send({ budget: '0' }).expect(200);
      expect(plan.body.isProjection).toBe(true);
      expect(plan.body.remainingBudget).toBe('0.000');
    });

    it('does not invent a forecast for products without history', async () => {
      const p = await createProduct(t, org, { minStock: '10', maxStock: '30' });
      await adjust(t, org, p.id, '2', 'IN', '1').expect(201);
      await t.http().post(`${API}/replenishment/run`).set(org.h).expect(200);
      const recs = await t.http().get(`${API}/replenishment/recommendations`).set(org.h).expect(200);
      const rec = recs.body.items.find((r: { productId: string; warehouseId: string }) => r.productId === p.id && r.warehouseId === org.warehouseId);
      expect(recs.body.items.filter((r: { productId: string }) => r.productId === p.id)).toHaveLength(1);
      expect(rec.method).toBe('MIN_STOCK_RULE');
      expect(rec.averageDaily).toBeNull();
      expect(rec.stockoutDate).toBeNull();
      expect(rec.suggestedQty).toBe('28');
    });
  });

  describe('Dashboard', () => {
    it('reports live KPIs from the database', async () => {
      const res = await t.http().get(`${API}/dashboard/summary`).set(org.h).expect(200);
      expect(Number(res.body.kpis.stockValue)).toBeGreaterThan(0);
      expect(res.body.kpis.salesCount).toBeGreaterThan(0);
      const charts = await t.http().get(`${API}/dashboard/charts`).set(org.h).expect(200);
      expect(charts.body.salesByDay.length).toBeGreaterThan(0);
      await t.http().get(`${API}/reports/abc`).set(org.h).expect(200);
      await t.http().get(`${API}/reports/dormant`).set(org.h).expect(200);
      await t.http().get(`${API}/reports/valuation.csv`).set(org.h).expect(200);
    });
  });
});
