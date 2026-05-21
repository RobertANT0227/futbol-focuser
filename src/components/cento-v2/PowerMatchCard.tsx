// CENTO-V2
import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { PickBadge } from './PickBadge';
import { QualityChip } from './QualityChip';
import { RatingBar } from './RatingBar';
import { MatchExplanationPanel } from './MatchExplanationPanel';
import type { PowerAnalysis } from '@/lib/cento-v2/engine/types';

function fmtDate(d: string | null) {
  if (!d) return 'TBD';
  return new Date(d).toLocaleDateString('ro-RO', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function PowerMatchCard({ a }: { a: PowerAnalysis }) {
  const [open, setOpen] = useState(false);
  const top = a.topPick;
  const isPass = top.grade === 'PASS';

  return (
    <Card className="overflow-hidden border-border/60 bg-gradient-to-b from-card to-card/40 backdrop-blur-sm">
      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
              {a.leagueName} · {fmtDate(a.matchDate)}
            </div>
            <h3 className="text-base font-bold leading-tight">
              {a.home} <span className="text-muted-foreground font-normal text-sm">vs</span> {a.away}
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <QualityChip band={a.quality} />
            <PickBadge grade={top.grade} />
          </div>
        </div>

        <div className={cn(
          'rounded-xl border p-3 flex items-center justify-between gap-3 flex-wrap',
          isPass
            ? 'border-muted bg-muted/10'
            : 'border-primary/30 bg-primary/[0.06] shadow-[0_0_30px_-12px_hsl(248_91%_67%/0.35)]',
        )}>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Top pick</div>
            <div className="text-lg font-bold">{top.label}</div>
            <div className="text-[11px] font-mono text-muted-foreground">
              {top.odds ? `cota ${top.odds.toFixed(2)}` : 'fără cotă disponibilă'}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Probabilitate</div>
            <div className="text-2xl font-mono font-bold">{(top.probability * 100).toFixed(1)}%</div>
            <div className="text-[10px] text-muted-foreground font-mono">conf {top.confidence}/100</div>
            <div className="text-[10px] font-bold text-primary mt-0.5">
              {top.stakeUnits ? `${top.stakeUnits}u recomandat` : 'fără miză'}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {!isPass && (
            <Link
              to={`/bankroll?pick=${encodeURIComponent(`${a.home} vs ${a.away}`)}&sel=${encodeURIComponent(top.label)}&prob=${top.probability.toFixed(4)}${top.odds ? `&odds=${top.odds.toFixed(2)}` : ''}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-primary/40 bg-primary/10 hover:bg-primary/20 text-primary text-[11px] font-bold uppercase tracking-wider transition"
            >
              <Wallet className="h-3.5 w-3.5" /> Adaugă în Bankroll
            </Link>
          )}
          <Collapsible open={open} onOpenChange={setOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-[11px]">
                <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
                {open ? 'Ascunde detalii' : 'Detalii & alte piețe'}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Card className="p-3 bg-card/60 space-y-2">
                  <div className="text-xs font-bold">{a.home} <span className="text-[10px] text-muted-foreground">acasă</span></div>
                  <RatingBar label="Atac" value={a.homeRatings.attack} />
                  <RatingBar label="Apărare" value={a.homeRatings.defense} />
                  <RatingBar label="Formă" value={a.homeRatings.form} />
                  <RatingBar label="Tempo" value={a.homeRatings.tempo} />
                  <RatingBar label="Volatilitate" value={a.homeRatings.volatility} />
                </Card>
                <Card className="p-3 bg-card/60 space-y-2">
                  <div className="text-xs font-bold">{a.away} <span className="text-[10px] text-muted-foreground">deplasare</span></div>
                  <RatingBar label="Atac" value={a.awayRatings.attack} />
                  <RatingBar label="Apărare" value={a.awayRatings.defense} />
                  <RatingBar label="Formă" value={a.awayRatings.form} />
                  <RatingBar label="Tempo" value={a.awayRatings.tempo} />
                  <RatingBar label="Volatilitate" value={a.awayRatings.volatility} />
                </Card>
              </div>
              <Card className="p-3 bg-card/40">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
                  De ce {top.label} ({top.grade})
                </div>
                <MatchExplanationPanel market={top} />
              </Card>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </div>
    </Card>
  );
}