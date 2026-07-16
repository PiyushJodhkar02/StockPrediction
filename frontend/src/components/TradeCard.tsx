import { useState } from 'react';
import {
  TrendingUp, TrendingDown, Minus, Info, ChevronDown, ChevronUp,
  TriangleAlert, Target, ShieldAlert,
} from 'lucide-react';

interface TradeCardLevels {
  atrValue: number | null;
  support: number | null;
  resistance: number | null;
  entryZone: { upper: number; lower: number } | null;
  dataTimestamp: string;
  buyAbove: number | null;
  target1: number | null;
  target2: number | null;
  stopLoss: number | null;
  stopLossStatus: 'active' | 'hit' | null;
}

interface TradeCardProps {
  levels: TradeCardLevels;
  signal: { signal: string; confidence: number; score: number; rules: any[] };
  mode: 'live' | 'simulation';
  symbol: string;
}

const T = {
  buy: '#4C9A78', sell: '#C1543B', brass: '#C98A2C',
  inkMuted: '#8A93A6', ink: '#E8E2D4',
};

const SOURCE_EXPLANATIONS: Record<string, string> = {
  buyAbove: 'Entry trigger = current price, or nearest support level if within 2% of current price. Computed from 60-day swing-low clusters.',
  target1: 'Conservative near-term target: current price + 1.0 × ATR(14). The 14-day Average True Range measures typical daily volatility.',
  target2: 'Stretch target: nearest clustered resistance above current price, or current price + 2.5 × ATR(14) if no resistance is found within range — whichever is closer.',
  stopLoss: 'ATR-based stop: current price − 1.5 × ATR(14). Same multiplier used in the position trailing-stop engine.',
  stopLossStatus: '"Active" = current price is above the stop-loss level. "Hit" = current price has dropped below the stop (snapshot as of last data bar).',
};

const fmtPrice = (n: number) =>
  `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtGainLoss = (n: number) =>
  `₹${Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

interface TradeRowProps {
  label: string;
  value: string;
  valueColor?: string;
  badge?: React.ReactNode;
  arrow?: boolean;
  sourceKey: string;
}

function TradeRow({ label, value, valueColor, badge, arrow, sourceKey }: TradeRowProps) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        className="w-full flex items-center justify-between py-[9px] hover:bg-[#1A274010] rounded transition-colors group"
        onClick={() => setOpen(v => !v)}
      >
        <div className="flex items-center gap-2">
          <span className="font-body text-[12.5px] text-ink">{label}</span>
          <Info size={10} className="text-ink-muted opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
        <div className="flex items-center gap-1.5">
          {badge}
          <span
            className="font-mono text-[13px] font-semibold"
            style={{ color: valueColor ?? T.ink }}
          >
            {arrow && <span className="mr-0.5 text-buy">↗</span>}
            {value}
          </span>
          {open ? <ChevronUp size={11} className="text-ink-muted" /> : <ChevronDown size={11} className="text-ink-muted" />}
        </div>
      </button>
      {open && (
        <div className="mb-1 px-3 py-2 bg-[#C98A2C08] border border-brass/20 rounded text-[10.5px] font-mono text-ink-muted leading-relaxed">
          {SOURCE_EXPLANATIONS[sourceKey]}
        </div>
      )}
    </div>
  );
}

