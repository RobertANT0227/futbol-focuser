/**
 * Strict deterministic football stats parser v4.
 * No AI guessing — pure sequential logic with text normalization.
 * Features: team detection, table-mode GM/GP, Sinteza/Acasa/Deplasare, strict key lock.
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

// ===== EXTRACT ALL NUMBERS FROM A LINE =====
function extractNumbersFromLine(line: string): number[] {
  const cleaned = line.replace(/,/g, '.').replace(/%/g, '');
  const matches = cleaned.match(/-?\d+\.?\d*/g);
  if (!matches) return [];
  return matches.map(m => parseFloat(m)).filter(n => !isNaN(n) && isFinite(n));
}

// ===== TEAM NAME DETECTION =====
function isTeamName(line: string): boolean {
  if (line.length <= 3) return false;
  if (isNumber(line)) return false;
  if (!/[a-zA-ZăâîșțĂÂÎȘȚ]/.test(line)) return false;
  const norm = normalize(line);
  if (isNoiseLine(norm)) return false;
  if (matchStat(norm)) return false;
  if (isTableHeader(norm)) return false;
  if (isSintezaLine(norm)) return false;
  if (isAcasaLine(norm) || isDeplaclareLine(norm)) return false;
  return true;
}

// ===== FORM RESULT DETECTION =====
const FORM_MAP: Record<string, 'W' | 'D' | 'L'> = {
  'v': 'W', 'w': 'W', 'victorie': 'W',
  'e': 'D', 'd': 'D', 'egal': 'D',
  'i': 'L', 'l': 'L', 'infrangere': 'L',
};

function isFormResult(token: string): boolean {
  return token.toLowerCase() in FORM_MAP;
}

function toFormResult(token: string): 'W' | 'D' | 'L' {
  return FORM_MAP[token.toLowerCase()] || 'L';
}

function extractFormResults(lines: string[], startIndex: number, maxCount: number): { results: ('W' | 'D' | 'L')[]; consumed: number } {
  const results: ('W' | 'D' | 'L')[] = [];
  let consumed = 0;
  let idx = startIndex;

  while (idx < lines.length && results.length < maxCount) {
    const line = lines[idx].trim();
    // Try inline: "W L L W L" or "V E I V I"
    const tokens = line.split(/[\s,;]+/).filter(t => t.length > 0);
    let foundAny = false;
    for (const token of tokens) {
      const clean = removeDiacritics(token.toLowerCase().replace(/[^a-zA-ZăâîșțĂÂÎȘȚ]/g, ''));
      if (clean && isFormResult(clean) && results.length < maxCount) {
        results.push(toFormResult(clean));
        foundAny = true;
      }
    }
    if (foundAny) {
      consumed++;
      idx++;
      continue;
    }
    // If line is not a form result and we already have some, stop
    if (results.length > 0) break;
    // If line has numbers or is noise, skip it but keep looking
    if (isNumber(line) || line.length === 0) {
      consumed++;
      idx++;
      continue;
    }
    // Not a form result line — stop
    break;
  }
  return { results, consumed };
}

// ===== FORM HEADER DETECTION =====
function isFormHeader(normalized: string): boolean {
  return normalized.includes('mj') && (normalized.includes('v') || normalized.includes('e'));
}

function isFormaSintezaLine(normalized: string): boolean {
  return normalized.startsWith('sintez') || normalized === 'general' || 
         normalized.startsWith('forma ultimele') || normalized.startsWith('forma general');
}

function isFormaAcasaLine(normalized: string): boolean {
  return normalized === 'acasa' || normalized.startsWith('acasa ') || normalized.startsWith('forma acasa');
}

function isFormaDeplaclareLine(normalized: string): boolean {
  return normalized === 'deplasare' || normalized.startsWith('deplasare ') || normalized.startsWith('forma deplasare');
}

// ===== NOISE FILTER =====
const NOISE_PATTERNS = [
  'top statistici', 'total', 'ultimele 5', 'ppm',
  'statistici cheie', 'rezumat', 'clasament', 'forma echipei',
];

