// CENTO-V2
import type { LeagueStats, ParsedMatch, TeamProfile } from '@/lib/cento/footystats/types';
import type { SyncedLeague, SyncedMatch, SyncedTeam } from '@/lib/cento/persistence';
import { isoDateFromRaw } from '@/lib/cento/footystats/date';
import { matchTeam } from './engine/normalize';
import { analyzeMatch, type AnalyzeContext, type PowerAnalysis } from './engine';
import type { MatchInputs } from './engine/types';
import type { RatingInputs, LeagueAverages } from './engine/ratings';

function num(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace('%', '').replace(',', '.'));
  return Number.isFinite(n) && n !== -1 ? n : null;
}

/** FootyStats has fts split keys in raw payload; pick them if present. */
function ftsHome(t: TeamProfile | undefined): number | null {
  if (!t) return null;
  const r = t.raw ?? {};
  return num(r['fts_percentage_home'] ?? r['fail_to_score_percentage_home']) ?? num(t.ftsPct);
}
function ftsAway(t: TeamProfile | undefined): number | null {
  if (!t) return null;
  const r = t.raw ?? {};
  return num(r['fts_percentage_away'] ?? r['fail_to_score_percentage_away']) ?? num(t.ftsPct);
}

export interface LeagueDataset {
  league: SyncedLeague;
  matches: SyncedMatch[];
  teams: SyncedTeam[];
}

export interface AnalysisRow {
  league: SyncedLeague;
  analysis: PowerAnalysis;
}

export function buildAnalyses(ds: LeagueDataset): AnalysisRow[] {
  const leagueStats = (ds.league.league_stats ?? {}) as LeagueStats;
  const hasLeague = !!ds.league.has_league_stats;
  const hasTeams = !!ds.league.has_teams;
  const hasMatches = !!ds.league.has_matches;
  const teamNames = ds.teams.map((t) => t.name);

  const findTeam = (name: string): TeamProfile | undefined => {
    const direct = ds.teams.find((t) => t.name === name);
    if (direct) return direct.stats as TeamProfile;
    const fuzzy = matchTeam(name, teamNames);
    if (fuzzy) return ds.teams.find((t) => t.name === fuzzy)?.stats as TeamProfile;
    return undefined;
  };

  const L: LeagueAverages = {
    avgScoredHome: leagueStats.homeGoalsAvg ?? null,
    avgScoredAway: leagueStats.awayGoalsAvg ?? null,
    avgCorners: leagueStats.cornersPerMatch ?? null,
  };
  const L_o25 = leagueStats.over25Pct ?? null;
  const L_avg = leagueStats.goalsPerMatch ?? null;
  const predictionRisk = leagueStats.predictionRisk ?? null;

  const upcoming = ds.matches.filter((m) => {
    const s = (m.stats ?? {}) as { played?: boolean; raw?: Record<string, unknown> };
    const status = String(s.raw?.status ?? '').toLowerCase();
    if (status === 'incomplete' || status === 'scheduled' || status === 'postponed') return true;
    if (s.played === false) return true;
    if (s.played === true) return false;
    return true;
  });

  return upcoming.map((m): AnalysisRow => {
    const stats = (m.stats ?? {}) as ParsedMatch;
    const odds = (m.odds ?? {}) as Record<string, number | null>;
    const matchDate = isoDateFromRaw(stats.raw, m.match_date ?? stats.date, stats.timestamp);
    const home = findTeam(m.home);
    const away = findTeam(m.away);

    const inputs: MatchInputs = {
      H_btts: home?.homeBttsPct ?? home?.bttsPct ?? null,
      A_btts: away?.awayBttsPct ?? away?.bttsPct ?? null,
      H_fts: ftsHome(home),
      A_fts: ftsAway(away),
      H_o25: home?.homeOver25Pct ?? home?.over25Pct ?? null,
      A_o25: away?.awayOver25Pct ?? away?.over25Pct ?? null,
      H_mp: home?.homePlayed ?? home?.matchesPlayed ?? null,
      A_mp: away?.awayPlayed ?? away?.matchesPlayed ?? null,
      M_btts: stats.preBttsPct ?? null,
      M_o25: stats.preOver25Pct ?? null,
      L_o25,
      L_avg,
      predictionRisk,
      suspendedMatches: num((stats.raw ?? {})['suspended_matches']),
      oddsBttsYes: odds.oddsBttsYes ?? null,
      oddsBttsNo: odds.oddsBttsNo ?? null,
      oddsOver25: odds.oddsOver25 ?? null,
      oddsUnder25: odds.oddsUnder25 ?? null,
      hasLeague, hasMatches, hasTeams,
    };

    const homeRatingInputs: RatingInputs = {
      gf: home?.homeGFAvg ?? null,
      ga: home?.homeGAAvg ?? null,
      ppg: home?.ppg ?? null,
      corners: home?.cornersForHome ?? home?.cornersForAvg ?? null,
      predictionRisk,
    };
    const awayRatingInputs: RatingInputs = {
      gf: away?.awayGFAvg ?? null,
      ga: away?.awayGAAvg ?? null,
      ppg: away?.ppg ?? null,
      corners: away?.cornersForAway ?? away?.cornersForAvg ?? null,
      predictionRisk,
    };

    const ctx: AnalyzeContext = {
      matchId: m.id,
      home: m.home, away: m.away,
      leagueName: ds.league.name, season: ds.league.season,
      matchDate,
      inputs, homeRatingInputs, awayRatingInputs,
      leagueAverages: L,
    };
    return { league: ds.league, analysis: analyzeMatch(ctx) };
  });
}