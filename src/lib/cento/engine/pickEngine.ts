import type { LeagueStats, ParsedMatch, TeamProfile } from '@/lib/cento/footystats/types';
import { computeLambdas, computeMarketProbs, computeCornerMarkets, calibrateDraw } from './probabilities';
import { computeRatings, computeMatchTempo } from './ratings';
import { computeQuality } from './quality';
import type {
  ContextSignals,
  ExplainBullet,
  MarketProb,
  PickGrade,
  PowerAnalysis,
} from './types';

function detectConflicts(probs: MarketProb[]): string[] {
  const out: string[] = [];
  const get = (k: string) => probs.find((p) => p.key === k)!.prob;
  const homeWin = get('1');
  const draw = get('X');
  const btts = get('BTTS_YES');
  const over = get('OVER_2_5');
  const under = get('UNDER_2_5');
  // Strong home win + strong under (incompatible without 1-0)
  if (homeWin > 0.6 && under > 0.7 && btts > 0.6) out.push('Home Win + Under 2.5 + BTTS Yes — conflict.');
  if (over > 0.7 && draw > 0.35) out.push('Over 2.5 + high draw — variance.');
  return out;
}

function buildContext(home: TeamProfile | undefined, away: TeamProfile | undefined, league: LeagueStats | undefined): ContextSignals {
  const totalMatches = league?.totalMatches ?? null;
  const earlySeason = (home?.matchesPlayed ?? 0) < 6 || (away?.matchesPlayed ?? 0) < 6;
  const positionGap = home?.position && away?.position ? Math.abs(home.position - away.position) : null;
  let note: string | null = null;
  if (positionGap !== null && positionGap >= 10) note = `Diferență mare în clasament (${positionGap} locuri).`;
  else if (earlySeason) note = 'Început de sezon — eșantion redus.';
  else if (totalMatches && totalMatches > 0) note = null;
  return { earlySeason, positionGap, motivationNote: note };
}

function gradeFromConfidence(conf: number, topProb: number): PickGrade {
  // Pick choice se face strict pe planul de tipster (probabilitate + confidence).
  // Cotele NU contribuie la grade — sunt afișate doar informativ.
  if (conf >= 75 && topProb >= 0.6) return 'STRONG';
  if (conf >= 60 && topProb >= 0.5) return 'MEDIUM';
  if (conf >= 50 && topProb >= 0.42) return 'RISKY';
  return 'PASS';
}

function stakeUnits(grade: PickGrade, conf: number): 0 | 0.5 | 1 | 2 | 3 {
  if (grade === 'PASS') return 0;
  if (grade === 'STRONG' && conf >= 85) return 3;
  if (grade === 'STRONG') return 2;
  if (grade === 'MEDIUM') return 1;
  return 0.5;
}

