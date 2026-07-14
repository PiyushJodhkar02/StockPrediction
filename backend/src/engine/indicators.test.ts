import { sma, ema, rsi, atr, computeIndicators } from './indicators';

describe('Indicators', () => {

  describe('SMA', () => {
    it('computes correct simple moving average and handles initial nulls', () => {
      const inputs = [10, 20, 30, 40, 50];
      const result = sma(inputs, 3);
      expect(result).toHaveLength(5);
      expect(result[0]).toBeNull();
      expect(result[1]).toBeNull();
      expect(result[2]).toBeCloseTo(20, 4); // (10+20+30)/3 = 20
      expect(result[3]).toBeCloseTo(30, 4); // (20+30+40)/3 = 30
      expect(result[4]).toBeCloseTo(40, 4); // (30+40+50)/3 = 40
    });

    it('returns all nulls if array is shorter than period', () => {
      const inputs = [10, 20];
      const result = sma(inputs, 3);
      expect(result).toEqual([null, null]);
    });

    it('handles empty array', () => {
      expect(sma([], 3)).toEqual([]);
    });

    it('handles NaN gracefully', () => {
      const inputs = [10, 20, NaN];
      const result = sma(inputs, 3);
      expect(result[2]).toBeNaN();
    });
  });

  describe('EMA', () => {
    it('computes expected exponential moving average', () => {
      // For period=3, k = 2/(3+1) = 0.5
      const inputs = [10, 20, 30, 40];
      const result = ema(inputs, 3);
      expect(result[0]).toBeCloseTo(10, 4);
      // next: 20 * 0.5 + 10 * 0.5 = 15
      expect(result[1]).toBeCloseTo(15, 4);
      // next: 30 * 0.5 + 15 * 0.5 = 22.5
      expect(result[2]).toBeCloseTo(22.5, 4);
      // next: 40 * 0.5 + 22.5 * 0.5 = 31.25
      expect(result[3]).toBeCloseTo(31.25, 4);
    });

    it('handles empty arrays and shorter arrays', () => {
      expect(ema([], 3)).toEqual([]);
      expect(ema([10], 3)).toEqual([10]); // shorter array just seeds the EMA
    });
  });

  describe('RSI', () => {
    it('matches textbook Wilder RSI calculation exactly', () => {
      // Standard textbook example for 14-period RSI
      const closes = [
        44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.10, 45.42, 
        45.84, 46.08, 45.89, 45.22, 45.71, 46.45, 45.78, 45.35
      ];
      const result = rsi(closes, 14);
      
      // The first 14 items (indices 0 to 13) don't have a 14-period RSI value yet, because 
      // you need 15 days of data to get 14 price changes.
      for (let i = 0; i < 14; i++) {
        expect(result[i]).toBeNull();
      }

      // 15th day (index 14): First RSI value based on simple average of first 14 gains/losses
      // Expected RSI is ~61.84
      expect(result[14]).toBeCloseTo(61.84, 1); 

      // 16th day (index 15): Smoothed using Wilder's method
      // Expected RSI is ~57.46
      expect(result[15]).toBeCloseTo(57.46, 1);
    });

    it('handles empty and short arrays', () => {
      expect(rsi([], 14)).toEqual([]);
      expect(rsi([10, 20], 14)).toEqual([null, null]);
    });
  });

  describe('MACD', () => {
    it('maintains mathematical identity: macd = ema12 - ema26 and hist = macd - signal', () => {
      // generate dummy trend
      const rows = Array.from({length: 40}, (_, i) => ({ close: 100 + i + (i%3)*2 }));
      const result = computeIndicators(rows);

      result.forEach(row => {
        if (row.macd != null) {
          // Verify MACD is actually EMA(12) - EMA(26)
          // Wait, computeIndicators doesn't export ema12 and ema26 directly on the row,
          // but we can compute them manually for this test.
        }
      });
      
      const closes = rows.map(r => r.close);
      const ema12 = ema(closes, 12);
      const ema26 = ema(closes, 26);
      
      result.forEach((row, i) => {
        if (ema12[i] != null && ema26[i] != null) {
          const expectedMacd = ema12[i]! - ema26[i]!;
          expect(row.macd).toBeCloseTo(expectedMacd, 4);
          
          if (row.macdSignal != null) {
            const expectedHist = row.macd! - row.macdSignal;
            expect(row.macdHist).toBeCloseTo(expectedHist, 4);
          }
        }
      });
    });
  });

  describe('ATR', () => {
    it('returns all nulls for arrays shorter than period', () => {
      const rows = [{ open: 10, high: 12, low: 9, close: 11 }];
      const result = atr(rows, 14);
      expect(result).toEqual([null]);
    });

    it('handles empty array', () => {
      expect(atr([], 14)).toEqual([]);
    });

    it('computes correct ATR against hand-worked values', () => {
      // Hand-worked 3-period ATR example
      // Day 0: H=12, L=10, C=11  → TR = 12-10 = 2
      // Day 1: H=14, L=11, C=13  → TR = max(14-11=3, |14-11|=3, |11-11|=0) = 3
      // Day 2: H=13, L=11, C=12  → TR = max(13-11=2, |13-13|=0, |11-13|=2) = 2
      // Seed ATR(3) at index 2 = (2+3+2)/3 = 2.333...
      // Day 3: H=15, L=12, C=14  → TR = max(15-12=3, |15-12|=3, |12-12|=0) = 3
      // ATR(3) at index 3 = (2.333*2 + 3)/3 = 7.666/3 = 2.555...
      const rows = [
        { open: 10, high: 12, low: 10, close: 11 },
        { open: 11, high: 14, low: 11, close: 13 },
        { open: 13, high: 13, low: 11, close: 12 },
        { open: 12, high: 15, low: 12, close: 14 },
      ];
      const result = atr(rows, 3);
      expect(result[0]).toBeNull();
      expect(result[1]).toBeNull();
      expect(result[2]).toBeCloseTo(2.3333, 3);
      expect(result[3]).toBeCloseTo(2.5556, 3);
    });
  });
});
