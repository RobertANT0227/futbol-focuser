import type { CpMatch, CpTeam, ValueBet, MarketKey } from './types';
import { detectPlaystyle, styleClash, STYLE_LABEL, type PrimaryStyle } from './playstyle';

/** Strict numeric reader: returns null when value is missing/invalid. NEVER fakes data. */
function n(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const x = typeof v === 'number' ? v : parseFloat(String(v).replace('%', '').replace(',', '.'));
  return Number.isFinite(x) ? x : null;
}

function perMatch(value: number | null, matchesPlayed: number | null): number | null {
  if (value === null) return null;
  if (matchesPlayed && matchesPlayed > 0 && value > 12) return value / matchesPlayed;
  return value;
}

function pct01(value: number | null): number | null {
  if (value === null) return null;
  return value > 1 ? value / 100 : value;
}

/** Track which stats were available and which were missing per team. */
interface DataReport {
  used: Set<string>;
  missing: Set<string>;
}
function pick(report: DataReport, team: 'H' | 'A', key: string, val: number | null): number | null {
  const tag = `${team}.${key}`;
  if (val === null) { report.missing.add(tag); return null; }
  report.used.add(tag);
  return val;
}

// Poisson PMF
function pois(lambda: number, k: number) {
  let p = Math.exp(-lambda);
  for (let i = 1; i <= k; i++) p *= lambda / i;
  return p;
}
function poissonMatrix(lh: number, la: number, max = 7) {
  let pHome = 0, pDraw = 0, pAway = 0, pOver25 = 0, pBtts = 0;
  for (let h = 0; h <= max; h++) {
    for (let a = 0; a <= max; a++) {
      const p = pois(lh, h) * pois(la, a);
      if (h > a) pHome += p;
      else if (h === a) pDraw += p;
      else pAway += p;
      if (h + a > 2) pOver25 += p;
      if (h > 0 && a > 0) pBtts += p;
    }
  }
  return { pHome, pDraw, pAway, pOver25, pBtts };
}

/**
 * Compute attack/defense lambdas using ALL available signals — xG, xGA,
 * goals (overall + home/away splits), shots-on-target, possession, dangerous attacks.
 * Missing signals are skipped (never replaced with fake values).
 * Returns null if no signal is available at all.
 */
function teamLambda(
  team: CpTeam, opp: CpTeam, isHome: boolean, report: DataReport,
): { lambda: number | null; signalsUsed: number } {
  const t = team.stats; const o = opp.stats;
  const T = isHome ? 'H' : 'A';
  const O = isHome ? 'A' : 'H';
  const tMp = n(t.matches_played);
  const oMp = n(o.matches_played);
  const tSplitMp = (isHome ? n(t.matches_played_home) : n(t.matches_played_away)) ?? tMp;
  const oSplitMp = (isHome ? n(o.matches_played_away) : n(o.matches_played_home)) ?? oMp;

  // Attack signals (per match)
  const attSignals: number[] = [];
  const xg = pick(report, T, 'xg', n(t.xg) ?? (isHome ? n(t.xg_for_avg_home) : n(t.xg_for_avg_away)) ?? n(t.xg_avg_per_match));
  if (xg !== null) attSignals.push(xg);
  const splitGS = perMatch(isHome ? n(t.goals_scored_home) : n(t.goals_scored_away), tSplitMp);
  const gs = pick(report, T, 'goals_scored', (isHome ? n(t.goals_scored_per_match_home) : n(t.goals_scored_per_match_away)) ?? splitGS ?? n(t.goals_scored_per_match) ?? perMatch(n(t.goals_scored), tMp));
  if (gs !== null) attSignals.push(gs);
  const sot = pick(report, T, 'shots_on_target', perMatch(isHome ? (n(t.shots_on_target_home as unknown) ?? n(t.shots_on_target)) : (n(t.shots_on_target_away as unknown) ?? n(t.shots_on_target)), tSplitMp));
  if (sot !== null) attSignals.push(Math.min(2.5, sot * 0.30));
  const da = pick(report, T, 'dangerous_attacks', perMatch(n(t.dangerous_attacks), tMp));
  if (da !== null) attSignals.push(Math.min(2.5, da * 0.025));

  // Defense signals (opponent allows)
  const defSignals: number[] = [];
  const xga = pick(report, O, 'xga', n(o.xga) ?? (isHome ? n(o.xg_against_avg_away) : n(o.xg_against_avg_home)) ?? n(o.xga_avg_per_match));
  if (xga !== null) defSignals.push(xga);
  const splitGC = perMatch(isHome ? n(o.goals_conceded_away) : n(o.goals_conceded_home), oSplitMp);
  const gc = pick(report, O, 'goals_conceded', (isHome ? n(o.goals_conceded_per_match_away) : n(o.goals_conceded_per_match_home)) ?? splitGC ?? n(o.goals_conceded_per_match) ?? perMatch(n(o.goals_conceded), oMp));
  if (gc !== null) defSignals.push(gc);

  if (!attSignals.length && !defSignals.length) return { lambda: null, signalsUsed: 0 };

  const att = attSignals.length ? attSignals.reduce((a, b) => a + b, 0) / attSignals.length : null;
  const def = defSignals.length ? defSignals.reduce((a, b) => a + b, 0) / defSignals.length : null;
  const base = att !== null && def !== null ? (att + def) / 2 : (att ?? def!);
  const homeBoost = isHome ? 1.12 : 0.92;
  // Possession nudge (small)
  let possAdj = 1;
  const poss = n(t.possession);
  if (poss !== null) {
    pick(report, T, 'possession', poss);
    const p = poss > 1 ? poss : poss * 100;
    possAdj = 1 + (p - 50) * 0.003; // +/-15% across 0..100
  }
  return { lambda: Math.max(0.15, base * homeBoost * possAdj), signalsUsed: attSignals.length + defSignals.length };
}

