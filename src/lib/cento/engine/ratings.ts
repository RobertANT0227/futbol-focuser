import type { LeagueStats, TeamProfile } from '@/lib/cento/footystats/types';
import type { RatingBundle } from './types';

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

function formScore(form: string[]): number {
  if (!form || !form.length) return 50;
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
  if (!form || form.length < 3) return 50;
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
  // NEW: shots on target quality signal
  if (team.shotsOTAvg !== null) {
    const shotsBoost = clamp(35 + team.shotsOTAvg * 7); // 5 SOT → 70
    score = score * 0.85 + shotsBoost * 0.15;
  }
  // NEW: xG-normalized vs league mean (stronger than raw goals)
  if (team.xgFor !== null && team.matchesPlayed && team.matchesPlayed > 0) {
    const xgPerMatch = team.xgFor / team.matchesPlayed;
    const xgNorm = clamp(50 + ((xgPerMatch / Math.max(baseline / 2, 0.4)) - 1) * 35);
    score = score * 0.8 + xgNorm * 0.2;
  }
  // NEW: first-team-to-score tendency (proactive attack)
  if (team.fts2score !== null) score = score * 0.92 + clamp(30 + team.fts2score * 0.6) * 0.08;
  return clamp(score);
}

function defenseScore(team: TeamProfile, leagueAvgGoals: number | null): number {
  const ga = team.homeGAAvg ?? team.awayGAAvg ?? (team.goalsAgainst && team.matchesPlayed ? team.goalsAgainst / Math.max(team.matchesPlayed, 1) : null);
  const cs = team.cleanSheetsPct;
  const baseline = leagueAvgGoals ?? 1.4;
  let score = 50;
  if (ga !== null) score = 35 + (1 - ga / Math.max(baseline, 0.5)) * 50;
  if (cs !== null) score = score * 0.7 + cs * 0.3;
  // NEW: shots conceded volume (less shots conceded → stronger D)
  if (team.shotsConcededAvg !== null) {
    const shotsDef = clamp(80 - team.shotsConcededAvg * 4); // 10 SC → 40
    score = score * 0.85 + shotsDef * 0.15;
  }
  // NEW: defensive efficiency (FootyStats)
  if (team.defensiveEff !== null) score = score * 0.75 + team.defensiveEff * 0.25;
  // NEW: xG against normalized
  if (team.xgAgainst !== null && team.matchesPlayed && team.matchesPlayed > 0) {
    const xgaPerMatch = team.xgAgainst / team.matchesPlayed;
    const xgaNorm = clamp(50 + (1 - xgaPerMatch / Math.max(baseline / 2, 0.4)) * 35);
    score = score * 0.8 + xgaNorm * 0.2;
  }
  return clamp(score);
}

function tempoScore(home: TeamProfile, away: TeamProfile, league: LeagueStats | undefined): number {
  const o25h = home.over25Pct ?? 50;
  const o25a = away.over25Pct ?? 50;
  const leagueO25 = league?.over25Pct ?? 50;
  const ratio = ((o25h + o25a) / 2) / Math.max(leagueO25, 30);
  let score = 50 * ratio;
  // shots volume contributes to tempo
  const shotsH = home.shotsAvg, shotsA = away.shotsAvg;
  if (shotsH !== null && shotsA !== null) {
    const shotsTempo = clamp(((shotsH + shotsA) / 2 - 8) * 5 + 50);
    score = score * 0.7 + shotsTempo * 0.3;
  }
  return clamp(score);
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
  const f = team.form ?? [];
  if (f.length < 3) return 50;
  let switches = 0;
  for (let i = 1; i < f.length; i++) if (f[i] !== f[i - 1]) switches++;
  return clamp(20 + (switches / Math.max(f.length - 1, 1)) * 80);
}

function formFallback(team: TeamProfile): number {
  // when no form string, derive from win% / ppg
  if (team.winPct != null && team.lossPct != null) {
    const draw = team.drawPct ?? Math.max(0, 100 - team.winPct - team.lossPct);
    return clamp(team.winPct + draw * 0.5);
  }
  if (team.ppg != null) return clamp(15 + (team.ppg / 3) * 70);
  return 50;
}

export function computeRatings(team: TeamProfile, league: LeagueStats | undefined, isHome: boolean): RatingBundle {
  const formArr = team.form ?? [];
  const formVal = formArr.length ? formScore(formArr) : formFallback(team);
  const momentumVal = formArr.length >= 3 ? momentumScore(formArr) : formFallback(team);
  // home advantage uses split record when available
  let ha = 50;
  if (isHome) {
    const hp = team.homePlayed ?? 0;
    if (hp >= 2) {
      const hwRate = (team.homeWins ?? 0) / hp;
      const ppgHome = ((team.homeWins ?? 0) * 3 + (team.homeDraws ?? 0)) / hp;
      ha = clamp(40 + hwRate * 40 + (ppgHome - 1.4) * 8);
    } else {
      ha = clamp(50 + ((team.homeWins ?? 0) - (team.awayWins ?? 0)) * 5);
    }
  }
  return {
    attack: attackScore(team, league?.goalsPerMatch ?? null),
    defense: defenseScore(team, league?.goalsPerMatch ?? null),
    form: formVal,
    momentum: momentumVal,
    matchTempo: 0, // computed at match level
    homeAdvantage: ha,
    defensiveStability: defensiveStability(team),
    offensiveConsistency: offensiveConsistency(team),
    matchVolatility: volatility(team),
  };
}

export function computeMatchTempo(home: TeamProfile, away: TeamProfile, league: LeagueStats | undefined): number {
  return tempoScore(home, away, league);
}