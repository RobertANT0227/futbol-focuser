import { supabase } from '@/integrations/supabase/client';
import type { ParsedLeagueBundle } from './footystats/types';

export interface SyncedLeague {
  id: string;
  name: string;
  country: string | null;
  season: string;
  normalized_name: string;
  has_league_stats: boolean;
  has_matches: boolean;
  has_teams: boolean;
  matches_count: number;
  teams_count: number;
  league_stats: any;
  coverage: any;
  updated_at: string;
}

export interface SyncedMatch {
  id: string;
  league_id: string;
  home: string;
  away: string;
  match_date: string | null;
  season: string;
  odds: any;
  stats: any;
}

export interface SyncedTeam {
  id: string;
  league_id: string;
  name: string;
  stats: any;
  playstyle: string | null;
  tags: string[] | null;
}

/** Upsert a league + its matches + teams. Never deletes other leagues. */
export async function persistBundle(bundle: ParsedLeagueBundle, userId: string): Promise<{ leagueId: string; rowsImported: number; duplicates: number; }> {
  const { meta } = bundle;

  // 1) upsert league row
  const { data: existing } = await supabase
    .from('cp_leagues')
    .select('id, league_stats, has_league_stats, has_matches, has_teams, matches_count, teams_count, coverage')
    .eq('owner_id', userId)
    .eq('normalized_name', meta.normalizedKey)
    .eq('season', meta.season)
    .maybeSingle();

  let leagueId = existing?.id ?? '';
  const prevStats = (existing?.league_stats && typeof existing.league_stats === 'object') ? existing.league_stats as Record<string, unknown> : {};
  const leagueStatsPayload: any = bundle.league
    ? { ...prevStats, ...bundle.league }
    : prevStats;

  if (!existing) {
    const insertPayload: any = {
      owner_id: userId,
      name: meta.leagueName,
      country: meta.country,
      season: meta.season,
      normalized_name: meta.normalizedKey,
      league_stats: leagueStatsPayload,
      has_league_stats: !!bundle.league,
      has_matches: !!bundle.matches?.length,
      has_teams: !!bundle.teams?.length,
      matches_count: 0,
      teams_count: 0,
      coverage: {},
    };
    const { data, error } = await supabase
      .from('cp_leagues')
      .insert(insertPayload)
      .select('id')
      .single();
    if (error) throw error;
    leagueId = data.id;
  } else {
    const { error } = await supabase
      .from('cp_leagues')
      .update({
        name: meta.leagueName,
        country: meta.country,
        league_stats: leagueStatsPayload as any,
        has_league_stats: existing.has_league_stats || !!bundle.league,
      })
      .eq('id', leagueId);
    if (error) throw error;
  }

  let rowsImported = 0, duplicates = 0;

  // 2) matches (insert new only — dedupe on home/away/date within 24h)
  if (bundle.matches?.length) {
    const { data: existingMatches } = await supabase
      .from('cp_matches')
      .select('id, home, away, match_date')
      .eq('league_id', leagueId);
    const seen = new Set((existingMatches ?? []).map((m) => `${normName(m.home)}|${normName(m.away)}|${m.match_date ?? ''}`));
    const toInsert = bundle.matches
      .filter((m) => {
        const key = `${normName(m.home)}|${normName(m.away)}|${m.date ?? ''}`;
        if (seen.has(key)) { duplicates++; return false; }
        seen.add(key);
        return true;
      })
      .map((m): any => ({
        owner_id: userId,
        league_id: leagueId,
        home: m.home,
        away: m.away,
        match_date: m.date,
        season: meta.season,
        odds: {
          oddsHome: m.oddsHome, oddsDraw: m.oddsDraw, oddsAway: m.oddsAway,
          oddsBttsYes: m.oddsBttsYes, oddsBttsNo: m.oddsBttsNo,
          oddsOver25: m.oddsOver25, oddsUnder25: m.oddsUnder25,
        },
        stats: m,
      }));
    if (toInsert.length) {
      const { error } = await supabase.from('cp_matches').insert(toInsert);
      if (error) throw error;
      rowsImported += toInsert.length;
    }
    await supabase
      .from('cp_leagues')
      .update({ matches_count: (existingMatches?.length ?? 0) + toInsert.length, has_matches: true })
      .eq('id', leagueId);
  }

  // 3) teams (upsert per name)
  if (bundle.teams?.length) {
    const { data: existingTeams } = await supabase
      .from('cp_teams')
      .select('id, name')
      .eq('league_id', leagueId);
    const byName = new Map((existingTeams ?? []).map((t) => [normName(t.name), t.id]));
    const inserts: any[] = [];
    const updates: { id: string; stats: any }[] = [];
    for (const t of bundle.teams) {
      const id = byName.get(normName(t.name));
      if (id) updates.push({ id, stats: t });
      else inserts.push({ owner_id: userId, league_id: leagueId, name: t.name, stats: t, tags: [] });
    }
    if (inserts.length) {
      const { error } = await supabase.from('cp_teams').insert(inserts);
      if (error) throw error;
    }
    for (const u of updates) {
      await supabase.from('cp_teams').update({ stats: u.stats as any }).eq('id', u.id);
    }
    await supabase
      .from('cp_leagues')
      .update({ teams_count: (existingTeams?.length ?? 0) + inserts.length, has_teams: true })
      .eq('id', leagueId);
    rowsImported += inserts.length + updates.length;
  }

  // 4) audit
  await supabase.from('cp_imports').insert({
    owner_id: userId,
    league_id: leagueId,
    league_name: meta.leagueName,
    season: meta.season,
    file_type: bundle.matches ? 'matches' : bundle.teams ? 'teams' : 'league',
    file_name: 'bundle',
    rows_imported: rowsImported,
    duplicates,
  });

  return { leagueId, rowsImported, duplicates };
}

function normName(n: string) {
  return n.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
}

export async function listLeagues(userId: string): Promise<SyncedLeague[]> {
  const { data, error } = await supabase
    .from('cp_leagues')
    .select('*')
    .eq('owner_id', userId)
    .order('country', { ascending: true })
    .order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as SyncedLeague[];
}

export async function getLeagueData(leagueId: string): Promise<{
  matches: SyncedMatch[];
  teams: SyncedTeam[];
}> {
  const [m, t] = await Promise.all([
    supabase.from('cp_matches').select('*').eq('league_id', leagueId).order('match_date', { ascending: true }),
    supabase.from('cp_teams').select('*').eq('league_id', leagueId).order('name', { ascending: true }),
  ]);
  if (m.error) throw m.error;
  if (t.error) throw t.error;
  return {
    matches: (m.data ?? []) as unknown as SyncedMatch[],
    teams: (t.data ?? []) as unknown as SyncedTeam[],
  };
}

export async function deleteLeague(leagueId: string) {
  await supabase.from('cp_matches').delete().eq('league_id', leagueId);
  await supabase.from('cp_teams').delete().eq('league_id', leagueId);
  await supabase.from('cp_leagues').delete().eq('id', leagueId);
}