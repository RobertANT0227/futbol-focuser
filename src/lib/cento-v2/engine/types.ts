// CENTO-V2
export type PickGrade = 'STRONG' | 'MEDIUM' | 'RISKY' | 'PASS';
export type MarketKey = 'BTTS_YES' | 'BTTS_NO' | 'OVER25' | 'UNDER25';
export type QualityBand = 'Excellent' | 'Good' | 'Limited';

export const MARKET_LABEL: Record<MarketKey, string> = {
  BTTS_YES: 'BTTS Da',
  BTTS_NO: 'BTTS Nu',
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
  H_btts: number | null;
  A_btts: number | null;
  H_fts: number | null;
  A_fts: number | null;
  H_o25: number | null;
  A_o25: number | null;
  H_mp: number | null;
  A_mp: number | null;
  M_btts: number | null;
  M_o25: number | null;
  L_o25: number | null;
  L_avg: number | null;
  predictionRisk: number | null;
  suspendedMatches: number | null;
  oddsBttsYes: number | null;
  oddsBttsNo: number | null;
  oddsOver25: number | null;
  oddsUnder25: number | null;
  hasLeague: boolean;
  hasMatches: boolean;
  hasTeams: boolean;
}