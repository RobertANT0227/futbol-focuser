// ============================================================
// PRO TIPSTER ENGINE V2 HARDCORE
// Pipeline: Normalize → Opponent Matchup → Game Flow (3 phases)
//   → Dynamic Poisson → Monte Carlo 50k → Style Matrix
//   → Variance → Market Edge → Value Score → Verdict
// Date sursă: doar parserul existent (FootyStats + Superbet).
// Mediile de ligă sunt aproximate cu baseline european fix.
// ============================================================
import type {
  MatchData, TeamStats, UserPlan, PoissonMatrix,
  BetRecommendation, AnalysisResult, MonteCarloResult, AnalysisStep,
} from './types';
import { loadBankrollState } from './bankroll';
import { runTipsterV10 } from './tipsterV10';

// ============= CONSTANTE (baseline ligă european mediu) =============
const LB_GOALS = 1.35;       // GF/echipă/meci
const LB_XG = 1.35;
const LB_SOT = 4.5;          // șuturi pe poartă/meci
const HOME_BOOST = 1.10;
const AWAY_PENALTY = 0.92;
const MC_SIMS = 50000;
const PHASE_WEIGHTS = [0.25, 0.35, 0.40] as const;
const MAX_GOALS_MATRIX = 5;

// ============= UTILITARE =============
function clamp(x: number, lo: number, hi: number) { return Math.min(hi, Math.max(lo, x)); }
function safe(n: number, fb = 0) { return Number.isFinite(n) && n > 0 ? n : fb; }

function getBankroll(plan?: UserPlan): number {
  const s = loadBankrollState();
  if (s) return s.currentBankroll;
  return plan?.bankroll || 1000;
}

// ============= 1. NORMALIZARE ATT/DEF =============
function attAdj(t: TeamStats, isHome: boolean): number {
  const gf = safe(isHome ? t.goalsScoredHome : t.goalsScoredAway, t.goalsScored || LB_GOALS);
  const xg = safe(t.xG, LB_XG);
  const sot = safe(isHome ? (t.shotsOnTargetHome || t.shotsOnTarget) : (t.shotsOnTargetAway || t.shotsOnTarget), LB_SOT);
  return (gf / LB_GOALS) * 0.4 + (xg / LB_XG) * 0.4 + (sot / LB_SOT) * 0.2;
}

function defAdj(t: TeamStats, isHome: boolean): number {
  const ga = safe(isHome ? t.goalsConcededHome : t.goalsConcededAway, t.goalsConceded || LB_GOALS);
  const xga = safe(t.xGA, LB_XG);
  // proxy SoT allowed: dacă nu avem, folosim baseline
  const sotAllowed = LB_SOT;
  return (ga / LB_GOALS) * 0.4 + (xga / LB_XG) * 0.4 + (sotAllowed / LB_SOT) * 0.2;
}

// ============= 2. STYLE INTERACTION MATRIX =============
type StyleEffect = { xgHome: number; xgAway: number; bttsBias: number; underBias: number; note: string };

