import type { SyncSnapshot } from '@stockiteasy/api-client';
import { api, ApiError } from './api';

export interface ScanHit {
  productId: string;
  name: string;
  sku: string;
  baseUnit: string;
  unitFactor: number;
  available: number | null;
  source: 'server' | 'offline';
}

/** Resolves a scanned code online, or from the last snapshot when offline. */
export async function lookupCode(code: string, online: boolean, snapshot: SyncSnapshot | null): Promise<ScanHit | null> {
  if (online) {
    try {
      const r = await api.products.lookup(code);
      return { productId: r.product.id, name: r.product.name, sku: r.product.sku, baseUnit: r.product.baseUnit, unitFactor: Number(r.unitFactor) || 1, available: Number(r.product.stock.available), source: 'server' };
    } catch (e) {
      if (e instanceof ApiError && e.code === 'NOT_FOUND') return null;
      if (!(e instanceof ApiError && e.code === 'NETWORK')) throw e;
    }
  }
  if (!snapshot) return null;
  const upper = code.toUpperCase();
  for (const p of snapshot.products) {
    const b = p.barcodes.find((x) => x.code === code);
    if (b || p.sku === upper) {
      const factor = b?.unitCode ? Number(p.conversions.find((c) => c.unitCode === b.unitCode)?.factor ?? 1) : 1;
      const available = p.balances.reduce((a, x) => a + Number(x.quantityOnHand) - Number(x.quantityReserved) - Number(x.quantityBlocked), 0);
      return { productId: p.id, name: p.name, sku: p.sku, baseUnit: p.baseUnit, unitFactor: factor, available, source: 'offline' };
    }
  }
  return null;
}
