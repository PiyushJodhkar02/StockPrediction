import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  ComposedChart, Line, Area, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceDot, ReferenceLine
} from "recharts";
import { TrendingUp, TrendingDown, Minus, Radio, CircleDot, ChevronRight } from "lucide-react";

// ---------------------------------------------------------------------------
// Token system
// bg: near-black ink navy · panel: raised slate-navy · accent: brass ledger-gold
// buy: muted spruce green · sell: burnt terracotta · text: warm parchment
// ---------------------------------------------------------------------------
const T = {
  bg: "#0D1420",
  panel: "#141E30",
  panelRaised: "#1A2740",
  line: "#2A3B57",
  ink: "#E8E2D4",
  inkMuted: "#8A93A6",
  brass: "#C98A2C",
  buy: "#4C9A78",
  buyDim: "#4C9A7822",
  sell: "#C1543B",
  sellDim: "#C1543B22",
  hold: "#8A93A6",
};

const FONT_DISPLAY = "'Manrope', sans-serif";
const FONT_BODY = "'Inter', sans-serif";
const FONT_MONO = "'JetBrains Mono', monospace";

// ---------------------------------------------------------------------------
// Symbol presets — each has a distinct synthetic character for demo mode
// ---------------------------------------------------------------------------
const SYMBOLS = [
  { sym: "AAPL", name: "Apple Inc.", base: 208, drift: 0.16, vol: 0.22, seed: 11 },
  { sym: "TSLA", name: "Tesla Inc.", base: 245, drift: 0.05, vol: 0.48, seed: 27 },
  { sym: "RELIANCE.NS", name: "Reliance Industries", base: 2940, drift: 0.12, vol: 0.24, seed: 42 },
  { sym: "TCS.NS", name: "Tata Consultancy Svcs", base: 3820, drift: -0.04, vol: 0.19, seed: 63 },
  { sym: "INFY.NS", name: "Infosys Ltd.", base: 1540, drift: 0.02, vol: 0.21, seed: 88 },
];

