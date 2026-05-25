// DeepMatch Intelligence — tolerant raw-stats parser
// Maps free-text dumps from Sofascore / Footystats / Flashscore to normalized fields.

export type FormToken = 'W' | 'D' | 'L';

export interface ParsedTeamStats {
  name?: string;
  matchesPlayed?: number;
  goalsScored?: number;
  goalsConceded?: number;
  goalsScoredHome?: number;
  goalsConcededHome?: number;
  goalsScoredAway?: number;
  goalsConcededAway?: number;
  xG?: number;
  xGA?: number;
  shots?: number;
  shotsOnTarget?: number;
  shotsOnTargetHome?: number;
  shotsOnTargetAway?: number;
  possession?: number;
  dangerousAttacks?: number;
  gkSaves?: number;
  cardsPerMatch?: number;
  fouls?: number;
  cornersPerMatch?: number;
  cornersPerMatchHome?: number;
  cornersPerMatchAway?: number;
  bttsPct?: number;
  over25Pct?: number;
  cleanSheetPct?: number;
  ppm?: number;
  leaguePosition?: number;
  totalTeamsInLeague?: number;
  formLast5?: FormToken[];
  formHomeAway?: FormToken[];
}

interface Alias {
  key: keyof ParsedTeamStats;
  patterns: RegExp[];
  /** Multiplier for percent fields stored as 0-100. */
  isPercent?: boolean;
}

/** Order matters — more specific aliases first. */
const ALIASES: Alias[] = [
  // Goals - splits
  { key: 'goalsScoredHome', patterns: [/goluri\s+(marcate\s+)?acas[ăa]/i, /goals?\s+(scored\s+)?home/i, /gm\s+acas[ăa]/i] },
  { key: 'goalsConcededHome', patterns: [/goluri\s+(primite\s+)?acas[ăa]/i, /goals?\s+(conceded\s+)?home/i, /gp\s+acas[ăa]/i] },
  { key: 'goalsScoredAway', patterns: [/goluri\s+(marcate\s+)?(deplasare|\u00een\s+deplasare|away)/i, /goals?\s+(scored\s+)?away/i, /gm\s+deplasare/i] },
  { key: 'goalsConcededAway', patterns: [/goluri\s+(primite\s+)?(deplasare|away)/i, /goals?\s+(conceded\s+)?away/i, /gp\s+deplasare/i] },
  // Goals - overall
  { key: 'goalsScored', patterns: [/medie\s+goluri\s+marcate/i, /goluri\s+marcate\s*(\/|per)?\s*meci/i, /goals?\s+scored.*(per\s+match|\/match)?/i, /\bgm\b/i] },
  { key: 'goalsConceded', patterns: [/medie\s+goluri\s+primite/i, /goluri\s+primite\s*(\/|per)?\s*meci/i, /goals?\s+conceded/i, /\bgp\b/i] },
  // xG
  { key: 'xG', patterns: [/\bxg\b(?!a)/i, /expected\s+goals(?!\s+against)/i] },
  { key: 'xGA', patterns: [/\bxga\b/i, /expected\s+goals\s+against/i] },
  // Shots
  { key: 'shotsOnTargetHome', patterns: [/[șs]uturi?\s+pe\s+poart[ăa]\s+acas[ăa]/i, /shots\s+on\s+target\s+home/i] },
  { key: 'shotsOnTargetAway', patterns: [/[șs]uturi?\s+pe\s+poart[ăa]\s+(deplasare|away)/i, /shots\s+on\s+target\s+away/i] },
  { key: 'shotsOnTarget', patterns: [/[șs]uturi?\s+pe\s+poart[ăa]/i, /shots\s+on\s+target/i, /\bsot\b/i] },
  { key: 'shots', patterns: [/total\s+[șs]uturi?/i, /[șs]uturi?\s*(\/|per)?\s*meci/i, /\btotal\s+shots\b/i, /\bshots\b/i] },
  // Possession
  { key: 'possession', patterns: [/posesie/i, /possession/i], isPercent: true },
  // Dangerous attacks
  { key: 'dangerousAttacks', patterns: [/atacuri\s+periculoase/i, /dangerous\s+attacks/i] },
  // GK Saves
  { key: 'gkSaves', patterns: [/salv[ăa]ri\s+portar/i, /goalkeeper\s+saves/i, /\bgk\s+saves\b/i] },
  // Cards / Fouls
  { key: 'cardsPerMatch', patterns: [/carto?na[șs]e/i, /\bcards?\b/i, /\byellow\s+cards?\b/i] },
  { key: 'fouls', patterns: [/faulturi/i, /\bfouls?\b/i] },
  // Corners - splits
  { key: 'cornersPerMatchHome', patterns: [/cor?nere\s+acas[ăa]/i, /corners?\s+home/i] },
  { key: 'cornersPerMatchAway', patterns: [/cor?nere\s+(deplasare|away)/i, /corners?\s+away/i] },
  { key: 'cornersPerMatch', patterns: [/cor?nere/i, /\bcorners?\b/i] },
  // Percentages
  { key: 'bttsPct', patterns: [/\bbtts\b/i, /ambele\s+marcheaz[ăa]/i, /both\s+teams\s+to\s+score/i, /\bgg\b/i], isPercent: true },
  { key: 'over25Pct', patterns: [/over\s*2[\.,]?5/i, /peste\s*2[\.,]?5/i], isPercent: true },
  { key: 'cleanSheetPct', patterns: [/clean\s+sheets?/i, /poart[ăa]\s+inviolabil[ăa]/i], isPercent: true },
  // Standings
  { key: 'ppm', patterns: [/\bppm\b/i, /puncte\s*\/?\s*meci/i, /points\s+per\s+match/i, /\bppg\b/i] },
  { key: 'leaguePosition', patterns: [/loc\s+(clasament|in\s+clasament)/i, /position/i, /clasament/i] },
  { key: 'totalTeamsInLeague', patterns: [/echipe\s+(in|în)\s+lig[ăa]/i, /teams\s+in\s+league/i] },
  { key: 'matchesPlayed', patterns: [/meciuri\s+jucate/i, /matches\s+played/i, /\bmp\b/i, /\bmj\b/i] },
];

