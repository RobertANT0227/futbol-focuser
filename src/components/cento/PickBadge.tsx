import type { PickGrade } from '@/lib/cento/engine/types';
import { cn } from '@/lib/utils';

const STYLE: Record<PickGrade, string> = {
  STRONG: 'bg-primary/20 border-primary/50 text-primary',
  MEDIUM: 'bg-accent/20 border-accent/50 text-accent',
  RISKY:  'bg-secondary border-border text-secondary-foreground',
  PASS:   'bg-muted border-border text-muted-foreground',
};
const LABEL: Record<PickGrade, string> = {
  STRONG: 'Strong Pick', MEDIUM: 'Medium Pick', RISKY: 'Risky Pick', PASS: 'PASS',
};
const ICON: Record<PickGrade, string> = { STRONG: '🟢', MEDIUM: '🟡', RISKY: '🟠', PASS: '⚪' };

export function PickBadge({ grade, className }: { grade: PickGrade; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border font-bold text-xs uppercase tracking-wider', STYLE[grade], className)}>
      <span>{ICON[grade]}</span> {LABEL[grade]}
    </span>
  );
}