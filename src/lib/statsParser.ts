/**
 * Strict sequential football stats parser.
 * 
 * Format expected:
 *   Team1Name
 *   Team2Name
 *   value1 (number)
 *   StatName (text)
 *   value2 (number)
 *   ...repeats...
 */

// Normalization map: lowercase keyword → canonical key
const STAT_NAME_MAP: Record<string, string> = {
  'goluri': 'goals',
  'goals': 'goals',
  'gol': 'goals',
  'posesie': 'possession',
  'possession': 'possession',
  'total șuturi': 'shots',
  'total suturi': 'shots',
  'șuturi totale': 'shots',
  'suturi totale': 'shots',
  'shots': 'shots',
  'șuturi': 'shots',
  'suturi': 'shots',
  'șuturi pe poartă': 'shots_on_target',
  'suturi pe poarta': 'shots_on_target',
  'shots on target': 'shots_on_target',
  'ocazii mari create': 'big_chances',
  'ocazii mari': 'big_chances',
  'big chances': 'big_chances',
  'cornere': 'corners',
  'corners': 'corners',
  'faulturi': 'fouls',
  'fouls': 'fouls',
  'cartonașe galbene': 'yellow_cards',
  'cartonase galbene': 'yellow_cards',
  'cartonașe': 'yellow_cards',
  'cartonase': 'yellow_cards',
  'yellow cards': 'yellow_cards',
  'cards': 'yellow_cards',
  'goluri așteptate': 'xg',
  'goluri asteptate': 'xg',
  'expected goals': 'xg',
  'xg': 'xg',
  'atacuri periculoase': 'dangerous_attacks',
  'dangerous attacks': 'dangerous_attacks',
  'parade portar': 'gk_saves',
  'gk saves': 'gk_saves',
  'saves': 'gk_saves',
  'ofsaiduri': 'offsides',
  'offsides': 'offsides',
  'pase cheie': 'key_passes',
  'key passes': 'key_passes',
};

// Map canonical stat keys to TeamStats field names
const STAT_TO_FIELD: Record<string, string> = {
  'goals': 'goalsScored',
  'possession': 'possession',
  'shots': 'shots',
  'shots_on_target': 'shotsOnTarget',
  'big_chances': 'shotsOnTarget', // approximate
  'corners': 'cornersPerMatch',
  'fouls': 'fouls',
  'yellow_cards': 'cardsPerMatch',
  'xg': 'xG',
  'dangerous_attacks': 'dangerousAttacks',
  'gk_saves': 'gkSaves',
  'offsides': 'fouls', // approximate
};

export interface StatPair {
  team1: number;
  team2: number;
}

export type DetectedPlaystyle = 'BUS PARKING' | 'HIGH PRESS' | 'NEUTRAL';

export interface PlaystyleResult {
  style: DetectedPlaystyle;
  reasons: string[];
  bettingSuggestions: string[];
}

export interface ParsedMatchStats {
  team1: string;
  team2: string;
  stats: Record<string, StatPair>;
  team1Playstyle: PlaystyleResult;
  team2Playstyle: PlaystyleResult;
}

/** Check if a string represents a number: 1.7, 6.78, 50.1%, 6,78 */
function isNumber(line: string): boolean {
  const cleaned = line.replace(/%/g, '').replace(/,/g, '.').trim();
  if (cleaned === '') return false;
  const n = parseFloat(cleaned);
  return !isNaN(n) && isFinite(n);
}

/** Parse a string into a number */
function toNumber(line: string): number {
  return parseFloat(line.replace(/%/g, '').replace(/,/g, '.').trim());
}

/** Normalize a stat name to its canonical key */
function normalizeStat(name: string): string | null {
  const lower = name.toLowerCase().trim();
  // Try exact match first
  if (STAT_NAME_MAP[lower]) return STAT_NAME_MAP[lower];
  // Try partial match
  for (const [key, val] of Object.entries(STAT_NAME_MAP)) {
    if (lower.includes(key) || key.includes(lower)) return val;
  }
  return null;
}

/**
 * Main parser function.
 * 
 * Logic:
 * 1. Split into lines, trim, remove empty
 * 2. First 2 text lines = team names
 * 3. From index 2 onward: number → statName → number pattern
 */