function styleMatrix(homeStyle: string, awayStyle: string): StyleEffect {
  const key = `${homeStyle}|${awayStyle}`;
  const map: Record<string, StyleEffect> = {
    'high-press|low-block':   { xgHome: 1.10, xgAway: 0.90, bttsBias: -0.05, underBias: 0.04, note: 'High-press vs Low-block: cornere multe, scor strâns' },
    'high-press|bus-parking': { xgHome: 1.05, xgAway: 0.78, bttsBias: -0.10, underBias: 0.08, note: 'High-press vs Bus parking: 1-0 / 2-0 tipic' },
    'high-press|high-press':  { xgHome: 1.15, xgAway: 1.10, bttsBias: 0.12, underBias: -0.10, note: 'Duel high-press: meci deschis, BTTS probabil' },
    'possession|counter':     { xgHome: 1.05, xgAway: 1.08, bttsBias: 0.10, underBias: -0.05, note: 'Posesie vs contraatac: BTTS pe tranziții' },
    'possession|low-block':   { xgHome: 1.02, xgAway: 0.85, bttsBias: -0.06, underBias: 0.05, note: 'Posesie sterilă vs apărare joasă' },
    'pressing|low-block':     { xgHome: 1.06, xgAway: 0.88, bttsBias: -0.04, underBias: 0.04, note: 'Pressing vs low-block: ușor Under' },
    'low-block|low-block':    { xgHome: 0.85, xgAway: 0.82, bttsBias: -0.12, underBias: 0.12, note: 'Două apărări joase: Under puternic' },
    'bus-parking|bus-parking':{ xgHome: 0.78, xgAway: 0.75, bttsBias: -0.15, underBias: 0.15, note: 'Bus parking dublu: 0-0 / 1-0' },
    'counter|counter':        { xgHome: 0.95, xgAway: 0.95, bttsBias: 0.05, underBias: 0.02, note: 'Două contraatacante: spațiu mediu' },
  };
  if (map[key]) return map[key];
  // fallback simetric / parțial
  const def: StyleEffect = { xgHome: 1.0, xgAway: 1.0, bttsBias: 0, underBias: 0, note: 'Stiluri compatibile, fără ajustare matrice' };
  if (homeStyle === 'bus-parking' || awayStyle === 'bus-parking') { def.xgHome *= 0.9; def.xgAway *= 0.9; def.underBias = 0.08; def.note = 'Bus parking prezent: Under bias'; }
  else if (homeStyle === 'low-block' || awayStyle === 'low-block') { def.xgHome *= 0.95; def.xgAway *= 0.95; def.underBias = 0.04; def.note = 'Low-block prezent: ușor Under'; }
  else if (homeStyle === 'high-press' && awayStyle === 'possession') { def.xgHome *= 1.05; def.bttsBias = 0.06; def.note = 'High-press vs posesie: pierderi periculoase'; }
  return def;
}

// ============= 3. GAME FLOW + 4. DYNAMIC POISSON =============
// λ base per echipă derivat din ATT × DEF_opp_inverse × baseline goals
function buildLambdas(match: MatchData): { lamHome: number; lamAway: number; effect: StyleEffect } {
  const h = match.homeTeam, a = match.awayTeam;
  const aH = attAdj(h, true);
  const dA = defAdj(a, false);
  const aA = attAdj(a, false);
  const dH = defAdj(h, true);

  let lamH = aH * dA * LB_GOALS * HOME_BOOST;
  let lamA = aA * dH * LB_GOALS * AWAY_PENALTY;

  // calibrare ușoară spre xG-ul echipei dacă diferă mult (anti-bias)
  const xgHomeRatio = h.xG > 0 ? clamp(h.xG / Math.max(lamH, 0.3), 0.6, 1.5) : 1;
  const xgAwayRatio = a.xG > 0 ? clamp(a.xG / Math.max(lamA, 0.3), 0.6, 1.5) : 1;
  lamH *= 0.7 + 0.3 * xgHomeRatio;
  lamA *= 0.7 + 0.3 * xgAwayRatio;

  // fatigue
  if (match.homeTeamFatigued || match.homeEuropeanMatch) lamH *= 0.93;
  if (match.awayTeamFatigued || match.awayEuropeanMatch) lamA *= 0.93;

  // style matrix
  const effect = styleMatrix(h.playStyle, a.playStyle);
  lamH *= effect.xgHome;
  lamA *= effect.xgAway;

  // derby intensity
  if (match.isDerby) { lamH *= 1.04; lamA *= 1.04; }

  return { lamHome: Math.max(0.15, lamH), lamAway: Math.max(0.15, lamA), effect };
}

// λ pe fază (înainte de game-state). Echipele slabe defensiv primesc mai mult în faza 3.
function phaseLambdas(lam: number, isAttacker: boolean, oppDef: number): [number, number, number] {
  const base = PHASE_WEIGHTS.map(w => lam * w) as [number, number, number];
  // defensiva slabă a adversarului → atacantul crește în faza 3
  if (isAttacker && oppDef > 1.15) base[2] *= 1.0 + clamp((oppDef - 1.15) * 0.5, 0, 0.25);
  return base;
}

