import { useEffect, useRef } from 'react';
import { createChart, ColorType, CandlestickSeries, LineSeries, createSeriesMarkers } from 'lightweight-charts';
import type { CandlestickData, LineData, SeriesMarker } from 'lightweight-charts';

interface ChartPanelProps {
  data: any[];
  levels?: {
    support: number | null;
    resistance: number | null;
    trailingStop?: number | null;
  };
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

export default function ChartPanel({ data, levels }: ChartPanelProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const candlestickSeriesRef = useRef<any>(null);
  const sma20SeriesRef = useRef<any>(null);
  const sma50SeriesRef = useRef<any>(null);
  const supportLineRef = useRef<any>(null);
  const resistanceLineRef = useRef<any>(null);
  const trailingStopLineRef = useRef<any>(null);
  const lastStartRef = useRef<number | null>(null);

  // 1. Initialize Chart Once
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
        timeVisible: false,
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

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };
    
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, []);

  // 2. Update Data when it changes
  useEffect(() => {
    if (!chartRef.current || !candlestickSeriesRef.current) return;

    const candles: CandlestickData[] = [];
    const sma20: LineData[] = [];
    const sma50: LineData[] = [];
    const markers: SeriesMarker<any>[] = [];

    let prevSig = "HOLD";
    data.forEach(d => {
      let time = d.date;
      // Convert full ISO strings to UNIX timestamp in seconds for intraday
      if (typeof time === 'string' && time.includes('T')) {
        time = Math.floor(new Date(time).getTime() / 1000) as any;
      }
      
      candles.push({ time, open: d.open, high: d.high, low: d.low, close: d.close });
      
      if (d.sma20 != null) sma20.push({ time, value: d.sma20 });
      if (d.sma50 != null) sma50.push({ time, value: d.sma50 });

      // Support activeSignal in markers
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
          prevSig = "HOLD"; // reset
      }
    });

    candlestickSeriesRef.current.setData(candles);
    sma20SeriesRef.current.setData(sma20);
    sma50SeriesRef.current.setData(sma50);
    createSeriesMarkers(candlestickSeriesRef.current, markers);

    if (supportLineRef.current) {
      candlestickSeriesRef.current.removePriceLine(supportLineRef.current);
      supportLineRef.current = null;
    }
    if (levels?.support) {
      supportLineRef.current = candlestickSeriesRef.current.createPriceLine({
        price: levels.support,
        color: T.buy,
        lineWidth: 1,
        lineStyle: 2, // dashed
        axisLabelVisible: true,
        title: 'Support',
      });
    }

    if (resistanceLineRef.current) {
      candlestickSeriesRef.current.removePriceLine(resistanceLineRef.current);
      resistanceLineRef.current = null;
    }
    if (levels?.resistance) {
      resistanceLineRef.current = candlestickSeriesRef.current.createPriceLine({
        price: levels.resistance,
        color: T.sell,
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: 'Resistance',
      });
    }

    if (trailingStopLineRef.current) {
      candlestickSeriesRef.current.removePriceLine(trailingStopLineRef.current);
      trailingStopLineRef.current = null;
    }
    if (levels?.trailingStop) {
      trailingStopLineRef.current = candlestickSeriesRef.current.createPriceLine({
        price: levels.trailingStop,
        color: T.brass,
        lineWidth: 1,
        lineStyle: 3, // sparse dotted
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

  return (
    <div style={{ height: 280, marginTop: 12 }}>
      <div ref={chartContainerRef} style={{ width: '100%', height: '100%' }} />
      <div className="flex gap-4 mt-2 font-mono text-[10px] text-ink-muted flex-wrap">
        <span><span className="text-brass">&#9679;</span> SMA 20</span>
        <span><span style={{ color: "#6C7A93" }}>&#9679;</span> SMA 50</span>
        <span><span className="text-buy">&#9679;</span> Buy signal</span>
        <span><span className="text-sell">&#9679;</span> Sell signal</span>
        <span><span className="text-buy" style={{ opacity: 0.6 }}>─ ─</span> Support</span>
        <span><span className="text-sell" style={{ opacity: 0.6 }}>─ ─</span> Resistance</span>
      </div>
    </div>
  );
}
