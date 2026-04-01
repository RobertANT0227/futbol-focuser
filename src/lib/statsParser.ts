/**
 * Strict deterministic football stats parser v3.
 * No AI guessing — pure sequential logic with text normalization.
 * Features: team detection, GM/GP blocks, strict key lock, no overwrites.
 */

// ===== TEXT NORMALIZATION =====
const DIACRITICS_MAP: Record<string, string> = {
  'ș': 's', 'ş': 's', 'ț': 't', 'ţ': 't',
  'ă': 'a', 'â': 'a', 'î': 'i', 'Ș': 's', 'Ş': 's',
  'Ț': 't', 'Ţ': 't', 'Ă': 'a', 'Â': 'a', 'Î': 'i',
};

function removeDiacritics(text: string): string {
  return text.replace(/[șşțţăâîȘŞȚŢĂÂÎ]/g, ch => DIACRITICS_MAP[ch] || ch);
}

function normalize(text: string): string {
  return removeDiacritics(text.toLowerCase().trim()).replace(/\s+/g, ' ');
}

// ===== NUMBER DETECTION =====
function isNumber(line: string): boolean {
  const cleaned = line.replace(/%/g, '').replace(/,/g, '.').trim();
  if (cleaned === '') return false;
  const n = parseFloat(cleaned);
  return !isNaN(n) && isFinite(n);
}

function toNumber(line: string): number {
  return parseFloat(line.replace(/%/g, '').replace(/,/g, '.').trim());
}

// ===== TEAM NAME DETECTION =====
function isTeamName(line: string): boolean {
  if (line.length <= 3) return false;
  if (isNumber(line)) return false;
  // Must contain letters
  if (!/[a-zA-ZăâîșțĂÂÎȘȚ]/.test(line)) return false;
  // Must NOT contain standalone numbers (allow letters+numbers like "FC U 1948")
  const norm = normalize(line);
  if (isNoiseLine(norm)) return false;
  if (matchStat(norm)) return false;
  if (isGmGpTrigger(norm)) return false;
  return true;
}

// ===== NOISE FILTER =====
const NOISE_PATTERNS = [
  'top statistici', 'total', 'medie', 'ultimele 5', 'ppm',
  'statistici cheie', 'rezumat', 'clasament', 'forma echipei',
  'sintetizat', 'acasa', 'deplasare', 'general',
];

function isNoiseLine(normalized: string): boolean {
  return NOISE_PATTERNS.some(p => normalized === p || normalized.startsWith(p + ' '));
}

// ===== GM/GP TRIGGER =====
const GM_GP_TRIGGERS = ['sintetizat', 'gm', 'gp', 'medie'];

function isGmGpTrigger(normalized: string): boolean {
  return GM_GP_TRIGGERS.some(t => normalized === t || normalized.startsWith(t + ':') || normalized.startsWith(t + ' '));
}

// ===== STRICT STAT MAPPING (priority order: most specific first) =====
const STAT_MATCHERS: { pattern: string; key: string; exact?: boolean }[] = [
  // Priority 1: very specific (exact or long phrases)
  { pattern: 'suturi pe poarta', key: 'shots_on_target' },
  { pattern: 'shots on target', key: 'shots_on_target' },
  { pattern: 'ocazii mari create', key: 'big_chances' },
  { pattern: 'ocazii mari', key: 'big_chances' },
  { pattern: 'big chances', key: 'big_chances' },
  { pattern: 'suturi pe meci', key: 'shots' },
  { pattern: 'total suturi', key: 'shots' },
  { pattern: 'suturi totale', key: 'shots' },
  { pattern: 'goluri asteptate', key: 'xg' },
  { pattern: 'expected goals', key: 'xg' },
  { pattern: 'cartonase galbene', key: 'yellow_cards' },
  { pattern: 'yellow cards', key: 'yellow_cards' },
  { pattern: 'atacuri periculoase', key: 'dangerous_attacks' },
  { pattern: 'dangerous attacks', key: 'dangerous_attacks' },
  { pattern: 'parade portar', key: 'gk_saves' },
  { pattern: 'gk saves', key: 'gk_saves' },
  { pattern: 'pase cheie', key: 'key_passes' },
  { pattern: 'key passes', key: 'key_passes' },
  // Priority 2: shorter patterns
  { pattern: 'shots', key: 'shots' },
  { pattern: 'xg', key: 'xg', exact: true },
  { pattern: 'goluri', key: 'goals' },
  { pattern: 'goals', key: 'goals' },
  { pattern: 'posesie', key: 'possession' },
  { pattern: 'possession', key: 'possession' },
  { pattern: 'cornere', key: 'corners' },
  { pattern: 'corners', key: 'corners' },
  { pattern: 'faulturi', key: 'fouls' },
  { pattern: 'fouls', key: 'fouls' },
  { pattern: 'cartonase', key: 'yellow_cards' },
  { pattern: 'cards', key: 'yellow_cards' },
  { pattern: 'saves', key: 'gk_saves' },
  { pattern: 'ofsaiduri', key: 'offsides' },
  { pattern: 'ofsaid', key: 'offsides' },
  { pattern: 'offsides', key: 'offsides' },
];

