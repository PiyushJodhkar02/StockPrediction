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

const paramsCache = new Map<string, { params: ScoringParams; winRate: number; date: string; asOfDate?: string | undefined }>();

function filterQuotesByDate(quotes: any[], targetDate?: string) {
  if (!targetDate) return quotes;
  return quotes.filter(q => {
    const d = q.date instanceof Date ? q.date.toISOString().split('T')[0] : String(q.date).split('T')[0];
    return d <= targetDate;
  });
}

function getOptimalParams(symbol: string, quotes: any[], asOfDate?: string): { params: ScoringParams, winRate: number } {
  const today = new Date().toISOString().slice(0, 10);
  const cached = paramsCache.get(symbol);
  if (cached && cached.date === today && cached.asOfDate === asOfDate) {
    return { params: cached.params, winRate: cached.winRate };
  }
  const opt = optimizeParams(quotes as any);
  const bestParams = opt.quality > 0 ? opt.params : DEFAULT_SCORING_PARAMS;
  paramsCache.set(symbol, { params: bestParams, winRate: opt.winRate, date: today, asOfDate });
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

router.get('/dashboard/:symbol', async (req, res) => {
  try {
    const symbol = (req.params.symbol as string).toUpperCase();
    if (!isValidSymbol(symbol)) return res.status(400).json({ error: "Invalid symbol format" });

    let quotes = await marketProvider.getQuotes(symbol);
    quotes = filterQuotesByDate(quotes, req.query.date as string);
    if (quotes.length < 55) return res.status(400).json({ error: "Not enough data" });
    
    const withIndicators = computeIndicators(quotes);
    const { params, winRate } = getOptimalParams(symbol, quotes, req.query.date as string);
    const latest = withIndicators[withIndicators.length - 1] as any;
    const prev = withIndicators[withIndicators.length - 2] as any;
    
    // Single source of truth for signal
    const signalPayload = scoreDay(latest, prev, params);
    const signalWithWinRate = { ...signalPayload, historicalWinRate: winRate };

    const backtest = runBacktest(withIndicators as any, params);
    
    // Pass the exact same signal evaluation to levels
    const levels = computePriceLevels(quotes as any, signalPayload.signal);

    res.json({
      quotes: withIndicators,
      signal: signalWithWinRate,
      backtest,
      levels
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/analysis/:symbol', analysisLimiter, async (req, res) => {
  try {
    const symbol = (req.params.symbol as string).toUpperCase();
    if (!isValidSymbol(symbol)) return res.status(400).json({ error: "Invalid symbol format" });

    // Support simulation date passed either as query param or in request body
    const simulationDate = (req.query.date as string) || (req.body?.date as string) || undefined;
    const intradayQuote = req.body?.intradayQuote;

    let quotes = await marketProvider.getQuotes(symbol);
    quotes = filterQuotesByDate(quotes, simulationDate);
    if (quotes.length < 2) return res.status(400).json({ error: "Not enough data" });
    
    const withIndicators = computeIndicators(quotes);
    if (withIndicators.length < 2) return res.status(400).json({ error: "Not enough data" });
    const { params, winRate } = getOptimalParams(symbol, quotes, simulationDate);
    
    // If intradayQuote is provided (e.g. simulation playback minute), use it as the 'latest' point.
    // Otherwise fallback to the daily latest close.
    const latest = intradayQuote ? intradayQuote : (withIndicators[withIndicators.length - 1] as any);
    const prev = withIndicators[withIndicators.length - 2] as any;
    
    // If intradayQuote already has signalData from frontend, use it. Otherwise score it.
    const signal = intradayQuote?.signalData ? intradayQuote.signalData : scoreDay(latest, prev, params);
    const signalWithWinRate = { ...signal, historicalWinRate: winRate };
    
    // Enrich signal with concrete indicator values for better AI analysis
    const enrichedSignal = {
      ...signalWithWinRate,
      indicators: {
        rsi: latest.rsi != null ? +latest.rsi.toFixed(2) : null,
        macdLine: latest.macdLine != null ? +latest.macdLine.toFixed(4) : null,
        macdSignal: latest.macdSignal != null ? +latest.macdSignal.toFixed(4) : null,
        macdHist: latest.macdHist != null ? +latest.macdHist.toFixed(4) : null,
        sma20: latest.sma20 != null ? +latest.sma20.toFixed(2) : null,
        sma50: latest.sma50 != null ? +latest.sma50.toFixed(2) : null,
        priceVsSma20: latest.sma20 ? ((latest.close - latest.sma20) / latest.sma20 * 100).toFixed(2) + '%' : null,
        priceVsSma50: latest.sma50 ? ((latest.close - latest.sma50) / latest.sma50 * 100).toFixed(2) + '%' : null,
      }
    };

    const recentPrices = withIndicators.slice(-5).map(q => q.close);
    
    const analysis = await generateAnalysis(symbol, latest.close, enrichedSignal, recentPrices, simulationDate);
    res.json(analysis);
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

router.get('/simulation/intraday/:symbol', async (req, res) => {
  try {
    const symbol = (req.params.symbol as string).toUpperCase();
    if (!isValidSymbol(symbol)) return res.status(400).json({ error: "Invalid symbol format" });
    
    const dateStr = req.query.date as string;
    if (!dateStr) return res.status(400).json({ error: "Date parameter required" });

    const quotes = await marketProvider.getIntradayQuotes(symbol, dateStr);
    if (quotes.length < 2) return res.status(400).json({ error: "Not enough intraday data" });
    
    // We can compute indicators for intraday data, though standard params might be too slow.
    // For now, we'll compute indicators normally to see the intraday signals.
    const withIndicators = computeIndicators(quotes);
    const { params, winRate } = getOptimalParams(symbol, quotes, dateStr);

    // Compute signal for each point so frontend can play it back
    const quotesWithSignals = withIndicators.map((q, i) => {
        if (i === 0) return { ...q, signalData: scoreDay(q as any, q as any, params) };
        const prev = withIndicators[i - 1];
        const sig = scoreDay(q as any, prev as any, params);
        return { ...q, signalData: { ...sig, historicalWinRate: winRate } };
    });

    res.json({
      quotes: quotesWithSignals,
      params
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


router.get('/dashboard/:symbol/live-intraday', async (req, res) => {
  try {
    const symbol = (req.params.symbol as string).toUpperCase();
    if (!isValidSymbol(symbol)) return res.status(400).json({ error: "Invalid symbol format" });
    
    const range = req.query.range as string; // '1D' or '1W'
    const days = range === '1W' ? 6 : 1; // 6 to be safe for a full trading week
    
    const quotes = await marketProvider.getLiveIntradayQuotes(symbol, days);
    console.log(`live-intraday fetched ${quotes.length} quotes for ${symbol}`);
    if (quotes.length < 2) return res.json({ quotes: [], debug_length: quotes.length, debug_days: days, debug_range: range });
    
    const withIndicators = computeIndicators(quotes);
    console.log(`live-intraday indicators computed: ${withIndicators.length} quotes`);
    const { params, winRate } = getOptimalParams(symbol, quotes);

    const quotesWithSignals = withIndicators.map((q, i) => {
        if (i === 0) return { ...q, signalData: scoreDay(q as any, q as any, params) };
        const prev = withIndicators[i - 1];
        const sig = scoreDay(q as any, prev as any, params);
        return { ...q, signalData: { ...sig, historicalWinRate: winRate } };
    });

    res.json({ quotes: quotesWithSignals });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
