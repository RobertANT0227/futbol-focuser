/**
 * Cento Power advanced parser — 3 sections (General / Home / Away).
 * Uses STRICT keyword matching to avoid stat confusion
 * (shots_on_target ≠ big_chances). "Ocazii mari" is parsed but
 * never written to the engine (still excluded from model per memory).
 */

const DIACRITICS: Record<string, string> = {
  'ș': 's', 'ş': 's', 'ț': 't', 'ţ': 't',
  'ă': 'a', 'â': 'a', 'î': 'i',
};
function stripDiac(s: string): string {
  return s.replace(/[șşțţăâî]/g, ch => DIACRITICS[ch] || ch);
}
function norm(s: string): string {
  return stripDiac(s.toLowerCase().trim()).replace(/\s+/g, ' ');
}
function isNum(s: string): boolean {
  const c = s.replace(/%/g, '').replace(/,/g, '.').trim();
  if (!c) return false;
  const n = parseFloat(c);
  return !isNaN(n) && isFinite(n);
}
function toNum(s: string): number {
  return parseFloat(s.replace(/%/g, '').replace(/,/g, '.').trim());
}
function extractNums(line: string): number[] {
  const m = line.replace(/,/g, '.').replace(/%/g, '').match(/-?\d+\.?\d*/g);
  if (!m) return [];
  return m.map(parseFloat).filter(n => !isNaN(n) && isFinite(n));
}

/**
 * STRICT stat matchers.
 * Order matters — most specific first.
 * Each matcher returns a normalized stat key.
 */
interface Matcher {
  test: (n: string) => boolean;
  key: string;
}
const STRICT_MATCHERS: Matcher[] = [
  // shots_on_target: MUST contain "poarta" or "on target"
  { test: n => n.includes('suturi pe poarta') || n.includes('shots on target') || n === 'sot', key: 'shots_on_target' },
  // big_chances: MUST contain "ocazii mari" or "big chances"
  { test: n => n.includes('ocazii mari') || n.includes('big chances'), key: 'big_chances' },
  // total shots
  { test: n => n.includes('total suturi') || n.includes('suturi totale') || n === 'suturi' || n === 'total shots' || (n.includes('suturi') && !n.includes('poarta') && !n.includes('blocate')), key: 'shots' },
  // possession
  { test: n => n === 'posesie' || n.startsWith('posesie ') || n.includes('possession'), key: 'possession' },
  // xG
  { test: n => n === 'xg' || n.includes('expected goals') || n.includes('goluri asteptate'), key: 'xg' },
  // dangerous attacks
  { test: n => n.includes('atacuri periculoase') || n.includes('dangerous attacks'), key: 'dangerous_attacks' },
  // attacks (non-dangerous)
  { test: n => n === 'atacuri' || n === 'attacks', key: 'attacks' },
  // corners
  { test: n => n === 'cornere' || n.includes('corners') || n === 'lovituri de colt', key: 'corners' },
  // fouls
  { test: n => n === 'faulturi' || n === 'fouls' || n === 'greseli', key: 'fouls' },
  // yellow cards
  { test: n => n.includes('cartonase galbene') || n.includes('yellow cards') || n === 'galbene', key: 'yellow_cards' },
  // red cards
  { test: n => n.includes('cartonase rosii') || n.includes('red cards') || n === 'rosii', key: 'red_cards' },
  // saves
  { test: n => n.includes('parade') || n.includes('saves') || n.includes('gk saves'), key: 'gk_saves' },
  // clean sheets
  { test: n => n.includes('clean sheet') || n.includes('meciuri fara gol primit') || n.includes('porti inviolate'), key: 'clean_sheets' },
  // BTTS rate
  { test: n => n.includes('btts') || n.includes('ambele marcheaza') || n.includes('gg %') || n === 'gg/ng', key: 'btts_rate' },
  // goals (scored avg) — only if line says "goluri" alone
  { test: n => n === 'goluri' || n === 'goals' || n === 'goluri marcate' || n === 'goluri pe meci', key: 'goals' },
  // passes/key passes
  { test: n => n.includes('pase cheie') || n.includes('key passes'), key: 'key_passes' },
  { test: n => n === 'pase' || n === 'passes' || n === 'pase reusite', key: 'passes' },
];

function matchStrict(line: string): string | null {
  const n = norm(line);
  for (const m of STRICT_MATCHERS) {
    if (m.test(n)) return m.key;
  }
  return null;
}

const NOISE_PATTERNS = [
  'top statistici', 'statistici cheie', 'rezumat', 'clasament',
  'ultimele 5', 'ppm', 'forma echipei', 'general', 'sinteza',
  '/meci', 'meci', 'total',
];
function isNoise(n: string): boolean {
  if (!n) return true;
  return NOISE_PATTERNS.some(p => n === p || n.startsWith(p + ' '));
}

