import { d, Decimal, roundMoney } from './decimal';
import { ForecastResult, round, zForServiceLevel } from './forecast';

/**
 * Stock Autopilot replenishment engine (v1, rule-based + statistical).
 *
 * Definitions (all quantities in the product's base unit):
 *   available        = on hand − reserved − blocked
 *   position         = available + open purchase quantities not yet received
 *   safety stock     = z × σ(daily demand) × √(lead time)
 *   reorder point    = average daily demand × lead time + safety stock (at least min stock)
 *   order-up-to      = average daily demand × (lead time + review period) + safety stock,
 *                      at least min stock, capped at max stock when defined
 *   suggested qty    = order-up-to − position, rounded up to MOQ and pack size
 *
 * Without a usable forecast we never invent demand: a recommendation is only
 * produced from the explicit minimum-stock rule and flagged as such.
 */

export interface ReplenishmentInput {
  available: number;
  onOrder: number;
  minStock: number;
  maxStock?: number | null;
  leadTimeDays: number;
  reviewPeriodDays?: number;
  serviceLevel?: number;
  minOrderQty?: number | null;
  packSize?: number | null;
  unitCost: string | number;
  allowFraction?: boolean;
  forecast: ForecastResult;
  today?: Date;
}

export type RecommendationMethod = 'FORECAST' | 'MIN_STOCK_RULE';

export interface ReplenishmentResult {
  needed: boolean;
  method: RecommendationMethod;
  priority: 'CRITICAL' | 'RECOMMENDED' | 'DEFERRABLE';
  suggestedQty: number;
  estimatedCost: string;
  averageDaily: number | null;
  safetyStock: number;
  reorderPoint: number;
  orderUpTo: number;
  position: number;
  daysOfCover: number | null;
  stockoutDate: string | null;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  /** Machine-readable explanation keys with parameters; translated by the clients. */
  reasons: { key: string; params?: Record<string, string | number> }[];
  assumptions: Record<string, string | number | null>;
}

function roundUpToMultiple(qty: number, multiple: number | null | undefined): number {
  if (!multiple || multiple <= 0) return qty;
  return Math.ceil(qty / multiple - 1e-9) * multiple;
}

