import type { MatchData, TeamStats, UserPlan, PoissonMatrix, BetRecommendation, AnalysisResult, AnalysisStep } from './types';
import { CONFIDENCE_STAKE_PCT, loadBankrollState, type ConfidenceLevel } from './bankroll';
import { getActiveLearnedWeights, computeLearnedXG } from './learn/weightsStore';

/**
 * MODEL_PARAMS — toate constantele modelului într-un singur loc.
 * Valorile marcate "ipoteză" sunt de calibrat pe date reale (vezi /istoric).
 */
export const MODEL_PARAMS = {
  /** Shrinkage spre media ligii: echivalentul a K meciuri "medii" adăugate fiecărei echipe. */
  shrinkK: 12,
  /** Numărul maxim de goluri per echipă în matricea Poisson (0..N). */
  poissonMaxGoals: 12,
  /** Corecția Dixon-Coles pentru scoruri mici (rho < 0 => mai multe egaluri 0-0/1-1). ipoteză */
  dixonColesRho: -0.05,
  /** Pondere xG în forța atac/apărare când xG > 0 (restul = goluri reale). ipoteză */
  xgWeight: 0.5,
  /** Multiplicator xG pentru echipă obosită / cu meci european. */
  fatigueFactor: 0.96,
  /** Multiplicator goluri în derby (1 = fără efect). */
  derbyGoalsFactor: 1.0,
  /** Multiplicator cornere în derby (1 = fără efect). */
  derbyCornersFactor: 1.0,
  /** Raport varianță/medie pentru cornere (binomială negativă). ipoteză */
  negBinVarianceRatio: 1.3,
  /** Praguri de posesie (%) pentru clasificarea automată a stilului. */
  styleThresholds: { possession: 55, pressing: 50, counter: 45, lowBlock: 43 },
  /** Ritm de joc per stil (multiplicativ pe xG). ipoteză */
  styleTempo: {
    possession: 1.0, pressing: 1.02, counter: 0.99,
    'low-block': 0.97, 'bus-parking': 0.95, 'high-press': 1.04, unknown: 1.0,
  } as Record<string, number>,
  /** Efect de matchup stil atacant vs stil apărător (implicit 1.00). ipoteză */
  styleMatchup: {
    counter: { 'low-block': 0.95, 'bus-parking': 0.93, possession: 1.05, pressing: 1.04, 'high-press': 1.06 },
    possession: { 'low-block': 0.96, 'bus-parking': 0.93, counter: 1.02 },
    pressing: { 'low-block': 0.97, 'bus-parking': 0.95 },
    'high-press': { 'low-block': 0.97, 'bus-parking': 0.94, possession: 1.02 },
    'low-block': { 'high-press': 1.04, pressing: 1.02 },
    'bus-parking': { 'high-press': 1.03, pressing: 1.02 },
  } as Record<string, Record<string, number>>,
  /** Limita efectului total de stil pe fiecare xG. */
  styleEffectClamp: [0.88, 1.08] as [number, number],
  /** Factor cornere proprii per stil. */
  styleCornersOwn: { possession: 1.02, pressing: 1.01 } as Record<string, number>,
  /** Factor cornere generate adversarului per stil. */
  styleCornersOpponent: { 'low-block': 1.03, 'bus-parking': 1.05 } as Record<string, number>,
  /** Ponderea modelului în amestecul cu piața (restul = piața). */
  marketWeightModel: 0.5,
  /** Meciuri de la care modelul primește ponderea maximă în amestec. */
  fullWeightMatches: 20,
  /** Sub atâtea meciuri jucate (minimul dintre echipe) nu se recomandă nimic. */
  minMatchesToRecommend: 8,
  /** EV minim pentru recomandare. */
  minEv: 0.03,
  /** EV peste acest prag => suspect, probabil eroare de model. */
  suspectEv: 0.25,
  /** Fracțiunea Kelly folosită la miză. */
  kellyFraction: 0.25,
  /** Miza maximă per pariu (fracție din bankroll). */
  maxStakePctPerBet: 0.02,
  /** Suma maximă a mizelor per meci (fracție din bankroll). */
  maxStakePctPerMatch: 0.04,
};

