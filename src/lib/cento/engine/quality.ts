import type { LeagueStats, ParsedMatch, TeamProfile } from '@/lib/cento/footystats/types';
import type { DataQuality } from './types';

/** Compute coverage/quality of data backing this match analysis. */
export function computeQuality(
  home: TeamProfile | undefined,
  away: TeamProfile | undefined,
  league: LeagueStats | undefined,
  match: ParsedMatch,
): DataQuality {
  const has = (v: unknown) => v !== null && v !== undefined;
  const checks: number[] = [];
  // league
  checks.push(has(league?.goalsPerMatch) ? 1 : 0);
  checks.push(has(league?.over25Pct) ? 1 : 0);
  checks.push(has(league?.bttsPct) ? 1 : 0);
  // teams basic
  for (const t of [home, away]) {
    checks.push(has(t?.matchesPlayed) ? 1 : 0);
    checks.push(has(t?.goalsFor) ? 1 : 0);
    checks.push(has(t?.goalsAgainst) ? 1 : 0);
    checks.push((t?.form && t.form.length >= 3) || has(t?.ppg) || has(t?.winPct) ? 1 : 0);
    checks.push(has(t?.over25Pct) ? 1 : 0);
    checks.push(has(t?.bttsPct) ? 1 : 0);
  }
  // odds
  checks.push(has(match.oddsHome) && has(match.oddsAway) ? 1 : 0);
  const coverage = checks.reduce((a, b) => a + b, 0) / checks.length;
  const sampleHome = home?.homePlayed ?? home?.matchesPlayed ?? 0;
  const sampleAway = away?.awayPlayed ?? away?.matchesPlayed ?? 0;
  const minSample = Math.min(sampleHome, sampleAway);
  const smallSamplePenalty = minSample < 3 ? 0.4 : minSample < 5 ? 0.2 : minSample < 8 ? 0.1 : 0;
  let band: DataQuality['band'] = 'Limited';
  if (coverage >= 0.85 && smallSamplePenalty < 0.15) band = 'Excellent';
  else if (coverage >= 0.6) band = 'Good';
  return { coverage, band, sampleHome, sampleAway, smallSamplePenalty };
}