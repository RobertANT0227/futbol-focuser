import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import type { PowerAnalysis } from '@/lib/cento/engine/types';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

function pct(n: number | null | undefined, d = 0) {
  return typeof n === 'number' && Number.isFinite(n) ? `${n.toFixed(d)}%` : '—';
}
function num(n: number | null | undefined, d = 2) {
  return typeof n === 'number' && Number.isFinite(n) ? n.toFixed(d) : '—';
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="space-y-2 rounded-lg border border-border/60 bg-card/40 p-4">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-primary text-[11px] font-bold">{n}</span>
        <h4 className="text-sm font-bold uppercase tracking-wider">{title}</h4>
      </div>
      {children}
    </section>
  );
}

function Row({ label, value, mono = true, hi }: { label: string; value: ReactNode; mono?: boolean; hi?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn(mono && 'font-mono', hi && 'text-primary font-bold')}>{value}</span>
    </div>
  );
}

export function MatchAnalysisDialog({ a, leagueName, children }: { a: PowerAnalysis; leagueName?: string; children: ReactNode }) {
  const { match, homeTeam, awayTeam, league, ratingsHome: rh, ratingsAway: ra, expectedGoalsHome, expectedGoalsAway, probabilities, topMarket, confidence, grade, stakeUnits, quality, context, conflicts, explanation, narrative } = a;

  // step-5 confidence breakdown (mirrors pickEngine.ts math)
  const sorted = [...probabilities].sort((x, y) => y.prob - x.prob);
  const dispersion = sorted[0].prob - sorted[1].prob;
  const baseConf = 35;
  const coverageBoost = quality.coverage * 25;
  const dispersionBoost = Math.min(dispersion, 0.4) * 80;
  const samplePenalty = quality.smallSamplePenalty * 35;
  const conflictPenalty = conflicts.length * 8;

  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-3xl p-0">
        <DialogHeader className="px-6 pt-6 pb-2">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{leagueName ?? 'Liga'} · {match.date ?? 'TBD'}</div>
          <DialogTitle className="text-xl">{match.home} <span className="text-muted-foreground font-normal text-base">vs</span> {match.away}</DialogTitle>
          <div className="flex items-center gap-2 pt-1">
            <Badge variant="outline" className="text-[10px]">Pick: {topMarket.label}</Badge>
            <Badge variant="outline" className="text-[10px]">Grade: {grade}</Badge>
            <Badge variant="outline" className="text-[10px]">Confidence {confidence}/100</Badge>
            <Badge variant="outline" className="text-[10px]">{stakeUnits}U</Badge>
            <Badge variant="outline" className="text-[10px]">{quality.band}</Badge>
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[75vh]">
          <div className="px-6 py-4 space-y-4">
            <p className="text-xs italic text-muted-foreground border-l-2 border-primary/40 pl-3">{narrative}</p>

            <Step n={1} title="Date de intrare">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <div className="text-[10px] uppercase tracking-wider text-primary font-bold">{match.home} (acasă)</div>
                  <Row label="Meciuri / PPG" value={`${homeTeam?.matchesPlayed ?? '—'} · ${num(homeTeam?.ppg)}`} />
                  <Row label="Goluri F/A medii" value={`${num(homeTeam?.homeGFAvg ?? homeTeam?.goalsFor)} / ${num(homeTeam?.homeGAAvg ?? homeTeam?.goalsAgainst)}`} />
                  <Row label="BTTS / Over 2.5" value={`${pct(homeTeam?.homeBttsPct ?? homeTeam?.bttsPct)} · ${pct(homeTeam?.homeOver25Pct ?? homeTeam?.over25Pct)}`} />
                  <Row label="xG F/A" value={`${num(homeTeam?.xgForHome ?? homeTeam?.xgFor)} / ${num(homeTeam?.xgAgainstHome ?? homeTeam?.xgAgainst)}`} />
                  <Row label="Clean sheets / FTS" value={`${pct(homeTeam?.cleanSheetsPct)} · ${pct(homeTeam?.ftsPct)}`} />
                  <Row label="Formă" value={(homeTeam?.form ?? []).slice(0, 5).join(' ') || '—'} mono={false} />
                </div>
                <div className="space-y-1.5">
                  <div className="text-[10px] uppercase tracking-wider text-destructive font-bold">{match.away} (deplasare)</div>
                  <Row label="Meciuri / PPG" value={`${awayTeam?.matchesPlayed ?? '—'} · ${num(awayTeam?.ppg)}`} />
                  <Row label="Goluri F/A medii" value={`${num(awayTeam?.awayGFAvg ?? awayTeam?.goalsFor)} / ${num(awayTeam?.awayGAAvg ?? awayTeam?.goalsAgainst)}`} />
                  <Row label="BTTS / Over 2.5" value={`${pct(awayTeam?.awayBttsPct ?? awayTeam?.bttsPct)} · ${pct(awayTeam?.awayOver25Pct ?? awayTeam?.over25Pct)}`} />
                  <Row label="xG F/A" value={`${num(awayTeam?.xgForAway ?? awayTeam?.xgFor)} / ${num(awayTeam?.xgAgainstAway ?? awayTeam?.xgAgainst)}`} />
                  <Row label="Clean sheets / FTS" value={`${pct(awayTeam?.cleanSheetsPct)} · ${pct(awayTeam?.ftsPct)}`} />
                  <Row label="Formă" value={(awayTeam?.form ?? []).slice(0, 5).join(' ') || '—'} mono={false} />
                </div>
              </div>
              <div className="pt-2 border-t border-border/50 grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
                <Row label="Ligă G/M" value={num(league?.goalsPerMatch)} />
                <Row label="Ligă xG/M" value={num(league?.xgPerMatch)} />
                <Row label="Ligă Over 2.5" value={pct(league?.over25Pct)} />
                <Row label="Ligă BTTS" value={pct(league?.bttsPct)} />
              </div>
            </Step>

            <Step n={2} title="Ratinguri calculate (0-100)">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {([['Atac', rh.attack, ra.attack], ['Apărare', rh.defense, ra.defense], ['Formă', rh.form, ra.form], ['Momentum', rh.momentum, ra.momentum], ['Stabilitate def.', rh.defensiveStability, ra.defensiveStability], ['Consistență ofensivă', rh.offensiveConsistency, ra.offensiveConsistency], ['Volatilitate', rh.matchVolatility, ra.matchVolatility]] as const).map(([label, h, w]) => (
                  <div key={label} className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]"><span className="text-muted-foreground">{label}</span><span className="font-mono">{h.toFixed(0)} / {w.toFixed(0)}</span></div>
                    <div className="flex gap-1">
                      <Progress value={h} className="h-1.5 flex-1" />
                      <Progress value={w} className="h-1.5 flex-1" />
                    </div>
                  </div>
                ))}
              </div>
              <div className="pt-2 border-t border-border/50 grid grid-cols-2 gap-2">
                <Row label="Avantaj acasă" value={`${rh.homeAdvantage.toFixed(0)} / 100`} hi />
                <Row label="Match Tempo" value={`${rh.matchTempo.toFixed(0)} / 100`} hi />
              </div>
            </Step>

            <Step n={3} title="xG estimat (Lambda Poisson)">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-md bg-primary/5 border border-primary/20 p-3 text-center">
                  <div className="text-[10px] uppercase text-muted-foreground">λ Home</div>
                  <div className="text-2xl font-mono font-bold text-primary">{expectedGoalsHome.toFixed(2)}</div>
                </div>
                <div className="rounded-md bg-destructive/5 border border-destructive/20 p-3 text-center">
                  <div className="text-[10px] uppercase text-muted-foreground">λ Away</div>
                  <div className="text-2xl font-mono font-bold text-destructive">{expectedGoalsAway.toFixed(2)}</div>
                </div>
              </div>
              <div className="text-[11px] text-muted-foreground pt-1">
                Combinat <span className="font-mono text-foreground">{(expectedGoalsHome + expectedGoalsAway).toFixed(2)}</span> goluri.
                Blend ratinguri (65%) + date prematch (35% — xG/avg goals din CSV matches dacă există).
              </div>
            </Step>

            <Step n={4} title="Probabilități piețe (Poisson 70% + Monte Carlo 30%)">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {probabilities.map((p) => {
                  const implied = p.odds && p.odds > 1 ? 1 / p.odds : null;
                  const edge = implied !== null ? (p.prob - implied) * 100 : null;
                  const isTop = p.key === topMarket.key;
                  return (
                    <div key={p.key} className={cn('rounded-md border p-2 text-xs space-y-1', isTop ? 'border-primary/60 bg-primary/5' : 'border-border/50 bg-secondary/30')}>
                      <div className="flex items-center justify-between"><span className="font-bold">{p.label}</span>{isTop && <Badge variant="outline" className="text-[9px] border-primary/40 text-primary">PICK</Badge>}</div>
                      <div className="grid grid-cols-3 gap-1 text-[10px] font-mono">
                        <div><span className="text-muted-foreground">Prob </span>{(p.prob * 100).toFixed(1)}%</div>
                        <div><span className="text-muted-foreground">Cotă </span>{p.odds ? p.odds.toFixed(2) : '—'}</div>
                        <div className={cn(edge !== null && edge > 0 && 'text-primary', edge !== null && edge < 0 && 'text-destructive')}>
                          <span className="text-muted-foreground">Edge </span>{edge !== null ? `${edge >= 0 ? '+' : ''}${edge.toFixed(1)}%` : '—'}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Step>

            <Step n={5} title="Calcul Confidence Score">
              <div className="space-y-1">
                <Row label="Bază" value={`+${baseConf}`} />
                <Row label={`Coverage date (${(quality.coverage * 100).toFixed(0)}%) × 25`} value={`+${coverageBoost.toFixed(1)}`} />
                <Row label={`Dispersie pick top (${(dispersion * 100).toFixed(1)}%) × 80`} value={`+${dispersionBoost.toFixed(1)}`} />
                <Row label={`Penalizare eșantion mic × 35`} value={`-${samplePenalty.toFixed(1)}`} />
                {conflicts.length > 0 && <Row label={`Penalizare conflicte × 8 (${conflicts.length})`} value={`-${conflictPenalty}`} />}
                <div className="pt-2 mt-2 border-t border-border/50 flex items-center justify-between">
                  <span className="text-xs font-bold">Confidence final (cap 15-92)</span>
                  <span className="text-lg font-mono font-bold text-primary">{confidence}</span>
                </div>
              </div>
            </Step>

            <Step n={6} title="Verdict & stake">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <Row label="Pick" value={topMarket.label} hi />
                <Row label="Probabilitate" value={`${(topMarket.prob * 100).toFixed(1)}%`} hi />
                <Row label="Cotă" value={topMarket.odds ? topMarket.odds.toFixed(2) : '—'} />
                <Row label="Grade" value={grade} />
                <Row label="Stake" value={`${stakeUnits}U`} />
                <Row label="Calitate date" value={`${quality.band} (${(quality.coverage * 100).toFixed(0)}%)`} />
              </div>
              {context.motivationNote && <div className="text-[11px] text-muted-foreground pt-2">📌 {context.motivationNote}</div>}
            </Step>

            <Step n={7} title="De ce acest pick / riscuri">
              <ul className="space-y-1.5">
                {explanation.map((b, i) => (
                  <li key={i} className={cn('text-xs flex items-start gap-2', b.kind === 'support' ? 'text-foreground' : b.kind === 'risk' ? 'text-destructive/90' : 'text-muted-foreground')}>
                    <span className="mt-[2px]">{b.kind === 'support' ? '✓' : b.kind === 'risk' ? '⚠' : '•'}</span>
                    <span>{b.text}</span>
                  </li>
                ))}
                {explanation.length === 0 && <li className="text-xs text-muted-foreground">Fără bullet points relevanți.</li>}
              </ul>
            </Step>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