const DEFAULT_LEAGUE_HOME = 1.5;
const DEFAULT_LEAGUE_AWAY = 1.2;

export type PlayStyle = TeamStats['playStyle'];

/**
 * Clasifică stilul din posesie (procent 0–100; valorile 0–1 sunt tratate ca fracție).
 * Lipsă/NaN/<=0 => 'unknown'.
 */
export function classifyStyle(possession?: number): PlayStyle {
  if (possession === undefined || possession === null || Number.isNaN(possession)) return 'unknown';
  let p = possession;
  if (p > 0 && p <= 1) p = p * 100;
  if (p <= 0) return 'unknown';
  const t = MODEL_PARAMS.styleThresholds;
  if (p >= t.possession) return 'possession';
  if (p >= t.pressing) return 'pressing';
  if (p >= t.counter) return 'counter';
  if (p >= t.lowBlock) return 'low-block';
  return 'bus-parking';
}

/** Stilul efectiv: manual dacă playStyleMode === 'manual', altfel auto din posesie. */
export function detectPlayStyle(team: TeamStats): PlayStyle {
  if (team.playStyleMode === 'manual') return team.playStyle;
  return classifyStyle(team.possession);
}

function getCurrentBankroll(plan?: UserPlan): number {
  const state = loadBankrollState();
  if (state) return state.currentBankroll;
  return plan?.bankroll || 1000;
}

function isFragileScenario(args: { selection: string; category: string; combinedXG: number; homeScores: number; awayScores: number; odds: number; reliability: number }): boolean {
  const { selection, category, combinedXG, homeScores, awayScores, odds, reliability } = args;
  if (category === 'goals') {
    if (selection.includes('Under') && combinedXG >= 2.6) return true;
    if (selection.includes('Over') && combinedXG <= 1.9) return true;
    if (selection.includes('BTTS Nu') && homeScores >= 1.3 && awayScores >= 1.3) return true;
  }
  if (category === 'winner' && odds >= 4 && reliability < 0.55) return true;
  return false;
}

// ===== EXPECTED GOALS =====
export interface XGBreakdown {
  homeXG: number; awayXG: number;
  attH: number; defH: number; attA: number; defA: number;
  muBar: number; leagueHome: number; leagueAway: number;
  rawH: { scored: number; conceded: number }; rawA: { scored: number; conceded: number };
  shrH: { scored: number; conceded: number }; shrA: { scored: number; conceded: number };
  homeXGBeforeStyle: number; awayXGBeforeStyle: number;
  gameTempo: number; matchupH: number; matchupA: number;
  styleEffectH: number; styleEffectA: number;
  usedLearnedWeights: boolean;
}

function leagueAverages(match: MatchData) {
  const leagueHome = match.leagueAvgHomeGoals > 0 ? match.leagueAvgHomeGoals : DEFAULT_LEAGUE_HOME;
  const leagueAway = match.leagueAvgAwayGoals > 0 ? match.leagueAvgAwayGoals : DEFAULT_LEAGUE_AWAY;
  return { leagueHome, leagueAway, muBar: (leagueHome + leagueAway) / 2 };
}

