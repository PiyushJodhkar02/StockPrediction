import { scoreDay, DayData, ScoringParams, DEFAULT_SCORING_PARAMS } from './scoring';

export interface BacktestRow extends DayData {
  date: string;
}

export function runBacktest(rows: BacktestRow[], params: ScoringParams = DEFAULT_SCORING_PARAMS) {
  let position: { entryPrice: number, entryIdx: number } | null = null;
  const trades: any[] = [];
  let equity = 100;
  const curve: { date: string; equity: number }[] = [];

  for (let i = 1; i < rows.length; i++) {
    const { signal } = scoreDay(rows[i], rows[i - 1], params);
    if (signal === "BUY" && !position) {
      position = { entryPrice: rows[i].close, entryIdx: i };
    } else if (signal === "SELL" && position) {
      const ret = (rows[i].close - position.entryPrice) / position.entryPrice;
      equity *= 1 + ret;
      trades.push({ ret, entry: position.entryPrice, exit: rows[i].close, date: rows[i].date });
      position = null;
    }
    // mark-to-market equity curve
    let mtm = equity;
    if (position) mtm = equity * (1 + (rows[i].close - position.entryPrice) / position.entryPrice);
    curve.push({ date: rows[i].date, equity: +mtm.toFixed(2) });
  }
  if (position) {
    const last = rows[rows.length - 1];
    const ret = (last.close - position.entryPrice) / position.entryPrice;
    equity *= 1 + ret;
    trades.push({ ret, entry: position.entryPrice, exit: last.close, date: last.date, open: true });
  }

  const first = rows[0].close, last = rows[rows.length - 1].close;
  const buyHold = ((last - first) / first) * 100;
  const strategyReturn = equity - 100;
  const wins = trades.filter((t) => t.ret > 0).length;
  const winRate = trades.length ? Math.round((wins / trades.length) * 100) : 0;

  return { strategyReturn, buyHold, trades, winRate, curve };
}
