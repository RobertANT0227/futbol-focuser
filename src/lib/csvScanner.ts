import Papa from 'papaparse';
import type { TeamStats, MatchData, BetRecommendation } from './types';
import { runAnalysis } from './engine';

// ===== Column alias dictionary =====
export const COLUMN_ALIASES: Record<string, string[]> = {
  team: ['team', 'echipa', 'club', 'squad', 'nume', 'name'],
  home: ['home', 'home team', 'gazda', 'host'],
  away: ['away', 'away team', 'oaspete', 'guest', 'visitor'],
  league: ['league', 'liga', 'competition', 'comp'],
  matches_played: ['mp', 'games', 'played', 'meciuri', 'm', 'gp', 'matches'],
  goals_scored: ['gf', 'goals', 'goals for', 'goluri', 'goluri marcate', 'scored', 'gm'],
  goals_conceded: ['ga', 'goals against', 'goluri primite', 'conceded', 'gp_against', 'gc'],
  xg: ['xg', 'expected goals'],
  xga: ['xga', 'expected goals against', 'xg against'],
  possession: ['poss', 'possession', 'posesie', 'pos', '% poss'],
  shots: ['sh', 'shots', 'suturi', 'total shots', 'shots total'],
  shots_on_target: ['sot', 'shots on target', 'shots ot', 'sh ot', 'suturi pe poarta', 'șuturi pe poartă', 'on target'],
  dangerous_attacks: ['da', 'dangerous attacks', 'atacuri periculoase', 'dang att'],
  corners: ['cr', 'corners', 'cornere', 'corner kicks', 'ck'],
  cards: ['cards', 'yc', 'yellow cards', 'cartonase', 'cartonașe'],
  fouls: ['fouls', 'faulturi', 'fa'],
  clean_sheets: ['cs', 'clean sheets', 'meciuri fara gol primit'],
  btts: ['btts', 'both teams to score', 'both score'],
  odds_home: ['odds home', 'oh', '1', 'cota 1', 'home odds', 'odd1'],
  odds_draw: ['odds draw', 'od', 'x', 'cota x', 'draw odds', 'oddx'],
  odds_away: ['odds away', 'oa', '2', 'cota 2', 'away odds', 'odd2'],
  odds_over25: ['o2.5', 'over 2.5', 'odds over 2.5'],
  odds_under25: ['u2.5', 'under 2.5', 'odds under 2.5'],
  odds_btts_yes: ['btts yes', 'btts y', 'odds btts yes'],
  odds_btts_no: ['btts no', 'btts n', 'odds btts no'],
  league_position: ['rk', 'rank', 'pos', 'position', 'loc'],
};

