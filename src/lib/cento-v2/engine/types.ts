// CENTO-V2
export type PickGrade = 'STRONG' | 'MEDIUM' | 'RISKY' | 'PASS';
export type MarketKey = 'OVER25' | 'UNDER25';
export type QualityBand = 'Excellent' | 'Good' | 'Limited';

export const MARKET_LABEL: Record<MarketKey, string> = {
  OVER25: 'Over 2.5',
  UNDER25: 'Under 2.5',
};

export interface SignalItem {
  label: string;
  value: number;        // 0-1
  weight: number;       // 0-1
  source: 'home_team' | 'away_team' | 'pre_match' | 'league' | 'derived';
}

export interface MarketExplanation {
  signals: SignalItem[];
  boosters: string[];
  reducers: string[];
  riskFactors: string[];
}

export interface MarketResult {
  key: MarketKey;
  label: string;
  probability: number;  // 0-1
  confidence: number;   // 15-92
  grade: PickGrade;
  stakeUnits: 0 | 0.5 | 1 | 2 | 3;
  spread: number;       // 0-1
  odds: number | null;
  explanation: MarketExplanation;
}

export interface TeamRatings {
  attack: number;
  defense: number;
  form: number;
  tempo: number;
  volatility: number;
}

export interface PowerAnalysis {
  matchId: string;
  home: string;
  away: string;
  leagueName: string;
  season: string;
  matchDate: string | null;
  quality: QualityBand;
  qualityCoverage: number;
  sampleSize: { home: number; away: number };
  missingCsv: { league: boolean; matches: boolean; teams: boolean };
  homeRatings: TeamRatings;
  awayRatings: TeamRatings;
  markets: MarketResult[];
  topPick: MarketResult;
}

/** Raw inputs extracted from CSV bundles for math layer. */
export interface MatchInputs {
  H_fts: number | null;
  A_fts: number | null;
  H_o25: number | null;
  A_o25: number | null;
  H_mp: number | null;
  A_mp: number | null;
  M_o25: number | null;
  L_o25: number | null;
  L_avg: number | null;
  predictionRisk: number | null;
  suspendedMatches: number | null;
  oddsOver25: number | null;
  oddsUnder25: number | null;
  hasLeague: boolean;
  hasMatches: boolean;
  hasTeams: boolean;
  // --- Layer 2: synthetic xG inputs ---
  H_att: number | null;     // goals scored per match (home split)
  H_def: number | null;     // goals conceded per match (home split)
  A_att: number | null;     // goals scored per match (away split)
  A_def: number | null;     // goals conceded per match (away split)
  L_avg_h: number | null;   // league average home goals per match
  L_avg_a: number | null;   // league average away goals per match
  // --- Layer 4: bracket ---
  M_o15: number | null;     // pre-match over 1.5 %
  M_o35: number | null;     // pre-match over 3.5 %
  // --- Layer 5: half-time projection (derived from team's first-half % * GF/GA avg) ---
  H_ht_att: number | null;
  H_ht_def: number | null;
  A_ht_att: number | null;
  A_ht_def: number | null;
  L_ht_share: number | null; // share of league goals scored in first half (0..1)
  // --- Layer 6: defense ---
  H_cs: number | null;       // clean sheet % (home split or overall)
  A_cs: number | null;       // clean sheet % (away split or overall)
  // --- Layer 7: late goals ratio (0..1) ---
  late_ratio: number | null;
  // --- Layer 8: context ---
  home_ppg: number | null;
  away_ppg: number | null;
  H_pos: number | null;
  A_pos: number | null;
  total_clubs: number | null;
}