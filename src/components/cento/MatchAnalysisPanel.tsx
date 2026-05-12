import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ValueBetCard } from './ValueBetCard';
import { analyzeMatch } from '@/lib/cento/valueEngine';
import type { CpMatch, CpTeam, ValueBet } from '@/lib/cento/types';
import { cn } from '@/lib/utils';

interface Props {
  match: CpMatch;
  home: CpTeam;
  away: CpTeam;
  league?: string;
  bankroll: number;
  kellyFraction: number;
  onSave?: (bet: ValueBet) => void;
}

const PREMIUM_WR = 0.76;

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const x = typeof v === 'number' ? v : parseFloat(String(v).replace('%', '').replace(',', '.'));
  return Number.isFinite(x) ? x : null;
};

function StatPill({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="bg-secondary/40 rounded-md p-2 border border-border/40">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn('text-base font-mono font-bold', accent)}>{value}</div>
    </div>
  );
}

function TeamCard({
  side, name, stats, isHome,
}: { side: string; name: string; stats: CpTeam['stats']; isHome: boolean }) {
  const ppg = num(stats.points_per_game) ?? num(stats.ppg);
  const pos = num(stats.league_position);
  const form = String(stats.form || '').slice(-5).toUpperCase();
  const cs = num(stats.clean_sheets);
  const csPct = num(stats.clean_sheets_percentage);
  const possession = num(stats.possession);
  const sot = num(stats.shots_on_target) ?? num(stats.shots_on_target_per_match);
  const da = num(stats.dangerous_attacks);
  const cards = num(stats.cards) ?? num(stats.cards_per_match);
  const corners = num(stats.corners) ?? num(stats.corners_per_match);
  const gsHA = num(isHome ? stats.goals_scored_per_match_home : stats.goals_scored_per_match_away);
  const gcHA = num(isHome ? stats.goals_conceded_per_match_home : stats.goals_conceded_per_match_away);
  const xg = num(stats.xg) ?? num(isHome ? stats.xg_for_avg_home : stats.xg_for_avg_away);
  const wr = num(stats.win_percentage);
  return (
    <Card className="p-4 bg-card/60">
      <div className="flex items-center justify-between mb-3">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{side}</div>
          <div className="font-bold text-sm truncate">{name}</div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {pos !== null && <StatPill label="Poziție" value={`#${pos}`} />}
        {ppg !== null && <StatPill label="PPG" value={ppg.toFixed(2)} />}
        {wr !== null && <StatPill label="Win %" value={`${wr.toFixed(0)}%`} />}
        {xg !== null && <StatPill label="xG" value={xg.toFixed(2)} accent="text-primary" />}
        {gsHA !== null && <StatPill label={isHome ? 'GS / Acasă' : 'GS / Depl.'} value={gsHA.toFixed(2)} />}
        {gcHA !== null && <StatPill label={isHome ? 'GC / Acasă' : 'GC / Depl.'} value={gcHA.toFixed(2)} accent="text-destructive" />}
        {possession !== null && <StatPill label="Posesie" value={`${possession.toFixed(0)}%`} />}
        {sot !== null && <StatPill label="SoT" value={sot.toFixed(2)} />}
        {da !== null && <StatPill label="DA" value={da.toFixed(0)} />}
        {(cs !== null || csPct !== null) && <StatPill label="Clean Sh." value={csPct !== null ? `${csPct.toFixed(0)}%` : `${cs}`} />}
        {corners !== null && <StatPill label="Cornere" value={corners.toFixed(2)} />}
        {cards !== null && <StatPill label="Cartonașe" value={cards.toFixed(2)} />}
      </div>
      {form && (
        <div className="mt-3 flex items-center gap-1.5">
          <span className="text-[10px] uppercase text-muted-foreground tracking-wider mr-1">Formă</span>
          {form.split('').map((c, i) => (
            <span key={i} className={cn(
              'h-5 w-5 rounded text-[10px] font-bold flex items-center justify-center',
              c === 'W' ? 'bg-primary/20 text-primary' :
              c === 'D' ? 'bg-muted text-muted-foreground' :
              c === 'L' ? 'bg-destructive/20 text-destructive' : 'bg-secondary text-muted-foreground'
            )}>{c}</span>
          ))}
        </div>
      )}
    </Card>
  );
}

