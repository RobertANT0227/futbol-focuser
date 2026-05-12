import type { LeagueStats } from './types';
import { pickFirst, safeNum } from './util';

function buildRaw(r: Record<string, unknown>): Record<string, number | string | null> {
  const out: Record<string, number | string | null> = {};
  for (const [k, v] of Object.entries(r)) {
    if (v === null || v === undefined || v === '') { out[k] = null; continue; }
    const n = Number(String(v).replace('%', '').replace(/,/g, '.'));
    out[k] = Number.isFinite(n) ? n : String(v);
  }
  return out;
}

export function parseLeague(rows: Record<string, unknown>[]): LeagueStats | undefined {
  if (!rows.length) return undefined;
  // FootyStats league CSV is typically a single row.
  const r = rows[0];
  const stat: LeagueStats = {
    goalsPerMatch: pickFirst(r, ['average_goals_per_match', 'goals_per_match_overall', 'goals_per_match', 'avg_goals_per_match', 'season_avg_goals'], safeNum),
    homeGoalsAvg: pickFirst(r, ['average_scored_home_team', 'home_goals_per_match', 'avg_home_goals_per_match', 'home_avg_goals'], safeNum),
    awayGoalsAvg: pickFirst(r, ['average_scored_away_team', 'away_goals_per_match', 'avg_away_goals_per_match', 'away_avg_goals'], safeNum),
    over25Pct: pickFirst(r, ['over_25_percentage', 'over25_percentage', 'over_25_percentage_overall'], safeNum),
    over15Pct: pickFirst(r, ['over_15_percentage', 'over15_percentage', 'over_15_percentage_overall'], safeNum),
    over35Pct: pickFirst(r, ['over_35_percentage', 'over35_percentage', 'over_35_percentage_overall'], safeNum),
    bttsPct: pickFirst(r, ['btts_percentage', 'btts_percentage_overall', 'btts_overall'], safeNum),
    homeWinPct: pickFirst(r, ['home_win_percentage', 'home_wins_percentage'], safeNum),
    drawPct: pickFirst(r, ['draw_percentage', 'draws_percentage'], safeNum),
    awayWinPct: pickFirst(r, ['away_win_percentage', 'away_wins_percentage'], safeNum),
    cleanSheetsPct: pickFirst(r, ['clean_sheets_percentage', 'clean_sheets_overall'], safeNum),
    cardsPerMatch: pickFirst(r, ['average_cards_per_match', 'cards_per_match_overall', 'cards_per_match'], safeNum),
    cornersPerMatch: pickFirst(r, ['average_corners_per_match', 'corners_per_match_overall', 'corners_per_match'], safeNum),
    predictionRisk: pickFirst(r, ['prediction_risk', 'risk_overall'], safeNum),
    totalMatches: pickFirst(r, ['matches_completed', 'total_matches'], safeNum),
    xgPerMatch: pickFirst(r, ['xg_avg_per_match', 'xg_per_match', 'avg_xg_per_match'], safeNum),
    homeAdvantagePct: pickFirst(r, ['home_advantage_percentage'], safeNum),
    raw: buildRaw(r),
  };
  return stat;
}