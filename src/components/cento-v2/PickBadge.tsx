// CENTO-V2
import { cn } from '@/lib/utils';
import type { PickGrade } from '@/lib/cento-v2/engine/types';

const STYLE: Record<PickGrade, string> = {
  STRONG: 'bg-[hsl(248_91%_67%/0.2)] border-[hsl(248_91%_67%/0.5)] text-[hsl(248_91%_75%)] shadow-[0_0_18px_-4px_hsl(248_91%_67%/0.6)]',
  MEDIUM: 'bg-[hsl(217_91%_60%/0.18)] border-[hsl(217_91%_60%/0.4)] text-[hsl(217_91%_75%)]',
  RISKY: 'bg-[hsl(38_92%_50%/0.18)] border-[hsl(38_92%_50%/0.4)] text-[hsl(38_92%_65%)]',
  PASS: 'bg-[hsl(220_9%_46%/0.15)] border-[hsl(220_9%_46%/0.3)] text-muted-foreground',
};

export function PickBadge({ grade, className }: { grade: PickGrade; className?: string }) {
  return (
    <span className={cn(
      'inline-flex items-center px-2.5 py-0.5 rounded-md border text-[10px] font-bold uppercase tracking-widest',
      STYLE[grade], className,
    )}>{grade}</span>
  );
}