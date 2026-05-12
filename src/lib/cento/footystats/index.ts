import Papa from 'papaparse';
import { detectFile } from './detect';
import { parseLeague } from './parseLeague';
import { parseMatches } from './parseMatches';
import { parseTeams } from './parseTeams';
import type { ParsedLeagueBundle, DetectedMeta } from './types';

export interface ParsedFile {
  meta: DetectedMeta;
  league?: ReturnType<typeof parseLeague>;
  matches?: ReturnType<typeof parseMatches>;
  teams?: ReturnType<typeof parseTeams>;
  fileName: string;
}

export async function parseFootyStatsFile(file: File): Promise<ParsedFile> {
  const text = await file.text();
  const parsed = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  const rows = parsed.data.filter((r) => r && Object.keys(r).length > 0);
  const headers = parsed.meta.fields ?? [];
  const meta = detectFile(file.name, headers);
  const result: ParsedFile = { meta, fileName: file.name };
  if (meta.kind === 'league') result.league = parseLeague(rows);
  else if (meta.kind === 'matches') result.matches = parseMatches(rows);
  else if (meta.kind === 'teams') result.teams = parseTeams(rows);
  return result;
}

/** Group multiple parsed files into bundles per league/season. */
export function groupFiles(files: ParsedFile[]): ParsedLeagueBundle[] {
  const map = new Map<string, ParsedLeagueBundle>();
  for (const f of files) {
    const key = `${f.meta.normalizedKey}__${f.meta.season}`;
    let bundle = map.get(key);
    if (!bundle) {
      bundle = { meta: f.meta };
      map.set(key, bundle);
    } else {
      // ensure leagueName/country preserved if better
      if (f.meta.country && !bundle.meta.country) bundle.meta.country = f.meta.country;
    }
    if (f.league) bundle.league = f.league;
    if (f.matches) bundle.matches = f.matches;
    if (f.teams) bundle.teams = f.teams;
  }
  return [...map.values()];
}

export type { ParsedLeagueBundle, DetectedMeta } from './types';
export { detectFile } from './detect';