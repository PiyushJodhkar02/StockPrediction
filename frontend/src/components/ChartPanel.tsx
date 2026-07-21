import { useEffect, useRef } from 'react';
import { createChart, ColorType, CandlestickSeries, LineSeries, AreaSeries, createSeriesMarkers, LineStyle } from 'lightweight-charts';
import type { CandlestickData, LineData, SeriesMarker, Time } from 'lightweight-charts';

interface TradeLines {
  /** Entry / buy-above price */
  entry: number | null;
  stopLoss: number | null;
  target1: number | null;
  target2: number | null;
  /** Only render lines when signal is BUY — keeps chart clean on HOLD/SELL */
  signal: string;
}

interface ChartPanelProps {
  data: any[];
  levels?: {
    support: number | null;
    resistance: number | null;
    trailingStop?: number | null;
  };
  /** Trade execution lines — entry, stop-loss, targets */
  tradeLines?: TradeLines | null;
}

const T = {
  bg: "#0D1420",
  line: "#2A3B57",
  ink: "#E8E2D4",
  inkMuted: "#8A93A6",
  brass: "#C98A2C",
  buy: "#4C9A78",
  sell: "#C1543B",
};

export default function ChartPanel({ data, levels, tradeLines }: ChartPanelProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const candlestickSeriesRef = useRef<any>(null);
  const areaSeriesRef = useRef<any>(null);
  const sma20SeriesRef = useRef<any>(null);
  const sma50SeriesRef = useRef<any>(null);

  // Support / resistance level lines
  const supportLineRef = useRef<any>(null);
  const resistanceLineRef = useRef<any>(null);
  const trailingStopLineRef = useRef<any>(null);

  // Trade execution lines (entry / stop-loss / targets)
  const entryLineRef = useRef<any>(null);
  const stopLossLineRef = useRef<any>(null);
  const target1LineRef = useRef<any>(null);
  const target2LineRef = useRef<any>(null);

  const lastStartRef = useRef<number | null>(null);

  // ── 1. Initialize Chart Once ────────────────────────────────────────
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: T.inkMuted,
        fontFamily: "'JetBrains Mono', monospace",
      },
      grid: {
        vertLines: { color: 'transparent' },
        horzLines: { color: T.line, style: 3 },
      },
      timeScale: {
        borderColor: T.line,
        timeVisible: false, // will be dynamically updated
      },
      rightPriceScale: {
        borderColor: T.line,
      },
      crosshair: {
        mode: 1,
        vertLine: { color: T.inkMuted, labelBackgroundColor: '#1A2740' },
        horzLine: { color: T.inkMuted, labelBackgroundColor: '#1A2740' },
      },
    });
    chartRef.current = chart;

    candlestickSeriesRef.current = chart.addSeries(CandlestickSeries, {
      upColor: T.buy,
      downColor: T.sell,
      borderVisible: false,
      wickUpColor: T.buy,
      wickDownColor: T.sell,
    });

    areaSeriesRef.current = chart.addSeries(AreaSeries, {
      lineColor: T.buy,
      topColor: `${T.buy}80`,
      bottomColor: `${T.buy}00`,
      lineWidth: 2,
    });

    sma20SeriesRef.current = chart.addSeries(LineSeries, {
      color: T.brass,
      lineWidth: 2,
      crosshairMarkerVisible: false,
    });

    sma50SeriesRef.current = chart.addSeries(LineSeries, {
      color: "#6C7A93",
      lineWidth: 2,
      lineStyle: 2,
      crosshairMarkerVisible: false,
    });

    const resizeObserver = new ResizeObserver(entries => {
      if (entries.length === 0 || entries[0].target !== chartContainerRef.current) {
        return;
      }
      const newRect = entries[0].contentRect;
      chart.applyOptions({ width: newRect.width });
    });

    resizeObserver.observe(chartContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
    };
  }, []);

  // ── 2. Update Data & Level Lines When data/levels change ────────────
  useEffect(() => {
    if (!chartRef.current || !candlestickSeriesRef.current) return;

    const candles: CandlestickData[] = [];
    const sma20: LineData[] = [];
    const sma50: LineData[] = [];
    const markers: SeriesMarker<any>[] = [];

    let prevSig = "HOLD";
    data.forEach(d => {
      let time = d.date;
      if (typeof time === 'string') {
        if (time.includes('T')) {
          // Intraday data: just convert to unix epoch
          time = Math.floor(new Date(time).getTime() / 1000);
        } else {
          // Daily data: set to 15:30 local time
          const [year, month, day] = time.split('-').map(Number);
          time = Math.floor(new Date(year, month - 1, day, 15, 30, 0).getTime() / 1000);
        }
      }

      candles.push({ time, open: d.open, high: d.high, low: d.low, close: d.close });

      if (d.sma20 != null) sma20.push({ time, value: d.sma20 });
      if (d.sma50 != null) sma50.push({ time, value: d.sma50 });

      const sig = d.signalData ? d.signalData.signal : d.signal;
      if (sig !== "HOLD" && sig !== prevSig) {
        if (sig === "BUY") {
          markers.push({ time, position: 'belowBar', color: T.buy, shape: 'arrowUp' });
        } else if (sig === "SELL") {
          markers.push({ time, position: 'aboveBar', color: T.sell, shape: 'arrowDown' });
        }
      }
      if (sig && sig !== "HOLD") {
        prevSig = sig;
      } else if (sig === "HOLD") {
        prevSig = "HOLD";
      }
    });

    // Determine overall direction for the day/week to color the intraday line (if we ever use it)
    const isIntraday = data.some(d => typeof d.date === 'string' && d.date.includes('T'));
    const firstClose = candles[0]?.close ?? 0;
    const lastClose = candles[candles.length - 1]?.close ?? 0;
    const color = lastClose >= firstClose ? T.buy : T.sell;

    // Always show time now that it displays correct market close time for daily data
    chartRef.current.applyOptions({
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: (time: number | string, tickMarkType: any, locale: string) => {
          if (typeof time === 'number') {
            const date = new Date(time * 1000);
            return isIntraday ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : date.toLocaleDateString();
          }
          return time;
        }
      },
      localization: {
        timeFormatter: (time: number) => {
          if (typeof time === 'number') {
            const date = new Date(time * 1000);
            return isIntraday ? `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : date.toLocaleDateString();
          }
          return time;
        }
      }
    });

    // Always show candlestick, hide area chart
    const activeMainSeries = candlestickSeriesRef.current;
    candlestickSeriesRef.current.setData(candles);
    areaSeriesRef.current.setData([]);
    sma20SeriesRef.current.setData(sma20);
    sma50SeriesRef.current.setData(sma50);
    createSeriesMarkers(candlestickSeriesRef.current, markers);

    // Support line
    if (supportLineRef.current) {
      candlestickSeriesRef.current.removePriceLine(supportLineRef.current);
      areaSeriesRef.current.removePriceLine(supportLineRef.current);
      supportLineRef.current = null;
    }
    if (levels?.support) {
      supportLineRef.current = activeMainSeries.createPriceLine({
        price: levels.support,
        color: T.buy,
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: 'Support',
      });
    }

    // Resistance line
    if (resistanceLineRef.current) {
      candlestickSeriesRef.current.removePriceLine(resistanceLineRef.current);
      areaSeriesRef.current.removePriceLine(resistanceLineRef.current);
      resistanceLineRef.current = null;
    }
    if (levels?.resistance) {
      resistanceLineRef.current = activeMainSeries.createPriceLine({
        price: levels.resistance,
        color: T.sell,
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: 'Resistance',
      });
    }

    // Trailing stop line
    if (trailingStopLineRef.current) {
      candlestickSeriesRef.current.removePriceLine(trailingStopLineRef.current);
      areaSeriesRef.current.removePriceLine(trailingStopLineRef.current);
      trailingStopLineRef.current = null;
    }
    if (levels?.trailingStop) {
      trailingStopLineRef.current = activeMainSeries.createPriceLine({
        price: levels.trailingStop,
        color: T.brass,
        lineWidth: 1,
        lineStyle: 3,
        axisLabelVisible: true,
        title: 'Trail Stop',
      });
    }

    const startTime = candles.length > 0 ? candles[0].time : null;
    if (startTime !== lastStartRef.current) {
      chartRef.current.timeScale().fitContent();
      lastStartRef.current = startTime as number;
    }
  }, [data, levels]);

  // ── 3. Trade Execution Lines (Entry / Stop-Loss / Targets) ──────────
  // Runs independently from the data effect so live-refresh can call
  // applyOptions on existing lines instead of recreating them, avoiding
  // flicker on the 15-second auto-refresh cycle.
  useEffect(() => {
    if (!candlestickSeriesRef.current || !areaSeriesRef.current) return;

    const isIntraday = data.some(d => typeof d.date === 'string' && d.date.includes('T'));
    const activeMainSeries = isIntraday ? areaSeriesRef.current : candlestickSeriesRef.current;

    const showLines = tradeLines?.signal === 'BUY';

    // ── Entry line ──────────────────────────────────────────────────
    if (!showLines || tradeLines?.entry == null) {
      if (entryLineRef.current) {
        candlestickSeriesRef.current.removePriceLine(entryLineRef.current);
        areaSeriesRef.current.removePriceLine(entryLineRef.current);
        entryLineRef.current = null;
      }
    } else {
      if (entryLineRef.current) {
        entryLineRef.current.applyOptions({ price: tradeLines.entry });
      } else {
        entryLineRef.current = activeMainSeries.createPriceLine({
          price: tradeLines.entry,
          color: T.buy,
          lineWidth: 2,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: true,
          title: 'Entry',
        });
      }
    }

    // ── Stop-loss line ──────────────────────────────────────────────
    if (!showLines || tradeLines?.stopLoss == null) {
      if (stopLossLineRef.current) {
        candlestickSeriesRef.current.removePriceLine(stopLossLineRef.current);
        areaSeriesRef.current.removePriceLine(stopLossLineRef.current);
        stopLossLineRef.current = null;
      }
    } else {
      if (stopLossLineRef.current) {
        stopLossLineRef.current.applyOptions({ price: tradeLines.stopLoss });
      } else {
        stopLossLineRef.current = activeMainSeries.createPriceLine({
          price: tradeLines.stopLoss,
          color: T.sell,
          lineWidth: 2,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: true,
          title: 'Stop Loss',
        });
      }
    }

    // ── Target 1 line ───────────────────────────────────────────────
    if (!showLines || tradeLines?.target1 == null) {
      if (target1LineRef.current) {
        candlestickSeriesRef.current.removePriceLine(target1LineRef.current);
        areaSeriesRef.current.removePriceLine(target1LineRef.current);
        target1LineRef.current = null;
      }
    } else {
      if (target1LineRef.current) {
        target1LineRef.current.applyOptions({ price: tradeLines.target1 });
      } else {
        target1LineRef.current = activeMainSeries.createPriceLine({
          price: tradeLines.target1,
          color: T.brass,
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: 'Target 1',
        });
      }
    }

    // ── Target 2 line ───────────────────────────────────────────────
    if (!showLines || tradeLines?.target2 == null) {
      if (target2LineRef.current) {
        candlestickSeriesRef.current.removePriceLine(target2LineRef.current);
        areaSeriesRef.current.removePriceLine(target2LineRef.current);
        target2LineRef.current = null;
      }
    } else {
      if (target2LineRef.current) {
        target2LineRef.current.applyOptions({ price: tradeLines.target2 });
      } else {
        target2LineRef.current = activeMainSeries.createPriceLine({
          price: tradeLines.target2,
          color: T.brass,
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: 'Target 2',
        });
      }
    }
  }, [tradeLines, data]);

  const showTradeLegend = tradeLines?.signal === 'BUY';

  return (
    <div style={{ height: 280, marginTop: 12 }}>
      <div ref={chartContainerRef} style={{ width: '100%', height: '100%' }} />


    </div>
  );
}
