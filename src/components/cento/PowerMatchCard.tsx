import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { PickBadge } from './PickBadge';
import { RatingBar } from './RatingBar';
import { QualityChip } from './QualityChip';
import type { PowerAnalysis } from '@/lib/cento/engine/types';
import { cn } from '@/lib/utils';

function fmtPct(n: number) { return `${(n * 100).toFixed(0)}%`; }
function fmtDate(d: string | null) {
  if (!d) return 'TBD';
  return new Date(d).toLocaleDateString('ro-RO', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function PowerMatchCard({ a, leagueName }: { a: PowerAnalysis; leagueName?: string }) {
  const { match, ratingsHome: rh, ratingsAway: ra, probabilities, topMarket, confidence, grade, stakeUnits, quality, context, explanation, expectedGoalsHome, expectedGoalsAway } = a;

  const formStrip = (form: string[]) => (
    <div className="flex gap-1">
      {form.slice(0, 5).map((r, i) => (
        <span key={i} className={cn(
          'inline-flex items-center justify-center h-5 w-5 rounded-sm text-[10px] font-bold',
          r === 'W' ? 'bg-primary/30 text-primary' : r === 'D' ? 'bg-accent/30 text-accent' : 'bg-destructive/25 text-destructive',
        )}>{r}</span>
      ))}
      {!form.length && <span className="text-[10px] text-muted-foreground">—</span>}
    </div>
  );

  return (
    <Card className="p-5 space-y-4 bg-gradient-to-b from-card to-card/40 border-border/60 backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground">
            <span>{leagueName ?? 'Liga'}</span>
            <span>·</span>
            <span>{fmtDate(match.date)}</span>
          </div>
          <h3 className="text-lg font-bold leading-tight">
            {match.home} <span className="text-muted-foreground font-normal text-sm">vs</span> {match.away}
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <QualityChip quality={quality} />
          <PickBadge grade={grade} />
        </div>
      </div>

      {/* Top pick block */}
      {grade !== 'PASS' ? (
        <div className="rounded-lg border border-primary/25 bg-primary/5 p-3 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Final Pick</div>
            <div className="text-base font-bold">{topMarket.label} <span className="font-mono text-primary">{fmtPct(topMarket.prob)}</span></div>
            {topMarket.odds && <div className="text-[11px] text-muted-foreground font-mono">cota {topMarket.odds.toFixed(2)}</div>}
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Confidence</div>
            <div className="text-2xl font-mono font-bold text-foreground">{confidence}</div>
            <div className="text-[10px] font-bold text-accent">{stakeUnits}U</div>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
          Modelul recomandă <strong className="text-foreground">PASS</strong> — variabilitate mare sau date insuficiente.
        </div>
      )}

      {/* Probabilities */}
      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Piețe analizate</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
          {probabilities.map((p) => (
            <div key={p.key} className={cn(
              'rounded-md border bg-secondary/40 p-2 text-center',
              p.key === topMarket.key ? 'border-primary/50' : 'border-border/40',
            )}>
              <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{p.label}</div>
              <div className="text-sm font-mono font-bold">{fmtPct(p.prob)}</div>
              {p.odds && <div className="text-[9px] text-muted-foreground font-mono">@{p.odds.toFixed(2)}</div>}
            </div>
          ))}
        </div>
      </div>

      {/* Ratings & xG */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card className="p-3 bg-card/60 space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-xs font-bold">{match.home} <span className="text-muted-foreground text-[10px]">acasă</span></div>
            {formStrip(a.homeTeam?.form ?? [])}
          </div>
          <RatingBar label="Atac" value={rh.attack} accent="attack" />
          <RatingBar label="Apărare" value={rh.defense} accent="defense" />
          <RatingBar label="Formă" value={rh.form} />
          <RatingBar label="Momentum" value={rh.momentum} />
          <RatingBar label="Stabilitate def." value={rh.defensiveStability} />
          <RatingBar label="Volatilitate" value={rh.matchVolatility} accent="risk" />
          <div className="flex items-center justify-between text-[11px] mt-2">
            <span className="text-muted-foreground">xG estimat</span>
            <span className="font-mono font-bold text-primary">{expectedGoalsHome.toFixed(2)}</span>
          </div>
        </Card>
        <Card className="p-3 bg-card/60 space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-xs font-bold">{match.away} <span className="text-muted-foreground text-[10px]">deplasare</span></div>
            {formStrip(a.awayTeam?.form ?? [])}
          </div>
          <RatingBar label="Atac" value={ra.attack} accent="attack" />
          <RatingBar label="Apărare" value={ra.defense} accent="defense" />
          <RatingBar label="Formă" value={ra.form} />
          <RatingBar label="Momentum" value={ra.momentum} />
          <RatingBar label="Stabilitate def." value={ra.defensiveStability} />
          <RatingBar label="Volatilitate" value={ra.matchVolatility} accent="risk" />
          <div className="flex items-center justify-between text-[11px] mt-2">
            <span className="text-muted-foreground">xG estimat</span>
            <span className="font-mono font-bold text-destructive">{expectedGoalsAway.toFixed(2)}</span>
          </div>
        </Card>
      </div>

      {/* Tempo + confidence bar */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-3 bg-card/60">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Match Tempo</div>
          <Progress value={rh.matchTempo} className="h-1.5" />
          <div className="text-[11px] font-mono mt-1">{rh.matchTempo.toFixed(0)} / 100</div>
        </Card>
        <Card className="p-3 bg-card/60">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Confidence Score</div>
          <Progress value={confidence} className="h-1.5" />
          <div className="text-[11px] font-mono mt-1">{confidence} / 100</div>
        </Card>
      </div>

      {/* Explanation */}
      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">De ce acest pick</div>
        <ul className="space-y-1">
          {explanation.map((b, i) => (
            <li key={i} className={cn(
              'text-xs flex items-start gap-2',
              b.kind === 'support' ? 'text-foreground' : b.kind === 'risk' ? 'text-destructive/90' : 'text-muted-foreground',
            )}>
              <span className="mt-[2px]">{b.kind === 'support' ? '✓' : b.kind === 'risk' ? '⚠' : '•'}</span>
              <span>{b.text}</span>
            </li>
          ))}
        </ul>
        {context.motivationNote && (
          <Badge variant="outline" className="mt-2 text-[10px] font-normal">{context.motivationNote}</Badge>
        )}
      </div>
    </Card>
  );
}