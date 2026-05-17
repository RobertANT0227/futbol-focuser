import type { LeagueStats, ParsedMatch, TeamProfile } from '@/lib/cento/footystats/types';
import type { DataQuality } from './types';

/** Compute coverage/quality of data backing this match analysis. */
export function computeQuality(
  home: TeamProfile | undefined,
  away: TeamProfile | undefined,
  league: LeagueStats | undefined,
  match: ParsedMatch,
): DataQuality {
  const has = (v: unknown) => v !== null && v !== undefined && v !== '';
  // We weight the three CSV bundles the same way the UploadCenter coverage report does,
  // so that a 100% import surfaces as Excellent in fixtures (instead of Good).
  // Each bundle (league / home team / away team) contributes equally.
  const leagueChecks = league
    ? [has(league.goalsPerMatch), has(league.over25Pct), has(league.bttsPct), has(league.cornersPerMatch)]
    : [false, false, false, false];
  const teamChecks = (t: TeamProfile | undefined) => t ? [
    has(t.matchesPlayed),
    has(t.goalsFor) || has(t.homeGFAvg) || has(t.awayGFAvg),
    has(t.goalsAgainst) || has(t.homeGAAvg) || has(t.awayGAAvg),
    (t.form && t.form.length >= 3) || has(t.ppg) || has(t.winPct),
    has(t.over25Pct) || has(t.homeOver25Pct) || has(t.awayOver25Pct),
    has(t.bttsPct) || has(t.homeBttsPct) || has(t.awayBttsPct),
    has(t.cornersForAvg) || has(t.cornersForHome) || has(t.cornersForAway),
  ] : [false, false, false, false, false, false, false];
  const groups = [leagueChecks, teamChecks(home), teamChecks(away)];
  // average per-group coverage (so a missing per-match odds row never alone drops the band)
  const groupCov = groups.map((g) => g.reduce((a, b) => a + (b ? 1 : 0), 0) / g.length);
  let coverage = groupCov.reduce((a, b) => a + b, 0) / groupCov.length;
  // bonus when match-level odds exist (1X2)
  if (has(match.oddsHome) && has(match.oddsAway)) coverage = Math.min(1, coverage + 0.05);

  const sampleHome = home?.homePlayed ?? home?.matchesPlayed ?? 0;
  const sampleAway = away?.awayPlayed ?? away?.matchesPlayed ?? 0;
  const minSample = Math.min(sampleHome, sampleAway);
  const smallSamplePenalty = minSample < 3 ? 0.35 : minSample < 5 ? 0.18 : minSample < 8 ? 0.08 : 0;
  // Band reflects how much of the CSV bundle is actually present.
  // Sample-size only blocks Excellent when truly tiny (<3 games), it no longer
  // demotes a fully-imported league to Good.
  let band: DataQuality['band'] = 'Limited';
  if (coverage >= 0.85 && minSample >= 3) band = 'Excellent';
  else if (coverage >= 0.6) band = 'Good';
  return { coverage, band, sampleHome, sampleAway, smallSamplePenalty };
}