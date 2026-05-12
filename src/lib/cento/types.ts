export type CpFileType = 'league' | 'team' | 'h2h' | 'match' | 'unknown';

export interface CpLeague {
  id: string;
  name: string;
  normalized_name?: string;
  country: string | null;
  season: string;
  has_league_stats?: boolean;
  has_matches?: boolean;
  has_teams?: boolean;
  league_stats?: Record<string, unknown>;
  matches_count?: number;
  teams_count?: number;
  coverage?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export interface CpTeamStats {
  matches_played?: number;
  goals_scored?: number;
  goals_conceded?: number;
  xg?: number;
  xga?: number;
  possession?: number;
  shots?: number;
  shots_on_target?: number;
  shots_off?: number;
  fouls?: number;
  corners?: number;
  cards?: number;
  btts_pct?: number;
  over25_pct?: number;
  under25_pct?: number;
  clean_sheets?: number;
  ppg?: number;
  league_position?: number;
  dangerous_attacks?: number;
  form?: string;
  goals_first_half?: number;
  goals_second_half?: number;
  goals_scored_home?: number;
  goals_scored_away?: number;
  goals_conceded_home?: number;
  goals_conceded_away?: number;
  [k: string]: number | string | undefined;
}

export interface CpTeam {
  id: string;
  league_id: string;
  name: string;
  playstyle: string | null;
  tags: string[];
  stats: CpTeamStats;
}

export interface CpMatch {
  id: string;
  league_id: string;
  season: string;
  match_date: string | null;
  home: string;
  away: string;
  stats: Record<string, number | string | null>;
  odds: {
    home?: number; draw?: number; away?: number;
    over25?: number; under25?: number;
    btts_yes?: number; btts_no?: number;
    over_corners?: number; under_corners?: number;
    over_cards?: number; under_cards?: number;
  };
}

export interface CpImportResult {
  league: string;
  season: string;
  fileType: CpFileType;
  rowsImported: number;
  duplicates: number;
  fileName: string;
  leagueId?: string;
  normalizedLeagueName?: string;
  importStatus?: {
    hasLeagueStats: boolean;
    hasMatches: boolean;
    hasTeams: boolean;
  };
  stats?: {
    matchesCount: number;
    teamsCount: number;
  };
  coverage?: {
    leagueData: number;
    matchData: number;
    teamData: number;
    overall: number;
  };
}

export type Risk = 'low' | 'medium' | 'high';
export type MarketKey = '1' | 'X' | '2' | 'Over 2.5' | 'Under 2.5' | 'BTTS Yes' | 'BTTS No' | 'Over 9.5 Corners' | 'Under 9.5 Corners' | 'Over 4.5 Cards' | 'Under 4.5 Cards';

export interface ValueBet {
  matchId: string;
  league: string;
  home: string;
  away: string;
  market: MarketKey;
  category: 'winner' | 'goals' | 'corners' | 'cards';
  odds: number;
  impliedProb: number;   // 1/odds
  modelWR: number;       // 0..1
  ev: number;            // modelWR*odds - 1
  edge: number;          // (modelWR - impliedProb) * 100
  confidence: number;    // 0..100
  sampleSize: number;
  risk: Risk;
  variance: number;      // 0..1
  styleClash: boolean;
  homeStyle: string;
  awayStyle: string;
  suggestedStakePct: number; // 0..0.05 Kelly fractional
  suggestedStakeLei: number;
  // Data quality
  dataReliability: 'high' | 'medium' | 'low';
  dataCompleteness: number; // 0..1
  missingStats: string[];   // canonical names that were unavailable
  usedStats: string[];      // canonical names that contributed
}