// ============= 5. MONTE CARLO PHASE-BY-PHASE =============
function poissonRandom(lambda: number): number {
  if (lambda <= 0) return 0;
  if (lambda > 30) return Math.round(lambda + Math.sqrt(lambda) * (Math.random() * 2 - 1));
  const L = Math.exp(-lambda);
  let k = 0, p = 1;
  do { k++; p *= Math.random(); } while (p > L);
  return k - 1;
}

interface MCOut extends MonteCarloResult {
  variance: number;
  matrix: number[][];
  phaseGoalsHome: [number, number, number];
  phaseGoalsAway: [number, number, number];
}

function monteCarlo(match: MatchData, lamHome: number, lamAway: number, dHome: number, dAway: number, expCorners: number): MCOut {
  const phHome = phaseLambdas(lamHome, true, dAway);
  const phAway = phaseLambdas(lamAway, true, dHome);

  let homeWins = 0, draws = 0, awayWins = 0, over25 = 0, btts = 0;
  let sumH = 0, sumA = 0, sumC = 0;
  let sumH2 = 0; // pentru variance
  const matrix: number[][] = Array.from({ length: MAX_GOALS_MATRIX + 1 }, () => Array(MAX_GOALS_MATRIX + 1).fill(0));
  const phaseGH: [number, number, number] = [0, 0, 0];
  const phaseGA: [number, number, number] = [0, 0, 0];
  const scores: Record<string, number> = {};

  for (let i = 0; i < MC_SIMS; i++) {
    let hG = 0, aG = 0;
    for (let ph = 0; ph < 3; ph++) {
      // game-state: cine conduce → ajustează λ în faza curentă
      const diff = hG - aG;
      let lamH_p = phHome[ph];
      let lamA_p = phAway[ph];
      if (diff >= 1) { lamH_p *= 0.92; lamA_p *= 1.10; }       // gazdă conduce → relaxare
      else if (diff <= -1) { lamH_p *= 1.12; lamA_p *= 0.90; } // gazdă condusă → presează
      if (Math.abs(diff) >= 2) { lamH_p *= 0.95; lamA_p *= 1.08; } // diferență mare amplifică
      const gh = poissonRandom(lamH_p);
      const ga = poissonRandom(lamA_p);
      hG += gh; aG += ga;
      phaseGH[ph] += gh; phaseGA[ph] += ga;
    }

    if (hG > aG) homeWins++;
    else if (hG === aG) draws++;
    else awayWins++;
    if (hG + aG > 2) over25++;
    if (hG > 0 && aG > 0) btts++;

    sumH += hG; sumA += aG;
    sumH2 += (hG + aG) * (hG + aG);
    sumC += poissonRandom(expCorners);

    const hi = Math.min(hG, MAX_GOALS_MATRIX);
    const ai = Math.min(aG, MAX_GOALS_MATRIX);
    matrix[hi][ai]++;
    const key = `${hG}-${aG}`;
    scores[key] = (scores[key] || 0) + 1;
  }

  // normalize matrix
  for (let h = 0; h <= MAX_GOALS_MATRIX; h++)
    for (let a = 0; a <= MAX_GOALS_MATRIX; a++)
      matrix[h][a] /= MC_SIMS;

  const meanTotal = (sumH + sumA) / MC_SIMS;
  const variance = Math.max(0, sumH2 / MC_SIMS - meanTotal * meanTotal);

  return {
    homeWinPct: homeWins / MC_SIMS,
    drawPct: draws / MC_SIMS,
    awayWinPct: awayWins / MC_SIMS,
    over25Pct: over25 / MC_SIMS,
    bttsPct: btts / MC_SIMS,
    avgHomeGoals: sumH / MC_SIMS,
    avgAwayGoals: sumA / MC_SIMS,
    avgCorners: sumC / MC_SIMS,
    scoreDistribution: Object.fromEntries(
      Object.entries(scores)
        .map(([k, v]) => [k, v / MC_SIMS])
        .sort((x, y) => (y[1] as number) - (x[1] as number))
        .slice(0, 10)
    ),
    variance,
    matrix,
    phaseGoalsHome: [phaseGH[0] / MC_SIMS, phaseGH[1] / MC_SIMS, phaseGH[2] / MC_SIMS],
    phaseGoalsAway: [phaseGA[0] / MC_SIMS, phaseGA[1] / MC_SIMS, phaseGA[2] / MC_SIMS],
  };
}

