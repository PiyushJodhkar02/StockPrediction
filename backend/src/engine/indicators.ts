export function sma(vals: number[], period: number): (number | null)[] {
  return vals.map((_, i) => {
    if (i < period - 1) return null;
    let s = 0;
    for (let k = i - period + 1; k <= i; k++) s += vals[k];
    return s / period;
  });
}

export function ema(vals: (number | null)[], period: number): (number | null)[] {
  const k = 2 / (period + 1);
  const out = new Array(vals.length).fill(null);
  let prev: number | null = null;
  for (let i = 0; i < vals.length; i++) {
    if (vals[i] == null) continue;
    if (prev == null) { prev = vals[i]; out[i] = prev; continue; }
    prev = vals[i]! * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export function rsi(vals: number[], period: number = 14): (number | null)[] {
  const out = new Array(vals.length).fill(null);
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i < vals.length; i++) {
    const change = vals[i] - vals[i - 1];
    const gain = Math.max(change, 0), loss = Math.max(-change, 0);
    if (i <= period) {
      avgGain += gain / period;
      avgLoss += loss / period;
      if (i === period) {
        const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        out[i] = 100 - 100 / (1 + rs);
      }
    } else {
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      out[i] = 100 - 100 / (1 + rs);
    }
  }
  return out;
}

export interface OHLCRow { open: number; high: number; low: number; close: number; }

export function atr(rows: OHLCRow[], period: number = 14): (number | null)[] {
  const out: (number | null)[] = new Array(rows.length).fill(null);
  if (rows.length === 0) return out;

  // Compute True Range for each bar
  const tr: number[] = rows.map((r, i) => {
    if (i === 0) return r.high - r.low;
    const prevClose = rows[i - 1].close;
    return Math.max(r.high - r.low, Math.abs(r.high - prevClose), Math.abs(r.low - prevClose));
  });

  // Seed: simple average of first `period` TRs
  if (tr.length < period) return out;
  let avg = tr.slice(0, period).reduce((s, v) => s + v, 0) / period;
  out[period - 1] = avg;

  // Wilder's smoothing for the rest
  for (let i = period; i < tr.length; i++) {
    avg = (avg * (period - 1) + tr[i]) / period;
    out[i] = avg;
  }
  return out;
}

export function computeIndicators(rows: { close: number }[]) {
  const closes = rows.map((r) => r.close);
  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const macdLine = closes.map((_, i) =>
    ema12[i] != null && ema26[i] != null ? ema12[i]! - ema26[i]! : null
  );
  const macdSignal = ema(macdLine, 9).map((v, i) =>
    macdLine[i] == null ? null : v
  );
  const macdHist = macdLine.map((v, i) =>
    v != null && macdSignal[i] != null ? v - macdSignal[i]! : null
  );
  const rsi14 = rsi(closes, 14);

  return rows.map((r, i) => ({
    ...r,
    sma20: sma20[i], sma50: sma50[i],
    macd: macdLine[i], macdSignal: macdSignal[i], macdHist: macdHist[i],
    rsi: rsi14[i],
  }));
}