export function calculateXG(match: MatchData, homeStyle: PlayStyle, awayStyle: PlayStyle): XGBreakdown {
  const { xgWeight: w, shrinkK, fatigueFactor, derbyGoalsFactor, styleTempo, styleMatchup, styleEffectClamp } = MODEL_PARAMS;
  const { leagueHome, leagueAway, muBar } = leagueAverages(match);
  const h = match.homeTeam, a = match.awayTeam;

  const learned = getActiveLearnedWeights();
  const clamp = (x: number) => Math.min(4.5, Math.max(0.15, x));

  if (learned) {
    // Ponderi învățate active: xG = media ligii × exp(w · trăsături); stratul de stil NU se aplică.
    const { homeXG, awayXG } = computeLearnedXG(match, learned);
    return {
      homeXG: clamp(homeXG), awayXG: clamp(awayXG),
      attH: 0, defH: 0, attA: 0, defA: 0, muBar, leagueHome, leagueAway,
      rawH: { scored: h.goalsScored, conceded: h.goalsConceded },
      rawA: { scored: a.goalsScored, conceded: a.goalsConceded },
      shrH: { scored: h.goalsScored, conceded: h.goalsConceded },
      shrA: { scored: a.goalsScored, conceded: a.goalsConceded },
      homeXGBeforeStyle: clamp(homeXG), awayXGBeforeStyle: clamp(awayXG),
      gameTempo: 1, matchupH: 1, matchupA: 1, styleEffectH: 1, styleEffectA: 1,
      usedLearnedWeights: true,
    };
  }

  const scored = (t: TeamStats) => (t.xG > 0 ? (1 - w) * t.goalsScored + w * t.xG : t.goalsScored);
  const conceded = (t: TeamStats) => (t.xGA > 0 ? (1 - w) * t.goalsConceded + w * t.xGA : t.goalsConceded);
  const shrink = (v: number, n: number) => {
    const nn = Math.max(0, n || 0);
    return (nn * v + shrinkK * muBar) / (nn + shrinkK);
  };

  const rawH = { scored: scored(h), conceded: conceded(h) };
  const rawA = { scored: scored(a), conceded: conceded(a) };
  const shrH = { scored: shrink(rawH.scored, h.matchesPlayed), conceded: shrink(rawH.conceded, h.matchesPlayed) };
  const shrA = { scored: shrink(rawA.scored, a.matchesPlayed), conceded: shrink(rawA.conceded, a.matchesPlayed) };

  const attH = shrH.scored / muBar, defH = shrH.conceded / muBar;
  const attA = shrA.scored / muBar, defA = shrA.conceded / muBar;

  let homeXG = leagueHome * attH * defA;
  let awayXG = leagueAway * attA * defH;

  // a) oboseală / derby
  if (match.homeTeamFatigued || match.homeEuropeanMatch) homeXG *= fatigueFactor;
  if (match.awayTeamFatigued || match.awayEuropeanMatch) awayXG *= fatigueFactor;
  if (match.isDerby) { homeXG *= derbyGoalsFactor; awayXG *= derbyGoalsFactor; }

  // b) stil: ritm de joc + matchup, cu clamp pe efectul total
  const homeXGBeforeStyle = homeXG, awayXGBeforeStyle = awayXG;
  const gameTempo = (styleTempo[homeStyle] ?? 1) * (styleTempo[awayStyle] ?? 1);
  const matchupH = styleMatchup[homeStyle]?.[awayStyle] ?? 1;
  const matchupA = styleMatchup[awayStyle]?.[homeStyle] ?? 1;
  homeXG *= gameTempo * matchupH;
  awayXG *= gameTempo * matchupA;
  const styleEffectH = Math.min(styleEffectClamp[1], Math.max(styleEffectClamp[0], homeXGBeforeStyle > 0 ? homeXG / homeXGBeforeStyle : 1));
  const styleEffectA = Math.min(styleEffectClamp[1], Math.max(styleEffectClamp[0], awayXGBeforeStyle > 0 ? awayXG / awayXGBeforeStyle : 1));
  homeXG = homeXGBeforeStyle * styleEffectH;
  awayXG = awayXGBeforeStyle * styleEffectA;

  // c) limitare generală
  return {
    homeXG: clamp(homeXG), awayXG: clamp(awayXG),
    attH, defH, attA, defA, muBar, leagueHome, leagueAway,
    rawH, rawA, shrH, shrA,
    homeXGBeforeStyle, awayXGBeforeStyle,
    gameTempo, matchupH, matchupA, styleEffectH, styleEffectA,
    usedLearnedWeights: false,
  };
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
  // Dixon-Coles tau pe scoruri mici
  probabilities[0][0] *= Math.max(0, 1 - homeXG * awayXG * rho);
  probabilities[0][1] *= Math.max(0, 1 + homeXG * rho);
  probabilities[1][0] *= Math.max(0, 1 + awayXG * rho);
  probabilities[1][1] *= Math.max(0, 1 - rho);
  // Renormalizare la suma 1
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
function cornerSides(match: MatchData, homeStyle: PlayStyle, awayStyle: PlayStyle) {
  const h = match.homeTeam, a = match.awayTeam;
  const { styleCornersOwn, styleCornersOpponent } = MODEL_PARAMS;
  const homeWon = h.cornersPerMatchHome || h.cornersPerMatch || 0;
  const awayWon = a.cornersPerMatchAway || a.cornersPerMatch || 0;
  const homeComp = a.cornersAgainstPerMatch && a.cornersAgainstPerMatch > 0 ? (homeWon + a.cornersAgainstPerMatch) / 2 : homeWon;
  const awayComp = h.cornersAgainstPerMatch && h.cornersAgainstPerMatch > 0 ? (awayWon + h.cornersAgainstPerMatch) / 2 : awayWon;
  const factorH = (styleCornersOwn[homeStyle] ?? 1) * (styleCornersOpponent[awayStyle] ?? 1);
  const factorA = (styleCornersOwn[awayStyle] ?? 1) * (styleCornersOpponent[homeStyle] ?? 1);
  return { homeSide: homeComp * factorH, awaySide: awayComp * factorA };
}

function negBinCDF(mean: number, k: number): number {
  const K = Math.floor(k);
  if (K < 0) return 0;
  if (mean <= 0) return 1;
  const variance = MODEL_PARAMS.negBinVarianceRatio * mean;
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

// ===== DECISION =====
function deriveConfidence(ev: number, reliability: number): 'high' | 'medium' | 'low' {
  if (ev > MODEL_PARAMS.suspectEv) return 'low';
  if (ev >= 0.05 && ev <= 0.20 && reliability >= 0.6) return 'high';
  if (ev >= 0.03 && ev <= 0.25 && reliability >= 0.4) return 'medium';
  return 'low';
}

function assessRisk(odds: number, reliability: number, ev: number): 'low' | 'medium' | 'high' {
  if (odds > 5 || reliability < 0.4 || ev > MODEL_PARAMS.suspectEv) return 'high';
  if (odds > 3 || reliability < 0.55) return 'medium';
  return 'low';
}

function assignTipsterTier(bet: { value: number; confidence: string; risk: string; reliability: number }): 'tipster' | 'tipster_premium' {
  if (bet.confidence === 'high' && bet.risk !== 'high' && bet.value > 5 && bet.reliability > 0.5) return 'tipster_premium';
  if (bet.confidence === 'medium' && bet.risk === 'low' && bet.value > 8 && bet.reliability > 0.6) return 'tipster_premium';
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
    if (bet.selection.includes('(1)')) {
      parts.push(`${h.name} favorizată: xG ${homeXG.toFixed(2)}, avantaj teren propriu, posesie ${h.possession}%.`);
      if (h.leaguePosition < a.leaguePosition) parts.push(`Poziție superioară în clasament (loc ${h.leaguePosition} vs ${a.leaguePosition}).`);
    } else if (bet.selection.includes('(X)')) {
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
export function styleLabelRo(s: string): string {
  switch (s) {
    case 'bus-parking': return '🚌 BUS PARKING (Ultra-defensiv)';
    case 'high-press': return '⚡ HIGH PRESS (Gegenpress)';
    case 'pressing': return '🔥 Pressing';
    case 'possession': return '🎯 Posesie';
    case 'counter': return '⚡ Contraatac';
    case 'low-block': return '🛡️ Low-Block';
    case 'unknown': return '❓ Necunoscut';
    default: return s;
  }
}

function analyzeStyle(match: MatchData, homeStyle: string, awayStyle: string): string {
  const h = match.homeTeam;
  const a = match.awayTeam;
  const parts: string[] = [];

  parts.push(`${h.name}: ${styleLabelRo(homeStyle)} (posesie ${h.possession}%, ${h.shots} șuturi/meci)`);
  parts.push(`${a.name}: ${styleLabelRo(awayStyle)} (posesie ${a.possession}%, ${a.shots} șuturi/meci)`);

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
interface BlendInfo {
  minN: number; reliability: number; wModel: number;
  fair1x2: number[]; margin1x2: number;
}

function buildAnalysisSteps(
  match: MatchData,
  xg: XGBreakdown,
  homeStyle: PlayStyle,
  awayStyle: PlayStyle,
  probs: ReturnType<typeof calculateResultProbs>,
  blend: BlendInfo,
  expCorners: number,
  bestBet: BetRecommendation | null,
): AnalysisStep[] {
  const h = match.homeTeam, a = match.awayTeam;
  const f3 = (n: number) => n.toFixed(3);
  const p1 = (n: number) => `${(n * 100).toFixed(1)}%`;
  const modeH = h.playStyleMode === 'manual' ? 'manual' : 'auto';
  const modeA = a.playStyleMode === 'manual' ? 'manual' : 'auto';

  const styleStep: AnalysisStep = xg.usedLearnedWeights
    ? {
        title: '3. Stil de joc',
        description: 'Stratul de stil este OPRIT: ponderile învățate sunt active, iar stilul este deja trăsătură în modelul învățat.',
      }
    : {
        title: '3. Stil de joc',
        description: `${h.name}: posesie ${h.possession}% → ${styleLabelRo(homeStyle)} (${modeH}); ${a.name}: posesie ${a.possession}% → ${styleLabelRo(awayStyle)} (${modeA}). Ritm gameTempo = ${f3(xg.gameTempo)}, matchup gazdă ×${f3(xg.matchupH)}, oaspete ×${f3(xg.matchupA)}. Efect total pe xG: gazdă ×${f3(xg.styleEffectH)}, oaspete ×${f3(xg.styleEffectA)} (limitat la [${MODEL_PARAMS.styleEffectClamp[0]}, ${MODEL_PARAMS.styleEffectClamp[1]}]).`,
        data: {
          'xG gazdă înainte de stil': f3(xg.homeXGBeforeStyle), 'xG gazdă după stil': f3(xg.homeXGBeforeStyle * xg.styleEffectH),
          'xG oaspete înainte de stil': f3(xg.awayXGBeforeStyle), 'xG oaspete după stil': f3(xg.awayXGBeforeStyle * xg.styleEffectA),
        },
      };

  return [
    {
      title: '1. Date de intrare',
      description: `${h.name} vs ${a.name}. Medie ligă: ${xg.leagueHome.toFixed(2)} goluri gazdă / ${xg.leagueAway.toFixed(2)} goluri oaspete, μ̄ = ${f3(xg.muBar)}. Golurile reale se combină cu xG (pondere ${MODEL_PARAMS.xgWeight}) când xG > 0.`,
      data: {
        'Marcate gazdă (mix)': f3(xg.rawH.scored), 'Primite gazdă (mix)': f3(xg.rawH.conceded),
        'Marcate oaspete (mix)': f3(xg.rawA.scored), 'Primite oaspete (mix)': f3(xg.rawA.conceded),
        'Meciuri gazdă': h.matchesPlayed, 'Meciuri oaspete': a.matchesPlayed,
      },
    },
    {
      title: '2. Forță atac/apărare cu shrinkage',
      description: xg.usedLearnedWeights
        ? 'Formula fixă nu se folosește: ponderile învățate calculează direct xG din trăsături.'
        : `v' = (n·v + K·μ̄) / (n + K), K = ${MODEL_PARAMS.shrinkK}. att = marcate'/μ̄, def = primite'/μ̄.`,
      data: xg.usedLearnedWeights ? undefined : { attH: f3(xg.attH), defA: f3(xg.defA), attA: f3(xg.attA), defH: f3(xg.defH) },
    },
    styleStep,
    {
      title: '4. xG final',
      description: xg.usedLearnedWeights
        ? `xG calculat cu ponderi învățate: media ligii × exp(w · trăsături), limitat la [0.15, 4.5].`
        : `homeXG = ${xg.leagueHome.toFixed(2)} × attH × defA; awayXG = ${xg.leagueAway.toFixed(2)} × attA × defH. Oboseală/meci european ×${MODEL_PARAMS.fatigueFactor}, derby ×${MODEL_PARAMS.derbyGoalsFactor}, limitat la [0.15, 4.5].`,
      data: { 'xG gazdă': xg.homeXG.toFixed(2), 'xG oaspete': xg.awayXG.toFixed(2), 'xG total': (xg.homeXG + xg.awayXG).toFixed(2) },
    },
    {
      title: '5. Matricea Poisson cu Dixon-Coles',
      description: `Matrice ${MODEL_PARAMS.poissonMaxGoals + 1}×${MODEL_PARAMS.poissonMaxGoals + 1}, corecție Dixon-Coles (ρ = ${MODEL_PARAMS.dixonColesRho}) pe 0-0, 1-0, 0-1, 1-1, renormalizată la 1. Toate piețele de goluri se citesc direct din matrice.`,
      data: { 'Over 2.5': p1(probs.over25), 'BTTS': p1(probs.btts) },
    },
    {
      title: '6. Probabilități 1X2',
      description: 'Citite direct din matricea Poisson.',
      data: { 'P(1)': p1(probs.homeWin), 'P(X)': p1(probs.draw), 'P(2)': p1(probs.awayWin) },
    },
    {
      title: '7. Marja casei',
      description: `Marja casei la 1X2: ${(blend.margin1x2 * 100).toFixed(2)}%. Probabilitățile casei sunt normalizate proporțional pe fiecare piață (1X2, O/U 2.5, BTTS, fiecare linie de cornere).`,
      data: { 'P(1) casă': p1(blend.fair1x2[0]), 'P(X) casă': p1(blend.fair1x2[1]), 'P(2) casă': p1(blend.fair1x2[2]) },
    },
    {
      title: '8. Amestec cu piața',
      description: `reliability = ${blend.minN}/(${blend.minN}+${MODEL_PARAMS.shrinkK}) = ${f3(blend.reliability)}. wModel = ${MODEL_PARAMS.marketWeightModel} × min(1, ${blend.minN}/${MODEL_PARAMS.fullWeightMatches}) = ${f3(blend.wModel)}. pBlend = wModel·pModel + (1−wModel)·pFair.`,
      data: { 'wModel': f3(blend.wModel), 'reliability': f3(blend.reliability) },
    },
    {
      title: '9. Value și EV',
      description: `EV = pBlend × cotă − 1. value = pBlend / pFair − 1. Recomandare doar dacă EV ≥ ${MODEL_PARAMS.minEv * 100}% și minim ${MODEL_PARAMS.minMatchesToRecommend} meciuri jucate. EV > ${MODEL_PARAMS.suspectEv * 100}% = suspect (probabil eroare de model). Cornere estimate: ${expCorners.toFixed(1)} (binomială negativă, varianță = ${MODEL_PARAMS.negBinVarianceRatio} × medie).`,
    },
    {
      title: '10. Decizia',
      description: bestBet
        ? `Pariu recomandat: ${bestBet.selection} — EV ${(bestBet.ev * 100).toFixed(1)}%, încredere ${bestBet.confidence}, miză ${(bestBet.stakePct * 100).toFixed(2)}% din bankroll. Miză = min(nivel încredere, ${MODEL_PARAMS.kellyFraction} × Kelly), max ${MODEL_PARAMS.maxStakePctPerBet * 100}%/pariu și ${MODEL_PARAMS.maxStakePctPerMatch * 100}%/meci.`
        : `Fără pariu cu valoare în acest meci: nicio selecție nu trece de EV ≥ ${MODEL_PARAMS.minEv * 100}% cu încredere suficientă. Este un rezultat normal, nu o eroare.`,
    },
  ];
}

// ===== MAIN ANALYSIS =====
export function runAnalysis(match: MatchData, plan?: UserPlan): AnalysisResult {
  const homeStyle = detectPlayStyle(match.homeTeam);
  const awayStyle = detectPlayStyle(match.awayTeam);

  const xg = calculateXG(match, homeStyle, awayStyle);
  const { homeXG, awayXG } = xg;
  const matrix = buildPoissonMatrix(homeXG, awayXG);
  const probs = calculateResultProbs(matrix);

  const { homeSide, awaySide } = cornerSides(match, homeStyle, awayStyle);
  let expCorners = homeSide + awaySide;
  if (match.isDerby) expCorners *= MODEL_PARAMS.derbyCornersFactor;

  const fair1x2 = removeMargin([match.oddsHome, match.oddsDraw, match.oddsAway]);
  const fairOU = removeMargin([match.oddsOver25, match.oddsUnder25]);
  const fairBTTS = removeMargin([match.oddsBTTSYes, match.oddsBTTSNo]);
  const margin1x2 = bookMargin([match.oddsHome, match.oddsDraw, match.oddsAway]);

  // Amestec model + piață
  const minN = Math.min(match.homeTeam.matchesPlayed || 0, match.awayTeam.matchesPlayed || 0);
  const reliability = minN / (minN + MODEL_PARAMS.shrinkK);
  const wModel = MODEL_PARAMS.marketWeightModel * Math.min(1, minN / MODEL_PARAMS.fullWeightMatches);
  const blendP = (pModel: number, pFair: number) => wModel * pModel + (1 - wModel) * pFair;

  const bankroll = getCurrentBankroll(plan);
  const combinedXG = homeXG + awayXG;
  const allCategories = ['corners', 'winner', 'goals'];

  type Cand = {
    type: string; category: BetRecommendation['category']; selection: string;
    prob: number; odds: number; bookProb: number;
  };
  const cands: Cand[] = [
    { type: 'Solist', category: 'winner', selection: `${match.homeTeam.name} (1)`, prob: probs.homeWin, odds: match.oddsHome, bookProb: fair1x2[0] },
    { type: 'Solist', category: 'winner', selection: 'Egal (X)', prob: probs.draw, odds: match.oddsDraw, bookProb: fair1x2[1] },
    { type: 'Solist', category: 'winner', selection: `${match.awayTeam.name} (2)`, prob: probs.awayWin, odds: match.oddsAway, bookProb: fair1x2[2] },
    { type: 'Goluri', category: 'goals', selection: 'Over 2.5', prob: probs.over25, odds: match.oddsOver25, bookProb: fairOU[0] },
    { type: 'Goluri', category: 'goals', selection: 'Under 2.5', prob: probs.under25, odds: match.oddsUnder25, bookProb: fairOU[1] },
    { type: 'Goluri', category: 'goals', selection: 'BTTS Da', prob: probs.btts, odds: match.oddsBTTSYes, bookProb: fairBTTS[0] },
    { type: 'Goluri', category: 'goals', selection: 'BTTS Nu', prob: 1 - probs.btts, odds: match.oddsBTTSNo, bookProb: fairBTTS[1] },
  ];
  for (const cl of match.cornerLines) {
    if (!(cl.oddsOver > 1 && cl.oddsUnder > 1)) continue;
    const fair = removeMargin([cl.oddsOver, cl.oddsUnder]);
    const overP = cornersOverProb(expCorners, cl.line);
    cands.push({ type: 'Cornere', category: 'corners', selection: `Over ${cl.line} cornere`, prob: overP, odds: cl.oddsOver, bookProb: fair[0] });
    cands.push({ type: 'Cornere', category: 'corners', selection: `Under ${cl.line} cornere`, prob: 1 - overP, odds: cl.oddsUnder, bookProb: fair[1] });
  }

  const recommendations: BetRecommendation[] = [];
  for (const c of cands) {
    if (!(c.odds > 1) || !(c.bookProb > 0)) continue;
    const pBlend = blendP(c.prob, c.bookProb);
    const ev = pBlend * c.odds - 1;
    const valueFrac = pBlend / c.bookProb - 1;
    const value = valueFrac * 100;
    const suspect = ev > MODEL_PARAMS.suspectEv;
    const confidence = deriveConfidence(ev, reliability);
    const risk = assessRisk(c.odds, reliability, ev);
    const kelly = kellyStakeFn(pBlend, c.odds);
    const fragile = isFragileScenario({ selection: c.selection, category: c.category, combinedXG, homeScores: match.homeTeam.goalsScored, awayScores: match.awayTeam.goalsScored, odds: c.odds, reliability });

    let stakeConfidence: ConfidenceLevel = confidence === 'high' ? 'HIGH' : confidence === 'medium' ? 'MEDIUM' : 'LOW';
    if (fragile && stakeConfidence !== 'LOW') stakeConfidence = 'LOW';
    let stakePct = 0;
    if (ev >= MODEL_PARAMS.minEv && minN >= MODEL_PARAMS.minMatchesToRecommend && confidence !== 'low') {
      stakePct = Math.min(CONFIDENCE_STAKE_PCT[stakeConfidence], MODEL_PARAMS.kellyFraction * kelly, MODEL_PARAMS.maxStakePctPerBet);
    }

    let aiExplanation = generateAIExplanation(
      { selection: c.selection, category: c.category, prob: c.prob, value },
      match, homeStyle, awayStyle, homeXG, awayXG, expCorners, allCategories,
    );
    if (suspect) aiExplanation = `⚠️ Suspect: probabil eroare de model (EV ${(ev * 100).toFixed(1)}% > ${MODEL_PARAMS.suspectEv * 100}%). ` + aiExplanation;

    recommendations.push({
      type: c.type, category: c.category, selection: c.selection,
      modelProbability: c.prob, blendedProbability: pBlend, reliability,
      bookmakerProbability: c.bookProb,
      value, odds: c.odds,
      kellyStake: kelly * bankroll, kellyPercent: kelly * 100,
      confidence, risk,
      tipsterTier: assignTipsterTier({ value, confidence, risk, reliability }),
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
  const bestBet = filtered.find(r => r.ev >= MODEL_PARAMS.minEv && r.confidence !== 'low') || null;

  return {
    homeXG, awayXG,
    poissonMatrix: matrix,
    homeWinProb: probs.homeWin, drawProb: probs.draw, awayWinProb: probs.awayWin,
    over25Prob: probs.over25, under25Prob: probs.under25, bttsProb: probs.btts,
    expectedCorners: expCorners,
    recommendations: filtered,
    styleAnalysis: analyzeStyle(match, homeStyle, awayStyle),
    motivationAnalysis: analyzeMotivation(match),
    analysisSteps: buildAnalysisSteps(match, xg, homeStyle, awayStyle, probs, { minN, reliability, wModel, fair1x2, margin1x2 }, expCorners, bestBet),
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
