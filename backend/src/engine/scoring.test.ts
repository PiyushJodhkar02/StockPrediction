import { scoreDay } from './scoring';

describe('Scoring Engine', () => {
  it('returns BUY for perfect bullish alignment', () => {
    const today = {
      close: 150,
      sma20: 140,
      sma50: 130,
      rsi: 45, 
      macd: 2,
      macdSignal: 1,
      macdHist: 2,
    };
    const yesterday = {
      close: 145,
      sma20: null,
      sma50: null,
      rsi: null,
      macd: null,
      macdSignal: null,
      macdHist: -1, 
    };
    
    const result = scoreDay(today, yesterday);
    expect(result.signal).toBe('BUY');
    expect(result.score).toBeGreaterThanOrEqual(3);
  });

  it('returns SELL for perfect bearish alignment', () => {
    const today = {
      close: 100,
      sma20: 120,
      sma50: 140,
      rsi: 35, 
      macd: -2,
      macdSignal: -1,
      macdHist: -2, 
    };
    const yesterday = {
      close: 105,
      sma20: null,
      sma50: null,
      rsi: null,
      macd: null,
      macdSignal: null,
      macdHist: 1, 
    };
    
    const result = scoreDay(today, yesterday);
    expect(result.signal).toBe('SELL');
    expect(result.score).toBeLessThanOrEqual(-3);
  });

  it('handles missing previous day gracefully', () => {
    const today = {
      close: 150,
      sma20: 140,
      sma50: 130,
      rsi: 50,
      macd: 2,
      macdSignal: 1,
      macdHist: 2,
    };
    
    const result = scoreDay(today, undefined);
    expect(result.signal).toBeDefined();
    const macdMomentumRule = result.rules.find(r => r.label === 'Momentum (MACD histogram)');
    expect(macdMomentumRule).toBeUndefined(); // The rule isn't added if prev data is missing
  });
});
