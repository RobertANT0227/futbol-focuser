// CENTO-V2
/** Bayesian smoothing toward league average for small samples (<8). */
export function smoothPct(
  teamPct: number | null,
  sample: number | null,
  leagueAvgPct: number | null,
  k = 5,
): number | null {
  if (teamPct == null) return null;
  const n = sample ?? 0;
  if (n >= 8 || leagueAvgPct == null) return teamPct;
  return (teamPct * n + leagueAvgPct * k) / (n + k);
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}