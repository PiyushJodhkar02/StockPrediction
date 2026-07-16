import { useState, useEffect } from 'react';
import { TriangleAlert, TrendingDown, TrendingUp, Minus, ChevronDown, ChevronUp } from 'lucide-react';

interface PriceLevels {
  atrValue: number | null;
  support: number | null;
  resistance: number | null;
  entryZone: { upper: number; lower: number } | null;
  dataTimestamp: string;
}

interface PositionState {
  entryPrice: number;
  entryDate: string;
}

interface PositionAnalysis {
  entryPrice: number;
  currentPrice: number;
  fixedStopLoss: number;
  runningPeak: number;
  trailingStop: number;
  recommendation: 'HOLD' | 'SELL';
  nearResistance: boolean;
  partialExitHint: boolean;
}

interface PriceLevelCardProps {
  symbol: string;
  levels: PriceLevels | null;
  signal: any;
  mode?: 'live' | 'simulation';
}

const T = { buy: '#4C9A78', sell: '#C1543B', brass: '#C98A2C', inkMuted: '#8A93A6' };

function DataDelayDisclosure({ timestamp }: { timestamp: string }) {
  const formatted = new Date(timestamp).toLocaleDateString('en-IN', {
    year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Asia/Kolkata',
  });
  return (
    <div className="col-span-full mt-1 flex gap-2 items-start bg-[#C98A2C10] border border-brass/30 rounded-lg px-3 py-2">
      <TriangleAlert size={12} className="text-brass mt-0.5 shrink-0" />
      <p className="font-mono text-[10px] text-brass leading-relaxed">
        <strong>Data delay notice:</strong> Levels calculated from data as of {formatted}. Yahoo Finance data may be
        delayed up to ~15 minutes from live market price.{' '}
        <strong>Do not use these levels as real-time execution triggers.</strong>
      </p>
    </div>
  );
}

/** A single tile in the horizontal level grid */
function LevelTile({
  label, value, note, color, accentBg,
}: {
  label: string; value: string; note: string; color?: string; accentBg?: string;
}) {
  return (
    <div
      className="bg-panel-raised rounded-lg px-4 py-3 flex flex-col gap-0.5 border border-line"
      style={accentBg ? { borderColor: accentBg + '50', background: accentBg + '12' } : {}}
    >
      <div className="font-mono text-[10px] text-ink-muted tracking-wide uppercase">{label}</div>
      <div className="font-mono text-base font-semibold" style={{ color: color || 'var(--color-ink)' }}>
        {value}
      </div>
      <div className="font-mono text-[9px] text-ink-muted leading-relaxed mt-0.5">{note}</div>
    </div>
  );
}

