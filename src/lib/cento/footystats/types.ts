export type CsvKind = 'league' | 'matches' | 'teams';

export interface DetectedMeta {
  kind: CsvKind;
  leagueName: string;     // e.g. "Spain La Liga"
  country: string | null; // e.g. "Spain"
  season: string;         // e.g. "2025/2026"
  normalizedKey: string;  // slug used for grouping
}

export interface LeagueStats {
  goalsPerMatch: number | null;
  homeGoalsAvg: number | null;
  awayGoalsAvg: number | null;
  over25Pct: number | null;
  over15Pct: number | null;
  over35Pct: number | null;
  bttsPct: number | null;
  homeWinPct: number | null;
  drawPct: number | null;
  awayWinPct: number | null;
  cleanSheetsPct: number | null;
  cardsPerMatch: number | null;
  cornersPerMatch: number | null;
  predictionRisk: number | null;
  totalMatches: number | null;
  xgPerMatch: number | null;
  homeAdvantagePct: number | null;
  raw?: Record<string, number | string | null>;
}

export interface ParsedMatch {
  date: string | null;       // ISO date (yyyy-mm-dd)
  timestamp: number | null;  // ms
  home: string;
  away: string;
  homeGoals: number | null;
  awayGoals: number | null;
  played: boolean;
  oddsHome: number | null;
  oddsDraw: number | null;
  oddsAway: number | null;
  oddsBttsYes: number | null;
  oddsBttsNo: number | null;
  oddsOver25: number | null;
  oddsUnder25: number | null;
  preHomeGoalsAvg: number | null;
  preAwayGoalsAvg: number | null;
  preOver25Pct: number | null;
  preBttsPct: number | null;
  htHomeGoals: number | null;
  htAwayGoals: number | null;
  attendance: number | null;
  stadium: string | null;
  homeShots: number | null;
  awayShots: number | null;
  homeShotsOT: number | null;
  awayShotsOT: number | null;
  homeCorners: number | null;
  awayCorners: number | null;
  homeCards: number | null;
  awayCards: number | null;
  preXgHome?: number | null;
  preXgAway?: number | null;
  raw?: Record<string, number | string | null>;
}

export interface TeamProfile {
  name: string;
  matchesPlayed: number | null;
  wins: number | null;
  draws: number | null;
  losses: number | null;
  points: number | null;
  ppg: number | null;
  position: number | null;
  goalsFor: number | null;
  goalsAgainst: number | null;
  goalDiff: number | null;
  cleanSheetsPct: number | null;
  ftsPct: number | null;            // failed-to-score %
  bttsPct: number | null;
  over25Pct: number | null;
  under25Pct: number | null;
  // home split
  homePlayed: number | null;
  homeWins: number | null;
  homeDraws: number | null;
  homeLosses: number | null;
  homeGFAvg: number | null;
  homeGAAvg: number | null;
  homeBttsPct: number | null;
  homeOver25Pct: number | null;
  // away split
  awayPlayed: number | null;
  awayWins: number | null;
  awayDraws: number | null;
  awayLosses: number | null;
  awayGFAvg: number | null;
  awayGAAvg: number | null;
  awayBttsPct: number | null;
  awayOver25Pct: number | null;
  // form (latest 5/6 results, "W"/"D"/"L")
  form: string[];                 // most recent first
  // efficiency
  shotsAvg: number | null;
  shotsOTAvg: number | null;
  shotsConcededAvg: number | null;
  attackingEff: number | null;    // 0-1
  defensiveEff: number | null;    // 0-1
  fts2score: number | null;       // first-team-to-score %
  // timings (% goals scored/conceded by interval)
  scoringFirstHalfPct: number | null;
  scoringSecondHalfPct: number | null;
  concedingFirstHalfPct: number | null;
  concedingSecondHalfPct: number | null;
  // xG (FootyStats)
  xgFor: number | null;
  xgAgainst: number | null;
  xgForHome: number | null;
  xgForAway: number | null;
  xgAgainstHome: number | null;
  xgAgainstAway: number | null;
  // win % aggregates (when form string absent)
  winPct: number | null;
  drawPct: number | null;
  lossPct: number | null;
  raw?: Record<string, number | string | null>;
}

export interface ParsedLeagueBundle {
  meta: DetectedMeta;
  league?: LeagueStats;
  matches?: ParsedMatch[];
  teams?: TeamProfile[];
}