export function analyzeMatch(
  match: ParsedMatch,
  home: TeamProfile | undefined,
  away: TeamProfile | undefined,
  league: LeagueStats | undefined,
): PowerAnalysis {
  const homeT: TeamProfile = home ?? emptyTeam(match.home);
  const awayT: TeamProfile = away ?? emptyTeam(match.away);

  const rh = computeRatings(homeT, league, true);
  const ra = computeRatings(awayT, league, false);
  const tempo = computeMatchTempo(homeT, awayT, league);
  rh.matchTempo = tempo; ra.matchTempo = tempo;

  let { lambdaHome, lambdaAway, lowSample } = computeLambdas(homeT, awayT, league, rh, ra);
  const prematchHome = firstFinite(match.preXgHome, match.preHomeGoalsAvg);
  const prematchAway = firstFinite(match.preXgAway, match.preAwayGoalsAvg);
  if (prematchHome !== null) lambdaHome = lambdaHome * 0.65 + clampLambda(prematchHome) * 0.35;
  if (prematchAway !== null) lambdaAway = lambdaAway * 0.65 + clampLambda(prematchAway) * 0.35;

  let probs = computeMarketProbs(
    lambdaHome, lambdaAway,
    match.oddsHome, match.oddsDraw, match.oddsAway,
    match.oddsBttsYes, match.oddsBttsNo,
    match.oddsOver25, match.oddsUnder25,
  );
  // Smarter draw calibration with full context (replaces the old inline low-total lift).
  const positionGap = home?.position && away?.position ? Math.abs(home.position - away.position) : null;
  probs = calibrateDraw(probs, {
    lambdaTotal: lambdaHome + lambdaAway,
    leagueDrawPct: league?.drawPct ?? null,
    positionGap,
    tempo,
  });
  const cornerMarkets = computeCornerMarkets(homeT, awayT, league);
  if (cornerMarkets) probs.push(...cornerMarkets);
  const quality = computeQuality(home, away, league, match);

  // strongest pick = highest prob (tipster, not value)
  const sorted = [...probs].sort((a, b) => b.prob - a.prob);
  const top = sorted[0];

  // confidence: data quality + dispersion + sample + tempo agreement
  const dispersion = top.prob - sorted[1].prob;     // 0..1
  let confidence =
    35 +
    quality.coverage * 25 +
    Math.min(dispersion, 0.4) * 80 -
    quality.smallSamplePenalty * 35;
  if (lowSample) confidence -= 8;
  // cap realistic ceiling 92
  confidence = Math.min(92, Math.max(15, confidence));

  const conflicts = detectConflicts(probs);
  if (conflicts.length) confidence -= 8 * conflicts.length;
  // Variance protection: high mutual volatility erodes confidence.
  const avgVol = (rh.matchVolatility + ra.matchVolatility) / 2;
  if (avgVol > 65) confidence -= (avgVol - 65) * 0.25;
  // Consistency alignment bonus: when top pick agrees with both teams' stable profile.
  if ((top.key === 'UNDER_2_5' || top.key === 'BTTS_NO') && rh.defensiveStability > 60 && ra.defensiveStability > 60) confidence += 4;
  if ((top.key === 'OVER_2_5' || top.key === 'BTTS_YES') && rh.offensiveConsistency > 60 && ra.offensiveConsistency > 60) confidence += 4;
  if (top.key === '1' && rh.homeAdvantage > 65 && rh.attack > 60) confidence += 3;
  confidence = Math.min(92, Math.max(15, Math.round(confidence)));

  const grade = gradeFromConfidence(confidence, top.prob);
  const su = stakeUnits(grade, confidence);

  const context = buildContext(home, away, league);
  const explanation = buildExplanation(top, rh, ra, quality, context, conflicts, lambdaHome, lambdaAway);

  const narrative = buildNarrative(match, top, rh, ra, lambdaHome, lambdaAway, grade);

  return {
    match,
    league,
    homeTeam: home,
    awayTeam: away,
    ratingsHome: rh,
    ratingsAway: ra,
    expectedGoalsHome: lambdaHome,
    expectedGoalsAway: lambdaAway,
    probabilities: probs,
    topMarket: top,
    confidence,
    grade,
    stakeUnits: su,
    quality,
    context,
    conflicts,
    explanation,
    narrative,
  };
}

function emptyTeam(name: string): TeamProfile {
  return {
    name, matchesPlayed: null, wins: null, draws: null, losses: null, points: null, ppg: null, position: null,
    goalsFor: null, goalsAgainst: null, goalDiff: null, cleanSheetsPct: null, ftsPct: null,
    bttsPct: null, over25Pct: null, under25Pct: null,
    homePlayed: null, homeWins: null, homeDraws: null, homeLosses: null, homeGFAvg: null, homeGAAvg: null, homeBttsPct: null, homeOver25Pct: null,
    awayPlayed: null, awayWins: null, awayDraws: null, awayLosses: null, awayGFAvg: null, awayGAAvg: null, awayBttsPct: null, awayOver25Pct: null,
    cornersForAvg: null, cornersAgainstAvg: null, cornersForHome: null, cornersAgainstHome: null, cornersForAway: null, cornersAgainstAway: null,
    form: [], shotsAvg: null, shotsOTAvg: null, shotsConcededAvg: null, attackingEff: null, defensiveEff: null, fts2score: null,
    scoringFirstHalfPct: null, scoringSecondHalfPct: null, concedingFirstHalfPct: null, concedingSecondHalfPct: null,
    xgFor: null, xgAgainst: null, xgForHome: null, xgForAway: null, xgAgainstHome: null, xgAgainstAway: null,
    winPct: null, drawPct: null, lossPct: null,
  };
}