// seeded PRNG so each symbol's demo series is stable across renders
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function genSeries({ base, drift, vol, seed }, days = 220) {
  const rnd = mulberry32(seed);
  const dt = 1 / 252;
  let price = base * 0.86;
  const out = [];
  const start = new Date();
  start.setDate(start.getDate() - days);
  for (let i = 0; i < days; i++) {
    // gaussian via Box-Muller
    const u1 = Math.max(rnd(), 1e-6), u2 = rnd();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    // gentle mean reversion + regime wobble so it doesn't look purely random-walk
    const regime = Math.sin(i / 26) * 0.35;
    const ret = drift * dt + vol * Math.sqrt(dt) * z * 0.9 + regime * dt * 2;
    price = Math.max(price * (1 + ret), 0.5);
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const dow = d.getDay();
    if (dow === 0 || dow === 6) continue; // skip weekends
    const open = price * (1 - vol * 0.004 * (rnd() - 0.5));
    const high = Math.max(open, price) * (1 + vol * 0.006 * rnd());
    const low = Math.min(open, price) * (1 - vol * 0.006 * rnd());
    out.push({
      date: d.toISOString().slice(0, 10),
      close: +price.toFixed(2),
      open: +open.toFixed(2),
      high: +high.toFixed(2),
      low: +low.toFixed(2),
      volume: Math.round(1_000_000 + rnd() * 4_000_000),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Technical indicator engine
// ---------------------------------------------------------------------------
function sma(vals, period) {
  return vals.map((_, i) => {
    if (i < period - 1) return null;
    let s = 0;
    for (let k = i - period + 1; k <= i; k++) s += vals[k];
    return s / period;
  });
}

function ema(vals, period) {
  const k = 2 / (period + 1);
  const out = new Array(vals.length).fill(null);
  let prev = null;
  for (let i = 0; i < vals.length; i++) {
    if (vals[i] == null) continue;
    if (prev == null) { prev = vals[i]; out[i] = prev; continue; }
    prev = vals[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

function rsi(vals, period = 14) {
  const out = new Array(vals.length).fill(null);
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i < vals.length; i++) {
    const change = vals[i] - vals[i - 1];
    const gain = Math.max(change, 0), loss = Math.max(-change, 0);
    if (i <= period) {
      avgGain += gain / period;
      avgLoss += loss / period;
      if (i === period) {
        const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        out[i] = 100 - 100 / (1 + rs);
      }
    } else {
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      out[i] = 100 - 100 / (1 + rs);
    }
  }
  return out;
}

function computeIndicators(rows) {
  const closes = rows.map((r) => r.close);
  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const macdLine = closes.map((_, i) =>
    ema12[i] != null && ema26[i] != null ? ema12[i] - ema26[i] : null
  );
  const macdSignal = ema(macdLine.map((v) => (v == null ? 0 : v)), 9).map((v, i) =>
    macdLine[i] == null ? null : v
  );
  const macdHist = macdLine.map((v, i) =>
    v != null && macdSignal[i] != null ? v - macdSignal[i] : null
  );
  const rsi14 = rsi(closes, 14);

  return rows.map((r, i) => ({
    ...r,
    sma20: sma20[i], sma50: sma50[i],
    macd: macdLine[i], macdSignal: macdSignal[i], macdHist: macdHist[i],
    rsi: rsi14[i],
  }));
}

// Rule-based scoring engine — every point is explainable, nothing is a black box
function scoreDay(cur, prev) {
  const rules = [];
  let score = 0;

  if (cur.sma20 != null && cur.sma50 != null) {
    const up = cur.sma20 > cur.sma50;
    rules.push({ label: "20/50-day trend cross", verdict: up ? "Bullish" : "Bearish", pts: up ? 1 : -1 });
    score += up ? 1 : -1;
  }
  if (cur.sma20 != null) {
    const above = cur.close > cur.sma20;
    rules.push({ label: "Price vs 20-day average", verdict: above ? "Above (strength)" : "Below (weakness)", pts: above ? 1 : -1 });
    score += above ? 1 : -1;
  }
  if (cur.rsi != null) {
    let verdict = "Neutral", pts = 0;
    if (cur.rsi < 30) { verdict = "Oversold (rebound likely)"; pts = 2; }
    else if (cur.rsi > 70) { verdict = "Overbought (pullback risk)"; pts = -2; }
    rules.push({ label: `RSI (${cur.rsi.toFixed(0)})`, verdict, pts });
    score += pts;
  }
  if (cur.macd != null && cur.macdSignal != null) {
    const bull = cur.macd > cur.macdSignal;
    rules.push({ label: "MACD vs signal line", verdict: bull ? "Bullish crossover" : "Bearish crossover", pts: bull ? 1 : -1 });
    score += bull ? 1 : -1;
  }
  if (cur.macdHist != null && prev && prev.macdHist != null) {
    const rising = cur.macdHist > prev.macdHist;
    rules.push({ label: "Momentum (MACD histogram)", verdict: rising ? "Accelerating" : "Decelerating", pts: rising ? 1 : -1 });
    score += rising ? 1 : -1;
  }

  const max = 6;
  let signal = "HOLD";
  if (score >= 3) signal = "BUY";
  else if (score <= -3) signal = "SELL";
  const confidence = Math.round((Math.abs(score) / max) * 100);
  return { score, signal, confidence, rules };
}

function runBacktest(rows) {
  let position = null; // { entryPrice, entryIdx }
  let trades = [];
  let equity = 100;
  const curve = [];

  for (let i = 1; i < rows.length; i++) {
    const { signal } = scoreDay(rows[i], rows[i - 1]);
    if (signal === "BUY" && !position) {
      position = { entryPrice: rows[i].close, entryIdx: i };
    } else if (signal === "SELL" && position) {
      const ret = (rows[i].close - position.entryPrice) / position.entryPrice;
      equity *= 1 + ret;
      trades.push({ ret, entry: position.entryPrice, exit: rows[i].close, date: rows[i].date });
      position = null;
    }
    // mark-to-market equity curve
    let mtm = equity;
    if (position) mtm = equity * (1 + (rows[i].close - position.entryPrice) / position.entryPrice);
    curve.push({ date: rows[i].date, equity: +mtm.toFixed(2) });
  }
  if (position) {
    const last = rows[rows.length - 1];
    const ret = (last.close - position.entryPrice) / position.entryPrice;
    equity *= 1 + ret;
    trades.push({ ret, entry: position.entryPrice, exit: last.close, date: last.date, open: true });
  }

  const first = rows[0].close, last = rows[rows.length - 1].close;
  const buyHold = ((last - first) / first) * 100;
  const strategyReturn = equity - 100;
  const wins = trades.filter((t) => t.ret > 0).length;
  const winRate = trades.length ? Math.round((wins / trades.length) * 100) : 0;

  return { strategyReturn, buyHold, trades, winRate, curve };
}

// ---------------------------------------------------------------------------
// UI subcomponents
// ---------------------------------------------------------------------------
function SignalBadge({ signal, size = "lg" }) {
  const cfg = {
    BUY: { color: T.buy, bg: T.buyDim, Icon: TrendingUp },
    SELL: { color: T.sell, bg: T.sellDim, Icon: TrendingDown },
    HOLD: { color: T.hold, bg: "#8A93A622", Icon: Minus },
  }[signal];
  const big = size === "lg";
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 8,
      background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}55`,
      padding: big ? "10px 18px" : "4px 10px", borderRadius: 8,
      fontFamily: FONT_DISPLAY, fontWeight: 800,
      fontSize: big ? 22 : 12, letterSpacing: 1,
    }}>
      <cfg.Icon size={big ? 22 : 13} strokeWidth={2.5} />
      {signal}
    </div>
  );
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div style={{
      background: T.panelRaised, border: `1px solid ${T.line}`, borderRadius: 6,
      padding: "8px 12px", fontFamily: FONT_MONO, fontSize: 11, color: T.ink,
    }}>
      <div style={{ color: T.inkMuted, marginBottom: 4 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color }}>
          {p.name}: {typeof p.value === "number" ? p.value.toFixed(2) : p.value}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function StockSignalDashboard() {
  const [symbolIdx, setSymbolIdx] = useState(0);
  const [rows, setRows] = useState([]);
  const [dataSource, setDataSource] = useState("demo"); // "live" | "demo"
  const [loading, setLoading] = useState(true);

  const preset = SYMBOLS[symbolIdx];

  const loadData = useCallback(async (p) => {
    setLoading(true);
    setDataSource("demo");
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      const resp = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(p.sym)}?range=9mo&interval=1d`,
        { signal: controller.signal }
      );
      clearTimeout(timeout);
      if (!resp.ok) throw new Error("bad response");
      const json = await resp.json();
      const result = json?.chart?.result?.[0];
      const ts = result?.timestamp;
      const quote = result?.indicators?.quote?.[0];
      if (!ts || !quote?.close) throw new Error("no data");
      const live = ts.map((t, i) => ({
        date: new Date(t * 1000).toISOString().slice(0, 10),
        open: quote.open[i], high: quote.high[i], low: quote.low[i],
        close: quote.close[i], volume: quote.volume[i],
      })).filter((r) => r.close != null);
      if (live.length < 60) throw new Error("insufficient live data");
      setRows(computeIndicators(live));
      setDataSource("live");
    } catch (e) {
      setRows(computeIndicators(genSeries(p)));
      setDataSource("demo");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(preset); }, [symbolIdx]); // eslint-disable-line

  const latest = rows[rows.length - 1];
  const prev = rows[rows.length - 2];
  const analysis = useMemo(() => (latest ? scoreDay(latest, prev) : null), [latest, prev]);
  const backtest = useMemo(() => (rows.length > 55 ? runBacktest(rows) : null), [rows]);

  const chartData = rows.slice(-140);
  const buyMarkers = [], sellMarkers = [];
  for (let i = 1; i < chartData.length; i++) {
    const s = scoreDay(chartData[i], chartData[i - 1]);
    if (s.signal === "BUY") buyMarkers.push(chartData[i]);
    if (s.signal === "SELL") sellMarkers.push(chartData[i]);
  }

  return (
    <div style={{
      background: T.bg, minHeight: "100%", color: T.ink,
      fontFamily: FONT_BODY, padding: "28px 24px",
    }}>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@700;800&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; }
      `}</style>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, flexWrap: "wrap", gap: 16 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: T.brass }} />
            <span style={{ fontFamily: FONT_MONO, fontSize: 11, letterSpacing: 2, color: T.inkMuted, textTransform: "uppercase" }}>
              Decision Support Prototype
            </span>
          </div>
          <h1 style={{ fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: 30, margin: "6px 0 0", letterSpacing: -0.5 }}>
            Signal Ledger
          </h1>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            fontFamily: FONT_MONO, fontSize: 11, color: dataSource === "live" ? T.buy : T.brass,
            border: `1px solid ${dataSource === "live" ? T.buy : T.brass}55`, borderRadius: 20,
            padding: "5px 12px", background: dataSource === "live" ? T.buyDim : "#C98A2C18",
          }}>
            <Radio size={12} />
            {loading ? "Fetching\u2026" : dataSource === "live" ? "Live market data" : "Demo dataset"}
          </div>
        </div>
      </div>

      {/* Symbol picker */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {SYMBOLS.map((s, i) => (
          <button key={s.sym} onClick={() => setSymbolIdx(i)}
            style={{
              fontFamily: FONT_MONO, fontSize: 12, fontWeight: 500,
              padding: "9px 14px", borderRadius: 7, cursor: "pointer",
              border: `1px solid ${i === symbolIdx ? T.brass : T.line}`,
              background: i === symbolIdx ? "#C98A2C1A" : T.panel,
              color: i === symbolIdx ? T.brass : T.inkMuted,
              transition: "all .15s",
            }}>
            {s.sym}
          </button>
        ))}
      </div>

      {!loading && latest && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 20 }}>
          {/* Left column */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20, minWidth: 0 }}>

            {/* Price header */}
            <div style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 12, padding: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                <div>
                  <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: 20 }}>{preset.name}</div>
                  <div style={{ fontFamily: FONT_MONO, fontSize: 12, color: T.inkMuted }}>{preset.sym}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontFamily: FONT_MONO, fontSize: 26, fontWeight: 500 }}>
                    {preset.sym.endsWith(".NS") ? "\u20B9" : "$"}{latest.close.toFixed(2)}
                  </div>
                  <div style={{ fontFamily: FONT_MONO, fontSize: 12, color: latest.close >= prev?.close ? T.buy : T.sell }}>
                    {prev ? (((latest.close - prev.close) / prev.close) * 100).toFixed(2) : "0.00"}% vs prior close
                  </div>
                </div>
              </div>

              {/* Chart */}
              <div style={{ height: 280, marginTop: 12 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid stroke={T.line} strokeDasharray="3 5" vertical={false} />
                    <XAxis dataKey="date" tick={{ fill: T.inkMuted, fontSize: 10, fontFamily: FONT_MONO }}
                      tickFormatter={(d) => d.slice(5)} minTickGap={40} axisLine={{ stroke: T.line }} tickLine={false} />
                    <YAxis domain={["auto", "auto"]} tick={{ fill: T.inkMuted, fontSize: 10, fontFamily: FONT_MONO }}
                      axisLine={false} tickLine={false} width={50} />
                    <Tooltip content={<CustomTooltip />} />
                    <Line type="monotone" dataKey="close" name="Close" stroke={T.ink} strokeWidth={1.6} dot={false} />
                    <Line type="monotone" dataKey="sma20" name="SMA 20" stroke={T.brass} strokeWidth={1.3} dot={false} strokeDasharray="0" />
                    <Line type="monotone" dataKey="sma50" name="SMA 50" stroke="#6C7A93" strokeWidth={1.3} dot={false} strokeDasharray="4 3" />
                    {buyMarkers.map((m, i) => (
                      <ReferenceDot key={`b${i}`} x={m.date} y={m.close} r={4} fill={T.buy} stroke={T.bg} strokeWidth={1} />
                    ))}
                    {sellMarkers.map((m, i) => (
                      <ReferenceDot key={`s${i}`} x={m.date} y={m.close} r={4} fill={T.sell} stroke={T.bg} strokeWidth={1} />
                    ))}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <div style={{ display: "flex", gap: 16, marginTop: 6, fontFamily: FONT_MONO, fontSize: 10, color: T.inkMuted }}>
                <span><span style={{ color: T.brass }}>&#9679;</span> SMA 20</span>
                <span><span style={{ color: "#6C7A93" }}>&#9679;</span> SMA 50</span>
                <span><span style={{ color: T.buy }}>&#9679;</span> Buy signal</span>
                <span><span style={{ color: T.sell }}>&#9679;</span> Sell signal</span>
              </div>
            </div>

            {/* RSI + MACD */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              <div style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 12, padding: 16 }}>
                <div style={{ fontFamily: FONT_MONO, fontSize: 11, color: T.inkMuted, marginBottom: 8, letterSpacing: 1 }}>RSI (14)</div>
                <div style={{ height: 110 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                      <YAxis domain={[0, 100]} tick={{ fill: T.inkMuted, fontSize: 9, fontFamily: FONT_MONO }} axisLine={false} tickLine={false} />
                      <XAxis dataKey="date" hide />
                      <ReferenceLine y={70} stroke={T.sell} strokeDasharray="3 3" strokeOpacity={0.5} />
                      <ReferenceLine y={30} stroke={T.buy} strokeDasharray="3 3" strokeOpacity={0.5} />
                      <Line type="monotone" dataKey="rsi" stroke={T.brass} strokeWidth={1.4} dot={false} />
                      <Tooltip content={<CustomTooltip />} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 12, padding: 16 }}>
                <div style={{ fontFamily: FONT_MONO, fontSize: 11, color: T.inkMuted, marginBottom: 8, letterSpacing: 1 }}>MACD histogram</div>
                <div style={{ height: 110 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                      <YAxis tick={{ fill: T.inkMuted, fontSize: 9, fontFamily: FONT_MONO }} axisLine={false} tickLine={false} />
                      <XAxis dataKey="date" hide />
                      <ReferenceLine y={0} stroke={T.line} />
                      <Bar dataKey="macdHist" name="Histogram">
                        {chartData.map((d, i) => (
                          <Bar key={i} fill={d.macdHist >= 0 ? T.buy : T.sell} />
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
              <div style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 12, padding: 20 }}>
                <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: 15, marginBottom: 14 }}>
                  Backtest &mdash; strategy vs. buy &amp; hold
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
                  {[
                    { label: "Strategy return", val: `${backtest.strategyReturn >= 0 ? "+" : ""}${backtest.strategyReturn.toFixed(1)}%`, c: backtest.strategyReturn >= 0 ? T.buy : T.sell },
                    { label: "Buy & hold return", val: `${backtest.buyHold >= 0 ? "+" : ""}${backtest.buyHold.toFixed(1)}%`, c: T.inkMuted },
                    { label: "Win rate", val: `${backtest.winRate}%`, c: T.ink },
                    { label: "Trades", val: backtest.trades.length, c: T.ink },
                  ].map((s, i) => (
                    <div key={i} style={{ background: T.panelRaised, borderRadius: 8, padding: "12px 14px" }}>
                      <div style={{ fontFamily: FONT_MONO, fontSize: 10, color: T.inkMuted, marginBottom: 6 }}>{s.label}</div>
                      <div style={{ fontFamily: FONT_MONO, fontSize: 18, fontWeight: 500, color: s.c }}>{s.val}</div>
                    </div>
                  ))}
                </div>
                <div style={{ height: 90 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={backtest.curve} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                      <YAxis tick={{ fill: T.inkMuted, fontSize: 9, fontFamily: FONT_MONO }} axisLine={false} tickLine={false} domain={["auto", "auto"]} />
                      <XAxis dataKey="date" hide />
                      <ReferenceLine y={100} stroke={T.line} />
                      <Area type="monotone" dataKey="equity" stroke={T.brass} fill="#C98A2C22" strokeWidth={1.5} />
                      <Tooltip content={<CustomTooltip />} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ fontFamily: FONT_MONO, fontSize: 10, color: T.inkMuted, marginTop: 8 }}>
                  Equity curve, base 100 &middot; rules-based entries/exits only, no position sizing or costs applied
                </div>
              </div>
            )}
          </div>

          {/* Right column — Signal card */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 12, padding: 20, position: "sticky", top: 20 }}>
              <div style={{ fontFamily: FONT_MONO, fontSize: 11, color: T.inkMuted, letterSpacing: 1, marginBottom: 12 }}>
                CURRENT SIGNAL
              </div>
              <SignalBadge signal={analysis.signal} />
              <div style={{ marginTop: 14, marginBottom: 18 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontFamily: FONT_MONO, fontSize: 11, color: T.inkMuted, marginBottom: 6 }}>
                  <span>Confidence</span><span>{analysis.confidence}%</span>
                </div>
                <div style={{ height: 6, background: T.panelRaised, borderRadius: 4, overflow: "hidden" }}>
                  <div style={{
                    width: `${analysis.confidence}%`, height: "100%",
                    background: analysis.signal === "BUY" ? T.buy : analysis.signal === "SELL" ? T.sell : T.hold,
                    borderRadius: 4,
                  }} />
                </div>
              </div>

              <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: 12, letterSpacing: 1, color: T.inkMuted, marginBottom: 10, borderTop: `1px solid ${T.line}`, paddingTop: 16 }}>
                REASONING LEDGER
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                {analysis.rules.map((r, i) => (
                  <div key={i} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "9px 0", borderBottom: i < analysis.rules.length - 1 ? `1px dashed ${T.line}` : "none",
                  }}>
                    <div>
                      <div style={{ fontFamily: FONT_BODY, fontSize: 12.5, color: T.ink }}>{r.label}</div>
                      <div style={{ fontFamily: FONT_MONO, fontSize: 10.5, color: T.inkMuted, marginTop: 2 }}>{r.verdict}</div>
                    </div>
                    <div style={{
                      fontFamily: FONT_MONO, fontSize: 12, fontWeight: 500,
                      color: r.pts > 0 ? T.buy : r.pts < 0 ? T.sell : T.inkMuted,
                      minWidth: 30, textAlign: "right",
                    }}>
                      {r.pts > 0 ? "+" : ""}{r.pts}
                    </div>
                  </div>
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 12, marginTop: 4, borderTop: `1px solid ${T.line}` }}>
                  <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: 12 }}>NET SCORE</div>
                  <div style={{ fontFamily: FONT_MONO, fontWeight: 700, fontSize: 13, color: T.brass }}>
                    {analysis.score > 0 ? "+" : ""}{analysis.score} / 6
                  </div>
                </div>
              </div>
            </div>

            <div style={{ background: "#C98A2C10", border: `1px solid ${T.brass}44`, borderRadius: 12, padding: 16 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <CircleDot size={14} color={T.brass} style={{ marginTop: 2, flexShrink: 0 }} />
                <div style={{ fontFamily: FONT_BODY, fontSize: 11.5, color: T.inkMuted, lineHeight: 1.5 }}>
                  This is a rules-based decision-support signal, not a guarantee of future performance.
                  Every point in the ledger traces back to a named indicator &mdash; nothing here is a hidden model.
                  {dataSource === "demo" && " Currently running on a synthetic demo series; wire in a live market data feed for production use."}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
