import { COST_SCALE, d, Decimal, DecimalInput, roundMoney } from './decimal';

/**
 * Inventory valuation.
 *
 * - Weighted average (moving): recomputed on every inbound movement that carries a cost.
 *   Outbound movements are valued at the current average and do not change it.
 * - FIFO: inbound movements create cost layers; outbound movements consume the
 *   oldest layers first and are valued at the consumed layers' costs.
 */

export function weightedAverageCost(
  currentQty: DecimalInput,
  currentAvgCost: DecimalInput,
  inboundQty: DecimalInput,
  inboundUnitCost: DecimalInput,
): Decimal {
  const q0 = Decimal.max(d(currentQty), 0);
  const q1 = d(inboundQty);
  if (q1.lte(0)) return d(currentAvgCost);
  const total = q0.plus(q1);
  if (total.lte(0)) return d(inboundUnitCost);
  return q0
    .times(d(currentAvgCost))
    .plus(q1.times(d(inboundUnitCost)))
    .div(total)
    .toDecimalPlaces(COST_SCALE, Decimal.ROUND_HALF_UP);
}

export interface CostLayer {
  id: string;
  remainingQty: DecimalInput;
  unitCost: DecimalInput;
  receivedAt: Date | string;
}

export interface LayerConsumption {
  layerId: string;
  quantity: Decimal;
  unitCost: Decimal;
}

export interface FifoResult {
  consumptions: LayerConsumption[];
  totalCost: Decimal;
  /** Quantity that could not be covered by existing layers (valued at fallbackCost). */
  uncoveredQty: Decimal;
}

export function consumeFifo(layers: CostLayer[], quantity: DecimalInput, fallbackCost: DecimalInput = 0): FifoResult {
  const sorted = [...layers]
    .filter((l) => d(l.remainingQty).gt(0))
    .sort((a, b) => new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime());
  let remaining = d(quantity);
  const consumptions: LayerConsumption[] = [];
  let totalCost = new Decimal(0);
  for (const layer of sorted) {
    if (remaining.lte(0)) break;
    const take = Decimal.min(remaining, d(layer.remainingQty));
    consumptions.push({ layerId: layer.id, quantity: take, unitCost: d(layer.unitCost) });
    totalCost = totalCost.plus(take.times(d(layer.unitCost)));
    remaining = remaining.minus(take);
  }
  if (remaining.gt(0)) totalCost = totalCost.plus(remaining.times(d(fallbackCost)));
  return { consumptions, totalCost: roundMoney(totalCost, COST_SCALE), uncoveredQty: Decimal.max(remaining, 0) };
}

export interface MarginResult {
  revenue: Decimal;
  cost: Decimal;
  margin: Decimal;
  /** Margin as a percentage of revenue (null when revenue is zero). */
  marginRate: Decimal | null;
}

export function grossMargin(revenueExclTax: DecimalInput, cost: DecimalInput): MarginResult {
  const revenue = roundMoney(revenueExclTax);
  const c = roundMoney(cost);
  const margin = revenue.minus(c);
  return {
    revenue,
    cost: c,
    margin,
    marginRate: revenue.isZero() ? null : margin.div(revenue).times(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
  };
}
