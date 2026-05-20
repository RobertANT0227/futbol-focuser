// CENTO-V2
import type { MatchInputs, SignalItem } from './types';
import { clamp } from './smoothing';

export interface O25Calc {
  pO25: number;
  signals: SignalItem[];
  spread: number;
  bttsAdjustment: 'penalty' | 'bonus' | 'none';
}

export function calcO25(inp: MatchInputs, pBtts: number): O25Calc {
  const H = inp.H_o25 != null ? inp.H_o25 / 100 : null;
  const A = inp.A_o25 != null ? inp.A_o25 / 100 : null;
  const M = inp.M_o25 != null ? inp.M_o25 / 100 : null;
  const L = inp.L_o25 != null ? inp.L_o25 / 100 : null;

  let p: number;
  const signals: SignalItem[] = [];

  if (H == null || A == null) {
    // fallback minimal
    const m = M ?? L ?? 0.5;
    p = m;
    signals.push({ label: 'Over 2.5 fallback', value: m, weight: 1, source: M != null ? 'pre_match' : 'league' });
  } else if (M == null && L == null) {
    p = H * 0.5 + A * 0.5;
    signals.push({ label: 'Over 2.5 gazdă (split acasă)', value: H, weight: 0.5, source: 'home_team' });
    signals.push({ label: 'Over 2.5 oaspete (split deplasare)', value: A, weight: 0.5, source: 'away_team' });
  } else if (M == null) {
    // L disponibil, M nu
    p = H * 0.35 + A * 0.35 + (L ?? 0) * 0.3;
    signals.push({ label: 'Over 2.5 gazdă (split acasă)', value: H, weight: 0.35, source: 'home_team' });
    signals.push({ label: 'Over 2.5 oaspete (split deplasare)', value: A, weight: 0.35, source: 'away_team' });
    signals.push({ label: 'Over 2.5 media ligă', value: L!, weight: 0.3, source: 'league' });
  } else if (L == null) {
    // M disponibil, L nu — renormalizez fără L
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

  // Pasul 2 — cross-validare BTTS
  let adj: 'penalty' | 'bonus' | 'none' = 'none';
  if (pBtts < 0.40) { p *= 0.92; adj = 'penalty'; }
  else if (pBtts > 0.65) { p *= 1.05; adj = 'bonus'; }

  // Clamp + cap dur 0.85
  p = clamp(p, 0.05, 0.85);

  const raw = [H, A, M, L].filter((v): v is number => v != null);
  const spread = raw.length >= 2 ? Math.max(...raw) - Math.min(...raw) : 0;

  return { pO25: p, signals, spread, bttsAdjustment: adj };
}