import type { LeagueStats, TeamProfile } from '@/lib/cento/footystats/types';
import type { MarketProb, RatingBundle } from './types';

function poisson(lambda: number, k: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  let p = Math.exp(-lambda);
  for (let i = 1; i <= k; i++) p *= lambda / i;
  return p;
}

/** Score grid up to 6-6, with small Dixon-Coles-style draw lift on low totals. */
function scoreGrid(lh: number, la: number) {
  const N = 7;
  const grid: number[][] = [];
  for (let i = 0; i < N; i++) {
    grid[i] = [];
    for (let j = 0; j < N; j++) {
      grid[i][j] = poisson(lh, i) * poisson(la, j);
    }
  }
  return grid;
}

function sampleSizeShrink(team: TeamProfile, isHome: boolean): number {
  const sample = isHome ? team.homePlayed ?? team.matchesPlayed ?? 0 : team.awayPlayed ?? team.matchesPlayed ?? 0;
  if (sample <= 2) return 0.45;
  if (sample <= 4) return 0.7;
  if (sample <= 6) return 0.85;
  return 1;
}

export interface LambdaResult {
  lambdaHome: number;
  lambdaAway: number;
  lowSample: boolean;
}

export function computeLambdas(
  home: TeamProfile,
  away: TeamProfile,
  league: LeagueStats | undefined,
  rh: RatingBundle,
  ra: RatingBundle,
): LambdaResult {
  const lgGoals = league?.goalsPerMatch ?? 2.7;
  const lgHomeAvg = league?.homeGoalsAvg ?? lgGoals * 0.55;
  const lgAwayAvg = league?.awayGoalsAvg ?? lgGoals * 0.45;

  // raw expected (home attack vs away defense, normalized to league)
  const homeGF = home.homeGFAvg ?? home.goalsFor ?? lgHomeAvg;
  const awayGA = away.awayGAAvg ?? away.goalsAgainst ?? lgAwayAvg;
  const awayGF = away.awayGFAvg ?? away.goalsFor ?? lgAwayAvg;
  const homeGA = home.homeGAAvg ?? home.goalsAgainst ?? lgHomeAvg;

  // anchor + shrink early-season toward league mean
  const sH = sampleSizeShrink(home, true);
  const sA = sampleSizeShrink(away, false);
  const lowSample = sH < 0.7 || sA < 0.7;

  let lambdaHome = ((homeGF / Math.max(lgHomeAvg, 0.6)) * (awayGA / Math.max(lgAwayAvg, 0.6)) * lgHomeAvg);
  let lambdaAway = ((awayGF / Math.max(lgAwayAvg, 0.6)) * (homeGA / Math.max(lgHomeAvg, 0.6)) * lgAwayAvg);

  // shrink toward league baseline by sample reliability
  lambdaHome = lambdaHome * sH + lgHomeAvg * (1 - sH);
  lambdaAway = lambdaAway * sA + lgAwayAvg * (1 - sA);

  // momentum/form micro adjustment (±5%)
  const formAdjH = (rh.form - 50) / 1000 + (rh.momentum - 50) / 2000;
  const formAdjA = (ra.form - 50) / 1000 + (ra.momentum - 50) / 2000;
  lambdaHome *= 1 + formAdjH;
  lambdaAway *= 1 + formAdjA;

  // home advantage modifier
  lambdaHome *= 1.05;

  return { lambdaHome: Math.max(0.15, lambdaHome), lambdaAway: Math.max(0.1, lambdaAway), lowSample };
}

export function computeMarketProbs(
  lambdaHome: number, lambdaAway: number,
  oddsHome: number | null, oddsDraw: number | null, oddsAway: number | null,
  oddsBttsYes: number | null, oddsBttsNo: number | null,
  oddsOver: number | null, oddsUnder: number | null,
): MarketProb[] {
  const grid = scoreGrid(lambdaHome, lambdaAway);
  let pHome = 0, pDraw = 0, pAway = 0, pBtts = 0, pOver = 0;
  for (let i = 0; i < grid.length; i++) {
    for (let j = 0; j < grid[i].length; j++) {
      const p = grid[i][j];
      if (i > j) pHome += p;
      else if (i === j) pDraw += p;
      else pAway += p;
      if (i >= 1 && j >= 1) pBtts += p;
      if (i + j >= 3) pOver += p;
    }
  }
  // small draw boost when both lambdas low (defensive matches)
  if (lambdaHome + lambdaAway < 2.2) {
    const lift = 0.04;
    pDraw += lift;
    pHome -= lift / 2; pAway -= lift / 2;
  }
  // normalize
  const sum = pHome + pDraw + pAway;
  pHome /= sum; pDraw /= sum; pAway /= sum;
  return [
    { key: '1', label: 'Home Win', prob: pHome, odds: validOdds(oddsHome) },
    { key: 'X', label: 'Draw', prob: pDraw, odds: validOdds(oddsDraw) },
    { key: '2', label: 'Away Win', prob: pAway, odds: validOdds(oddsAway) },
    { key: 'BTTS_YES', label: 'BTTS Yes', prob: pBtts, odds: validOdds(oddsBttsYes) },
    { key: 'BTTS_NO', label: 'BTTS No', prob: 1 - pBtts, odds: validOdds(oddsBttsNo) },
    { key: 'OVER_2_5', label: 'Over 2.5', prob: pOver, odds: validOdds(oddsOver) },
    { key: 'UNDER_2_5', label: 'Under 2.5', prob: 1 - pOver, odds: validOdds(oddsUnder) },
  ];
}

function validOdds(o: number | null): number | null {
  if (o === null || !Number.isFinite(o)) return null;
  if (o <= 1.01 || o > 50) return null;
  return o;
}