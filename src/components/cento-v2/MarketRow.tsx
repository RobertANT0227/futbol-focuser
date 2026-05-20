// CENTO-V2
import { cn } from '@/lib/utils';
import { PickBadge } from './PickBadge';
import type { MarketResult } from '@/lib/cento-v2/engine/types';

export function MarketRow({ m, highlight }: { m: MarketResult; highlight?: boolean }) {
  return (
    <div className={cn(
      'rounded-lg border p-2.5 flex items-center justify-between gap-3 transition-colors',
      highlight ? 'border-primary/40 bg-primary/5' : 'border-border/40 bg-secondary/30',
    )}>
      <div className="min-w-0">
        <div className="text-sm font-semibold truncate">{m.label}</div>
        <div className="text-[10px] font-mono text-muted-foreground">
          {m.odds ? `cota ${m.odds.toFixed(2)}` : 'fără cotă'} · conf {m.confidence}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="font-mono font-bold text-base">{(m.probability * 100).toFixed(1)}%</span>
        <PickBadge grade={m.grade} />
      </div>
    </div>
  );
}