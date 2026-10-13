import type { MatchData, TeamStats, UserPlan, PoissonMatrix, BetRecommendation, AnalysisResult, AnalysisStep } from './types';
import { CONFIDENCE_STAKE_PCT, loadBankrollState, type ConfidenceLevel } from './bankroll';

/**
 * Parametrii modelului — toate constantele ajustabile într-un singur loc.
 */
export const MODEL_PARAMS = {
  /** Shrinkage spre media ligii: echivalentul a K meciuri "medii" adăugate fiecărei echipe. */
  shrinkK: 8,
  /** Numărul maxim de goluri per echipă în matricea Poisson (0..N). */
  poissonMaxGoals: 12,
  /** Corecția Dixon-Coles pentru scoruri mici (rho < 0 => mai multe egaluri 0-0/1-1). */
  dixonColesRho: -0.05,
  /** Pondere xG în forța atac/apărare când xG > 0 (restul = goluri reale). */
  xgWeight: 0.5,
  /** Pondere formă (0 = ignorat). */
  formWeight: 0,
  /** Pondere stil de joc (0 = ignorat). */
  styleWeight: 0,
  /** Multiplicator xG pentru echipă obosită / cu meci european. */
  fatigueFactor: 0.96,
  /** Multiplicator goluri în derby (1 = fără efect). */
  derbyGoalsFactor: 1.0,
  /** Value peste acest prag (25%) => suspect, probabil eroare de model. */
  maxRecommendedValue: 0.25,
  /** Fracțiunea Kelly folosită la miză. */
  kellyFraction: 0.25,
  /** Miza maximă per pariu (fracție din bankroll). */
  maxStakePctPerBet: 0.03,
  /** Suma maximă a mizelor per meci (fracție din bankroll). */
  maxStakePctPerMatch: 0.05,
  /** Raport varianță/medie pentru cornere (binomială negativă). */
  cornersVarianceRatio: 1.35,
};

const DEFAULT_LEAGUE_HOME = 1.5;
const DEFAULT_LEAGUE_AWAY = 1.2;

function getCurrentBankroll(plan?: UserPlan): number {
  const state = loadBankrollState();
  if (state) return state.currentBankroll;
  return plan?.bankroll || 1000;
}

function isFragileScenario(args: { selection: string; category: string; combinedXG: number; homeScores: number; awayScores: number; odds: number; stability: number }): boolean {
  const { selection, category, combinedXG, homeScores, awayScores, odds, stability } = args;
  if (category === 'goals') {
    if (selection.includes('Under') && combinedXG >= 2.6) return true;
    if (selection.includes('Over') && combinedXG <= 1.9) return true;
    if (selection.includes('BTTS Nu') && homeScores >= 1.3 && awayScores >= 1.3) return true;
  }
  if (category === 'winner' && odds >= 4 && stability < 0.55) return true;
  return false;
}

function detectPlayStyle(team: TeamStats): TeamStats['playStyle'] {
  return team.playStyle;
}

// ===== EXPECTED GOALS =====
export interface XGBreakdown {
  homeXG: number; awayXG: number;
  attH: number; defH: number; attA: number; defA: number;
  muBar: number; leagueHome: number; leagueAway: number;
  rawH: { scored: number; conceded: number }; rawA: { scored: number; conceded: number };
  shrH: { scored: number; conceded: number }; shrA: { scored: number; conceded: number };
}

function leagueAverages(match: MatchData) {
  const leagueHome = match.leagueAvgHomeGoals > 0 ? match.leagueAvgHomeGoals : DEFAULT_LEAGUE_HOME;
  const leagueAway = match.leagueAvgAwayGoals > 0 ? match.leagueAvgAwayGoals : DEFAULT_LEAGUE_AWAY;
  return { leagueHome, leagueAway, muBar: (leagueHome + leagueAway) / 2 };
}

