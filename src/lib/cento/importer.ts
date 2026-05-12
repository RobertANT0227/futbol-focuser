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
  team: ['team_name', 'team name', 'team', 'squad_name', 'club_name', 'common_name', 'full_name', 'team_full_name', 'name'],
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
  // Team-specific FootyStats columns
  wins: ['wins', 'wins_home', 'wins_away', 'win'],
  draws: ['draws', 'draws_home', 'draws_away', 'draw'],
  losses: ['losses', 'losses_home', 'losses_away', 'loss'],
  goal_difference: ['goal_difference', 'goal diff', 'gd'],
  win_percentage: ['win_percentage', 'win percentage', 'win%', 'wins percentage'],
  fts_percentage: ['fts_percentage', 'fts percentage', 'failed to score percentage'],
  corners_per_match: ['corners_per_match_overall', 'corners per match', 'corners_per_match'],
  cards_per_match: ['cards_per_match_overall', 'cards per match', 'cards_per_match'],
  over25_percentage: ['over25_percentage', 'over 2.5 percentage', 'over25_percentage_overall'],
  under25_percentage: ['under25_percentage', 'under 2.5 percentage', 'under25_percentage_overall'],
  btts_percentage: ['btts_percentage', 'btts percentage', 'btts_percentage_overall'],
  matches_played: ['matches_played', 'matches played', 'games_played', 'mp', 'gp', 'matches'],
};
for (const [k, v] of Object.entries(EXTRA_ALIASES)) {
  COLUMN_ALIASES[k] = Array.from(new Set([...(COLUMN_ALIASES[k] || []), ...v]));
}

const REQUIRED_SIGNALS = ['xg', 'xga', 'possession', 'shots', 'shots_on_target', 'corners', 'cards', 'btts_pct', 'over25_pct', 'ppg'];

const cleanCsvHeader = (s: string) => String(s ?? '')
  .replace(/^\uFEFF/, '')
  .replace(/\uFEFF/g, '')
  .replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const normalizeHeader = (s: string) =>
  cleanCsvHeader(s)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[_\-.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeHeaderKey = (s: string) =>
  cleanCsvHeader(s)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/%/g, ' percentage ')
    .replace(/&/g, ' and ')
    .replace(/[\s\-]+/g, '_')
    .replace(/[./]+/g, '_')
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');

const scoped = (...headers: string[]) => headers.flatMap((h) => [h, `${h}_overall`, `${h}_home`, `${h}_away`, `${h}_total`]);

const TEAM_SIGNAL_ALIASES: Record<string, string[]> = {
  team_name: ['team_name', 'team', 'club', 'club_name', 'squad', 'squad_name', 'common_name', 'full_name', 'team_full_name', 'name'],
  matches_played: scoped('matches_played', 'matches', 'played', 'games_played', 'games', 'mp', 'gp'),
  wins: scoped('wins', 'win', 'won'),
  draws: scoped('draws', 'draw', 'drawn'),
  losses: scoped('losses', 'loss', 'lost'),
  points_per_game: scoped('points_per_game', 'ppg', 'points_pg', 'points_per_match', 'points_per_game_per_match'),
  league_position: ['league_position', 'position', 'table_position', 'rank', 'ranking', 'rk', 'pos'],
  goals_scored: scoped('goals_scored', 'goals_for', 'gf', 'scored', 'total_goals_scored'),
  goals_conceded: scoped('goals_conceded', 'goals_against', 'ga', 'gc', 'conceded', 'total_goals_conceded'),
  goal_difference: scoped('goal_difference', 'goal_diff', 'gd'),
  clean_sheets: scoped('clean_sheets', 'clean_sheet', 'cs', 'clean_sheets_percentage'),
  btts_percentage: scoped('btts_percentage', 'btts_percent', 'btts', 'both_teams_to_score_percentage'),
  fts_percentage: scoped('fts_percentage', 'fts_percent', 'failed_to_score_percentage'),
  corners_per_match: scoped('corners_per_match', 'corners_pg', 'corners_per_game', 'average_corners_per_match'),
  cards_per_match: scoped('cards_per_match', 'cards_pg', 'cards_per_game', 'average_cards_per_match'),
  win_percentage: scoped('win_percentage', 'wins_percentage', 'win_percent', 'win_rate'),
  over25_percentage: scoped('over25_percentage', 'over25_percent', 'over_25_percentage', 'over_2_5_percentage'),
  under25_percentage: scoped('under25_percentage', 'under25_percent', 'under_25_percentage', 'under_2_5_percentage'),
  goals_scored_per_match: scoped('goals_scored_per_match', 'goals_per_match_scored', 'goals_scored_pg', 'goals_for_per_match', 'goals_scored_per_game', 'gf_per_match'),
  goals_conceded_per_match: scoped('goals_conceded_per_match', 'goals_per_match_conceded', 'goals_conceded_pg', 'goals_against_per_match', 'goals_conceded_per_game', 'ga_per_match'),
};

