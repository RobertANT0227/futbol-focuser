import type { ParsedMatch } from './types';
import { pickFirst, safeNum, safeStr } from './util';
import { toIsoDate } from './date';

function buildRaw(r: Record<string, unknown>): Record<string, number | string | null> {
  const out: Record<string, number | string | null> = {};
  for (const [k, v] of Object.entries(r)) {
    if (v === null || v === undefined || v === '') { out[k] = null; continue; }
    const n = Number(String(v).replace('%', '').replace(/,/g, '.'));
    out[k] = Number.isFinite(n) ? n : String(v);
  }
  return out;
}

export function parseMatches(rows: Record<string, unknown>[]): ParsedMatch[] {
  const out: ParsedMatch[] = [];
  for (const r of rows) {
    const home = pickFirst(r, ['home_team_name', 'home_team', 'home'], safeStr);
    const away = pickFirst(r, ['away_team_name', 'away_team', 'away'], safeStr);
    if (!home || !away) continue;
    const ts = pickFirst(r, ['timestamp', 'date_unix', 'date_gmt_unix', 'date_unix_kickoff'], safeNum);
    const dateStr = pickFirst(r, ['date_GMT', 'date_gmt', 'kickoff_date', 'date'], safeStr);
    const { iso, ms } = toIsoDate(ts, dateStr);
    const rawHome = pickFirst(r, ['home_team_goal_count', 'home_goals', 'home_goal_count'], safeNum);
    const rawAway = pickFirst(r, ['away_team_goal_count', 'away_goals', 'away_goal_count'], safeNum);
    const status = pickFirst(r, ['status'], safeStr)?.toLowerCase();
    const isIncomplete = status === 'incomplete' || status === 'scheduled' || status === 'suspended' || status === 'canceled' || status === 'postponed';
    const played = !isIncomplete && status === 'complete';
    const homeGoals = played ? rawHome : null;
    const awayGoals = played ? rawAway : null;
    out.push({
      date: iso, timestamp: ms, home, away, homeGoals, awayGoals, played,
      oddsHome: pickFirst(r, ['odds_ft_home_team_win', 'odds_home_team_win', 'odds_ft_1'], safeNum),
      oddsDraw: pickFirst(r, ['odds_ft_draw', 'odds_draw', 'odds_ft_x'], safeNum),
      oddsAway: pickFirst(r, ['odds_ft_away_team_win', 'odds_away_team_win', 'odds_ft_2'], safeNum),
      oddsBttsYes: pickFirst(r, ['odds_btts_yes'], safeNum),
      oddsBttsNo: pickFirst(r, ['odds_btts_no'], safeNum),
      oddsOver25: pickFirst(r, ['odds_ft_over25', 'odds_over25'], safeNum),
      oddsUnder25: pickFirst(r, ['odds_ft_under25', 'odds_under25'], safeNum),
      preHomeGoalsAvg: pickFirst(r, ['pre_match_home_ppg', 'pre_match_teamA_overall_xg', 'home_ppg'], safeNum),
      preAwayGoalsAvg: pickFirst(r, ['pre_match_away_ppg', 'pre_match_teamB_overall_xg', 'away_ppg'], safeNum),
      preOver25Pct: pickFirst(r, ['over_25_percentage_pre_match', 'over25_percentage_pre_match', 'over_25_2_5_potential', 'over_25_potential'], safeNum),
      preBttsPct: pickFirst(r, ['btts_percentage_pre_match', 'btts_potential'], safeNum),
      htHomeGoals: pickFirst(r, ['home_team_goal_count_half_time', 'ht_home_goals'], safeNum),
      htAwayGoals: pickFirst(r, ['away_team_goal_count_half_time', 'ht_away_goals'], safeNum),
      attendance: pickFirst(r, ['attendance'], safeNum),
      stadium: pickFirst(r, ['stadium_name'], safeStr),
      homeShots: pickFirst(r, ['home_team_shots'], safeNum),
      awayShots: pickFirst(r, ['away_team_shots'], safeNum),
      homeShotsOT: pickFirst(r, ['home_team_shots_on_target'], safeNum),
      awayShotsOT: pickFirst(r, ['away_team_shots_on_target'], safeNum),
      homeCorners: pickFirst(r, ['home_team_corner_count'], safeNum),
      awayCorners: pickFirst(r, ['away_team_corner_count'], safeNum),
      homeCards: pickFirst(r, ['home_team_yellow_cards', 'home_team_cards'], safeNum),
      awayCards: pickFirst(r, ['away_team_yellow_cards', 'away_team_cards'], safeNum),
      preXgHome: pickFirst(r, ['Home Team Pre-Match xG', 'home_team_pre_match_xg', 'team_a_xg_prematch', 'team_a_xg'], safeNum),
      preXgAway: pickFirst(r, ['Away Team Pre-Match xG', 'away_team_pre_match_xg', 'team_b_xg_prematch', 'team_b_xg'], safeNum),
      raw: buildRaw(r),
    });
  }
  return out;
}