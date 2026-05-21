// CENTO-V2
import type { MatchInputs, SignalItem } from './types';
import { clamp } from './smoothing';

export interface O25Calc {
  pO25: number;
  signals: SignalItem[];
  spread: number;
  independentAdjustment: 'penalty' | 'bonus' | 'none';
  pIndependent: number | null;
}

/**
 * Over 2.5 / Under 2.5 — single market focus.
 * Internally uses H_fts / A_fts to derive P_independent for cross-validation
 * (BTTS is never surfaced as a user-facing market).
 */
export function calcO25(inp: MatchInputs): O25Calc {
  const H = inp.H_o25 != null ? inp.H_o25 / 100 : null;
  const A = inp.A_o25 != null ? inp.A_o25 / 100 : null;
  const M = inp.M_o25 != null ? inp.M_o25 / 100 : null;
  const L = inp.L_o25 != null ? inp.L_o25 / 100 : null;

  let p: number;
  const signals: SignalItem[] = [];

  if (H == null || A == null) {
    const m = M ?? L ?? 0.5;
    p = m;
    signals.push({ label: 'Over 2.5 fallback', value: m, weight: 1, source: M != null ? 'pre_match' : 'league' });
  } else if (M == null && L == null) {
    p = H * 0.5 + A * 0.5;
    signals.push({ label: 'Over 2.5 gazdă (split acasă)', value: H, weight: 0.5, source: 'home_team' });
    signals.push({ label: 'Over 2.5 oaspete (split deplasare)', value: A, weight: 0.5, source: 'away_team' });
  } else if (M == null) {
    // M lipsește → redistribuie 0.35 / 0.35 / 0.30
    p = H * 0.35 + A * 0.35 + (L ?? 0) * 0.30;
    signals.push({ label: 'Over 2.5 gazdă (split acasă)', value: H, weight: 0.35, source: 'home_team' });
    signals.push({ label: 'Over 2.5 oaspete (split deplasare)', value: A, weight: 0.35, source: 'away_team' });
    signals.push({ label: 'Over 2.5 media ligă', value: L!, weight: 0.30, source: 'league' });
  } else if (L == null) {
    const w = 1 / (0.30 + 0.30 + 0.25);
    p = (H * 0.30 + A * 0.30 + M * 0.25) * w;
    signals.push({ label: 'Over 2.5 gazdă (split acasă)', value: H, weight: 0.30 * w, source: 'home_team' });
    signals.push({ label: 'Over 2.5 oaspete (split deplasare)', value: A, weight: 0.30 * w, source: 'away_team' });
    signals.push({ label: 'Over 2.5 pre-meci', value: M, weight: 0.25 * w, source: 'pre_match' });
  } else {
    p = H * 0.30 + A * 0.30 + M * 0.25 + L * 0.15;
    signals.push({ label: 'Over 2.5 gazdă (split acasă)', value: H, weight: 0.30, source: 'home_team' });
    signals.push({ label: 'Over 2.5 oaspete (split deplasare)', value: A, weight: 0.30, source: 'away_team' });
    signals.push({ label: 'Over 2.5 pre-meci', value: M, weight: 0.25, source: 'pre_match' });
    signals.push({ label: 'Over 2.5 media ligă', value: L, weight: 0.15, source: 'league' });
  }

  // Pasul 2 — ajustare internă din P_independent (BTTS implicit, nu se afișează)
  const Hf = inp.H_fts != null ? inp.H_fts / 100 : null;
  const Af = inp.A_fts != null ? inp.A_fts / 100 : null;
  let pIndep: number | null = null;
  let adj: 'penalty' | 'bonus' | 'none' = 'none';
  if (Hf != null && Af != null) {
    pIndep = (1 - Hf) * (1 - Af);
    if (pIndep < 0.40) { p *= 0.92; adj = 'penalty'; }
    else if (pIndep > 0.65) { p *= 1.05; adj = 'bonus'; }
  }

  // Pasul 3 — clamp 0.05–0.95
  p = clamp(p, 0.05, 0.95);

  const raw = [H, A, M, L].filter((v): v is number => v != null);
  const spread = raw.length >= 2 ? Math.max(...raw) - Math.min(...raw) : 0;

  return { pO25: p, signals, spread, independentAdjustment: adj, pIndependent: pIndep };
}