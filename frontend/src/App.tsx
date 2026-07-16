import { useState, useEffect } from "react";
import { Radio, CircleDot, Search, X, NotebookPen, TrendingUp, TrendingDown, Minus } from "lucide-react";
import ChartPanel from "./components/ChartPanel";
import AnalystNote from "./components/AnalystNote";
import PriceLevelCard from "./components/PriceLevelCard";
import TradeCard from "./components/TradeCard";

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
  const [notes, setNotes] = useState<string>('');
  const [bottomTab, setBottomTab] = useState<'trade'|'levels'|'backtest'>('trade');
  
  // Simulation Mode states
  const [globalMode, setGlobalMode] = useState<'live'|'simulation'>('live');
  const [simulationDate, setSimulationDate] = useState<string>(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().split('T')[0];
  });

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    localStorage.setItem("pinnedSymbols", JSON.stringify(symbols));
  }, [symbols]);

  useEffect(() => {
    if (!searchQuery) { setSearchResults([]); return; }
    const t = setTimeout(() => {
      setIsSearching(true);
      fetch(`${import.meta.env.VITE_API_URL}/api/search?q=${searchQuery}`)
        .then(r => r.json()).then(d => setSearchResults(d))
        .catch(console.error).finally(() => setIsSearching(false));
    }, 400);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const addSymbol = (sym: any) => {
    if (!symbols.find(s => s.sym === sym.sym)) {
      const n = [...symbols, sym]; setSymbols(n); setSymbolIdx(n.length - 1);
    } else { setSymbolIdx(symbols.findIndex(s => s.sym === sym.sym)); }
    setSearchQuery(""); setSearchResults([]);
  };

  const removeSymbol = (idx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const n = symbols.filter((_, i) => i !== idx); setSymbols(n);
    if (symbolIdx >= n.length) setSymbolIdx(Math.max(0, n.length - 1));
    else if (idx < symbolIdx) setSymbolIdx(symbolIdx - 1);
  };

  const loadData = async (sym: string, bg = false, modeToUse = globalMode, dateToUse = simulationDate) => {
    if (!bg) setLoading(true);
    
    const qs = modeToUse === 'simulation' && dateToUse ? `?date=${dateToUse}` : '';
    
    try {
      const dRes = await fetch(`${import.meta.env.VITE_API_URL}/api/dashboard/${sym}${qs}`);
      if (!dRes.ok) throw new Error("Dashboard data failed");
      const data = await dRes.json();
      
      setQuotes(data.quotes);
      setSignal(data.signal);
      setBacktest(data.backtest);
      setLevels(data.levels);

      setDataSource("live");
    } catch { setDataSource("error"); }
    finally { if (!bg) setLoading(false); }
  };

  useEffect(() => {
    if (symbols.length > 0) {
      const sym = symbols[symbolIdx].sym;
      loadData(sym, false, globalMode, simulationDate);
      setNotes(localStorage.getItem(`notes:${sym}`) ?? '');
      
      if (globalMode === 'live') {
        const id = setInterval(() => loadData(sym, true, 'live'), 15000);
        return () => clearInterval(id);
      }
    }
  }, [symbols, symbolIdx, globalMode, simulationDate]);

  const preset = symbols[symbolIdx];
  
  // If we are globally in simulation, the card mode is forced to simulation (hiding position features)
  const cardMode = globalMode === 'simulation' ? 'simulation' : 'live';

  const handleNotesChange = (val: string) => {
    setNotes(val);
    if (preset?.sym) localStorage.setItem(`notes:${preset.sym}`, val);
  };

  const rangeDays: Record<string, number> = { '1M': 22, '3M': 65, '6M': 130, '1Y': 252, '3Y': 756, '5Y': 1260 };
  const chartData = quotes.slice(-(rangeDays[range] ?? 252));
  const latest = quotes[quotes.length - 1];
  const prev = quotes[quotes.length - 2];

  if (!preset) return <div className="p-8 font-mono text-ink-muted">Loading...</div>;
  const isStale = latest && latest._stale;

  // Signal display config
  const signalCfg = {
    BUY:  { color: T.buy,  bg: '#4C9A7822', Icon: TrendingUp,   label: 'BUY'  },
    SELL: { color: T.sell, bg: '#C1543B22', Icon: TrendingDown,  label: 'SELL' },
    HOLD: { color: T.inkMuted, bg: '#8A93A622', Icon: Minus,     label: 'HOLD' },
  };
  const sCfg = signal ? (signalCfg[signal.signal as keyof typeof signalCfg] ?? signalCfg.HOLD) : signalCfg.HOLD;

  return (
    <div className="bg-bg min-h-screen text-ink font-body" style={{ padding: '16px 20px' }}>
      {globalMode === 'simulation' && (
        <div className="fixed bottom-6 right-6 z-50 bg-brass text-bg font-display font-extrabold text-[11px] px-3 py-1.5 rounded uppercase tracking-widest shadow-[0_4px_12px_rgba(201,138,44,0.4)] pointer-events-none border border-brass/50">
          Simulation Mode Active
        </div>
      )}

      {/* ── COMPACT HEADER ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        {/* Brand */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-2 h-2 rounded-sm bg-brass" />
          <span className="font-display font-extrabold text-xl tracking-tight">Signal Ledger</span>
          <span className="font-mono text-[9px] text-ink-muted border border-line rounded px-1.5 py-0.5 ml-1 uppercase tracking-wider">Decision Support</span>
        </div>

        {/* Right: data status + search */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className={`flex items-center gap-1.5 font-mono text-[10px] border rounded-full py-0.5 px-2.5 ${
            dataSource === "live" && !isStale ? "text-buy border-buy/50 bg-buy-dim" :
            isStale ? "text-brass border-brass/50 bg-brass/10" :
            "text-sell border-sell/50 bg-sell-dim"}`}>
            <Radio size={10} />
            {loading ? "Fetching..." : dataSource === "error" ? "API Error" : isStale ? "Stale" : "Live data"}
          </div>

          {/* Search */}
          <div className="relative">
            <div className="flex items-center bg-panel border border-line rounded-lg px-2.5 py-1 focus-within:border-brass transition-colors">
              <Search size={12} className="text-ink-muted mr-1.5" />
              <input
                type="text" placeholder="Search symbol…"
                className="bg-transparent border-none outline-none text-xs text-ink w-[140px]"
                value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
            {searchQuery && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-panel-raised border border-line rounded-lg shadow-xl overflow-hidden z-50">
                {isSearching ? (
                  <div className="p-2.5 text-xs text-ink-muted font-mono">Searching…</div>
                ) : searchResults.length > 0 ? searchResults.map(r => (
                  <button key={r.sym} onClick={() => addSymbol(r)}
                    className="w-full text-left px-3 py-2 hover:bg-panel transition-colors flex justify-between items-center">
                    <span className="font-mono text-xs text-ink">{r.sym}</span>
                    <span className="text-[10px] text-ink-muted truncate ml-2">{r.name}</span>
                  </button>
                )) : <div className="p-2.5 text-xs text-ink-muted font-mono">No results</div>}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── SYMBOL TABS + MODE ─────────────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {/* Symbol tabs */}
        {symbols.map((s, i) => (
          <button key={s.sym} onClick={() => setSymbolIdx(i)}
            className={`flex items-center gap-1.5 font-mono text-[11px] font-medium py-1 pl-2.5 pr-1.5 rounded border transition-colors ${
              i === symbolIdx ? 'border-brass bg-[#C98A2C18] text-brass' : 'border-line bg-panel text-ink-muted hover:bg-panel-raised'}`}>
            <span>{s.sym}</span>
            <span onClick={e => removeSymbol(i, e)}
              className={`p-0.5 rounded transition-colors ${i === symbolIdx ? 'text-brass/70 hover:text-brass' : 'text-ink-muted/40 hover:text-ink-muted'}`}>
              <X size={10} />
            </span>
          </button>
        ))}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Live / Sim toggle */}
        <div className="flex items-center gap-1.5 bg-panel border border-line rounded-lg p-0.5">
          <button
            onClick={() => setGlobalMode('live')}
            className={`font-mono text-[10px] font-semibold px-2.5 py-1 rounded-md transition-colors flex items-center gap-1.5 ${
              globalMode === 'live' ? 'bg-buy-dim text-buy' : 'text-ink-muted hover:text-ink'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${globalMode === 'live' ? 'bg-buy' : 'bg-ink-muted/40'}`} />
            Live
          </button>
          <button
            onClick={() => setGlobalMode('simulation')}
            className={`font-mono text-[10px] font-semibold px-2.5 py-1 rounded-md transition-colors flex items-center gap-1.5 ${
              globalMode === 'simulation' ? 'bg-[#C98A2C18] text-brass' : 'text-ink-muted hover:text-ink'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${globalMode === 'simulation' ? 'bg-brass' : 'bg-ink-muted/40'}`} />
            Sim
          </button>
          
          {globalMode === 'simulation' && (
            <input
              type="date"
              value={simulationDate}
              max={new Date().toISOString().split('T')[0]}
              onChange={(e) => setSimulationDate(e.target.value)}
              className="bg-panel-raised border border-line/60 rounded outline-none text-ink text-[10px] font-mono px-1.5 py-0.5 ml-1"
            />
          )}
        </div>
      </div>

      {/* ── ERROR STATE ────────────────────────────────────────────────── */}
      {dataSource === "error" && !loading && !latest && (
        <div className="bg-panel border border-line rounded-xl p-8 text-center">
          <div className="text-sell font-mono mb-3 text-sm">Unable to load data for {preset.sym}</div>
          <button onClick={() => loadData(preset.sym)} className="border border-line rounded px-4 py-2 hover:bg-panel-raised text-sm transition-colors">
            Retry
          </button>
        </div>
      )}

      {/* ── MAIN GRID ──────────────────────────────────────────────────── */}
      {!loading && latest && signal && (
        <>
          <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 268px' }}>

            {/* LEFT: Chart + mini indicators + Notes */}
            <div className="flex flex-col gap-3 min-w-0">

              {/* Price header */}
              <div className="flex items-baseline justify-between">
                <div>
                  <span className="font-display font-extrabold text-lg">{preset.name}</span>
                  <span className="font-mono text-xs text-ink-muted ml-2">{preset.sym}</span>
                </div>
                <div className="text-right">
                  <span className="font-mono text-2xl font-semibold">&#8377;{latest.close.toFixed(2)}</span>
                  <span className={`font-mono text-xs ml-2 ${latest.close >= prev?.close ? 'text-buy' : 'text-sell'}`}>
                    {prev ? (((latest.close - prev.close) / prev.close) * 100).toFixed(2) : "0.00"}%
                  </span>
                </div>
              </div>

              {/* Chart card */}
              <div className="bg-panel border border-line rounded-xl p-4">
                {/* Range selector */}
                <div className="flex gap-1 mb-2">
                  {(['1M','3M','6M','1Y','3Y','5Y'] as const).map(r => (
                    <button key={r} onClick={() => setRange(r)}
                      className={`font-mono text-[10px] px-2 py-0.5 rounded transition-colors ${
                        range === r ? 'bg-brass text-bg font-semibold' : 'text-ink-muted hover:text-ink hover:bg-panel-raised'}`}>
                      {r}
                    </button>
                  ))}
                </div>
                <ChartPanel data={chartData} levels={levels ? { support: levels.support, resistance: levels.resistance } : undefined} />
              </div>

              {/* RSI + MACD mini row */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-panel border border-line rounded-xl p-3">
                  <div className="font-mono text-[10px] text-ink-muted mb-1.5 tracking-wide">RSI (14)</div>
                  <div className="h-[80px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={chartData} margin={{ top: 2, right: 2, left: -24, bottom: 0 }}>
                        <YAxis domain={[0, 100]} tick={{ fill: T.inkMuted, fontSize: 8, fontFamily: 'monospace' }} axisLine={false} tickLine={false} />
                        <XAxis dataKey="date" hide />
                        <ReferenceLine y={70} stroke={T.sell} strokeDasharray="3 3" strokeOpacity={0.5} />
                        <ReferenceLine y={30} stroke={T.buy} strokeDasharray="3 3" strokeOpacity={0.5} />
                        <Line type="monotone" dataKey="rsi" stroke={T.brass} strokeWidth={1.3} dot={false} />
                        <Tooltip content={<CustomTooltip />} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className="bg-panel border border-line rounded-xl p-3">
                  <div className="font-mono text-[10px] text-ink-muted mb-1.5 tracking-wide">MACD</div>
                  <div className="h-[80px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={chartData} margin={{ top: 2, right: 2, left: -24, bottom: 0 }}>
                        <YAxis tick={{ fill: T.inkMuted, fontSize: 8, fontFamily: 'monospace' }} axisLine={false} tickLine={false} />
                        <XAxis dataKey="date" hide />
                        <ReferenceLine y={0} stroke={T.line} />
                        <Bar dataKey="macdHist" name="Hist">
                          {chartData.map((d, i) => <Cell key={i} fill={d.macdHist >= 0 ? T.buy : T.sell} />)}
                        </Bar>
                        <Tooltip content={<CustomTooltip />} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* ── MOVED TABS: Trade Card | Price Levels | Backtest ─────── */}
              <div className="mt-1">
                {/* Tab bar */}
                <div className="flex gap-1 mb-2">
                  {([
                    { key: 'trade',   label: 'Trade Card' },
                    { key: 'levels',  label: 'Price Levels' },
                    { key: 'backtest', label: 'Backtest' },
                  ] as const).map(t => (
                    <button key={t.key} onClick={() => setBottomTab(t.key)}
                      className={`font-mono text-[10px] px-3 py-1.5 rounded border transition-colors ${
                        bottomTab === t.key
                          ? 'border-brass text-brass bg-[#C98A2C18]'
                          : 'border-line text-ink-muted hover:bg-panel'}`}>
                      {t.label}
                    </button>
                  ))}
                </div>

                {/* Tab panels */}
                {bottomTab === 'trade' && levels && (
                  <TradeCard levels={levels} signal={signal} mode={cardMode} symbol={preset.sym} />
                )}

                {bottomTab === 'levels' && levels && (
                  <PriceLevelCard symbol={preset.sym} levels={levels} signal={signal} mode={cardMode} />
                )}

                {bottomTab === 'backtest' && backtest && (
                  <div className="bg-panel border border-line rounded-xl p-5">
                    <div className="font-display font-extrabold text-[14px] mb-3">
                      Backtest &mdash; strategy vs. buy &amp; hold
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                      {[
                        { label: "Strategy return", val: `${backtest.strategyReturn >= 0 ? "+" : ""}${backtest.strategyReturn.toFixed(1)}%`, c: backtest.strategyReturn >= 0 ? T.buy : T.sell },
                        { label: "Buy & hold",      val: `${backtest.buyHold >= 0 ? "+" : ""}${backtest.buyHold.toFixed(1)}%`,       c: T.inkMuted },
                        { label: "Win rate",         val: `${backtest.winRate}%`,      c: T.ink },
                        { label: "Trades",           val: backtest.trades.length,      c: T.ink },
                      ].map((s, i) => (
                        <div key={i} className="bg-panel-raised rounded-lg py-2.5 px-3">
                          <div className="font-mono text-[9px] text-ink-muted mb-1">{s.label}</div>
                          <div className="font-mono text-base font-semibold" style={{ color: s.c }}>{s.val}</div>
                        </div>
                      ))}
                    </div>
                    <div className="h-[80px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={backtest.curve} margin={{ top: 2, right: 4, left: -20, bottom: 0 }}>
                          <YAxis tick={{ fill: T.inkMuted, fontSize: 8, fontFamily: 'monospace' }} axisLine={false} tickLine={false} domain={["auto","auto"]} />
                          <XAxis dataKey="date" hide />
                          <ReferenceLine y={100} stroke={T.line} />
                          <Area type="monotone" dataKey="equity" stroke={T.brass} fill="#C98A2C20" strokeWidth={1.4} />
                          <Tooltip content={<CustomTooltip />} />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="font-mono text-[9px] text-ink-muted mt-1.5">
                      Equity curve, base 100 &middot; no fees, no slippage, no position sizing applied
                    </div>
                    <div className="mt-2 bg-sell-dim border border-sell/20 rounded px-2.5 py-1.5 text-[10px] text-sell">
                      <strong>Note:</strong> Backtest results are hypothetical — real returns will differ.
                    </div>
                  </div>
                )}

                {bottomTab === 'backtest' && !backtest && (
                  <div className="bg-panel border border-line rounded-xl p-6 text-center font-mono text-xs text-ink-muted">
                    Not enough data for backtest.
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT: Consolidated Signal & Analysis */}
            <div className="flex flex-col gap-3">
              
              {/* 1. Signal & Reasoning Card */}
              <div className="bg-panel border border-line rounded-xl p-4">
                <div className="font-mono text-[9px] text-ink-muted uppercase tracking-widest mb-3">Current Signal</div>
                
                {/* Signal Badge */}
                <div
                  className="flex items-center gap-2 rounded-lg px-3 py-2.5 mb-4"
                  style={{ color: sCfg.color, background: sCfg.bg, border: `1px solid ${sCfg.color}44` }}
                >
                  <sCfg.Icon size={18} strokeWidth={2.5} />
                  <span className="font-display font-extrabold text-xl tracking-wide">{signal.signal}</span>
                </div>

                {/* Rule Agreement & Win Rate */}
                <div className="grid grid-cols-2 gap-4 mb-4 pb-4 border-b border-line border-dashed">
                  <div>
                    <div className="font-mono text-[9px] text-ink-muted mb-1">Rule Agreement</div>
                    <div className="font-mono text-[11px] font-semibold">{Math.abs(signal.score)}/6 indicators ({signal.confidence}%)</div>
                    <div className="h-1 bg-panel-raised rounded mt-1.5 overflow-hidden">
                      <div className="h-full rounded transition-all" style={{ width: `${signal.confidence}%`, background: sCfg.color }} />
                    </div>
                  </div>
                  {signal.historicalWinRate != null && signal.historicalWinRate > 0 && (
                    <div>
                      <div className="font-mono text-[9px] text-ink-muted mb-1">Win Rate</div>
                      <div className="font-mono text-[11px] font-semibold" style={{ color: signal.historicalWinRate >= 50 ? T.buy : T.sell }}>
                        {signal.historicalWinRate.toFixed(1)}%
                      </div>
                    </div>
                  )}
                </div>

                {/* Reasoning Rules */}
                {signal?.rules && (
                  <div>
                    <div className="font-mono text-[9px] text-ink-muted uppercase tracking-widest mb-2.5">Reasoning Ledger</div>
                    <div className="flex flex-col gap-0">
                      {signal.rules.map((r: any, i: number) => (
                        <div key={i} className="flex justify-between items-start py-1.5">
                          <div className="font-body text-[11px] text-ink leading-tight">{r.label}</div>
                          <div className="font-mono text-[10px] font-medium ml-2 shrink-0"
                            style={{ color: r.pts > 0 ? T.buy : r.pts < 0 ? T.sell : T.inkMuted }}>
                            {r.pts > 0 ? "+" : ""}{r.pts}
                          </div>
                        </div>
                      ))}
                      <div className="flex justify-between pt-2 mt-2 border-t border-line">
                        <span className="font-mono text-[9px] text-ink-muted uppercase">Net Score</span>
                        <span className="font-mono font-bold text-[11px] text-brass">{signal.score > 0 ? "+" : ""}{signal.score} / 6</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 2. Unified Notes Card (Analyst + Personal) */}
              <div className="bg-panel border border-line rounded-xl flex flex-col overflow-hidden">
                <AnalystNote symbol={preset.sym} />
                
                <div className="border-t border-line p-4 bg-panel-raised/30">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <NotebookPen size={11} className="text-brass" />
                      <span className="font-mono text-[10px] text-ink-muted uppercase tracking-wider">Your Notes</span>
                    </div>
                    <span className="font-mono text-[8px] text-ink-muted border border-line/60 rounded px-1 py-px">Local only</span>
                  </div>
                  <textarea
                    className="w-full bg-bg border border-line rounded-lg px-2.5 py-2 font-mono text-[11px] text-ink outline-none focus:border-brass transition-colors resize-none leading-relaxed"
                    rows={3}
                    placeholder={`Observations on ${preset.sym}…`}
                    value={notes}
                    onChange={e => handleNotesChange(e.target.value)}
                  />
                </div>
              </div>

              {/* Disclaimer */}
              <div className="flex gap-1.5 items-start px-3 py-2 bg-[#C98A2C08] border border-brass/25 rounded-lg">
                <CircleDot size={11} className="text-brass mt-0.5 shrink-0" />
                <div className="font-mono text-[9px] text-brass leading-relaxed">
                  Rules-based decision support. Every signal traces to a named indicator — not a prediction.
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="font-mono text-ink-muted text-xs animate-pulse">Loading {preset.sym}…</div>
        </div>
      )}
    </div>
  );
}