export default function TradeCard({ levels, signal, mode, symbol: _symbol }: TradeCardProps) {
  const [quantity, setQuantity] = useState<string>('');

  const signalCfg = {
    BUY:  { color: T.buy,  bg: '#4C9A7822', Icon: TrendingUp,  label: 'BUY'  },
    SELL: { color: T.sell, bg: '#C1543B22', Icon: TrendingDown, label: 'SELL' },
    HOLD: { color: T.inkMuted, bg: '#8A93A622', Icon: Minus, label: 'HOLD' },
  };
  const cfg = signalCfg[signal.signal as keyof typeof signalCfg] ?? signalCfg.HOLD;

  const qty = parseFloat(quantity) || 0;
  const entry = levels.buyAbove ?? (levels.entryZone?.upper ?? null);
  const potGainT1 = entry != null && levels.target1 != null && qty > 0 ? qty * (levels.target1 - entry) : null;
  const potGainT2 = entry != null && levels.target2 != null && qty > 0 ? qty * (levels.target2 - entry) : null;
  const potLossSL = entry != null && levels.stopLoss != null && qty > 0 ? qty * (entry - levels.stopLoss) : null;

  const slColor = levels.stopLossStatus === 'hit' ? T.sell : T.brass;

  const dataDate = levels.dataTimestamp
    ? new Date(levels.dataTimestamp).toLocaleDateString('en-IN', {
        day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata',
      })
    : null;

  return (
    <div className={`bg-panel border rounded-xl p-5 ${mode === 'simulation' ? 'border-brass border-dashed' : 'border-line'}`}>
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="font-display font-extrabold text-[15px]">Trade Card</div>
          {/* Mode badge */}
          <div
            className="font-mono text-[9px] font-semibold px-2 py-0.5 rounded-full border uppercase tracking-wider"
            style={
              mode === 'live'
                ? { color: T.buy,     borderColor: T.buy + '55',     background: T.buy + '18'     }
                : { color: T.inkMuted, borderColor: T.inkMuted + '55', background: T.inkMuted + '18' }
            }
          >
            {mode === 'live' ? '● Live' : '◌ Simulation'}
          </div>
        </div>
        {/* Signal badge */}
        <div className="flex gap-2 items-center">
          {mode === 'simulation' && (
            <div className="font-display font-extrabold text-[10px] text-brass uppercase tracking-widest bg-brass/10 px-2 py-1 rounded-sm border border-brass/30">
              Simulated Signal
            </div>
          )}
          <div
            className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold px-3 py-1 rounded-full"
            style={{ color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.color}55` }}
          >
            <cfg.Icon size={12} strokeWidth={2.5} />
            {cfg.label}
          </div>
        </div>
      </div>

      {dataDate && (
        <div className="font-mono text-[9.5px] text-ink-muted mb-3">
          As of {dataDate}
        </div>
      )}

      {/* ── Delayed Data Warning ── */}
      <div className="mb-3 flex items-start gap-2 bg-[#C1543B15] border border-sell/40 rounded-lg p-2.5">
        <TriangleAlert size={14} className="text-sell mt-px shrink-0" />
        <div className="font-mono text-[10.5px] text-sell leading-relaxed font-semibold">
          Prices may be up to 15 minutes delayed — confirm the live price with your broker before acting.
        </div>
      </div>

      {/* ── Divider ── */}
      <div className="border-t border-line mb-1" />

      {/* ── Price rows ── */}
      {signal.signal === 'BUY' && levels.buyAbove != null ? (
        <TradeRow
          label="Buy above"
          value={fmtPrice(levels.buyAbove)}
          valueColor={T.buy}
          sourceKey="buyAbove"
        />
      ) : signal.signal === 'SELL' ? (
        <div className="py-[9px] font-mono text-[11px] text-sell">
          Signal is SELL — no long entry trigger.
        </div>
      ) : (
        <div className="py-[9px] font-mono text-[11px] text-ink-muted">
          Signal is HOLD — waiting for setup.
        </div>
      )}

      {levels.target1 != null && (
        <TradeRow
          label="Target 1"
          value={fmtPrice(levels.target1)}
          valueColor={T.buy}
          arrow
          sourceKey="target1"
        />
      )}

      {levels.target2 != null && (
        <TradeRow
          label="Target 2"
          value={fmtPrice(levels.target2)}
          valueColor={T.buy}
          arrow
          sourceKey="target2"
        />
      )}

      {levels.stopLoss != null && (
        <TradeRow
          label="Stop-loss"
          value={fmtPrice(levels.stopLoss)}
          valueColor={slColor}
          sourceKey="stopLoss"
        />
      )}

      {levels.stopLossStatus != null && (
        <TradeRow
          label="SL status"
          value=""
          sourceKey="stopLossStatus"
          badge={
            <span
              className="font-mono text-[10px] font-semibold px-2 py-0.5 rounded-full"
              style={
                levels.stopLossStatus === 'hit'
                  ? { color: T.sell, background: T.sell + '20', border: `1px solid ${T.sell}55` }
                  : { color: T.brass, background: T.brass + '18', border: `1px solid ${T.brass}55` }
              }
            >
              {levels.stopLossStatus === 'hit' ? 'SL: Hit' : 'SL: Active'}
            </span>
          }
        />
      )}

      {/* ── Divider ── */}
      <div className="border-t border-dashed border-line mt-1 mb-3" />

      {/* ── Quantity input ── */}
      <div className="mb-3">
        <div className="font-mono text-[10px] text-ink-muted mb-1.5 tracking-wide uppercase">Quantity (lots / shares)</div>
        <input
          type="number"
          min="0"
          step="1"
          placeholder="e.g. 10"
          value={quantity}
          onChange={e => setQuantity(e.target.value)}
          className="bg-bg border border-line rounded px-2.5 py-1.5 font-mono text-sm text-ink outline-none focus:border-brass transition-colors w-full"
        />
        <div className="font-mono text-[9px] text-ink-muted mt-1">
          Your choice of position size — not computed by the engine
        </div>
      </div>

      {/* ── Arithmetic display (only when qty > 0 and entry known) ── */}
      {qty > 0 && entry != null && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
          {potGainT1 != null && (
            <div className="bg-panel-raised rounded-lg px-3 py-2 border border-buy/20">
              <div className="font-mono text-[9px] text-ink-muted mb-0.5">Potential gain (T1)</div>
              <div className="font-mono text-sm font-semibold" style={{ color: T.buy }}>
                +{fmtGainLoss(potGainT1)}
              </div>
              <div className="font-mono text-[8.5px] text-ink-muted mt-0.5">{qty} × ₹{(levels.target1! - entry).toFixed(2)}</div>
            </div>
          )}
          {potGainT2 != null && (
            <div className="bg-panel-raised rounded-lg px-3 py-2 border border-buy/20">
              <div className="font-mono text-[9px] text-ink-muted mb-0.5">Potential gain (T2)</div>
              <div className="font-mono text-sm font-semibold" style={{ color: T.buy }}>
                +{fmtGainLoss(potGainT2)}
              </div>
              <div className="font-mono text-[8.5px] text-ink-muted mt-0.5">{qty} × ₹{(levels.target2! - entry).toFixed(2)}</div>
            </div>
          )}
          {potLossSL != null && (
            <div className="bg-panel-raised rounded-lg px-3 py-2 border border-sell/20">
              <div className="font-mono text-[9px] text-ink-muted mb-0.5">Potential loss (SL)</div>
              <div className="font-mono text-sm font-semibold" style={{ color: T.sell }}>
                −{fmtGainLoss(potLossSL)}
              </div>
              <div className="font-mono text-[8.5px] text-ink-muted mt-0.5">{qty} × ₹{(entry - levels.stopLoss!).toFixed(2)}</div>
            </div>
          )}
        </div>
      )}

      {/* ── Disclaimer (always visible) ── */}
      <div className="bg-[#C98A2C08] border border-brass/25 rounded-lg px-3 py-2.5 flex gap-2 items-start">
        <div className="shrink-0 flex gap-1 mt-0.5">
          <ShieldAlert size={12} className="text-brass" />
          <Target size={12} className="text-brass" />
        </div>
        <div className="font-mono text-[10px] text-brass leading-relaxed">
          <strong>Decision support only</strong> — all levels computed from ATR(14) and support/resistance, not a prediction of price.
          "Potential" figures are arithmetic only, not guaranteed outcomes.{' '}
          <strong>Data may be delayed ~15 min. Do not use as real-time execution triggers.</strong>
        </div>
      </div>

      {/* ── ATR context footer ── */}
      {levels.atrValue != null && (
        <div className="mt-2 font-mono text-[9.5px] text-ink-muted flex items-center gap-1.5">
          <TriangleAlert size={10} className="text-ink-muted shrink-0" />
          ATR(14) = {fmtPrice(levels.atrValue)} · all stop distances derived from this
        </div>
      )}
    </div>
  );
}
