/**
 * Strict deterministic football stats parser v5.
 * 4 sections: Statistics, Goals (GM/GP), Form, Odds
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
  if (isFormHeader(norm)) return false;
  if (isFormaSintezaLine(norm)) return false;
  if (isFormaAcasaLine(norm)) return false;
  if (isFormaDeplaclareLine(norm)) return false;
  if (norm === 'general') return false;
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
    if (results.length > 0) break;
    if (isNumber(line) || line.length === 0) {
      consumed++;
      idx++;
      continue;
    }
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
  if (normalized === '/meci' || normalized === 'meci') return true;
  return NOISE_PATTERNS.some(p => normalized === p || normalized.startsWith(p + ' '));
}

// ===== TABLE HEADER DETECTION =====
function isTableHeader(normalized: string): boolean {
  return (normalized.includes('gm') && normalized.includes('gp')) ||
         (normalized.includes('gm') && normalized.includes('medie')) ||
         (normalized.includes('gp') && normalized.includes('medie'));
}

function isSintezaLine(normalized: string): boolean {
  return normalized.startsWith('sintez') || normalized.startsWith('sintetizat');
}

function isAcasaLine(normalized: string): boolean {
  return normalized === 'acasa' || normalized.startsWith('acasa ');
}

function isDeplaclareLine(normalized: string): boolean {
  return normalized === 'deplasare' || normalized.startsWith('deplasare ');
}

// ===== STRICT STAT MAPPING =====
const STAT_MATCHERS: { pattern: string; key: string; exact?: boolean }[] = [
  { pattern: 'suturi pe poarta', key: 'shots_on_target' },
  { pattern: 'shots on target', key: 'shots_on_target' },
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

function getNextNumbers(lines: string[], startIndex: number, count: number): { values: number[]; consumed: number } {
  const values: number[] = [];
  let consumed = 0;
  let idx = startIndex;
  while (idx < lines.length && values.length < count) {
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

export interface ParsedOdds {
  home?: number;
  draw?: number;
  away?: number;
  overUnderLines: { line: number; over: number; under: number }[];
  bttsYes?: number;
  bttsNo?: number;
  cornerLines: { line: number; under: number; over: number }[];
  debugLog: string[];
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

// ===== ODDS PARSER =====
export function parseOdds(rawText: string): ParsedOdds {
  const lines = rawText
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0);

  const result: ParsedOdds = {
    overUnderLines: [],
    cornerLines: [],
    debugLog: [],
  };

  const log = (msg: string) => result.debugLog.push(msg);

  let i = 0;
  let section: 'none' | '1x2' | 'goals' | 'btts' | 'corners' = 'none';

  while (i < lines.length) {
    const norm = normalize(lines[i]);

    // Section detection
    if (norm === 'final' || norm === '1x2' || norm === 'rezultat final') {
      section = '1x2';
      log(`📋 Section: 1X2`);
      i++;
      continue;
    }

    if (norm.includes('sub') && norm.includes('peste') || norm === 'goluri' || norm === 'total goluri' || norm === 'over/under' || norm === 'peste/sub') {
      section = 'goals';
      log(`📋 Section: Over/Under Goals`);
      i++;
      continue;
    }

    if (norm === 'gg' || norm === 'btts' || norm.includes('ambele echipe') || norm.includes('gg/ng')) {
      section = 'btts';
      log(`📋 Section: BTTS`);
      i++;
      continue;
    }

    if (norm.includes('cornere') || norm.includes('corners') || norm.includes('corner')) {
      section = 'corners';
      log(`📋 Section: Corners`);
      i++;
      continue;
    }

    // 1X2 parsing: "1 4.55" or "X 4.00" or "2 1.75"
    if (section === '1x2' || section === 'none') {
      const match1x2 = lines[i].match(/^\s*(1|x|X|2)\s+([\d.,]+)\s*$/);
      if (match1x2) {
        const label = match1x2[1].toUpperCase();
        const value = toNumber(match1x2[2]);
        if (label === '1') { result.home = value; log(`✅ Cota 1 (Home): ${value}`); }
        if (label === 'X') { result.draw = value; log(`✅ Cota X (Draw): ${value}`); }
        if (label === '2') { result.away = value; log(`✅ Cota 2 (Away): ${value}`); }
        section = '1x2';
        i++;
        continue;
      }
    }

    // Over/Under goals parsing: "2.5 → 2.17 / 1.70" or "2.5 2.17 1.70"
    // Also handle "0.5 → 13.00 / 1.04" format
    if (section === 'goals' || section === 'none') {
      const nums = extractNumbersFromLine(lines[i]);
      // Pattern: line_value over_odds under_odds (3 numbers on one line)
      // But also: "line_value → over / under" where first=SUB(under), second=PESTE(over)
      // RULE: For goal lines the standard is first=OVER, second=UNDER
      // But user says "SUB = UNDER, PESTE = OVER" and format "0.5 → 13.00 / 1.04"
      // where first number after line = SUB(under), second = PESTE(over)
      // Actually re-reading: the format shows "0.5 → 13.00 / 1.04" which is sub/peste = under/over
      // So: first value = UNDER odds, second value = OVER odds? 
      // NO — re-reading again: the labels say "SUB / PESTE" so first=SUB=UNDER, second=PESTE=OVER
      // But wait, for standard Over 2.5 odds, 2.17 is usually over and 1.70 is under
      // Let me check: "2.5 → 2.17 / 1.70" — if over2.5 is 2.17 and under2.5 is 1.70, that's standard
      // The user's header says "SUB / PESTE" which would mean first=under, second=over
      // But the example "2.5 → 2.17 / 1.70" with 2.17 as under would be weird
      // I'll follow the user's explicit rule: first value = SUB = UNDER, second = PESTE = OVER
      // Actually wait — looking at the user's example more carefully:
      // "0.5 → 13.00 / 1.04" — under 0.5 goals at 13.00 makes no sense. Over 0.5 at 1.04 makes sense.
      // So 13.00 = SUB(under) 0.5, 1.04 = PESTE(over) 0.5. That checks out.
      // "2.5 → 2.17 / 1.70" — under 2.5 at 2.17, over 2.5 at 1.70. Hmm, that would mean over is favorite.
      // Actually that depends on the match. Let me just follow the rule: first=SUB=UNDER, second=PESTE=OVER
      if (nums.length === 3 && nums[0] % 0.5 === 0 && nums[0] <= 6) {
        const line = nums[0];
        const under = nums[1]; // SUB = UNDER (first value)
        const over = nums[2];  // PESTE = OVER (second value)
        result.overUnderLines.push({ line, over, under });
        log(`✅ Goals: Line ${line} → Under=${under}, Over=${over}`);
        section = 'goals';
        i++;
        continue;
      }
    }

    // BTTS parsing: "Da 1.69" or "Nu 2.17"
    if (section === 'btts' || section === 'none') {
      const bttsMatch = lines[i].match(/^\s*(da|nu|yes|no|gg|ng)\s+([\d.,]+)\s*$/i);
      if (bttsMatch) {
        const label = normalize(bttsMatch[1]);
        const value = toNumber(bttsMatch[2]);
        if (label === 'da' || label === 'yes' || label === 'gg') {
          result.bttsYes = value;
          log(`✅ BTTS Da (GG): ${value}`);
        } else {
          result.bttsNo = value;
          log(`✅ BTTS Nu (NG): ${value}`);
        }
        section = 'btts';
        i++;
        continue;
      }
    }

    // Corner lines: "10.5 1.56 2.32" → RULE: first=UNDER, second=OVER
    if (section === 'corners') {
      const nums = extractNumbersFromLine(lines[i]);
      if (nums.length === 3 && nums[0] % 0.5 === 0 && nums[0] >= 5 && nums[0] <= 15) {
        const line = nums[0];
        const under = nums[1]; // First value = UNDER
        const over = nums[2];  // Second value = OVER
        result.cornerLines.push({ line, under, over });
        log(`✅ Corners: Line ${line} → Under=${under}, Over=${over}`);
        i++;
        continue;
      }
    }

    i++;
  }

  return result;
}

// ===== ISOLATED STATS-ONLY PARSER (Section 1) =====
export function parseStatsOnly(rawText: string): ParsedMatchStats {
  const lines = rawText
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0);

  const result: ParsedMatchStats = { team1: '', team2: '', stats: {}, debugLog: [] };
  if (lines.length < 2) return result;
  const log = (msg: string) => result.debugLog.push(msg);

  let teamNamesFound = 0;
  let dataStartIndex = 0;

  for (let i = 0; i < lines.length && teamNamesFound < 2; i++) {
    if (isTeamName(lines[i])) {
      if (teamNamesFound === 0) { result.team1 = lines[i]; log(`🏠 Team 1: "${lines[i]}"`); }
      else { result.team2 = lines[i]; log(`✈️ Team 2: "${lines[i]}"`); }
      teamNamesFound++;
      dataStartIndex = i + 1;
    }
  }

  let i = dataStartIndex;
  while (i < lines.length) {
    const norm = normalize(lines[i]);
    if (isNoiseLine(norm) || isTableHeader(norm) || isSintezaLine(norm) ||
        isAcasaLine(norm) || isDeplaclareLine(norm) || isFormHeader(norm) ||
        isFormaSintezaLine(norm) || isFormaAcasaLine(norm) || isFormaDeplaclareLine(norm)) {
      log(`🚫 IGNORED (not stats): "${lines[i]}"`);
      i++; continue;
    }

    // Skip repeated team names
    if (isTeamName(lines[i])) { i++; continue; }

    // FORMAT A: number → statName → number
    if (isNumber(lines[i])) {
      const value1 = toNumber(lines[i]);
      if (i + 1 < lines.length && !isNumber(lines[i + 1])) {
        const statKey = matchStat(normalize(lines[i + 1]));
        if (statKey && i + 2 < lines.length && isNumber(lines[i + 2])) {
          const value2 = toNumber(lines[i + 2]);
          if (!(statKey in result.stats)) {
            result.stats[statKey] = { team1: value1, team2: value2 };
            log(`✅ ${statKey} → ${value1} / ${value2}`);
          }
          i += 3; continue;
        }
      }
      i++; continue;
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
          log(`✅ ${statKey} → ${value1} / ${value2}`);
        }
        i += advance; continue;
      }
    }
    i++;
  }

  // Validation
  if (result.stats['shots_on_target'] && result.stats['shots']) {
    const sot = result.stats['shots_on_target'];
    const shots = result.stats['shots'];
    if (sot.team1 > shots.team1 || sot.team2 > shots.team2) {
      log(`⚠️ VALIDATION: shots_on_target > shots — flagged`);
    }
  }

  return result;
}

// ===== ISOLATED GOALS-ONLY PARSER (Section 2) =====
export function parseGoalsOnly(rawText: string): ParsedMatchStats {
  const lines = rawText
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0);

  const result: ParsedMatchStats = { team1: '', team2: '', stats: {}, debugLog: [] };
  if (lines.length < 1) return result;
  const log = (msg: string) => result.debugLog.push(msg);

  let currentTeamBlock = 0;

  // Detect team names
  for (let i = 0; i < lines.length; i++) {
    if (isTeamName(lines[i])) {
      if (!result.team1) { result.team1 = lines[i]; log(`🏠 Team 1: "${lines[i]}"`); }
      else if (!result.team2 && normalize(lines[i]) !== normalize(result.team1)) {
        result.team2 = lines[i]; log(`✈️ Team 2: "${lines[i]}"`);
      }
    }
  }

  let i = 0;
  while (i < lines.length) {
    const norm = normalize(lines[i]);

    // Team block switch
    if (isTeamName(lines[i]) && result.team1 && normalize(lines[i]) === normalize(result.team1)) { currentTeamBlock = 1; i++; continue; }
    if (isTeamName(lines[i]) && result.team2 && normalize(lines[i]) === normalize(result.team2)) { currentTeamBlock = 2; i++; continue; }

    // Table header — skip
    if (isTableHeader(norm)) { log(`📋 Table header: "${lines[i]}"`); i++; continue; }

    // ONLY parse GM/GP blocks: Sinteza, Acasa, Deplasare
    if (isSintezaLine(norm)) {
      const inlineNums = extractNumbersFromLine(lines[i]);
      let vals: number[] = [];
      let consumed = 0;
      if (inlineNums.length >= 3) { vals = inlineNums.slice(0, 3); }
      else {
        vals = [...inlineNums];
        const { values, consumed: c } = getNextNumbers(lines, i + 1, 3 - vals.length);
        vals.push(...values); consumed = c;
      }
      if (vals.length === 3) {
        const gmgp: TeamGmGp = { scored: vals[0], conceded: vals[1], average: vals[2] };
        if (currentTeamBlock === 2) { result.team2GmGp = gmgp; }
        else if (!result.team1GmGp) { result.team1GmGp = gmgp; }
        else if (!result.team2GmGp) { result.team2GmGp = gmgp; }
        log(`📊 Sinteza: GM=${vals[0]}, GP=${vals[1]}, Medie=${vals[2]}`);
        i += 1 + consumed; continue;
      }
      i++; continue;
    }

    if (isAcasaLine(norm)) {
      const nums = extractNumbersFromLine(lines[i]);
      let vals = nums;
      let consumed = 0;
      if (vals.length < 3) { const r = getNextNumbers(lines, i + 1, 3 - vals.length); vals = [...vals, ...r.values]; consumed = r.consumed; }
      if (vals.length >= 3) {
        const ha: TeamHomeAway = { scored: vals[0], conceded: vals[1], total: vals[2] };
        if (currentTeamBlock === 2) { result.team2Home = ha; }
        else if (!result.team1Home) { result.team1Home = ha; }
        else if (!result.team2Home) { result.team2Home = ha; }
        log(`🏠 Acasa: GM=${vals[0]}, GP=${vals[1]}, total=${vals[2]}`);
        i += 1 + consumed; continue;
      }
      i++; continue;
    }

    if (isDeplaclareLine(norm)) {
      const nums = extractNumbersFromLine(lines[i]);
      let vals = nums;
      let consumed = 0;
      if (vals.length < 3) { const r = getNextNumbers(lines, i + 1, 3 - vals.length); vals = [...vals, ...r.values]; consumed = r.consumed; }
      if (vals.length >= 3) {
        const ha: TeamHomeAway = { scored: vals[0], conceded: vals[1], total: vals[2] };
        if (currentTeamBlock === 2) { result.team2Away = ha; }
        else if (!result.team1Away) { result.team1Away = ha; }
        else if (!result.team2Away) { result.team2Away = ha; }
        log(`✈️ Deplasare: GM=${vals[0]}, GP=${vals[1]}, total=${vals[2]}`);
        i += 1 + consumed; continue;
      }
      i++; continue;
    }

    i++;
  }

  return result;
}

// ===== ISOLATED FORM-ONLY PARSER (Section 3) =====
export function parseFormOnly(rawText: string): ParsedMatchStats {
  const lines = rawText
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0);

  const result: ParsedMatchStats = { team1: '', team2: '', stats: {}, debugLog: [] };
  if (lines.length < 1) return result;
  const log = (msg: string) => result.debugLog.push(msg);

  let currentTeamBlock = 0;

  // Detect team names
  for (let i = 0; i < lines.length; i++) {
    if (isTeamName(lines[i])) {
      if (!result.team1) { result.team1 = lines[i]; log(`🏠 Team 1: "${lines[i]}"`); }
      else if (!result.team2 && normalize(lines[i]) !== normalize(result.team1)) {
        result.team2 = lines[i]; log(`✈️ Team 2: "${lines[i]}"`);
      }
    }
  }

  let i = 0;
  while (i < lines.length) {
    const norm = normalize(lines[i]);

    // Team block switch
    if (isTeamName(lines[i]) && result.team1 && normalize(lines[i]) === normalize(result.team1)) { currentTeamBlock = 1; i++; continue; }
    if (isTeamName(lines[i]) && result.team2 && normalize(lines[i]) === normalize(result.team2)) { currentTeamBlock = 2; i++; continue; }

    // Ignore noise/numbers/headers
    if (isNoiseLine(norm) || isFormHeader(norm) || isTableHeader(norm)) { i++; continue; }

    // ONLY parse form blocks: Sinteza/General, Acasa, Deplasare
    const parseFormBlock = (setter: (results: ('W' | 'D' | 'L')[]) => void, label: string) => {
      const inlineTokens = lines[i].split(/[\s,;]+/).filter(t => {
        const c = removeDiacritics(t.toLowerCase().replace(/[^a-zA-ZăâîșțĂÂÎȘȚ]/g, ''));
        return isFormResult(c);
      });
      let formResults: ('W' | 'D' | 'L')[] = [];
      let consumed = 0;
      if (inlineTokens.length >= 3) {
        formResults = inlineTokens.slice(0, 5).map(t => toFormResult(removeDiacritics(t.toLowerCase())));
      } else {
        const r = extractFormResults(lines, i + 1, 5);
        formResults = r.results; consumed = r.consumed;
      }
      if (formResults.length > 0) {
        setter(formResults);
        log(`📝 ${label}: ${formResults.join(' ')}`);
        i += 1 + consumed;
        return true;
      }
      return false;
    };

    if (isFormaSintezaLine(norm)) {
      const done = parseFormBlock((r) => {
        if (currentTeamBlock === 2) { result.team2FormGeneral = r; }
        else if (!result.team1FormGeneral) { result.team1FormGeneral = r; }
        else if (!result.team2FormGeneral) { result.team2FormGeneral = r; }
      }, 'Forma General');
      if (done) continue;
      i++; continue;
    }

    if (isFormaAcasaLine(norm) && !extractNumbersFromLine(lines[i]).length) {
      const done = parseFormBlock((r) => {
        if (currentTeamBlock === 2) { result.team2FormHome = r; }
        else if (!result.team1FormHome) { result.team1FormHome = r; }
        else if (!result.team2FormHome) { result.team2FormHome = r; }
      }, 'Forma Acasa');
      if (done) continue;
      i++; continue;
    }

    if (isFormaDeplaclareLine(norm) && !extractNumbersFromLine(lines[i]).length) {
      const done = parseFormBlock((r) => {
        if (currentTeamBlock === 2) { result.team2FormAway = r; }
        else if (!result.team1FormAway) { result.team1FormAway = r; }
        else if (!result.team2FormAway) { result.team2FormAway = r; }
      }, 'Forma Deplasare');
      if (done) continue;
      i++; continue;
    }

    i++;
  }

  return result;
}

// ===== MAIN STATS PARSER (legacy, still available) =====
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

  let currentTeamBlock = 0;
  let tableMode = false;
  let i = dataStartIndex;

  while (i < lines.length) {
    const norm = normalize(lines[i]);

    if (isNoiseLine(norm) && !isFormaSintezaLine(norm)) { i++; continue; }

    if (isFormHeader(norm)) {
      log(`📋 Form header detected: "${lines[i]}" → form mode`);
      i++;
      continue;
    }

    // FORM: Sinteza/General
    if (isFormaSintezaLine(norm)) {
      const inlineTokens = lines[i].split(/[\s,;]+/).filter(t => {
        const c = removeDiacritics(t.toLowerCase().replace(/[^a-zA-ZăâîșțĂÂÎȘȚ]/g, ''));
        return isFormResult(c);
      });

      let formResults: ('W' | 'D' | 'L')[] = [];
      let consumed = 0;

      if (inlineTokens.length >= 3) {
        formResults = inlineTokens.slice(0, 5).map(t => toFormResult(removeDiacritics(t.toLowerCase())));
      } else {
        const { results, consumed: c } = extractFormResults(lines, i + 1, 5);
        if (results.length > 0) { formResults = results; consumed = c; }
      }

      if (formResults.length > 0) {
        if (currentTeamBlock === 2) {
          if (!result.team2FormGeneral) { result.team2FormGeneral = formResults; log(`📝 Forma General Team 2: ${formResults.join(' ')}`); }
        } else {
          if (!result.team1FormGeneral) { result.team1FormGeneral = formResults; log(`📝 Forma General Team 1: ${formResults.join(' ')}`); }
          else if (!result.team2FormGeneral) { result.team2FormGeneral = formResults; log(`📝 Forma General Team 2: ${formResults.join(' ')}`); }
        }
        i += 1 + consumed;
        continue;
      }
    }

    // FORM: Acasa
    if (isFormaAcasaLine(norm) && !extractNumbersFromLine(lines[i]).length) {
      const inlineTokens = lines[i].split(/[\s,;]+/).filter(t => {
        const c = removeDiacritics(t.toLowerCase().replace(/[^a-zA-ZăâîșțĂÂÎȘȚ]/g, ''));
        return isFormResult(c);
      });

      let formResults: ('W' | 'D' | 'L')[] = [];
      let consumed = 0;

      if (inlineTokens.length >= 3) {
        formResults = inlineTokens.slice(0, 5).map(t => toFormResult(removeDiacritics(t.toLowerCase())));
      } else {
        const { results, consumed: c } = extractFormResults(lines, i + 1, 5);
        formResults = results; consumed = c;
      }

      if (formResults.length > 0) {
        if (currentTeamBlock === 2) {
          if (!result.team2FormHome) { result.team2FormHome = formResults; log(`📝 Forma Acasa Team 2: ${formResults.join(' ')}`); }
        } else {
          if (!result.team1FormHome) { result.team1FormHome = formResults; log(`📝 Forma Acasa Team 1: ${formResults.join(' ')}`); }
          else if (!result.team2FormHome) { result.team2FormHome = formResults; log(`📝 Forma Acasa Team 2: ${formResults.join(' ')}`); }
        }
        i += 1 + consumed;
        continue;
      }
      i++; continue;
    }

    // FORM: Deplasare
    if (isFormaDeplaclareLine(norm) && !extractNumbersFromLine(lines[i]).length) {
      const inlineTokens = lines[i].split(/[\s,;]+/).filter(t => {
        const c = removeDiacritics(t.toLowerCase().replace(/[^a-zA-ZăâîșțĂÂÎȘȚ]/g, ''));
        return isFormResult(c);
      });

      let formResults: ('W' | 'D' | 'L')[] = [];
      let consumed = 0;

      if (inlineTokens.length >= 3) {
        formResults = inlineTokens.slice(0, 5).map(t => toFormResult(removeDiacritics(t.toLowerCase())));
      } else {
        const { results, consumed: c } = extractFormResults(lines, i + 1, 5);
        formResults = results; consumed = c;
      }

      if (formResults.length > 0) {
        if (currentTeamBlock === 2) {
          if (!result.team2FormAway) { result.team2FormAway = formResults; log(`📝 Forma Deplasare Team 2: ${formResults.join(' ')}`); }
        } else {
          if (!result.team1FormAway) { result.team1FormAway = formResults; log(`📝 Forma Deplasare Team 1: ${formResults.join(' ')}`); }
          else if (!result.team2FormAway) { result.team2FormAway = formResults; log(`📝 Forma Deplasare Team 2: ${formResults.join(' ')}`); }
        }
        i += 1 + consumed;
        continue;
      }
      i++; continue;
    }

    // Team name repetition → block switch
    if (isTeamName(lines[i])) {
      const nameNorm = normalize(lines[i]);
      if (result.team1 && normalize(result.team1) === nameNorm) {
        currentTeamBlock = 1;
        log(`🔄 Block switch → Team 1: "${lines[i]}"`);
      } else if (result.team2 && normalize(result.team2) === nameNorm) {
        currentTeamBlock = 2;
        log(`🔄 Block switch → Team 2: "${lines[i]}"`);
      }
      i++; continue;
    }

    // TABLE HEADER
    if (isTableHeader(norm)) {
      tableMode = true;
      log(`📋 Table header detected: "${lines[i]}" → table mode ON`);
      i++; continue;
    }

    // SINTEZA: val1=GM, val2=GP, val3=Medie
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
      i++; continue;
    }

    // ACASA: val1=GM, val2=GP, val3=total
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
      i++; continue;
    }

    // DEPLASARE: val1=GM, val2=GP, val3=total
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
      i++; continue;
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
      i++; continue;
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

  if (parsed.team1) { updated.homeTeam.name = parsed.team1; fieldsFound++; }
  if (parsed.team2) { updated.awayTeam.name = parsed.team2; fieldsFound++; }

  // GM/GP Sinteza
  if (parsed.team1GmGp) {
    updated.homeTeam.goalsScored = parsed.team1GmGp.scored;
    updated.homeTeam.goalsConceded = parsed.team1GmGp.conceded;
    fieldsFound += 2;
    log.push(`📊 Sinteza → Home: GM=${parsed.team1GmGp.scored}, GP=${parsed.team1GmGp.conceded}`);
  }
  if (parsed.team2GmGp) {
    updated.awayTeam.goalsScored = parsed.team2GmGp.scored;
    updated.awayTeam.goalsConceded = parsed.team2GmGp.conceded;
    fieldsFound += 2;
    log.push(`📊 Sinteza → Away: GM=${parsed.team2GmGp.scored}, GP=${parsed.team2GmGp.conceded}`);
  }

  // Home/Away
  if (parsed.team1Home) {
    updated.homeTeam.goalsScoredHome = parsed.team1Home.scored;
    updated.homeTeam.goalsConcededHome = parsed.team1Home.conceded;
    fieldsFound += 2;
    log.push(`🏠 Acasa → Home: GM=${parsed.team1Home.scored}, GP=${parsed.team1Home.conceded}`);
  }
  if (parsed.team1Away) {
    updated.homeTeam.goalsScoredAway = parsed.team1Away.scored;
    updated.homeTeam.goalsConcededAway = parsed.team1Away.conceded;
    fieldsFound += 2;
  }
  if (parsed.team2Home) {
    updated.awayTeam.goalsScoredHome = parsed.team2Home.scored;
    updated.awayTeam.goalsConcededHome = parsed.team2Home.conceded;
    fieldsFound += 2;
  }
  if (parsed.team2Away) {
    updated.awayTeam.goalsScoredAway = parsed.team2Away.scored;
    updated.awayTeam.goalsConcededAway = parsed.team2Away.conceded;
    fieldsFound += 2;
  }

  // Form
  if (parsed.team1FormGeneral) { updated.homeTeam.formLast5 = parsed.team1FormGeneral; fieldsFound++; }
  if (parsed.team1FormHome) { updated.homeTeam.formHome = parsed.team1FormHome; fieldsFound++; }
  if (parsed.team1FormAway) { updated.homeTeam.formAway = parsed.team1FormAway; fieldsFound++; }
  if (parsed.team2FormGeneral) { updated.awayTeam.formLast5 = parsed.team2FormGeneral; fieldsFound++; }
  if (parsed.team2FormHome) { updated.awayTeam.formHome = parsed.team2FormHome; fieldsFound++; }
  if (parsed.team2FormAway) { updated.awayTeam.formAway = parsed.team2FormAway; fieldsFound++; }

  // Stats
  for (const [statKey, pair] of Object.entries(parsed.stats)) {
    const fieldName = STAT_TO_FIELD[statKey];
    if (fieldName && fieldName in updated.homeTeam) {
      updated.homeTeam[fieldName] = pair.team1;
      updated.awayTeam[fieldName] = pair.team2;
      fieldsFound += 2;
      log.push(`📊 ${statKey} → ${fieldName}: ${pair.team1} / ${pair.team2}`);
    }
  }

  return { updated, fieldsFound, log };
}

// ===== APPLY PARSED ODDS TO MATCH DATA =====
export function applyParsedOdds(
  parsed: ParsedOdds,
  match: any
): { updated: any; fieldsFound: number; log: string[] } {
  const updated = JSON.parse(JSON.stringify(match));
  const log: string[] = [...parsed.debugLog];
  let fieldsFound = 0;

  if (parsed.home !== undefined) { updated.oddsHome = parsed.home; fieldsFound++; }
  if (parsed.draw !== undefined) { updated.oddsDraw = parsed.draw; fieldsFound++; }
  if (parsed.away !== undefined) { updated.oddsAway = parsed.away; fieldsFound++; }
  if (parsed.bttsYes !== undefined) { updated.oddsBTTSYes = parsed.bttsYes; fieldsFound++; }
  if (parsed.bttsNo !== undefined) { updated.oddsBTTSNo = parsed.bttsNo; fieldsFound++; }

  // Find Over 2.5 and Under 2.5 specifically
  const line25 = parsed.overUnderLines.find(l => l.line === 2.5);
  if (line25) {
    updated.oddsOver25 = line25.over;
    updated.oddsUnder25 = line25.under;
    fieldsFound += 2;
    log.push(`📊 Over/Under 2.5 → Over=${line25.over}, Under=${line25.under}`);
  }

  // Corner lines
  if (parsed.cornerLines.length > 0) {
    updated.cornerLines = parsed.cornerLines.map(cl => ({
      line: cl.line,
      oddsOver: cl.over,
      oddsUnder: cl.under,
    }));
    fieldsFound += parsed.cornerLines.length;
    log.push(`⛳ ${parsed.cornerLines.length} corner lines imported`);
  }

  return { updated, fieldsFound, log };
}