function isNoiseLine(normalized: string): boolean {
  // Also treat pure "/meci" as noise
  if (normalized === '/meci' || normalized === 'meci') return true;
  return NOISE_PATTERNS.some(p => normalized === p || normalized.startsWith(p + ' '));
}

// ===== TABLE HEADER DETECTION =====
function isTableHeader(normalized: string): boolean {
  return (normalized.includes('gm') && normalized.includes('gp')) ||
         (normalized.includes('gm') && normalized.includes('medie')) ||
         (normalized.includes('gp') && normalized.includes('medie'));
}

// ===== SINTEZA / SINTETIZAT DETECTION =====
function isSintezaLine(normalized: string): boolean {
  return normalized.startsWith('sintez') || normalized.startsWith('sintetizat');
}

// ===== ACASA / DEPLASARE DETECTION =====
function isAcasaLine(normalized: string): boolean {
  return normalized === 'acasa' || normalized.startsWith('acasa ');
}

function isDeplaclareLine(normalized: string): boolean {
  return normalized === 'deplasare' || normalized.startsWith('deplasare ');
}

// ===== STRICT STAT MAPPING (priority order: most specific first) =====
const STAT_MATCHERS: { pattern: string; key: string; exact?: boolean }[] = [
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

// ===== SAFE NUMBER COLLECTOR (scan forward, skip text, collect N numbers) =====
function getNextNumbers(lines: string[], startIndex: number, count: number): { values: number[]; consumed: number } {
  const values: number[] = [];
  let consumed = 0;
  let idx = startIndex;
  while (idx < lines.length && values.length < count) {
    // Extract numbers from line (could be inline or standalone)
    const lineNums = extractNumbersFromLine(lines[idx]);
    if (lineNums.length > 0) {
      for (const n of lineNums) {
        if (values.length < count) values.push(n);
      }
    }
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

export interface TeamHomeAway {
  scored: number;
  conceded: number;
  total: number;
}

export interface ParsedMatchStats {
  team1: string;
  team2: string;
  stats: Record<string, StatPair>;
  team1GmGp?: TeamGmGp;
  team2GmGp?: TeamGmGp;
  team1Home?: TeamHomeAway;
  team1Away?: TeamHomeAway;
  team2Home?: TeamHomeAway;
  team2Away?: TeamHomeAway;
  team1FormGeneral?: ('W' | 'D' | 'L')[];
  team1FormHome?: ('W' | 'D' | 'L')[];
  team1FormAway?: ('W' | 'D' | 'L')[];
  team2FormGeneral?: ('W' | 'D' | 'L')[];
  team2FormHome?: ('W' | 'D' | 'L')[];
  team2FormAway?: ('W' | 'D' | 'L')[];
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

  // STEP 1: Detect team names
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

  // STEP 2: Parse stats sequentially
  let currentTeamBlock = 0; // 0=shared, 1=team1, 2=team2
  let tableMode = false;
  let i = dataStartIndex;

  while (i < lines.length) {
    const norm = normalize(lines[i]);

    // Skip pure noise
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

    // TABLE HEADER: "GM GP Medie" → activate table mode
    if (isTableHeader(norm)) {
      tableMode = true;
      log(`📋 Table header detected: "${lines[i]}" → table mode ON`);
      i++;
      continue;
    }

    // SINTEZA / SINTETIZAT: collect next 3 numbers (stacked or inline)
    // VALUE ORDER: val1=GM (goluri marcate), val2=GP (goluri primite), val3=Medie/total
    if (isSintezaLine(norm)) {
      const inlineNums = extractNumbersFromLine(lines[i]);
      let gmgpValues: number[] = [];
      let consumed = 0;

      if (inlineNums.length >= 3) {
        gmgpValues = inlineNums.slice(0, 3);
      } else {
        gmgpValues = [...inlineNums];
        const remaining = 3 - gmgpValues.length;
        const { values, consumed: c } = getNextNumbers(lines, i + 1, remaining);
        gmgpValues.push(...values);
        consumed = c;
      }

      if (gmgpValues.length === 3) {
        // CRITICAL: val1=GM(scored), val2=GP(conceded), val3=average — NEVER swap
        const gmgp: TeamGmGp = { scored: gmgpValues[0], conceded: gmgpValues[1], average: gmgpValues[2] };
        if (currentTeamBlock === 2) {
          result.team2GmGp = gmgp;
          log(`📊 Sinteza Team 2: GM=${gmgpValues[0]}, GP=${gmgpValues[1]}, Medie=${gmgpValues[2]}`);
        } else if (!result.team1GmGp) {
          result.team1GmGp = gmgp;
          log(`📊 Sinteza Team 1: GM=${gmgpValues[0]}, GP=${gmgpValues[1]}, Medie=${gmgpValues[2]}`);
        } else if (!result.team2GmGp) {
          result.team2GmGp = gmgp;
          log(`📊 Sinteza Team 2: GM=${gmgpValues[0]}, GP=${gmgpValues[1]}, Medie=${gmgpValues[2]}`);
        }
        i += 1 + consumed;
        continue;
      }
      log(`⚠️ Sinteza block invalid (found ${gmgpValues.length}/3 numbers)`);
      i++;
      continue;
    }

    // ACASA line: extract 3 inline numbers
    // VALUE ORDER: val1=GM(goluri marcate acasa), val2=GP(goluri primite acasa), val3=total
    if (isAcasaLine(norm)) {
      const nums = extractNumbersFromLine(lines[i]);
      let homeValues = nums;
      let consumed = 0;

      if (homeValues.length < 3) {
        const { values, consumed: c } = getNextNumbers(lines, i + 1, 3 - homeValues.length);
        homeValues = [...homeValues, ...values];
        consumed = c;
      }

      if (homeValues.length >= 3) {
        // CRITICAL: val1=GM_acasa, val2=GP_acasa, val3=total — NEVER swap
        const ha: TeamHomeAway = { scored: homeValues[0], conceded: homeValues[1], total: homeValues[2] };
        if (currentTeamBlock === 2) {
          result.team2Home = ha;
          log(`🏠 Acasa Team 2: GM_acasa=${ha.scored}, GP_acasa=${ha.conceded}, total=${ha.total}`);
        } else if (!result.team1Home) {
          result.team1Home = ha;
          log(`🏠 Acasa Team 1: GM_acasa=${ha.scored}, GP_acasa=${ha.conceded}, total=${ha.total}`);
        } else if (!result.team2Home) {
          result.team2Home = ha;
          log(`🏠 Acasa Team 2: GM_acasa=${ha.scored}, GP_acasa=${ha.conceded}, total=${ha.total}`);
        }
        i += 1 + consumed;
        continue;
      }
      log(`⚠️ Acasa line invalid (found ${homeValues.length}/3 numbers)`);
      i++;
      continue;
    }

    // DEPLASARE line: extract 3 inline numbers
    // VALUE ORDER: val1=GM(goluri marcate deplasare), val2=GP(goluri primite deplasare), val3=total
    if (isDeplaclareLine(norm)) {
      const nums = extractNumbersFromLine(lines[i]);
      let awayValues = nums;
      let consumed = 0;

      if (awayValues.length < 3) {
        const { values, consumed: c } = getNextNumbers(lines, i + 1, 3 - awayValues.length);
        awayValues = [...awayValues, ...values];
        consumed = c;
      }

      if (awayValues.length >= 3) {
        // CRITICAL: val1=GM_deplasare, val2=GP_deplasare, val3=total — NEVER swap
        const ha: TeamHomeAway = { scored: awayValues[0], conceded: awayValues[1], total: awayValues[2] };
        if (currentTeamBlock === 2) {
          result.team2Away = ha;
          log(`✈️ Deplasare Team 2: GM_deplasare=${ha.scored}, GP_deplasare=${ha.conceded}, total=${ha.total}`);
        } else if (!result.team1Away) {
          result.team1Away = ha;
          log(`✈️ Deplasare Team 1: GM_deplasare=${ha.scored}, GP_deplasare=${ha.conceded}, total=${ha.total}`);
        } else if (!result.team2Away) {
          result.team2Away = ha;
          log(`✈️ Deplasare Team 2: GM_deplasare=${ha.scored}, GP_deplasare=${ha.conceded}, total=${ha.total}`);
        }
        i += 1 + consumed;
        continue;
      }
      log(`⚠️ Deplasare line invalid (found ${awayValues.length}/3 numbers)`);
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
          if (!(statKey in result.stats)) {
            result.stats[statKey] = { team1: value1, team2: value2 };
            log(`✅ Detected: "${lines[i + 1]}" → ${statKey} → ${value1} / ${value2}`);
          } else {
            log(`🔒 SKIP (already set): ${statKey}`);
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
          log(`✅ Detected: "${lines[i]}" → ${statKey} → ${value1} / ${value2}`);
        } else {
          log(`🔒 SKIP (already set): ${statKey}`);
        }
        i += advance;
        continue;
      }
    }

    i++;
  }

  // VALIDATION
  if (result.stats['shots_on_target'] && result.stats['shots']) {
    const sot = result.stats['shots_on_target'];
    const shots = result.stats['shots'];
    if (sot.team1 > shots.team1 || sot.team2 > shots.team2) {
      log(`⚠️ VALIDATION: shots_on_target > shots — flagged`);
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

  // Apply GM/GP (Sinteza) — scored=GM, conceded=GP
  if (parsed.team1GmGp) {
    updated.homeTeam.goalsScored = parsed.team1GmGp.scored;
    updated.homeTeam.goalsConceded = parsed.team1GmGp.conceded;
    fieldsFound += 2;
    log.push(`📊 Sinteza → Home: GM=${parsed.team1GmGp.scored}, GP=${parsed.team1GmGp.conceded} (Medie=${parsed.team1GmGp.average})`);
  }
  if (parsed.team2GmGp) {
    updated.awayTeam.goalsScored = parsed.team2GmGp.scored;
    updated.awayTeam.goalsConceded = parsed.team2GmGp.conceded;
    fieldsFound += 2;
    log.push(`📊 Sinteza → Away: GM=${parsed.team2GmGp.scored}, GP=${parsed.team2GmGp.conceded} (Medie=${parsed.team2GmGp.average})`);
  }

  // Apply Home/Away — scored=GM, conceded=GP
  if (parsed.team1Home) {
    updated.homeTeam.goalsScoredHome = parsed.team1Home.scored;
    updated.homeTeam.goalsConcededHome = parsed.team1Home.conceded;
    fieldsFound += 2;
    log.push(`🏠 Acasa → Home: GM_acasa=${parsed.team1Home.scored}, GP_acasa=${parsed.team1Home.conceded}`);
  }
  if (parsed.team1Away) {
    updated.homeTeam.goalsScoredAway = parsed.team1Away.scored;
    updated.homeTeam.goalsConcededAway = parsed.team1Away.conceded;
    fieldsFound += 2;
    log.push(`✈️ Deplasare → Home team: GM_deplasare=${parsed.team1Away.scored}, GP_deplasare=${parsed.team1Away.conceded}`);
  }
  if (parsed.team2Home) {
    updated.awayTeam.goalsScoredHome = parsed.team2Home.scored;
    updated.awayTeam.goalsConcededHome = parsed.team2Home.conceded;
    fieldsFound += 2;
    log.push(`🏠 Acasa → Away team: GM_acasa=${parsed.team2Home.scored}, GP_acasa=${parsed.team2Home.conceded}`);
  }
  if (parsed.team2Away) {
    updated.awayTeam.goalsScoredAway = parsed.team2Away.scored;
    updated.awayTeam.goalsConcededAway = parsed.team2Away.conceded;
    fieldsFound += 2;
    log.push(`✈️ Deplasare → Away team: GM_deplasare=${parsed.team2Away.scored}, GP_deplasare=${parsed.team2Away.conceded}`);
  }

  // Apply stats by KEY
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
