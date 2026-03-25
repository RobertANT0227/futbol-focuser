/**
 * Strict sequential stats parser.
 * 
 * Algorithm:
 * 1. Split text into lines
 * 2. Loop line by line
 * 3. Text-only line → stat name
 * 4. Numeric line → collect as Team1 then Team2
 * 5. After 2 numbers found, store and move on
 */

const IGNORE_PATTERNS = [
  /^top\s+statistici$/i,
  /^total$/i,
  /^medie$/i,
  /^statistici$/i,
];

// Mapping from parsed stat name keywords to MatchData field keys
// Each entry: [keywords[], homeTeamKey, awayTeamKey]
export const STAT_FIELD_MAP: [string[], string, string][] = [
  [['goluri marcate', 'goals scored', 'goals for'], 'goalsScored', 'goalsScored'],
  [['goluri primite', 'goals conceded', 'goals against'], 'goalsConceded', 'goalsConceded'],
  [['goluri', 'goals', 'gol'], 'goalsScored', 'goalsScored'],
  [['goluri asteptate', 'goluri așteptate', 'expected goals', 'xg'], 'xG', 'xG'],
  [['suturi pe poarta', 'șuturi pe poartă', 'shots on target', 'ocazii mari'], 'shotsOnTarget', 'shotsOnTarget'],
  [['suturi totale', 'șuturi totale', 'total shots', 'suturi', 'șuturi', 'shots'], 'shots', 'shots'],
  [['posesie', 'possession'], 'possession', 'possession'],
  [['cornere', 'corners'], 'cornersPerMatch', 'cornersPerMatch'],
  [['faulturi', 'fouls'], 'fouls', 'fouls'],
  [['cartonase galbene', 'cartonașe galbene', 'yellow cards', 'cartonase', 'cartonașe', 'cards'], 'cardsPerMatch', 'cardsPerMatch'],
  [['atacuri periculoase', 'dangerous attacks'], 'dangerousAttacks', 'dangerousAttacks'],
  [['parade portar', 'gk saves', 'saves'], 'gkSaves', 'gkSaves'],
  [['ofsaiduri', 'offsides'], 'fouls', 'fouls'],
];

export interface ParsedStat {
  name: string;
  team1: number;
  team2: number;
  homeKey: string;
  awayKey: string;
}

function isIgnored(line: string): boolean {
  return IGNORE_PATTERNS.some(p => p.test(line));
}

/** Check if a string is a valid number token (possibly with % or comma) */
function extractNumber(s: string): number | null {
  const cleaned = s.replace('%', '').replace(',', '.').trim();
  if (cleaned === '') return null;
  // Must match a full number pattern
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

/** Check if a line is purely text (no numbers at all) */
function isTextOnly(line: string): boolean {
  // Remove % signs, then check if any digit sequence exists
  const stripped = line.replace(/%/g, '');
  return !/\d/.test(stripped);
}

/** Extract all number tokens from a line, preserving decimals */
function extractAllNumbers(line: string): number[] {
  const numbers: number[] = [];
  // Match numbers like 6, 6.78, 6,78, 0.96, 58% — keeping decimals intact
  const matches = line.match(/\d+[.,]\d+%?|\d+%?/g);
  if (!matches) return numbers;
  for (const m of matches) {
    const n = extractNumber(m);
    if (n !== null) numbers.push(n);
  }
  return numbers;
}

function matchStatName(name: string): [string, string] | null {
  const lower = name.toLowerCase()
    .replace(/ș/g, 'ș').replace(/ț/g, 'ț')
    .replace(/ă/g, 'ă').replace(/â/g, 'â').replace(/î/g, 'î');

  for (const [keywords, homeKey, awayKey] of STAT_FIELD_MAP) {
    for (const kw of keywords) {
      if (lower.includes(kw)) {
        return [homeKey, awayKey];
      }
    }
  }
  return null;
}

/**
 * Main parser: strict sequential line-by-line reading.
 */
export function parseStatsText(rawText: string): ParsedStat[] {
  const lines = rawText
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0);

  const results: ParsedStat[] = [];
  let currentStatName: string | null = null;
  let numbersCollected: number[] = [];

  const flush = () => {
    if (currentStatName && numbersCollected.length >= 2) {
      const mapping = matchStatName(currentStatName);
      if (mapping) {
        results.push({
          name: currentStatName,
          team1: numbersCollected[0],
          team2: numbersCollected[1],
          homeKey: mapping[0],
          awayKey: mapping[1],
        });
      }
    }
    currentStatName = null;
    numbersCollected = [];
  };

  for (const line of lines) {
    // Skip ignored lines
    if (isIgnored(line)) continue;

    // STEP 3: Check if line has BOTH text and numbers on same line
    // e.g. "Goluri  2.7  1.3" or tabular format
    const parts = line.split(/[\t|]|(?:\s{2,})/).map(p => p.trim()).filter(Boolean);
    
    if (parts.length >= 3) {
      // Could be tabular: "Label  Val1  Val2"
      const label = parts[0];
      const nums = extractAllNumbers(parts.slice(1).join(' '));
      if (isTextOnly(label) && nums.length >= 2 && !isIgnored(label)) {
        // Flush any pending stat
        flush();
        const mapping = matchStatName(label);
        if (mapping) {
          results.push({
            name: label,
            team1: nums[0],
            team2: nums[1],
            homeKey: mapping[0],
            awayKey: mapping[1],
          });
        }
        continue;
      }
    }

    // Check if entire line is text-only → new stat name
    if (isTextOnly(line)) {
      // Flush previous stat if we had one
      flush();
      currentStatName = line;
      continue;
    }

    // Line contains numbers → extract them
    const nums = extractAllNumbers(line);
    if (nums.length > 0 && currentStatName) {
      for (const n of nums) {
        numbersCollected.push(n);
        if (numbersCollected.length >= 2) break;
      }
    }

    // If a line has 2+ numbers and we also have a stat name from same line
    if (!currentStatName && nums.length >= 2) {
      // Numbers without a preceding stat name — skip
      continue;
    }
  }

  // Flush last stat
  flush();

  return results;
}
