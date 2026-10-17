export interface TeamStats {
  name: string;
  goalsScored: number;
  goalsConceded: number;
  goalsScoredHome: number;
  goalsConcededHome: number;
  goalsScoredAway: number;
  goalsConcededAway: number;
  matchesPlayed: number;
  formLast5: ('W' | 'D' | 'L')[];
  formHome: ('W' | 'D' | 'L')[];
  formAway: ('W' | 'D' | 'L')[];
  xG: number;
  xGA: number;
  shots: number;
  shotsOnTarget: number;
  shotsOnTargetHome: number;
  shotsOnTargetAway: number;
  possession: number;
  dangerousAttacks: number;
  corners: number;
  cornersPerMatch: number;
  cornersPerMatchHome: number;
  cornersPerMatchAway: number;
  cards: number;
  cardsPerMatch: number;
  fouls: number;
  playStyle: 'possession' | 'counter' | 'pressing' | 'low-block' | 'bus-parking' | 'high-press' | 'unknown';
  /** 'auto' = stil dedus din posesie; 'manual' = stilul ales de utilizator. */
  playStyleMode?: 'auto' | 'manual';
  leaguePosition: number;
  totalTeamsInLeague: number;
  gkSaves: number;
  /** Cornere concedate (primite) /meci — opțional. */
  cornersAgainstPerMatch?: number;
}

export interface MatchData {
  homeTeam: TeamStats;
  awayTeam: TeamStats;
  league: string;
  /** Media goluri marcate de gazde în ligă (default 1.50). */
  leagueAvgHomeGoals: number;
  /** Media goluri marcate de oaspeți în ligă (default 1.20). */
  leagueAvgAwayGoals: number;
  oddsHome: number;
  oddsDraw: number;
  oddsAway: number;
  oddsOver25: number;
  oddsUnder25: number;
  oddsBTTSYes: number;
  oddsBTTSNo: number;
  cornerLines: CornerLine[];
  isDerby: boolean;
  homeTeamFatigued: boolean;
  awayTeamFatigued: boolean;
  homeEuropeanMatch: boolean;
  awayEuropeanMatch: boolean;
}

export interface CornerLine {
  line: number;
  oddsOver: number;
  oddsUnder: number;
}

export interface UserPlan {
  maxRisk: 'low' | 'medium' | 'high';
  bankroll: number;
  preferredBets: ('corners' | 'winner' | 'goals')[];
}

export interface PoissonMatrix {
  homeGoals: number[];
  awayGoals: number[];
  probabilities: number[][];
}

export interface BetRecommendation {
  type: string;
  category: 'corners' | 'winner' | 'goals';
  selection: string;
  modelProbability: number;
  /** Probabilitate amestec (model + piață): wModel·pModel + (1−wModel)·pFair. */
  blendedProbability: number;
  /** Încredere în date: minN/(minN+shrinkK). */
  reliability: number;
  bookmakerProbability: number;
  value: number;
  odds: number;
  kellyStake: number;
  kellyPercent: number;
  confidence: 'high' | 'medium' | 'low';
  stability: number;
  risk: 'low' | 'medium' | 'high';
  tipsterTier: 'tipster' | 'tipster_premium';
  aiExplanation: string;
  // Confidence-based stake, capped by fractional Kelly
  stakeConfidence: 'VERY_LOW' | 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';
  stakePct: number;     // 0 .. maxStakePctPerBet
  stakeLei: number;     // computed from current bankroll
  ev: number;           // expected value (decimal): prob*odds - 1
  fragile: boolean;
  /** Value > maxRecommendedValue: probabil eroare de model. */
  suspect?: boolean;
}

export interface AnalysisResult {
  homeXG: number;
  awayXG: number;
  poissonMatrix: PoissonMatrix;
  homeWinProb: number;
  drawProb: number;
  awayWinProb: number;
  over25Prob: number;
  under25Prob: number;
  bttsProb: number;
  expectedCorners: number;
  recommendations: BetRecommendation[];
  styleAnalysis: string;
  motivationAnalysis: string;
  analysisSteps: AnalysisStep[];
  detectedStyles: { home: string; away: string };
  bestBet: BetRecommendation | null;
}

export interface AnalysisStep {
  title: string;
  description: string;
  data?: Record<string, string | number>;
}

export interface DailyMatch {
  id: string;
  match: MatchData;
  result: AnalysisResult;
  addedAt: Date;
}