// ============= 6. EXPECTED CORNERS (simplu, păstrat pentru UI) =============
function expectedCorners(match: MatchData, lamHome: number, lamAway: number): number {
  const h = match.homeTeam, a = match.awayTeam;
  let base = (h.cornersPerMatchHome || h.cornersPerMatch || 5) + (a.cornersPerMatchAway || a.cornersPerMatch || 4);
  // stil
  if (h.playStyle === 'high-press' || h.playStyle === 'pressing') base *= 1.05;
  if (a.playStyle === 'low-block' || a.playStyle === 'bus-parking') base *= 1.08;
  // intensitate ofensivă derivată din λ
  base *= 0.9 + 0.1 * ((lamHome + lamAway) / 2.5);
  return base;
}

// ============= 7. VARIANCE / STABILITY =============
function stabilityFromVariance(variance: number, t: TeamStats[], modelProb: number, mcProb: number): number {
  // 1) variance MC normalizată (variance mare → instabil)
  const varNorm = clamp(variance / 4.0, 0, 1); // var=4 → 0 stabilitate
  // 2) gap între Poisson static și MC (deja sunt din MC, deci folosim agreement model-MC)
  const agreement = 1 - Math.abs(modelProb - mcProb);
  // 3) diversitate formă: cu cât mai amestecată, cu atât mai instabilă
  const diversity = t.reduce((acc, team) => {
    const f = team.formLast5 || [];
    const uniq = new Set(f).size;
    return acc + (uniq / 3);
  }, 0) / Math.max(1, t.length);
  const stab = (1 - varNorm) * 0.5 + agreement * 0.35 + (1 - diversity) * 0.15;
  return clamp(stab, 0, 1);
}

// ============= 8. MARKET EDGE =============
function marketProb(odds: number): number { return odds > 1 ? 1 / odds : 0; }
function edge(modelProb: number, odds: number): number { return modelProb - marketProb(odds); }

// ============= 9. VALUE SCORE =============
function valueScore(args: { edge: number; stability: number; modelProb: number; oppositionMcGap: number }): number {
  const edgeNorm = clamp(args.edge / 0.15, 0, 1);                 // 15% edge → max
  const stabNorm = args.stability;
  const confNorm = clamp(Math.abs(args.edge) * 4 + args.stability * 0.5, 0, 1);
  const disagreement = clamp(Math.abs(args.edge) * 5, 0, 1);      // |edge| 20% → max
  const score = edgeNorm * 0.4 + stabNorm * 0.2 + confNorm * 0.2 + disagreement * 0.2;
  return clamp(score * 100, 0, 100);
}

function verdictFromScore(score: number): 'BET PUTERNIC' | 'BET SLAB' | 'PAS' {
  if (score >= 75) return 'BET PUTERNIC';
  if (score >= 60) return 'BET SLAB';
  return 'PAS';
}

function stakeUnitsFromScore(score: number): number {
  if (score >= 75) return 2.0;
  if (score >= 60) return 0.5;
  return 0;
}

function confidenceFromScore(score: number): 'high' | 'medium' | 'low' {
  if (score >= 75) return 'high';
  if (score >= 60) return 'medium';
  return 'low';
}

function riskFromVariance(variance: number, odds: number): 'low' | 'medium' | 'high' {
  if (variance > 3 || odds > 4.5) return 'high';
  if (variance > 2 || odds > 2.8) return 'medium';
  return 'low';
}

// ============= 10. KELLY (informativ în output, NU determină miza) =============
function kellyFraction(p: number, odds: number): number {
  const b = odds - 1;
  if (b <= 0) return 0;
  return Math.max(0, (b * p - (1 - p)) / b);
}

