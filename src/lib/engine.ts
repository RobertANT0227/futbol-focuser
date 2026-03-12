import type { MatchData, TeamStats, UserPlan, PoissonMatrix, BetRecommendation, AnalysisResult, MonteCarloResult } from './types';

// ===== FORM CALCULATION =====
function formPoints(form: ('W' | 'D' | 'L')[]): number {
  return form.reduce((sum, r) => sum + (r === 'W' ? 3 : r === 'D' ? 1 : 0), 0);
}

function formFactor(form: ('W' | 'D' | 'L')[]): number {
  const pts = formPoints(form);
  const max = form.length * 3;
  const ratio = pts / max;
  // Good form (>60%) → +5%, bad form (<30%) → -5%
  if (ratio > 0.6) return 1.05;
  if (ratio < 0.3) return 0.95;
  return 1.0;
}

// ===== OFFENSIVE/DEFENSIVE STRENGTH =====
function offensiveStrength(team: TeamStats, leagueAvg: number, isHome: boolean): number {
  const goals = isHome ? team.goalsScoredHome : team.goalsScoredAway;
  const matches = team.matchesPlayed / 2; // approx home/away split
  if (matches === 0) return 1;
  return (goals / matches) / (leagueAvg / 2);
}

function defensiveStrength(team: TeamStats, leagueAvg: number, isHome: boolean): number {
  const goals = isHome ? team.goalsConcededHome : team.goalsConcededAway;
  const matches = team.matchesPlayed / 2;
  if (matches === 0) return 1;
  return (goals / matches) / (leagueAvg / 2);
}

// ===== EXPECTED GOALS =====
function calculateXG(match: MatchData): { homeXG: number; awayXG: number } {
  const avgGoals = match.leagueAvgGoals / 2; // per team

  let homeAttack = offensiveStrength(match.homeTeam, match.leagueAvgGoals, true);
  let awayDefense = defensiveStrength(match.awayTeam, match.leagueAvgGoals, false);
  let awayAttack = offensiveStrength(match.awayTeam, match.leagueAvgGoals, false);
  let homeDefense = defensiveStrength(match.homeTeam, match.leagueAvgGoals, true);

  let homeXG = avgGoals * homeAttack * awayDefense;
  let awayXG = avgGoals * awayAttack * homeDefense;

  // Home advantage +12%
  homeXG *= 1.12;
  awayXG *= 0.88;

  // Form adjustment
  homeXG *= formFactor(match.homeTeam.formLast5);
  awayXG *= formFactor(match.awayTeam.formLast5);

  // xG vs actual goals adjustment
  const homeXGRatio = match.homeTeam.xG > 0 ? match.homeTeam.goalsScored / match.homeTeam.xG : 1;
  const awayXGRatio = match.awayTeam.xG > 0 ? match.awayTeam.goalsScored / match.awayTeam.xG : 1;
  // Regress toward 1
  homeXG *= 0.7 + 0.3 * homeXGRatio;
  awayXG *= 0.7 + 0.3 * awayXGRatio;

  // Shots on target adjustment
  if (match.homeTeam.matchesPlayed > 0 && match.awayTeam.matchesPlayed > 0) {
    const homeSoTPerMatch = match.homeTeam.shotsOnTarget / match.homeTeam.matchesPlayed;
    const awaySoTPerMatch = match.awayTeam.shotsOnTarget / match.awayTeam.matchesPlayed;
    homeXG *= 0.9 + 0.1 * (homeSoTPerMatch / 5); // normalize around 5 SoT
    awayXG *= 0.9 + 0.1 * (awaySoTPerMatch / 5);
  }

  // Fatigue adjustment
  if (match.homeTeamFatigued || match.homeEuropeanMatch) homeXG *= 0.92;
  if (match.awayTeamFatigued || match.awayEuropeanMatch) awayXG *= 0.92;

  // Style adjustment
  homeXG *= styleAttackModifier(match.homeTeam.playStyle);
  awayXG *= styleAttackModifier(match.awayTeam.playStyle);

  return { homeXG: Math.max(0.1, homeXG), awayXG: Math.max(0.1, awayXG) };
}

