import type { CsvKind, DetectedMeta } from './types';

const COUNTRY_HINTS: Record<string, string> = {
  spain: 'Spain', england: 'England', italy: 'Italy', germany: 'Germany',
  france: 'France', portugal: 'Portugal', netherlands: 'Netherlands',
  belgium: 'Belgium', turkey: 'Turkey', greece: 'Greece',
  scotland: 'Scotland', russia: 'Russia', ukraine: 'Ukraine',
  romania: 'Romania', usa: 'USA', mexico: 'Mexico', brazil: 'Brazil',
  argentina: 'Argentina', japan: 'Japan', 'south-korea': 'South Korea',
  saudi: 'Saudi Arabia', poland: 'Poland', austria: 'Austria',
  switzerland: 'Switzerland', denmark: 'Denmark', sweden: 'Sweden',
  norway: 'Norway', europe: 'Europe', world: 'World',
};

export function normalizeSeason(raw: string | null | undefined): string {
  if (!raw) return '2024/2025';
  const m = raw.match(/(20\d{2})\D+(20\d{2})/);
  if (m) return `${m[1]}/${m[2]}`;
  const single = raw.match(/(20\d{2})/);
  if (single) {
    const y = parseInt(single[1], 10);
    return `${y}/${y + 1}`;
  }
  return '2024/2025';
}

export function prettifyLeagueSlug(slug: string): { name: string; country: string | null } {
  const cleaned = slug
    .replace(/[-_]+/g, ' ')
    .replace(/\bstats\b/gi, '')
    .replace(/\b(20\d{2})\s*to\s*(20\d{2})\b/gi, '')
    .replace(/\b20\d{2}\b/g, '')
    .replace(/\b(league|matches|teams)\b/gi, '')
    .trim()
    .replace(/\s+/g, ' ');
  const parts = cleaned.split(' ').filter(Boolean);
  let country: string | null = null;
  const lower = parts.map((p) => p.toLowerCase());
  for (const key of Object.keys(COUNTRY_HINTS)) {
    if (lower.includes(key)) { country = COUNTRY_HINTS[key]; break; }
  }
  const name = parts.map((p) => p[0].toUpperCase() + p.slice(1)).join(' ');
  return { name: name || 'Unknown League', country };
}

function kindFromHeaders(headers: string[]): CsvKind | null {
  const lower = headers.map((h) => h.toLowerCase().trim());
  const hasAny = (...keys: string[]) => keys.some((k) => lower.some((h) => h.includes(k)));
  // matches CSV — has both home_team_name + away_team_name + date_unix
  if (hasAny('home_team_name') && hasAny('away_team_name') && hasAny('date_unix', 'date_gmt', 'kickoff')) {
    return 'matches';
  }
  // teams CSV — has team_name + matches_played
  if (hasAny('team_name', 'common_name') && hasAny('matches_played', 'wins_overall', 'goals_scored')) {
    return 'teams';
  }
  // league CSV — has goals_per_match_overall or season_avg_goals
  if (hasAny('goals_per_match_overall', 'btts_overall', 'over_25_overall', 'over_25_percentage', 'season_avg')) {
    return 'league';
  }
  return null;
}

function kindFromName(name: string): CsvKind | null {
  const n = name.toLowerCase();
  if (n.includes('matches')) return 'matches';
  if (n.includes('teams')) return 'teams';
  if (n.includes('league')) return 'league';
  return null;
}

export function detectFile(fileName: string, headers: string[]): DetectedMeta {
  const base = fileName.replace(/\.csv$/i, '');
  // remove trailing role tokens
  const seasonMatch = base.match(/(20\d{2}[-_]to[-_]20\d{2})|(20\d{2}[-_]20\d{2})|(20\d{2})/i);
  const season = normalizeSeason(seasonMatch?.[0] ?? null);
  // strip role + season from slug for league pretty name
  let slug = base
    .replace(/[-_]?(stats)$/i, '')
    .replace(/(20\d{2})[-_]to[-_](20\d{2})/gi, '')
    .replace(/(20\d{2})[-_](20\d{2})/g, '')
    .replace(/[-_]?(league|matches|teams)[-_]?/i, '-');
  const pretty = prettifyLeagueSlug(slug);
  const kind = kindFromHeaders(headers) ?? kindFromName(base) ?? 'league';
  const normalizedKey = pretty.name.toLowerCase().replace(/\s+/g, '-');
  return {
    kind,
    leagueName: pretty.name,
    country: pretty.country,
    season,
    normalizedKey,
  };
}