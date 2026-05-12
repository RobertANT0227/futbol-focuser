import { cn } from '@/lib/utils';
import type { DataQuality } from '@/lib/cento/engine/types';

const STYLE: Record<DataQuality['band'], string> = {
  Excellent: 'bg-primary/15 text-primary border-primary/30',
  Good:      'bg-accent/15 text-accent border-accent/30',
  Limited:   'bg-secondary text-muted-foreground border-border',
};

export function QualityChip({ quality, className }: { quality: DataQuality; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-bold uppercase tracking-wider', STYLE[quality.band], className)}>
      <span className="opacity-70">data</span>
      <span>{quality.band}</span>
    </span>
  );
}