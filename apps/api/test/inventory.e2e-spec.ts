import { randomUUID } from 'crypto';
import { adjust, API, createOrg, createProduct, createTestApp, OrgSession, stockOf, TestApp } from './helpers';

describe('Stock engine: movements, valuation, concurrency, idempotency', () => {
  let t: TestApp;
  let org: OrgSession;
  beforeAll(async () => {
    t = await createTestApp();
    org = await createOrg(t, 'Stock');
  });
  afterAll(async () => t.close());

  it('records every change as a movement and refuses negative stock by default', async () => {
    const p = await createProduct(t, org);
    await adjust(t, org, p.id, '5', 'IN', '10').expect(201);
    const res = await adjust(t, org, p.id, '6', 'OUT').expect(422);
    expect(res.body.code).toBe('INSUFFICIENT_STOCK');
    expect(res.body.details.available).toBe('5.000');
    await adjust(t, org, p.id, '2', 'OUT').expect(201);
    expect(await stockOf(t, org, p.id)).toMatchObject({ onHand: 3 });
    const mv = await t.http().get(`${API}/inventory/movements?productId=${p.id}`).set(org.h).expect(200);
    expect(mv.body.items.map((m: { type: string; quantity: string; balanceAfter: string }) => [m.type, m.quantity, m.balanceAfter])).toEqual([
      ['ADJUSTMENT_OUT', '-2', '3'],
      ['ADJUSTMENT_IN', '5', '5'],
    ]);
    const audit = await t.http().get(`${API}/audit-logs?entityId=${p.id}`).set(org.h).expect(200);
    expect(audit.body.items.some((a: { action: string }) => a.action === 'inventory.adjust')).toBe(true);
  });

  it('keeps the stock ledger append-only at the database level', async () => {
    const p = await createProduct(t, org);
    await adjust(t, org, p.id, '1', 'IN', '1').expect(201);
    await expect(t.prisma.inventoryMovement.updateMany({ where: { productId: p.id }, data: { quantity: '100' } })).rejects.toThrow(/append-only/);
    await expect(t.prisma.inventoryMovement.deleteMany({ where: { productId: p.id } })).rejects.toThrow(/append-only/);
  });

  it('maintains the moving weighted average cost and values sales at it', async () => {
    const p = await createProduct(t, org, { purchasePrice: '0' });
    await adjust(t, org, p.id, '10', 'IN', '18').expect(201);
    await adjust(t, org, p.id, '30', 'IN', '20').expect(201);
    let prod = await t.prisma.product.findUniqueOrThrow({ where: { id: p.id } });
    expect(prod.averageCost.toString()).toBe('19.5');
    const sale = await t.http().post(`${API}/sales`).set(org.h).send({ warehouseId: org.warehouseId, lines: [{ productId: p.id, quantity: '4' }], payments: [{ method: 'CASH', amount: '71.4' }] }).expect(201);
    expect(sale.body.costTotal).toBe('78');
    prod = await t.prisma.product.findUniqueOrThrow({ where: { id: p.id } });
    expect(prod.averageCost.toString()).toBe('19.5');
  });

  it('uses FIFO layers for COGS when the organization is configured for FIFO', async () => {
    const fifo = await createOrg(t, 'Fifo');
    await t.http().patch(`${API}/organizations/current`).set(fifo.h).send({ valuationMethod: 'FIFO' }).expect(200);
    const p = await createProduct(t, fifo, { purchasePrice: '0', salePrice: '20' });
    await adjust(t, fifo, p.id, '5', 'IN', '10').expect(201);
    await adjust(t, fifo, p.id, '10', 'IN', '12').expect(201);
    const sale = await t.http().post(`${API}/sales`).set(fifo.h).send({ warehouseId: fifo.warehouseId, lines: [{ productId: p.id, quantity: '8' }], payments: [{ method: 'CASH', amount: '190.4' }] }).expect(201);
    // 5 × 10 + 3 × 12
    expect(sale.body.costTotal).toBe('86');
  });

  it('serialises concurrent sales of the last unit: exactly one succeeds', async () => {
    const p = await createProduct(t, org, { salePrice: '10' });
    await adjust(t, org, p.id, '1', 'IN', '5').expect(201);
    const sell = () => t.http().post(`${API}/sales`).set(org.h).send({ warehouseId: org.warehouseId, lines: [{ productId: p.id, quantity: '1' }], payments: [{ method: 'CASH', amount: '11.9' }] });
    const results = await Promise.all([sell(), sell(), sell()]);
    const codes = results.map((r) => r.status).sort();
    expect(codes).toEqual([201, 422, 422]);
    expect(results.filter((r) => r.status === 422).every((r) => r.body.code === 'INSUFFICIENT_STOCK')).toBe(true);
    expect(await stockOf(t, org, p.id)).toMatchObject({ onHand: 0 });
  });

  it('replays an idempotent checkout instead of selling twice, and rejects key reuse with another payload', async () => {
    const p = await createProduct(t, org, { salePrice: '10' });
    await adjust(t, org, p.id, '5', 'IN', '5').expect(201);
    const key = randomUUID();
    const body = { warehouseId: org.warehouseId, lines: [{ productId: p.id, quantity: '1' }], payments: [{ method: 'CASH', amount: '11.9' }] };
    const first = await t.http().post(`${API}/sales`).set(org.h).set('Idempotency-Key', key).send(body).expect(201);
    const retry = await t.http().post(`${API}/sales`).set(org.h).set('Idempotency-Key', key).send(body).expect(201);
    expect(retry.headers['idempotent-replayed']).toBe('true');
    expect(retry.body.id).toBe(first.body.id);
    expect(await stockOf(t, org, p.id)).toMatchObject({ onHand: 4 });
    const other = await t.http().post(`${API}/sales`).set(org.h).set('Idempotency-Key', key).send({ ...body, lines: [{ productId: p.id, quantity: '2' }] }).expect(409);
    expect(other.body.code).toBe('IDEMPOTENCY_CONFLICT');
  });

  it('releases the idempotency key when the request fails so a retry can succeed', async () => {
    const p = await createProduct(t, org, { salePrice: '10' });
    const key = randomUUID();
    const body = { warehouseId: org.warehouseId, lines: [{ productId: p.id, quantity: '1' }], payments: [{ method: 'CASH', amount: '11.9' }] };
    await t.http().post(`${API}/sales`).set(org.h).set('Idempotency-Key', key).send(body).expect(422);
    await adjust(t, org, p.id, '1', 'IN', '5').expect(201);
    await t.http().post(`${API}/sales`).set(org.h).set('Idempotency-Key', key).send(body).expect(201);
  });

  it('blocks damaged stock and reserves stock out of availability', async () => {
    const p = await createProduct(t, org);
    await adjust(t, org, p.id, '10', 'IN', '5').expect(201);
    await t.http().post(`${API}/inventory/blocks`).set(org.h).send({ productId: p.id, warehouseId: org.warehouseId, quantity: '3', action: 'BLOCK', reason: 'DAMAGED' }).expect(201);
    const r = await t.http().post(`${API}/inventory/reservations`).set(org.h).send({ productId: p.id, warehouseId: org.warehouseId, quantity: '5' }).expect(201);
    expect(await stockOf(t, org, p.id)).toEqual({ onHand: 10, reserved: 5, blocked: 3 });
    const fail = await adjust(t, org, p.id, '3', 'OUT').expect(422);
    expect(fail.body.details.available).toBe('2.000');
    await t.http().post(`${API}/inventory/reservations/${r.body.id}/release`).set(org.h).expect(201);
    await t.http().post(`${API}/inventory/reservations/${r.body.id}/release`).set(org.h).expect(409);
    await adjust(t, org, p.id, '3', 'OUT').expect(201);
  });

  it('consumes lots first-expired-first-out and requires lot data on receipt', async () => {
    const p = await createProduct(t, org, { hasExpiry: true });
    expect(p.tracking).toBe('LOT');
    const noLot = await adjust(t, org, p.id, '5', 'IN', '2').expect(400);
    expect(noLot.body.code).toBe('LOT_REQUIRED');
    const post = (lotNumber: string, expiryDate: string, quantity: string) =>
      t.http().post(`${API}/inventory/adjustments`).set(org.h).send({ productId: p.id, warehouseId: org.warehouseId, direction: 'IN', quantity, reason: 'FOUND', lotNumber, expiryDate });
    await post('LATE', '2027-06-01', '5').expect(201);
    await post('EARLY', '2027-01-01', '5').expect(201);
    await adjust(t, org, p.id, '7', 'OUT').expect(201);
    const lots = await t.http().get(`${API}/inventory/lots/${p.id}`).set(org.h).expect(200);
    expect(lots.body.map((l: { lotNumber: string; quantity: string }) => [l.lotNumber, l.quantity])).toEqual([['LATE', '3']]);
  });

  it('raises a low-stock alert once and re-arms it after recovery', async () => {
    const p = await createProduct(t, org, { minStock: '5' });
    await adjust(t, org, p.id, '10', 'IN', '1').expect(201);
    await adjust(t, org, p.id, '6', 'OUT').expect(201);
    await adjust(t, org, p.id, '1', 'OUT').expect(201);
    const count = () => t.prisma.notification.count({ where: { organizationId: org.orgId, type: 'LOW_STOCK', params: { path: ['sku'], equals: p.sku } } });
    expect(await count()).toBe(1);
    await adjust(t, org, p.id, '10', 'IN', '1').expect(201);
    await adjust(t, org, p.id, '10', 'OUT').expect(201);
    expect(await count()).toBe(2);
  });

  it('archives instead of deleting and keeps history', async () => {
    const p = await createProduct(t, org);
    await adjust(t, org, p.id, '1', 'IN', '1').expect(201);
    await t.http().delete(`${API}/products/${p.id}`).set(org.h).expect(204);
    const got = await t.http().get(`${API}/products/${p.id}`).set(org.h).expect(200);
    expect(got.body.status).toBe('ARCHIVED');
    const mv = await t.http().get(`${API}/inventory/movements?productId=${p.id}`).set(org.h).expect(200);
    expect(mv.body.total).toBe(1);
  });

  it('detects concurrent product edits with the version token', async () => {
    const p = await createProduct(t, org);
    await t.http().patch(`${API}/products/${p.id}`).set(org.h).send({ name: 'Version 2', version: p.version }).expect(200);
    const stale = await t.http().patch(`${API}/products/${p.id}`).set(org.h).send({ name: 'Stale edit', version: p.version }).expect(409);
    expect(stale.body.code).toBe('CONFLICT');
  });

  it('looks up products by packaging barcode with the unit factor', async () => {
    const p = await createProduct(t, org, { barcodes: ['6191000000017'], conversions: [{ unitCode: 'carton', factor: '24', barcode: '6191000000024' }] });
    const res = await t.http().get(`${API}/products/lookup?code=6191000000024`).set(org.h).expect(200);
    expect(res.body.product.id).toBe(p.id);
    expect(res.body.scannedUnit).toBe('carton');
    expect(res.body.unitFactor).toBe('24');
  });

  it('generates a valid internal EAN-13 when asked', async () => {
    const p = await createProduct(t, org, { generateBarcode: true });
    expect(p.barcodes[0].code).toMatch(/^20\d{11}$/);
  });

  it('imports products from CSV rows with a dry run first', async () => {
    const rows = [
      { sku: 'imp-1', name: 'Importé 1', salePrice: '3.5', barcode: '5000000000001', category: 'Import' },
      { sku: 'imp-2', name: 'Importé 2', salePrice: 'abc' },
    ];
    const dry = await t.http().post(`${API}/products/import`).set(org.h).send({ rows, dryRun: true }).expect(201);
    expect(dry.body).toMatchObject({ valid: 1, invalid: 1 });
    expect(await t.prisma.product.count({ where: { organizationId: org.orgId, sku: 'IMP-1' } })).toBe(0);
    const real = await t.http().post(`${API}/products/import`).set(org.h).send({ rows, dryRun: false }).expect(201);
    expect(real.body).toMatchObject({ created: 1, invalid: 1 });
    const csv = await t.http().get(`${API}/products/export.csv`).set(org.h).expect(200);
    expect(csv.text).toContain('IMP-1');
  });
});
