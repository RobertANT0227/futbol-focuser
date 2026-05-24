// CENTO-V2
// Over/Under 2.5 — formula matematică profundă pe 8 straturi.
// Vezi notes/specul utilizatorului: BLEND(8 semnale) × MODIFIERS(4 factori).
import type { MatchInputs, SignalItem } from './types';
import { clamp } from './smoothing';

export interface O25Calc {
  pO25: number;
  pBlend: number;
  signals: SignalItem[];
  blendSignalValues: number[]; // semnale folosite pentru spread (în 0..1)
  spread: number;
  // modificatori multiplicativi expuși pentru explicații
  defenseFactor: number;
  timingFactor: number;
  contextFactor: number;
  independentAdjustment: 'penalty' | 'bonus' | 'none';
  pIndependent: number | null;
  // semnale auxiliare
  pXG: number | null;
  pOdds: number | null;
  pBracket: number | null;
  pHtProj: number | null;
  bracketBonus: number; // pentru confidence (+6/+3/0/-4)
}

function pct(v: number | null): number | null { return v == null ? null : v / 100; }

/** Layer 2 — synthetic xG. */
function calcXG(inp: MatchInputs): number | null {
  const { H_att, H_def, A_att, A_def, L_avg_h, L_avg_a } = inp;
  if (H_att == null || A_def == null || A_att == null || H_def == null) return null;
  let xgHome = (H_att + A_def) / 2;
  let xgAway = (A_att + H_def) / 2;
  // normalizare contextuală față de media ligii (păstrăm scala dar evităm extreme)
  if (L_avg_h && L_avg_h > 0) xgHome = (xgHome * 0.65) + (xgHome * (L_avg_h / Math.max(L_avg_h, 0.01)) * 0.35);
  if (L_avg_a && L_avg_a > 0) xgAway = (xgAway * 0.65) + (xgAway * (L_avg_a / Math.max(L_avg_a, 0.01)) * 0.35);
  const xgTotal = xgHome + xgAway;
  return clamp((xgTotal - 1.0) / 3.0, 0.05, 0.95);
}

/** Layer 3 — implied probability din cote, ajustată de marja bookmakerului. */
function calcPOdds(inp: MatchInputs): number | null {
  const o = inp.oddsOver25;
  const u = inp.oddsUnder25;
  if (!o || o <= 1) return null;
  const raw = 1 / o;
  if (u && u > 1) {
    const margin = (1 / o) + (1 / u) - 1;
    if (margin > 0) return clamp(raw - margin * raw, 0.05, 0.95);
  }
  return clamp(raw, 0.05, 0.95);
}

/** Layer 4 — bracket O1.5 / O3.5 cu validare logică. */
function calcBracket(inp: MatchInputs): { p: number | null; bonus: number } {
  let m15 = pct(inp.M_o15);
  let m35 = pct(inp.M_o35);
  const m25 = pct(inp.M_o25);
  if (m15 != null && m25 != null && m15 < m25) m15 = null; // inconsistent
  if (m35 != null && m25 != null && m35 > m25) m35 = null;
  if (m15 == null && m35 == null) return { p: null, bonus: 0 };
  if (m15 != null && m35 != null) {
    const p = m15 * 0.35 + m35 * 0.65;
    let bonus = 0;
    if (m15 > 0.80 && m35 > 0.38) bonus = 6;
    else if (m15 > 0.70 && m35 > 0.30) bonus = 3;
    if (m35 < 0.20) bonus = -4;
    return { p, bonus };
  }
  // semnal parțial — folosim singurul disponibil scalat
  if (m15 != null) return { p: clamp(m15 * 0.55, 0.05, 0.95), bonus: 0 };
  return { p: clamp((m35 ?? 0) * 1.4, 0.05, 0.95), bonus: 0 };
}

/** Layer 5 — proiecție FT din ADN-ul reprizei 1. */
function calcHtProj(inp: MatchInputs): number | null {
  const { H_ht_att, H_ht_def, A_ht_att, A_ht_def, L_ht_share } = inp;
  if (H_ht_att == null || H_ht_def == null || A_ht_att == null || A_ht_def == null) return null;
  const xgHt = (H_ht_att + A_ht_def) / 2 + (A_ht_att + H_ht_def) / 2;
  const share = L_ht_share && L_ht_share > 0.1 && L_ht_share < 0.9 ? L_ht_share : 0.42;
  const ftMult = 1 / share;
  const xgFt = Math.min(xgHt * ftMult, 5.0);
  return clamp((xgFt - 1.0) / 3.0, 0.05, 0.95);
}

