import { useState, useEffect, useRef } from "react";
import { Radio, CircleDot, Search, X, NotebookPen, TrendingUp, TrendingDown, Minus, Zap } from "lucide-react";
import ChartPanel from "./components/ChartPanel";
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
  const [range, setRange] = useState<'1D'|'1W'|'1M'|'3M'|'6M'|'1Y'|'3Y'|'5Y'>('1Y');
  const [notes, setNotes] = useState<string>('');
  const [bottomTab, setBottomTab] = useState<'analyst'|'levels'|'backtest'>('analyst');
  const [analystNoteTrigger, setAnalystNoteTrigger] = useState(0);

  // CALL state: set once when simulation starts (or from live levels)
  const [callState, setCallState] = useState<{ status?: string; entry: number|null; target: number|null; stopLoss: number|null; stopLossStatus?: 'active'|'hit'|null } | null>(null);
  
  // Simulation Mode states
  const [globalMode, setGlobalMode] = useState<'live'|'simulation'>('live');
  const [simulationDate, setSimulationDate] = useState<string>(() => {
    // Return today's date in local time zone (YYYY-MM-DD)
    const d = new Date();
    const offset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - offset).toISOString().split('T')[0];
  });

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Intraday Playback state
  const [intradayQuotes, setIntradayQuotes] = useState<any[]>([]);
  const [playbackIndex, setPlaybackIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  
  // Live Intraday state
  const [liveIntraday, setLiveIntraday] = useState<any[]>([]);

  useEffect(() => {
    let id: any;
    if (isPlaying && intradayQuotes.length > 0) {
      id = setInterval(() => {
        setPlaybackIndex(prev => {
          if (prev >= intradayQuotes.length - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, 500); // 500ms per minute tick
    }
    return () => clearInterval(id);
  }, [isPlaying, intradayQuotes]);

  // Live mode: refresh analyst note once every 60s (unchanged)
  useEffect(() => {
    if (globalMode === 'simulation') return;
    const id = setInterval(() => setAnalystNoteTrigger(Date.now()), 60000);
    return () => clearInterval(id);
  }, [globalMode]);

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
    try {
      const qs = modeToUse === 'simulation' && dateToUse ? `?date=${dateToUse}&t=${Date.now()}` : `?t=${Date.now()}`;
      const dRes = await fetch(`${import.meta.env.VITE_API_URL}/api/dashboard/${sym}${qs}`, { cache: 'no-store' });
      if (!dRes.ok) throw new Error("API Error");
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
      setCallState(null); // reset CALL when switching symbol/mode
      
      if (globalMode === 'live') {
        const id = setInterval(() => loadData(sym, true, 'live'), 15000);
        return () => clearInterval(id);
      }
    }
  }, [symbols, symbolIdx, globalMode, simulationDate]);

  // Track the active signal during simulation so we can fetch a new AI prediction when it changes
  const prevSignalRef = useRef<string | null>(null);
  
  // We need to derive activeSignal early here so the hook can use it.
  const currentActiveSignal = (() => {
    if (globalMode === 'simulation' && intradayQuotes.length > 0) {
      const q = intradayQuotes.slice(0, playbackIndex + 1);
      return q[q.length - 1]?.signalData?.signal ?? null;
    } else if (globalMode === 'live' && liveIntraday.length > 0) {
      return liveIntraday[liveIntraday.length - 1]?.signalData?.signal ?? null;
    }
    return signal?.signal ?? null;
  })();

  useEffect(() => {
    if (currentActiveSignal) {
      // If signal changed during active playback/live, request a new prediction
      if (prevSignalRef.current !== null && prevSignalRef.current !== currentActiveSignal) {
        setCallState({
          status: 'loading',
          entry: levels?.buyAbove ?? levels?.entryZone?.upper ?? latest?.close ?? null,
          target: levels?.target1 ?? null,
          stopLoss: levels?.stopLoss ?? null,
          stopLossStatus: levels?.stopLossStatus ?? null
        });
        setAnalystNoteTrigger(Date.now());
      }
      prevSignalRef.current = currentActiveSignal;
    }
  }, [currentActiveSignal, levels]);


  useEffect(() => {
    const fetchLiveIntraday = async (r: string, sym: string) => {
      try {
        const dRes = await fetch(`${import.meta.env.VITE_API_URL}/api/dashboard/${sym}/live-intraday?range=${r}&t=${Date.now()}`, { cache: 'no-store' });
        if (!dRes.ok) throw new Error("Live Intraday failed");
        const data = await dRes.json();
        setLiveIntraday(data.quotes || []);
      } catch (e) {
        console.error(e);
        setLiveIntraday([]);
      }
    };

    if (globalMode === 'live' && (range === '1D' || range === '1W') && symbols[symbolIdx]) {
      fetchLiveIntraday(range, symbols[symbolIdx].sym);
    }
  }, [range, globalMode, symbolIdx, symbols]);

  const preset = symbols[symbolIdx];
  
  // If we are globally in simulation, the card mode is forced to simulation (hiding position features)
  const cardMode = globalMode === 'simulation' ? 'simulation' : 'live';

  const handleNotesChange = (val: string) => {
    setNotes(val);
    if (preset?.sym) localStorage.setItem(`notes:${preset.sym}`, val);
  };

  const handleAnalysisLoaded = (data: any) => {
    setCallState(prev => ({
      ...prev,
      status: 'ready',
      entry: data.entry ?? prev?.entry ?? null,
      target: data.target ?? prev?.target ?? null,
      stopLoss: data.stopLoss ?? prev?.stopLoss ?? null,
    }));
  };

  const loadIntraday = async () => {
    if (!preset) return;
    try {
      const dRes = await fetch(`${import.meta.env.VITE_API_URL}/api/simulation/intraday/${preset.sym}?date=${simulationDate}`);
      if (!dRes.ok) throw new Error("Intraday data failed");
      const data = await dRes.json();
      if (data.quotes.length > 0) {
        setIntradayQuotes(data.quotes);
        setPlaybackIndex(0);
        setIsPlaying(true);
        // Fire CALL once: set status to loading so we wait for LLM but show engine baseline immediately
        setCallState({
          status: 'loading',
          entry: levels?.buyAbove ?? levels?.entryZone?.upper ?? latest?.close ?? null,
          target: levels?.target1 ?? null,
          stopLoss: levels?.stopLoss ?? null,
          stopLossStatus: levels?.stopLossStatus ?? null,
        });
        // Trigger analyst note exactly once for this CALL
        setAnalystNoteTrigger(Date.now());
      }
    } catch(e) {
      console.error(e);
      alert("No intraday data found for this date. (Remember Yahoo only provides 7 days).");
    }
  };

  const rangeDays: Record<string, number> = { '1D': 1, '1W': 5, '1M': 22, '3M': 65, '6M': 130, '1Y': 252, '3Y': 756, '5Y': 1260 };
  
  let activeQuotes = quotes;
  let activeSignal = signal;
  let isIntradayMode = false;

  if (globalMode === 'simulation' && intradayQuotes.length > 0) {
    isIntradayMode = true;
    activeQuotes = intradayQuotes.slice(0, playbackIndex + 1);
    const lastQ = activeQuotes[activeQuotes.length - 1];
    if (lastQ && lastQ.signalData) {
      activeSignal = lastQ.signalData;
    }
  } else if (globalMode === 'live' && (range === '1D' || range === '1W') && liveIntraday.length > 0) {
    isIntradayMode = true;
    activeQuotes = liveIntraday;
    const lastQ = activeQuotes[activeQuotes.length - 1];
    if (lastQ && lastQ.signalData) {
      activeSignal = lastQ.signalData;
    }
  }

  // Use activeQuotes instead of quotes for slicing chart data
  // If we are playing back intraday data (which is strictly 1 day of minute data), show the full active portion.
  // If it's live daily data, slice it according to the selected range (where 1D = 1 day, 1M = 22 days, etc).
  const chartData = isIntradayMode ? activeQuotes : activeQuotes.slice(-(rangeDays[range] ?? 252));
  const latest = activeQuotes[activeQuotes.length - 1];
  const prev = activeQuotes[activeQuotes.length - 2];

  if (!preset) return <div className="p-8 font-mono text-ink-muted">Loading...</div>;
  const isStale = latest && latest._stale;

  // Signal display config
  const signalCfg = {
    BUY:  { color: T.buy,  bg: '#4C9A7822', Icon: TrendingUp,   label: 'BUY'  },
    SELL: { color: T.sell, bg: '#C1543B22', Icon: TrendingDown,  label: 'SELL' },
    HOLD: { color: T.inkMuted, bg: '#8A93A622', Icon: Minus,     label: 'HOLD' },
  };
  const sCfg = activeSignal ? (signalCfg[activeSignal.signal as keyof typeof signalCfg] ?? signalCfg.HOLD) : signalCfg.HOLD;

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
            <div className="flex items-center gap-1">
              <input
                type="date"
                value={simulationDate}
                max={new Date().toISOString().split('T')[0]}
                onChange={(e) => {
                  setSimulationDate(e.target.value);
                  setIntradayQuotes([]);
                  setIsPlaying(false);
                }}
                className="bg-panel-raised border border-line/60 rounded outline-none text-ink text-[10px] font-mono px-1.5 py-0.5 ml-1"
              />
              {/* Play / Pause / Resume controls */}
              {intradayQuotes.length > 0 ? (
                <div className="flex items-center gap-1 ml-1">
                  {/* Pause when playing, Resume when paused mid-playback */}
                  <button
                    onClick={() => setIsPlaying(p => !p)}
                    className={`flex items-center gap-1 transition-colors border text-[10px] font-mono px-2 py-0.5 rounded font-semibold ${
                      isPlaying
                        ? 'bg-brass/30 text-brass hover:bg-brass/10 border-brass/50'
                        : 'bg-buy/20 text-buy hover:bg-buy/30 border-buy/40'
                    }`}
                  >
                    {isPlaying ? '⏸ Pause' : '▶ Resume'}
                  </button>
                  {/* Restart from scratch */}
                  <button
                    onClick={loadIntraday}
                    title="Restart from beginning"
                    className="bg-panel-raised text-ink-muted hover:text-ink hover:bg-panel transition-colors border border-line text-[10px] font-mono px-2 py-0.5 rounded"
                  >
                    ↺
                  </button>
                </div>
              ) : (
                <button
                  onClick={loadIntraday}
                  className="bg-brass/20 text-brass hover:bg-brass/30 transition-colors border border-brass/40 text-[10px] font-mono px-2 py-0.5 rounded ml-1 font-semibold"
                >
                  ▶ Play Intraday
                </button>
              )}
            </div>
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
      {!loading && latest && activeSignal && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 items-start">

            {/* LEFT: Chart + mini indicators + Tabs */}
            <div className="lg:col-span-3 flex flex-col gap-3 min-w-0">

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
                  {(['1D','1W','1M','3M','6M','1Y','3Y','5Y'] as const).map(r => (
                    <button key={r} onClick={() => {
                        setRange(r);
                        if (globalMode === 'simulation' && r === '1D') {
                          loadIntraday();
                        }
                      }}
                      className={`font-mono text-[10px] px-2 py-0.5 rounded transition-colors ${
                        range === r ? 'bg-brass text-bg font-semibold' : 'text-ink-muted hover:text-ink hover:bg-panel-raised'}`}>
                      {r}
                    </button>
                  ))}
                </div>
                <ChartPanel
                  data={chartData}
                  levels={levels ? { support: levels.support, resistance: levels.resistance } : undefined}
                  tradeLines={levels && activeSignal ? {
                    entry: callState?.entry ?? levels.buyAbove ?? levels.entryZone?.upper ?? null,
                    stopLoss: callState?.stopLoss ?? levels.stopLoss ?? null,
                    target1: callState?.target ?? levels.target1 ?? null,
                    target2: callState ? null : (levels.target2 ?? null),
                    signal: activeSignal.signal,
                  } : null}
                />
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
                    { key: 'analyst', label: 'Analyst Note' },
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
              <div className={bottomTab === 'analyst' ? 'block' : 'hidden'}>
                <AnalystNote
                  symbol={preset.sym}
                  mode={globalMode}
                  simulationDate={globalMode === 'simulation' ? simulationDate : undefined}
                  simulationTime={globalMode === 'simulation' ? latest?.date : undefined}
                  triggerFetch={analystNoteTrigger}
                  intradayQuote={latest}
                  onAnalysisLoaded={handleAnalysisLoaded}
                />
              </div>
            </div>

            {/* RIGHT SIDEBAR: CALL Card, Personal Notes, Disclaimer */}
            <div className="lg:col-span-1 flex flex-col gap-3 min-w-0">
            {/* 1. CALL Card */}
            <div className="bg-panel border border-line rounded-xl overflow-hidden flex flex-col">
              <div className="w-full px-4 py-3 flex justify-between items-center bg-panel border-b border-line">
                <div className="flex items-center gap-2">
                  <Zap size={13} className="text-brass" />
                  <div className="font-display font-bold text-sm tracking-wide text-brass">CALL</div>
                </div>
                {/* Signal badge inline in header */}
                <div
                  className="inline-flex items-center gap-1.5 font-mono text-[10px] font-semibold px-2.5 py-1 rounded-full"
                  style={{ color: sCfg.color, background: sCfg.bg, border: `1px solid ${sCfg.color}44` }}
                >
                  <sCfg.Icon size={11} strokeWidth={2.5} />
                  {sCfg.label}
                </div>
              </div>

              <div className="p-4 bg-bg/30">

                {/* ── CALL Grid: Entry (left, full height) | Target (top-right) | Stop Loss (bottom-right) ── */}
                {(() => {
                  // In simulation: use frozen callState; in live: use current levels
                  const effectiveEntry  = callState?.entry  ?? levels?.buyAbove ?? levels?.entryZone?.upper ?? latest?.close ?? null;
                  const effectiveTarget = callState?.target ?? levels?.target1 ?? null;
                  const effectiveStop   = callState?.stopLoss ?? levels?.stopLoss ?? null;
                  const effectiveSlStatus = callState?.stopLossStatus ?? levels?.stopLossStatus ?? null;

                  const fmtINR = (n: number) =>
                    `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

                  const pctChange = (from: number | null, to: number | null) => {
                    if (from == null || to == null) return null;
                    return ((to - from) / from * 100).toFixed(2);
                  };

                  return (
                    <div
                      className="rounded-lg overflow-hidden border border-line mb-4"
                      style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr' }}
                    >
                      {/* ── ENTRY — left column, spans both rows ── */}
                      <div
                        className="flex flex-col items-center justify-center px-3 py-5 border-r border-line"
                        style={{ gridRow: '1 / 3' }}
                      >
                        <div className="font-mono text-[9px] text-ink-muted uppercase tracking-widest mb-2">Entry</div>
                        <div className="font-mono font-bold text-[17px]" style={{ color: T.buy }}>
                          {effectiveEntry != null ? fmtINR(effectiveEntry) : <span className="text-ink-muted text-[11px]">—</span>}
                        </div>
                        {effectiveEntry != null && latest?.close != null && (() => {
                          const cp = latest.close;
                          const pnl = cp - effectiveEntry;
                          const pct = (pnl / effectiveEntry * 100);
                          const col = pnl >= 0 ? T.buy : T.sell;
                          return (
                            <div className="mt-1.5 text-center">
                              <div className="font-mono text-[11px] font-semibold" style={{ color: col }}>
                                {pnl >= 0 ? '+' : ''}{pct.toFixed(2)}%
                              </div>
                              <div className="font-mono text-[8px] mt-0.5" style={{ color: col + 'bb' }}>
                                {pnl >= 0 ? '+' : ''}₹{Math.abs(pnl).toFixed(2)}/share
                              </div>
                            </div>
                          );
                        })()}
                        {callState?.status === 'ready' && (
                          <div className="mt-2 font-mono text-[8px] text-brass border border-brass/30 bg-brass/10 rounded px-1.5 py-0.5">
                            AI Predicted
                          </div>
                        )}
                        {callState?.status === 'loading' && (
                          <div className="mt-2 font-mono text-[8px] text-brass border border-brass/30 bg-brass/10 rounded px-1.5 py-0.5 flex items-center gap-1.5">
                            <div className="w-2 h-2 border border-brass border-t-transparent rounded-full animate-spin" />
                            AI Predicting...
                          </div>
                        )}
                        {globalMode === 'simulation' && callState == null && (
                          <div className="mt-2 font-mono text-[8px] text-ink-muted border border-line/60 rounded px-1.5 py-0.5">
                            Engine Baseline
                          </div>
                        )}
                      </div>

                      {/* ── TARGET — top-right ── */}
                      <div className="flex flex-col items-center justify-center px-3 py-3 border-b border-line">
                        <div className="font-mono text-[9px] text-ink-muted uppercase tracking-widest mb-1">Target</div>
                        <div className="font-mono font-bold text-[13px]" style={{ color: T.buy }}>
                          {effectiveTarget != null ? fmtINR(effectiveTarget) : '—'}
                        </div>
                        {effectiveTarget != null && effectiveEntry != null && (
                          <div className="font-mono text-[9px] mt-0.5" style={{ color: T.buy + 'aa' }}>
                            +{pctChange(effectiveEntry, effectiveTarget)}%
                          </div>
                        )}
                      </div>

                      {/* ── STOP LOSS — bottom-right ── */}
                      <div className="flex flex-col items-center justify-center px-3 py-3">
                        <div className="font-mono text-[9px] text-ink-muted uppercase tracking-widest mb-1">Stop Loss</div>
                        <div
                          className="font-mono font-bold text-[13px]"
                          style={{ color: effectiveSlStatus === 'hit' ? T.sell : T.brass }}
                        >
                          {effectiveStop != null ? fmtINR(effectiveStop) : '—'}
                        </div>
                        {effectiveStop != null && effectiveEntry != null && (
                          <div className="font-mono text-[9px] mt-0.5" style={{ color: T.sell + 'aa' }}>
                            {pctChange(effectiveEntry, effectiveStop)}%
                          </div>
                        )}
                        {effectiveSlStatus != null && (
                          <div
                            className="font-mono text-[8px] font-semibold mt-1"
                            style={{ color: effectiveSlStatus === 'hit' ? T.sell : T.brass }}
                          >
                            {effectiveSlStatus === 'hit' ? '● Hit' : '● Active'}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* Signal Badge */}
                <div
                  className="flex items-center gap-2 rounded-lg px-3 py-2.5 mb-4"
                  style={{ color: sCfg.color, background: sCfg.bg, border: `1px solid ${sCfg.color}44` }}
                >
                  <sCfg.Icon size={18} strokeWidth={2.5} />
                  <span className="font-display font-extrabold text-xl tracking-wide">{activeSignal.signal}</span>
                </div>

                {/* Rule Agreement & Win Rate */}
                <div className="grid grid-cols-2 gap-4 mb-4 pb-4 border-b border-line border-dashed">
                  <div>
                    <div className="font-mono text-[9px] text-ink-muted mb-1">Rule Agreement</div>
                    <div className="font-mono text-[11px] font-semibold">{Math.abs(activeSignal.score)}/6 indicators ({activeSignal.confidence}%)</div>
                    <div className="h-1 bg-panel-raised rounded mt-1.5 overflow-hidden">
                      <div className="h-full rounded transition-all" style={{ width: `${activeSignal.confidence}%`, background: sCfg.color }} />
                    </div>
                  </div>
                  {activeSignal.historicalWinRate != null && activeSignal.historicalWinRate > 0 && (
                    <div>
                      <div className="font-mono text-[9px] text-ink-muted mb-1">Win Rate</div>
                      <div className="font-mono text-[11px] font-semibold" style={{ color: activeSignal.historicalWinRate >= 50 ? T.buy : T.sell }}>
                        {activeSignal.historicalWinRate.toFixed(1)}%
                      </div>
                    </div>
                  )}
                </div>

                {/* Reasoning Rules */}
                {activeSignal?.rules && (
                  <div>
                    <div className="font-mono text-[9px] text-ink-muted uppercase tracking-widest mb-2.5">Reasoning Ledger</div>
                    <div className="flex flex-col gap-0">
                      {activeSignal.rules.map((r: any, i: number) => (
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
                        <span className="font-mono font-bold text-[11px] text-brass">{activeSignal.score > 0 ? "+" : ""}{activeSignal.score} / 6</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>



              {/* 2. Unified Notes Card (Personal) */}
              <div className="bg-panel border border-line rounded-xl flex flex-col overflow-hidden">
                <div className="p-4 bg-panel-raised/30">
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