export default function PriceLevelCard({ symbol, levels, signal, mode = 'live' }: PriceLevelCardProps) {
  const [position, setPosition] = useState<PositionState | null>(() => {
    try { const s = localStorage.getItem(`position:${symbol}`); return s ? JSON.parse(s) : null; }
    catch { return null; }
  });
  const [posAnalysis, setPosAnalysis] = useState<PositionAnalysis | null>(null);
  const [showEntryForm, setShowEntryForm] = useState(false);
  const [entryPriceInput, setEntryPriceInput] = useState('');
  const [entryDateInput, setEntryDateInput] = useState(new Date().toISOString().slice(0, 10));

  useEffect(() => {
    try { const s = localStorage.getItem(`position:${symbol}`); setPosition(s ? JSON.parse(s) : null); }
    catch { setPosition(null); }
    setPosAnalysis(null);
    setShowEntryForm(false);
  }, [symbol]);

  useEffect(() => {
    if (!position) { setPosAnalysis(null); return; }
    fetch(`${import.meta.env.VITE_API_URL}/api/position/${encodeURIComponent(symbol)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(position),
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setPosAnalysis(d); })
      .catch(() => {});
  }, [symbol, position, levels]);

  const savePosition = () => {
    const price = parseFloat(entryPriceInput);
    if (!price || price <= 0) return;
    const pos: PositionState = { entryPrice: price, entryDate: entryDateInput };
    localStorage.setItem(`position:${symbol}`, JSON.stringify(pos));
    setPosition(pos);
    setShowEntryForm(false);
  };

  const clearPosition = () => {
    localStorage.removeItem(`position:${symbol}`);
    setPosition(null);
    setPosAnalysis(null);
  };

  const isINR = true; // Backend always converts to INR via fx=83.5 multiplier for all stocks
  const fmtPrice = (n: number) =>
    `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  if (!levels) return null;

  // Flip hint for non-buy signals
  let flipHint = '';
  if (signal?.rules) {
    const rsiRule = signal.rules.find((r: any) => r.label?.startsWith('RSI'));
    if (rsiRule && signal.signal !== 'BUY') {
      const rsiVal = parseFloat(rsiRule.label.replace(/[^0-9.]/g, ''));
      if (!isNaN(rsiVal) && rsiVal > 30) flipHint = `RSI at ${rsiVal.toFixed(0)}, would flag oversold below 30`;
    }
  }

  const posRecommendColor = posAnalysis?.recommendation === 'SELL' ? T.sell : T.buy;

  return (
    <div className="bg-panel border border-line rounded-xl p-5">
      {/* ── Header row ── */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <div className="font-display font-extrabold text-[15px]">Price Levels</div>
          {levels.atrValue && (
            <div className="font-mono text-[10px] text-ink-muted mt-0.5">
              ATR(14) = {fmtPrice(levels.atrValue)} &middot; 14-day volatility measure
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {mode === 'live' && posAnalysis && (
            <div
              className="font-mono text-xs font-semibold px-3 py-1 rounded-full border flex items-center gap-1.5"
              style={{
                color: posRecommendColor,
                borderColor: posRecommendColor + '55',
                background: posRecommendColor + '15',
              }}
            >
              {posAnalysis.recommendation === 'SELL' ? <TrendingDown size={12} /> : <TrendingUp size={12} />}
              Position: {posAnalysis.recommendation}
              {posAnalysis.partialExitHint && (
                <span className="text-brass ml-1 font-normal text-[9px]">⚡ near resistance</span>
              )}
            </div>
          )}

          {mode === 'live' && (
            !position ? (
              <button
                onClick={() => setShowEntryForm(v => !v)}
                className="font-mono text-[10px] border border-brass/50 text-brass rounded px-2.5 py-1 hover:bg-[#C98A2C15] transition-colors flex items-center gap-1"
              >
                + Track position {showEntryForm ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
              </button>
            ) : (
              <button
                onClick={clearPosition}
                className="font-mono text-[10px] border border-sell/50 text-sell rounded px-2.5 py-1 hover:bg-sell-dim transition-colors"
              >
                Close position
              </button>
            )
          )}
        </div>
      </div>

      {/* ── Entry form (collapsible) ── */}
      {showEntryForm && (
        <div className="mb-4 bg-panel-raised rounded-lg p-3 grid grid-cols-1 sm:grid-cols-3 gap-3 items-end border border-brass/20">
          <div>
            <div className="font-mono text-[10px] text-ink-muted mb-1">Entry price ({isINR ? '₹' : '$'})</div>
            <input
              type="number"
              className="bg-bg border border-line rounded px-2 py-1.5 font-mono text-sm text-ink outline-none focus:border-brass w-full"
              placeholder="e.g. 3450"
              value={entryPriceInput}
              onChange={e => setEntryPriceInput(e.target.value)}
            />
          </div>
          <div>
            <div className="font-mono text-[10px] text-ink-muted mb-1">Entry date</div>
            <input
              type="date"
              className="bg-bg border border-line rounded px-2 py-1.5 font-mono text-sm text-ink outline-none focus:border-brass w-full"
              value={entryDateInput}
              onChange={e => setEntryDateInput(e.target.value)}
            />
          </div>
          <button
            onClick={savePosition}
            className="bg-brass/20 border border-brass/40 text-brass font-mono text-xs rounded px-3 py-1.5 hover:bg-brass/30 transition-colors h-fit"
          >
            Save &amp; track
          </button>
        </div>
      )}

      {/* ── Tile grid ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">

        {/* ── State B: Position tiles ── */}
        {posAnalysis && (
          <>
            <LevelTile
              label="Entry"
              value={fmtPrice(posAnalysis.entryPrice)}
              note="Your recorded entry price"
              color={T.inkMuted}
            />
            <LevelTile
              label="Peak since entry"
              value={fmtPrice(posAnalysis.runningPeak)}
              note="Highest close since entry"
              color={T.buy}
              accentBg={T.buy}
            />
            <LevelTile
              label="Trailing stop"
              value={fmtPrice(posAnalysis.trailingStop)}
              note={`Peak − 1.5 × ATR (${levels.atrValue?.toFixed(2) ?? '–'}). Only moves up.`}
              color={posAnalysis.recommendation === 'SELL' ? T.sell : T.brass}
              accentBg={posAnalysis.recommendation === 'SELL' ? T.sell : T.brass}
            />
            <LevelTile
              label="Fixed stop-loss"
              value={fmtPrice(posAnalysis.fixedStopLoss)}
              note="Entry − 1.5 × ATR at entry. Locked forever."
              color={T.sell}
              accentBg={T.sell}
            />
          </>
        )}

        {/* ── State A: Entry zone ── */}
        {!posAnalysis && signal?.signal === 'BUY' && levels.entryZone && (
          <LevelTile
            label="Entry zone"
            value={`${fmtPrice(levels.entryZone.lower)} – ${fmtPrice(levels.entryZone.upper)}`}
            note="Buy now or on pullback to nearest support (within 2%)."
            color={T.buy}
            accentBg={T.buy}
          />
        )}

        {/* ── State A: Watching ── */}
        {!posAnalysis && signal?.signal !== 'BUY' && flipHint && (
          <LevelTile
            label="No entry signal"
            value="Watching"
            note={flipHint}
            color={T.inkMuted}
          />
        )}

        {/* ── Support / Resistance — always shown ── */}
        {levels.resistance && (
          <LevelTile
            label="Resistance"
            value={fmtPrice(levels.resistance)}
            note="Clustered swing highs (60-day). Touched at least twice."
            color={T.sell}
            accentBg={T.sell}
          />
        )}
        {levels.support && (
          <LevelTile
            label="Support"
            value={fmtPrice(levels.support)}
            note="Clustered swing lows (60-day). Bounced at least twice."
            color={T.buy}
            accentBg={T.buy}
          />
        )}

        {/* Fallback if no S/R found */}
        {!levels.resistance && !levels.support && !posAnalysis && (
          <div className="col-span-2 flex items-center gap-2 text-ink-muted font-mono text-[11px] px-1">
            <Minus size={12} />
            No clustered support/resistance detected in the last 60 sessions.
          </div>
        )}

        {/* ATR context chip */}
        {levels.atrValue && (
          <LevelTile
            label="Volatility (ATR 14)"
            value={fmtPrice(levels.atrValue)}
            note="Avg daily range. Used to compute all stop distances."
            color={T.inkMuted}
          />
        )}

        {/* Delay disclosure spanning full width */}
        <DataDelayDisclosure timestamp={levels.dataTimestamp} />
      </div>
    </div>
  );
}
