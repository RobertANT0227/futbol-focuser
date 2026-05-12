import Papa from 'papaparse';
import { supabase } from '@/integrations/supabase/client';
import { autoMapColumns, COLUMN_ALIASES } from '@/lib/csvScanner';
import { detectPlaystyle, STYLE_LABEL } from './playstyle';
import type { CpFileType, CpImportResult, CpTeamStats } from './types';
import type { Database, Json } from '@/integrations/supabase/types';

type LeagueInsert = Database['public']['Tables']['cp_leagues']['Insert'];
type LeagueUpdate = Database['public']['Tables']['cp_leagues']['Update'];
type TeamInsert = Database['public']['Tables']['cp_teams']['Insert'];
type MatchInsert = Database['public']['Tables']['cp_matches']['Insert'];

const EXTRA_ALIASES: Record<string, string[]> = {
  team: ['team_name', 'team name', 'squad_name', 'club_name', 'common_name'],
  home: ['team_a_name', 'team a name', 'home_team_name', 'home team name', 'home_name'],
  away: ['team_b_name', 'team b name', 'away_team_name', 'away team name', 'away_name'],
  league: ['league_name', 'competition_name', 'competition', 'division', 'country league'],
  country: ['country', 'country_name', 'nation'],
  season: ['season', 'sezon', 'season_name', 'year', 'campaign'],
  match_date: ['date', 'data', 'match date', 'kickoff', 'kickoff_date', 'date_gmt'],
  shots_off: ['shots off target', 'shots_off_target', 'shots off', 'so', 'sh off'],
  btts_pct: ['btts%', 'btts %', 'both teams to score %', 'btts_percentage', 'btts percentage'],
  over25_pct: ['over 2.5 %', 'o2.5 %', 'over25%', 'over 2.5%', 'over_25_percentage'],
  under25_pct: ['under 2.5 %', 'u2.5 %', 'under25%', 'under_25_percentage'],
  ppg: ['ppg', 'points_per_game', 'points per game', 'puncte/meci'],
  goals_first_half: ['1h goals', 'first half goals', 'goals_1h', 'ht_goals', 'goluri repriza 1', 'gh1'],
  goals_second_half: ['2h goals', 'second half goals', 'goals_2h', 'goluri repriza 2', 'gh2'],
  goals_scored_home: ['gf home', 'goals_scored_home', 'goluri marcate acasa', 'home goals'],
  goals_scored_away: ['gf away', 'goals_scored_away', 'goluri marcate deplasare', 'away goals'],
  goals_conceded_home: ['ga home', 'goals_conceded_home', 'goluri primite acasa'],
  goals_conceded_away: ['ga away', 'goals_conceded_away', 'goluri primite deplasare'],
  average_goals_per_match: ['average_goals_per_match', 'avg goals per match', 'goals per match', 'league goals per match'],
  total_matches: ['total_matches', 'total matches', 'matches total'],
  number_of_clubs: ['number_of_clubs', 'number of clubs', 'clubs', 'teams in league'],
  home_advantage: ['home_advantage', 'home advantage'],
  prediction_risk: ['prediction_risk', 'prediction risk'],
  odds_home: ['odds_ft_home_team_win', 'odds home', 'home odds', '1', 'cota 1', 'odd1'],
  odds_draw: ['odds_ft_draw', 'odds draw', 'draw odds', 'x', 'cota x', 'oddx'],
  odds_away: ['odds_ft_away_team_win', 'odds away', 'away odds', '2', 'cota 2', 'odd2'],
  odds_over25: ['odds_ft_over25', 'odds over 2.5', 'over 2.5 odds', 'o2.5'],
  odds_under25: ['odds_ft_under25', 'odds under 2.5', 'under 2.5 odds', 'u2.5'],
  odds_btts_yes: ['odds_btts_yes', 'btts yes odds', 'btts yes'],
  odds_btts_no: ['odds_btts_no', 'btts no odds', 'btts no'],
  total_goal_count: ['total_goal_count', 'total goals', 'goals total'],
  attendance: ['attendance', 'spectators'],
};
for (const [k, v] of Object.entries(EXTRA_ALIASES)) {
  COLUMN_ALIASES[k] = Array.from(new Set([...(COLUMN_ALIASES[k] || []), ...v]));
}

