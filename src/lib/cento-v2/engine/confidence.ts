// CENTO-V2
import type { MatchInputs, QualityBand } from './types';
import { clamp } from './smoothing';

export function smallSamplePenalty(H_mp: number | null, A_mp: number | null): number {
  const n = Math.min(H_mp ?? 0, A_mp ?? 0);
  if (n < 4) return 20;
  if (n < 7) return 10;
  if (n < 10) return 5;
  return 0;
}

export function missingCsvPenalty(inp: MatchInputs): number {
  let p = 0;
  if (!inp.hasLeague) p += 5;
  if (!inp.hasMatches) p += 5;
  if (!inp.hasTeams) p += 5;
  return Math.min(p, 15);
}

export interface ConfContext {
  spread: number;
  pBlend: number;
  pOdds: number | null;
  bracketBonus: number;
  quality: QualityBand;
}

export function confO25(ctx: ConfContext, inp: MatchInputs): number {
  let c = 60;
  c -= ctx.spread * 60;
  c -= smallSamplePenalty(inp.H_mp, inp.A_mp);
  c -= missingCsvPenalty(inp);

  const risk = inp.predictionRisk ?? 0;
  if (risk > 70) c -= 8;
  else if (risk > 55) c -= 4;

  if ((inp.suspendedMatches ?? 0) > 3) c -= 5;

  // Signal agreement bonus
  if (ctx.spread < 0.08) c += 10;
  else if (ctx.spread < 0.12) c += 6;
  else if (ctx.spread < 0.18) c += 3;

  // Odds alignment bonus
  if (ctx.pOdds != null) {
    const diff = Math.abs(ctx.pOdds - ctx.pBlend);
    if (diff < 0.07) c += 7;
    else if (diff < 0.12) c += 4;
  }

  c += ctx.bracketBonus; // ±0..6

  if (ctx.quality === 'Excellent') c += 4;
  else if (ctx.quality === 'Limited') c -= 8;

  return Math.round(clamp(c, 15, 92));
}