/**
 * Barcode helpers. Internal barcodes use the GS1 "restricted circulation"
 * prefix 2xx so they never collide with manufacturer EAN-13 codes.
 */

export function ean13CheckDigit(first12: string): number {
  if (!/^\d{12}$/.test(first12)) throw new Error('EAN-13 body must be 12 digits');
  const sum = first12
    .split('')
    .map(Number)
    .reduce((acc, digit, i) => acc + digit * (i % 2 === 0 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10;
}

export function isValidEan13(code: string): boolean {
  return /^\d{13}$/.test(code) && ean13CheckDigit(code.slice(0, 12)) === Number(code[12]);
}

export function isValidUpcA(code: string): boolean {
  return /^\d{12}$/.test(code) && isValidEan13('0' + code);
}

/** Builds an internal EAN-13 from a per-organization sequence number. */
export function internalEan13(sequence: number, prefix = '20'): string {
  const body = (prefix + String(sequence).padStart(12 - prefix.length, '0')).slice(0, 12);
  return body + ean13CheckDigit(body);
}
