import type { MatchData, TeamStats, UserPlan, PoissonMatrix, BetRecommendation, AnalysisResult, MonteCarloResult, AnalysisStep } from './types';
import { deriveConfidence, calculateConfidenceStake, loadBankrollState } from './bankroll';

/**
 * Detect "fragile" scenarios where outcome can easily flip:
 * - "Under" selections in matches where combined xG is high (>= 2.6)
 * - "Over" selections when combined xG is low (<= 1.9)
 * - BTTS Nu when both teams score regularly
 * - Underdog winner picks at high odds (>4) with low stability
 */
function isFragileScenario(args: {
  selection: string;
  category: string;
  combinedXG: number;
  homeScores: number;
  awayScores: number;
  odds: number;
  stability: number;
}): boolean {
  const { selection, category, combinedXG, homeScores, awayScores, odds, stability } = args;
  if (category === 'goals') {
    if (selection.includes('Under') && combinedXG >= 2.6) return true;
    if (selection.includes('Over') && combinedXG <= 1.9) return true;
    if (selection.includes('BTTS Nu') && homeScores >= 1.3 && awayScores >= 1.3) return true;
  }
  if (category === 'winner' && odds >= 4 && stability < 0.55) return true;
  return false;
}

function buildStakeFields(args: {
  modelConfidence: 'high' | 'medium' | 'low';
  winRate: number;
  value: number;
  stability: number;
  risk: 'low' | 'medium' | 'high';
  fragile: boolean;
  prob: number;
  odds: number;
  bankroll: number;
}) {
  const stakeConfidence = deriveConfidence({
    modelConfidence: args.modelConfidence,
    winRate: args.winRate,
    value: args.value,
    stability: args.stability,
    risk: args.risk,
    fragile: args.fragile,
  });
  const { pct, lei } = calculateConfidenceStake(args.bankroll, stakeConfidence, 1);
  const ev = args.prob * args.odds - 1;
  return { stakeConfidence, stakePct: pct, stakeLei: lei, ev };
}

function getCurrentBankroll(plan?: UserPlan): number {
  const state = loadBankrollState();
  if (state) return state.currentBankroll;
  return plan?.bankroll || 1000;
}



// ===== FORM CALCULATION =====
function formPoints(form: ('W' | 'D' | 'L')[]): number {
  return form.reduce((sum, r) => sum + (r === 'W' ? 3 : r === 'D' ? 1 : 0), 0);
}

function formFactor(form: ('W' | 'D' | 'L')[]): number {
  const pts = formPoints(form);
  const max = form.length * 3;
  const ratio = pts / max;
  if (ratio > 0.6) return 1.05;
  if (ratio < 0.3) return 0.95;
  return 1.0;
}

// ===== PLAY STYLE — manual only, no auto detection =====
function detectPlayStyle(team: TeamStats): 'possession' | 'counter' | 'pressing' | 'low-block' | 'bus-parking' | 'high-press' {
  return team.playStyle;
}

// ===== OFFENSIVE/DEFENSIVE STRENGTH =====
function offensiveStrength(team: TeamStats, isHome: boolean): number {
  const goalsPerMatch = isHome ? team.goalsScoredHome : team.goalsScoredAway;
  const avgPerMatch = team.goalsScored;
  if (avgPerMatch === 0) return 1;
  return goalsPerMatch / avgPerMatch;
}

function defensiveStrength(team: TeamStats, isHome: boolean): number {
  const goalsPerMatch = isHome ? team.goalsConcededHome : team.goalsConcededAway;
  const avgPerMatch = team.goalsConceded;
  if (avgPerMatch === 0) return 1;
  return goalsPerMatch / avgPerMatch;
}

