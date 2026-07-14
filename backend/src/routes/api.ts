import express from 'express';
import rateLimit from 'express-rate-limit';
import { YahooFinanceProvider } from '../services/marketData';
import { computeIndicators } from '../engine/indicators';
import { scoreDay } from '../engine/scoring';
import { runBacktest } from '../engine/backtest';
import { generateAnalysis } from '../services/groqAnalysis';
import { computePriceLevels, computePositionAnalysis, computeSupportResistance } from '../engine/priceLevels';
import { optimizeParams } from '../engine/optimizer';
import { ScoringParams, DEFAULT_SCORING_PARAMS } from '../engine/scoring';

const router = express.Router();
const marketProvider = new YahooFinanceProvider();

const paramsCache = new Map<string, { params: ScoringParams; winRate: number; date: string }>();

function getOptimalParams(symbol: string, quotes: any[]): { params: ScoringParams, winRate: number } {
  const today = new Date().toISOString().slice(0, 10);
  const cached = paramsCache.get(symbol);
  if (cached && cached.date === today) {
    return { params: cached.params, winRate: cached.winRate };
  }
  const opt = optimizeParams(quotes as any);
  const bestParams = opt.quality > 0 ? opt.params : DEFAULT_SCORING_PARAMS;
  paramsCache.set(symbol, { params: bestParams, winRate: opt.winRate, date: today });
  return { params: bestParams, winRate: opt.winRate };
}

// FIX 4: Add rate limiting to API routes (LLM analysis route)
const analysisLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // Limit each IP to 30 requests per windowMs
  message: { error: "Too many analysis requests from this IP, please try again after a minute" }
});

// FIX 5: Basic input validation on market data
function isValidSymbol(symbol: string): boolean {
  if (!symbol || typeof symbol !== 'string') return false;
  if (symbol.length > 20) return false;
  if (!/^[A-Z0-9.\-^]+$/.test(symbol.toUpperCase())) return false;
  return true;
}

router.get('/search', async (req, res) => {
  try {
    const q = req.query.q as string;
    if (!q || q.length < 1) return res.json([]);
    const results = await marketProvider.search(q);
    res.json(results);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/quotes/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    if (!isValidSymbol(symbol)) return res.status(400).json({ error: "Invalid symbol format" });

    const quotes = await marketProvider.getQuotes(symbol);
    const withIndicators = computeIndicators(quotes);
    res.json(withIndicators);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/signal/:symbol', async (req, res) => {
  try {
    const symbol = (req.params.symbol as string).toUpperCase();
    if (!isValidSymbol(symbol)) return res.status(400).json({ error: "Invalid symbol format" });

    const quotes = await marketProvider.getQuotes(symbol);
    if (quotes.length < 2) return res.status(400).json({ error: "Not enough data" });
    
    const withIndicators = computeIndicators(quotes);
    if (withIndicators.length < 2) return res.status(400).json({ error: "Not enough data" });
    const { params, winRate } = getOptimalParams(symbol, quotes);
    const latest = withIndicators[withIndicators.length - 1] as any;
    const prev = withIndicators[withIndicators.length - 2] as any;
    
    const signal = scoreDay(latest, prev, params);
    res.json({ ...signal, historicalWinRate: winRate });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/backtest/:symbol', async (req, res) => {
  try {
    const symbol = (req.params.symbol as string).toUpperCase();
    if (!isValidSymbol(symbol)) return res.status(400).json({ error: "Invalid symbol format" });

    const quotes = await marketProvider.getQuotes(symbol);
    const withIndicators = computeIndicators(quotes);
    if (withIndicators.length < 55) return res.status(400).json({ error: "Not enough data for backtest" });
    
    const { params } = getOptimalParams(symbol, quotes);
    const backtest = runBacktest(withIndicators as any, params);
    res.json(backtest);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/analysis/:symbol', analysisLimiter, async (req, res) => {
  try {
    const symbol = (req.params.symbol as string).toUpperCase();
    if (!isValidSymbol(symbol)) return res.status(400).json({ error: "Invalid symbol format" });

    const quotes = await marketProvider.getQuotes(symbol);
    if (quotes.length < 2) return res.status(400).json({ error: "Not enough data" });
    
    const withIndicators = computeIndicators(quotes);
    if (withIndicators.length < 2) return res.status(400).json({ error: "Not enough data" });
    const { params } = getOptimalParams(symbol, quotes);
    const latest = withIndicators[withIndicators.length - 1] as any;
    const prev = withIndicators[withIndicators.length - 2] as any;
    const signal = scoreDay(latest, prev, params);
    
    const recentPrices = withIndicators.slice(-5).map(q => q.close);
    
    const analysis = await generateAnalysis(symbol, latest.close, signal, recentPrices);
    res.json(analysis);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/levels/:symbol', async (req, res) => {
  try {
    const symbol = (req.params.symbol as string).toUpperCase();
    if (!isValidSymbol(symbol)) return res.status(400).json({ error: 'Invalid symbol format' });

    const quotes = await marketProvider.getQuotes(symbol);
    if (quotes.length < 2) return res.status(400).json({ error: 'Not enough data' });

    const withIndicators = computeIndicators(quotes);
    if (withIndicators.length < 2) return res.status(400).json({ error: "Not enough data" });
    const { params } = getOptimalParams(symbol, quotes);
    const latest = withIndicators[withIndicators.length - 1] as any;
    const prev = withIndicators[withIndicators.length - 2] as any;
    const { signal } = scoreDay(latest, prev, params);

    // priceLevels needs OHLCV rows (quotes has open/high/low/close/date)
    const levels = computePriceLevels(quotes as any, signal);
    res.json(levels);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/position/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    if (!isValidSymbol(symbol)) return res.status(400).json({ error: 'Invalid symbol format' });

    const { entryPrice, entryDate } = req.body;
    if (!entryPrice || !entryDate) return res.status(400).json({ error: 'entryPrice and entryDate required' });

    const quotes = await marketProvider.getQuotes(symbol);
    if (quotes.length < 2) return res.status(400).json({ error: 'Not enough data' });

    const { resistance } = computeSupportResistance(quotes as any);
    const analysis = computePositionAnalysis(quotes as any, { entryPrice: +entryPrice, entryDate }, resistance);
    res.json(analysis);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
