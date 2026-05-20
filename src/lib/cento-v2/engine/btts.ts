// CENTO-V2
import type { MatchInputs, SignalItem } from './types';
import { clamp } from './smoothing';

export interface BttsCalc {
  pBtts: number;        // 0-1 (capped 0.05–0.82)
  signals: SignalItem[];
  spread: number;       // dispersia semnalelor brute
  pIndependent: number; // 0-1
}

/** Pasul 1+2 din plan: BTTS YES. */
export function calcBtts(inp: MatchInputs): BttsCalc {
  const H = inp.H_btts != null ? inp.H_btts / 100 : null;
  const A = inp.A_btts != null ? inp.A_btts / 100 : null;
  const M = inp.M_btts != null ? inp.M_btts / 100 : null;
  const Hf = inp.H_fts != null ? inp.H_fts / 100 : 0.25; // fallback liga ~25%
  const Af = inp.A_fts != null ? inp.A_fts / 100 : 0.25;
  const pIndep = (1 - Hf) * (1 - Af);

  let p: number;
  const signals: SignalItem[] = [];
  if (H == null || A == null) {
    // fallback la independent + pre-match dacă lipsesc splits
    const m = M ?? 0.55;
    p = pIndep * 0.5 + m * 0.5;
    if (M != null) signals.push({ label: 'BTTS pre-meci', value: M, weight: 0.5, source: 'pre_match' });
    signals.push({ label: 'Scorare independentă', value: pIndep, weight: 0.5, source: 'derived' });
  } else if (M == null) {
    // redistribuie 0.40 / 0.40 / 0.20
    p = H * 0.4 + A * 0.4 + pIndep * 0.2;
    signals.push({ label: 'BTTS gazdă (split acasă)', value: H, weight: 0.4, source: 'home_team' });
    signals.push({ label: 'BTTS oaspete (split deplasare)', value: A, weight: 0.4, source: 'away_team' });
    signals.push({ label: 'Scorare independentă (FTS)', value: pIndep, weight: 0.2, source: 'derived' });
  } else {
    p = H * 0.3 + A * 0.3 + pIndep * 0.2 + M * 0.2;
    signals.push({ label: 'BTTS gazdă (split acasă)', value: H, weight: 0.3, source: 'home_team' });
    signals.push({ label: 'BTTS oaspete (split deplasare)', value: A, weight: 0.3, source: 'away_team' });
    signals.push({ label: 'Scorare independentă (FTS)', value: pIndep, weight: 0.2, source: 'derived' });
    signals.push({ label: 'BTTS pre-meci FootyStats', value: M, weight: 0.2, source: 'pre_match' });
  }

  // Cap dur BTTS 82%, plus clamp inferior
  p = clamp(p, 0.05, 0.82);

  // spread doar pe semnalele brute home/away/pre-match
  const raw = [H, A, M].filter((v): v is number => v != null);
  const spread = raw.length >= 2 ? Math.max(...raw) - Math.min(...raw) : 0;

  return { pBtts: p, signals, spread, pIndependent: pIndep };
}