import { computeIndicators } from './indicators';
import { scoreDay, ScoringParams } from './scoring';

interface OHLCVRow {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface BacktestResult {
  strategyReturn: number;
  winRate: number;
  tradeCount: number;
  quality: number; // composite optimization score
}

interface OptimizationResult {
  params: ScoringParams;
  quality: number;
  strategyReturn: number;
  winRate: number;
  tradeCount: number;
}

/**
 * Run a single backtest with given scoring params and return quality metrics.
 * Quality = winRate * log(1 + strategyReturn/100) — rewards both win rate AND return,
 * with log dampening to avoid chasing single lucky huge-return runs.
 */
function backtestWithParams(rows: any[], params: ScoringParams): BacktestResult {
  let position: { entryPrice: number } | null = null;
  let equity = 100;
  const trades: number[] = [];

  for (let i = 1; i < rows.length; i++) {
    const { signal } = scoreDay(rows[i], rows[i - 1], params);
    if (signal === 'BUY' && !position) {
      position = { entryPrice: rows[i].close };
    } else if (signal === 'SELL' && position) {
      const ret = (rows[i].close - position.entryPrice) / position.entryPrice;
      equity *= 1 + ret;
      trades.push(ret);
      position = null;
    }
  }
  // Close any open position at last price
  if (position) {
    const lastClose = rows[rows.length - 1].close;
    const ret = (lastClose - position.entryPrice) / position.entryPrice;
    equity *= 1 + ret;
    trades.push(ret);
  }

  const strategyReturn = equity - 100;
  const wins = trades.filter(r => r > 0).length;
  const winRate = trades.length >= 3 ? (wins / trades.length) * 100 : 0;

  // Quality metric: penalise parameter sets with <3 trades (too few signals = overfit)
  const quality = trades.length >= 3
    ? (winRate / 100) * Math.log(1 + Math.max(strategyReturn, 0) / 100)
    : 0;

  return { strategyReturn, winRate, tradeCount: trades.length, quality };
}

/**
 * Run grid search over parameter combinations and return the best params for this symbol.
 * Uses the most recent `lookbackDays` of data for in-sample optimization,
 * so the tuning is always relative to the recent regime of the stock.
 */
export function optimizeParams(rawQuotes: OHLCVRow[], lookbackDays = 756): OptimizationResult {
  const quotes = rawQuotes.slice(-lookbackDays);
  const withIndicators = computeIndicators(quotes);

  // Parameter grid — deliberately kept small to avoid overfitting
  const rsiBuyThresholds   = [25, 30, 35];
  const rsiSellThresholds  = [65, 70, 75];
  const buyScoreThresholds  = [3];
  const sellScoreThresholds = [3];

  let best: OptimizationResult = {
    params: { rsiBuyThreshold: 30, rsiSellThreshold: 70, buyScoreThreshold: 3, sellScoreThreshold: 3 },
    quality: -Infinity,
    strategyReturn: 0,
    winRate: 0,
    tradeCount: 0,
  };

  for (const rsiBuyThreshold of rsiBuyThresholds) {
    for (const rsiSellThreshold of rsiSellThresholds) {
      // Skip nonsensical combos
      if (rsiSellThreshold <= rsiBuyThreshold) continue;

      for (const buyScoreThreshold of buyScoreThresholds) {
        for (const sellScoreThreshold of sellScoreThresholds) {
          const params: ScoringParams = {
            rsiBuyThreshold,
            rsiSellThreshold,
            buyScoreThreshold,
            sellScoreThreshold,
          };
          const result = backtestWithParams(withIndicators, params);
          if (result.quality > best.quality) {
            best = { params, ...result };
          }
        }
      }
    }
  }

  return best;
}