export function calculateXG(match: MatchData): XGBreakdown {
  const { xgWeight: w, shrinkK, fatigueFactor, derbyGoalsFactor } = MODEL_PARAMS;
  const { leagueHome, leagueAway, muBar } = leagueAverages(match);

  const scored = (t: TeamStats) => (t.xG > 0 ? (1 - w) * t.goalsScored + w * t.xG : t.goalsScored);
  const conceded = (t: TeamStats) => (t.xGA > 0 ? (1 - w) * t.goalsConceded + w * t.xGA : t.goalsConceded);
  const shrink = (v: number, n: number) => {
    const nn = Math.max(0, n || 0);
    return (nn * v + shrinkK * muBar) / (nn + shrinkK);
  };

  const h = match.homeTeam, a = match.awayTeam;
  const rawH = { scored: scored(h), conceded: conceded(h) };
  const rawA = { scored: scored(a), conceded: conceded(a) };
  const shrH = { scored: shrink(rawH.scored, h.matchesPlayed), conceded: shrink(rawH.conceded, h.matchesPlayed) };
  const shrA = { scored: shrink(rawA.scored, a.matchesPlayed), conceded: shrink(rawA.conceded, a.matchesPlayed) };

  const attH = shrH.scored / muBar, defH = shrH.conceded / muBar;
  const attA = shrA.scored / muBar, defA = shrA.conceded / muBar;

  let homeXG = leagueHome * attH * defA;
  let awayXG = leagueAway * attA * defH;

  if (match.homeTeamFatigued || match.homeEuropeanMatch) homeXG *= fatigueFactor;
  if (match.awayTeamFatigued || match.awayEuropeanMatch) awayXG *= fatigueFactor;
  if (match.isDerby) { homeXG *= derbyGoalsFactor; awayXG *= derbyGoalsFactor; }

  const clamp = (x: number) => Math.min(4.5, Math.max(0.15, x));
  return { homeXG: clamp(homeXG), awayXG: clamp(awayXG), attH, defH, attA, defA, muBar, leagueHome, leagueAway, rawH, rawA, shrH, shrA };
}

// ===== POISSON + DIXON-COLES =====
function poissonPMF(lambda: number, k: number): number {
  let result = Math.exp(-lambda);
  for (let i = 1; i <= k; i++) result *= lambda / i;
  return result;
}

export function buildPoissonMatrix(homeXG: number, awayXG: number, maxGoals = MODEL_PARAMS.poissonMaxGoals, rho = MODEL_PARAMS.dixonColesRho): PoissonMatrix {
  const homeGoals = Array.from({ length: maxGoals + 1 }, (_, i) => i);
  const awayGoals = Array.from({ length: maxGoals + 1 }, (_, i) => i);
  const probabilities: number[][] = [];
  for (let h = 0; h <= maxGoals; h++) {
    probabilities[h] = [];
    for (let a = 0; a <= maxGoals; a++) probabilities[h][a] = poissonPMF(homeXG, h) * poissonPMF(awayXG, a);
  }
  // Dixon-Coles tau
  probabilities[0][0] *= Math.max(0, 1 - homeXG * awayXG * rho);
  probabilities[0][1] *= Math.max(0, 1 + homeXG * rho);
  probabilities[1][0] *= Math.max(0, 1 + awayXG * rho);
  probabilities[1][1] *= Math.max(0, 1 - rho);
  // Renormalize
  let sum = 0;
  for (const row of probabilities) for (const p of row) sum += p;
  for (const row of probabilities) for (let i = 0; i < row.length; i++) row[i] /= sum;
  return { homeGoals, awayGoals, probabilities };
}

export function calculateResultProbs(matrix: PoissonMatrix) {
  let homeWin = 0, draw = 0, awayWin = 0, over25 = 0, btts = 0;
  for (let h = 0; h < matrix.probabilities.length; h++) {
    for (let a = 0; a < matrix.probabilities[h].length; a++) {
      const p = matrix.probabilities[h][a];
      if (h > a) homeWin += p; else if (h === a) draw += p; else awayWin += p;
      if (h + a > 2) over25 += p;
      if (h > 0 && a > 0) btts += p;
    }
  }
  return { homeWin, draw, awayWin, over25, under25: 1 - over25, btts };
}

// ===== MARGIN REMOVAL =====
/** Normalizare proporțională: p_i = (1/o_i) / Σ(1/o_j). */
export function removeMargin(odds: number[]): number[] {
  const inv = odds.map(o => (o > 1 ? 1 / o : 0));
  const s = inv.reduce((x, y) => x + y, 0);
  if (s <= 0) return odds.map(() => 0);
  return inv.map(v => v / s);
}

function bookMargin(odds: number[]): number {
  return odds.reduce((s, o) => s + (o > 1 ? 1 / o : 0), 0) - 1;
}

