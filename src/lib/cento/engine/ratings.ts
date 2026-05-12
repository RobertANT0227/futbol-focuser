import type { LeagueStats, TeamProfile } from '@/lib/cento/footystats/types';
import type { RatingBundle } from './types';

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

function formScore(form: string[]): number {
  if (!form.length) return 50;
  // exponential decay; latest weighted highest
  let total = 0, weight = 0;
  form.forEach((r, i) => {
    const w = Math.pow(0.6, i); // 1, 0.6, 0.36, 0.216, ...
    const v = r === 'W' ? 1 : r === 'D' ? 0.5 : 0;
    total += v * w; weight += w;
  });
  return clamp((total / weight) * 100);
}

function momentumScore(form: string[]): number {
  // last 3 vs prior 3
  if (form.length < 3) return 50;
  const score = (arr: string[]) => arr.reduce((a, r) => a + (r === 'W' ? 1 : r === 'D' ? 0.5 : 0), 0) / Math.max(arr.length, 1);
  const recent = score(form.slice(0, 3));
  const prior = score(form.slice(3, 6));
  return clamp(50 + (recent - prior) * 75);
}

function attackScore(team: TeamProfile, leagueAvgGoals: number | null): number {
  const gf = team.homeGFAvg ?? team.awayGFAvg ?? (team.goalsFor && team.matchesPlayed ? team.goalsFor / Math.max(team.matchesPlayed, 1) : null);
  const eff = team.attackingEff;
  const o25 = team.over25Pct;
  const baseline = leagueAvgGoals ?? 1.4;
  let score = 50;
  if (gf !== null) score = 35 + (gf / baseline) * 35; // ~70 if 2x avg
  if (eff !== null) score = score * 0.7 + eff * 0.3;
  if (o25 !== null) score = score * 0.85 + (o25 * 0.15);
  return clamp(score);
}

function defenseScore(team: TeamProfile, leagueAvgGoals: number | null): number {
  const ga = team.homeGAAvg ?? team.awayGAAvg ?? (team.goalsAgainst && team.matchesPlayed ? team.goalsAgainst / Math.max(team.matchesPlayed, 1) : null);
  const cs = team.cleanSheetsPct;
  const baseline = leagueAvgGoals ?? 1.4;
  let score = 50;
  if (ga !== null) score = 35 + (1 - ga / Math.max(baseline, 0.5)) * 50;
  if (cs !== null) score = score * 0.7 + cs * 0.3;
  return clamp(score);
}

function tempoScore(home: TeamProfile, away: TeamProfile, league: LeagueStats | undefined): number {
  const o25h = home.over25Pct ?? 50;
  const o25a = away.over25Pct ?? 50;
  const leagueO25 = league?.over25Pct ?? 50;
  const ratio = ((o25h + o25a) / 2) / Math.max(leagueO25, 30);
  return clamp(50 * ratio);
}

function defensiveStability(team: TeamProfile): number {
  const cs = team.cleanSheetsPct ?? 0;
  const fts = team.ftsPct ?? 0;
  const consistency = 50 + cs * 0.4 - fts * 0.2;
  return clamp(consistency);
}

function offensiveConsistency(team: TeamProfile): number {
  const ftsHome = team.ftsPct ?? 30;
  const o25 = team.over25Pct ?? 50;
  return clamp(70 - ftsHome * 0.4 + (o25 - 50) * 0.3);
}

function volatility(team: TeamProfile): number {
  // teams that swing W/L often → high volatility
  const f = team.form;
  if (f.length < 3) return 50;
  let switches = 0;
  for (let i = 1; i < f.length; i++) if (f[i] !== f[i - 1]) switches++;
  return clamp(20 + (switches / Math.max(f.length - 1, 1)) * 80);
}

export function computeRatings(team: TeamProfile, league: LeagueStats | undefined, isHome: boolean): RatingBundle {
  return {
    attack: attackScore(team, league?.goalsPerMatch ?? null),
    defense: defenseScore(team, league?.goalsPerMatch ?? null),
    form: formScore(team.form),
    momentum: momentumScore(team.form),
    matchTempo: 0, // computed at match level
    homeAdvantage: isHome ? clamp(50 + ((team.homeWins ?? 0) - (team.awayWins ?? 0)) * 5) : 50,
    defensiveStability: defensiveStability(team),
    offensiveConsistency: offensiveConsistency(team),
    matchVolatility: volatility(team),
  };
}

export function computeMatchTempo(home: TeamProfile, away: TeamProfile, league: LeagueStats | undefined): number {
  return tempoScore(home, away, league);
}