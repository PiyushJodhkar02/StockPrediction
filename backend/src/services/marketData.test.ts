import { isValidOHLCVRow } from './marketData';

describe('Market Data OHLCV Validation', () => {
  const sym = 'TEST';

  it('accepts a valid row', () => {
    const valid = { date: '2023-01-01', open: 100, high: 110, low: 90, close: 105, volume: 10000 };
    expect(isValidOHLCVRow(sym, valid)).toBe(true);
  });

  it('rejects if close <= 0 or open <= 0', () => {
    const negClose = { date: '2023-01-01', open: 100, high: 110, low: 90, close: -5, volume: 10000 };
    expect(isValidOHLCVRow(sym, negClose)).toBe(false);

    const zeroOpen = { date: '2023-01-01', open: 0, high: 110, low: 90, close: 105, volume: 10000 };
    expect(isValidOHLCVRow(sym, zeroOpen)).toBe(false);
  });

  it('rejects if high < low', () => {
    const badHighLow = { date: '2023-01-01', open: 100, high: 80, low: 90, close: 95, volume: 10000 };
    expect(isValidOHLCVRow(sym, badHighLow)).toBe(false);
  });

  it('rejects if high is less than close or open', () => {
    const badHighClose = { date: '2023-01-01', open: 100, high: 100, low: 90, close: 105, volume: 10000 };
    expect(isValidOHLCVRow(sym, badHighClose)).toBe(false);

    const badHighOpen = { date: '2023-01-01', open: 110, high: 100, low: 90, close: 95, volume: 10000 };
    expect(isValidOHLCVRow(sym, badHighOpen)).toBe(false);
  });

  it('rejects if low is greater than close or open', () => {
    const badLowClose = { date: '2023-01-01', open: 100, high: 110, low: 100, close: 95, volume: 10000 };
    expect(isValidOHLCVRow(sym, badLowClose)).toBe(false);

    const badLowOpen = { date: '2023-01-01', open: 100, high: 110, low: 105, close: 110, volume: 10000 };
    expect(isValidOHLCVRow(sym, badLowOpen)).toBe(false);
  });

  it('rejects if volume is negative', () => {
    const negVol = { date: '2023-01-01', open: 100, high: 110, low: 90, close: 105, volume: -1 };
    expect(isValidOHLCVRow(sym, negVol)).toBe(false);
  });

  it('rejects if any value is missing or NaN', () => {
    const missing = { date: '2023-01-01', open: 100, high: 110, low: 90, close: null, volume: 1000 };
    expect(isValidOHLCVRow(sym, missing)).toBe(false);

    const isNan = { date: '2023-01-01', open: 100, high: 110, low: 90, close: 105, volume: NaN };
    expect(isValidOHLCVRow(sym, isNan)).toBe(false);
  });
});