const REQUIRED_SIGNALS = ['xg', 'xga', 'possession', 'shots', 'shots_on_target', 'corners', 'cards', 'btts_pct', 'over25_pct', 'ppg'];

const normalizeHeader = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim();

export const normalizeLeagueName = (s: string) =>
  normalizeHeader(s)
    .replace(/\s*\([0-9]+\)\s*/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const toTitle = (s: string) => normalizeHeader(s).replace(/\b\w/g, (c) => c.toUpperCase());

const num = (v: unknown): number | undefined => {
  if (v === null || v === undefined || v === '') return undefined;
  const s = String(v).trim().replace('%', '').replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : undefined;
};

const cleanString = (v: unknown) => String(v ?? '').trim();
const firstValue = (rows: Record<string, unknown>[], key?: string) => {
  if (!key) return undefined;
  const hit = rows.find((r) => cleanString(r[key]));
  return hit ? cleanString(hit[key]) : undefined;
};

function hasHeader(headers: string[], aliases: string[]) {
  const nh = headers.map(normalizeHeader);
  const na = aliases.map(normalizeHeader);
  return na.some((a) => nh.includes(a));
}

export function detectFileType(headers: string[], _rowCount: number, map: Record<string, string>): CpFileType {
  const has = (k: string) => Boolean(map[k]);
  const matchScore = Number(has('home')) + Number(has('away')) + Number(has('odds_home')) + Number(has('total_goal_count')) + Number(has('match_date'));
  const teamScore = Number(has('team')) + Number(has('matches_played')) + Number(has('ppg')) + Number(has('goals_scored')) + Number(has('goals_conceded'));
  const leagueScore = Number(has('average_goals_per_match')) + Number(has('total_matches')) + Number(has('number_of_clubs')) + Number(has('prediction_risk'));

  if (matchScore >= 2 && has('home') && has('away')) return 'match';
  if (leagueScore >= 2 && !has('home') && !has('away')) return 'league';
  if (teamScore >= 3 && has('team')) return 'team';
  if (hasHeader(headers, ['team_a_name']) && hasHeader(headers, ['team_b_name'])) return 'match';
  if (hasHeader(headers, ['average_goals_per_match']) && hasHeader(headers, ['total_matches'])) return 'league';
  return 'unknown';
}

function extractSeason(rows: Record<string, unknown>[], map: Record<string, string>, leagueName?: string): string | undefined {
  const direct = firstValue(rows, map.season);
  const pool = [direct, leagueName, ...rows.slice(0, 20).flatMap((r) => Object.values(r).map((v) => String(v ?? '')))];
  for (const value of pool) {
    if (!value) continue;
    const full = value.match(/(20\d{2})\s*(?:\/|-|to|–|—)\s*(20\d{2})/i);
    if (full) return `${full[1]}/${full[2]}`;
    const short = value.match(/(20\d{2})\s*(?:\/|-)\s*(\d{2})/);
    if (short) return `${short[1]}/20${short[2]}`;
  }
  const dates = rows.map((r) => parseDate(map.match_date ? cleanString(r[map.match_date]) : '')).filter(Boolean) as string[];
  if (dates.length) {
    const years = Array.from(new Set(dates.map((d) => Number(d.slice(0, 4))))).sort();
    if (years.length > 1) return `${years[0]}/${years[years.length - 1]}`;
    return `${years[0]}/${years[0] + 1}`;
  }
  return undefined;
}

function stripSeasonFromLeague(name: string) {
  return name
    .replace(/\s*\([0-9]+\)\s*/g, ' ')
    .replace(/20\d{2}\s*(?:\/|-|to|–|—)\s*(?:20)?\d{2}/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractIdentity(rows: Record<string, unknown>[], map: Record<string, string>) {
  const rawLeague = firstValue(rows, map.league);
  const country = firstValue(rows, map.country);
  const season = extractSeason(rows, map, rawLeague);
  let leagueName = stripSeasonFromLeague(rawLeague || '');
  if (leagueName && country && !normalizeLeagueName(leagueName).startsWith(normalizeLeagueName(country))) {
    leagueName = `${country} ${leagueName}`;
  }
  return {
    leagueName: leagueName ? toTitle(leagueName) : undefined,
    normalizedLeagueName: leagueName ? normalizeLeagueName(leagueName) : undefined,
    season,
    country: country ? toTitle(country) : undefined,
  };
}

function coverageFor(map: Record<string, string>) {
  const available = REQUIRED_SIGNALS.filter((key) => Boolean(map[key]));
  return { score: Math.round((available.length / REQUIRED_SIGNALS.length) * 100), missing: REQUIRED_SIGNALS.filter((key) => !map[key]), available };
}

export interface ParsedLeagueCsv {
  file: File;
  headers: string[];
  rows: Record<string, unknown>[];
  map: Record<string, string>;
  detectedType: CpFileType;
  detectedLeague?: string;
  normalizedLeagueName?: string;
  detectedSeason?: string;
  detectedCountry?: string;
  rowCount: number;
  missingColumns: string[];
  coverageScore: number;
}

export interface LeagueImportPackage {
  key: string;
  leagueName: string;
  normalizedLeagueName: string;
  season: string;
  country?: string;
  entries: ParsedLeagueCsv[];
  importStatus: { hasLeagueStats: boolean; hasMatches: boolean; hasTeams: boolean };
  stats: { matchesCount: number; teamsCount: number };
  coverage: { leagueData: number; matchData: number; teamData: number; overall: number };
}

export async function peekCsv(file: File): Promise<ParsedLeagueCsv> {
  const text = await file.text();
  const res = Papa.parse<Record<string, unknown>>(text, { header: true, skipEmptyLines: true, dynamicTyping: false });
  const rows = (res.data || []).filter((r) => Object.values(r).some((v) => v !== '' && v != null));
  const headers = res.meta.fields || [];
  const map = autoMapColumns(headers);
  const detectedType = detectFileType(headers, rows.length, map);
  const identity = extractIdentity(rows, map);
  const coverage = coverageFor(map);
  return { file, headers, rows, map, detectedType, detectedLeague: identity.leagueName, normalizedLeagueName: identity.normalizedLeagueName, detectedSeason: identity.season, detectedCountry: identity.country, rowCount: rows.length, missingColumns: coverage.missing, coverageScore: coverage.score };
}

export function groupBundles(peeked: ParsedLeagueCsv[]): LeagueImportPackage[] {
  const resolved = [...peeked];
  const identities = resolved.filter((p) => p.normalizedLeagueName && p.detectedSeason);
  const uniqueIdentities = Array.from(new Map(identities.map((p) => [`${p.normalizedLeagueName}::${p.detectedSeason}`, p])).values());

  if (uniqueIdentities.length === 1) {
    const base = uniqueIdentities[0];
    for (const p of resolved) {
      if (!p.normalizedLeagueName) {
        p.detectedLeague = base.detectedLeague;
        p.normalizedLeagueName = base.normalizedLeagueName;
        p.detectedCountry = base.detectedCountry;
      }
      if (!p.detectedSeason) p.detectedSeason = base.detectedSeason;
    }
  }

  const map = new Map<string, LeagueImportPackage>();
  for (const p of resolved) {
    if (!p.normalizedLeagueName || !p.detectedLeague || !p.detectedSeason) continue;
    const key = `${p.normalizedLeagueName}::${p.detectedSeason}`;
    if (!map.has(key)) {
      map.set(key, {
        key,
        leagueName: p.detectedLeague,
        normalizedLeagueName: p.normalizedLeagueName,
        season: p.detectedSeason,
        country: p.detectedCountry,
        entries: [],
        importStatus: { hasLeagueStats: false, hasMatches: false, hasTeams: false },
        stats: { matchesCount: 0, teamsCount: 0 },
        coverage: { leagueData: 0, matchData: 0, teamData: 0, overall: 0 },
      });
    }
    const b = map.get(key)!;
    b.entries.push(p);
    if (p.detectedType === 'league') b.importStatus.hasLeagueStats = true;
    if (p.detectedType === 'match') { b.importStatus.hasMatches = true; b.stats.matchesCount += p.rowCount; }
    if (p.detectedType === 'team') { b.importStatus.hasTeams = true; b.stats.teamsCount += p.rowCount; }
  }

  return Array.from(map.values()).map((b) => {
    const leagueCov = avgCoverage(b.entries.filter((e) => e.detectedType === 'league'));
    const matchCov = avgCoverage(b.entries.filter((e) => e.detectedType === 'match'));
    const teamCov = avgCoverage(b.entries.filter((e) => e.detectedType === 'team'));
    const active = [leagueCov, matchCov, teamCov].filter((v) => v > 0);
    b.coverage = { leagueData: leagueCov, matchData: matchCov, teamData: teamCov, overall: active.length ? Math.round(active.reduce((a, v) => a + v, 0) / active.length) : 0 };
    return b;
  });
}

const avgCoverage = (items: ParsedLeagueCsv[]) => items.length ? Math.round(items.reduce((a, i) => a + i.coverageScore, 0) / items.length) : 0;

export interface ImportContext { ownerId: string }

export async function importLeaguePackage(bundle: LeagueImportPackage, ctx: ImportContext): Promise<CpImportResult> {
  const existing = await findExistingLeague(ctx.ownerId, bundle.normalizedLeagueName, bundle.season);
  const leagueStats = buildLeagueStats(bundle.entries.filter((e) => e.detectedType === 'league'));
  const flags = {
    hasLeagueStats: Boolean(existing?.has_league_stats) || bundle.importStatus.hasLeagueStats,
    hasMatches: Boolean(existing?.has_matches) || bundle.importStatus.hasMatches,
    hasTeams: Boolean(existing?.has_teams) || bundle.importStatus.hasTeams,
  };

  const leaguePayload: LeagueInsert = {
    owner_id: ctx.ownerId,
    name: bundle.leagueName,
    normalized_name: bundle.normalizedLeagueName,
    country: bundle.country || existing?.country || null,
    season: bundle.season,
    has_league_stats: flags.hasLeagueStats,
    has_matches: flags.hasMatches,
    has_teams: flags.hasTeams,
    league_stats: (Object.keys(leagueStats).length ? leagueStats : existing?.league_stats || {}) as Json,
    coverage: bundle.coverage as unknown as Json,
  };

  const { data: leagueRow, error: leagueErr } = await supabase
    .from('cp_leagues')
    .upsert(leaguePayload, { onConflict: 'owner_id,normalized_name,season' })
    .select()
    .single();
  if (leagueErr || !leagueRow) throw new Error(leagueErr?.message || 'League merge failed');

  const [teamRows, matchRows] = await Promise.all([
    importTeams(bundle.entries.filter((e) => e.detectedType === 'team'), leagueRow.id, ctx.ownerId),
    importMatches(bundle.entries.filter((e) => e.detectedType === 'match'), leagueRow.id, ctx.ownerId, bundle.season),
  ]);

  const [{ count: matchesCount }, { count: teamsCount }] = await Promise.all([
    supabase.from('cp_matches').select('id', { count: 'exact', head: true }).eq('league_id', leagueRow.id),
    supabase.from('cp_teams').select('id', { count: 'exact', head: true }).eq('league_id', leagueRow.id),
  ]);

  const coverage = {
    ...bundle.coverage,
    leagueData: flags.hasLeagueStats ? Math.max(bundle.coverage.leagueData, Number((existing?.coverage as Record<string, unknown> | null)?.leagueData || 0)) : 0,
    matchData: (matchesCount || 0) > 0 ? Math.max(bundle.coverage.matchData, Number((existing?.coverage as Record<string, unknown> | null)?.matchData || 0)) : 0,
    teamData: (teamsCount || 0) > 0 ? Math.max(bundle.coverage.teamData, Number((existing?.coverage as Record<string, unknown> | null)?.teamData || 0)) : 0,
  };
  coverage.overall = Math.round(([coverage.leagueData, coverage.matchData, coverage.teamData].filter((v) => v > 0).reduce((a, v) => a + v, 0) || 0) / Math.max(1, [coverage.leagueData, coverage.matchData, coverage.teamData].filter((v) => v > 0).length));

  const updatePayload: LeagueUpdate = {
    has_league_stats: flags.hasLeagueStats,
    has_matches: (matchesCount || 0) > 0,
    has_teams: (teamsCount || 0) > 0,
    matches_count: matchesCount || 0,
    teams_count: teamsCount || 0,
    coverage: coverage as unknown as Json,
  };
  const { error: updateErr } = await supabase.from('cp_leagues').update(updatePayload).eq('id', leagueRow.id);
  if (updateErr) throw new Error(updateErr.message);

  await supabase.from('cp_imports').insert({
    owner_id: ctx.ownerId,
    league_id: leagueRow.id,
    league_name: bundle.leagueName,
    season: bundle.season,
    file_type: 'league_package',
    file_name: `${bundle.leagueName} ${bundle.season}`,
    rows_imported: teamRows + matchRows + (bundle.importStatus.hasLeagueStats ? 1 : 0),
    duplicates: 0,
  });

  const diagnostic = {
    DetectedCSVType: bundle.entries.map((e) => e.detectedType),
    NormalizedLeague: bundle.normalizedLeagueName,
    DetectedSeason: bundle.season,
    MergedIntoExisting: Boolean(existing),
    CreatedNewLeague: !existing,
    ColumnsMissing: Array.from(new Set(bundle.entries.flatMap((e) => e.missingColumns))),
    CoverageScore: coverage.overall,
  };
  console.groupCollapsed(`[Cento Import] ${bundle.leagueName} · ${bundle.season}`);
  console.table(diagnostic);
  console.groupEnd();

  return {
    league: bundle.leagueName,
    season: bundle.season,
    fileType: 'league',
    rowsImported: teamRows + matchRows,
    duplicates: 0,
    fileName: `${bundle.leagueName} ${bundle.season}`,
    leagueId: leagueRow.id,
    normalizedLeagueName: bundle.normalizedLeagueName,
    importStatus: { hasLeagueStats: flags.hasLeagueStats, hasMatches: (matchesCount || 0) > 0, hasTeams: (teamsCount || 0) > 0 },
    stats: { matchesCount: matchesCount || 0, teamsCount: teamsCount || 0 },
    coverage,
  };
}

async function findExistingLeague(ownerId: string, normalizedName: string, season: string) {
  const { data, error } = await supabase
    .from('cp_leagues')
    .select('*')
    .eq('owner_id', ownerId)
    .eq('normalized_name', normalizedName)
    .eq('season', season)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

function buildLeagueStats(entries: ParsedLeagueCsv[]) {
  const stats: Record<string, Json> = {};
  for (const entry of entries) {
    entry.rows.forEach((row, idx) => {
      const rowStats = statsFromRow(row, entry.map, ['league', 'country', 'season']);
      Object.entries(rowStats).forEach(([key, value]) => {
        stats[idx === 0 ? key : `row_${idx + 1}_${key}`] = value as Json;
      });
    });
  }
  return stats;
}

async function importTeams(entries: ParsedLeagueCsv[], leagueId: string, ownerId: string) {
  const teams = entries.flatMap((entry) => entry.rows.map((row) => {
    const name = cleanString(entry.map.team ? row[entry.map.team] : '');
    if (!name) return null;
    const stats = statsFromRow(row, entry.map, ['team', 'league', 'country', 'season']) as CpTeamStats;
    const ps = detectPlaystyle(stats);
    return { owner_id: ownerId, league_id: leagueId, name, playstyle: STYLE_LABEL[ps.primary], tags: ps.tags, stats: stats as unknown as Json } satisfies TeamInsert;
  }).filter(Boolean)) as TeamInsert[];
  if (!teams.length) return 0;
  const { error } = await supabase.from('cp_teams').upsert(teams, { onConflict: 'league_id,name' });
  if (error) throw new Error(error.message);
  return teams.length;
}

async function importMatches(entries: ParsedLeagueCsv[], leagueId: string, ownerId: string, season: string) {
  const matches = entries.flatMap((entry) => entry.rows.map((row) => {
    const home = cleanString(entry.map.home ? row[entry.map.home] : '');
    const away = cleanString(entry.map.away ? row[entry.map.away] : '');
    if (!home || !away) return null;
    const match_date = parseDate(entry.map.match_date ? cleanString(row[entry.map.match_date]) : '');
    const stats = statsFromRow(row, entry.map, ['home', 'away', 'match_date', 'league', 'country', 'season', 'odds_home', 'odds_draw', 'odds_away', 'odds_over25', 'odds_under25', 'odds_btts_yes', 'odds_btts_no']);
    const odds = {
      home: num(entry.map.odds_home ? row[entry.map.odds_home] : undefined),
      draw: num(entry.map.odds_draw ? row[entry.map.odds_draw] : undefined),
      away: num(entry.map.odds_away ? row[entry.map.odds_away] : undefined),
      over25: num(entry.map.odds_over25 ? row[entry.map.odds_over25] : undefined),
      under25: num(entry.map.odds_under25 ? row[entry.map.odds_under25] : undefined),
      btts_yes: num(entry.map.odds_btts_yes ? row[entry.map.odds_btts_yes] : undefined),
      btts_no: num(entry.map.odds_btts_no ? row[entry.map.odds_btts_no] : undefined),
    };
    return { owner_id: ownerId, league_id: leagueId, season, match_date, home, away, stats: stats as unknown as Json, odds: removeUndefined(odds) as unknown as Json } satisfies MatchInsert;
  }).filter(Boolean)) as MatchInsert[];
  if (!matches.length) return 0;
  const { error } = await supabase.from('cp_matches').upsert(matches, { onConflict: 'league_id,season,match_date,home,away' });
  if (error) throw new Error(error.message);
  return matches.length;
}

function statsFromRow(row: Record<string, unknown>, map: Record<string, string>, excludeCanonical: string[]) {
  const out: Record<string, number | string> = {};
  for (const [canon, header] of Object.entries(map)) {
    if (excludeCanonical.includes(canon)) continue;
    const raw = row[header];
    const parsed = num(raw);
    if (parsed !== undefined) out[canon] = parsed;
    else if (cleanString(raw)) out[canon] = cleanString(raw);
  }
  for (const [rawHeader, rawValue] of Object.entries(row)) {
    const key = normalizeHeader(rawHeader).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    if (!key || out[key] !== undefined) continue;
    const parsed = num(rawValue);
    if (parsed !== undefined) out[key] = parsed;
    else if (cleanString(rawValue) && cleanString(rawValue).length <= 80) out[key] = cleanString(rawValue);
  }
  return out;
}

function removeUndefined<T extends Record<string, unknown>>(obj: T) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

function parseDate(s: string): string | null {
  if (!s) return null;
  // Try ISO first
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  // dd/mm/yyyy or dd.mm.yyyy
  const m = s.match(/^(\d{1,2})[./\-](\d{1,2})[./\-](\d{2,4})/);
  if (m) {
    const dd = m[1].padStart(2, '0');
    const mm = m[2].padStart(2, '0');
    let yy = m[3];
    if (yy.length === 2) yy = '20' + yy;
    return `${yy}-${mm}-${dd}`;
  }
  return null;
}