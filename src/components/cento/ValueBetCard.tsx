import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Bookmark, Swords, AlertTriangle } from 'lucide-react';
import type { ValueBet } from '@/lib/cento/types';
import { ConfidenceBar } from './EdgeBar';
import { RiskBadge } from './RiskBadge';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface Props {
  bet: ValueBet;
  onSave?: (bet: ValueBet) => void;
  hideStyles?: boolean;
}

export function ValueBetCard({ bet, onSave, hideStyles }: Props) {
  return (
    <Card className="p-4 bg-card/60 backdrop-blur-sm border-border/60 hover:border-primary/40 transition-all group">
      <div className="flex items-start justify-between mb-3">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono mb-1">
            {bet.league || '—'}
          </div>
          <div className="font-semibold text-sm truncate">
            {bet.home} <span className="text-muted-foreground font-normal">vs</span> {bet.away}
          </div>
          {!hideStyles && (
            <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
              <span>{bet.homeStyle}</span>
              {bet.styleClash && <Swords className="h-3 w-3 text-accent" />}
              <span>{bet.awayStyle}</span>
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          <RiskBadge risk={bet.risk} />
          {bet.dataReliability !== 'high' && (
            <Badge
              variant="outline"
              title={bet.missingStats.length ? `Lipsesc: ${bet.missingStats.join(', ')}` : ''}
              className={cn(
                'uppercase text-[9px] tracking-wider font-semibold border flex items-center gap-1',
                bet.dataReliability === 'low'
                  ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                  : 'bg-amber-500/15 text-amber-300 border-amber-500/30',
              )}
            >
              <AlertTriangle className="h-2.5 w-2.5" />
              {bet.dataReliability === 'low' ? 'Low Data' : 'Partial Data'}
              <span className="font-mono opacity-70">
                {Math.round(bet.dataCompleteness * 100)}%
              </span>
            </Badge>
          )}
        </div>
      </div>

      <div className="rounded-md bg-background/50 border border-border/40 p-3 mb-3">
        <div className="flex items-baseline justify-between mb-2">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Pronostic</div>
            <div className="font-bold text-base text-primary">{bet.market}</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Cota</div>
            <div className="font-mono font-bold text-base">{bet.odds.toFixed(2)}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-center mt-3">
          <div>
            <div className="text-[10px] text-muted-foreground uppercase">Win Rate</div>
            <div className="font-mono text-sm font-semibold text-primary">{(bet.modelWR * 100).toFixed(1)}%</div>
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground uppercase">Confidence</div>
            <div className="font-mono text-sm font-semibold">{bet.confidence}%</div>
          </div>
        </div>
      </div>

      <div className="space-y-2 mb-3">
        <div>
          <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
            <span>Confidence</span><span>{bet.confidence}%</span>
          </div>
          <ConfidenceBar value={bet.confidence} />
        </div>
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-border/40">
        <div>
          <div className="text-[10px] text-muted-foreground uppercase">Stake sugerat</div>
          <div className="font-mono font-bold text-sm">
            {bet.suggestedStakeLei} <span className="text-muted-foreground font-normal">LEI</span>
            <span className="text-muted-foreground text-[10px] ml-2">({(bet.suggestedStakePct * 100).toFixed(1)}%)</span>
          </div>
        </div>
        {onSave && (
          <Button size="sm" variant="ghost" onClick={() => onSave(bet)} className="opacity-0 group-hover:opacity-100 transition">
            <Bookmark className="h-4 w-4" />
          </Button>
        )}
      </div>
    </Card>
  );
}