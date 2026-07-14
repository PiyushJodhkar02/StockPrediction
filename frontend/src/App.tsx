import { useState, useEffect } from "react";
import { Radio, CircleDot, Search, X } from "lucide-react";
import ChartPanel from "./components/ChartPanel";
import ReasoningLedger from "./components/ReasoningLedger";
import AnalystNote from "./components/AnalystNote";
import PriceLevelCard from "./components/PriceLevelCard";

import {
  ComposedChart, Line, Bar, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Cell
} from "recharts";

const defaultPresets = [
  { sym: "AAPL", name: "Apple Inc." },
  { sym: "TSLA", name: "Tesla Inc." },
  { sym: "RELIANCE.NS", name: "Reliance Industries" },
  { sym: "TCS.NS", name: "Tata Consultancy Svcs" },
];

const T = { panelRaised: "#1A2740", line: "#2A3B57", ink: "#E8E2D4", inkMuted: "#8A93A6", brass: "#C98A2C", buy: "#4C9A78", sell: "#C1543B" };

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="bg-panel-raised border border-line rounded-md py-2 px-3 font-mono text-[11px] text-ink">
      <div className="text-ink-muted mb-1">{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ color: p.color }}>
          {p.name}: {typeof p.value === "number" ? p.value.toFixed(2) : p.value}
        </div>
      ))}
    </div>
  );
}