// ============= AI EXPLANATION =============
function explain(
  bet: { selection: string; category: string; edge: number; score: number; verdict: string },
  match: MatchData, lamH: number, lamA: number, effect: StyleEffect, variance: number
): string {
  const h = match.homeTeam.name, a = match.awayTeam.name;
  const parts: string[] = [];
  parts.push(`λ dinamic: ${h} ${lamH.toFixed(2)} vs ${a} ${lamA.toFixed(2)} (game flow pe 3 faze).`);
  parts.push(`Stil: ${effect.note}.`);
  parts.push(`Edge vs piață: ${(bet.edge * 100).toFixed(1)}%. Variance MC: ${variance.toFixed(2)}.`);
  parts.push(`Value Score: ${bet.score.toFixed(0)}/100 → ${bet.verdict}.`);
  if (bet.verdict === 'PAS') parts.push('Edge insuficient sau instabilitate ridicată — model recomandă PAS.');
  return parts.join(' ');
}

// ============= ANALYSIS STEPS (debug pipeline) =============
function buildSteps(match: MatchData, lamH: number, lamA: number, mc: MCOut, effect: StyleEffect): AnalysisStep[] {
  const h = match.homeTeam, a = match.awayTeam;
  return [
    {
      title: '1. Normalizare ATT/DEF (baseline ligă)',
      description: `Forța atac/apărare normalizată la baseline ${LB_GOALS} GF, ${LB_XG} xG, ${LB_SOT} SoT.`,
      data: {
        'ATT gazdă (acasă)': attAdj(h, true).toFixed(3),
        'DEF gazdă (acasă)': defAdj(h, true).toFixed(3),
        'ATT oaspete (deplasare)': attAdj(a, false).toFixed(3),
        'DEF oaspete (deplasare)': defAdj(a, false).toFixed(3),
      },
    },
    {
      title: '2. Matchup oponent + Style Matrix',
      description: effect.note + ` Multiplicatori xG: gazdă ×${effect.xgHome.toFixed(2)}, oaspete ×${effect.xgAway.toFixed(2)}.`,
      data: { 'BTTS bias': effect.bttsBias, 'Under bias': effect.underBias },
    },
    {
      title: '3. Game Flow (3 faze) + Poisson dinamic',
      description: `λ împărțit pe faze [0-30 / 30-60 / 60-90] cu weights ${PHASE_WEIGHTS.join('/')}. Game-state ajustează λ în timpul simulării.`,
      data: {
        'λ gazdă total': lamH.toFixed(2),
        'λ oaspete total': lamA.toFixed(2),
        'Faza 1 (avg goluri)': `${mc.phaseGoalsHome[0].toFixed(2)} - ${mc.phaseGoalsAway[0].toFixed(2)}`,
        'Faza 2 (avg goluri)': `${mc.phaseGoalsHome[1].toFixed(2)} - ${mc.phaseGoalsAway[1].toFixed(2)}`,
        'Faza 3 (avg goluri)': `${mc.phaseGoalsHome[2].toFixed(2)} - ${mc.phaseGoalsAway[2].toFixed(2)}`,
      },
    },
    {
      title: `4. Monte Carlo ${MC_SIMS.toLocaleString('ro-RO')} simulări`,
      description: `Simulare faze-by-faze cu state changes.`,
      data: {
        'P(1)': `${(mc.homeWinPct * 100).toFixed(1)}%`,
        'P(X)': `${(mc.drawPct * 100).toFixed(1)}%`,
        'P(2)': `${(mc.awayWinPct * 100).toFixed(1)}%`,
        'Over 2.5': `${(mc.over25Pct * 100).toFixed(1)}%`,
        'BTTS': `${(mc.bttsPct * 100).toFixed(1)}%`,
        'Variance goluri totale': mc.variance.toFixed(2),
      },
    },
  ];
}

// ============= STYLE & MOTIVATION (păstrate pentru UI existent) =============
function styleAnalysisText(match: MatchData, effect: StyleEffect): string {
  const h = match.homeTeam, a = match.awayTeam;
  return `${h.name} (${h.playStyle}) vs ${a.name} (${a.playStyle}). ${effect.note}.`;
}

function motivationText(match: MatchData, mc: MCOut): string {
  const parts: string[] = [];
  if (mc.variance > 3) parts.push('⚠️ Variance ridicată: meci volatil, evită stake mare');
  else if (mc.variance < 1.5) parts.push('✅ Variance scăzută: meci stabil, favorabil Unders/favoriți');
  else parts.push('Variance moderată');
  if (match.isDerby) parts.push('🔥 Derby — intensitate +5% pe ambele λ');
  if (match.homeTeamFatigued || match.awayTeamFatigued) parts.push('⚠️ Oboseală detectată — λ redus 7%');
  parts.push(`Faza dominantă: ${dominantPhase(mc)}`);
  return parts.join('. ') + '.';
}

