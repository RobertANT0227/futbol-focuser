// CENTO-V2
import type {
  MarketResult, MatchInputs, PowerAnalysis, MarketKey, MarketExplanation, SignalItem,
} from './types';
import { MARKET_LABEL } from './types';
import { calcBtts } from './btts';
import { calcO25 } from './over25';
import { confBtts, confO25, conflictPenalty, smallSamplePenalty } from './confidence';
import { gradeBtts, gradeO25, stakeFor } from './grading';
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
  conflict: boolean,
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
  if (conflict) risk.push(`Conflict piețe: BTTS Da & Under 2.5 ambele mari.`);

  if (market === 'OVER25' || market === 'UNDER25') {
    if (inp.L_o25 == null) reducers.push('Lipsește baseline ligă Over 2.5.');
  }
  if (market === 'BTTS_YES' || market === 'BTTS_NO') {
    if (inp.M_btts == null) reducers.push('Lipsește potențial BTTS pre-meci.');
  }

  return { signals, boosters, reducers, riskFactors: risk };
}

export function analyzeMatch(ctx: AnalyzeContext): PowerAnalysis {
  const { inputs } = ctx;
  // 1) Quality + 2) sample
  const q = computeQuality(inputs);

  // 3) Probabilities
  const btts = calcBtts(inputs);
  const o25 = calcO25(inputs, btts.pBtts);

  // 4) Confidence
  let cBtts = confBtts(btts.spread, inputs);
  let cO25 = confO25(o25.spread, inputs);
  const conflict = conflictPenalty(btts.pBtts, o25.pO25);
  if (conflict) { cBtts = Math.max(15, cBtts - 5); cO25 = Math.max(15, cO25 - 5); }

  // 5) Grade per market
  const bttsGrade = gradeBtts(btts.pBtts, cBtts);
  const o25Grade = gradeO25(o25.pO25, cO25);

  const markets: MarketResult[] = [];

  // BTTS market — emit the side suggested by probability
  {
    const yesProb = btts.pBtts;
    const isYes = bttsGrade.side === 'YES' || (bttsGrade.side == null && yesProb >= 0.5);
    const key: MarketKey = isYes ? 'BTTS_YES' : 'BTTS_NO';
    const prob = isYes ? yesProb : 1 - yesProb;
    const grade = bttsGrade.side ? bttsGrade.grade : 'PASS';
    markets.push({
      key, label: MARKET_LABEL[key], probability: prob, confidence: cBtts, grade,
      stakeUnits: stakeFor(grade, cBtts, q.band),
      spread: btts.spread,
      odds: isYes ? inputs.oddsBttsYes : inputs.oddsBttsNo,
      explanation: buildExplanation(btts.signals, key, inputs, btts.spread, conflict),
    });
  }

  // O/U 2.5 market
  {
    const overP = o25.pO25;
    const isOver = o25Grade.side === 'OVER' || (o25Grade.side == null && overP >= 0.5);
    const key: MarketKey = isOver ? 'OVER25' : 'UNDER25';
    const prob = isOver ? overP : 1 - overP;
    const grade = o25Grade.side ? o25Grade.grade : 'PASS';
    markets.push({
      key, label: MARKET_LABEL[key], probability: prob, confidence: cO25, grade,
      stakeUnits: stakeFor(grade, cO25, q.band),
      spread: o25.spread,
      odds: isOver ? inputs.oddsOver25 : inputs.oddsUnder25,
      explanation: buildExplanation(o25.signals, key, inputs, o25.spread, conflict),
    });
  }

  // 6) Final pick: max(conf×prob), tiebreak spread, apoi sample
  const sorted = [...markets].sort((a, b) => {
    const sa = a.confidence * a.probability;
    const sb = b.confidence * b.probability;
    if (Math.abs(sb - sa) > 0.5) return sb - sa;
    if (a.spread !== b.spread) return a.spread - b.spread;
    return 0;
  });
  // Preferă un grade ≠ PASS dacă există
  const top = sorted.find((m) => m.grade !== 'PASS') ?? sorted[0];

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