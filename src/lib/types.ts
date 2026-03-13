export interface TeamStats {
  name: string;
  // All stats are PER MATCH averages
  goalsScored: number;       // medie goluri marcate/meci
  goalsConceded: number;     // medie goluri primite/meci
  goalsScoredHome: number;   // medie goluri marcate acasă/meci
  goalsConcededHome: number; // medie goluri primite acasă/meci
  goalsScoredAway: number;   // medie goluri marcate deplasare/meci
  goalsConcededAway: number; // medie goluri primite deplasare/meci
  matchesPlayed: number;
  formLast5: ('W' | 'D' | 'L')[];
  formHome: ('W' | 'D' | 'L')[];
  formAway: ('W' | 'D' | 'L')[];
  xG: number;               // medie xG/meci
  xGA: number;               // medie xGA/meci
  shots: number;             // medie șuturi/meci
  shotsOnTarget: number;     // medie șuturi pe poartă/meci
  possession: number;
  dangerousAttacks: number;  // medie atacuri periculoase/meci
  corners: number;
  cornersPerMatch: number;
  cornersPerMatchHome: number;
  cornersPerMatchAway: number;
  cards: number;
  cardsPerMatch: number;
  fouls: number;             // medie faulturi/meci
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
  homeTeamFatigued: boolean;
  awayTeamFatigued: boolean;
  homeEuropeanMatch: boolean;
  awayEuropeanMatch: boolean;
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
  analysisSteps: AnalysisStep[];
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
