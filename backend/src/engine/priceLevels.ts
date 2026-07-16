import { atr, OHLCRow } from './indicators';

export interface OHLCVRow extends OHLCRow {
  date: string;
  volume?: number;
}

export interface PriceLevels {
  atrValue: number | null;
  support: number | null;
  resistance: number | null;
  entryZone: { upper: number; lower: number } | null;
  dataTimestamp: string;
  // Trade Card fields
  buyAbove: number | null;
  target1: number | null;
  target2: number | null;
  stopLoss: number | null;
  stopLossStatus: 'active' | 'hit' | null;
}

export interface PositionState {
  entryPrice: number;
  entryDate: string;
}

export interface PositionAnalysis {
  entryPrice: number;
  currentPrice: number;
  fixedStopLoss: number;
  runningPeak: number;
  trailingStop: number;
  recommendation: 'HOLD' | 'SELL';
  nearResistance: boolean;
  partialExitHint: boolean;
}

/** Find swing highs: day i is a swing high if high[i] > high of 3 days before and after */
function findSwingHighs(rows: OHLCVRow[], lookback = 60): number[] {
  const window = rows.slice(-lookback);
  const swings: number[] = [];

  for (let i = 3; i < window.length - 3; i++) {
    const h = window[i].high;
    const before = [window[i-3].high, window[i-2].high, window[i-1].high];
    const after  = [window[i+1].high, window[i+2].high, window[i+3].high];
    if (before.every(b => h > b) && after.every(a => h > a)) {
      swings.push(h);
    }
  }
  return swings;
}

/** Find swing lows: day i is a swing low if low[i] < low of 3 days before and after */
function findSwingLows(rows: OHLCVRow[], lookback = 60): number[] {
  const window = rows.slice(-lookback);
  const swings: number[] = [];

  for (let i = 3; i < window.length - 3; i++) {
    const l = window[i].low;
    const before = [window[i-3].low, window[i-2].low, window[i-1].low];
    const after  = [window[i+1].low, window[i+2].low, window[i+3].low];
    if (before.every(b => l < b) && after.every(a => l < a)) {
      swings.push(l);
    }
  }
  return swings;
}

/**
 * Cluster a list of price levels: group values within `tolerance` of each other
 * and return the average of the largest cluster.
 */
function clusterLevels(levels: number[], tolerance = 0.01): number | null {
  if (levels.length === 0) return null;

  let bestCluster: number[] = [];
  for (const pivot of levels) {
    const cluster = levels.filter(v => Math.abs(v - pivot) / pivot <= tolerance);
    if (cluster.length > bestCluster.length) bestCluster = cluster;
  }

  if (bestCluster.length < 2) return null; // need at least 2 touches for a genuine level
  return bestCluster.reduce((s, v) => s + v, 0) / bestCluster.length;
}

/** Compute support and resistance from swing highs/lows */
export function computeSupportResistance(rows: OHLCVRow[], lookback = 60) {
  const highs = findSwingHighs(rows, lookback);
  const lows  = findSwingLows(rows, lookback);

  return {
    resistance: clusterLevels(highs),
    support: clusterLevels(lows),
  };
}