/** Detect playstyle for a team based on parsed stats */
function detectPlaystyleFromStats(
  teamName: string,
  stats: Record<string, StatPair>,
  teamKey: 'team1' | 'team2'
): PlaystyleResult {
  const get = (key: string): number | null => {
    const pair = stats[key];
    return pair ? pair[teamKey] : null;
  };

  const possession = get('possession');
  const shots = get('shots');
  const dangerousAttacks = get('dangerous_attacks');
  const gkSaves = get('gk_saves');
  const fouls = get('fouls');
  const yellowCards = get('yellow_cards');

  // BUS PARKING detection
  const busConditions: string[] = [];
  if (possession !== null && possession < 43) busConditions.push(`possession = ${possession}%`);
  if (shots !== null && shots < 8) busConditions.push(`shots = ${shots}`);
  if (dangerousAttacks !== null && dangerousAttacks < 38) busConditions.push(`dangerous attacks = ${dangerousAttacks}`);
  if (gkSaves !== null && gkSaves >= 4) busConditions.push(`goalkeeper saves = ${gkSaves}`);

  if (busConditions.length >= 3) {
    return {
      style: 'BUS PARKING',
      reasons: busConditions,
      bettingSuggestions: ['Under 2.5', 'Under 3.5', 'Opponent corners over'],
    };
  }

  // HIGH PRESS detection
  const pressConditions: string[] = [];
  if (fouls !== null && fouls >= 13) pressConditions.push(`fouls = ${fouls}`);
  if (dangerousAttacks !== null && dangerousAttacks >= 55) pressConditions.push(`dangerous attacks = ${dangerousAttacks}`);
  if (shots !== null && shots >= 14) pressConditions.push(`shots = ${shots}`);
  if (yellowCards !== null && yellowCards >= 2) pressConditions.push(`yellow cards = ${yellowCards}`);

  if (pressConditions.length >= 3) {
    return {
      style: 'HIGH PRESS',
      reasons: pressConditions,
      bettingSuggestions: ['Over 2.5', 'BTTS', 'Over corners'],
    };
  }

  return {
    style: 'NEUTRAL',
    reasons: ['No extreme pattern detected'],
    bettingSuggestions: [],
  };
}

/** Generate combined betting suggestions based on both team styles */
function combinedBettingSuggestions(t1: PlaystyleResult, t2: PlaystyleResult): string[] {
  const suggestions: string[] = [];

  if (t1.style === 'BUS PARKING' || t2.style === 'BUS PARKING') {
    suggestions.push('Under 2.5', 'Under 3.5');
    if (t1.style === 'BUS PARKING') suggestions.push('Opponent (Team 1) corners over');
    if (t2.style === 'BUS PARKING') suggestions.push('Opponent (Team 2) corners over');
  }

  if (t1.style === 'HIGH PRESS' && t2.style === 'HIGH PRESS') {
    suggestions.push('Over 2.5', 'BTTS', 'Over corners');
  }

  return suggestions;
}

export function parseMatchStats(rawText: string): ParsedMatchStats {
  const lines = rawText
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0);

  const defaultPlaystyle: PlaystyleResult = { style: 'NEUTRAL', reasons: [], bettingSuggestions: [] };

  const result: ParsedMatchStats = {
    team1: '',
    team2: '',
    stats: {},
    team1Playstyle: defaultPlaystyle,
    team2Playstyle: defaultPlaystyle,
  };

  if (lines.length < 2) return result;

  // STEP: First 2 valid text lines = team names
  let teamNamesFound = 0;
  let dataStartIndex = 0;

  for (let i = 0; i < lines.length && teamNamesFound < 2; i++) {
    if (!isNumber(lines[i])) {
      if (teamNamesFound === 0) {
        result.team1 = lines[i];
      } else {
        result.team2 = lines[i];
      }
      teamNamesFound++;
      dataStartIndex = i + 1;
    }
  }

  // STEP: Loop from dataStartIndex
  // Pattern: value1 (number) → statName (text) → value2 (number)
  let i = dataStartIndex;
  while (i < lines.length) {
    if (isNumber(lines[i])) {
      const value1 = toNumber(lines[i]);

      // Next line must be stat name (text)
      if (i + 1 < lines.length && !isNumber(lines[i + 1])) {
        const statName = lines[i + 1];

        // Next line must be value2 (number)
        if (i + 2 < lines.length && isNumber(lines[i + 2])) {
          const value2 = toNumber(lines[i + 2]);
          const normalized = normalizeStat(statName);

          if (normalized) {
            result.stats[normalized] = { team1: value1, team2: value2 };
          }

          i += 3; // Skip all 3 lines
          continue;
        }
      }
    }
    i++;
  }

  // STEP: Detect playstyles from parsed stats
  result.team1Playstyle = detectPlaystyleFromStats(result.team1, result.stats, 'team1');
  result.team2Playstyle = detectPlaystyleFromStats(result.team2, result.stats, 'team2');

  return result;
}

/** Apply parsed stats to a MatchData object, returns count of fields filled */
export function applyParsedStats(
  parsed: ParsedMatchStats,
  match: any // MatchData
): { updated: any; fieldsFound: number; log: string[] } {
  const updated = JSON.parse(JSON.stringify(match));
  const log: string[] = [];
  let fieldsFound = 0;

  // Apply team names
  if (parsed.team1) {
    updated.homeTeam.name = parsed.team1;
    fieldsFound++;
    log.push(`Echipa 1: ${parsed.team1}`);
  }
  if (parsed.team2) {
    updated.awayTeam.name = parsed.team2;
    fieldsFound++;
    log.push(`Echipa 2: ${parsed.team2}`);
  }

  // Apply stats
  for (const [statKey, pair] of Object.entries(parsed.stats)) {
    const fieldName = STAT_TO_FIELD[statKey];
    if (fieldName && fieldName in updated.homeTeam) {
      updated.homeTeam[fieldName] = pair.team1;
      updated.awayTeam[fieldName] = pair.team2;
      fieldsFound += 2;
      log.push(`${statKey} → ${pair.team1} / ${pair.team2}`);
    }
  }

  return { updated, fieldsFound, log };
}
