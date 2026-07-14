import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface ReasoningLedgerProps {
  analysis: {
    signal: string;
    confidence: number;
    score: number;
    rules: { label: string; verdict: string; pts: number }[];
    historicalWinRate?: number;
  };
}

export default function ReasoningLedger({ analysis }: ReasoningLedgerProps) {
  const signalColors = {
    BUY: { color: "var(--color-buy)", bg: "var(--color-buy-dim)", Icon: TrendingUp },
    SELL: { color: "var(--color-sell)", bg: "var(--color-sell-dim)", Icon: TrendingDown },
    HOLD: { color: "var(--color-hold)", bg: "#8A93A622", Icon: Minus },
  };

  const cfg = signalColors[analysis.signal as keyof typeof signalColors] || signalColors.HOLD;

  return (
    <div className="bg-panel border border-line rounded-xl p-5">
      <div className="font-mono text-[11px] text-ink-muted tracking-[1px] mb-3 uppercase">
        CURRENT SIGNAL
      </div>
      
      <div 
        className="inline-flex items-center gap-2 rounded-lg font-display font-extrabold text-[22px] tracking-[1px] px-[18px] py-[10px]"
        style={{ color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.color}55` }}
      >
        <cfg.Icon size={22} strokeWidth={2.5} />
        {analysis.signal}
      </div>

      <div className="mt-3.5 mb-[18px]">
        <div className="flex justify-between font-mono text-[11px] text-ink-muted mb-1.5">
          <span>Confidence</span><span>{analysis.confidence}%</span>
        </div>
        <div className="h-1.5 bg-panel-raised rounded overflow-hidden">
          <div 
            className="h-full rounded" 
            style={{ width: `${analysis.confidence}%`, background: cfg.color }} 
          />
        </div>
        
        {analysis.historicalWinRate !== undefined && analysis.historicalWinRate > 0 && (
          <div className="mt-3 pt-3 border-t border-line border-dashed flex justify-between items-center">
            <span className="font-mono text-[10px] text-ink-muted">Historical Win Rate</span>
            <span 
              className="font-mono text-[11px] font-semibold px-2 py-0.5 rounded"
              style={{ 
                color: analysis.historicalWinRate >= 50 ? "var(--color-buy)" : "var(--color-sell)",
                background: analysis.historicalWinRate >= 50 ? "var(--color-buy-dim)" : "var(--color-sell-dim)"
              }}
            >
              {analysis.historicalWinRate.toFixed(1)}%
            </span>
          </div>
        )}
      </div>

      <div className="font-display font-extrabold text-xs tracking-[1px] text-ink-muted mb-2.5 border-t border-line pt-4">
        REASONING LEDGER
      </div>
      
      <div className="flex flex-col gap-0">
        {analysis.rules.map((r, i) => (
          <div key={i} className={`flex justify-between items-center py-[9px] ${i < analysis.rules.length - 1 ? 'border-b border-dashed border-line' : ''}`}>
            <div>
              <div className="font-body text-[12.5px] text-ink">{r.label}</div>
              <div className="font-mono text-[10.5px] text-ink-muted mt-0.5">{r.verdict}</div>
            </div>
            <div className="font-mono text-xs font-medium min-w-[30px] text-right" style={{ color: r.pts > 0 ? "var(--color-buy)" : r.pts < 0 ? "var(--color-sell)" : "var(--color-ink-muted)" }}>
              {r.pts > 0 ? "+" : ""}{r.pts}
            </div>
          </div>
        ))}
        
        <div className="flex justify-between pt-3 mt-1 border-t border-line">
          <div className="font-display font-extrabold text-xs">NET SCORE</div>
          <div className="font-mono font-bold text-[13px] text-brass">
            {analysis.score > 0 ? "+" : ""}{analysis.score} / 6
          </div>
        </div>
      </div>
    </div>
  );
}