export function computeReplenishment(input: ReplenishmentInput): ReplenishmentResult {
  const today = input.today ?? new Date();
  const lead = Math.max(0, input.leadTimeDays);
  const review = Math.max(1, input.reviewPeriodDays ?? 7);
  const serviceLevel = input.serviceLevel ?? 0.95;
  const z = zForServiceLevel(serviceLevel);
  const position = input.available + input.onOrder;
  const reasons: ReplenishmentResult['reasons'] = [];
  const f = input.forecast;

  let method: RecommendationMethod;
  let averageDaily: number | null = null;
  let safetyStock = 0;
  let reorderPoint: number;
  let orderUpTo: number;
  let confidence: ReplenishmentResult['confidence'] = 'LOW';

  if (f.status === 'ok') {
    method = 'FORECAST';
    averageDaily = f.averageDaily;
    confidence = f.confidence;
    safetyStock = z * f.stdDaily * Math.sqrt(Math.max(lead, 1));
    reorderPoint = Math.max(averageDaily * lead + safetyStock, input.minStock);
    orderUpTo = Math.max(averageDaily * (lead + review) + safetyStock, input.minStock);
  } else {
    method = 'MIN_STOCK_RULE';
    reorderPoint = input.minStock;
    orderUpTo = input.maxStock && input.maxStock > input.minStock ? input.maxStock : input.minStock * 2;
    reasons.push({ key: 'autopilot.reason.insufficientData', params: { days: f.observedDays } });
  }
  if (input.maxStock && input.maxStock > 0) orderUpTo = Math.min(orderUpTo, input.maxStock);

  const daysOfCover = averageDaily && averageDaily > 0 ? input.available / averageDaily : null;
  const needed = position <= reorderPoint || input.available < input.minStock;

  let qty = Math.max(0, orderUpTo - position);
  if (needed && qty > 0) {
    if (input.minOrderQty && qty < input.minOrderQty) {
      qty = input.minOrderQty;
      reasons.push({ key: 'autopilot.reason.moqApplied', params: { moq: input.minOrderQty } });
    }
    qty = roundUpToMultiple(qty, input.packSize);
    if (input.packSize && input.packSize > 1) {
      reasons.push({ key: 'autopilot.reason.packRounded', params: { pack: input.packSize } });
    }
  }
  if (input.allowFraction === false) qty = Math.ceil(qty - 1e-9);
  qty = round(qty, 3);

  let priority: ReplenishmentResult['priority'] = 'RECOMMENDED';
  if (input.available <= 0 || (daysOfCover !== null && daysOfCover < lead)) {
    priority = 'CRITICAL';
    reasons.unshift(
      input.available <= 0
        ? { key: 'autopilot.reason.outOfStock' }
        : { key: 'autopilot.reason.stockoutBeforeDelivery', params: { cover: round(daysOfCover!, 1), lead } },
    );
  } else if (method === 'FORECAST' && position <= reorderPoint) {
    reasons.unshift({ key: 'autopilot.reason.belowReorderPoint', params: { rop: round(reorderPoint, 1) } });
  } else if (input.available < input.minStock) {
    priority = daysOfCover !== null && daysOfCover > lead + review ? 'DEFERRABLE' : 'RECOMMENDED';
    reasons.unshift({ key: 'autopilot.reason.belowMinStock', params: { min: input.minStock } });
  }
  if (input.onOrder > 0) reasons.push({ key: 'autopilot.reason.onOrder', params: { qty: input.onOrder } });
  if (f.status === 'ok' && f.trendRatio !== null && f.trendRatio >= 1.3) {
    reasons.push({ key: 'autopilot.reason.demandRising', params: { pct: Math.round((f.trendRatio - 1) * 100) } });
  }

  let stockoutDate: string | null = null;
  if (daysOfCover !== null) {
    const dt = new Date(today);
    dt.setUTCDate(dt.getUTCDate() + Math.floor(daysOfCover));
    stockoutDate = dt.toISOString().slice(0, 10);
  }

  return {
    needed: needed && qty > 0,
    method,
    priority,
    suggestedQty: qty,
    estimatedCost: roundMoney(d(qty).times(d(input.unitCost))).toFixed(3),
    averageDaily: averageDaily === null ? null : round(averageDaily, 3),
    safetyStock: round(safetyStock, 2),
    reorderPoint: round(reorderPoint, 2),
    orderUpTo: round(orderUpTo, 2),
    position: round(position, 3),
    daysOfCover: daysOfCover === null ? null : round(daysOfCover, 1),
    stockoutDate,
    confidence,
    reasons,
    assumptions: {
      leadTimeDays: lead,
      reviewPeriodDays: review,
      serviceLevel,
      historyDays: f.observedDays,
      unitCost: d(input.unitCost).toFixed(3),
      minOrderQty: input.minOrderQty ?? null,
      packSize: input.packSize ?? null,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Cash-flow-aware allocation                                          */
/* ------------------------------------------------------------------ */

export interface BudgetCandidate {
  id: string;
  priority: 'CRITICAL' | 'RECOMMENDED' | 'DEFERRABLE';
  estimatedCost: string;
  daysOfCover: number | null;
  stockoutDate: string | null;
}

export interface BudgetPlan<T extends BudgetCandidate> {
  budget: string;
  requested: string;
  funded: T[];
  deferred: T[];
  fundedCost: string;
  remainingBudget: string;
  shortfall: string;
}

const PRIORITY_RANK = { CRITICAL: 0, RECOMMENDED: 1, DEFERRABLE: 2 } as const;

/**
 * Greedy allocation: most urgent first (priority, then fewest days of cover).
 * Items that do not fit are deferred, but cheaper later items may still fit.
 * Results are projections, not guaranteed amounts.
 */
export function allocateBudget<T extends BudgetCandidate>(candidates: T[], budget: string | number): BudgetPlan<T> {
  const sorted = [...candidates].sort((a, b) => {
    const p = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (p !== 0) return p;
    return (a.daysOfCover ?? Number.MAX_SAFE_INTEGER) - (b.daysOfCover ?? Number.MAX_SAFE_INTEGER);
  });
  let remaining = d(budget);
  const funded: T[] = [];
  const deferred: T[] = [];
  let requested = new Decimal(0);
  for (const c of sorted) {
    const cost = d(c.estimatedCost);
    requested = requested.plus(cost);
    if (cost.lte(remaining)) {
      funded.push(c);
      remaining = remaining.minus(cost);
    } else {
      deferred.push(c);
    }
  }
  const fundedCost = d(budget).minus(remaining);
  return {
    budget: d(budget).toFixed(3),
    requested: requested.toFixed(3),
    funded,
    deferred,
    fundedCost: fundedCost.toFixed(3),
    remainingBudget: remaining.toFixed(3),
    shortfall: Decimal.max(requested.minus(d(budget)), 0).toFixed(3),
  };
}