function dominantPhase(mc: MCOut): string {
  const totals = [0, 1, 2].map(i => mc.phaseGoalsHome[i] + mc.phaseGoalsAway[i]);
  const max = Math.max(...totals);
  const idx = totals.indexOf(max);
  return ['0-30 min', '30-60 min', '60-90 min'][idx];
}

// ============= POISSON MATRIX (pt UI care îl așteaptă) =============
function pmf(lam: number, k: number): number {
  let r = Math.exp(-lam);
  for (let i = 1; i <= k; i++) r *= lam / i;
  return r;
}
function poissonCDF(lam: number, k: number): number {
  let s = 0;
  for (let i = 0; i <= Math.floor(k); i++) s += pmf(lam, i);
  return s;
}
function poissonMatrixFromMC(mc: MCOut): PoissonMatrix {
  return {
    homeGoals: Array.from({ length: MAX_GOALS_MATRIX + 1 }, (_, i) => i),
    awayGoals: Array.from({ length: MAX_GOALS_MATRIX + 1 }, (_, i) => i),
    probabilities: mc.matrix,
  };
}

// ============= MAIN =============
export function runAnalysis(match: MatchData, plan?: UserPlan): AnalysisResult {
  const { lamHome, lamAway, effect } = buildLambdas(match);
  const dA = defAdj(match.awayTeam, false);
  const dH = defAdj(match.homeTeam, true);
  const expCorners = expectedCorners(match, lamHome, lamAway);

  const mc = monteCarlo(match, lamHome, lamAway, dH, dA, expCorners);

  // ===== Aplicăm BTTS/Under bias din style matrix =====
  const over25Prob = clamp(mc.over25Pct - effect.underBias, 0.01, 0.99);
  const bttsProb = clamp(mc.bttsPct + effect.bttsBias, 0.01, 0.99);

  const homeWinProb = mc.homeWinPct;
  const drawProb = mc.drawPct;
  const awayWinProb = mc.awayWinPct;

  const bankroll = getBankroll(plan);
  const teams = [match.homeTeam, match.awayTeam];

  const recommendations: BetRecommendation[] = [];

  // helper care construiește un BetRecommendation V2
  function makeBet(args: {
    type: string; category: 'corners' | 'winner' | 'goals'; selection: string;
    prob: number; odds: number;
  }): BetRecommendation | null {
    if (!args.odds || args.odds <= 1) return null;
    const e = edge(args.prob, args.odds);
    const stability = stabilityFromVariance(mc.variance, teams, args.prob, args.prob);
    const score = valueScore({ edge: e, stability, modelProb: args.prob, oppositionMcGap: 0 });
    const verdict = verdictFromScore(score);
    const stakeU = stakeUnitsFromScore(score);
    const stakePct = stakeU / 100;                                  // 1u = 1% bankroll
    const stakeLei = bankroll * stakePct;
    const conf = confidenceFromScore(score);
    const risk = riskFromVariance(mc.variance, args.odds);
    const aiExplanation = explain(
      { selection: args.selection, category: args.category, edge: e, score, verdict },
      match, lamHome, lamAway, effect, mc.variance
    );
    const kellyF = kellyFraction(args.prob, args.odds);
    return {
      type: args.type,
      category: args.category,
      selection: args.selection,
      modelProbability: args.prob,
      bookmakerProbability: marketProb(args.odds),
      value: e * 100,                                              // % edge real
      odds: args.odds,
      kellyStake: kellyF * bankroll,
      kellyPercent: kellyF * 100,
      confidence: conf,
      stability,
      risk,
      tipsterTier: score >= 75 ? 'tipster_premium' : 'tipster',
      winRate: score,                                              // Value Score 0-100 (UI sortează după acesta)
      aiExplanation,
      stakeConfidence: score >= 85 ? 'VERY_HIGH' : score >= 75 ? 'HIGH' : score >= 65 ? 'MEDIUM' : score >= 55 ? 'LOW' : 'VERY_LOW',
      stakePct,
      stakeLei,
      ev: args.prob * args.odds - 1,
      fragile: mc.variance > 3 || stability < 0.4,
    };
  }

  // 1X2
  [
    { type: 'Solist', category: 'winner' as const, selection: `${match.homeTeam.name} (1)`, prob: homeWinProb, odds: match.oddsHome },
    { type: 'Solist', category: 'winner' as const, selection: 'Egal (X)', prob: drawProb, odds: match.oddsDraw },
    { type: 'Solist', category: 'winner' as const, selection: `${match.awayTeam.name} (2)`, prob: awayWinProb, odds: match.oddsAway },
  ].forEach(b => { const r = makeBet(b); if (r) recommendations.push(r); });

  // Goluri
  [
    { type: 'Goluri', category: 'goals' as const, selection: 'Over 2.5', prob: over25Prob, odds: match.oddsOver25 },
    { type: 'Goluri', category: 'goals' as const, selection: 'Under 2.5', prob: 1 - over25Prob, odds: match.oddsUnder25 },
    { type: 'Goluri', category: 'goals' as const, selection: 'BTTS Da', prob: bttsProb, odds: match.oddsBTTSYes },
    { type: 'Goluri', category: 'goals' as const, selection: 'BTTS Nu', prob: 1 - bttsProb, odds: match.oddsBTTSNo },
  ].forEach(b => { const r = makeBet(b); if (r) recommendations.push(r); });

  // Cornere
  for (const cl of match.cornerLines || []) {
    if (cl.oddsOver > 1 && cl.oddsUnder > 1) {
      const overP = 1 - poissonCDF(expCorners, cl.line);
      const underP = poissonCDF(expCorners, cl.line);
      const ro = makeBet({ type: 'Cornere', category: 'corners', selection: `Over ${cl.line} cornere`, prob: overP, odds: cl.oddsOver });
      const ru = makeBet({ type: 'Cornere', category: 'corners', selection: `Under ${cl.line} cornere`, prob: underP, odds: cl.oddsUnder });
      if (ro) recommendations.push(ro);
      if (ru) recommendations.push(ru);
    }
  }

  // Plan filter (opțional)
  let filtered = recommendations;
  if (plan) {
    filtered = filtered.filter(r => {
      if (plan.maxRisk === 'low' && r.risk === 'high') return false;
      if (plan.maxRisk === 'medium' && r.risk === 'high') return false;
      if (!plan.preferredBets.includes(r.category)) return false;
      return true;
    });
  }

  // Sortează după Value Score
  filtered.sort((a, b) => b.winRate - a.winRate);

  // Best bet = top score ≥ 60 cu edge pozitiv
  const bestBet = filtered.find(r => r.winRate >= 60 && r.value > 0) || null;

  const partial: AnalysisResult = {
    homeXG: lamHome,
    awayXG: lamAway,
    poissonMatrix: poissonMatrixFromMC(mc),
    homeWinProb,
    drawProb,
    awayWinProb,
    over25Prob,
    under25Prob: 1 - over25Prob,
    bttsProb,
    expectedCorners: expCorners,
    recommendations: filtered,
    monteCarloResults: {
      homeWinPct: mc.homeWinPct,
      drawPct: mc.drawPct,
      awayWinPct: mc.awayWinPct,
      over25Pct: mc.over25Pct,
      bttsPct: mc.bttsPct,
      avgHomeGoals: mc.avgHomeGoals,
      avgAwayGoals: mc.avgAwayGoals,
      avgCorners: mc.avgCorners,
      scoreDistribution: mc.scoreDistribution,
    },
    styleAnalysis: styleAnalysisText(match, effect),
    motivationAnalysis: motivationText(match, mc),
    analysisSteps: buildSteps(match, lamHome, lamAway, mc, effect),
    detectedStyles: { home: match.homeTeam.playStyle, away: match.awayTeam.playStyle },
    bestBet,
  };
  partial.tipsterV10 = runTipsterV10(match, partial);
  return partial;
}