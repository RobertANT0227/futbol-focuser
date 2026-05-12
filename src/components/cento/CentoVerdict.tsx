import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { runAnalysis } from '@/lib/engine';
import { cpToMatchData } from '@/lib/cento/dashboardAdapter';
import { BetCard } from '@/components/BetCard';
import type { CpMatch, CpTeam } from '@/lib/cento/types';
import { cn } from '@/lib/utils';

interface Props {
  match: CpMatch;
  home: CpTeam;
  away: CpTeam;
  league: string;
  bankroll: number;
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const x = typeof v === 'number' ? v : parseFloat(String(v).replace('%', '').replace(',', '.'));
  return Number.isFinite(x) ? x : null;
};

function AdvancedPill({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="bg-secondary/40 rounded-md p-2 border border-border/40">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn('text-sm font-mono font-bold', accent)}>{value}</div>
    </div>
  );
}

function AdvancedCsvStats({ team, label, isHome }: { team: CpTeam; label: string; isHome: boolean }) {
  const s = team.stats;
  const ppg = num(s.points_per_game) ?? num(s.ppg);
  const winPct = num(s.win_percentage);
  const da = num(s.dangerous_attacks);
  const cs = num(s.clean_sheets_percentage) ?? num(s.clean_sheets);
  const sot = num(s.shots_on_target) ?? num(s.shots_on_target_per_match);
  const corners = num(s.corners_per_match) ?? num(s.corners);
  const cards = num(s.cards_per_match) ?? num(s.cards);
  const xg = num(s.xg) ?? num(isHome ? s.xg_for_avg_home : s.xg_for_avg_away);
  const pos = num(s.league_position);
  return (
    <Card className="p-3 bg-card/60">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
        <div className="text-xs font-bold truncate">{team.name}</div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {pos !== null && <AdvancedPill label="Poziție" value={`#${pos}`} />}
        {ppg !== null && <AdvancedPill label="PPG" value={ppg.toFixed(2)} />}
        {winPct !== null && <AdvancedPill label="Win %" value={`${winPct.toFixed(0)}%`} />}
        {xg !== null && <AdvancedPill label="xG" value={xg.toFixed(2)} accent="text-primary" />}
        {sot !== null && <AdvancedPill label="SoT" value={sot.toFixed(2)} />}
        {da !== null && <AdvancedPill label="DA" value={da.toFixed(0)} />}
        {corners !== null && <AdvancedPill label="Cornere" value={corners.toFixed(2)} />}
        {cards !== null && <AdvancedPill label="Cartonașe" value={cards.toFixed(2)} />}
        {cs !== null && <AdvancedPill label="Clean Sh." value={`${cs.toFixed(0)}${cs <= 1 ? '' : '%'}`} />}
      </div>
    </Card>
  );
}

export function CentoVerdict({ match, home, away, league, bankroll }: Props) {
  const result = useMemo(() => {
    const m = cpToMatchData(match, home, away, league);
    return runAnalysis(m, { bankroll, maxRisk: 'high', preferredBets: ['winner', 'goals', 'corners'] });
  }, [match, home, away, league, bankroll]);

  // Tipster mode: rank pure pe Win Rate / probabilitate model — NU pe value/EV
  const tipsterBets = [...result.recommendations]
    .filter((r) => r.modelProbability >= 0.5)
    .sort((a, b) => b.winRate - a.winRate || b.modelProbability - a.modelProbability);
  const otherBets = [...result.recommendations]
    .filter((r) => r.modelProbability < 0.5)
    .sort((a, b) => b.winRate - a.winRate);
  const top = tipsterBets[0];
  const matchLabel = `${match.home} vs ${match.away}`;
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

  return (
    <div className="space-y-4 border border-border/60 rounded-xl bg-card/30 p-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{league}</div>
          <h3 className="font-bold text-lg">{match.home} <span className="text-muted-foreground font-normal">vs</span> {match.away}</h3>
        </div>
        <Badge variant="outline" className="font-mono text-[10px]">Tipster · 25 pași · powered by CSV</Badge>
      </div>

      {/* 1X2 + sumar */}
      <div className="grid grid-cols-3 gap-3">
        <div className="text-center p-3 rounded-lg bg-secondary/40 border border-border/40">
          <div className="text-2xl font-mono font-bold text-primary">{pct(result.homeWinProb)}</div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Gazdă</div>
        </div>
        <div className="text-center p-3 rounded-lg bg-secondary/40 border border-border/40">
          <div className="text-2xl font-mono font-bold text-muted-foreground">{pct(result.drawProb)}</div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Egal</div>
        </div>
        <div className="text-center p-3 rounded-lg bg-secondary/40 border border-border/40">
          <div className="text-2xl font-mono font-bold text-destructive">{pct(result.awayWinProb)}</div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Oaspete</div>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 font-mono">
        <AdvancedPill label="xG Gazdă" value={result.homeXG.toFixed(2)} accent="text-primary" />
        <AdvancedPill label="xG Oaspete" value={result.awayXG.toFixed(2)} accent="text-destructive" />
        <AdvancedPill label="Over 2.5" value={pct(result.over25Prob)} />
        <AdvancedPill label="BTTS" value={pct(result.bttsProb)} />
        <AdvancedPill label="Cornere est." value={result.expectedCorners.toFixed(1)} />
      </div>

      {/* Stats avansate doar șuturi + cornere */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <AdvancedCsvStats team={home} label="🏠 Acasă" isHome />
        <AdvancedCsvStats team={away} label="✈️ Deplasare" isHome={false} />
      </div>

      {/* Motivare/context (clasament) */}
      <Card className="p-3 bg-card/60">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">💪 Motivare & Context</div>
        <p className="text-xs text-secondary-foreground leading-relaxed">{result.motivationAnalysis}</p>
      </Card>

      {/* TOP TIPSTER PICKS — sortate după Win Rate */}
      {tipsterBets.length > 0 ? (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-bold text-sm">⭐ Pronosticuri Tipster <span className="text-[10px] font-normal text-muted-foreground">(sortat după Win Rate)</span></h4>
            <span className="text-[10px] font-mono text-muted-foreground">{tipsterBets.length} selecții</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {tipsterBets.slice(0, 6).map((bet, i) => (
              <BetCard key={`t-${i}`} bet={bet} matchLabel={matchLabel} rank={i + 1} />
            ))}
          </div>
          {top && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 mt-4 text-xs">
              <strong className="text-foreground">🎯 Best Bet — {top.selection}:</strong>{' '}
              WR {top.winRate.toFixed(1)}% la cota {top.odds.toFixed(2)}. Stake (Kelly): {top.stakeLei} LEI ({(top.stakePct * 100).toFixed(1)}%).
              <div className="mt-1 text-secondary-foreground">{top.aiExplanation}</div>
            </div>
          )}
        </div>
      ) : (
        <Card className="p-4 text-center text-xs text-muted-foreground bg-card/40">
          Nicio selecție tipster cu probabilitate ≥ 50%. Vezi mai jos restul analizat.
        </Card>
      )}

      {otherBets.length > 0 && (
        <details className="rounded-lg border border-border/40 bg-card/40 p-3">
          <summary className="text-xs font-semibold uppercase tracking-wider text-muted-foreground cursor-pointer">
            📋 Alte selecții analizate ({otherBets.length})
          </summary>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-3">
            {otherBets.map((bet, i) => <BetCard key={`o-${i}`} bet={bet} compact />)}
          </div>
        </details>
      )}
    </div>
  );
}