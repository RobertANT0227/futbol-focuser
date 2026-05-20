// CENTO-V2
import { cn } from '@/lib/utils';
import type { QualityBand } from '@/lib/cento-v2/engine/types';

const STYLE: Record<QualityBand, string> = {
  Excellent: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
  Good: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
  Limited: 'bg-rose-500/15 text-rose-300 border-rose-500/40',
};

export function QualityChip({ band, className }: { band: QualityBand; className?: string }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-[10px] font-bold uppercase tracking-widest',
      STYLE[band], className,
    )}>
      <span className="opacity-70">date</span>
      <span>{band}</span>
    </span>
  );
}