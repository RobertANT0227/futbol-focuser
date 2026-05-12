import type { LeagueStats, ParsedMatch, TeamProfile } from '@/lib/cento/footystats/types';

export interface RatingBundle {
  attack: number;          // 0-100
  defense: number;
  form: number;
  momentum: number;
  matchTempo: number;
  homeAdvantage: number;
  defensiveStability: number;
  offensiveConsistency: number;
  matchVolatility: number;
}

export type PickGrade = 'STRONG' | 'MEDIUM' | 'RISKY' | 'PASS';
export type MarketKey =
  | '1' | 'X' | '2'
  | 'BTTS_YES' | 'BTTS_NO'
  | 'OVER_2_5' | 'UNDER_2_5'
  | 'OVER_CORNERS_10_5' | 'UNDER_CORNERS_10_5'
  | 'OVER_CORNERS_11_5' | 'UNDER_CORNERS_11_5'
  | 'OVER_CORNERS_12_5' | 'UNDER_CORNERS_12_5';

export const MARKET_LABEL: Record<MarketKey, string> = {
  '1': 'Home Win', 'X': 'Draw', '2': 'Away Win',
  BTTS_YES: 'BTTS Yes', BTTS_NO: 'BTTS No',
  OVER_2_5: 'Over 2.5', UNDER_2_5: 'Under 2.5',
  OVER_CORNERS_10_5: 'Over 10.5 corners', UNDER_CORNERS_10_5: 'Under 10.5 corners',
  OVER_CORNERS_11_5: 'Over 11.5 corners', UNDER_CORNERS_11_5: 'Under 11.5 corners',
  OVER_CORNERS_12_5: 'Over 12.5 corners', UNDER_CORNERS_12_5: 'Under 12.5 corners',
};

export interface MarketProb {
  key: MarketKey;
  label: string;
  prob: number;       // 0-1
  odds: number | null;
}

export interface DataQuality {
  coverage: number;      // 0-1
  band: 'Excellent' | 'Good' | 'Limited';
  sampleHome: number;
  sampleAway: number;
  smallSamplePenalty: number;
}

export interface ContextSignals {
  earlySeason: boolean;
  positionGap: number | null;
  motivationNote: string | null;
}

export interface ExplainBullet {
  kind: 'support' | 'risk' | 'neutral';
  text: string;
}

export interface PowerAnalysis {
  match: ParsedMatch;
  league: LeagueStats | undefined;
  homeTeam: TeamProfile | undefined;
  awayTeam: TeamProfile | undefined;
  ratingsHome: RatingBundle;
  ratingsAway: RatingBundle;
  expectedGoalsHome: number;
  expectedGoalsAway: number;
  probabilities: MarketProb[];
  topMarket: MarketProb;
  confidence: number;     // 0-100
  grade: PickGrade;
  stakeUnits: 0 | 0.5 | 1 | 2 | 3;
  quality: DataQuality;
  context: ContextSignals;
  conflicts: string[];
  explanation: ExplainBullet[];
  narrative: string;
}