export function MatchAnalysisPanel({ match, home, away, league, bankroll, kellyFraction, onSave }: Props) {
  const analysis = useMemo(() => analyzeMatch(match, home, away, {
    bankroll, edgeMin: -100, kellyFraction, maxStakePct: Number.POSITIVE_INFINITY,
  }), [match, home, away, bankroll, kellyFraction]);

  if (!analysis) {
    return (
      <Card className="p-6 bg-card/40 text-center text-sm text-muted-foreground">
        Date insuficiente pentru a analiza {match.home} vs {match.away}. Importă mai multe statistici pentru aceste echipe.
      </Card>
    );
  }

  const bets = analysis.bets.map((b) => ({ ...b, league: b.league || league || '' }));
  // Premium Tipster picks: high model win-rate (>=76%), regardless of value/edge
  const premiumBets = bets.filter((b) => b.modelWR >= PREMIUM_WR).sort((a, b) => b.modelWR - a.modelWR);
  const otherBets = bets.filter((b) => b.modelWR < PREMIUM_WR).sort((a, b) => b.modelWR - a.modelWR);
  const top = premiumBets[0];

  // Motivation block built from extra CSV signals
  const motivation: string[] = [];
  const hPos = num(home.stats.league_position);
  const aPos = num(away.stats.league_position);
  if (hPos !== null && aPos !== null) {
    motivation.push(`${home.name} (#${hPos}) vs ${away.name} (#${aPos}) — diferență ${Math.abs(hPos - aPos)} locuri în clasament.`);
  }
  const hPpg = num(home.stats.points_per_game) ?? num(home.stats.ppg);
  const aPpg = num(away.stats.points_per_game) ?? num(away.stats.ppg);
  if (hPpg !== null && aPpg !== null) {
    motivation.push(`PPG: ${hPpg.toFixed(2)} vs ${aPpg.toFixed(2)} (gap ${(hPpg - aPpg).toFixed(2)}).`);
  }
  if (analysis.reliability !== 'high') {
    motivation.push(`Acoperire date: ${(analysis.completeness * 100).toFixed(0)}% (${analysis.reliability}). Lipsesc: ${analysis.missingStats.slice(0, 6).join(', ') || '—'}.`);
  }

  return (
    <div className="space-y-4 border border-border/60 rounded-xl bg-card/30 p-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{league || ''}</div>
          <h3 className="font-bold text-lg">{match.home} <span className="text-muted-foreground font-normal">vs</span> {match.away}</h3>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-mono text-[10px]">Reliability: {analysis.reliability}</Badge>
        </div>
      </div>

      {/* 1X2 probabilities */}
      <div className="grid grid-cols-3 gap-3">
        <div className="text-center p-3 rounded-lg bg-secondary/40 border border-border/40">
          <div className="text-2xl font-mono font-bold text-primary">{pct(analysis.pHome)}</div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Gazdă</div>
        </div>
        <div className="text-center p-3 rounded-lg bg-secondary/40 border border-border/40">
          <div className="text-2xl font-mono font-bold text-muted-foreground">{pct(analysis.pDraw)}</div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Egal</div>
        </div>
        <div className="text-center p-3 rounded-lg bg-secondary/40 border border-border/40">
          <div className="text-2xl font-mono font-bold text-destructive">{pct(analysis.pAway)}</div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Oaspete</div>
        </div>
      </div>

      {/* Top-line metrics */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 font-mono">
        <StatPill label="xG Gazdă" value={analysis.lh.toFixed(2)} accent="text-primary" />
        <StatPill label="xG Oaspete" value={analysis.la.toFixed(2)} accent="text-destructive" />
        <StatPill label="Over 2.5" value={pct(analysis.pOver25)} />
        <StatPill label="BTTS" value={pct(analysis.pBtts)} />
        <StatPill label="Cornere est." value={analysis.expectedCorners !== null ? analysis.expectedCorners.toFixed(1) : '—'} />
      </div>

      {/* Team detail cards (advanced stats from CSV) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <TeamCard side="🏠 Acasă" name={home.name} stats={home.stats} isHome />
        <TeamCard side="✈️ Deplasare" name={away.name} stats={away.stats} isHome={false} />
      </div>

      {/* Motivation/context */}
      {motivation.length > 0 && (
        <Card className="p-3 bg-card/60">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Context & motivație</div>
          <ul className="text-xs text-secondary-foreground space-y-1 list-disc pl-4">
            {motivation.map((line, i) => <li key={i}>{line}</li>)}
          </ul>
        </Card>
      )}

      {/* Top Bets */}
      {premiumBets.length > 0 ? (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-bold text-sm">⭐ Pronosticuri Premium Tipster <span className="text-[10px] font-normal text-muted-foreground">(WR ≥ {Math.round(PREMIUM_WR * 100)}%)</span></h4>
            <span className="text-[10px] font-mono text-muted-foreground">{premiumBets.length} selecții</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {premiumBets.map((b, i) => <ValueBetCard key={`v-${i}`} bet={b} onSave={onSave} hideStyles />)}
          </div>
          {top && (
            <div className="mt-3 rounded-lg border border-border/40 bg-secondary/30 p-3 text-xs">
              <strong className="text-foreground">Best Bet — {top.market}:</strong>{' '}
              Win Rate {(top.modelWR * 100).toFixed(1)}% la cota {top.odds.toFixed(2)}.
              Stake (Full Kelly): {top.suggestedStakeLei} LEI ({(top.suggestedStakePct * 100).toFixed(1)}% bankroll).
            </div>
          )}
        </div>
      ) : (
        <Card className="p-4 text-center text-xs text-muted-foreground bg-card/40">
          Niciun pronostic Premium Tipster (WR ≥ {Math.round(PREMIUM_WR * 100)}%) pe baza datelor curente. Vezi mai jos selecțiile analizate.
        </Card>
      )}

      {/* Other selections */}
      {otherBets.length > 0 && (
        <details className="rounded-lg border border-border/40 bg-card/40 p-3">
          <summary className="text-xs font-semibold uppercase tracking-wider text-muted-foreground cursor-pointer">
            📋 Alte selecții analizate ({otherBets.length})
          </summary>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 mt-3">
            {otherBets.map((b, i) => <ValueBetCard key={`o-${i}`} bet={b} onSave={onSave} hideStyles />)}
          </div>
        </details>
      )}
    </div>
  );
}