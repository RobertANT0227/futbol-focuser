import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { runAnalysis } from '@/lib/engine';
import { cpToMatchData } from '@/lib/cento/dashboardAdapter';
import { VerdictDisplay } from '@/components/VerdictDisplay';
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

  return (
    <div className="space-y-4 border border-border/60 rounded-xl bg-card/30 p-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{league}</div>
          <h3 className="font-bold text-lg">{match.home} <span className="text-muted-foreground font-normal">vs</span> {match.away}</h3>
        </div>
        <Badge variant="outline" className="font-mono text-[10px]">Plan complet 25 pași · powered by CSV</Badge>
      </div>

      {/* Advanced CSV stats not present in dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <AdvancedCsvStats team={home} label="🏠 Acasă · stats avansate CSV" isHome />
        <AdvancedCsvStats team={away} label="✈️ Deplasare · stats avansate CSV" isHome={false} />
      </div>

      {/* Full dashboard verdict */}
      <VerdictDisplay result={result} homeTeamName={match.home} awayTeamName={match.away} />
    </div>
  );
}