import { describe, expect, it } from 'vitest';
import {
  allocateBudget,
  computeDocument,
  computeLine,
  computeReplenishment,
  consumeFifo,
  forecastDemand,
  fromBaseQuantity,
  grossMargin,
  internalEan13,
  isValidEan13,
  paymentStatus,
  priceWithTax,
  SYSTEM_ROLES,
  ALL_PERMISSIONS,
  toBaseQuantity,
  UnitConversionError,
  weightedAverageCost,
  createProductSchema,
  transferSchema,
} from '../src';

describe('unit conversions', () => {
  const rules = [
    { unitCode: 'carton', factor: '24' },
    { unitCode: 'pack', factor: '6' },
  ];
  it('converts packaging units to base units', () => {
    expect(toBaseQuantity('2', 'carton', 'pc', rules).toString()).toBe('48');
    expect(toBaseQuantity('3', 'pc', 'pc', rules).toString()).toBe('3');
    expect(fromBaseQuantity('36', '24').toString()).toBe('1.5');
  });
  it('rejects unknown units and fractional pieces', () => {
    expect(() => toBaseQuantity('1', 'pallet', 'pc', rules)).toThrow(UnitConversionError);
    expect(() => toBaseQuantity('0.5', 'pack', 'pc', [{ unitCode: 'pack', factor: '3' }], { allowFraction: false })).toThrow(
      UnitConversionError,
    );
    expect(toBaseQuantity('0.25', 'kg', 'kg', []).toString()).toBe('0.25');
  });
});

describe('costing', () => {
  it('computes the moving weighted average cost without float drift', () => {
    // 10 @ 18.000 + 30 @ 20.000 => 19.500
    expect(weightedAverageCost('10', '18', '30', '20').toString()).toBe('19.5');
    // first receipt on empty stock takes the receipt cost
    expect(weightedAverageCost('0', '0', '5', '7.125').toString()).toBe('7.125');
    // negative on-hand quantities are ignored in the average
    expect(weightedAverageCost('-3', '10', '5', '12').toString()).toBe('12');
    expect(weightedAverageCost('0.1', '0.2', '0.2', '0.1').toFixed(6)).toBe('0.133333');
  });
  it('consumes FIFO layers oldest first', () => {
    const r = consumeFifo(
      [
        { id: 'b', remainingQty: '10', unitCost: '12', receivedAt: '2026-02-01' },
        { id: 'a', remainingQty: '5', unitCost: '10', receivedAt: '2026-01-01' },
      ],
      '8',
    );
    expect(r.consumptions.map((c) => [c.layerId, c.quantity.toString()])).toEqual([
      ['a', '5'],
      ['b', '3'],
    ]);
    expect(r.totalCost.toString()).toBe('86');
    expect(r.uncoveredQty.toString()).toBe('0');
  });
  it('reports uncovered FIFO quantity', () => {
    const r = consumeFifo([{ id: 'a', remainingQty: '2', unitCost: '10', receivedAt: '2026-01-01' }], '5', '11');
    expect(r.uncoveredQty.toString()).toBe('3');
    expect(r.totalCost.toString()).toBe('53');
  });
  it('computes gross margin', () => {
    const m = grossMargin('100', '62.5');
    expect(m.margin.toString()).toBe('37.5');
    expect(m.marginRate?.toString()).toBe('37.5');
    expect(grossMargin('0', '0').marginRate).toBeNull();
  });
});

describe('pricing', () => {
  it('computes lines with discount and VAT at millime precision', () => {
    const l = computeLine({ quantity: '3', unitPrice: '24.900', discountRate: '10', taxRate: '19' });
    expect(l.gross.toFixed(3)).toBe('74.700');
    expect(l.discount.toFixed(3)).toBe('7.470');
    expect(l.net.toFixed(3)).toBe('67.230');
    expect(l.tax.toFixed(3)).toBe('12.774');
    expect(l.total.toFixed(3)).toBe('80.004');
  });
  it('sums rounded lines', () => {
    const doc = computeDocument([
      { quantity: '1', unitPrice: '0.333', taxRate: '19' },
      { quantity: '2', unitPrice: '1.135', taxRate: '7' },
    ]);
    expect(doc.subtotal.toFixed(3)).toBe('2.603');
    expect(doc.total.toFixed(3)).toBe(doc.subtotal.plus(doc.taxTotal).toFixed(3));
  });
  it('derives payment status and TTC price', () => {
    expect(paymentStatus('10', '0')).toBe('UNPAID');
    expect(paymentStatus('10', '4')).toBe('PARTIAL');
    expect(paymentStatus('10', '10')).toBe('PAID');
    expect(priceWithTax('10', '19').toFixed(3)).toBe('11.900');
  });
});

describe('forecasting', () => {
  it('refuses to forecast without data', () => {
    expect(forecastDemand([])).toMatchObject({ status: 'insufficient_data', reason: 'NO_HISTORY' });
    expect(forecastDemand(Array(30).fill(0))).toMatchObject({ status: 'insufficient_data', reason: 'NO_SALES' });
    expect(forecastDemand([1, 2, 3])).toMatchObject({ status: 'insufficient_data', reason: 'TOO_SHORT' });
  });
  it('forecasts stable demand close to the mean with high confidence', () => {
    const series = Array.from({ length: 60 }, (_, i) => (i % 2 === 0 ? 4 : 6));
    const f = forecastDemand(series);
    expect(f.status).toBe('ok');
    if (f.status !== 'ok') return;
    expect(f.averageDaily).toBeGreaterThan(4.5);
    expect(f.averageDaily).toBeLessThan(5.5);
    expect(f.confidence).toBe('HIGH');
  });
  it('detects rising demand', () => {
    const series = [...Array(14).fill(2), ...Array(14).fill(5)];
    const f = forecastDemand(series);
    if (f.status !== 'ok') throw new Error('expected forecast');
    expect(f.trendRatio).toBe(2.5);
  });
});