/** Compute top-level price levels for the levels API endpoint */
export function computePriceLevels(rows: OHLCVRow[], signal: string): PriceLevels {
  const atrArr = atr(rows, 14);
  const latestAtr = atrArr[atrArr.length - 1];
  const { support, resistance } = computeSupportResistance(rows);
  const currentPrice = rows[rows.length - 1].close;
  const dataTimestamp = rows[rows.length - 1].date;

  let entryZone: { upper: number; lower: number } | null = null;
  if (signal === 'BUY') {
    const lower = support != null && Math.abs(currentPrice - support) / currentPrice <= 0.02
      ? support
      : currentPrice * 0.98; // fallback: 2% below current
    entryZone = { upper: currentPrice, lower: +lower.toFixed(2) };
  }

  // ── Trade Card fields ────────────────────────────────────────────────────
  // buyAbove: single trigger price for BUY signal (support if within 2%, else current price)
  let buyAbove: number | null = null;
  if (signal === 'BUY') {
    buyAbove = support != null && Math.abs(currentPrice - support) / currentPrice <= 0.02
      ? +support.toFixed(2)
      : +currentPrice.toFixed(2);
  }

  // target1: conservative near-term target = current + 1.0 × ATR
  const target1 = latestAtr != null
    ? +(currentPrice + latestAtr * 1.0).toFixed(2)
    : null;

  // target2: nearest resistance above current price, OR current + 2.5×ATR — whichever is closer
  let target2: number | null = null;
  if (latestAtr != null) {
    const atrTarget = +(currentPrice + latestAtr * 2.5).toFixed(2);
    if (resistance != null && resistance > currentPrice) {
      // Pick whichever is a smaller distance from current price
      const resistanceDist = resistance - currentPrice;
      const atrDist = atrTarget - currentPrice;
      target2 = resistanceDist <= atrDist ? +resistance.toFixed(2) : atrTarget;
    } else {
      target2 = atrTarget;
    }
  }

  // stopLoss: current − 1.5 × ATR (same multiplier as fixedStopLoss in position analysis)
  const stopLoss = latestAtr != null
    ? +(currentPrice - latestAtr * 1.5).toFixed(2)
    : null;

  // stopLossStatus: "hit" if current price has already dropped below the stop
  const stopLossStatus: 'active' | 'hit' | null =
    stopLoss != null ? (currentPrice < stopLoss ? 'hit' : 'active') : null;

  return {
    atrValue: latestAtr != null ? +latestAtr.toFixed(4) : null,
    support: support != null ? +support.toFixed(2) : null,
    resistance: resistance != null ? +resistance.toFixed(2) : null,
    entryZone,
    dataTimestamp,
    buyAbove,
    target1,
    target2,
    stopLoss,
    stopLossStatus,
  };
}

/** Compute position analysis for an open position (State B) */
export function computePositionAnalysis(
  rows: OHLCVRow[],
  position: PositionState,
  resistance: number | null
): PositionAnalysis {
  const { entryPrice, entryDate } = position;

  // ATR at time of entry (find the entry row by date)
  const atrArr = atr(rows, 14);
  const entryIdx = rows.findIndex(r => r.date >= entryDate);
  const entryAtr = entryIdx >= 0 && atrArr[entryIdx] != null
    ? atrArr[entryIdx]!
    : (atrArr.filter(v => v != null).pop() ?? 0); // fallback to latest

  const fixedStopLoss = +(entryPrice - entryAtr * 1.5).toFixed(2);

  // Rows since entry
  const rowsSinceEntry = entryIdx >= 0 ? rows.slice(entryIdx) : rows;
  const runningPeak = Math.max(...rowsSinceEntry.map(r => r.close));

  // Trailing stop: recalculated from peak, but never lower than fixed stop
  const trailingRaw = runningPeak - entryAtr * 1.5;
  const trailingStop = +(Math.max(trailingRaw, fixedStopLoss)).toFixed(2);

  const currentPrice = rows[rows.length - 1].close;

  // Recommendation
  const recommendation: 'HOLD' | 'SELL' = currentPrice < trailingStop ? 'SELL' : 'HOLD';

  // Near resistance flag (within 1% of resistance)
  const nearResistance =
    resistance != null &&
    recommendation === 'HOLD' &&
    Math.abs(currentPrice - resistance) / currentPrice <= 0.01;

  const partialExitHint = nearResistance;

  return {
    entryPrice: +entryPrice.toFixed(2),
    currentPrice: +currentPrice.toFixed(2),
    fixedStopLoss,
    runningPeak: +runningPeak.toFixed(2),
    trailingStop,
    recommendation,
    nearResistance,
    partialExitHint,
  };
}