// ===== KELLY =====
function kellyStakeFn(prob: number, odds: number): number {
  const b = odds - 1;
  if (b <= 0) return 0;
  return Math.max(0, (b * prob - (1 - prob)) / b);
}

// ===== CORNERS (negative binomial) =====
function cornerSides(match: MatchData) {
  const h = match.homeTeam, a = match.awayTeam;
  const homeWon = h.cornersPerMatchHome || h.cornersPerMatch || 0;
  const awayWon = a.cornersPerMatchAway || a.cornersPerMatch || 0;
  const homeSide = a.cornersAgainstPerMatch && a.cornersAgainstPerMatch > 0 ? (homeWon + a.cornersAgainstPerMatch) / 2 : homeWon;
  const awaySide = h.cornersAgainstPerMatch && h.cornersAgainstPerMatch > 0 ? (awayWon + h.cornersAgainstPerMatch) / 2 : awayWon;
  return { homeSide, awaySide };
}

function negBinCDF(mean: number, k: number): number {
  const K = Math.floor(k);
  if (K < 0) return 0;
  if (mean <= 0) return 1;
  const variance = MODEL_PARAMS.cornersVarianceRatio * mean;
  if (variance <= mean) {
    let s = 0;
    for (let i = 0; i <= K; i++) s += poissonPMF(mean, i);
    return Math.min(1, s);
  }
  const p = mean / variance;        // success prob
  const r = (mean * mean) / (variance - mean);
  let pmf = Math.pow(p, r);         // P(0)
  let s = pmf;
  for (let i = 1; i <= K; i++) {
    pmf *= ((i - 1 + r) / i) * (1 - p);
    s += pmf;
  }
  return Math.min(1, s);
}

/** P(Over line) pentru cornere. */
export function cornersOverProb(mean: number, line: number): number {
  return 1 - negBinCDF(mean, line);
}

// ===== STABILITY =====
const SCALE_COMBOS: [number, number][] = [[0.9, 0.9], [1.1, 1.1], [1.1, 0.9], [0.9, 1.1]];

/** stability = 1 − (pMax − pMin) cu inputurile scalate ×0.9/×1.1 (4 combinații). */
export function computeStability(baseProb: number, probFn: (sh: number, sa: number) => number): number {
  let pMax = baseProb, pMin = baseProb;
  for (const [sh, sa] of SCALE_COMBOS) {
    const p = probFn(sh, sa);
    pMax = Math.max(pMax, p); pMin = Math.min(pMin, p);
  }
  return Math.min(1, Math.max(0, 1 - (pMax - pMin)));
}

function deriveModelConfidence(valueFrac: number, stability: number): 'high' | 'medium' | 'low' {
  if (valueFrac > MODEL_PARAMS.maxRecommendedValue) return 'low';
  if (valueFrac >= 0.05 && valueFrac <= 0.20 && stability >= 0.85) return 'high';
  if (valueFrac >= 0.03 && valueFrac <= 0.25 && stability >= 0.75) return 'medium';
  return 'low';
}

function assessRisk(value: number, stability: number, odds: number): 'low' | 'medium' | 'high' {
  if (odds > 5 || stability < 0.3 || value > 50) return 'high';
  if (odds > 3 || stability < 0.5 || value > 30) return 'medium';
  return 'low';
}

