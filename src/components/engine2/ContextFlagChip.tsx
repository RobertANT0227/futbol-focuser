import { CONTEXT_FLAG_LABEL, type ContextFlag } from '@/lib/engine2/types';
import { cn } from '@/lib/utils';

const STYLE: Record<ContextFlag, string> = {
  EARLY_SEASON: 'bg-accent/15 text-accent border-accent/30',
  HIGH_VOLATILITY: 'bg-destructive/15 text-destructive border-destructive/30',
  STRONG_HOME_ENV: 'bg-primary/15 text-primary border-primary/30',
  LOW_SCORING_LEAGUE: 'bg-secondary text-secondary-foreground border-border',
  HIGH_DRAW_TENDENCY: 'bg-accent/10 text-accent border-accent/25',
  LATE_SCORING_TEAMS: 'bg-bet-corners/15 text-bet-corners border-bet-corners/30',
  INCONSISTENT_FORM: 'bg-destructive/10 text-destructive border-destructive/25',
};

export function ContextFlagChip({ flag, className }: { flag: ContextFlag; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-bold uppercase tracking-wider', STYLE[flag], className)}>
      {CONTEXT_FLAG_LABEL[flag]}
    </span>
  );
}