const MATCH_SIGNAL_ALIASES: Record<string, string[]> = {
  home: ['team_a_name', 'home_team_name', 'home_name'],
  away: ['team_b_name', 'away_team_name', 'away_name'],
  odds_home: ['odds_ft_home_team_win', 'odds_home', 'home_odds'],
  total_goal_count: ['total_goal_count', 'total_goals'],
  date: ['date_gmt', 'match_date', 'date'],
};

const LEAGUE_SIGNAL_ALIASES: Record<string, string[]> = {
  average_goals_per_match: ['average_goals_per_match', 'avg_goals_per_match', 'goals_per_match'],
  home_advantage_percentage: ['home_advantage_percentage', 'home_advantage'],
  total_matches: ['total_matches', 'matches_total'],
  number_of_clubs: ['number_of_clubs', 'clubs', 'teams_in_league'],
};

function detectAliases(headers: string[], aliases: Record<string, string[]>, allowFuzzy = true) {
  const normalized = headers.map(normalizeHeaderKey);
  const headerSet = new Set(normalized);
  const matched: string[] = [];
  for (const [canonical, variants] of Object.entries(aliases)) {
    const normalizedVariants = [canonical, ...variants].map(normalizeHeaderKey);
    const exact = normalizedVariants.some((v) => headerSet.has(v));
    const fuzzy = allowFuzzy && canonical !== 'team_name' && normalizedVariants.some((v) => {
      const tokens = v.split('_').filter((t) => t.length > 1);
      return tokens.length >= 2 && normalized.some((h) => tokens.every((t) => h.split('_').includes(t)));
    });
    if (exact || fuzzy) matched.push(canonical);
  }
  return { matched, normalized };
}

function teamSignalScore(headers: string[], rowCount = 0): { matched: string[]; score: number; rawScore: number; boost: number; normalizedHeaders: string[]; hasTeamName: boolean } {
  const { matched, normalized } = detectAliases(headers, TEAM_SIGNAL_ALIASES);
  const hasTeamName = matched.includes('team_name');
  const boost = rowCount >= 10 && hasTeamName ? 4 : 0;
  return { matched, rawScore: matched.length, boost, score: matched.length + boost, normalizedHeaders: normalized, hasTeamName };
}

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

export function detectFileType(headers: string[], rowCount: number, map: Record<string, string>): CpFileType {
  const has = (k: string) => Boolean(map[k]);
  const matchAliases = detectAliases(headers, MATCH_SIGNAL_ALIASES, false).matched;
  const teamSignals = teamSignalScore(headers, rowCount);
  const leagueAliases = detectAliases(headers, LEAGUE_SIGNAL_ALIASES).matched;
  const hasHomeAway = (has('home') && has('away')) || (matchAliases.includes('home') && matchAliases.includes('away'));
  const matchScore = Number(hasHomeAway) * 3 + Number(has('odds_home') || matchAliases.includes('odds_home')) + Number(has('total_goal_count') || matchAliases.includes('total_goal_count')) + Number(has('match_date') || matchAliases.includes('date'));
  const leagueScore = leagueAliases.length + Number(has('average_goals_per_match')) + Number(has('total_matches')) + Number(has('number_of_clubs')) + Number(has('prediction_risk'));

  // Required priority: MATCHES → TEAMS → LEAGUE.
  if (hasHomeAway && matchScore >= 3) return 'match';
  if (teamSignals.rawScore >= 5 || (teamSignals.hasTeamName && rowCount >= 10) || (has('team') && teamSignals.rawScore >= 3)) return 'team';
  if (leagueScore >= 2 && !hasHomeAway) return 'league';
  if (hasHeader(headers, ['team_a_name']) && hasHeader(headers, ['team_b_name'])) return 'match';
  // Failsafe: official FootyStats team exports must never fall to Unknown when team rows are present.
  if ((teamSignals.hasTeamName || has('team')) && rowCount >= 4) return 'team';
  return 'unknown';
}