function assignTipsterTier(bet: { value: number; stability: number; confidence: string; risk: string }): 'tipster' | 'tipster_premium' {
  if (bet.confidence === 'high' && bet.risk !== 'high' && bet.value > 5 && bet.stability > 0.5) return 'tipster_premium';
  if (bet.confidence === 'medium' && bet.risk === 'low' && bet.value > 8 && bet.stability > 0.6) return 'tipster_premium';
  return 'tipster';
}
// ===== AI EXPLANATION GENERATOR =====
function generateAIExplanation(
  bet: { selection: string; category: string; prob: number; value: number },
  match: MatchData,
  homeStyle: string,
  awayStyle: string,
  homeXG: number,
  awayXG: number,
  expCorners: number,
  allCategories: string[]
): string {
  const h = match.homeTeam;
  const a = match.awayTeam;
  const parts: string[] = [];
  const rejectedParts: string[] = [];

  if (bet.category === 'goals') {
    if (bet.selection.includes('Over')) {
      parts.push(`Over 2.5 selectat deoarece ambele echipe au xG ridicat (${homeXG.toFixed(2)} vs ${awayXG.toFixed(2)}).`);
      if (h.shotsOnTarget > 4 || a.shotsOnTarget > 4) parts.push(`Șuturi pe poartă ridicate (${h.shotsOnTarget} și ${a.shotsOnTarget}/meci).`);
      if (homeStyle === 'high-press' || awayStyle === 'high-press') parts.push(`Stilul high-press favorizează goluri multiple.`);
      if (homeStyle === 'pressing' || awayStyle === 'pressing') parts.push(`Pressing intens crește șansele de goluri.`);
    } else if (bet.selection.includes('Under')) {
      parts.push(`Under 2.5 selectat deoarece xG combinat este scăzut (${(homeXG + awayXG).toFixed(2)}).`);
      if (awayStyle === 'bus-parking' || awayStyle === 'low-block') parts.push(`${a.name} joacă defensiv (${awayStyle}) cu posesie redusă ${a.possession}%.`);
      if (homeStyle === 'bus-parking' || homeStyle === 'low-block') parts.push(`${h.name} adoptă un stil ultra-defensiv.`);
    } else if (bet.selection.includes('BTTS Da')) {
      parts.push(`BTTS Da selectat: ambele echipe marchează regulat (${h.goalsScored} și ${a.goalsScored} goluri/meci).`);
      if (h.goalsConceded > 1 && a.goalsConceded > 1) parts.push(`Ambele apărări sunt vulnerabile (${h.goalsConceded} și ${a.goalsConceded} primite/meci).`);
    } else if (bet.selection.includes('BTTS Nu')) {
      parts.push(`BTTS Nu selectat: cel puțin o echipă nu marchează constant.`);
      if (awayStyle === 'bus-parking') parts.push(`${a.name} practică bus parking — atac extrem de limitat.`);
    }
  } else if (bet.category === 'winner') {
    if (bet.selection.includes('1')) {
      parts.push(`${h.name} favorizată: xG ${homeXG.toFixed(2)}, avantaj teren propriu, posesie ${h.possession}%.`);
      if (h.leaguePosition < a.leaguePosition) parts.push(`Poziție superioară în clasament (loc ${h.leaguePosition} vs ${a.leaguePosition}).`);
    } else if (bet.selection.includes('X')) {
      parts.push(`Egal probabil: echipe echilibrate cu xG similar (${homeXG.toFixed(2)} vs ${awayXG.toFixed(2)}).`);
    } else {
      parts.push(`${a.name} favorizată: xG ${awayXG.toFixed(2)}, stil ${awayStyle} eficient în deplasare.`);
      if (a.leaguePosition < h.leaguePosition) parts.push(`Clasament superior (loc ${a.leaguePosition} vs ${h.leaguePosition}).`);
    }
  } else if (bet.category === 'corners') {
    if (bet.selection.includes('Over')) {
      parts.push(`Over cornere selectat: medie estimată ${expCorners.toFixed(1)} cornere.`);
      if (homeStyle === 'possession' || homeStyle === 'pressing' || homeStyle === 'high-press') parts.push(`${h.name} domină ofensiv (${h.cornersPerMatch} cornere/meci).`);
      if (awayStyle === 'bus-parking' || awayStyle === 'low-block') parts.push(`${a.name} defensivă — generează cornere pentru adversar prin blocaje.`);
    } else {
      parts.push(`Under cornere selectat: medie estimată ${expCorners.toFixed(1)}, sub linia propusă.`);
    }
  }

  // Add rejections for other categories
  const otherCats = allCategories.filter(c => c !== bet.category);
  for (const cat of otherCats) {
    if (cat === 'corners' && (expCorners < 9 || (homeStyle !== 'pressing' && homeStyle !== 'high-press'))) {
      rejectedParts.push(`Cornere respinse: medie estimată ${expCorners.toFixed(1)} — lipsă lărgime ofensivă.`);
    }
    if (cat === 'goals' && (homeXG + awayXG < 2.2)) {
      rejectedParts.push(`Goluri respinse: xG combinat scăzut (${(homeXG + awayXG).toFixed(2)}).`);
    }
    if (cat === 'winner' && bet.value < 3) {
      rejectedParts.push(`Solist respins: value insuficient față de cota bookmaker.`);
    }
  }

  if (rejectedParts.length > 0) {
    parts.push(rejectedParts.join(' '));
  }

  return parts.join(' ') || `Selecție bazată pe matricea Poisson (Dixon-Coles).`;
}

