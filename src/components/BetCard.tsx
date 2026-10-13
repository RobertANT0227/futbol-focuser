import type { BetRecommendation } from '@/lib/types';
import { CONFIDENCE_LABEL } from '@/lib/bankroll';

/**
 * Trader-style compact bet card.
 * Color coding:
 *  - Green: HIGH / VERY_HIGH confidence
 *  - Yellow: MEDIUM
 *  - Red: LOW / VERY_LOW
 */

function confidenceTone(conf: BetRecommendation['stakeConfidence']) {
  switch (conf) {
    case 'VERY_HIGH':
    case 'HIGH':
      return {
        border: 'border-primary/50',
        bg: 'bg-primary/5',
        chip: 'bg-primary/15 text-primary border-primary/30',
        dot: 'bg-primary',
      };
    case 'MEDIUM':
      return {
        border: 'border-accent/50',
        bg: 'bg-accent/5',
        chip: 'bg-accent/15 text-accent border-accent/30',
        dot: 'bg-accent',
      };
    default:
      return {
        border: 'border-destructive/40',
        bg: 'bg-destructive/5',
        chip: 'bg-destructive/15 text-destructive border-destructive/30',
        dot: 'bg-destructive',
      };
  }
}

function CategoryEmoji({ category }: { category: string }) {
  if (category === 'corners') return <span>⛳</span>;
  if (category === 'winner') return <span>🏆</span>;
  return <span>⚽</span>;
}

interface Props {
  bet: BetRecommendation;
  matchLabel?: string;
  rank?: number;
  compact?: boolean;
}

export function BetCard({ bet, matchLabel, rank, compact = false }: Props) {
  const tone = confidenceTone(bet.stakeConfidence);
  const stakePctDisplay = (bet.stakePct * 100).toFixed(0);

  return (
    <div className={`rounded-xl border-2 ${tone.border} ${tone.bg} p-4 transition-all hover:scale-[1.01]`}>
      {/* Top row: rank + match + confidence chip */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {typeof rank === 'number' && (
            <span className="text-xs font-mono text-muted-foreground w-6 shrink-0">#{rank}</span>
          )}
          <span className={`h-2 w-2 rounded-full shrink-0 ${tone.dot}`} />
          <div className="min-w-0">
            {matchLabel && (
              <div className="text-xs text-muted-foreground truncate">{matchLabel}</div>
            )}
            <div className="font-semibold text-foreground flex items-center gap-1.5 truncate">
              <CategoryEmoji category={bet.category} />
              <span className="truncate">{bet.selection}</span>
            </div>
          </div>
        </div>
        <span className={`text-[10px] font-bold px-2 py-1 rounded border ${tone.chip} shrink-0`}>
          {CONFIDENCE_LABEL[bet.stakeConfidence]}
        </span>
      </div>

      {/* Metrics grid */}
      <div className={`grid ${compact ? 'grid-cols-4' : 'grid-cols-2 md:grid-cols-5'} gap-2 text-xs`}>
        <Metric label="Cotă" value={bet.odds.toFixed(2)} mono />
        <Metric label="Probabilitate model" value={`${(bet.modelProbability * 100).toFixed(1)}%`} mono accent="primary" />
        <Metric
          label="EV"
          value={`${bet.ev > 0 ? '+' : ''}${(bet.ev * 100).toFixed(1)}%`}
          mono
          accent={bet.ev > 0 ? 'primary' : 'destructive'}
        />
        <Metric label="Stake" value={`${stakePctDisplay}%`} mono accent="accent" />
        {!compact && (
          <Metric label="Stake (lei)" value={bet.stakeLei.toFixed(2)} mono />
        )}
      </div>

      {bet.fragile && (
        <div className="mt-2 text-[10px] text-destructive flex items-center gap-1">
          ⚠ Scenariu fragil — stake limitat la max 2%
        </div>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  mono,
  accent,
}: {
  label: string;
  value: string;
  mono?: boolean;
  accent?: 'primary' | 'accent' | 'destructive';
}) {
  const colorClass =
    accent === 'primary'
      ? 'text-primary'
      : accent === 'accent'
      ? 'text-accent'
      : accent === 'destructive'
      ? 'text-destructive'
      : 'text-foreground';
  return (
    <div className="bg-secondary/40 rounded px-2 py-1.5">
      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</div>
      <div className={`text-sm font-semibold ${mono ? 'font-mono' : ''} ${colorClass}`}>{value}</div>
    </div>
  );
}