// ===== EXPECTED GOALS =====
function calculateXG(match: MatchData): { homeXG: number; awayXG: number } {
  const homeAvgScored = match.homeTeam.goalsScored > 0 ? match.homeTeam.goalsScored : 1.3;
  const awayAvgScored = match.awayTeam.goalsScored > 0 ? match.awayTeam.goalsScored : 1.1;

  const homeAttack = offensiveStrength(match.homeTeam, true);
  const awayDefense = defensiveStrength(match.awayTeam, false);
  const awayAttack = offensiveStrength(match.awayTeam, false);
  const homeDefense = defensiveStrength(match.homeTeam, true);

  let homeXG = homeAvgScored * homeAttack * awayDefense;
  let awayXG = awayAvgScored * awayAttack * homeDefense;

  homeXG *= 1.12;
  awayXG *= 0.88;

  homeXG *= formFactor(match.homeTeam.formHome);
  awayXG *= formFactor(match.awayTeam.formAway);

  const homeXGRatio = match.homeTeam.xG > 0 ? match.homeTeam.goalsScored / match.homeTeam.xG : 1;
  const awayXGRatio = match.awayTeam.xG > 0 ? match.awayTeam.goalsScored / match.awayTeam.xG : 1;
  homeXG *= 0.7 + 0.3 * homeXGRatio;
  awayXG *= 0.7 + 0.3 * awayXGRatio;

  const homeSoT = match.homeTeam.shotsOnTargetHome || match.homeTeam.shotsOnTarget;
  const awaySoT = match.awayTeam.shotsOnTargetAway || match.awayTeam.shotsOnTarget;
  if (homeSoT > 0 && awaySoT > 0) {
    homeXG *= 0.9 + 0.1 * (homeSoT / 5);
    awayXG *= 0.9 + 0.1 * (awaySoT / 5);
  }

  if (match.homeTeamFatigued || match.homeEuropeanMatch) homeXG *= 0.92;
  if (match.awayTeamFatigued || match.awayEuropeanMatch) awayXG *= 0.92;

  const homeStyle = detectPlayStyle(match.homeTeam);
  const awayStyle = detectPlayStyle(match.awayTeam);
  homeXG *= styleAttackModifier(homeStyle);
  awayXG *= styleAttackModifier(awayStyle);

  return { homeXG: Math.max(0.1, homeXG), awayXG: Math.max(0.1, awayXG) };
}

function styleAttackModifier(style: string): number {
  switch (style) {
    case 'pressing': return 1.05;
    case 'high-press': return 1.08;
    case 'possession': return 1.02;
    case 'counter': return 0.98;
    case 'low-block': return 0.93;
    case 'bus-parking': return 0.88;
    default: return 1;
  }
}

// ===== POISSON =====
function poissonPMF(lambda: number, k: number): number {
  let result = Math.exp(-lambda);
  for (let i = 1; i <= k; i++) {
    result *= lambda / i;
  }
  return result;
}

function buildPoissonMatrix(homeXG: number, awayXG: number, maxGoals = 5): PoissonMatrix {
  const homeGoals = Array.from({ length: maxGoals + 1 }, (_, i) => i);
  const awayGoals = Array.from({ length: maxGoals + 1 }, (_, i) => i);
  const probabilities: number[][] = [];

  for (let h = 0; h <= maxGoals; h++) {
    probabilities[h] = [];
    for (let a = 0; a <= maxGoals; a++) {
      probabilities[h][a] = poissonPMF(homeXG, h) * poissonPMF(awayXG, a);
    }
  }

  return { homeGoals, awayGoals, probabilities };
}

// ===== RESULT PROBABILITIES =====
function calculateResultProbs(matrix: PoissonMatrix) {
  let homeWin = 0, draw = 0, awayWin = 0;
  let over25 = 0, btts = 0;

  for (let h = 0; h < matrix.probabilities.length; h++) {
    for (let a = 0; a < matrix.probabilities[h].length; a++) {
      const p = matrix.probabilities[h][a];
      if (h > a) homeWin += p;
      else if (h === a) draw += p;
      else awayWin += p;
      if (h + a > 2) over25 += p;
      if (h > 0 && a > 0) btts += p;
    }
  }

  return { homeWin, draw, awayWin, over25, under25: 1 - over25, btts };
}

function oddsToProb(odds: number): number {
  return 1 / odds;
}