describe('replenishment', () => {
  const steady = forecastDemand(Array(60).fill(5));
  it('flags critical shortage when stock runs out before delivery', () => {
    const r = computeReplenishment({
      available: 10,
      onOrder: 0,
      minStock: 5,
      leadTimeDays: 7,
      unitCost: '2.5',
      forecast: steady,
      today: new Date('2026-03-01T00:00:00Z'),
    });
    expect(r.needed).toBe(true);
    expect(r.priority).toBe('CRITICAL');
    expect(r.daysOfCover).toBe(2);
    expect(r.stockoutDate).toBe('2026-03-03');
    // order-up-to = 5 × (7+7) = 70, minus position 10
    expect(r.suggestedQty).toBe(60);
    expect(r.estimatedCost).toBe('150.000');
  });
  it('applies MOQ and pack size', () => {
    const r = computeReplenishment({
      available: 30,
      onOrder: 0,
      minStock: 0,
      leadTimeDays: 7,
      unitCost: '1',
      minOrderQty: 48,
      packSize: 24,
      forecast: steady,
    });
    expect(r.suggestedQty).toBe(48);
  });
  it('counts open purchase orders in the stock position', () => {
    const r = computeReplenishment({ available: 10, onOrder: 100, minStock: 5, leadTimeDays: 7, unitCost: '1', forecast: steady });
    expect(r.needed).toBe(false);
  });
  it('falls back to the explicit min-stock rule without inventing demand', () => {
    const r = computeReplenishment({
      available: 3,
      onOrder: 0,
      minStock: 10,
      maxStock: 30,
      leadTimeDays: 5,
      unitCost: '4',
      forecast: forecastDemand([]),
    });
    expect(r.method).toBe('MIN_STOCK_RULE');
    expect(r.stockoutDate).toBeNull();
    expect(r.averageDaily).toBeNull();
    expect(r.suggestedQty).toBe(27);
    expect(r.confidence).toBe('LOW');
  });
});

describe('cash-flow allocation', () => {
  it('funds critical items first and defers the rest', () => {
    const plan = allocateBudget(
      [
        { id: 'r1', priority: 'RECOMMENDED', estimatedCost: '3000', daysOfCover: 9, stockoutDate: null },
        { id: 'c1', priority: 'CRITICAL', estimatedCost: '2500', daysOfCover: 1, stockoutDate: null },
        { id: 'd1', priority: 'DEFERRABLE', estimatedCost: '800', daysOfCover: 30, stockoutDate: null },
        { id: 'c2', priority: 'CRITICAL', estimatedCost: '1500', daysOfCover: 0, stockoutDate: null },
      ],
      '5000',
    );
    expect(plan.funded.map((x) => x.id)).toEqual(['c2', 'c1', 'd1']);
    expect(plan.deferred.map((x) => x.id)).toEqual(['r1']);
    expect(plan.requested).toBe('7800.000');
    expect(plan.remainingBudget).toBe('200.000');
    expect(plan.shortfall).toBe('2800.000');
  });
});

describe('barcodes', () => {
  it('generates valid internal EAN-13', () => {
    const code = internalEan13(42);
    expect(code).toHaveLength(13);
    expect(code.startsWith('20')).toBe(true);
    expect(isValidEan13(code)).toBe(true);
    expect(isValidEan13('6191001000012')).toBe(isValidEan13('6191001000012'));
    expect(isValidEan13('4006381333931')).toBe(true);
    expect(isValidEan13('4006381333932')).toBe(false);
  });
});

describe('permissions and schemas', () => {
  it('owner holds every permission, viewer is read-only', () => {
    expect(SYSTEM_ROLES.OWNER).toEqual(ALL_PERMISSIONS);
    expect(SYSTEM_ROLES.VIEWER.every((p) => p.endsWith('.read'))).toBe(true);
    expect(SYSTEM_ROLES.CASHIER).toContain('sales.create');
    expect(SYSTEM_ROLES.CASHIER).not.toContain('inventory.create');
  });
  it('normalises product input', () => {
    const p = createProductSchema.parse({ name: 'Huile', sku: 'olv-001', salePrice: 24.9 });
    expect(p.sku).toBe('OLV-001');
    expect(p.salePrice).toBe('24.9');
    expect(p.taxRate).toBe('19');
    expect(() => createProductSchema.parse({ name: 'X1', sku: 'bad sku' })).toThrow();
  });
  it('rejects transfers to the same warehouse', () => {
    const id = '7d1f7c4e-3b7a-4c1e-9d6e-1f0f3b2a1c11';
    expect(() => transferSchema.parse({ fromWarehouseId: id, toWarehouseId: id, lines: [{ productId: id, quantity: '1' }] })).toThrow();
  });
});
