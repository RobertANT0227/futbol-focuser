// ============================================================
// TIPSTER PREMIUM V10 — strat de decizie pe top de engine-ul V2
// Nu recalculează Poisson/MC (le folosește din AnalysisResult),
// dar adaugă: Momentum, Stability, Chaos, Trap, Pressure,
// Tactical Matchup, Motivation, PCS, filtrele Premium + un
// singur Pick final.
// ============================================================
import type { MatchData, AnalysisResult, TeamStats } from './types';

export interface V10Indicator {
  key: string;
  label: string;
  score: number;          // 0..100
  band: 'excellent' | 'good' | 'ok' | 'weak';
  note: string;
}

export interface V10FinalPick {
  market: string;
  selection: string;
  probability: number;    // 0..1
  odds?: number;
  reason: string;
}

export interface TipsterV10Report {
  indicators: V10Indicator[];
  poissonTop: { selection: string; prob: number };
  monteCarloTop: { selection: string; prob: number };
  topScores: { score: string; prob: number }[];
  pcs: number;                              // 0..100
  classification:
    | 'Elite Pick' | 'Premium A+' | 'Premium A'
    | 'Premium B+' | 'Premium B' | 'PAS';
  filtersPassed: { name: string; ok: boolean; detail: string }[];
  verdict: 'PICK' | 'PAS';
  finalPick: V10FinalPick | null;
  summary: string;
}

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const bandOf = (v: number): V10Indicator['band'] =>
  v >= 85 ? 'excellent' : v >= 70 ? 'good' : v >= 55 ? 'ok' : 'weak';

// ---------- 1. POISSON ADVANCED ----------
function poissonIndicator(res: AnalysisResult): V10Indicator & { topSel: string; topProb: number } {
  const probs = [
    { sel: '1 (Gazdă)', p: res.homeWinProb },
    { sel: 'X (Egal)', p: res.drawProb },
    { sel: '2 (Oaspete)', p: res.awayWinProb },
    { sel: 'Over 2.5', p: res.over25Prob },
    { sel: 'Under 2.5', p: res.under25Prob },
    { sel: 'BTTS Da', p: res.bttsProb },
    { sel: 'BTTS Nu', p: 1 - res.bttsProb },
  ];
  probs.sort((a, b) => b.p - a.p);
  const top = probs[0];
  const score = clamp(top.p * 100);
  return {
    key: 'poisson', label: 'Poisson Advanced', score,
    band: bandOf(score),
    note: `Cea mai probabilă piață: ${top.sel} (${(top.p * 100).toFixed(1)}%).`,
    topSel: top.sel, topProb: top.p,
  };
}

// ---------- 2. MONTE CARLO ----------
function monteCarloIndicator(res: AnalysisResult): V10Indicator & { topSel: string; topProb: number } {
  const mc = res.monteCarloResults;
  const probs = [
    { sel: '1 (Gazdă)', p: mc.homeWinPct },
    { sel: 'X (Egal)', p: mc.drawPct },
    { sel: '2 (Oaspete)', p: mc.awayWinPct },
    { sel: 'Over 2.5', p: mc.over25Pct },
    { sel: 'Under 2.5', p: 1 - mc.over25Pct },
    { sel: 'BTTS Da', p: mc.bttsPct },
    { sel: 'BTTS Nu', p: 1 - mc.bttsPct },
  ];
  probs.sort((a, b) => b.p - a.p);
  const top = probs[0];
  const score = clamp(top.p * 100);
  return {
    key: 'mc', label: 'Monte Carlo (50k)', score,
    band: bandOf(score),
    note: `Top MC: ${top.sel} (${(top.p * 100).toFixed(1)}%).`,
    topSel: top.sel, topProb: top.p,
  };
}