// ===== STYLE ANALYSIS =====
function analyzeStyle(match: MatchData, homeStyle: string, awayStyle: string): string {
  const h = match.homeTeam;
  const a = match.awayTeam;
  const parts: string[] = [];

  const styleLabel = (s: string) => {
    switch (s) {
      case 'bus-parking': return '🚌 BUS PARKING (Ultra-defensiv)';
      case 'high-press': return '⚡ HIGH PRESS (Gegenpress)';
      case 'pressing': return '🔥 Pressing';
      case 'possession': return '🎯 Posesie';
      case 'counter': return '⚡ Contraatac';
      case 'low-block': return '🛡️ Low-Block';
      default: return s;
    }
  };

  parts.push(`${h.name}: ${styleLabel(homeStyle)} (posesie ${h.possession}%, ${h.shots} șuturi/meci)`);
  parts.push(`${a.name}: ${styleLabel(awayStyle)} (posesie ${a.possession}%, ${a.shots} șuturi/meci)`);

  if (homeStyle === 'high-press' && (awayStyle === 'bus-parking' || awayStyle === 'low-block')) {
    parts.push('⚡ Contrast extrem: pressing intens vs apărare joasă → cornere multe pentru gazdă, goluri puține');
  }
  if (homeStyle === 'pressing' && awayStyle === 'low-block') {
    parts.push('⚡ Contrast de stil: pressing vs apărare joasă → posibil mai puține goluri, mai multe cornere');
  }
  if (homeStyle === 'possession' && awayStyle === 'counter') {
    parts.push('⚡ Posesie vs contraatac → potențial goluri pe tranziție');
  }
  if (homeStyle === 'high-press' && awayStyle === 'high-press') {
    parts.push('🔥 Ambele echipe în pressing intens → meci deschis, goluri multiple așteptate');
  }
  if (awayStyle === 'bus-parking') {
    parts.push(`🚌 ${a.name} practică BUS PARKING: Under 2.5 favorizat, cornere pentru ${h.name}`);
  }
  if (homeStyle === 'bus-parking') {
    parts.push(`🚌 ${h.name} practică BUS PARKING: Under 2.5 favorizat, ${a.name} dominantă`);
  }

  return parts.join('. ');
}

// ===== MOTIVATION ANALYSIS =====
function analyzeMotivation(match: MatchData): string {
  const parts: string[] = [];
  const h = match.homeTeam;
  const a = match.awayTeam;

  if (h.leaguePosition <= 3) parts.push(`${h.name} luptă pentru titlu/UCL (loc ${h.leaguePosition})`);
  if (a.leaguePosition <= 3) parts.push(`${a.name} luptă pentru titlu/UCL (loc ${a.leaguePosition})`);
  if (h.leaguePosition >= h.totalTeamsInLeague - 2) parts.push(`${h.name} luptă pentru supraviețuire (loc ${h.leaguePosition})`);
  if (a.leaguePosition >= a.totalTeamsInLeague - 2) parts.push(`${a.name} luptă pentru supraviețuire (loc ${a.leaguePosition})`);
  if (match.isDerby) parts.push('🔥 Derby! Motivare maximă pentru ambele echipe');
  if (match.homeTeamFatigued) parts.push(`⚠️ ${h.name} obosite (program încărcat)`);
  if (match.awayTeamFatigued) parts.push(`⚠️ ${a.name} obosite (program încărcat)`);

  return parts.length > 0 ? parts.join('. ') : 'Fără factori motivaționali speciali.';
}


