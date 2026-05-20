// CENTO-V2
import type { TeamRatings } from './types';
import { clamp } from './smoothing';

export interface RatingInputs {
  gf: number | null;     // goals scored per match (context split)
  ga: number | null;     // goals conceded per match (context split)
  ppg: number | null;
  corners: number | null;
  predictionRisk: number | null; // 0-100
}

export interface LeagueAverages {
  avgScoredHome: number | null;
  avgScoredAway: number | null;
  avgCorners: number | null;
}

export function buildRatings(
  inp: RatingInputs,
  side: 'home' | 'away',
  L: LeagueAverages,
): TeamRatings {
  const refAttack = side === 'home' ? L.avgScoredHome : L.avgScoredAway;
  const refDefense = side === 'home' ? L.avgScoredAway : L.avgScoredHome;
  const attack = inp.gf != null && refAttack ? clamp((inp.gf / refAttack) * 50, 0, 100) : 50;
  const defense = inp.ga != null && refDefense
    ? clamp(100 - (inp.ga / refDefense) * 50, 0, 100)
    : 50;
  const form = inp.ppg != null ? clamp(inp.ppg * 33.33, 0, 100) : 50;
  const tempo = inp.corners != null && L.avgCorners
    ? clamp((inp.corners / L.avgCorners) * 50, 0, 100)
    : clamp(form * 0.8, 0, 100);
  const volatility = inp.predictionRisk != null ? clamp(inp.predictionRisk, 0, 100) : 50;
  return { attack, defense, form, tempo, volatility };
}