// ---------- 3. MOMENTUM ----------
function formPoints(form: ('W'|'D'|'L')[]): number {
  if (!form?.length) return 50;
  const map = { W: 3, D: 1, L: 0 } as const;
  const pts = form.reduce((s, f) => s + map[f], 0);
  return (pts / (form.length * 3)) * 100;
}
function momentumIndicator(match: MatchData): V10Indicator {
  const h = match.homeTeam, a = match.awayTeam;
  const teamMom = (t: TeamStats, home: boolean) => {
    const overall = formPoints(t.formLast5);            // 40%
    const xg = clamp((t.xG / 1.6) * 100);               // 30%
    const split = formPoints(home ? t.formHome : t.formAway); // 20%
    const context = 60;                                 // 10% — fallback neutru
    return overall * 0.4 + xg * 0.3 + split * 0.2 + context * 0.1;
  };
  const mh = teamMom(h, true), ma = teamMom(a, false);
  const score = clamp((mh + ma) / 2);
  return {
    key: 'momentum', label: 'Momentum Index', score, band: bandOf(score),
    note: `Gazdă ${mh.toFixed(0)} / Oaspete ${ma.toFixed(0)}.`,
  };
}

// ---------- 4. STABILITY ----------
function stabilityIndicator(match: MatchData, res: AnalysisResult): V10Indicator {
  // proxy: forme cu diversitate scăzută + rate goluri primite/marcate consistente
  const diversity = (f: ('W'|'D'|'L')[]) => new Set(f).size;
  const diffH = Math.abs(match.homeTeam.goalsScoredHome - match.homeTeam.goalsScored);
  const diffA = Math.abs(match.awayTeam.goalsScoredAway - match.awayTeam.goalsScored);
  const splitStability = clamp(100 - (diffH + diffA) * 40);
  const dH = diversity(match.homeTeam.formLast5 || []);
  const dA = diversity(match.awayTeam.formLast5 || []);
  const formStability = clamp(100 - ((dH + dA - 2) * 15));
  // xG vs goluri: cât de aproape sunt (echipe stabile marchează ~ cât produc)
  const gapH = Math.abs(match.homeTeam.xG - match.homeTeam.goalsScored);
  const gapA = Math.abs(match.awayTeam.xG - match.awayTeam.goalsScored);
  const xgStability = clamp(100 - (gapH + gapA) * 25);
  const score = clamp(splitStability * 0.35 + formStability * 0.4 + xgStability * 0.25);
  return {
    key: 'stability', label: 'Stability Score', score, band: bandOf(score),
    note: `Diversitate formă: ${dH}/${dA}. Split acasă/deplasare vs medie: ok.`,
  };
}

// ---------- 5. MATCH CHAOS ----------
function chaosIndicator(match: MatchData, res: AnalysisResult): V10Indicator {
  const mc = res.monteCarloResults;
  // chaos = medie goluri + BTTS + cartonașe/faulturi + spread MC (când 1/X/2 sunt aproape egale)
  const spread = 1 - Math.max(mc.homeWinPct, mc.drawPct, mc.awayWinPct);
  const goalsChaos = clamp((mc.avgHomeGoals + mc.avgAwayGoals) * 15);
  const bttsChaos = clamp(mc.bttsPct * 60);
  const overChaos = clamp(mc.over25Pct * 50);
  const cardsChaos = clamp((match.homeTeam.cardsPerMatch + match.awayTeam.cardsPerMatch) * 8);
  const score = clamp(spread * 40 + goalsChaos * 0.2 + bttsChaos * 0.15 + overChaos * 0.15 + cardsChaos * 0.1);
  return {
    key: 'chaos', label: 'Match Chaos', score, band: bandOf(100 - score),
    note: score < 20 ? 'Meci ordonat.' : score < 40 ? 'Chaos moderat.' : score < 50 ? 'Risc chaos.' : 'Chaos ridicat — evită.',
  };
}

