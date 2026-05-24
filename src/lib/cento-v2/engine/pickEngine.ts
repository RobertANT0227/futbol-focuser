// CENTO-V2
import type {
  MarketResult, MatchInputs, PowerAnalysis, MarketKey, MarketExplanation, SignalItem,
} from './types';
import { MARKET_LABEL } from './types';
import { calcO25 } from './over25';
import { confO25, smallSamplePenalty } from './confidence';
import { gradeO25, stakeFor } from './grading';
import { buildRatings, type LeagueAverages, type RatingInputs } from './ratings';
import { computeQuality } from './quality';

export interface AnalyzeContext {
  matchId: string;
  home: string;
  away: string;
  leagueName: string;
  season: string;
  matchDate: string | null;
  inputs: MatchInputs;
  homeRatingInputs: RatingInputs;
  awayRatingInputs: RatingInputs;
  leagueAverages: LeagueAverages;
}

function buildExplanation(
  signals: SignalItem[],
  market: MarketKey,
  inp: MatchInputs,
  spread: number,
  pIndep: number | null,
  adj: 'penalty' | 'bonus' | 'none',
): MarketExplanation {
  const boosters: string[] = [];
  const reducers: string[] = [];
  const risk: string[] = [];

  if (spread < 0.08) boosters.push(`Toate semnalele aliniate (dispersie ${(spread * 100).toFixed(1)}%).`);
  if (spread > 0.20) reducers.push(`Semnale divergente (dispersie ${(spread * 100).toFixed(1)}%).`);

  const pen = smallSamplePenalty(inp.H_mp, inp.A_mp);
  if (pen >= 10) reducers.push(`Eșantion mic (${inp.H_mp ?? 0}/${inp.A_mp ?? 0} meciuri).`);
  else if (pen === 0 && (inp.H_mp ?? 0) >= 10 && (inp.A_mp ?? 0) >= 10) {
    boosters.push(`Eșantion solid (${inp.H_mp}/${inp.A_mp} meciuri).`);
  }

  if (!inp.hasLeague) reducers.push('Lipsește CSV ligă — penalizare confidence.');
  if (!inp.hasMatches) reducers.push('Lipsește CSV matches — penalizare confidence.');
  if (!inp.hasTeams) reducers.push('Lipsește CSV teams — penalizare confidence.');

  if ((inp.predictionRisk ?? 0) > 70) risk.push(`Risk model FootyStats ridicat (${inp.predictionRisk}/100).`);
  if ((inp.suspendedMatches ?? 0) > 2) risk.push(`${inp.suspendedMatches} jucători suspendați.`);

  if (inp.L_o25 == null) reducers.push('Lipsește baseline ligă Over 2.5.');
  if (inp.M_o25 == null) reducers.push('Lipsește potențial Over 2.5 pre-meci.');

  if (pIndep != null) {
    if (adj === 'penalty') reducers.push(`Scorare independentă scăzută (${(pIndep * 100).toFixed(1)}%) — Over 2.5 ajustat ×0.92.`);
    else if (adj === 'bonus') boosters.push(`Scorare independentă ridicată (${(pIndep * 100).toFixed(1)}%) — Over 2.5 ajustat ×1.05.`);
  }
  void market;

  return { signals, boosters, reducers, riskFactors: risk };
}

export function analyzeMatch(ctx: AnalyzeContext): PowerAnalysis {
  const { inputs } = ctx;
  // 1) Quality
  const q = computeQuality(inputs);

  // 2) Over/Under 2.5 probabilities (single market)
  const o25 = calcO25(inputs);

  // 3) Confidence
  const cO25 = confO25({
    spread: o25.spread,
    pBlend: o25.pBlend,
    pOdds: o25.pOdds,
    bracketBonus: o25.bracketBonus,
    quality: q.band,
  }, inputs);

  // 4) Grade
  const o25Grade = gradeO25(o25.pO25, cO25);

  const markets: MarketResult[] = [];

  // 5) Single market = OVER25 or UNDER25 (which side wins based on grading or probability)
  const overP = o25.pO25;
  const isOver = o25Grade.side === 'OVER' || (o25Grade.side == null && overP >= 0.5);
  const key: MarketKey = isOver ? 'OVER25' : 'UNDER25';
  const prob = isOver ? overP : 1 - overP;
  const grade = o25Grade.side ? o25Grade.grade : 'PASS';
  const market: MarketResult = {
    key, label: MARKET_LABEL[key], probability: prob, confidence: cO25, grade,
    stakeUnits: stakeFor(grade, cO25, q.band),
    spread: o25.spread,
    odds: isOver ? inputs.oddsOver25 : inputs.oddsUnder25,
    explanation: buildExplanation(o25.signals, key, inputs, o25.spread, o25.pIndependent, o25.independentAdjustment),
  };
  markets.push(market);
  const top = market;

  const homeRatings = buildRatings(ctx.homeRatingInputs, 'home', ctx.leagueAverages);
  const awayRatings = buildRatings(ctx.awayRatingInputs, 'away', ctx.leagueAverages);

  return {
    matchId: ctx.matchId,
    home: ctx.home,
    away: ctx.away,
    leagueName: ctx.leagueName,
    season: ctx.season,
    matchDate: ctx.matchDate,
    quality: q.band,
    qualityCoverage: q.coverage,
    sampleSize: { home: inputs.H_mp ?? 0, away: inputs.A_mp ?? 0 },
    missingCsv: { league: !inputs.hasLeague, matches: !inputs.hasMatches, teams: !inputs.hasTeams },
    homeRatings, awayRatings,
    markets, topPick: top,
  };
}