// ===== MONTE CARLO =====
function monteCarloSimulation(homeXG: number, awayXG: number, homeCorners: number, awayCorners: number, simulations = 10000): MonteCarloResult {
  let homeWins = 0, draws = 0, awayWins = 0, over25 = 0, bttsCount = 0;
  let totalHome = 0, totalAway = 0, totalCorners = 0;
  const scores: Record<string, number> = {};

  for (let i = 0; i < simulations; i++) {
    const hGoals = poissonRandom(homeXG);
    const aGoals = poissonRandom(awayXG);
    const corners = poissonRandom(homeCorners + awayCorners);

    if (hGoals > aGoals) homeWins++;
    else if (hGoals === aGoals) draws++;
    else awayWins++;

    if (hGoals + aGoals > 2) over25++;
    if (hGoals > 0 && aGoals > 0) bttsCount++;

    totalHome += hGoals;
    totalAway += aGoals;
    totalCorners += corners;

    const key = `${hGoals}-${aGoals}`;
    scores[key] = (scores[key] || 0) + 1;
  }

  return {
    homeWinPct: homeWins / simulations,
    drawPct: draws / simulations,
    awayWinPct: awayWins / simulations,
    over25Pct: over25 / simulations,
    bttsPct: bttsCount / simulations,
    avgHomeGoals: totalHome / simulations,
    avgAwayGoals: totalAway / simulations,
    avgCorners: totalCorners / simulations,
    scoreDistribution: Object.fromEntries(
      Object.entries(scores)
        .map(([k, v]) => [k, v / simulations])
        .sort((a, b) => (b[1] as number) - (a[1] as number))
        .slice(0, 10)
    ),
  };
}

function poissonRandom(lambda: number): number {
  let L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= Math.random();
  } while (p > L);
  return k - 1;
}

// ===== KELLY CRITERION (FULL) =====
function kellyStakeFn(prob: number, odds: number): number {
  const b = odds - 1;
  const q = 1 - prob;
  const f = (b * prob - q) / b;
  return Math.max(0, f);
}

// ===== CORNERS ANALYSIS =====
function expectedCorners(match: MatchData, homeStyle: string, awayStyle: string): number {
  let base = match.homeTeam.cornersPerMatchHome + match.awayTeam.cornersPerMatchAway;
  if (base === 0) base = match.homeTeam.cornersPerMatch + match.awayTeam.cornersPerMatch;
  
  if (homeStyle === 'possession' || homeStyle === 'pressing') base *= 1.05;
  if (homeStyle === 'high-press') base *= 1.1;
  if (awayStyle === 'low-block') base *= 1.08;
  if (awayStyle === 'bus-parking') base *= 1.12;
  if (awayStyle === 'counter') base *= 0.97;
  if (match.isDerby) base *= 1.05;
  return base;
}

