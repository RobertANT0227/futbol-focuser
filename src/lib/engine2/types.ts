// ENGINE2 — FootyStats powered
// Mirror of Cento engine types, extended with reasoning + context flags.
import type {
  PickGrade,
  MarketKey,
  MarketProb,
  RatingBundle,
  DataQuality,
  PowerAnalysis as CentoPowerAnalysis,
} from '@/lib/cento/engine/types';

export type { PickGrade, MarketKey, MarketProb, RatingBundle, DataQuality };

export interface AnalysisReasoning {
  boosters: string[];
  reducers: string[];
  riskFactors: string[];
  summary: string;
}

export type ContextFlag =
  | 'EARLY_SEASON'
  | 'HIGH_VOLATILITY'
  | 'STRONG_HOME_ENV'
  | 'LOW_SCORING_LEAGUE'
  | 'HIGH_DRAW_TENDENCY'
  | 'LATE_SCORING_TEAMS'
  | 'INCONSISTENT_FORM';

export interface PowerAnalysis2 extends CentoPowerAnalysis {
  reasoning: AnalysisReasoning;
  contextFlags: ContextFlag[];
}

export const CONTEXT_FLAG_LABEL: Record<ContextFlag, string> = {
  EARLY_SEASON: 'Început de sezon',
  HIGH_VOLATILITY: 'Volatilitate ridicată',
  STRONG_HOME_ENV: 'Avantaj acasă puternic',
  LOW_SCORING_LEAGUE: 'Ligă cu goluri puține',
  HIGH_DRAW_TENDENCY: 'Tendință de egal',
  LATE_SCORING_TEAMS: 'Goluri în repriza 2',
  INCONSISTENT_FORM: 'Formă inconsistentă',
};