import Papa from 'papaparse';
import { supabase } from '@/integrations/supabase/client';
import { autoMapColumns, COLUMN_ALIASES } from '@/lib/csvScanner';
import { detectPlaystyle, STYLE_LABEL } from './playstyle';
import type { CpFileType, CpImportResult, CpTeamStats } from './types';

// Extend column aliases at runtime (don't mutate the original heavily)
const EXTRA_ALIASES: Record<string, string[]> = {
  shots_off: ['shots off target', 'shots off', 'so', 'sh off'],
  btts_pct: ['btts%', 'btts %', 'both teams to score %'],
  over25_pct: ['over 2.5 %', 'o2.5 %', 'over25%', 'over 2.5%'],
  under25_pct: ['under 2.5 %', 'u2.5 %', 'under25%'],
  ppg: ['ppg', 'points per game', 'puncte/meci'],
  goals_first_half: ['1h goals', 'first half goals', 'goluri repriza 1', 'gh1'],
  goals_second_half: ['2h goals', 'second half goals', 'goluri repriza 2', 'gh2'],
  goals_scored_home: ['gf home', 'goluri marcate acasa', 'home goals'],
  goals_scored_away: ['gf away', 'goluri marcate deplasare', 'away goals'],
  goals_conceded_home: ['ga home', 'goluri primite acasa'],
  goals_conceded_away: ['ga away', 'goluri primite deplasare'],
  match_date: ['date', 'data', 'match date', 'kickoff'],
  season: ['season', 'sezon'],
  league: ['league', 'liga', 'competition', 'comp'],
};
for (const [k, v] of Object.entries(EXTRA_ALIASES)) {
  COLUMN_ALIASES[k] = [...(COLUMN_ALIASES[k] || []), ...v];
}

const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[._\-]+/g, ' ').replace(/\s+/g, ' ').trim();

const num = (v: unknown, fallback: number | undefined = undefined): number | undefined => {
  if (v === null || v === undefined || v === '') return fallback;
  const s = String(v).trim().replace('%', '').replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : fallback;
};

export function detectFileType(headers: string[], rowCount: number, map: Record<string, string>): CpFileType {
  const has = (k: string) => Boolean(map[k]);
  if (has('home') && has('away')) return 'match';
  if (has('team') && rowCount >= 4 && (has('goals_scored') || has('xg') || has('matches_played'))) return 'league';
  if (has('team') && rowCount <= 3) return 'team';
  return 'unknown';
}

// Try to extract league name from filename: "premier-league_2024-25.csv" -> Premier League / 2024/25
export function leagueFromFilename(name: string): { league?: string; season?: string } {
  const base = name.replace(/\.[a-z]+$/i, '').replace(/[_\-]+/g, ' ');
  const seasonMatch = base.match(/(20\d{2})\s*[\/\-]\s*(20)?(\d{2})/);
  let season: string | undefined;
  if (seasonMatch) {
    const a = seasonMatch[1];
    const b = seasonMatch[3];
    season = `${a}/${b}`;
  }
  const leagueWords = base
    .replace(/(20\d{2})\s*[\/\-]\s*(20)?(\d{2})/g, '')
    .replace(/\b(csv|xlsx|league|table|matches|match|fixtures|fixture|stats|stat|team|teams|squad|squads|h2h|data|export|footystats|all)\b/gi, '')
    .replace(/\s+/g, ' ').trim();
  return { league: leagueWords ? toTitle(leagueWords) : undefined, season };
}

const toTitle = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

/** Lightweight inspection of a file: returns detected type + league + season, no DB writes. */
export interface PeekedFile {
  file: File;
  detectedLeague?: string;
  detectedSeason?: string;
  detectedType: CpFileType;
  rowCount: number;
}

export async function peekCsv(file: File): Promise<PeekedFile> {
  const text = await file.text();
  const res = Papa.parse<Record<string, unknown>>(text, { header: true, skipEmptyLines: true });
  const rows = (res.data || []).filter((r) => Object.values(r).some((v) => v !== '' && v != null));
  const headers = res.meta.fields || [];
  const map = autoMapColumns(headers);
  const fileType = detectFileType(headers, rows.length, map);
  const fromName = leagueFromFilename(file.name);
  let league = fromName.league;
  let season = fromName.season;
  if (map.league && rows[0]) { const v = rows[0][map.league]; if (v) league = String(v); }
  if (map.season && rows[0]) { const v = rows[0][map.season]; if (v) season = String(v); }
  return { file, detectedLeague: league, detectedSeason: season, detectedType: fileType, rowCount: rows.length };
}

/** Group peeked files into bundles by normalized league + season. */
export interface FileBundle {
  key: string;
  league: string;
  season: string;
  files: PeekedFile[];
  hasLeague: boolean;
  hasMatches: boolean;
  hasTeam: boolean;
}

function normKey(s?: string) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '');
}

export function groupBundles(peeked: PeekedFile[]): FileBundle[] {
  const map = new Map<string, FileBundle>();
  for (const p of peeked) {
    const league = p.detectedLeague || 'Unknown League';
    const season = p.detectedSeason || '2024/25';
    const key = `${normKey(league)}::${normKey(season)}`;
    if (!map.has(key)) {
      map.set(key, { key, league, season, files: [], hasLeague: false, hasMatches: false, hasTeam: false });
    }
    const b = map.get(key)!;
    b.files.push(p);
    if (p.detectedType === 'league') b.hasLeague = true;
    if (p.detectedType === 'match') b.hasMatches = true;
    if (p.detectedType === 'team') b.hasTeam = true;
  }
  return Array.from(map.values());
}

