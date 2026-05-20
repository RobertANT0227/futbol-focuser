// CENTO-V2
import type { MatchInputs } from './types';
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

export function confBtts(spread: number, inp: MatchInputs): number {
  let c = 75 - spread * 60 - smallSamplePenalty(inp.H_mp, inp.A_mp) - missingCsvPenalty(inp);
  if ((inp.suspendedMatches ?? 0) > 2) c -= 5;
  if ((inp.predictionRisk ?? 0) > 70) c *= 0.9;
  return Math.round(clamp(c, 15, 92));
}

export function confO25(spread: number, inp: MatchInputs): number {
  let c = 75 - spread * 55 - smallSamplePenalty(inp.H_mp, inp.A_mp) - missingCsvPenalty(inp);
  if ((inp.suspendedMatches ?? 0) > 2) c -= 5;
  if ((inp.predictionRisk ?? 0) > 70) c *= 0.9;
  return Math.round(clamp(c, 15, 92));
}

/** Conflict BTTS YES↑ & UNDER25↑ → −5 ambele. */
export function conflictPenalty(pBtts: number, pO25: number): boolean {
  const pUnder = 1 - pO25;
  return pBtts >= 0.58 && pUnder >= 0.58;
}