export interface CentoStatPair {
  home: number;
  away: number;
}
export interface CentoGeneralResult {
  stats: Record<string, CentoStatPair>;
  log: string[];
}
export interface CentoTeamResult {
  stats: Record<string, number>;
  // optional derived
  goalsScored?: number;
  goalsConceded?: number;
  log: string[];
}

/**
 * SECTION 1 — GENERAL (match overview, both teams).
 * Pattern: stat name on one line, two numbers on neighboring lines
 * (first = HOME, second = AWAY) — handles A B C and "A → B / C" formats.
 */
export function parseGeneral(text: string): CentoGeneralResult {
  const lines = text.replace(/\r\n/g, '\n').split('\n').map(l => l.trim()).filter(Boolean);
  const stats: Record<string, CentoStatPair> = {};
  const log: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const n = norm(line);
    if (isNoise(n)) { continue; }

    // FORMAT A: number → statName → number
    if (isNum(line) && i + 2 < lines.length) {
      const key = matchStrict(lines[i + 1]);
      if (key && isNum(lines[i + 2]) && !(key in stats)) {
        stats[key] = { home: toNum(line), away: toNum(lines[i + 2]) };
        log.push(`✅ [${key}] HOME=${stats[key].home} / AWAY=${stats[key].away}`);
        i += 2;
        continue;
      }
    }

    // FORMAT B: statName → number → number
    const key = matchStrict(line);
    if (key && i + 2 < lines.length && isNum(lines[i + 1]) && isNum(lines[i + 2])) {
      if (!(key in stats)) {
        stats[key] = { home: toNum(lines[i + 1]), away: toNum(lines[i + 2]) };
        log.push(`✅ [${key}] HOME=${stats[key].home} / AWAY=${stats[key].away}`);
      }
      i += 2;
      continue;
    }

    // FORMAT C: statName line containing 2+ numbers ("Posesie 53.7% 46.3%")
    if (key) {
      const inline = extractNums(line);
      if (inline.length >= 2 && !(key in stats)) {
        stats[key] = { home: inline[0], away: inline[1] };
        log.push(`✅ [${key}] HOME=${inline[0]} / AWAY=${inline[1]} (inline)`);
      }
    }
  }

  // Drop big_chances from final output (excluded from engine per memory)
  if ('big_chances' in stats) {
    log.push(`🚫 big_chances = ${stats['big_chances'].home}/${stats['big_chances'].away} (excluded from model)`);
    delete stats['big_chances'];
  }
  return { stats, log };
}

/**
 * SECTION 2/3 — TEAM (single team, home or away view).
 * Pattern: statName followed by single value (this team only).
 * Detects GM/GP triplets (scored / conceded / total).
 */
export function parseTeam(text: string): CentoTeamResult {
  const lines = text.replace(/\r\n/g, '\n').split('\n').map(l => l.trim()).filter(Boolean);
  const stats: Record<string, number> = {};
  const log: string[] = [];
  let goalsScored: number | undefined;
  let goalsConceded: number | undefined;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const n = norm(line);
    if (isNoise(n) && !n.startsWith('acasa') && !n.startsWith('deplasare')) continue;

    // GM/GP triplet — "Acasă 1.38 0.75 2.13" → gm=1.38 gp=0.75 total=2.13
    if (n.startsWith('acasa') || n.startsWith('deplasare') || n.startsWith('sinteza')) {
      const nums = extractNums(line);
      if (nums.length >= 2) {
        if (goalsScored === undefined) goalsScored = nums[0];
        if (goalsConceded === undefined) goalsConceded = nums[1];
        log.push(`✅ GM=${nums[0]} GP=${nums[1]} (din "${line}")`);
        continue;
      }
    }

    // statName → number (single team)
    const key = matchStrict(line);
    if (key) {
      // Try inline number on same line first
      const inline = extractNums(line);
      if (inline.length >= 1 && !(key in stats)) {
        stats[key] = inline[0];
        log.push(`✅ [${key}] = ${inline[0]} (inline)`);
        continue;
      }
      if (i + 1 < lines.length && isNum(lines[i + 1]) && !(key in stats)) {
        stats[key] = toNum(lines[i + 1]);
        log.push(`✅ [${key}] = ${stats[key]}`);
        i += 1;
        continue;
      }
    }

    // number → statName
    if (isNum(line) && i + 1 < lines.length) {
      const k2 = matchStrict(lines[i + 1]);
      if (k2 && !(k2 in stats)) {
        stats[k2] = toNum(line);
        log.push(`✅ [${k2}] = ${stats[k2]}`);
        i += 1;
        continue;
      }
    }
  }

  // big_chances stripped
  if ('big_chances' in stats) {
    log.push(`🚫 big_chances = ${stats['big_chances']} (excluded from model)`);
    delete stats['big_chances'];
  }

  return { stats, goalsScored, goalsConceded, log };
}

