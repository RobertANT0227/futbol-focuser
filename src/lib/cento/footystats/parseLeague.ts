import type { LeagueStats } from './types';
import { pickFirst, safeNum } from './util';

export function parseLeague(rows: Record<string, unknown>[]): LeagueStats | undefined {
  if (!rows.length) return undefined;
  // FootyStats league CSV is typically a single row.
  const r = rows[0];
  const stat: LeagueStats = {
    goalsPerMatch: pickFirst(r, ['goals_per_match_overall', 'goals_per_match', 'avg_goals_per_match', 'season_avg_goals'], safeNum),
    homeGoalsAvg: pickFirst(r, ['home_goals_per_match', 'avg_home_goals_per_match', 'home_avg_goals'], safeNum),
    awayGoalsAvg: pickFirst(r, ['away_goals_per_match', 'avg_away_goals_per_match', 'away_avg_goals'], safeNum),
    over25Pct: pickFirst(r, ['over_25_percentage_overall', 'over_25_percentage', 'over_25_overall'], safeNum),
    over15Pct: pickFirst(r, ['over_15_percentage_overall', 'over_15_percentage'], safeNum),
    over35Pct: pickFirst(r, ['over_35_percentage_overall', 'over_35_percentage'], safeNum),
    bttsPct: pickFirst(r, ['btts_percentage_overall', 'btts_percentage', 'btts_overall'], safeNum),
    homeWinPct: pickFirst(r, ['home_win_percentage', 'home_wins_percentage'], safeNum),
    drawPct: pickFirst(r, ['draw_percentage', 'draws_percentage'], safeNum),
    awayWinPct: pickFirst(r, ['away_win_percentage', 'away_wins_percentage'], safeNum),
    cleanSheetsPct: pickFirst(r, ['clean_sheets_percentage', 'clean_sheets_overall'], safeNum),
    cardsPerMatch: pickFirst(r, ['cards_per_match_overall', 'cards_per_match'], safeNum),
    cornersPerMatch: pickFirst(r, ['corners_per_match_overall', 'corners_per_match'], safeNum),
    predictionRisk: pickFirst(r, ['prediction_risk', 'risk_overall'], safeNum),
    totalMatches: pickFirst(r, ['matches_completed', 'total_matches'], safeNum),
  };
  return stat;
}