import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { PickBadge } from './PickBadge';
import { RatingBar } from './RatingBar';
import { QualityChip } from './QualityChip';
import type { PowerAnalysis } from '@/lib/cento/engine/types';
import { cn } from '@/lib/utils';
import { deriveConfidence, CONFIDENCE_LABEL, type ConfidenceLevel } from '@/lib/bankroll';
import { MatchAnalysisDialog } from './MatchAnalysisDialog';

function fmtPct(n: number) { return `${(n * 100).toFixed(0)}%`; }

const CONF_TIER_STYLE: Record<ConfidenceLevel, string> = {
  VERY_LOW: 'bg-destructive/20 border-destructive/50 text-destructive',
  LOW: 'bg-destructive/10 border-destructive/30 text-destructive',
  MEDIUM: 'bg-accent/20 border-accent/50 text-accent',
  HIGH: 'bg-primary/15 border-primary/40 text-primary',
  VERY_HIGH: 'bg-primary/25 border-primary/60 text-primary',
};

/** Map PowerAnalysis -> the same deriveConfidence() used on dashboard. */
function powerToConfidence(a: PowerAnalysis): ConfidenceLevel {
  const winRate = a.topMarket.prob * 100;
  const modelConfidence: 'high' | 'medium' | 'low' =
    a.confidence >= 70 ? 'high' : a.confidence >= 50 ? 'medium' : 'low';
  const stability = Math.max(0, Math.min(1, a.quality.coverage * (1 - (a.quality.smallSamplePenalty ?? 0))));
  const odds = a.topMarket.odds;
  const value = odds ? (a.topMarket.prob * odds - 1) * 100 : 0;
  const risk: 'low' | 'medium' | 'high' =
    a.grade === 'STRONG' ? 'low' : a.grade === 'MEDIUM' ? 'medium' : 'high';
  const fragile = a.quality.band === 'Limited';
  return deriveConfidence({ modelConfidence, winRate, value, stability, risk, fragile });
}

function fmtDate(d: string | null) {
  if (!d) return 'TBD';
  return new Date(d).toLocaleDateString('ro-RO', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function PowerMatchCard({ a, leagueName }: { a: PowerAnalysis; leagueName?: string }) {
  const { match, ratingsHome: rh, ratingsAway: ra, probabilities, topMarket, confidence, grade, stakeUnits, quality, context, explanation, expectedGoalsHome, expectedGoalsAway, conflicts, homeTeam, awayTeam } = a;
  const confTier = powerToConfidence(a);

  // Build human reason for PASS
  const passReasons: string[] = [];
  if (grade === 'PASS') {
    const sorted = [...probabilities].sort((x, y) => y.prob - x.prob);
    const dispersion = sorted[0].prob - sorted[1].prob;
    const impliedTop = sorted[0].odds && sorted[0].odds > 1 ? 1 / sorted[0].odds : null;
    const edge = impliedTop !== null ? sorted[0].prob - impliedTop : null;
    if (confidence < 50) passReasons.push(`Confidence ${confidence}/100 sub pragul 50.`);
    if (dispersion < 0.04) passReasons.push(`Dispersie pick top doar ${(dispersion * 100).toFixed(1)}% — piețe prea apropiate.`);
    if (edge !== null && edge < 0.01) passReasons.push(`Edge față de cotă ${(edge * 100).toFixed(1)}% — fără value.`);
    if (edge === null) passReasons.push('Lipsă cote pe piața dominantă — nu pot calcula value.');
    if (quality.band === 'Limited') passReasons.push('Acoperire date limitată.');
    if (quality.smallSamplePenalty > 0.2) passReasons.push(`Eșantion mic (${quality.sampleHome}/${quality.sampleAway} meciuri).`);
    if (!homeTeam) passReasons.push(`Nu am găsit profilul echipei "${match.home}" în CSV teams.`);
    if (!awayTeam) passReasons.push(`Nu am găsit profilul echipei "${match.away}" în CSV teams.`);
    if (conflicts.length) passReasons.push(`Conflict piețe: ${conflicts.length}.`);
    if (passReasons.length === 0) passReasons.push('Niciun semnal cu edge clar — modelul preferă să nu recomande.');
  }

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
        <MatchAnalysisDialog a={a} leagueName={leagueName}>
          <button className="space-y-1 text-left group" type="button">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground">
              <span>{leagueName ?? 'Liga'}</span>
              <span>·</span>
              <span>{fmtDate(match.date)}</span>
              <span className="ml-1 text-primary opacity-0 group-hover:opacity-100 transition">🔍 analiza pas cu pas</span>
            </div>
            <h3 className="text-lg font-bold leading-tight group-hover:text-primary transition">
              {match.home} <span className="text-muted-foreground font-normal text-sm">vs</span> {match.away}
            </h3>
          </button>
        </MatchAnalysisDialog>
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
            <div className={cn(
              'inline-block mt-1 px-2 py-0.5 rounded border text-[10px] font-bold uppercase tracking-wider',
              CONF_TIER_STYLE[confTier],
            )}>
              {CONFIDENCE_LABEL[confTier]}
            </div>
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