function matchStat(normalizedLine: string): string | null {
  for (const { pattern, key, exact } of STAT_MATCHERS) {
    if (exact) {
      if (normalizedLine === pattern) return key;
    } else {
      if (normalizedLine === pattern || normalizedLine.includes(pattern)) return key;
    }
  }
  return null;
}

// ===== STAT TO FIELD MAPPING =====
const STAT_TO_FIELD: Record<string, string> = {
  'goals': 'goalsScored',
  'possession': 'possession',
  'shots': 'shots',
  'shots_on_target': 'shotsOnTarget',
  'big_chances': 'shotsOnTarget',
  'corners': 'cornersPerMatch',
  'fouls': 'fouls',
  'yellow_cards': 'cardsPerMatch',
  'xg': 'xG',
  'dangerous_attacks': 'dangerousAttacks',
  'gk_saves': 'gkSaves',
  'offsides': 'offsides',
};

// ===== SAFE NUMBER COLLECTOR =====
function getNextNumbers(lines: string[], startIndex: number, count: number): { values: number[]; consumed: number } {
  const values: number[] = [];
  let consumed = 0;
  let idx = startIndex;
  while (idx < lines.length && values.length < count) {
    if (isNumber(lines[idx])) {
      values.push(toNumber(lines[idx]));
    }
    // skip text lines silently
    consumed++;
    idx++;
  }
  return { values, consumed };
}

// ===== TYPES =====
export interface StatPair {
  team1: number;
  team2: number;
}

export interface TeamGmGp {
  scored: number;
  conceded: number;
  average: number;
}

export interface ParsedMatchStats {
  team1: string;
  team2: string;
  stats: Record<string, StatPair>;
  team1GmGp?: TeamGmGp;
  team2GmGp?: TeamGmGp;
  debugLog: string[];
}

// ===== MAIN PARSER =====
export function parseMatchStats(rawText: string): ParsedMatchStats {
  const lines = rawText
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0);

  const result: ParsedMatchStats = {
    team1: '',
    team2: '',
    stats: {},
    debugLog: [],
  };

  if (lines.length < 2) return result;

  const log = (msg: string) => result.debugLog.push(msg);

  // STEP 1: Detect team names (first 2 text lines that look like team names)
  let teamNamesFound = 0;
  let dataStartIndex = 0;

  for (let i = 0; i < lines.length && teamNamesFound < 2; i++) {
    if (isTeamName(lines[i])) {
      if (teamNamesFound === 0) {
        result.team1 = lines[i];
        log(`🏠 Team 1 detected: "${lines[i]}"`);
      } else {
        result.team2 = lines[i];
        log(`✈️ Team 2 detected: "${lines[i]}"`);
      }
      teamNamesFound++;
      dataStartIndex = i + 1;
    }
  }

  // STEP 2: Parse stats sequentially with no-overwrite rule
  let currentTeamBlock = 0; // 0 = shared, 1 = team1 block, 2 = team2 block
  let i = dataStartIndex;

  while (i < lines.length) {
    const norm = normalize(lines[i]);

    // Skip noise
    if (isNoiseLine(norm)) { i++; continue; }

    // Detect team name repetition → new block
    if (isTeamName(lines[i])) {
      const nameNorm = normalize(lines[i]);
      if (result.team1 && normalize(result.team1) === nameNorm) {
        currentTeamBlock = 1;
        log(`🔄 Block switch → Team 1: "${lines[i]}"`);
      } else if (result.team2 && normalize(result.team2) === nameNorm) {
        currentTeamBlock = 2;
        log(`🔄 Block switch → Team 2: "${lines[i]}"`);
      }
      i++;
      continue;
    }

    // GM/GP block: "Sintetizat" or "GM" → collect next 3 numbers
    if (isGmGpTrigger(norm)) {
      const { values, consumed } = getNextNumbers(lines, i + 1, 3);
      if (values.length === 3) {
        const gmgp: TeamGmGp = { scored: values[0], conceded: values[1], average: values[2] };
        if (currentTeamBlock === 2) {
          result.team2GmGp = gmgp;
          log(`📊 GM/GP Team 2: scored=${values[0]}, conceded=${values[1]}, avg=${values[2]}`);
        } else {
          // Default to team1 or first unset
          if (!result.team1GmGp) {
            result.team1GmGp = gmgp;
            log(`📊 GM/GP Team 1: scored=${values[0]}, conceded=${values[1]}, avg=${values[2]}`);
          } else if (!result.team2GmGp) {
            result.team2GmGp = gmgp;
            log(`📊 GM/GP Team 2: scored=${values[0]}, conceded=${values[1]}, avg=${values[2]}`);
          }
        }
        i += 1 + consumed;
        continue;
      }
      log(`⚠️ GM/GP block invalid (found ${values.length}/3 numbers)`);
      i++;
      continue;
    }

    // FORMAT A: number → statName → number
    if (isNumber(lines[i])) {
      const value1 = toNumber(lines[i]);
      if (i + 1 < lines.length && !isNumber(lines[i + 1])) {
        const statNorm = normalize(lines[i + 1]);
        const statKey = matchStat(statNorm);
        if (statKey && i + 2 < lines.length && isNumber(lines[i + 2])) {
          const value2 = toNumber(lines[i + 2]);
          // NO OVERWRITE: only assign if key not already set
          if (!(statKey in result.stats)) {
            result.stats[statKey] = { team1: value1, team2: value2 };
            log(`✅ Detected: "${lines[i + 1]}" → Mapped to: ${statKey} → Values: ${value1} / ${value2}`);
          } else {
            log(`🔒 SKIP (already set): ${statKey} = ${result.stats[statKey].team1}/${result.stats[statKey].team2}`);
          }
          i += 3;
          continue;
        }
      }
      i++;
      continue;
    }

    // FORMAT B: statName → number → number
    const statKey = matchStat(norm);
    if (statKey) {
      if (i + 1 < lines.length && isNumber(lines[i + 1])) {
        const value1 = toNumber(lines[i + 1]);
        const value2 = (i + 2 < lines.length && isNumber(lines[i + 2])) ? toNumber(lines[i + 2]) : 0;
        const advance = (i + 2 < lines.length && isNumber(lines[i + 2])) ? 3 : 2;

        if (!(statKey in result.stats)) {
          result.stats[statKey] = { team1: value1, team2: value2 };
          log(`✅ Detected: "${lines[i]}" → Mapped to: ${statKey} → Values: ${value1} / ${value2}`);
        } else {
          log(`🔒 SKIP (already set): ${statKey} = ${result.stats[statKey].team1}/${result.stats[statKey].team2}`);
        }
        i += advance;
        continue;
      }
    }

    i++;
  }

  // VALIDATION: shots_on_target should not exceed shots
  if (result.stats['shots_on_target'] && result.stats['shots']) {
    const sot = result.stats['shots_on_target'];
    const shots = result.stats['shots'];
    if (sot.team1 > shots.team1 || sot.team2 > shots.team2) {
      log(`⚠️ VALIDATION: shots_on_target (${sot.team1}/${sot.team2}) > shots (${shots.team1}/${shots.team2}) — keeping values but flagged`);
    }
  }

  return result;
}

