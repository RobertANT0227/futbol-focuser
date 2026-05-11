import { cn } from '@/lib/utils';

export function EdgeBar({ value, className }: { value: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, (value / 25) * 100));
  const tone = value >= 8 ? 'bg-primary' : value >= 4 ? 'bg-accent' : 'bg-muted-foreground/40';
  return (
    <div className={cn('h-1.5 w-full rounded-full bg-muted overflow-hidden', className)}>
      <div className={cn('h-full transition-all', tone)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function ConfidenceBar({ value }: { value: number }) {
  return (
    <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
      <div
        className="h-full bg-gradient-to-r from-amber-500 via-emerald-500 to-emerald-400"
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}