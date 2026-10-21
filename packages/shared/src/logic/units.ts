import { d, Decimal, DecimalInput, roundQty } from './decimal';

/**
 * Unit conversion rules.
 *
 * Every product has one base unit (piece, kg, litre...). Packaging units are
 * expressed as a factor: 1 packaging unit = factor × base units
 * (e.g. 1 carton = 24 pieces). Stock is always stored in base units.
 */
export interface UnitConversionRule {
  unitCode: string;
  factor: DecimalInput;
}

export class UnitConversionError extends Error {
  constructor(public readonly code: 'UNKNOWN_UNIT' | 'INVALID_FACTOR' | 'FRACTIONAL_NOT_ALLOWED', message: string) {
    super(message);
  }
}

export function toBaseQuantity(
  quantity: DecimalInput,
  unitCode: string,
  baseUnitCode: string,
  conversions: UnitConversionRule[],
  options: { allowFraction?: boolean; scale?: number } = {},
): Decimal {
  const scale = options.scale ?? 3;
  let result: Decimal;
  if (unitCode === baseUnitCode) {
    result = d(quantity);
  } else {
    const rule = conversions.find((c) => c.unitCode === unitCode);
    if (!rule) throw new UnitConversionError('UNKNOWN_UNIT', `No conversion from ${unitCode} to ${baseUnitCode}`);
    const factor = d(rule.factor);
    if (factor.lte(0)) throw new UnitConversionError('INVALID_FACTOR', `Invalid factor for ${unitCode}`);
    result = d(quantity).times(factor);
  }
  const rounded = roundQty(result, scale);
  if (options.allowFraction === false && !rounded.isInteger()) {
    throw new UnitConversionError('FRACTIONAL_NOT_ALLOWED', `Base unit ${baseUnitCode} only accepts whole quantities`);
  }
  return rounded;
}

/** Converts a base quantity back to a packaging unit (may be fractional). */
export function fromBaseQuantity(baseQuantity: DecimalInput, factor: DecimalInput, scale = 3): Decimal {
  const f = d(factor);
  if (f.lte(0)) throw new UnitConversionError('INVALID_FACTOR', 'Invalid factor');
  return d(baseQuantity).div(f).toDecimalPlaces(scale, Decimal.ROUND_HALF_UP);
}

/** Unit price for the base unit when a supplier quotes per packaging unit. */
export function basePriceFromPackPrice(packPrice: DecimalInput, factor: DecimalInput, scale = 6): Decimal {
  const f = d(factor);
  if (f.lte(0)) throw new UnitConversionError('INVALID_FACTOR', 'Invalid factor');
  return d(packPrice).div(f).toDecimalPlaces(scale, Decimal.ROUND_HALF_UP);
}
