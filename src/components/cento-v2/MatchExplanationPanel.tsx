// CENTO-V2
import type { MarketResult } from '@/lib/cento-v2/engine/types';

const SRC_LABEL: Record<string, string> = {
  home_team: 'Gazdă',
  away_team: 'Oaspete',
  pre_match: 'Pre-meci',
  league: 'Ligă',
  derived: 'Derivat',
};

export function MatchExplanationPanel({ market }: { market: MarketResult }) {
  const e = market.explanation;
  return (
    <div className="space-y-3 text-xs">
      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Semnale folosite</div>
        <div className="space-y-1.5">
          {e.signals.map((s, i) => (
            <div key={i} className="flex items-center justify-between gap-2 rounded border border-border/40 bg-secondary/30 px-2 py-1.5">
              <div className="min-w-0">
                <div className="text-[11px] font-medium truncate">{s.label}</div>
                <div className="text-[9px] text-muted-foreground uppercase tracking-wider">{SRC_LABEL[s.source]} · pondere {(s.weight * 100).toFixed(0)}%</div>
              </div>
              <div className="font-mono font-bold text-sm">{(s.value * 100).toFixed(1)}%</div>
            </div>
          ))}
        </div>
      </div>
      {e.boosters.length > 0 && (
        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-widest text-emerald-400">Boosters</div>
          {e.boosters.map((b, i) => <div key={i} className="text-emerald-300/90 text-[11px]">✓ {b}</div>)}
        </div>
      )}
      {e.reducers.length > 0 && (
        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-widest text-amber-400">Reducers</div>
          {e.reducers.map((b, i) => <div key={i} className="text-amber-300/90 text-[11px]">↓ {b}</div>)}
        </div>
      )}
      {e.riskFactors.length > 0 && (
        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-widest text-rose-400">Risc</div>
          {e.riskFactors.map((b, i) => <div key={i} className="text-rose-300/90 text-[11px]">⚠ {b}</div>)}
        </div>
      )}
    </div>
  );
}