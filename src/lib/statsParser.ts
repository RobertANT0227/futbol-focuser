/**
 * Strict deterministic football stats parser.
 * No AI guessing — pure sequential logic with text normalization.
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

// ===== NOISE FILTER =====
const NOISE_PATTERNS = [
  'top statistici', 'total', 'medie', 'ultimele 5', 'ppm',
  'statistici cheie', 'rezumat', 'clasament', 'forma echipei',
];

function isNoiseLine(normalized: string): boolean {
  return NOISE_PATTERNS.some(p => normalized === p || normalized.startsWith(p + ' '));
}

// ===== STRICT STAT MAPPING =====
// Order matters: longer/more specific patterns first
const STAT_MATCHERS: { pattern: string; key: string }[] = [
  { pattern: 'suturi pe poarta', key: 'shots_on_target' },
  { pattern: 'shots on target', key: 'shots_on_target' },
  { pattern: 'ocazii mari create', key: 'big_chances' },
  { pattern: 'ocazii mari', key: 'big_chances' },
  { pattern: 'big chances', key: 'big_chances' },
  { pattern: 'suturi pe meci', key: 'shots' },
  { pattern: 'total suturi', key: 'shots' },
  { pattern: 'suturi totale', key: 'shots' },
  { pattern: 'shots', key: 'shots' },
  { pattern: 'goluri asteptate', key: 'xg' },
  { pattern: 'expected goals', key: 'xg' },
  { pattern: 'xg', key: 'xg' },
  { pattern: 'goluri', key: 'goals' },
  { pattern: 'goals', key: 'goals' },
  { pattern: 'posesie', key: 'possession' },
  { pattern: 'possession', key: 'possession' },
  { pattern: 'cornere', key: 'corners' },
  { pattern: 'corners', key: 'corners' },
  { pattern: 'faulturi', key: 'fouls' },
  { pattern: 'fouls', key: 'fouls' },
  { pattern: 'cartonase galbene', key: 'yellow_cards' },
  { pattern: 'cartonase', key: 'yellow_cards' },
  { pattern: 'yellow cards', key: 'yellow_cards' },
  { pattern: 'cards', key: 'yellow_cards' },
  { pattern: 'atacuri periculoase', key: 'dangerous_attacks' },
  { pattern: 'dangerous attacks', key: 'dangerous_attacks' },
  { pattern: 'parade portar', key: 'gk_saves' },
  { pattern: 'gk saves', key: 'gk_saves' },
  { pattern: 'saves', key: 'gk_saves' },
  { pattern: 'ofsaiduri', key: 'offsides' },
  { pattern: 'ofsaid', key: 'offsides' },
  { pattern: 'offsides', key: 'offsides' },
  { pattern: 'pase cheie', key: 'key_passes' },
  { pattern: 'key passes', key: 'key_passes' },
];

function matchStat(normalizedLine: string): string | null {
  for (const { pattern, key } of STAT_MATCHERS) {
    if (normalizedLine === pattern || normalizedLine.includes(pattern)) {
      return key;
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
  'offsides': 'fouls',
};

// ===== TYPES =====
export interface StatPair {
  team1: number;
  team2: number;
}

export interface ParsedMatchStats {
  team1: string;
  team2: string;
  stats: Record<string, StatPair>;
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
  };

  if (lines.length < 2) return result;

  // STEP 1: First 2 text lines (non-number) = team names
  let teamNamesFound = 0;
  let dataStartIndex = 0;

  for (let i = 0; i < lines.length && teamNamesFound < 2; i++) {
    if (!isNumber(lines[i])) {
      const norm = normalize(lines[i]);
      if (isNoiseLine(norm)) continue;
      // Skip if it matches a known stat name
      if (matchStat(norm)) continue;
      
      if (teamNamesFound === 0) {
        result.team1 = lines[i];
      } else {
        result.team2 = lines[i];
      }
      teamNamesFound++;
      dataStartIndex = i + 1;
    }
  }

  // STEP 2: Parse stats using two formats:
  // Format A: number → statName → number
  // Format B: statName → number → number
  let i = dataStartIndex;
  while (i < lines.length) {
    const norm = normalize(lines[i]);
    
    // Skip noise
    if (isNoiseLine(norm)) { i++; continue; }

    // FORMAT A: value1 → statName → value2
    if (isNumber(lines[i])) {
      const value1 = toNumber(lines[i]);
      if (i + 1 < lines.length && !isNumber(lines[i + 1])) {
        const statNorm = normalize(lines[i + 1]);
        const statKey = matchStat(statNorm);
        if (statKey && i + 2 < lines.length && isNumber(lines[i + 2])) {
          const value2 = toNumber(lines[i + 2]);
          result.stats[statKey] = { team1: value1, team2: value2 };
          i += 3;
          continue;
        }
      }
      i++;
      continue;
    }

    // FORMAT B: statName → value1 → value2
    const statKey = matchStat(norm);
    if (statKey) {
      if (i + 1 < lines.length && isNumber(lines[i + 1])) {
        const value1 = toNumber(lines[i + 1]);
        if (i + 2 < lines.length && isNumber(lines[i + 2])) {
          result.stats[statKey] = { team1: value1, team2: value2(lines[i + 2]) };
          i += 3;
        } else {
          // Only one value found — assign to team1 only
          result.stats[statKey] = { team1: value1, team2: 0 };
          i += 2;
        }
        continue;
      }
    }

    i++;
  }

  return result;
}

// Helper for inline use
function value2(line: string): number {
  return toNumber(line);
}

// ===== APPLY PARSED STATS TO MATCH DATA =====
export function applyParsedStats(
  parsed: ParsedMatchStats,
  match: any
): { updated: any; fieldsFound: number; log: string[] } {
  const updated = JSON.parse(JSON.stringify(match));
  const log: string[] = [];
  let fieldsFound = 0;

  if (parsed.team1) {
    updated.homeTeam.name = parsed.team1;
    fieldsFound++;
    log.push(`🏠 Echipa 1: ${parsed.team1}`);
  }
  if (parsed.team2) {
    updated.awayTeam.name = parsed.team2;
    fieldsFound++;
    log.push(`✈️ Echipa 2: ${parsed.team2}`);
  }

  for (const [statKey, pair] of Object.entries(parsed.stats)) {
    const fieldName = STAT_TO_FIELD[statKey];
    if (fieldName && fieldName in updated.homeTeam) {
      updated.homeTeam[fieldName] = pair.team1;
      updated.awayTeam[fieldName] = pair.team2;
      fieldsFound += 2;
      log.push(`📊 ${statKey} → ${fieldName}: ${pair.team1} / ${pair.team2}`);
    } else {
      log.push(`⚠️ ${statKey} → ${pair.team1} / ${pair.team2} (no field mapping)`);
    }
  }

  return { updated, fieldsFound, log };
}