export interface ImportContext {
  ownerId: string;
  defaultSeason?: string;
  defaultLeague?: string;
}

export async function importCsvFile(file: File, ctx: ImportContext): Promise<CpImportResult> {
  const text = await file.text();
  const res = Papa.parse<Record<string, unknown>>(text, { header: true, skipEmptyLines: true });
  const rows = (res.data || []).filter((r) => Object.values(r).some((v) => v !== '' && v != null));
  const headers = res.meta.fields || [];
  const map = autoMapColumns(headers);
  const fileType = detectFileType(headers, rows.length, map);

  // League / season detection
  const fromName = leagueFromFilename(file.name);
  let league = ctx.defaultLeague || fromName.league;
  let season = ctx.defaultSeason || fromName.season || '2024/25';
  if (map.league && rows[0]) {
    const v = rows[0][map.league];
    if (v) league = String(v);
  }
  if (map.season && rows[0]) {
    const v = rows[0][map.season];
    if (v) season = String(v);
  }
  league = league || 'Unknown League';

  // Upsert league
  const { data: leagueRow, error: leagueErr } = await supabase
    .from('cp_leagues')
    .upsert({ owner_id: ctx.ownerId, name: league, season }, { onConflict: 'owner_id,name,season' })
    .select()
    .single();
  if (leagueErr || !leagueRow) throw new Error(leagueErr?.message || 'League upsert failed');

  let rowsImported = 0;
  let duplicates = 0;

  if (fileType === 'league' || fileType === 'team') {
    // Build teams
    const teams = rows.map((row) => {
      const stats: CpTeamStats = {};
      for (const canon of Object.keys(COLUMN_ALIASES)) {
        const raw = map[canon] ? row[map[canon]] : undefined;
        if (raw === undefined) continue;
        const n = num(raw);
        if (n !== undefined) (stats as Record<string, number>)[canon] = n;
      }
      const ps = detectPlaystyle(stats);
      return {
        owner_id: ctx.ownerId,
        league_id: leagueRow.id,
        name: String(row[map.team || ''] || 'Team'),
        playstyle: STYLE_LABEL[ps.primary],
        tags: ps.tags,
        stats,
      };
    }).filter((t) => t.name && t.name !== 'Team');

    if (teams.length) {
      const { error, count } = await supabase
        .from('cp_teams')
        .upsert(teams, { onConflict: 'league_id,name', count: 'exact' });
      if (error) throw new Error(error.message);
      rowsImported = teams.length;
      duplicates = Math.max(0, rows.length - teams.length);
    }
  } else if (fileType === 'match') {
    const matches = rows.map((row) => {
      const home = String(row[map.home || ''] || '').trim();
      const away = String(row[map.away || ''] || '').trim();
      const dateRaw = map.match_date ? String(row[map.match_date] || '') : '';
      const match_date = parseDate(dateRaw);
      const stats: Record<string, number | string | null> = {};
      for (const canon of Object.keys(COLUMN_ALIASES)) {
        if (['home', 'away', 'match_date', 'season', 'league'].includes(canon)) continue;
        const raw = map[canon] ? row[map[canon]] : undefined;
        if (raw === undefined) continue;
        const n = num(raw);
        if (n !== undefined) stats[canon] = n;
      }
      const odds = {
        home: num(map.odds_home ? row[map.odds_home] : undefined),
        draw: num(map.odds_draw ? row[map.odds_draw] : undefined),
        away: num(map.odds_away ? row[map.odds_away] : undefined),
        over25: num(map.odds_over25 ? row[map.odds_over25] : undefined),
        under25: num(map.odds_under25 ? row[map.odds_under25] : undefined),
        btts_yes: num(map.odds_btts_yes ? row[map.odds_btts_yes] : undefined),
        btts_no: num(map.odds_btts_no ? row[map.odds_btts_no] : undefined),
      };
      return home && away ? ({
        owner_id: ctx.ownerId,
        league_id: leagueRow.id,
        season,
        match_date,
        home, away, stats, odds,
      } as const) : null;
    }).filter(Boolean) as Array<{
      owner_id: string; league_id: string; season: string;
      match_date: string | null; home: string; away: string;
      stats: Record<string, unknown>; odds: Record<string, unknown>;
    }>;

    if (matches.length) {
      const { error } = await supabase
        .from('cp_matches')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .upsert(matches as any, { onConflict: 'league_id,season,match_date,home,away' });
      if (error) throw new Error(error.message);
      rowsImported = matches.length;
      duplicates = Math.max(0, rows.length - matches.length);
    }
  }

  // Log import
  await supabase.from('cp_imports').insert({
    owner_id: ctx.ownerId,
    league_id: leagueRow.id,
    league_name: league,
    season,
    file_type: fileType,
    file_name: file.name,
    rows_imported: rowsImported,
    duplicates,
  });

  return { league, season, fileType, rowsImported, duplicates, fileName: file.name };
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