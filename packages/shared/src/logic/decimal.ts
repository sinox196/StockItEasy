import Decimal from 'decimal.js';

/**
 * All money and quantity arithmetic goes through decimal.js so that business
 * rules never depend on binary floating point. Values cross the wire as strings.
 */
export { Decimal };
export type DecimalInput = Decimal.Value;

/** TND uses millimes: 3 decimal places. */
export const MONEY_SCALE = 3;
/** Average/unit costs keep more precision to avoid drift on repeated receipts. */
export const COST_SCALE = 6;
export const DEFAULT_QUANTITY_SCALE = 3;

export const d = (v: DecimalInput | null | undefined): Decimal => new Decimal(v ?? 0);

export function roundMoney(v: DecimalInput, scale = MONEY_SCALE): Decimal {
  return d(v).toDecimalPlaces(scale, Decimal.ROUND_HALF_UP);
}

export function roundQty(v: DecimalInput, scale = DEFAULT_QUANTITY_SCALE): Decimal {
  return d(v).toDecimalPlaces(scale, Decimal.ROUND_HALF_UP);
}

export function sum(values: DecimalInput[]): Decimal {
  return values.reduce<Decimal>((acc, v) => acc.plus(d(v)), new Decimal(0));
}

/** Serialises a decimal for API payloads (fixed scale, no exponent notation). */
export function toFixedString(v: DecimalInput, scale: number): string {
  return d(v).toFixed(scale);
}
