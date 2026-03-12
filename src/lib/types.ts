export interface TeamStats {
  name: string;
  goalsScored: number;
  goalsConceded: number;
  goalsScoredHome: number;
  goalsConcededHome: number;
  goalsScoredAway: number;
  goalsConcededAway: number;
  matchesPlayed: number;
  // Form: W/D/L for last 5
  formLast5: ('W' | 'D' | 'L')[];
  formHome: ('W' | 'D' | 'L')[];
  formAway: ('W' | 'D' | 'L')[];
  // Advanced stats
  xG: number;
  xGA: number;
  shots: number;
  shotsOnTarget: number;
  possession: number;
  dangerousAttacks: number;
  corners: number;
  cornersPerMatch: number;
  cards: number;
  cardsPerMatch: number;
  fouls: number;
  // Style
  playStyle: 'possession' | 'counter' | 'pressing' | 'low-block';
  // Standing
  leaguePosition: number;
  totalTeamsInLeague: number;
}

export interface MatchData {
  homeTeam: TeamStats;
  awayTeam: TeamStats;
  league: string;
  leagueAvgGoals: number;
  leagueAvgCorners: number;
  // Bookmaker odds 1X2
  oddsHome: number;
  oddsDraw: number;
  oddsAway: number;
  // Over/Under odds
  oddsOver25: number;
  oddsUnder25: number;
  // BTTS odds
  oddsBTTSYes: number;
  oddsBTTSNo: number;
  // Corners odds (optional)
  oddsOverCorners?: number;
  oddsUnderCorners?: number;
  cornersLine?: number;
  // Context
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
  minValue: number; // minimum value % to bet
  preferredBets: ('corners' | 'winner' | 'goals')[];
  maxStakePercent: number; // max % of bankroll per bet
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
  value: number; // value percentage
  odds: number;
  kellyStake: number;
  confidence: 'high' | 'medium' | 'low';
  stability: number; // 0-1 from Monte Carlo
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
