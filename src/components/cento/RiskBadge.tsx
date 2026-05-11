import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const TONE: Record<string, string> = {
  low: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  medium: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  high: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
};

export function RiskBadge({ risk }: { risk: 'low' | 'medium' | 'high' }) {
  return (
    <Badge variant="outline" className={cn('uppercase text-[10px] tracking-wider font-semibold border', TONE[risk])}>
      {risk}
    </Badge>
  );
}