/**
 * Statistical demand forecasting used by Stock Autopilot (v1).
 *
 * Deliberately simple and explainable: simple exponential smoothing on daily
 * demand, with the standard deviation of daily demand used for safety stock.
 * When the history is too short or empty we return `insufficient_data` instead
 * of inventing a forecast.
 */

export type ForecastConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export interface DemandForecast {
  status: 'ok';
  /** Expected units per day. */
  averageDaily: number;
  /** Standard deviation of daily demand. */
  stdDaily: number;
  /** Plain mean over the window, for transparency. */
  meanDaily: number;
  observedDays: number;
  daysWithSales: number;
  /** Ratio of the last 14 days vs the previous 14 days (null when not computable). */
  trendRatio: number | null;
  confidence: ForecastConfidence;
  method: 'SES';
}

export interface InsufficientForecast {
  status: 'insufficient_data';
  observedDays: number;
  daysWithSales: number;
  reason: 'NO_HISTORY' | 'TOO_SHORT' | 'NO_SALES';
}

export type ForecastResult = DemandForecast | InsufficientForecast;

export const MIN_HISTORY_DAYS = 14;
export const MIN_DAYS_WITH_SALES = 3;

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

function std(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((acc, x) => acc + (x - m) ** 2, 0) / (xs.length - 1));
}

/**
 * @param dailyDemand one value per day, oldest first, zeros included for days without sales.
 * @param alpha smoothing factor (0–1); higher reacts faster to recent changes.
 */
export function forecastDemand(dailyDemand: number[], alpha = 0.2): ForecastResult {
  const observedDays = dailyDemand.length;
  const daysWithSales = dailyDemand.filter((x) => x > 0).length;
  if (observedDays === 0) return { status: 'insufficient_data', observedDays, daysWithSales, reason: 'NO_HISTORY' };
  if (daysWithSales === 0) return { status: 'insufficient_data', observedDays, daysWithSales, reason: 'NO_SALES' };
  if (observedDays < MIN_HISTORY_DAYS || daysWithSales < MIN_DAYS_WITH_SALES) {
    return { status: 'insufficient_data', observedDays, daysWithSales, reason: 'TOO_SHORT' };
  }

  // Initialise the level with the mean of the first week to limit start-up bias.
  let level = mean(dailyDemand.slice(0, Math.min(7, observedDays)));
  for (const x of dailyDemand) level = alpha * x + (1 - alpha) * level;

  const meanDaily = mean(dailyDemand);
  const stdDaily = std(dailyDemand);
  const recent = dailyDemand.slice(-14);
  const previous = dailyDemand.slice(-28, -14);
  const trendRatio = previous.length === 14 && mean(previous) > 0 ? mean(recent) / mean(previous) : null;

  const cv = meanDaily > 0 ? stdDaily / meanDaily : Infinity;
  let confidence: ForecastConfidence = 'LOW';
  if (observedDays >= 56 && cv < 1) confidence = 'HIGH';
  else if (observedDays >= 28 && cv < 2) confidence = 'MEDIUM';

  return {
    status: 'ok',
    averageDaily: round(level, 4),
    stdDaily: round(stdDaily, 4),
    meanDaily: round(meanDaily, 4),
    observedDays,
    daysWithSales,
    trendRatio: trendRatio === null ? null : round(trendRatio, 3),
    confidence,
    method: 'SES',
  };
}

export function round(x: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(x * f) / f;
}

/** z-scores for common cycle service levels. */
export const SERVICE_LEVEL_Z: Record<string, number> = {
  '0.9': 1.2816,
  '0.95': 1.6449,
  '0.975': 1.96,
  '0.99': 2.3263,
};

export function zForServiceLevel(level: number): number {
  return SERVICE_LEVEL_Z[String(level)] ?? 1.6449;
}
