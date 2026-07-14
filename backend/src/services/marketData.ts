import { PrismaClient } from '@prisma/client';
import yahooFinanceDefault from 'yahoo-finance2';
const yahooFinance = new (yahooFinanceDefault as any)({ suppressNotices: ['ripHistorical', 'yahooSurvey'] });

const prisma = new PrismaClient();

export function isValidOHLCVRow(symbol: string, row: any): boolean {
  if (row.open == null || row.high == null || row.low == null || row.close == null || row.volume == null ||
      Number.isNaN(row.open) || Number.isNaN(row.high) || Number.isNaN(row.low) || Number.isNaN(row.close) || Number.isNaN(row.volume)) {
    console.error(`[VALIDATION FAILED] ${symbol} @ ${row.date || 'unknown date'}: Missing or NaN values`);
    return false;
  }
  
  if (row.close <= 0 || row.open <= 0) {
    console.error(`[VALIDATION FAILED] ${symbol} @ ${row.date || 'unknown date'}: Close or Open <= 0`);
    return false;
  }
  
  if (row.high < row.low) {
    console.error(`[VALIDATION FAILED] ${symbol} @ ${row.date || 'unknown date'}: High < Low`);
    return false;
  }
  
  if (row.high < row.close || row.high < row.open) {
    console.error(`[VALIDATION FAILED] ${symbol} @ ${row.date || 'unknown date'}: High < Close or High < Open`);
    return false;
  }
  
  if (row.low > row.close || row.low > row.open) {
    console.error(`[VALIDATION FAILED] ${symbol} @ ${row.date || 'unknown date'}: Low > Close or Low > Open`);
    return false;
  }
  
  if (row.volume < 0) {
    console.error(`[VALIDATION FAILED] ${symbol} @ ${row.date || 'unknown date'}: Volume < 0`);
    return false;
  }

  return true;
}

export interface MarketDataProvider {
  getQuotes(symbol: string): Promise<any[]>;
  search(query: string): Promise<any[]>;
}

export class YahooFinanceProvider implements MarketDataProvider {
  async getQuotes(symbol: string): Promise<any[]> {
    const isUSD = !symbol.endsWith('.BO') && !symbol.endsWith('.NS');
    const fx = isUSD ? 83.5 : 1.0;

    // --- Daily TTL Cache Logic ---
    const latestCached = await prisma.quote.findFirst({
      where: { symbol },
      orderBy: { date: 'desc' },
      select: { date: true },
    });

    const today = new Date();
    const fourDaysAgo = new Date(today);
    fourDaysAgo.setDate(today.getDate() - 4);
    const fourDaysAgoStr = fourDaysAgo.toISOString().slice(0, 10);

    const isDataFresh = latestCached !== null && latestCached.date >= fourDaysAgoStr;

    if (isDataFresh) {
      const quotes = await prisma.quote.findMany({
        where: { symbol },
        orderBy: { date: 'asc' },
      });

      // --- Live Quote Patch ---
      try {
        const liveQuote = await yahooFinance.quote(symbol);
        if (liveQuote && liveQuote.regularMarketPrice) {
          const liveDateObj = liveQuote.regularMarketTime || new Date();
          const liveDate = liveDateObj.toISOString().slice(0, 10);
          const livePrice = liveQuote.regularMarketPrice;
          
          if (quotes[quotes.length - 1].date === liveDate) {
             quotes[quotes.length - 1].close = livePrice;
             quotes[quotes.length - 1].open = liveQuote.regularMarketOpen || quotes[quotes.length - 1].open;
             quotes[quotes.length - 1].high = liveQuote.regularMarketDayHigh || quotes[quotes.length - 1].high;
             quotes[quotes.length - 1].low = liveQuote.regularMarketDayLow || quotes[quotes.length - 1].low;
          } else if (liveDate > quotes[quotes.length - 1].date) {
             const newRow = {
               symbol,
               date: liveDate,
               open: liveQuote.regularMarketOpen || livePrice,
               high: liveQuote.regularMarketDayHigh || livePrice,
               low: liveQuote.regularMarketDayLow || livePrice,
               close: livePrice,
               volume: liveQuote.regularMarketVolume || 0,
             };
             if (isValidOHLCVRow(symbol, newRow)) {
               quotes.push(newRow as any);
             }
          }
        }
      } catch (e) {
        console.error("Failed to fetch live quote:", e);
      }

      return quotes.map((q) => ({
        date: q.date,
        open: q.open * fx,
        high: q.high * fx,
        low: q.low * fx,
        close: q.close * fx,
        volume: Number(q.volume),
      }));
    }

    // Fetch fresh historical data
    console.log(`Fetching data from Yahoo Finance for ${symbol}...`);
    const period1 = new Date();
    period1.setFullYear(period1.getFullYear() - 5);
    
    let results;
    try {
      results = await yahooFinance.historical(symbol, {
        period1,
        period2: new Date(),
        interval: '1d'
      });
    } catch (e) {
      console.error("Yahoo Finance API error:", e);
      // Fallback: check if we have ANY data in the database
      const fallbackQuotes = await prisma.quote.findMany({
        where: { symbol },
        orderBy: { date: 'asc' },
      });
      if (fallbackQuotes.length > 0) {
        return fallbackQuotes.map((q) => ({
          date: q.date,
          open: q.open * fx,
          high: q.high * fx,
          low: q.low * fx,
          close: q.close * fx,
          volume: Number(q.volume),
          _stale: true
        }));
      }
      throw new Error(`Market data API is down and no cached data exists for ${symbol}.`);
    }

    if (!results || results.length === 0) {
      throw new Error("No time series data returned from Yahoo Finance");
    }

    const newQuotes = results.map((row: any) => {
        const dateStr = row.date.toISOString().slice(0, 10);
        return {
          symbol,
          date: dateStr,
          open: row.open,
          high: row.high,
          low: row.low,
          close: row.close,
          volume: row.volume || 0,
        };
    }).filter((row: any) => isValidOHLCVRow(symbol, row));

    // Cache to DB
    for (const q of newQuotes) {
      await prisma.quote.upsert({
        where: { symbol_date: { symbol: q.symbol, date: q.date } },
        update: q,
        create: q,
      });
    }

    return newQuotes.map((q: any) => ({
      date: q.date,
      open: q.open * fx,
      high: q.high * fx,
      low: q.low * fx,
      close: q.close * fx,
      volume: Number(q.volume),
    }));
  }

  async search(query: string): Promise<any[]> {
    try {
      const results = await yahooFinance.search(query);
      return (results.quotes || [])
        .filter((q: any) => q.quoteType === 'EQUITY' || q.quoteType === 'ETF')
        .map((q: any) => ({
          sym: q.symbol,
          name: q.shortname || q.longname || q.symbol
        }));
    } catch (e) {
      console.error("Yahoo Finance Search error:", e);
      return [];
    }
  }
}
