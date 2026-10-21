import { d, Decimal, DecimalInput, MONEY_SCALE, roundMoney, sum } from './decimal';

/**
 * Sales/purchase line computation. Prices are stored excluding tax (HT); the
 * tax rate is a percentage (e.g. 19 for 19 %). Each line is rounded to the
 * millime, and document totals are the sum of the rounded lines.
 *
 * Note: Tunisian fiscal rules (VAT rates, fiscal stamp, invoice mentions) must
 * be validated with an accountant before claiming compliance; rates are
 * configurable per product and nothing here is hard-wired to a legal regime.
 */
export interface LineInput {
  quantity: DecimalInput;
  unitPrice: DecimalInput;
  /** Percentage discount on the line, 0–100. */
  discountRate?: DecimalInput;
  /** VAT percentage, e.g. 19. */
  taxRate?: DecimalInput;
}

export interface LineTotals {
  gross: Decimal;
  discount: Decimal;
  net: Decimal;
  tax: Decimal;
  total: Decimal;
}

export function computeLine(line: LineInput): LineTotals {
  const gross = roundMoney(d(line.quantity).times(d(line.unitPrice)));
  const discountRate = Decimal.min(Decimal.max(d(line.discountRate), 0), 100);
  const discount = roundMoney(gross.times(discountRate).div(100));
  const net = gross.minus(discount);
  const tax = roundMoney(net.times(d(line.taxRate)).div(100));
  return { gross, discount, net, tax, total: net.plus(tax) };
}

export interface DocumentTotals {
  subtotal: Decimal;
  discountTotal: Decimal;
  taxTotal: Decimal;
  total: Decimal;
}

export function computeDocument(lines: LineInput[]): DocumentTotals & { lines: LineTotals[] } {
  const computed = lines.map(computeLine);
  return {
    lines: computed,
    subtotal: sum(computed.map((l) => l.net)),
    discountTotal: sum(computed.map((l) => l.discount)),
    taxTotal: sum(computed.map((l) => l.tax)),
    total: sum(computed.map((l) => l.total)),
  };
}

/** Price including tax for display (e.g. POS tiles). */
export function priceWithTax(unitPrice: DecimalInput, taxRate: DecimalInput): Decimal {
  return roundMoney(d(unitPrice).times(d(taxRate).plus(100)).div(100), MONEY_SCALE);
}

export function paymentStatus(total: DecimalInput, paid: DecimalInput): 'UNPAID' | 'PARTIAL' | 'PAID' {
  const p = d(paid);
  if (p.lte(0)) return 'UNPAID';
  if (p.gte(d(total))) return 'PAID';
  return 'PARTIAL';
}