// ===== APPLY TO MATCHDATA =====
import type { MatchData, TeamStats } from './types';

/**
 * Apply general (both-teams) stats. Team-specific stats take priority later.
 */
export function applyGeneral(parsed: CentoGeneralResult, match: MatchData): { updated: MatchData; fields: number; log: string[] } {
  const log: string[] = [];
  const home: TeamStats = { ...match.homeTeam };
  const away: TeamStats = { ...match.awayTeam };
  let fields = 0;

  const set = (team: TeamStats, field: keyof TeamStats, value: number, label: string) => {
    (team as any)[field] = value;
    fields++;
    log.push(`  → ${team.name}.${String(field)} = ${value} (${label})`);
  };

  for (const [key, pair] of Object.entries(parsed.stats)) {
    switch (key) {
      case 'goals':
        set(home, 'goalsScored', pair.home, key);
        set(away, 'goalsScored', pair.away, key);
        break;
      case 'possession':
        set(home, 'possession', pair.home, key);
        set(away, 'possession', pair.away, key);
        break;
      case 'shots':
        set(home, 'shots', pair.home, key);
        set(away, 'shots', pair.away, key);
        break;
      case 'shots_on_target':
        set(home, 'shotsOnTarget', pair.home, key);
        set(away, 'shotsOnTarget', pair.away, key);
        break;
      case 'xg':
        set(home, 'xG', pair.home, key);
        set(away, 'xG', pair.away, key);
        break;
      case 'corners':
        set(home, 'cornersPerMatch', pair.home, key);
        set(away, 'cornersPerMatch', pair.away, key);
        break;
      case 'fouls':
        set(home, 'fouls', pair.home, key);
        set(away, 'fouls', pair.away, key);
        break;
      case 'yellow_cards':
        set(home, 'cardsPerMatch', pair.home, key);
        set(away, 'cardsPerMatch', pair.away, key);
        break;
      case 'dangerous_attacks':
        set(home, 'dangerousAttacks', pair.home, key);
        set(away, 'dangerousAttacks', pair.away, key);
        break;
      case 'gk_saves':
        set(home, 'gkSaves', pair.home, key);
        set(away, 'gkSaves', pair.away, key);
        break;
      // big_chances intentionally not applied (excluded from model)
    }
  }

  return {
    updated: { ...match, homeTeam: home, awayTeam: away },
    fields,
    log,
  };
}

/**
 * Apply team-specific stats (HOME or AWAY view) — overrides general.
 */
export function applyTeam(parsed: CentoTeamResult, match: MatchData, side: 'home' | 'away'): { updated: MatchData; fields: number; log: string[] } {
  const log: string[] = [];
  const team: TeamStats = side === 'home' ? { ...match.homeTeam } : { ...match.awayTeam };
  let fields = 0;

  const set = (field: keyof TeamStats, value: number, label: string) => {
    (team as any)[field] = value;
    fields++;
    log.push(`  → ${team.name}.${String(field)} = ${value} (${label})`);
  };

  // GM/GP — always assign to the team-side specific fields
  if (parsed.goalsScored !== undefined) {
    if (side === 'home') {
      set('goalsScoredHome', parsed.goalsScored, 'GM home');
    } else {
      set('goalsScoredAway', parsed.goalsScored, 'GM away');
    }
  }
  if (parsed.goalsConceded !== undefined) {
    if (side === 'home') {
      set('goalsConcededHome', parsed.goalsConceded, 'GP home');
    } else {
      set('goalsConcededAway', parsed.goalsConceded, 'GP away');
    }
  }

  for (const [key, value] of Object.entries(parsed.stats)) {
    switch (key) {
      case 'shots':              set('shots', value, key); break;
      case 'shots_on_target':
        set('shotsOnTarget', value, key);
        if (side === 'home') set('shotsOnTargetHome', value, key + ' home');
        else set('shotsOnTargetAway', value, key + ' away');
        break;
      case 'possession':         set('possession', value, key); break;
      case 'xg':                 set('xG', value, key); break;
      case 'corners':
        set('cornersPerMatch', value, key);
        if (side === 'home') set('cornersPerMatchHome', value, key + ' home');
        else set('cornersPerMatchAway', value, key + ' away');
        break;
      case 'yellow_cards':       set('cardsPerMatch', value, key); break;
      case 'fouls':              set('fouls', value, key); break;
      case 'dangerous_attacks':  set('dangerousAttacks', value, key); break;
      case 'gk_saves':           set('gkSaves', value, key); break;
    }
  }

  const updated = side === 'home'
    ? { ...match, homeTeam: team }
    : { ...match, awayTeam: team };

  return { updated, fields, log };
}