const NUM_RE = /-?\d+(?:[.,]\d+)?/g;

function toNum(raw: string, isPercent?: boolean): number | null {
  const n = parseFloat(raw.replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  if (isPercent && n > 0 && n <= 1) return +(n * 100).toFixed(2);
  return n;
}

function firstNumberOnLine(line: string, isPercent?: boolean): number | null {
  const m = line.match(NUM_RE);
  if (!m) return null;
  for (const tok of m) {
    const n = toNum(tok, isPercent);
    if (n !== null) return n;
  }
  return null;
}

function parseFormString(s: string): FormToken[] {
  // Accept W/D/L, V/E/Î (RO), G/U/N, win/draw/loss
  const out: FormToken[] = [];
  const cleaned = s.replace(/[^a-zA-ZÎîȘșȚțĂăÂâ]/g, ' ').trim();
  if (!cleaned) return out;
  const tokens = cleaned.split(/\s+/);
  for (const t of tokens) {
    const up = t.toUpperCase();
    if (/^W(IN)?$/.test(up) || up === 'V' || up === 'G') out.push('W');
    else if (/^D(RAW)?$/.test(up) || up === 'E' || up === 'N') out.push('D');
    else if (/^L(OSS)?$/.test(up) || up === 'Î' || up === 'I' || up === 'U') out.push('L');
    if (out.length >= 5) break;
  }
  return out;
}

/** Parse a raw text block for a single team. */
export function parseTeamRaw(raw: string): { stats: ParsedTeamStats; log: string[] } {
  const stats: ParsedTeamStats = {};
  const log: string[] = [];
  if (!raw.trim()) return { stats, log };

  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const used = new Set<number>();

  // Pass 1: form detection (lines with W/D/L sequences after "Form" / "Formă")
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^form[ăa]?\b/i.test(line) || /^form\b/i.test(line)) {
      // Collect tokens from this and next lines until we have 5
      const collected: FormToken[] = [...parseFormString(line.replace(/^form[ăa]?:?/i, ''))];
      let j = i + 1;
      while (j < lines.length && collected.length < 5) {
        const more = parseFormString(lines[j]);
        if (!more.length) break;
        collected.push(...more);
        used.add(j);
        j++;
      }
      if (collected.length >= 3) {
        const isHomeAway = /acas[ăa]|home|deplasare|away/i.test(line);
        if (isHomeAway && !stats.formHomeAway) stats.formHomeAway = collected.slice(0, 5);
        else if (!stats.formLast5) stats.formLast5 = collected.slice(0, 5);
        log.push(`✅ Formă detectată: ${collected.slice(0, 5).join('/')}`);
        used.add(i);
      }
    }
  }

  // Pass 2: alias matching
  for (let i = 0; i < lines.length; i++) {
    if (used.has(i)) continue;
    const line = lines[i];
    for (const alias of ALIASES) {
      if (stats[alias.key] !== undefined) continue;
      if (!alias.patterns.some((p) => p.test(line))) continue;
      // Look for number: same line, then next line
      let n = firstNumberOnLine(line, alias.isPercent);
      if (n === null && i + 1 < lines.length) n = firstNumberOnLine(lines[i + 1], alias.isPercent);
      if (n === null && i > 0 && !used.has(i - 1)) n = firstNumberOnLine(lines[i - 1], alias.isPercent);
      if (n !== null) {
        // @ts-expect-error dynamic assign
        stats[alias.key] = n;
        log.push(`✅ ${alias.key} = ${n}`);
        used.add(i);
        break;
      }
    }
  }

  // Try to detect team name (first non-number, non-keyword line)
  if (!stats.name) {
    for (const l of lines.slice(0, 3)) {
      if (NUM_RE.test(l)) continue;
      if (/(statistici|stats|form|cote|odds)/i.test(l)) continue;
      if (l.length > 2 && l.length < 40) { stats.name = l; break; }
    }
  }

  return { stats, log };
}