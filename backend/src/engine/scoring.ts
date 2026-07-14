export interface Rule {
  label: string;
  verdict: string;
  pts: number;
}

export interface DayData {
  close: number;
  sma20: number | null;
  sma50: number | null;
  rsi: number | null;
  macd: number | null;
  macdSignal: number | null;
  macdHist: number | null;
  [key: string]: any;
}

/** Tunable parameters for the scoring engine. All have well-tested defaults. */
export interface ScoringParams {
  rsiBuyThreshold: number;   // RSI below this → oversold BUY signal  (default 30)
  rsiSellThreshold: number;  // RSI above this → overbought SELL signal (default 70)
  buyScoreThreshold: number; // score must be >= this to fire BUY  (default 3)
  sellScoreThreshold: number;// score must be <= -this to fire SELL (default 3)
}

export const DEFAULT_SCORING_PARAMS: ScoringParams = {
  rsiBuyThreshold: 30,
  rsiSellThreshold: 70,
  buyScoreThreshold: 3,
  sellScoreThreshold: 3,
};

export function scoreDay(
  cur: DayData,
  prev: DayData | undefined,
  params: ScoringParams = DEFAULT_SCORING_PARAMS
) {
  const rules: Rule[] = [];
  let score = 0;

  if (cur.sma20 != null && cur.sma50 != null) {
    const up = cur.sma20 > cur.sma50;
    rules.push({ label: "20/50-day trend cross", verdict: up ? "Bullish" : "Bearish", pts: up ? 1 : -1 });
    score += up ? 1 : -1;
  }
  if (cur.sma20 != null) {
    const above = cur.close > cur.sma20;
    rules.push({ label: "Price vs 20-day average", verdict: above ? "Above (strength)" : "Below (weakness)", pts: above ? 1 : -1 });
    score += above ? 1 : -1;
  }
  if (cur.rsi != null) {
    let verdict = "Neutral", pts = 0;
    if (cur.rsi < params.rsiBuyThreshold) { verdict = "Oversold (rebound likely)"; pts = 2; }
    else if (cur.rsi > params.rsiSellThreshold) { verdict = "Overbought (pullback risk)"; pts = -2; }
    rules.push({ label: `RSI (${cur.rsi.toFixed(0)})`, verdict, pts });
    score += pts;
  }
  if (cur.macd != null && cur.macdSignal != null) {
    const bull = cur.macd > cur.macdSignal;
    rules.push({ label: "MACD vs signal line", verdict: bull ? "Bullish crossover" : "Bearish crossover", pts: bull ? 1 : -1 });
    score += bull ? 1 : -1;
  }
  if (cur.macdHist != null && prev && prev.macdHist != null) {
    const rising = cur.macdHist > prev.macdHist;
    rules.push({ label: "Momentum (MACD histogram)", verdict: rising ? "Accelerating" : "Decelerating", pts: rising ? 1 : -1 });
    score += rising ? 1 : -1;
  }

  const max = 6;
  let signal = "HOLD";
  if (score >= params.buyScoreThreshold) signal = "BUY";
  else if (score <= -params.sellScoreThreshold) signal = "SELL";
  const confidence = Math.round((Math.abs(score) / max) * 100);
  return { score, signal, confidence, rules };
}