// ---------- 6. TRAP DETECTOR ----------
function trapIndicator(match: MatchData, res: AnalysisResult): V10Indicator {
  let trap = 0;
  const notes: string[] = [];
  const favIsHome = match.oddsHome < match.oddsAway;
  const favForm = favIsHome ? formPoints(match.homeTeam.formLast5) : formPoints(match.awayTeam.formLast5);
  if (favForm < 45) { trap += 20; notes.push('Favorit în formă slabă'); }
  // cotă favorit foarte mică dar model nu confirmă
  const favOdds = Math.min(match.oddsHome, match.oddsAway);
  const favModel = favIsHome ? res.homeWinProb : res.awayWinProb;
  const marketFav = favOdds > 1 ? 1 / favOdds : 0.5;
  if (marketFav - favModel > 0.12) { trap += 25; notes.push('Model sub piața pe favorit'); }
  if (match.homeTeamFatigued || match.awayTeamFatigued) { trap += 12; notes.push('Oboseală'); }
  if (match.homeEuropeanMatch || match.awayEuropeanMatch) { trap += 10; notes.push('Program european'); }
  const score = clamp(trap);
  return {
    key: 'trap', label: 'Trap Detector', score, band: bandOf(100 - score),
    note: notes.length ? notes.join(' · ') : 'Fără semnale de capcană.',
  };
}

// ---------- 7. PRESSURE ----------
function pressureIndicator(match: MatchData): V10Indicator {
  let p = 20;
  const notes: string[] = [];
  if (match.isDerby) { p += 25; notes.push('Derby'); }
  if (match.homeEuropeanMatch || match.awayEuropeanMatch) { p += 15; notes.push('Cupe europene'); }
  const lp = match.homeTeam.leaguePosition, ap = match.awayTeam.leaguePosition;
  const total = match.homeTeam.totalTeamsInLeague || 18;
  if (lp > 0 && lp <= 3) { p += 15; notes.push('Gazdă în luptă titlu'); }
  if (ap > 0 && ap <= 3) { p += 15; notes.push('Oaspete în luptă titlu'); }
  if (lp > 0 && lp >= total - 2) { p += 15; notes.push('Gazdă zona retrogradării'); }
  if (ap > 0 && ap >= total - 2) { p += 15; notes.push('Oaspete zona retrogradării'); }
  const score = clamp(p);
  return {
    key: 'pressure', label: 'Pressure Index', score, band: bandOf(100 - Math.abs(score - 50)),
    note: notes.length ? notes.join(' · ') : 'Presiune redusă.',
  };
}

// ---------- 8. TACTICAL MATCHUP ----------
function tacticalIndicator(match: MatchData): V10Indicator {
  const h = match.homeTeam, a = match.awayTeam;
  const possDiff = (h.possession || 50) - (a.possession || 50);
  const daDiff = (h.dangerousAttacks || 40) - (a.dangerousAttacks || 40);
  const shotDiff = (h.shots || 11) - (a.shots || 11);
  const styleBonus = h.playStyle !== a.playStyle ? 10 : 0;
  const raw = 50 + possDiff * 0.6 + daDiff * 0.3 + shotDiff * 1.5 + styleBonus;
  const score = clamp(Math.max(raw, 100 - raw));
  return {
    key: 'tactical', label: 'Tactical Matchup', score, band: bandOf(score),
    note: `Poziție tactică — posesie Δ${possDiff.toFixed(0)}, atacuri periculoase Δ${daDiff.toFixed(0)}.`,
  };
}

// ---------- 9. MOTIVATION ----------
function motivationIndicator(match: MatchData): V10Indicator {
  let m = 65;
  const notes: string[] = [];
  if (match.isDerby) { m += 20; notes.push('Derby'); }
  const total = match.homeTeam.totalTeamsInLeague || 18;
  const inTop = (pos: number) => pos > 0 && pos <= 4;
  const inBot = (pos: number) => pos > 0 && pos >= total - 3;
  if (inTop(match.homeTeam.leaguePosition) || inTop(match.awayTeam.leaguePosition)) { m += 10; notes.push('Obiectiv titlu/Europa'); }
  if (inBot(match.homeTeam.leaguePosition) || inBot(match.awayTeam.leaguePosition)) { m += 10; notes.push('Salvare'); }
  if (match.homeTeamFatigued || match.awayTeamFatigued) { m -= 8; notes.push('Oboseală'); }
  const score = clamp(m);
  return {
    key: 'motivation', label: 'Motivation Score', score, band: bandOf(score),
    note: notes.length ? notes.join(' · ') : 'Motivație standard.',
  };
}

