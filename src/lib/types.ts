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
  possession: number;
  dangerousAttacks: number;
  corners: number;
  cornersPerMatch: number;
  cornersPerMatchHome: number;
  cornersPerMatchAway: number;
  cards: number;
  cardsPerMatch: number;
  fouls: number;
  playStyle: 'possession' | 'counter' | 'pressing' | 'low-block';
  leaguePosition: number;
  totalTeamsInLeague: number;
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
  oddsOverCorners?: number;
  oddsUnderCorners?: number;
  cornersLine?: number;
  isDerby: boolean;
  refereeCardsPerMatch?: number;
  homeTeamFatigued: boolean;
  awayTeamFatigued: boolean;
  homeEuropeanMatch: boolean;
  awayEuropeanMatch: boolean;
}

export interface UserPlan {
  maxRisk: 'low' | 'medium' | 'high';
  bankroll: number;
  minValue: number;
  preferredBets: ('corners' | 'winner' | 'goals')[];
  maxStakePercent: number;
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
  confidence: 'high' | 'medium' | 'low';
  stability: number;
  risk: 'low' | 'medium' | 'high';
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