// ===== ANALYSIS STEPS =====
function buildAnalysisSteps(match: MatchData, xg: XGBreakdown, probs: ReturnType<typeof calculateResultProbs>, margin1x2: number, fair1x2: number[], expCorners: number): AnalysisStep[] {
  const h = match.homeTeam, a = match.awayTeam;
  const f3 = (n: number) => n.toFixed(3);
  const p1 = (n: number) => `${(n * 100).toFixed(1)}%`;
  return [
    {
      title: '1. Date de intrare & medii ligă',
      description: `${h.name} vs ${a.name}. Medie ligă: ${xg.leagueHome.toFixed(2)} goluri gazdă / ${xg.leagueAway.toFixed(2)} goluri oaspete, μ̄ = ${xg.muBar.toFixed(3)}. Golurile reale se combină cu xG (pondere ${MODEL_PARAMS.xgWeight}) când xG > 0.`,
      data: {
        'Marcate gazdă (mix)': f3(xg.rawH.scored), 'Primite gazdă (mix)': f3(xg.rawH.conceded),
        'Marcate oaspete (mix)': f3(xg.rawA.scored), 'Primite oaspete (mix)': f3(xg.rawA.conceded),
        'Meciuri gazdă': h.matchesPlayed, 'Meciuri oaspete': a.matchesPlayed,
      },
    },
    {
      title: '2. Shrinkage spre media ligii',
      description: `v' = (n·v + K·μ̄) / (n + K), K = ${MODEL_PARAMS.shrinkK}. Echipele cu puține meciuri sunt trase spre media ligii.`,
      data: {
        'Marcate gazdă (shrink)': f3(xg.shrH.scored), 'Primite gazdă (shrink)': f3(xg.shrH.conceded),
        'Marcate oaspete (shrink)': f3(xg.shrA.scored), 'Primite oaspete (shrink)': f3(xg.shrA.conceded),
      },
    },
    {
      title: '3. Forță atac / apărare',
      description: `att = marcate'/μ̄, def = primite'/μ̄. attH=${f3(xg.attH)}, defA=${f3(xg.defA)}, attA=${f3(xg.attA)}, defH=${f3(xg.defH)}.`,
      data: { attH: f3(xg.attH), defA: f3(xg.defA), attA: f3(xg.attA), defH: f3(xg.defH) },
    },
    {
      title: '4. Expected Goals final',
      description: `homeXG = ${xg.leagueHome.toFixed(2)} × attH × defA; awayXG = ${xg.leagueAway.toFixed(2)} × attA × defH. Oboseală/meci european ×${MODEL_PARAMS.fatigueFactor}, derby ×${MODEL_PARAMS.derbyGoalsFactor}, limitat la [0.15, 4.5].`,
      data: { 'xG gazdă': xg.homeXG.toFixed(2), 'xG oaspete': xg.awayXG.toFixed(2), 'xG total': (xg.homeXG + xg.awayXG).toFixed(2) },
    },
    {
      title: '5. Matrice Poisson + Dixon-Coles',
      description: `Matrice ${MODEL_PARAMS.poissonMaxGoals + 1}×${MODEL_PARAMS.poissonMaxGoals + 1}, corecție Dixon-Coles (ρ = ${MODEL_PARAMS.dixonColesRho}) pe 0-0, 1-0, 0-1, 1-1, renormalizată la 1. Toate piețele de goluri se citesc direct din matrice.`,
      data: { 'P(1)': p1(probs.homeWin), 'P(X)': p1(probs.draw), 'P(2)': p1(probs.awayWin), 'Over 2.5': p1(probs.over25), 'BTTS': p1(probs.btts) },
    },
    {
      title: '6. Cote fără marjă',
      description: `Marja casei 1X2: ${(margin1x2 * 100).toFixed(2)}%. Probabilitățile casei sunt normalizate proporțional pe fiecare piață (1X2, O/U 2.5, BTTS, fiecare linie de cornere).`,
      data: { 'Marjă 1X2': `${(margin1x2 * 100).toFixed(2)}%`, 'P(1) casă': p1(fair1x2[0]), 'P(X) casă': p1(fair1x2[1]), 'P(2) casă': p1(fair1x2[2]) },
    },
    {
      title: '7. Cornere (binomială negativă)',
      description: `Medie cornere = cornere gazdă + cornere oaspete (mediate cu cele concedate de adversar, dacă sunt introduse). Varianță = ${MODEL_PARAMS.cornersVarianceRatio} × medie.`,
      data: { 'Cornere estimate': expCorners.toFixed(1) },
    },
    {
      title: '8. Value, stabilitate & miză',
      description: `EV = p × cotă − 1; doar EV > 0 primește miză. Value > ${MODEL_PARAMS.maxRecommendedValue * 100}% = suspect. Stabilitate = 1 − (pMax − pMin) la xG ×0.9/×1.1. Miză = min(nivel încredere, ${MODEL_PARAMS.kellyFraction} × Kelly), max ${MODEL_PARAMS.maxStakePctPerBet * 100}%/pariu și ${MODEL_PARAMS.maxStakePctPerMatch * 100}%/meci.`,
    },
  ];
}