const norm = (s: string) =>
  s.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[._\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export function autoMapColumns(headers: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  const normHeaders = headers.map((h) => ({ raw: h, n: norm(h) }));
  for (const [canonical, aliases] of Object.entries(COLUMN_ALIASES)) {
    const normAliases = aliases.map(norm);
    const hit = normHeaders.find((h) => normAliases.includes(h.n) || normAliases.some((a) => h.n === a));
    if (hit) map[canonical] = hit.raw;
  }
  return map;
}

export type CsvType = 'league' | 'team' | 'h2h' | 'match' | 'unknown';

export function detectCsvType(map: Record<string, string>, rowCount: number): CsvType {
  const has = (k: string) => Boolean(map[k]);
  if (has('home') && has('away')) return 'match';
  if (has('team') && rowCount >= 4 && (has('goals_scored') || has('xg') || has('matches_played'))) return 'league';
  if (has('team') && rowCount <= 3) return 'team';
  if (has('home') || has('away')) return 'h2h';
  return 'unknown';
}

const num = (v: unknown, fallback = 0): number => {
  if (v === null || v === undefined || v === '') return fallback;
  const s = String(v).trim().replace('%', '').replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : fallback;
};

export interface ParsedCsv {
  headers: string[];
  rows: Record<string, unknown>[];
  map: Record<string, string>;
  type: CsvType;
}

export function parseCsvText(text: string): ParsedCsv {
  const res = Papa.parse<Record<string, unknown>>(text, { header: true, skipEmptyLines: true, dynamicTyping: false });
  const rows = (res.data || []).filter((r) => Object.values(r).some((v) => v !== '' && v != null));
  const headers = res.meta.fields || [];
  const map = autoMapColumns(headers);
  const type = detectCsvType(map, rows.length);
  return { headers, rows, map, type };
}

// ===== Build TeamStats from a CSV row =====
export function rowToTeamStats(row: Record<string, unknown>, map: Record<string, string>, fallbackName = 'Team'): TeamStats {
  const get = (k: string) => (map[k] ? row[map[k]] : undefined);
  const mp = num(get('matches_played'), 20) || 20;
  const gfTotal = num(get('goals_scored'));
  const gaTotal = num(get('goals_conceded'));
  // Heuristic: if value > mp, treat as totals → divide; else as per-match
  const gf = gfTotal > mp ? gfTotal / mp : gfTotal || 1.3;
  const ga = gaTotal > mp ? gaTotal / mp : gaTotal || 1.1;
  const xg = num(get('xg'), gf);
  const xga = num(get('xga'), ga);
  const shotsRaw = num(get('shots'));
  const shots = shotsRaw > mp ? shotsRaw / mp : shotsRaw || 12;
  const sotRaw = num(get('shots_on_target'));
  const sot = sotRaw > mp ? sotRaw / mp : sotRaw || 4;
  const cornersRaw = num(get('corners'));
  const corners = cornersRaw > mp ? cornersRaw / mp : cornersRaw || 5;
  const cardsRaw = num(get('cards'));
  const cards = cardsRaw > mp ? cardsRaw / mp : cardsRaw || 2;
  const possession = num(get('possession'), 50);
  const da = num(get('dangerous_attacks'), 40);
  const pos = num(get('league_position'), 10);

  return {
    name: String(get('team') ?? fallbackName),
    goalsScored: gf, goalsConceded: ga,
    goalsScoredHome: gf * 1.1, goalsConcededHome: ga * 0.9,
    goalsScoredAway: gf * 0.9, goalsConcededAway: ga * 1.1,
    matchesPlayed: mp,
    formLast5: ['W', 'D', 'L', 'W', 'D'],
    formHome: ['W', 'W', 'D', 'W', 'L'],
    formAway: ['D', 'L', 'W', 'D', 'L'],
    xG: xg, xGA: xga,
    shots, shotsOnTarget: sot,
    shotsOnTargetHome: sot * 1.1, shotsOnTargetAway: sot * 0.9,
    possession: possession > 1 ? possession : possession * 100,
    dangerousAttacks: da,
    corners: 0, cornersPerMatch: corners,
    cornersPerMatchHome: corners * 1.05, cornersPerMatchAway: corners * 0.95,
    cards: 0, cardsPerMatch: cards,
    fouls: num(get('fouls'), 12),
    playStyle: 'possession',
    leaguePosition: pos,
    totalTeamsInLeague: 20,
    gkSaves: 3,
  };
}

// ===== Build a MatchData from two TeamStats =====
export function buildMatch(home: TeamStats, away: TeamStats, league = '', odds?: Partial<MatchData>): MatchData {
  return {
    homeTeam: home,
    awayTeam: away,
    league,
    oddsHome: odds?.oddsHome ?? 2.1,
    oddsDraw: odds?.oddsDraw ?? 3.3,
    oddsAway: odds?.oddsAway ?? 3.4,
    oddsOver25: odds?.oddsOver25 ?? 1.9,
    oddsUnder25: odds?.oddsUnder25 ?? 1.95,
    oddsBTTSYes: odds?.oddsBTTSYes ?? 1.85,
    oddsBTTSNo: odds?.oddsBTTSNo ?? 1.95,
    cornerLines: [
      { line: 9.5, oddsOver: 1.85, oddsUnder: 2.0 },
      { line: 10.5, oddsOver: 2.05, oddsUnder: 1.8 },
    ],
    isDerby: false,
    homeTeamFatigued: false, awayTeamFatigued: false,
    homeEuropeanMatch: false, awayEuropeanMatch: false,
  };
}

// ===== Scanned bet shape =====
export interface ScannedBet {
  matchLabel: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  selection: string;
  category: BetRecommendation['category'];
  betType: string;
  odds: number;
  modelProb: number;
  ev: number;
  value: number;
  risk: BetRecommendation['risk'];
  stakePct: number;
  stakeLei: number;
  homeStyle: TeamStats['playStyle'];
  awayStyle: TeamStats['playStyle'];
  styleMismatch: boolean;
  fragile: boolean;
}

const STYLE_OPPOSITES: Record<string, string[]> = {
  'bus-parking': ['high-press', 'pressing'],
  'low-block': ['high-press', 'pressing'],
  'high-press': ['bus-parking', 'low-block'],
  'pressing': ['bus-parking', 'low-block'],
  'possession': ['counter'],
  'counter': ['possession'],
};

function isStyleMismatch(a: string, b: string) {
  return (STYLE_OPPOSITES[a] || []).includes(b) || (STYLE_OPPOSITES[b] || []).includes(a);
}

// Run engine on a list of (home,away) pairs
export function scanMatches(matches: { match: MatchData }[]): ScannedBet[] {
  const out: ScannedBet[] = [];
  for (const { match } of matches) {
    let result;
    try {
      result = runAnalysis(match);
    } catch {
      continue;
    }
    const matchLabel = `${match.homeTeam.name} vs ${match.awayTeam.name}`;
    for (const r of result.recommendations) {
      out.push({
        matchLabel,
        league: match.league,
        homeTeam: match.homeTeam.name,
        awayTeam: match.awayTeam.name,
        selection: r.selection,
        category: r.category,
        betType: r.type,
        odds: r.odds,
        modelProb: r.modelProbability * 100,
        ev: r.ev,
        value: r.value,
        risk: r.risk,
        stakePct: r.stakePct,
        stakeLei: r.stakeLei,
        homeStyle: match.homeTeam.playStyle,
        awayStyle: match.awayTeam.playStyle,
        styleMismatch: isStyleMismatch(match.homeTeam.playStyle, match.awayTeam.playStyle),
        fragile: r.fragile,
      });
    }
  }
  return out;
}

// Build all home/away pairs from a league CSV (round-robin without self-pairs)
export function buildLeagueFixtures(teams: TeamStats[], league: string, max = 60): { match: MatchData }[] {
  const out: { match: MatchData }[] = [];
  for (let i = 0; i < teams.length; i++) {
    for (let j = 0; j < teams.length; j++) {
      if (i === j) continue;
      out.push({ match: buildMatch(teams[i], teams[j], league) });
      if (out.length >= max) return out;
    }
  }
  return out;
}

// Build matches from a Match CSV (one row per match)
export function buildMatchesFromMatchCsv(rows: Record<string, unknown>[], map: Record<string, string>, leagueName = ''): { match: MatchData }[] {
  const homeKey = map['home'];
  const awayKey = map['away'];
  if (!homeKey || !awayKey) return [];
  return rows.map((row) => {
    const home: TeamStats = rowToTeamStats({ ...row, [map['team'] || '__t']: row[homeKey] }, { ...map, team: map['team'] || '__t' }, String(row[homeKey] ?? 'Home'));
    home.name = String(row[homeKey] ?? 'Home');
    const away: TeamStats = rowToTeamStats({ ...row, [map['team'] || '__t']: row[awayKey] }, { ...map, team: map['team'] || '__t' }, String(row[awayKey] ?? 'Away'));
    away.name = String(row[awayKey] ?? 'Away');
    return {
      match: buildMatch(home, away, leagueName, {
        oddsHome: num(map['odds_home'] ? row[map['odds_home']] : undefined, 2.1),
        oddsDraw: num(map['odds_draw'] ? row[map['odds_draw']] : undefined, 3.3),
        oddsAway: num(map['odds_away'] ? row[map['odds_away']] : undefined, 3.4),
        oddsOver25: num(map['odds_over25'] ? row[map['odds_over25']] : undefined, 1.9),
        oddsUnder25: num(map['odds_under25'] ? row[map['odds_under25']] : undefined, 1.95),
        oddsBTTSYes: num(map['odds_btts_yes'] ? row[map['odds_btts_yes']] : undefined, 1.85),
        oddsBTTSNo: num(map['odds_btts_no'] ? row[map['odds_btts_no']] : undefined, 1.95),
      }),
    };
  });
}

// ===== Export helpers =====
export function betsToCsv(bets: ScannedBet[]): string {
  return Papa.unparse(
    bets.map((b) => ({
      Match: b.matchLabel,
      League: b.league,
      Selection: b.selection,
      Category: b.category,
      Odds: b.odds.toFixed(2),
      'Prob model%': b.modelProb.toFixed(1),
      'EV%': (b.ev * 100).toFixed(2),
      'Value%': b.value.toFixed(2),
      Risk: b.risk,
      'Stake%': (b.stakePct * 100).toFixed(2),
      'Stake LEI': b.stakeLei.toFixed(0),
      'Style Home': b.homeStyle,
      'Style Away': b.awayStyle,
      Mismatch: b.styleMismatch ? 'YES' : '',
      Fragile: b.fragile ? 'YES' : '',
    })),
  );
}

// ===== Watchlist (localStorage) =====
const WATCHLIST_KEY = 'cento_watchlist';
export function loadWatchlist(): ScannedBet[] {
  try { return JSON.parse(localStorage.getItem(WATCHLIST_KEY) || '[]'); } catch { return []; }
}
export function saveWatchlist(bets: ScannedBet[]) {
  localStorage.setItem(WATCHLIST_KEY, JSON.stringify(bets));
}
export function addToWatchlist(bet: ScannedBet) {
  const cur = loadWatchlist();
  cur.push(bet);
  saveWatchlist(cur);
}