export function calcO25(inp: MatchInputs): O25Calc {
  const H = pct(inp.H_o25);
  const A = pct(inp.A_o25);
  const M = pct(inp.M_o25);
  const L = pct(inp.L_o25);

  const pXG = calcXG(inp);
  const pOdds = calcPOdds(inp);
  const { p: pBracket, bonus: bracketBonus } = calcBracket(inp);
  const pHtProj = calcHtProj(inp);

  // Greutăți de bază
  const baseWeights: Record<string, number> = {
    H: 0.22, A: 0.22, xG: 0.18, odds: 0.15, M: 0.10, bracket: 0.07, ht: 0.04, L: 0.02,
  };
  const available: Record<string, number | null> = {
    H, A, xG: pXG, odds: pOdds, M, bracket: pBracket, ht: pHtProj, L,
  };

  // Distribuie greutățile lipsă proporțional pe semnalele disponibile.
  let totalAvailableWeight = 0;
  for (const k of Object.keys(baseWeights)) {
    if (available[k] != null) totalAvailableWeight += baseWeights[k];
  }
  if (totalAvailableWeight <= 0) {
    // fallback total — nu avem nimic
    return {
      pO25: 0.5, pBlend: 0.5, signals: [], blendSignalValues: [], spread: 0,
      defenseFactor: 1, timingFactor: 1, contextFactor: 1,
      independentAdjustment: 'none', pIndependent: null,
      pXG: null, pOdds: null, pBracket: null, pHtProj: null, bracketBonus: 0,
    };
  }
  const scale = 1 / totalAvailableWeight;

  const signals: SignalItem[] = [];
  const blendVals: number[] = [];
  let pBlend = 0;
  const push = (key: keyof typeof baseWeights, label: string, source: SignalItem['source']) => {
    const v = available[key];
    if (v == null) return;
    const w = baseWeights[key] * scale;
    pBlend += v * w;
    signals.push({ label, value: v, weight: w, source });
    if (key !== 'L') blendVals.push(v); // L = ancoră slabă, nu o folosim pentru spread
  };
  push('H', 'Over 2.5 gazdă (split acasă)', 'home_team');
  push('A', 'Over 2.5 oaspete (split deplasare)', 'away_team');
  push('xG', 'xG sintetic (atac vs apărare)', 'derived');
  push('odds', 'Probabilitate implicită din cote', 'derived');
  push('M', 'Over 2.5 pre-meci', 'pre_match');
  push('bracket', 'Bracket O1.5 + O3.5', 'pre_match');
  push('ht', 'Proiecție FT din repriza 1', 'derived');
  push('L', 'Baseline ligă Over 2.5', 'league');

  // ─── Modificatori multiplicativi ───
  // Layer 6 — defense
  let defenseFactor = 1;
  if (inp.H_cs != null) defenseFactor -= (inp.H_cs / 100) * 0.15;
  if (inp.A_cs != null) defenseFactor -= (inp.A_cs / 100) * 0.15;
  defenseFactor = clamp(defenseFactor, 0.70, 1.00);

  // Layer 7 — timing
  let timingFactor = 1;
  if (inp.late_ratio != null) {
    if (inp.late_ratio > 0.25) timingFactor = 1.04;
    else if (inp.late_ratio > 0.20) timingFactor = 1.02;
    else if (inp.late_ratio < 0.12) timingFactor = 0.97;
  }

  // Layer 8 — context
  let contextFactor = 1;
  if (inp.home_ppg != null && inp.away_ppg != null) {
    const ppgAvg = (inp.home_ppg + inp.away_ppg) / 2;
    let posDiff: number | null = null;
    if (inp.H_pos != null && inp.A_pos != null && inp.total_clubs && inp.total_clubs > 1) {
      posDiff = Math.abs(inp.H_pos - inp.A_pos) / inp.total_clubs;
    }
    if (ppgAvg > 2.0 && posDiff != null && posDiff < 0.20) contextFactor = 1.03;
    else if (ppgAvg < 1.2) contextFactor = 0.96;
    else if (posDiff != null && posDiff > 0.60) contextFactor = 0.97;
  }

  let p = pBlend * defenseFactor * timingFactor * contextFactor;

  // Ajustare internă fts (BTTS implicit)
  const Hf = pct(inp.H_fts);
  const Af = pct(inp.A_fts);
  let pIndep: number | null = null;
  let adj: 'penalty' | 'bonus' | 'none' = 'none';
  if (Hf != null && Af != null) {
    pIndep = (1 - Hf) * (1 - Af);
    if (pIndep < 0.40) { p *= 0.92; adj = 'penalty'; }
    else if (pIndep > 0.65) { p *= 1.05; adj = 'bonus'; }
  }

  p = clamp(p, 0.05, 0.95);

  const spread = blendVals.length >= 2 ? Math.max(...blendVals) - Math.min(...blendVals) : 0;

  return {
    pO25: p, pBlend, signals, blendSignalValues: blendVals, spread,
    defenseFactor, timingFactor, contextFactor,
    independentAdjustment: adj, pIndependent: pIndep,
    pXG, pOdds, pBracket, pHtProj, bracketBonus,
  };
}