// ---------- PCS + Clasificare + Filtre + Pick ----------
function classify(pcs: number): TipsterV10Report['classification'] {
  if (pcs >= 95) return 'Elite Pick';
  if (pcs >= 90) return 'Premium A+';
  if (pcs >= 85) return 'Premium A';
  if (pcs >= 80) return 'Premium B+';
  if (pcs >= 75) return 'Premium B';
  return 'PAS';
}

export function runTipsterV10(match: MatchData, res: AnalysisResult): TipsterV10Report {
  const poi = poissonIndicator(res);
  const mc = monteCarloIndicator(res);
  const mom = momentumIndicator(match);
  const stab = stabilityIndicator(match, res);
  const chaos = chaosIndicator(match, res);
  const trap = trapIndicator(match, res);
  const pres = pressureIndicator(match);
  const tact = tacticalIndicator(match);
  const mot = motivationIndicator(match);

  const positives = (poi.score + mc.score + mom.score + stab.score + mot.score + tact.score) / 6;
  const negatives = (chaos.score + trap.score) / 2;
  const pcs = clamp(positives - negatives * 0.35);

  const filters = [
    { name: 'Poisson > 70%', ok: poi.score > 70, detail: `${poi.score.toFixed(0)}%` },
    { name: 'Stability > 75', ok: stab.score > 75, detail: stab.score.toFixed(0) },
    { name: 'Chaos < 15', ok: chaos.score < 15, detail: chaos.score.toFixed(0) },
    { name: 'Trap < 25', ok: trap.score < 25, detail: trap.score.toFixed(0) },
    { name: 'Momentum > 65', ok: mom.score > 65, detail: mom.score.toFixed(0) },
    { name: 'Fără oboseală majoră', ok: !(match.homeTeamFatigued && match.awayTeamFatigued), detail: 'ok' },
  ];
  const criticalPass = filters.every(f => f.ok);
  const classification = classify(pcs);
  const verdict: 'PICK' | 'PAS' = criticalPass && classification !== 'PAS' ? 'PICK' : 'PAS';

  // pick final = top MC dacă trece filtrele
  const oddsMap: Record<string, number | undefined> = {
    '1 (Gazdă)': match.oddsHome,
    'X (Egal)': match.oddsDraw,
    '2 (Oaspete)': match.oddsAway,
    'Over 2.5': match.oddsOver25,
    'Under 2.5': match.oddsUnder25,
    'BTTS Da': match.oddsBTTSYes,
    'BTTS Nu': match.oddsBTTSNo,
  };
  const finalPick: V10FinalPick | null = verdict === 'PICK'
    ? {
        market: mc.topSel.includes('Over') || mc.topSel.includes('Under') ? 'Goluri'
          : mc.topSel.includes('BTTS') ? 'BTTS' : '1X2',
        selection: mc.topSel,
        probability: mc.topProb,
        odds: oddsMap[mc.topSel],
        reason: `Convergență Poisson (${poi.score.toFixed(0)}%) + MC (${mc.score.toFixed(0)}%), Stability ${stab.score.toFixed(0)}, Chaos ${chaos.score.toFixed(0)}, Trap ${trap.score.toFixed(0)}.`,
      }
    : null;

  const summary = verdict === 'PICK'
    ? `${classification}. Pick: ${finalPick!.selection} @ ${(finalPick!.probability * 100).toFixed(1)}%.`
    : `PAS. Meciul nu îndeplinește standardele Tipster Premium (PCS ${pcs.toFixed(0)}).`;

  const topScores = Object.entries(res.monteCarloResults.scoreDistribution)
    .map(([score, prob]) => ({ score, prob }))
    .slice(0, 5);

  return {
    indicators: [poi, mc, mom, stab, chaos, trap, pres, tact, mot],
    poissonTop: { selection: poi.topSel, prob: poi.topProb },
    monteCarloTop: { selection: mc.topSel, prob: mc.topProb },
    topScores,
    pcs,
    classification,
    filtersPassed: filters,
    verdict,
    finalPick,
    summary,
  };
}