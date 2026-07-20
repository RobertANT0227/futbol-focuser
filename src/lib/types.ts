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
  playStyle: 'possession' | 'counter' | 'pressing' | 'low-block' | 'bus-parking' | 'high-press';
  leaguePosition: number;
  totalTeamsInLeague: number;
  gkSaves: number;
}

export interface MatchData {
  homeTeam: TeamStats;
  awayTeam: TeamStats;
  league: string;
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
  bookmakerProbability: number;
  value: number;
  odds: number;
  kellyStake: number;
  kellyPercent: number;
  confidence: 'high' | 'medium' | 'low';
  stability: number;
  risk: 'low' | 'medium' | 'high';
  tipsterTier: 'tipster' | 'tipster_premium';
  winRate: number;
  aiExplanation: string;
  // Fixed-stake (1%–5%) confidence-based system
  stakeConfidence: 'VERY_LOW' | 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';
  stakePct: number;     // 0.01 .. 0.05
  stakeLei: number;     // computed from current bankroll
  ev: number;           // expected value (decimal): prob*odds - 1
  fragile: boolean;
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
  monteCarloResults: MonteCarloResult;
  styleAnalysis: string;
  motivationAnalysis: string;
  analysisSteps: AnalysisStep[];
  detectedStyles: { home: string; away: string };
  bestBet: BetRecommendation | null;
  tipsterV10?: import('./tipsterV10').TipsterV10Report;
}

export interface AnalysisStep {
  title: string;
  description: string;
  data?: Record<string, string | number>;
}

export interface MonteCarloResult {
  homeWinPct: number;
  drawPct: number;
  awayWinPct: number;
  over25Pct: number;
  bttsPct: number;
  avgHomeGoals: number;
  avgAwayGoals: number;
  avgCorners: number;
  scoreDistribution: Record<string, number>;
}

export interface DailyMatch {
  id: string;
  match: MatchData;
  result: AnalysisResult;
  addedAt: Date;
}
