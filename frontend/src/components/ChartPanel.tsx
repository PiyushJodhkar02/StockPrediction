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

    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: T.buy,
      downColor: T.sell,
      borderVisible: false,
      wickUpColor: T.buy,
      wickDownColor: T.sell,
    });

    const sma20Series = chart.addSeries(LineSeries, {
      color: T.brass,
      lineWidth: 2,
      crosshairMarkerVisible: false,
    });

    const sma50Series = chart.addSeries(LineSeries, {
      color: "#6C7A93",
      lineWidth: 2,
      lineStyle: 2,
      crosshairMarkerVisible: false,
    });

    // Map data
    const candles: CandlestickData[] = [];
    const sma20: LineData[] = [];
    const sma50: LineData[] = [];
    const markers: SeriesMarker<any>[] = [];

    data.forEach(d => {
      const time = d.date;
      candles.push({ time, open: d.open, high: d.high, low: d.low, close: d.close });
      
      if (d.sma20 != null) sma20.push({ time, value: d.sma20 });
      if (d.sma50 != null) sma50.push({ time, value: d.sma50 });

      if (d.signal === "BUY") {
        markers.push({ time, position: 'belowBar', color: T.buy, shape: 'arrowUp', text: 'BUY' });
      } else if (d.signal === "SELL") {
        markers.push({ time, position: 'aboveBar', color: T.sell, shape: 'arrowDown', text: 'SELL' });
      }
    });

    candlestickSeries.setData(candles);
    sma20Series.setData(sma20);
    sma50Series.setData(sma50);
    createSeriesMarkers(candlestickSeries, markers);

    // ── Price level reference lines ──
    if (levels?.support) {
      candlestickSeries.createPriceLine({
        price: levels.support,
        color: T.buy,
        lineWidth: 1,
        lineStyle: 2, // dashed
        axisLabelVisible: true,
        title: 'Support',
      });
    }
    if (levels?.resistance) {
      candlestickSeries.createPriceLine({
        price: levels.resistance,
        color: T.sell,
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: 'Resistance',
      });
    }
    if (levels?.trailingStop) {
      candlestickSeries.createPriceLine({
        price: levels.trailingStop,
        color: T.brass,
        lineWidth: 1,
        lineStyle: 3, // sparse dotted
        axisLabelVisible: true,
        title: 'Trail Stop',
      });
    }

    chart.timeScale().fitContent();

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