function styleAttackModifier(style: string): number {
  switch (style) {
    case 'pressing': return 1.05;
    case 'possession': return 1.02;
    case 'counter': return 0.98;
    case 'low-block': return 0.93;
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

// ===== BOOKMAKER ODDS → PROBABILITY =====
function oddsToProb(odds: number): number {
  return 1 / odds;
}

function removeMargin(probs: number[]): number[] {
  const total = probs.reduce((s, p) => s + p, 0);
  return probs.map(p => p / total);
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

// ===== KELLY CRITERION =====
function kellyStake(prob: number, odds: number): number {
  const b = odds - 1;
  const q = 1 - prob;
  const f = (b * prob - q) / b;
  return Math.max(0, f);
}

// ===== CORNERS ANALYSIS =====
function expectedCorners(match: MatchData): number {
  let base = (match.homeTeam.cornersPerMatch + match.awayTeam.cornersPerMatch);
  // Style adjustment
  if (match.homeTeam.playStyle === 'possession' || match.homeTeam.playStyle === 'pressing') base *= 1.05;
  if (match.awayTeam.playStyle === 'low-block') base *= 1.08; // more corners for attacking team
  if (match.awayTeam.playStyle === 'counter') base *= 0.97;
  // Derby boost
  if (match.isDerby) base *= 1.05;
  return base;
}

// ===== STYLE ANALYSIS =====
function analyzeStyle(match: MatchData): string {
  const h = match.homeTeam;
  const a = match.awayTeam;
  const parts: string[] = [];

  parts.push(`${h.name}: Stil ${h.playStyle} (posesie ${h.possession}%)`);
  parts.push(`${a.name}: Stil ${a.playStyle} (posesie ${a.possession}%)`);

  if (h.playStyle === 'pressing' && a.playStyle === 'low-block') {
    parts.push('⚡ Contrast de stil: pressing vs apărare joasă → posibil mai puține goluri, mai multe cornere');
  }
  if (h.playStyle === 'possession' && a.playStyle === 'counter') {
    parts.push('⚡ Posesie vs contraatac → potențial goluri pe tranziție');
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

// ===== MAIN ANALYSIS =====
export function runAnalysis(match: MatchData, plan?: UserPlan): AnalysisResult {
  const { homeXG, awayXG } = calculateXG(match);
  const matrix = buildPoissonMatrix(homeXG, awayXG);
  const probs = calculateResultProbs(matrix);
  const expCorners = expectedCorners(match);

  // Monte Carlo
  const mc = monteCarloSimulation(homeXG, awayXG, match.homeTeam.cornersPerMatch, match.awayTeam.cornersPerMatch);

  // Blend Poisson + Monte Carlo (70/30)
  const homeWinProb = probs.homeWin * 0.7 + mc.homeWinPct * 0.3;
  const drawProb = probs.draw * 0.7 + mc.drawPct * 0.3;
  const awayWinProb = probs.awayWin * 0.7 + mc.awayWinPct * 0.3;
  const over25Prob = probs.over25 * 0.7 + mc.over25Pct * 0.3;
  const bttsProb = probs.btts * 0.7 + mc.bttsPct * 0.3;

  // Build recommendations
  const recommendations: BetRecommendation[] = [];

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
    const kelly = kellyStake(bet.prob, bet.odds);
    const bookProb = oddsToProb(bet.odds);

    recommendations.push({
      type: 'Solist',
      category: 'winner',
      selection: bet.selection,
      modelProbability: bet.prob,
      bookmakerProbability: bookProb,
      value,
      odds: bet.odds,
      kellyStake: plan ? Math.min(kelly * plan.bankroll, plan.bankroll * (plan.maxStakePercent / 100)) : kelly * 100,
      confidence: value > 10 ? 'high' : value > 5 ? 'medium' : 'low',
      stability,
      risk,
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
    const kelly = kellyStake(bet.prob, bet.odds);
    const bookProb = oddsToProb(bet.odds);

    recommendations.push({
      type: bet.type,
      category: 'goals',
      selection: bet.selection,
      modelProbability: bet.prob,
      bookmakerProbability: bookProb,
      value,
      odds: bet.odds,
      kellyStake: plan ? Math.min(kelly * plan.bankroll, plan.bankroll * (plan.maxStakePercent / 100)) : kelly * 100,
      confidence: value > 10 ? 'high' : value > 5 ? 'medium' : 'low',
      stability,
      risk,
    });
  }

  // Corners
  if (match.cornersLine && match.oddsOverCorners && match.oddsUnderCorners) {
    const overCornersProb = 1 - poissonCDF(expCorners, match.cornersLine);
    const underCornersProb = poissonCDF(expCorners, match.cornersLine);

    for (const bet of [
      { selection: `Over ${match.cornersLine} cornere`, prob: overCornersProb, odds: match.oddsOverCorners },
      { selection: `Under ${match.cornersLine} cornere`, prob: underCornersProb, odds: match.oddsUnderCorners },
    ]) {
      const value = detectValue(bet.prob, bet.odds);
      const stability = 0.6; // corners are inherently less stable
      const risk = assessRisk(value, stability, bet.odds);
      const kelly = kellyStake(bet.prob, bet.odds);
      const bookProb = oddsToProb(bet.odds);

      recommendations.push({
        type: 'Cornere',
        category: 'corners',
        selection: bet.selection,
        modelProbability: bet.prob,
        bookmakerProbability: bookProb,
        value,
        odds: bet.odds,
        kellyStake: plan ? Math.min(kelly * plan.bankroll, plan.bankroll * (plan.maxStakePercent / 100)) : kelly * 100,
        confidence: value > 10 ? 'high' : value > 5 ? 'medium' : 'low',
        stability,
        risk,
      });
    }
  }

  // Filter by plan
  let filtered = recommendations;
  if (plan) {
    filtered = filtered.filter(r => {
      if (plan.maxRisk === 'low' && r.risk === 'high') return false;
      if (plan.maxRisk === 'medium' && r.risk === 'high') return false;
      if (r.value < plan.minValue) return false;
      if (!plan.preferredBets.includes(r.category)) return false;
      return true;
    });
  }

  // Sort by value * stability
  filtered.sort((a, b) => (b.value * b.stability) - (a.value * a.stability));

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
    styleAnalysis: analyzeStyle(match),
    motivationAnalysis: analyzeMotivation(match),
  };
}

function poissonCDF(lambda: number, k: number): number {
  let sum = 0;
  for (let i = 0; i <= Math.floor(k); i++) {
    sum += poissonPMF(lambda, i);
  }
  return sum;
}