function firstFinite(...values: Array<number | null | undefined>): number | null {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  }
  return null;
}

function clampLambda(value: number): number {
  return Math.max(0.15, Math.min(4.5, value));
}

function buildExplanation(
  top: MarketProb, rh: ReturnType<typeof computeRatings>, ra: ReturnType<typeof computeRatings>,
  quality: ReturnType<typeof computeQuality>, context: ContextSignals, conflicts: string[],
  lh: number, la: number,
): ExplainBullet[] {
  const bullets: ExplainBullet[] = [];
  const goalsTotal = lh + la;
  if (top.key === '1') {
    bullets.push({ kind: 'support', text: `Atac gazdă ${rh.attack.toFixed(0)} vs apărare oaspete ${ra.defense.toFixed(0)}.` });
    if (rh.homeAdvantage > 55) bullets.push({ kind: 'support', text: `Avantaj acasă solid (${rh.homeAdvantage.toFixed(0)}).` });
  } else if (top.key === '2') {
    bullets.push({ kind: 'support', text: `Atac oaspete ${ra.attack.toFixed(0)} vs apărare gazdă ${rh.defense.toFixed(0)}.` });
  } else if (top.key === 'X') {
    bullets.push({ kind: 'support', text: 'Echilibru ofensiv-defensiv + tempo redus.' });
  } else if (top.key === 'OVER_2_5' || top.key === 'BTTS_YES') {
    bullets.push({ kind: 'support', text: `xG combinat ${goalsTotal.toFixed(2)}, tempo ${rh.matchTempo.toFixed(0)}.` });
    if (rh.offensiveConsistency > 60 && ra.offensiveConsistency > 60) bullets.push({ kind: 'support', text: 'Ambele echipe consistente ofensiv.' });
  } else if (top.key === 'UNDER_2_5' || top.key === 'BTTS_NO') {
    bullets.push({ kind: 'support', text: `xG combinat scăzut ${goalsTotal.toFixed(2)}.` });
    if (rh.defensiveStability > 60 || ra.defensiveStability > 60) bullets.push({ kind: 'support', text: 'Stabilitate defensivă bună.' });
  }

  if (rh.matchVolatility > 65 || ra.matchVolatility > 65)
    bullets.push({ kind: 'risk', text: 'Volatilitate ridicată în formă.' });
  if (quality.band === 'Limited') bullets.push({ kind: 'risk', text: 'Date limitate — confidence redus.' });
  if (quality.smallSamplePenalty > 0.2) bullets.push({ kind: 'risk', text: 'Eșantion mic home/away.' });
  if (context.earlySeason) bullets.push({ kind: 'risk', text: 'Început de sezon — modelul tinde spre media ligii.' });
  for (const c of conflicts) bullets.push({ kind: 'risk', text: c });
  return bullets;
}

function buildNarrative(
  match: { home: string; away: string },
  top: MarketProb, rh: ReturnType<typeof computeRatings>, ra: ReturnType<typeof computeRatings>,
  lh: number, la: number, grade: PickGrade,
): string {
  if (grade === 'PASS') return `${match.home} vs ${match.away}: variabilitate ridicată sau date insuficiente — fără pick.`;
  return `${match.home} vs ${match.away}: model ${(lh).toFixed(2)}-${(la).toFixed(2)} xG, recomandare ${top.label} (${(top.prob * 100).toFixed(0)}%).`;
}