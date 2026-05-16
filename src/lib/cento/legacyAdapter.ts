import type { LeagueStats, ParsedMatch, TeamProfile } from './footystats/types';
import type { MatchData, TeamStats, CornerLine } from '@/lib/types';
import { runAnalysis } from './legacyEngine';
import type { AnalysisResult } from '@/lib/types';

function form(arr: string[] | null | undefined): ('W' | 'D' | 'L')[] {
  if (!arr) return [];
  return arr
    .map((r) => r.toUpperCase())
    .filter((r): r is 'W' | 'D' | 'L' => r === 'W' || r === 'D' || r === 'L')
    .slice(0, 5);
}

function teamToStats(t: TeamProfile | undefined, fallbackName: string, lgGoals: number): TeamStats {
  const p = t ?? ({} as TeamProfile);
  const mp = p.matchesPlayed ?? 0;
  const gf = p.goalsFor ?? 0;
  const ga = p.goalsAgainst ?? 0;
  const gfHome = p.homeGFAvg ?? (gf && mp ? gf / mp : lgGoals * 0.55);
  const gaHome = p.homeGAAvg ?? (ga && mp ? ga / mp : lgGoals * 0.45);
  const gfAway = p.awayGFAvg ?? (gf && mp ? gf / mp : lgGoals * 0.45);
  const gaAway = p.awayGAAvg ?? (ga && mp ? ga / mp : lgGoals * 0.55);
  const f5 = form(p.form);
  return {
    name: p.name ?? fallbackName,
    goalsScored: mp ? gf / mp : lgGoals * 0.5,
    goalsConceded: mp ? ga / mp : lgGoals * 0.5,
    goalsScoredHome: gfHome,
    goalsConcededHome: gaHome,
    goalsScoredAway: gfAway,
    goalsConcededAway: gaAway,
    matchesPlayed: mp,
    formLast5: f5,
    formHome: f5,
    formAway: f5,
    xG: p.xgFor ?? 0,
    xGA: p.xgAgainst ?? 0,
    shots: p.shotsAvg ?? 0,
    shotsOnTarget: p.shotsOTAvg ?? 0,
    shotsOnTargetHome: p.shotsOTAvg ?? 0,
    shotsOnTargetAway: p.shotsOTAvg ?? 0,
    possession: 50,
    dangerousAttacks: 0,
    corners: p.cornersForAvg ?? 0,
    cornersPerMatch: p.cornersForAvg ?? 5,
    cornersPerMatchHome: p.cornersForHome ?? p.cornersForAvg ?? 5,
    cornersPerMatchAway: p.cornersForAway ?? p.cornersForAvg ?? 5,
    cards: 0,
    cardsPerMatch: 0,
    fouls: 0,
    playStyle: 'possession', // CentoPower nu are dropdown — default neutru
    leaguePosition: p.position ?? 10,
    totalTeamsInLeague: 20,
    gkSaves: 0,
  };
}

/**
 * Rulează motorul LEGACY (70% Poisson + 30% Monte Carlo + Full Kelly) pe un meci Cento.
 * Returnează null dacă lipsesc cotele esențiale 1X2.
 */
export function runLegacyOnCento(
  match: ParsedMatch,
  home: TeamProfile | undefined,
  away: TeamProfile | undefined,
  league: LeagueStats | undefined,
): AnalysisResult | null {
  const oH = match.oddsHome, oD = match.oddsDraw, oA = match.oddsAway;
  if (!oH || !oD || !oA) return null;

  const lgGoals = league?.goalsPerMatch ?? 2.7;
  const cornerLines: CornerLine[] = [{ line: 10.5, oddsOver: 0, oddsUnder: 0 }];

  const md: MatchData = {
    homeTeam: teamToStats(home, match.home, lgGoals),
    awayTeam: teamToStats(away, match.away, lgGoals),
    league: '',
    oddsHome: oH,
    oddsDraw: oD,
    oddsAway: oA,
    oddsOver25: match.oddsOver25 ?? 0,
    oddsUnder25: match.oddsUnder25 ?? 0,
    oddsBTTSYes: match.oddsBttsYes ?? 0,
    oddsBTTSNo: match.oddsBttsNo ?? 0,
    cornerLines,
    isDerby: false,
    homeTeamFatigued: false,
    awayTeamFatigued: false,
    homeEuropeanMatch: false,
    awayEuropeanMatch: false,
  };

  try {
    return runAnalysis(md);
  } catch {
    return null;
  }
}