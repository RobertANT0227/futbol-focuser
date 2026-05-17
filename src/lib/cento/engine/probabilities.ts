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

  // Blend in xG if available (50/50 when both sides present)
  const xgHomeFor = home.xgForHome ?? home.xgFor;
  const xgAwayAgainst = away.xgAgainstAway ?? away.xgAgainst;
  const xgAwayFor = away.xgForAway ?? away.xgFor;
  const xgHomeAgainst = home.xgAgainstHome ?? home.xgAgainst;
  if (xgHomeFor !== null && xgAwayAgainst !== null) {
    const xgLambdaHome = (xgHomeFor + xgAwayAgainst) / 2;
    lambdaHome = lambdaHome * 0.5 + xgLambdaHome * 0.5;
  }
  if (xgAwayFor !== null && xgHomeAgainst !== null) {
    const xgLambdaAway = (xgAwayFor + xgHomeAgainst) / 2;
    lambdaAway = lambdaAway * 0.5 + xgLambdaAway * 0.5;
  }

  // shrink toward league baseline by sample reliability
  lambdaHome = lambdaHome * sH + lgHomeAvg * (1 - sH);
  lambdaAway = lambdaAway * sA + lgAwayAvg * (1 - sA);

  // momentum/form micro adjustment (±5%)
  // Recency: form + momentum + ppg deviation. Capped at ±7% to avoid runaway.
  const ppgAdj = (t: TeamProfile) => (t.ppg !== null ? (t.ppg - 1.4) / 80 : 0);
  let formAdjH = (rh.form - 50) / 800 + (rh.momentum - 50) / 1600 + ppgAdj(home);
  let formAdjA = (ra.form - 50) / 800 + (ra.momentum - 50) / 1600 + ppgAdj(away);
  formAdjH = Math.max(-0.07, Math.min(0.07, formAdjH));
  formAdjA = Math.max(-0.07, Math.min(0.07, formAdjA));
  lambdaHome *= 1 + formAdjH;
  lambdaAway *= 1 + formAdjA;

  // home advantage modifier
  const haBoost = league?.homeAdvantagePct != null ? 1 + league.homeAdvantagePct / 1000 : 1.05;
  lambdaHome *= haBoost;

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
  // (Draw calibration moved to calibrateDraw() — called from pickEngine with full context.)
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

/**
 * Smarter draw calibration combining: total xG, league draw %, position gap, tempo.
 * Preserves market ranking behavior — only nudges 1X2 then renormalizes.
 */
export function calibrateDraw(
  probs: MarketProb[],
  ctx: { lambdaTotal: number; leagueDrawPct: number | null; positionGap: number | null; tempo: number },
): MarketProb[] {
  let lift = 0;
  if (ctx.lambdaTotal < 2.2) lift += 0.025;
  if (ctx.lambdaTotal < 1.8) lift += 0.015;
  if (ctx.leagueDrawPct !== null && ctx.leagueDrawPct >= 28) lift += 0.02;
  if (ctx.positionGap !== null && ctx.positionGap <= 3) lift += 0.025;
  if (ctx.tempo < 45) lift += 0.015;
  if (lift <= 0) return probs;
  lift = Math.min(0.08, lift);
  const out = probs.map((p) => {
    if (p.key === 'X') return { ...p, prob: Math.min(0.6, p.prob + lift) };
    if (p.key === '1' || p.key === '2') return { ...p, prob: Math.max(0.05, p.prob - lift / 2) };
    return p;
  });
  // renormalize only 1X2 triplet
  const h = out.find((p) => p.key === '1')!;
  const d = out.find((p) => p.key === 'X')!;
  const a = out.find((p) => p.key === '2')!;
  const s = h.prob + d.prob + a.prob;
  h.prob /= s; d.prob /= s; a.prob /= s;
  return out;
}

/**
 * Compute Over/Under corners markets using a Poisson on summed corner expectation.
 * Picks the line nearest 50/50 in {7.5, 8.5, 9.5, 10.5, 11.5, 12.5}.
 */
export function computeCornerMarkets(home: TeamProfile, away: TeamProfile, league: LeagueStats | undefined): MarketProb[] | null {
  const lgPerMatch = league?.cornersPerMatch ?? null;
  // expected corners for each side
  const homeFor = home.cornersForHome ?? home.cornersForAvg;
  const homeAg = home.cornersAgainstHome ?? home.cornersAgainstAvg;
  const awayFor = away.cornersForAway ?? away.cornersForAvg;
  const awayAg = away.cornersAgainstAway ?? away.cornersAgainstAvg;
  const haveAny = [homeFor, homeAg, awayFor, awayAg].some((v) => typeof v === 'number' && v > 0);
  if (!haveAny && !lgPerMatch) return null;

  const lgHalf = (lgPerMatch ?? 10) / 2;
  const eHome = ((homeFor ?? lgHalf) + (awayAg ?? lgHalf)) / 2;
  const eAway = ((awayFor ?? lgHalf) + (homeAg ?? lgHalf)) / 2;
  const lambda = Math.max(2, Math.min(18, eHome + eAway));

  // Poisson cumulative for total corners 0..40
  const probAtLeast = (k: number) => {
    let p = 0;
    for (let i = k; i <= 40; i++) p += poisson(lambda, i);
    return Math.min(1, Math.max(0, p));
  };

  const out: MarketProb[] = [];
  const cfg: { line: number; over: MarketProb['key']; under: MarketProb['key'] }[] = [
    { line: 10.5, over: 'OVER_CORNERS_10_5', under: 'UNDER_CORNERS_10_5' },
  ];
  for (const c of cfg) {
    const pOver = probAtLeast(Math.ceil(c.line));
    out.push({ key: c.over, label: `Over ${c.line} corners`, prob: pOver, odds: null });
    out.push({ key: c.under, label: `Under ${c.line} corners`, prob: 1 - pOver, odds: null });
  }
  return out;
}

function validOdds(o: number | null): number | null {
  if (o === null || !Number.isFinite(o)) return null;
  if (o <= 1.01 || o > 50) return null;
  return o;
}