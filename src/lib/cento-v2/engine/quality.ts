// CENTO-V2
import type { MatchInputs, QualityBand } from './types';

export function computeQuality(inp: MatchInputs): { band: QualityBand; coverage: number } {
  const h = inp.H_mp ?? 0;
  const a = inp.A_mp ?? 0;
  const allCsv = inp.hasLeague && inp.hasMatches && inp.hasTeams;
  let band: QualityBand = 'Limited';
  if (allCsv && h >= 10 && a >= 10) band = 'Excellent';
  else if (h >= 5 && a >= 5) band = 'Good';
  const cov = (Number(inp.hasLeague) + Number(inp.hasMatches) + Number(inp.hasTeams)) / 3;
  return { band, coverage: cov };
}