function extractSeason(rows: Record<string, unknown>[], map: Record<string, string>, leagueName?: string): string | undefined {
  const direct = firstValue(rows, map.season);
  const pool = [direct, leagueName, ...rows.slice(0, 20).flatMap((r) => Object.values(r).map((v) => String(v ?? '')))];
  for (const value of pool) {
    if (!value) continue;
    if (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/.test(value.trim())) continue;
    const full = value.match(/(20\d{2})\s*(?:\/|-|to|–|—)\s*(20\d{2})/i);
    if (full) return `${full[1]}/${full[2]}`;
    const short = value.match(/(20\d{2})\s*(?:\/|-)\s*(\d{2})(?!\s*[-/.]\s*\d{1,2})/);
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

async function readCsvText(file: File) {
  const bytes = await file.arrayBuffer();
  const decoders = [
    new TextDecoder('utf-8', { fatal: true }),
    new TextDecoder('windows-1252'),
    new TextDecoder('iso-8859-1'),
  ];
  for (const decoder of decoders) {
    try { return decoder.decode(bytes); } catch { /* try next encoding */ }
  }
  return await file.text();
}

export async function peekCsv(file: File): Promise<ParsedLeagueCsv> {
  const text = await readCsvText(file);
  const res = Papa.parse<Record<string, unknown>>(text, { header: true, skipEmptyLines: true, dynamicTyping: false, transformHeader: cleanCsvHeader });
  const rows = (res.data || []).filter((r) => Object.values(r).some((v) => v !== '' && v != null));
  const headers = (res.meta.fields || []).map(cleanCsvHeader);
  const map = autoMapColumns(headers);
  const detectedType = detectFileType(headers, rows.length, map);
  const identity = extractIdentity(rows, map);
  const fileHint = identityFromFilename(file.name);
  const coverage = coverageFor(map);
  const teamSig = teamSignalScore(headers, rows.length);
  const matchScore = detectAliases(headers, MATCH_SIGNAL_ALIASES, false).matched.length;
  const leagueScore = detectAliases(headers, LEAGUE_SIGNAL_ALIASES).matched.length;
  const scores = {
    MATCHES: Math.min(100, Math.round((matchScore / 5) * 100)),
    TEAMS: Math.min(100, Math.round((teamSig.score / 9) * 100)),
    LEAGUE: Math.min(100, Math.round((leagueScore / 4) * 100)),
  };
  console.groupCollapsed(`[CSV DETECT] ${file.name}`);
  console.log('File:', file.name);
  console.log('Normalized Headers:', teamSig.normalizedHeaders);
  console.log('Detection Scores:', scores);
  console.log('Matched Team Signals:', teamSig.matched);
  console.log('FINAL TYPE:', detectedType.toUpperCase());
  console.groupEnd();
  return {
    file, headers, rows, map, detectedType,
    detectedLeague: identity.leagueName || fileHint.leagueName,
    normalizedLeagueName: identity.normalizedLeagueName || fileHint.normalizedLeagueName,
    detectedSeason: identity.season || fileHint.season,
    detectedCountry: identity.country || fileHint.country,
    rowCount: rows.length, missingColumns: coverage.missing, coverageScore: coverage.score,
  };
}

function identityFromFilename(name: string): { leagueName?: string; normalizedLeagueName?: string; season?: string; country?: string } {
  const base = name.replace(/\.csv$/i, '').replace(/[_\-]+/g, ' ').toLowerCase();
  const seasonMatch = base.match(/(20\d{2})\s*(?:to|\/|-|–|—)\s*(20\d{2}|\d{2})/i);
  let season: string | undefined;
  if (seasonMatch) {
    const a = seasonMatch[1];
    const b = seasonMatch[2].length === 2 ? '20' + seasonMatch[2] : seasonMatch[2];
    season = `${a}/${b}`;
  }
  const noise = /(stats|fixtures|matches|teams?|squads?|league|h2h|footystats|export|download|\(\d+\)|\b20\d{2}\b|\bto\b)/g;
  const cleaned = base
    .replace(/(20\d{2})\s*(?:to|\/|-|–|—)\s*(20\d{2}|\d{2})/gi, ' ')
    .replace(noise, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return { season };
  const leagueName = toTitle(cleaned);
  return { leagueName, normalizedLeagueName: normalizeLeagueName(leagueName), season };
}

function tokens(s: string) { return new Set(s.split(/\s+/).filter(Boolean)); }
function jaccard(a: Set<string>, b: Set<string>) {
  const inter = new Set([...a].filter((x) => b.has(x)));
  const union = new Set([...a, ...b]);
  return union.size ? inter.size / union.size : 0;
}

export function groupBundles(peeked: ParsedLeagueCsv[]): LeagueImportPackage[] {
  const resolved = [...peeked];

  // Cluster by fuzzy league identity + season, preferring LEAGUE-type CSV as canonical.
  type Cluster = { canonical: ParsedLeagueCsv; tokens: Set<string>; season?: string; members: ParsedLeagueCsv[] };
  const clusters: Cluster[] = [];
  const sortedByPriority = [...resolved].sort((a, b) => {
    const rank = (t: CpFileType) => (t === 'league' ? 0 : t === 'match' ? 1 : t === 'team' ? 2 : 3);
    const r = rank(a.detectedType) - rank(b.detectedType);
    if (r !== 0) return r;
    return (b.normalizedLeagueName ? 1 : 0) - (a.normalizedLeagueName ? 1 : 0);
  });

  for (const p of sortedByPriority) {
    const tname = p.normalizedLeagueName ? tokens(p.normalizedLeagueName) : new Set<string>();
    let best: { c: Cluster; score: number } | null = null;
    for (const c of clusters) {
      const sameSeason = !p.detectedSeason || !c.season || p.detectedSeason === c.season;
      if (!sameSeason) continue;
      const score = tname.size && c.tokens.size ? jaccard(tname, c.tokens) : (tname.size === 0 || c.tokens.size === 0 ? 0.5 : 0);
      if (score >= 0.5 && (!best || score > best.score)) best = { c, score };
    }
    if (best) {
      best.c.members.push(p);
      // expand cluster vocabulary
      tname.forEach((t) => best!.c.tokens.add(t));
      if (!best.c.season && p.detectedSeason) best.c.season = p.detectedSeason;
    } else {
      clusters.push({ canonical: p, tokens: new Set(tname), season: p.detectedSeason, members: [p] });
    }
  }

  // Backfill identity inside each cluster from the canonical (league-type preferred).
  for (const c of clusters) {
    const withIdentity = c.members.find((m) => m.normalizedLeagueName) || c.canonical;
    const season = c.season || withIdentity.detectedSeason;
    for (const m of c.members) {
      // Force unified identity across the cluster so they merge into ONE league.
      m.detectedLeague = withIdentity.detectedLeague || m.detectedLeague;
      m.normalizedLeagueName = withIdentity.normalizedLeagueName || m.normalizedLeagueName;
      m.detectedCountry = m.detectedCountry || withIdentity.detectedCountry;
      if (!m.detectedSeason) m.detectedSeason = season;
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
    if (b.importStatus.hasLeagueStats && b.importStatus.hasMatches && b.importStatus.hasTeams) {
      b.coverage = { leagueData: 100, matchData: 100, teamData: 100, overall: 100 };
    } else {
      const active = [leagueCov, matchCov, teamCov].filter((v) => v > 0);
      b.coverage = { leagueData: leagueCov, matchData: matchCov, teamData: teamCov, overall: active.length ? Math.round(active.reduce((a, v) => a + v, 0) / active.length) : 0 };
    }
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
  if (coverage.leagueData > 0 && coverage.matchData > 0 && coverage.teamData > 0) {
    coverage.leagueData = 100;
    coverage.matchData = 100;
    coverage.teamData = 100;
    coverage.overall = 100;
  } else {
    coverage.overall = Math.round(([coverage.leagueData, coverage.matchData, coverage.teamData].filter((v) => v > 0).reduce((a, v) => a + v, 0) || 0) / Math.max(1, [coverage.leagueData, coverage.matchData, coverage.teamData].filter((v) => v > 0).length));
  }

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