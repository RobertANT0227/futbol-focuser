// CENTO-V2
import { cn } from '@/lib/utils';

function color(v: number): string {
  if (v >= 70) return 'bg-emerald-500';
  if (v >= 50) return 'bg-amber-500';
  return 'bg-rose-500';
}

export function RatingBar({ label, value }: { label: string; value: number }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-muted-foreground uppercase tracking-wider">{label}</span>
        <span className="font-mono text-foreground/90">{v.toFixed(1)}</span>
      </div>
      <div className="h-1.5 rounded-full bg-secondary/60 overflow-hidden">
        <div className={cn('h-full rounded-full transition-all', color(v))} style={{ width: `${v}%` }} />
      </div>
    </div>
  );
}