export default function App() {
  const [symbols, setSymbols] = useState<any[]>(() => {
    const saved = localStorage.getItem("pinnedSymbols");
    return saved ? JSON.parse(saved) : defaultPresets;
  });
  
  const [symbolIdx, setSymbolIdx] = useState(0);
  const [quotes, setQuotes] = useState<any[]>([]);
  const [signal, setSignal] = useState<any>(null);
  const [backtest, setBacktest] = useState<any>(null);
  const [levels, setLevels] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [dataSource, setDataSource] = useState("live");
  const [range, setRange] = useState<'1M'|'3M'|'6M'|'1Y'|'3Y'|'5Y'>('1Y');
  
  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    localStorage.setItem("pinnedSymbols", JSON.stringify(symbols));
  }, [symbols]);

  useEffect(() => {
    if (!searchQuery) {
      setSearchResults([]);
      return;
    }
    const delayDebounceFn = setTimeout(() => {
      setIsSearching(true);
      fetch(`${import.meta.env.VITE_API_URL}/api/search?q=${searchQuery}`)
        .then(res => res.json())
        .then(data => setSearchResults(data))
        .catch(console.error)
        .finally(() => setIsSearching(false));
    }, 400);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery]);

  const addSymbol = (sym: any) => {
    if (!symbols.find(s => s.sym === sym.sym)) {
      const newSymbols = [...symbols, sym];
      setSymbols(newSymbols);
      setSymbolIdx(newSymbols.length - 1);
    } else {
      setSymbolIdx(symbols.findIndex(s => s.sym === sym.sym));
    }
    setSearchQuery("");
    setSearchResults([]);
  };

  const removeSymbol = (idx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const newSymbols = symbols.filter((_, i) => i !== idx);
    setSymbols(newSymbols);
    if (symbolIdx >= newSymbols.length) {
      setSymbolIdx(Math.max(0, newSymbols.length - 1));
    } else if (idx < symbolIdx) {
      setSymbolIdx(symbolIdx - 1);
    }
  };

  const loadData = async (sym: string, isBackgroundRefresh = false) => {
    if (!isBackgroundRefresh) setLoading(true);
    try {
      const qRes = await fetch(`${import.meta.env.VITE_API_URL}/api/quotes/${sym}`);
      if (!qRes.ok) throw new Error("Quotes failed");
      setQuotes(await qRes.json());

      const sRes = await fetch(`${import.meta.env.VITE_API_URL}/api/signal/${sym}`);
      if (!sRes.ok) throw new Error("Signal failed");
      setSignal(await sRes.json());

      const bRes = await fetch(`${import.meta.env.VITE_API_URL}/api/backtest/${sym}`);
      if (bRes.ok) setBacktest(await bRes.json());
      else setBacktest(null);

      const lRes = await fetch(`${import.meta.env.VITE_API_URL}/api/levels/${sym}`);
      if (lRes.ok) setLevels(await lRes.json());
      else setLevels(null);

      setDataSource("live");
    } catch (e) {
      console.error(e);
      setDataSource("error");
    } finally {
      if (!isBackgroundRefresh) setLoading(false);
    }
  };

  useEffect(() => {
    if (symbols.length > 0) {
      const sym = symbols[symbolIdx].sym;
      loadData(sym);

      // Auto-refresh every 15 seconds for real-time updates without full UI unmount
      const intervalId = setInterval(() => {
        loadData(sym, true);
      }, 15000);

      return () => clearInterval(intervalId);
    }
  }, [symbols, symbolIdx]);

  const preset = symbols[symbolIdx];

  // Map range label → number of trading days
  const rangeDays: Record<string, number> = {
    '1M': 22, '3M': 65, '6M': 130, '1Y': 252, '3Y': 756, '5Y': 1260,
  };
  const chartData = quotes.slice(-(rangeDays[range] ?? 252));
  const latest = quotes[quotes.length - 1];
  const prev = quotes[quotes.length - 2];

  if (!preset) return <div className="p-8 font-mono text-ink-muted">Loading configuration...</div>;

  const isStale = latest && latest._stale;

  return (
    <div className="bg-bg min-h-screen text-ink font-body py-7 px-6">
      {/* Header */}
      <div className="flex justify-between items-start mb-6 flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-2.5 h-2.5 rounded-sm bg-brass" />
            <span className="font-mono text-[11px] tracking-[2px] text-ink-muted uppercase">
              Decision Support Prototype
            </span>
          </div>
          <h1 className="font-display font-extrabold text-3xl m-0 mt-1.5 tracking-[-0.5px]">
            Signal Ledger
          </h1>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="relative">
            <div className="flex items-center bg-panel border border-line rounded-lg px-3 py-1.5 focus-within:border-brass transition-colors">
              <Search size={14} className="text-ink-muted mr-2" />
              <input 
                type="text" 
                placeholder="Search symbol..." 
                className="bg-transparent border-none outline-none text-sm text-ink w-[180px]"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
            {searchQuery && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-panel-raised border border-line rounded-lg shadow-lg overflow-hidden z-50">
                {isSearching ? (
                  <div className="p-3 text-sm text-ink-muted font-mono">Searching...</div>
                ) : searchResults.length > 0 ? (
                  searchResults.map(res => (
                    <button key={res.sym} onClick={() => addSymbol(res)} className="w-full text-left px-3 py-2 hover:bg-panel transition-colors flex justify-between items-center group">
                      <span className="font-mono text-sm text-ink">{res.sym}</span>
                      <span className="text-xs text-ink-muted truncate ml-2">{res.name}</span>
                    </button>
                  ))
                ) : (
                  <div className="p-3 text-sm text-ink-muted font-mono">No results found</div>
                )}
              </div>
            )}
          </div>
          
          <div className={`flex items-center gap-1.5 font-mono text-[11px] border rounded-full py-1 px-3 ${
            dataSource === "live" && !isStale ? "text-buy border-buy/50 bg-buy-dim" : 
            isStale ? "text-brass border-brass/50 bg-brass/10" : 
            "text-sell border-sell/50 bg-sell-dim"}`}>
            <Radio size={12} />
            {loading ? "Fetching..." : 
             dataSource === "error" ? "API Error" : 
             isStale ? `Unable to load current data for ${preset?.sym}, showing last cached data` : 
             "Live market data"}
          </div>
        </div>
      </div>

      {/* Symbol picker */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {symbols.map((s, i) => (
          <button key={s.sym} onClick={() => setSymbolIdx(i)}
            className={`flex items-center gap-2 font-mono text-xs font-medium py-1.5 pl-3 pr-2 rounded-md cursor-pointer border transition-colors ${i === symbolIdx ? 'border-brass bg-[#C98A2C1A] text-brass' : 'border-line bg-panel text-ink-muted hover:bg-panel-raised'}`}>
            <span>{s.sym}</span>
            <span onClick={(e) => removeSymbol(i, e)} className={`p-0.5 rounded hover:bg-line/50 transition-colors ${i === symbolIdx ? 'text-brass hover:text-brass/80' : 'text-ink-muted/50 hover:text-ink-muted'}`}>
              <X size={12} />
            </span>
          </button>
        ))}
      </div>

      {dataSource === "error" && !loading && !latest && (
        <div className="bg-panel border border-line rounded-xl p-8 text-center mt-8">
          <div className="text-sell font-mono mb-3">Unable to load data for {preset.sym}</div>
          <button onClick={() => loadData(preset.sym)} className="border border-line rounded px-4 py-2 hover:bg-panel-raised text-sm transition-colors">
            Retry Connection
          </button>
        </div>
      )}

      {!loading && latest && signal && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5">
          {/* Left column */}
          <div className="flex flex-col gap-5 min-w-0">
            {/* Price header & Chart */}
            <div className="bg-panel border border-line rounded-xl p-5">
              <div className="flex justify-between items-baseline mb-1">
                <div>
                  <div className="font-display font-extrabold text-xl">{preset.name}</div>
                  <div className="font-mono text-xs text-ink-muted">{preset.sym}</div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-[26px] font-medium">
                    &#8377;{latest.close.toFixed(2)}
                  </div>
                  <div className={`font-mono text-xs ${latest.close >= prev?.close ? 'text-buy' : 'text-sell'}`}>
                    {prev ? (((latest.close - prev.close) / prev.close) * 100).toFixed(2) : "0.00"}% vs prior close
                  </div>
                </div>
              </div>
              {/* Range selector */}
              <div className="flex gap-1 mt-3 mb-1">
                {(['1M','3M','6M','1Y','3Y','5Y'] as const).map(r => (
                  <button
                    key={r}
                    onClick={() => setRange(r)}
                    className={`font-mono text-[10px] px-2 py-0.5 rounded transition-colors ${
                      range === r
                        ? 'bg-brass text-bg font-semibold'
                        : 'text-ink-muted hover:text-ink hover:bg-panel-raised'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
              <ChartPanel data={chartData} levels={levels ? { support: levels.support, resistance: levels.resistance } : undefined} />
            </div>

            {/* Price Levels — full width below chart */}
            {levels && (
              <PriceLevelCard symbol={preset.sym} levels={levels} signal={signal} />
            )}

            {/* RSI + MACD */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="bg-panel border border-line rounded-xl p-4">
                <div className="font-mono text-[11px] text-ink-muted mb-2 tracking-[1px]">RSI (14)</div>
                <div className="h-[110px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                      <YAxis domain={[0, 100]} tick={{ fill: T.inkMuted, fontSize: 9, fontFamily: 'monospace' }} axisLine={false} tickLine={false} />
                      <XAxis dataKey="date" hide />
                      <ReferenceLine y={70} stroke={T.sell} strokeDasharray="3 3" strokeOpacity={0.5} />
                      <ReferenceLine y={30} stroke={T.buy} strokeDasharray="3 3" strokeOpacity={0.5} />
                      <Line type="monotone" dataKey="rsi" stroke={T.brass} strokeWidth={1.4} dot={false} />
                      <Tooltip content={<CustomTooltip />} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="bg-panel border border-line rounded-xl p-4">
                <div className="font-mono text-[11px] text-ink-muted mb-2 tracking-[1px]">MACD histogram</div>
                <div className="h-[110px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                      <YAxis tick={{ fill: T.inkMuted, fontSize: 9, fontFamily: 'monospace' }} axisLine={false} tickLine={false} />
                      <XAxis dataKey="date" hide />
                      <ReferenceLine y={0} stroke={T.line} />
                      <Bar dataKey="macdHist" name="Histogram">
                        {chartData.map((d, i) => (
                          <Cell key={i} fill={d.macdHist >= 0 ? T.buy : T.sell} />
                        ))}
                      </Bar>
                      <Tooltip content={<CustomTooltip />} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Backtest */}
            {backtest && (
              <div className="bg-panel border border-line rounded-xl p-5">
                <div className="font-display font-extrabold text-[15px] mb-3.5">
                  Backtest &mdash; strategy vs. buy &amp; hold
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                  {[
                    { label: "Strategy return", val: `${backtest.strategyReturn >= 0 ? "+" : ""}${backtest.strategyReturn.toFixed(1)}%`, c: backtest.strategyReturn >= 0 ? T.buy : T.sell },
                    { label: "Buy & hold return", val: `${backtest.buyHold >= 0 ? "+" : ""}${backtest.buyHold.toFixed(1)}%`, c: T.inkMuted },
                    { label: "Win rate", val: `${backtest.winRate}%`, c: T.ink },
                    { label: "Trades", val: backtest.trades.length, c: T.ink },
                  ].map((s, i) => (
                    <div key={i} className="bg-panel-raised rounded-lg py-3 px-3.5">
                      <div className="font-mono text-[10px] text-ink-muted mb-1.5">{s.label}</div>
                      <div className="font-mono text-lg font-medium" style={{ color: s.c }}>{s.val}</div>
                    </div>
                  ))}
                </div>
                <div className="h-[90px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={backtest.curve} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                      <YAxis tick={{ fill: T.inkMuted, fontSize: 9, fontFamily: 'monospace' }} axisLine={false} tickLine={false} domain={["auto", "auto"]} />
                      <XAxis dataKey="date" hide />
                      <ReferenceLine y={100} stroke={T.line} />
                      <Area type="monotone" dataKey="equity" stroke={T.brass} fill="#C98A2C22" strokeWidth={1.5} />
                      <Tooltip content={<CustomTooltip />} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                <div className="font-mono text-[10px] text-ink-muted mt-2">
                  Equity curve, base 100 &middot; rules-based entries/exits only, no position sizing or costs applied
                </div>
                {/* FIX 3: Backtest Disclaimer */}
                <div className="mt-3 bg-sell-dim border border-sell/20 rounded p-2 text-[11px] text-sell">
                  <strong>Note:</strong> Backtest assumes no fees, no slippage, and full position sizing on every trade — real returns will differ.
                </div>
              </div>
            )}
          </div>

          {/* Right column */}
          <div className="flex flex-col">
            {signal?.rules && <ReasoningLedger analysis={signal} />}
            <AnalystNote symbol={preset.sym} />
            
            <div className="bg-[#C98A2C10] border border-brass/30 rounded-xl p-4 mt-5">
              <div className="flex gap-2 items-start">
                <CircleDot size={14} className="text-brass mt-0.5 shrink-0" />
                <div className="font-body text-[11.5px] text-ink-muted leading-relaxed">
                  This is a rules-based decision-support signal, not a guarantee of future performance.
                  Every point in the ledger traces back to a named indicator &mdash; nothing here is a hidden model.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
