import { cn } from '@/lib/utils';

export function RatingBar({ label, value, accent }: { label: string; value: number; accent?: 'attack' | 'defense' | 'tempo' | 'risk' | 'neutral' }) {
  const pct = Math.max(0, Math.min(100, value));
  const color = accent === 'attack'
    ? 'bg-accent'
    : accent === 'defense'
      ? 'bg-primary'
      : accent === 'tempo'
        ? 'bg-[hsl(var(--bet-corners))]'
        : accent === 'risk'
          ? 'bg-destructive'
          : 'bg-secondary-foreground';
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
        <span>{label}</span>
        <span className="font-mono text-foreground">{pct.toFixed(0)}</span>
      </div>
      <div className="h-1.5 w-full bg-secondary/60 rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}