// ===== WIN RATE CALCULATION =====
function calculateWinRate(modelProb: number, value: number, stability: number, confidence: string): number {
  // WR is a composite metric: model probability weighted by stability and confidence
  const confWeight = confidence === 'high' ? 1.1 : confidence === 'medium' ? 1.0 : 0.85;
  const valueBoost = Math.min(value * 0.5, 15); // max +15% from value
  const wr = (modelProb * 100) * stability * confWeight + valueBoost;
  return Math.min(98, Math.max(10, wr));
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

  return parts.join(' ') || `Selecție bazată pe analiza statistică Poisson + Monte Carlo.`;
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

// ===== VALUE DETECTION =====
function detectValue(modelProb: number, bookmakerOdds: number): number {
  const bookProb = oddsToProb(bookmakerOdds);
  return ((modelProb - bookProb) / bookProb) * 100;
}

// ===== RISK FILTER =====
function assessRisk(value: number, stability: number, odds: number): 'low' | 'medium' | 'high' {
  if (odds > 5 || stability < 0.3 || value > 50) return 'high';
  if (odds > 3 || stability < 0.5 || value > 30) return 'medium';
  return 'low';
}

// ===== TIPSTER TIER =====
function assignTipsterTier(bet: { value: number; stability: number; confidence: string; risk: string }): 'tipster' | 'tipster_premium' {
  if (bet.confidence === 'high' && bet.risk !== 'high' && bet.value > 5 && bet.stability > 0.5) return 'tipster_premium';
  if (bet.confidence === 'medium' && bet.risk === 'low' && bet.value > 8 && bet.stability > 0.6) return 'tipster_premium';
  return 'tipster';
}

// ===== BUILD ANALYSIS STEPS =====
function buildAnalysisSteps(match: MatchData, homeXG: number, awayXG: number, probs: any, mc: MonteCarloResult, expCorners: number, homeStyle: string, awayStyle: string): AnalysisStep[] {
  const steps: AnalysisStep[] = [];
  const h = match.homeTeam;
  const a = match.awayTeam;

  steps.push({
    title: '1. Date de intrare',
    description: `${h.name} (acasă) vs ${a.name} (deplasare). Medie goluri: ${h.goalsScored}/meci vs ${a.goalsScored}/meci. xG: ${h.xG} vs ${a.xG}.`,
    data: {
      'Goluri gazdă/meci': h.goalsScored,
      'Goluri oaspete/meci': a.goalsScored,
      'xG gazdă': h.xG,
      'xG oaspete': a.xG,
      'Posesie gazdă': `${h.possession}%`,
      'Posesie oaspete': `${a.possession}%`,
    }
  });

  const homeAtt = offensiveStrength(h, true);
  const awayDef = defensiveStrength(a, false);
  const awayAtt = offensiveStrength(a, false);
  const homeDef = defensiveStrength(h, true);

  steps.push({
    title: '2. Forță ofensivă/defensivă',
    description: `Atac gazdă (acasă): ${homeAtt.toFixed(3)}. Apărare oaspete (deplasare): ${awayDef.toFixed(3)}. Atac oaspete (deplasare): ${awayAtt.toFixed(3)}. Apărare gazdă (acasă): ${homeDef.toFixed(3)}.`,
    data: {
      'Atac gazdă': homeAtt.toFixed(3),
      'Apărare oaspete': awayDef.toFixed(3),
      'Atac oaspete': awayAtt.toFixed(3),
      'Apărare gazdă': homeDef.toFixed(3),
    }
  });

  steps.push({
    title: '3. Detecție stil de joc',
    description: `Gazdă: ${homeStyle}. Oaspete: ${awayStyle}. Stilul influențează direct xG și cornere estimate.`,
    data: {
      'Stil gazdă detectat': homeStyle,
      'Stil oaspete detectat': awayStyle,
      'Modificator gazdă': `×${styleAttackModifier(homeStyle)}`,
      'Modificator oaspete': `×${styleAttackModifier(awayStyle)}`,
    }
  });

  const homeFF = formFactor(h.formHome);
  const awayFF = formFactor(a.formAway);

  steps.push({
    title: '4. Ajustări aplicate',
    description: `Avantaj teren: +12% gazdă. Formă gazdă acasă: ×${homeFF}. Formă oaspete deplasare: ×${awayFF}.`,
    data: {
      'Factor formă gazdă (acasă)': homeFF,
      'Factor formă oaspete (deplasare)': awayFF,
    }
  });

  steps.push({
    title: '5. Expected Goals calculate',
    description: `După toate ajustările, xG final: Gazdă = ${homeXG.toFixed(3)}, Oaspete = ${awayXG.toFixed(3)}.`,
    data: { 'xG final gazdă': homeXG.toFixed(3), 'xG final oaspete': awayXG.toFixed(3) }
  });

  steps.push({
    title: '6. Distribuția Poisson',
    description: `Matricea Poisson 6×6 calculată. P(k) = (λ^k × e^(-λ)) / k!. Rezultat: 1=${(probs.homeWin * 100).toFixed(1)}%, X=${(probs.draw * 100).toFixed(1)}%, 2=${(probs.awayWin * 100).toFixed(1)}%.`,
    data: {
      'P(1) Poisson': `${(probs.homeWin * 100).toFixed(1)}%`,
      'P(X) Poisson': `${(probs.draw * 100).toFixed(1)}%`,
      'P(2) Poisson': `${(probs.awayWin * 100).toFixed(1)}%`,
      'Over 2.5 Poisson': `${(probs.over25 * 100).toFixed(1)}%`,
      'BTTS Poisson': `${(probs.btts * 100).toFixed(1)}%`,
    }
  });

  steps.push({
    title: '7. Monte Carlo (10.000 simulări)',
    description: `Rezultate MC: 1=${(mc.homeWinPct * 100).toFixed(1)}%, X=${(mc.drawPct * 100).toFixed(1)}%, 2=${(mc.awayWinPct * 100).toFixed(1)}%. Medie goluri: ${mc.avgHomeGoals.toFixed(2)}-${mc.avgAwayGoals.toFixed(2)}.`,
    data: {
      'P(1) MC': `${(mc.homeWinPct * 100).toFixed(1)}%`,
      'P(X) MC': `${(mc.drawPct * 100).toFixed(1)}%`,
      'P(2) MC': `${(mc.awayWinPct * 100).toFixed(1)}%`,
      'Media goluri gazdă': mc.avgHomeGoals.toFixed(2),
      'Media goluri oaspete': mc.avgAwayGoals.toFixed(2),
      'Media cornere': mc.avgCorners.toFixed(1),
    }
  });

  const finalHome = probs.homeWin * 0.7 + mc.homeWinPct * 0.3;
  const finalDraw = probs.draw * 0.7 + mc.drawPct * 0.3;
  const finalAway = probs.awayWin * 0.7 + mc.awayWinPct * 0.3;

  steps.push({
    title: '8. Blend final (70% Poisson + 30% MC)',
    description: `Probabilități finale: 1=${(finalHome * 100).toFixed(1)}%, X=${(finalDraw * 100).toFixed(1)}%, 2=${(finalAway * 100).toFixed(1)}%.`,
    data: {
      'P(1) Final': `${(finalHome * 100).toFixed(1)}%`,
      'P(X) Final': `${(finalDraw * 100).toFixed(1)}%`,
      'P(2) Final': `${(finalAway * 100).toFixed(1)}%`,
    }
  });

  steps.push({
    title: '9. Cornere estimate',
    description: `Cornere așteptate: ${expCorners.toFixed(1)} (ajustat pentru stil ${homeStyle}/${awayStyle} și derby).`,
    data: { 'Cornere estimate': expCorners.toFixed(1) }
  });

  const valueHome = detectValue(finalHome, match.oddsHome);
  const valueDraw = detectValue(finalDraw, match.oddsDraw);
  const valueAway = detectValue(finalAway, match.oddsAway);
  const kellyHome = kellyStakeFn(finalHome, match.oddsHome);
  const kellyDraw = kellyStakeFn(finalDraw, match.oddsDraw);
  const kellyAway = kellyStakeFn(finalAway, match.oddsAway);

  steps.push({
    title: '10. Detecție Value & Kelly Criterion',
    description: `Value = ((Prob_model - Prob_bookmaker) / Prob_bookmaker) × 100. Kelly: f = (b×p - q) / b.`,
    data: {
      'Value gazdă': `${valueHome > 0 ? '+' : ''}${valueHome.toFixed(1)}%`,
      'Value egal': `${valueDraw > 0 ? '+' : ''}${valueDraw.toFixed(1)}%`,
      'Value oaspete': `${valueAway > 0 ? '+' : ''}${valueAway.toFixed(1)}%`,
      'Kelly gazdă': `${(kellyHome * 100).toFixed(2)}%`,
      'Kelly egal': `${(kellyDraw * 100).toFixed(2)}%`,
      'Kelly oaspete': `${(kellyAway * 100).toFixed(2)}%`,
    }
  });

  return steps;
}

// ===== MAIN ANALYSIS =====
export function runAnalysis(match: MatchData, plan?: UserPlan): AnalysisResult {
  const homeStyle = detectPlayStyle(match.homeTeam);
  const awayStyle = detectPlayStyle(match.awayTeam);

  const { homeXG, awayXG } = calculateXG(match);
  const matrix = buildPoissonMatrix(homeXG, awayXG);
  const probs = calculateResultProbs(matrix);
  const expCorners = expectedCorners(match, homeStyle, awayStyle);

  const homeCornersForMC = match.homeTeam.cornersPerMatchHome || match.homeTeam.cornersPerMatch;
  const awayCornersForMC = match.awayTeam.cornersPerMatchAway || match.awayTeam.cornersPerMatch;
  const mc = monteCarloSimulation(homeXG, awayXG, homeCornersForMC, awayCornersForMC);

  const homeWinProb = probs.homeWin * 0.7 + mc.homeWinPct * 0.3;
  const drawProb = probs.draw * 0.7 + mc.drawPct * 0.3;
  const awayWinProb = probs.awayWin * 0.7 + mc.awayWinPct * 0.3;
  const over25Prob = probs.over25 * 0.7 + mc.over25Pct * 0.3;
  const bttsProb = probs.btts * 0.7 + mc.bttsPct * 0.3;

  const analysisSteps = buildAnalysisSteps(match, homeXG, awayXG, probs, mc, expCorners, homeStyle, awayStyle);

  const bankroll = getCurrentBankroll(plan);
  const combinedXG = homeXG + awayXG;
  const homeScores = match.homeTeam.goalsScored;
  const awayScores = match.awayTeam.goalsScored;

  const recommendations: BetRecommendation[] = [];
  const allCategories = ['corners', 'winner', 'goals'];

  // Winner bets
  const winnerBets = [
    { selection: `${match.homeTeam.name} (1)`, prob: homeWinProb, odds: match.oddsHome },
    { selection: 'Egal (X)', prob: drawProb, odds: match.oddsDraw },
    { selection: `${match.awayTeam.name} (2)`, prob: awayWinProb, odds: match.oddsAway },
  ];

  for (const bet of winnerBets) {
    const value = detectValue(bet.prob, bet.odds);
    const stability = 1 - Math.abs(bet.prob - (bet.selection.includes('1') ? mc.homeWinPct : bet.selection.includes('X') ? mc.drawPct : mc.awayWinPct));
    const risk = assessRisk(value, stability, bet.odds);
    const kelly = kellyStakeFn(bet.prob, bet.odds);
    const bookProb = oddsToProb(bet.odds);
    const confidence = value > 10 ? 'high' : value > 5 ? 'medium' : 'low';
    const winRate = calculateWinRate(bet.prob, value, stability, confidence);
    const aiExplanation = generateAIExplanation(
      { selection: bet.selection, category: 'winner', prob: bet.prob, value },
      match, homeStyle, awayStyle, homeXG, awayXG, expCorners, allCategories
    );

    const fragile = isFragileScenario({ selection: bet.selection, category: 'winner', combinedXG, homeScores, awayScores, odds: bet.odds, stability });
    const stakeFields = buildStakeFields({ modelConfidence: confidence, winRate, value, stability, risk, fragile, prob: bet.prob, odds: bet.odds, bankroll });

    recommendations.push({
      type: 'Solist',
      category: 'winner',
      selection: bet.selection,
      modelProbability: bet.prob,
      bookmakerProbability: bookProb,
      value,
      odds: bet.odds,
      kellyStake: plan ? kelly * plan.bankroll : kelly * 100,
      kellyPercent: kelly * 100,
      confidence: confidence as 'high' | 'medium' | 'low',
      stability,
      risk,
      tipsterTier: assignTipsterTier({ value, stability, confidence, risk }),
      winRate,
      aiExplanation,
      ...stakeFields,
      fragile,
    });
  }

  // Goals bets
  const goalBets = [
    { selection: 'Over 2.5', prob: over25Prob, odds: match.oddsOver25, type: 'Goluri' },
    { selection: 'Under 2.5', prob: 1 - over25Prob, odds: match.oddsUnder25, type: 'Goluri' },
    { selection: 'BTTS Da', prob: bttsProb, odds: match.oddsBTTSYes, type: 'Goluri' },
    { selection: 'BTTS Nu', prob: 1 - bttsProb, odds: match.oddsBTTSNo, type: 'Goluri' },
  ];

  for (const bet of goalBets) {
    const value = detectValue(bet.prob, bet.odds);
    const stability = 1 - Math.abs(bet.prob - (bet.selection.includes('Over') ? mc.over25Pct : bet.selection.includes('Under') ? 1 - mc.over25Pct : bet.selection.includes('Da') ? mc.bttsPct : 1 - mc.bttsPct));
    const risk = assessRisk(value, stability, bet.odds);
    const kelly = kellyStakeFn(bet.prob, bet.odds);
    const bookProb = oddsToProb(bet.odds);
    const confidence = value > 10 ? 'high' : value > 5 ? 'medium' : 'low';
    const winRate = calculateWinRate(bet.prob, value, stability, confidence);
    const aiExplanation = generateAIExplanation(
      { selection: bet.selection, category: 'goals', prob: bet.prob, value },
      match, homeStyle, awayStyle, homeXG, awayXG, expCorners, allCategories
    );

    const fragile = isFragileScenario({ selection: bet.selection, category: 'goals', combinedXG, homeScores, awayScores, odds: bet.odds, stability });
    const stakeFields = buildStakeFields({ modelConfidence: confidence, winRate, value, stability, risk, fragile, prob: bet.prob, odds: bet.odds, bankroll });

    recommendations.push({
      type: bet.type,
      category: 'goals',
      selection: bet.selection,
      modelProbability: bet.prob,
      bookmakerProbability: bookProb,
      value,
      odds: bet.odds,
      kellyStake: plan ? kelly * plan.bankroll : kelly * 100,
      kellyPercent: kelly * 100,
      confidence: confidence as 'high' | 'medium' | 'low',
      stability,
      risk,
      tipsterTier: assignTipsterTier({ value, stability, confidence, risk }),
      winRate,
      aiExplanation,
      ...stakeFields,
      fragile,
    });
  }

  // Corners
  for (const cl of match.cornerLines) {
    if (cl.oddsOver > 0 && cl.oddsUnder > 0) {
      const overCornersProb = 1 - poissonCDF(expCorners, cl.line);
      const underCornersProb = poissonCDF(expCorners, cl.line);

      for (const bet of [
        { selection: `Over ${cl.line} cornere`, prob: overCornersProb, odds: cl.oddsOver },
        { selection: `Under ${cl.line} cornere`, prob: underCornersProb, odds: cl.oddsUnder },
      ]) {
        const value = detectValue(bet.prob, bet.odds);
        const stability = 0.6;
        const risk = assessRisk(value, stability, bet.odds);
        const kelly = kellyStakeFn(bet.prob, bet.odds);
        const bookProb = oddsToProb(bet.odds);
        const confidence = value > 10 ? 'high' : value > 5 ? 'medium' : 'low';
        const winRate = calculateWinRate(bet.prob, value, stability, confidence);
        const aiExplanation = generateAIExplanation(
          { selection: bet.selection, category: 'corners', prob: bet.prob, value },
          match, homeStyle, awayStyle, homeXG, awayXG, expCorners, allCategories
        );

        const fragile = isFragileScenario({ selection: bet.selection, category: 'corners', combinedXG, homeScores, awayScores, odds: bet.odds, stability });
        const stakeFields = buildStakeFields({ modelConfidence: confidence, winRate, value, stability, risk, fragile, prob: bet.prob, odds: bet.odds, bankroll });

        recommendations.push({
          type: 'Cornere',
          category: 'corners',
          selection: bet.selection,
          modelProbability: bet.prob,
          bookmakerProbability: bookProb,
          value,
          odds: bet.odds,
          kellyStake: plan ? kelly * plan.bankroll : kelly * 100,
          kellyPercent: kelly * 100,
          confidence: confidence as 'high' | 'medium' | 'low',
          stability,
          risk,
          tipsterTier: assignTipsterTier({ value, stability, confidence, risk }),
          winRate,
          aiExplanation,
          ...stakeFields,
          fragile,
        });
      }
    }
  }

  // Filter by plan
  let filtered = recommendations;
  if (plan) {
    filtered = filtered.filter(r => {
      if (plan.maxRisk === 'low' && r.risk === 'high') return false;
      if (plan.maxRisk === 'medium' && r.risk === 'high') return false;
      if (!plan.preferredBets.includes(r.category)) return false;
      return true;
    });
  }

  // Sort: by winRate descending
  filtered.sort((a, b) => b.winRate - a.winRate);

  // Best bet = highest WR with positive value
  const bestBet = filtered.find(r => r.value > 0 && r.winRate >= 50) || filtered[0] || null;

  return {
    homeXG,
    awayXG,
    poissonMatrix: matrix,
    homeWinProb,
    drawProb,
    awayWinProb,
    over25Prob,
    under25Prob: 1 - over25Prob,
    bttsProb,
    expectedCorners: expCorners,
    recommendations: filtered,
    monteCarloResults: mc,
    styleAnalysis: analyzeStyle(match, homeStyle, awayStyle),
    motivationAnalysis: analyzeMotivation(match),
    analysisSteps,
    detectedStyles: { home: homeStyle, away: awayStyle },
    bestBet,
  };
}

function poissonCDF(lambda: number, k: number): number {
  let sum = 0;
  for (let i = 0; i <= Math.floor(k); i++) {
    sum += poissonPMF(lambda, i);
  }
  return sum;
}