// ===== APPLY PARSED STATS TO MATCH DATA =====
export function applyParsedStats(
  parsed: ParsedMatchStats,
  match: any
): { updated: any; fieldsFound: number; log: string[] } {
  const updated = JSON.parse(JSON.stringify(match));
  const log: string[] = [...parsed.debugLog];
  let fieldsFound = 0;

  if (parsed.team1) {
    updated.homeTeam.name = parsed.team1;
    fieldsFound++;
  }
  if (parsed.team2) {
    updated.awayTeam.name = parsed.team2;
    fieldsFound++;
  }

  // Apply GM/GP
  if (parsed.team1GmGp) {
    updated.homeTeam.goalsScored = parsed.team1GmGp.scored;
    updated.homeTeam.goalsConceded = parsed.team1GmGp.conceded;
    fieldsFound += 2;
    log.push(`📊 GM/GP → Home: scored=${parsed.team1GmGp.scored}, conceded=${parsed.team1GmGp.conceded}, avg=${parsed.team1GmGp.average}`);
  }
  if (parsed.team2GmGp) {
    updated.awayTeam.goalsScored = parsed.team2GmGp.scored;
    updated.awayTeam.goalsConceded = parsed.team2GmGp.conceded;
    fieldsFound += 2;
    log.push(`📊 GM/GP → Away: scored=${parsed.team2GmGp.scored}, conceded=${parsed.team2GmGp.conceded}, avg=${parsed.team2GmGp.average}`);
  }

  // Apply stats by KEY (never by position)
  for (const [statKey, pair] of Object.entries(parsed.stats)) {
    const fieldName = STAT_TO_FIELD[statKey];
    if (fieldName && fieldName in updated.homeTeam) {
      updated.homeTeam[fieldName] = pair.team1;
      updated.awayTeam[fieldName] = pair.team2;
      fieldsFound += 2;
      log.push(`📊 ${statKey} → ${fieldName}: ${pair.team1} / ${pair.team2}`);
    } else {
      log.push(`⚠️ ${statKey} → ${pair.team1} / ${pair.team2} (unmapped)`);
    }
  }

  return { updated, fieldsFound, log };
}