// ===== MAIN ANALYSIS =====
export function runAnalysis(match: MatchData, plan?: UserPlan): AnalysisResult {
  const homeStyle = detectPlayStyle(match.homeTeam);
  const awayStyle = detectPlayStyle(match.awayTeam);

  const xg = calculateXG(match);
  const { homeXG, awayXG } = xg;
  const matrix = buildPoissonMatrix(homeXG, awayXG);
  const probs = calculateResultProbs(matrix);

  // Probabilities under scaled xG for stability
  const scaledProbsCache = new Map<string, ReturnType<typeof calculateResultProbs>>();
  const scaledProbs = (sh: number, sa: number) => {
    const key = `${sh}-${sa}`;
    let p = scaledProbsCache.get(key);
    if (!p) { p = calculateResultProbs(buildPoissonMatrix(homeXG * sh, awayXG * sa)); scaledProbsCache.set(key, p); }
    return p;
  };

  const { homeSide, awaySide } = cornerSides(match);
  const expCorners = homeSide + awaySide;

  const fair1x2 = removeMargin([match.oddsHome, match.oddsDraw, match.oddsAway]);
  const fairOU = removeMargin([match.oddsOver25, match.oddsUnder25]);
  const fairBTTS = removeMargin([match.oddsBTTSYes, match.oddsBTTSNo]);
  const margin1x2 = bookMargin([match.oddsHome, match.oddsDraw, match.oddsAway]);

  const bankroll = getCurrentBankroll(plan);
  const combinedXG = homeXG + awayXG;
  const allCategories = ['corners', 'winner', 'goals'];

  type Cand = {
    type: string; category: BetRecommendation['category']; selection: string;
    prob: number; odds: number; bookProb: number;
    probFn: (sh: number, sa: number) => number;
  };
  const cands: Cand[] = [
    { type: 'Solist', category: 'winner', selection: `${match.homeTeam.name} (1)`, prob: probs.homeWin, odds: match.oddsHome, bookProb: fair1x2[0], probFn: (a, b) => scaledProbs(a, b).homeWin },
    { type: 'Solist', category: 'winner', selection: 'Egal (X)', prob: probs.draw, odds: match.oddsDraw, bookProb: fair1x2[1], probFn: (a, b) => scaledProbs(a, b).draw },
    { type: 'Solist', category: 'winner', selection: `${match.awayTeam.name} (2)`, prob: probs.awayWin, odds: match.oddsAway, bookProb: fair1x2[2], probFn: (a, b) => scaledProbs(a, b).awayWin },
    { type: 'Goluri', category: 'goals', selection: 'Over 2.5', prob: probs.over25, odds: match.oddsOver25, bookProb: fairOU[0], probFn: (a, b) => scaledProbs(a, b).over25 },
    { type: 'Goluri', category: 'goals', selection: 'Under 2.5', prob: probs.under25, odds: match.oddsUnder25, bookProb: fairOU[1], probFn: (a, b) => scaledProbs(a, b).under25 },
    { type: 'Goluri', category: 'goals', selection: 'BTTS Da', prob: probs.btts, odds: match.oddsBTTSYes, bookProb: fairBTTS[0], probFn: (a, b) => scaledProbs(a, b).btts },
    { type: 'Goluri', category: 'goals', selection: 'BTTS Nu', prob: 1 - probs.btts, odds: match.oddsBTTSNo, bookProb: fairBTTS[1], probFn: (a, b) => 1 - scaledProbs(a, b).btts },
  ];
  for (const cl of match.cornerLines) {
    if (!(cl.oddsOver > 1 && cl.oddsUnder > 1)) continue;
    const fair = removeMargin([cl.oddsOver, cl.oddsUnder]);
    const overP = cornersOverProb(expCorners, cl.line);
    const overFn = (sh: number, sa: number) => cornersOverProb(homeSide * sh + awaySide * sa, cl.line);
    cands.push({ type: 'Cornere', category: 'corners', selection: `Over ${cl.line} cornere`, prob: overP, odds: cl.oddsOver, bookProb: fair[0], probFn: overFn });
    cands.push({ type: 'Cornere', category: 'corners', selection: `Under ${cl.line} cornere`, prob: 1 - overP, odds: cl.oddsUnder, bookProb: fair[1], probFn: (a, b) => 1 - overFn(a, b) });
  }

  const recommendations: BetRecommendation[] = [];
  for (const c of cands) {
    if (!(c.odds > 1) || !(c.bookProb > 0)) continue;
    const valueFrac = (c.prob - c.bookProb) / c.bookProb;
    const value = valueFrac * 100;
    const ev = c.prob * c.odds - 1;
    const stability = computeStability(c.prob, c.probFn);
    const suspect = valueFrac > MODEL_PARAMS.maxRecommendedValue;
    const confidence = deriveModelConfidence(valueFrac, stability);
    const risk = assessRisk(value, stability, c.odds);
    const kelly = kellyStakeFn(c.prob, c.odds);
    const fragile = isFragileScenario({ selection: c.selection, category: c.category, combinedXG, homeScores: match.homeTeam.goalsScored, awayScores: match.awayTeam.goalsScored, odds: c.odds, stability });

    let stakeConfidence: ConfidenceLevel = confidence === 'high' ? 'HIGH' : confidence === 'medium' ? 'MEDIUM' : 'LOW';
    if (fragile && stakeConfidence !== 'LOW') stakeConfidence = 'LOW';
    let stakePct = 0;
    if (ev > 0) {
      stakePct = Math.min(CONFIDENCE_STAKE_PCT[stakeConfidence], MODEL_PARAMS.kellyFraction * kelly, MODEL_PARAMS.maxStakePctPerBet);
    }

    let aiExplanation = generateAIExplanation(
      { selection: c.selection, category: c.category, prob: c.prob, value },
      match, homeStyle, awayStyle, homeXG, awayXG, expCorners, allCategories,
    );
    if (suspect) aiExplanation = `⚠️ Suspect: probabil eroare de model (value ${value.toFixed(1)}% > ${MODEL_PARAMS.maxRecommendedValue * 100}%). ` + aiExplanation;

    recommendations.push({
      type: c.type, category: c.category, selection: c.selection,
      modelProbability: c.prob, bookmakerProbability: c.bookProb,
      value, odds: c.odds,
      kellyStake: kelly * (plan ? plan.bankroll : 100), kellyPercent: kelly * 100,
      confidence, stability, risk,
      tipsterTier: assignTipsterTier({ value, stability, confidence, risk }),
      aiExplanation,
      stakeConfidence, stakePct, stakeLei: 0, ev, fragile, suspect,
    });
  }

  // Filter by plan
  let filtered = recommendations;
  if (plan) {
    filtered = filtered.filter(r => {
      if ((plan.maxRisk === 'low' || plan.maxRisk === 'medium') && r.risk === 'high') return false;
      if (!plan.preferredBets.includes(r.category)) return false;
      return true;
    });
  }

  applyMatchStakeCap(filtered, bankroll);

  filtered.sort((a, b) => b.ev - a.ev);
  const bestBet = filtered.find(r => r.ev > 0 && r.confidence !== 'low') || null;

  return {
    homeXG, awayXG,
    poissonMatrix: matrix,
    homeWinProb: probs.homeWin, drawProb: probs.draw, awayWinProb: probs.awayWin,
    over25Prob: probs.over25, under25Prob: probs.under25, bttsProb: probs.btts,
    expectedCorners: expCorners,
    recommendations: filtered,
    styleAnalysis: analyzeStyle(match, homeStyle, awayStyle),
    motivationAnalysis: analyzeMotivation(match),
    analysisSteps: buildAnalysisSteps(match, xg, probs, margin1x2, fair1x2, expCorners),
    detectedStyles: { home: homeStyle, away: awayStyle },
    bestBet,
  };
}

/** Scalează proporțional mizele ca suma per meci să nu depășească maxStakePctPerMatch; calculează stakeLei. */
export function applyMatchStakeCap(recs: BetRecommendation[], bankroll: number) {
  const total = recs.reduce((s, r) => s + r.stakePct, 0);
  const factor = total > MODEL_PARAMS.maxStakePctPerMatch ? MODEL_PARAMS.maxStakePctPerMatch / total : 1;
  for (const r of recs) {
    r.stakePct = r.stakePct * factor;
    r.stakeLei = Math.round(bankroll * r.stakePct * 100) / 100;
  }
}