function riskFromConfidence(conf: number, edge: number, reliability: 'high'|'medium'|'low'): 'low' | 'medium' | 'high' {
  if (reliability === 'low') return 'high';
  if (conf >= 70 && edge >= 5 && reliability === 'high') return 'low';
  if (conf >= 55) return 'medium';
  return 'high';
}

export interface EngineOptions {
  bankroll: number;
  edgeMin: number;       // % minimum edge
  kellyFraction: number; // 0..1 (e.g. 0.5 = half-Kelly)
  maxStakePct: number;   // cap (e.g. 0.05)
}

export function buildValueBets(
  match: CpMatch,
  homeTeam: CpTeam,
  awayTeam: CpTeam,
  opts: EngineOptions,
): ValueBet[] {
  const report: DataReport = { used: new Set(), missing: new Set() };
  const Lh = teamLambda(homeTeam, awayTeam, true, report);
  const La = teamLambda(awayTeam, homeTeam, false, report);

  // If we have absolutely no goal/xG signal on either side, abort: no fake data.
  if (Lh.lambda === null || La.lambda === null) return [];
  const lh = Lh.lambda, la = La.lambda;
  const m = poissonMatrix(lh, la);

  const psH = detectPlaystyle(homeTeam.stats).primary as PrimaryStyle;
  const psA = detectPlaystyle(awayTeam.stats).primary as PrimaryStyle;
  const clash = styleClash(psH, psA);

  const odds = match.odds || {};

  // Blend Poisson 1X2 with market-derived BTTS/Over rates if present (FootyStats often provides %)
  const btts_pct_h = n(homeTeam.stats.btts_pct) ?? n(homeTeam.stats.btts_percentage);
  const btts_pct_a = n(awayTeam.stats.btts_pct) ?? n(awayTeam.stats.btts_percentage);
  let pBtts = m.pBtts;
  if (btts_pct_h !== null && btts_pct_a !== null) {
    pick(report, 'H', 'btts_pct', btts_pct_h); pick(report, 'A', 'btts_pct', btts_pct_a);
    const empirical = (pct01(btts_pct_h)! + pct01(btts_pct_a)!) / 2;
    pBtts = pBtts * 0.6 + empirical * 0.4;
  }
  const over_h = n(homeTeam.stats.over25_pct) ?? n(homeTeam.stats.over25_percentage);
  const over_a = n(awayTeam.stats.over25_pct) ?? n(awayTeam.stats.over25_percentage);
  let pOver25 = m.pOver25;
  if (over_h !== null && over_a !== null) {
    pick(report, 'H', 'over25_pct', over_h); pick(report, 'A', 'over25_pct', over_a);
    const empirical = (pct01(over_h)! + pct01(over_a)!) / 2;
    pOver25 = pOver25 * 0.6 + empirical * 0.4;
  }

  const candidates: { market: MarketKey; cat: ValueBet['category']; prob: number; odd?: number }[] = [
    { market: '1', cat: 'winner', prob: m.pHome, odd: odds.home },
    { market: 'X', cat: 'winner', prob: m.pDraw, odd: odds.draw },
    { market: '2', cat: 'winner', prob: m.pAway, odd: odds.away },
    { market: 'Over 2.5', cat: 'goals', prob: pOver25, odd: odds.over25 },
    { market: 'Under 2.5', cat: 'goals', prob: 1 - pOver25, odd: odds.under25 },
    { market: 'BTTS Yes', cat: 'goals', prob: pBtts, odd: odds.btts_yes },
    { market: 'BTTS No', cat: 'goals', prob: 1 - pBtts, odd: odds.btts_no },
  ];

  // Corners — only if BOTH teams have corner data (no fake fallback)
  const cph = n(homeTeam.stats.corners) ?? n(homeTeam.stats.corners_per_match);
  const cpa = n(awayTeam.stats.corners) ?? n(awayTeam.stats.corners_per_match);
  if (cph !== null && cpa !== null) {
    pick(report, 'H', 'corners', cph); pick(report, 'A', 'corners', cpa);
    const cornersLambda = cph + cpa;
    let cdf = 0;
    for (let k = 0; k <= 9; k++) cdf += pois(cornersLambda, k);
    const pOver95Corners = 1 - cdf;
    candidates.push({ market: 'Over 9.5 Corners', cat: 'corners', prob: pOver95Corners, odd: odds.over_corners });
    candidates.push({ market: 'Under 9.5 Corners', cat: 'corners', prob: 1 - pOver95Corners, odd: odds.under_corners });
  } else {
    if (cph === null) report.missing.add('H.corners');
    if (cpa === null) report.missing.add('A.corners');
  }

  // Cards — only if BOTH teams have card data
  const cdh = n(homeTeam.stats.cards) ?? n(homeTeam.stats.cards_per_match);
  const cda = n(awayTeam.stats.cards) ?? n(awayTeam.stats.cards_per_match);
  if (cdh !== null && cda !== null) {
    pick(report, 'H', 'cards', cdh); pick(report, 'A', 'cards', cda);
    const cardsLambda = cdh + cda;
    let ccdf = 0;
    for (let k = 0; k <= 4; k++) ccdf += pois(cardsLambda, k);
    const pOver45Cards = 1 - ccdf;
    candidates.push({ market: 'Over 4.5 Cards', cat: 'cards', prob: pOver45Cards, odd: odds.over_cards });
    candidates.push({ market: 'Under 4.5 Cards', cat: 'cards', prob: 1 - pOver45Cards, odd: odds.under_cards });
  } else {
    if (cdh === null) report.missing.add('H.cards');
    if (cda === null) report.missing.add('A.cards');
  }

  // Data reliability: completeness across the canonical signal set
  const TRACKED = ['xg','xga','goals_scored','goals_conceded','possession','shots_on_target','corners','cards','dangerous_attacks','btts_pct','over25_pct'];
  const totalExpected = TRACKED.length * 2; // per team
  const usedCount = report.used.size;
  const completeness = Math.min(1, usedCount / totalExpected);
  const reliability: 'high'|'medium'|'low' =
    completeness >= 0.55 ? 'high' : completeness >= 0.30 ? 'medium' : 'low';
  const reliabilityPenalty = reliability === 'high' ? 0 : reliability === 'medium' ? 8 : 18;

  const variance = Math.min(1, Math.abs(lh - la) < 0.3 ? 0.7 : 0.4);
  const variancePlus = reliability === 'low' ? 0.25 : reliability === 'medium' ? 0.1 : 0;
  const finalVariance = Math.min(1, variance + variancePlus);
  const out: ValueBet[] = [];

  for (const c of candidates) {
    const odd = c.odd && c.odd > 1.01 ? c.odd : null;
    if (!odd) continue;
    const implied = 1 / odd;
    const wr = c.prob;
    const edge = (wr - implied) * 100;
    if (edge < opts.edgeMin) continue;
    const ev = wr * odd - 1;
    // Kelly
    const b = odd - 1;
    const kelly = Math.max(0, (b * wr - (1 - wr)) / b);
    const stakePct = Math.min(opts.maxStakePct, kelly * opts.kellyFraction);
    const rawConf = 40 + edge * 4 + (clash ? 5 : 0) - finalVariance * 10 - reliabilityPenalty;
    const conf = Math.round(Math.max(0, Math.min(100, rawConf)));
    // On low reliability, shrink stake further
    const reliabilityStakeMult = reliability === 'high' ? 1 : reliability === 'medium' ? 0.6 : 0.3;
    const finalStakePct = stakePct * reliabilityStakeMult;
    out.push({
      matchId: match.id,
      league: '',
      home: match.home,
      away: match.away,
      market: c.market,
      category: c.cat,
      odds: odd,
      impliedProb: implied,
      modelWR: wr,
      ev,
      edge,
      confidence: conf,
      sampleSize: Lh.signalsUsed + La.signalsUsed + report.used.size,
      risk: riskFromConfidence(conf, edge, reliability),
      variance: finalVariance,
      styleClash: clash,
      homeStyle: STYLE_LABEL[psH],
      awayStyle: STYLE_LABEL[psA],
      suggestedStakePct: finalStakePct,
      suggestedStakeLei: Math.round(finalStakePct * opts.bankroll),
      dataReliability: reliability,
      dataCompleteness: completeness,
      missingStats: Array.from(report.missing),
      usedStats: Array.from(report.used),
    });
  }

  // Best-value first per match
  out.sort((a, b) => b.edge - a.edge);
  return out;
}