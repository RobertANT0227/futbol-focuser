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

function clamp01(v: number): number { return Math.max(0, Math.min(1, v)); }

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

  // League goal-timing buckets (for late_ratio).
  const lraw = leagueStats.raw ?? {};
  const bucket = (k: string): number => {
    const v = num(lraw[k]);
    return v ?? 0;
  };
  const timedBuckets = [
    'goals_min_0_to_10', 'goals_min_11_to_20', 'goals_min_21_to_30',
    'goals_min_31_to_40', 'goals_min_41_to_50', 'goals_min_51_to_60',
    'goals_min_61_to_70', 'goals_min_71_to_80', 'goals_min_81_to_90',
  ];
  const timedTotal = timedBuckets.reduce((s, k) => s + bucket(k), 0);
  const late_ratio_league = timedTotal > 0
    ? (bucket('goals_min_71_to_80') + bucket('goals_min_81_to_90')) / timedTotal
    : null;
  // share of league goals in first half (min 0-45)
  const firstHalfTotal = bucket('goals_min_0_to_10') + bucket('goals_min_11_to_20') +
    bucket('goals_min_21_to_30') + bucket('goals_min_31_to_40') + bucket('goals_min_41_to_50') * 0.5;
  const L_ht_share = timedTotal > 0 ? clamp01(firstHalfTotal / timedTotal) : null;

  const total_clubs = num(lraw['number_of_clubs']) ?? (ds.teams.length || null);

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

    // helpers — derive HT per-team avg goals from team's first-half % * GF/GA avg.
    const htAtt = (t: TeamProfile | undefined, gfAvg: number | null): number | null => {
      if (!t || gfAvg == null) return null;
      const p = t.scoringFirstHalfPct;
      return p != null ? gfAvg * (p / 100) : gfAvg * 0.42;
    };
    const htDef = (t: TeamProfile | undefined, gaAvg: number | null): number | null => {
      if (!t || gaAvg == null) return null;
      const p = t.concedingFirstHalfPct;
      return p != null ? gaAvg * (p / 100) : gaAvg * 0.42;
    };
    const rawM = (stats.raw ?? {}) as Record<string, unknown>;
    const homePpg = num(rawM['home_ppg'] ?? rawM['pre_match_teamA_overall_ppg']) ?? home?.ppg ?? null;
    const awayPpg = num(rawM['away_ppg'] ?? rawM['pre_match_teamB_overall_ppg']) ?? away?.ppg ?? null;

    const inputs: MatchInputs = {
      H_fts: ftsHome(home),
      A_fts: ftsAway(away),
      H_o25: home?.homeOver25Pct ?? home?.over25Pct ?? null,
      A_o25: away?.awayOver25Pct ?? away?.over25Pct ?? null,
      H_mp: home?.homePlayed ?? home?.matchesPlayed ?? null,
      A_mp: away?.awayPlayed ?? away?.matchesPlayed ?? null,
      M_o25: stats.preOver25Pct ?? null,
      L_o25,
      L_avg,
      predictionRisk,
      suspendedMatches: num((stats.raw ?? {})['suspended_matches']),
      oddsOver25: odds.oddsOver25 ?? null,
      oddsUnder25: odds.oddsUnder25 ?? null,
      hasLeague, hasMatches, hasTeams,
      // Layer 2 — xG inputs
      H_att: home?.homeGFAvg ?? null,
      H_def: home?.homeGAAvg ?? null,
      A_att: away?.awayGFAvg ?? null,
      A_def: away?.awayGAAvg ?? null,
      L_avg_h: leagueStats.homeGoalsAvg ?? null,
      L_avg_a: leagueStats.awayGoalsAvg ?? null,
      // Layer 4 — bracket
      M_o15: num(rawM['over_15_percentage_pre_match'] ?? rawM['over_15_potential']),
      M_o35: num(rawM['over_35_percentage_pre_match'] ?? rawM['over_35_potential']),
      // Layer 5 — HT
      H_ht_att: htAtt(home, home?.homeGFAvg ?? null),
      H_ht_def: htDef(home, home?.homeGAAvg ?? null),
      A_ht_att: htAtt(away, away?.awayGFAvg ?? null),
      A_ht_def: htDef(away, away?.awayGAAvg ?? null),
      L_ht_share,
      // Layer 6 — defense
      H_cs: home?.cleanSheetsPct ?? null,
      A_cs: away?.cleanSheetsPct ?? null,
      // Layer 7 — timing
      late_ratio: late_ratio_league,
      // Layer 8 — context
      home_ppg: homePpg,
      away_ppg: awayPpg,
      H_pos: home?.position ?? null,
      A_pos: away?.position ?? null,
      total_clubs,
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