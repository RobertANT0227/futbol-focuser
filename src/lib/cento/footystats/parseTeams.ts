import type { TeamProfile } from './types';
import { pickFirst, safeNum, safeStr } from './util';

function parseForm(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .toUpperCase()
    .split(/[^WDL]+/)
    .filter(Boolean)
    .flatMap((tok) => tok.split(''))
    .filter((c) => c === 'W' || c === 'D' || c === 'L')
    .slice(0, 6);
}

function buildRaw(r: Record<string, unknown>): Record<string, number | string | null> {
  const out: Record<string, number | string | null> = {};
  for (const [k, v] of Object.entries(r)) {
    if (v === null || v === undefined || v === '') { out[k] = null; continue; }
    const n = Number(String(v).replace('%', '').replace(/,/g, '.'));
    out[k] = Number.isFinite(n) ? n : String(v);
  }
  return out;
}

export function parseTeams(rows: Record<string, unknown>[]): TeamProfile[] {
  const out: TeamProfile[] = [];
  for (const r of rows) {
    const name = pickFirst(r, ['team_name', 'common_name', 'name'], safeStr);
    if (!name) continue;
    const formStr = pickFirst(r, ['recent_form', 'form_str', 'form'], safeStr);
    out.push({
      name,
      matchesPlayed: pickFirst(r, ['matches_played'], safeNum),
      wins: pickFirst(r, ['wins'], safeNum),
      draws: pickFirst(r, ['draws'], safeNum),
      losses: pickFirst(r, ['losses'], safeNum),
      points: pickFirst(r, ['points_per_game_overall', 'points'], safeNum),
      ppg: pickFirst(r, ['points_per_game'], safeNum),
      position: pickFirst(r, ['league_position', 'position'], safeNum),
      goalsFor: pickFirst(r, ['goals_scored'], safeNum),
      goalsAgainst: pickFirst(r, ['goals_conceded'], safeNum),
      goalDiff: pickFirst(r, ['goal_difference'], safeNum),
      cleanSheetsPct: pickFirst(r, ['clean_sheet_percentage', 'clean_sheets_percentage'], safeNum),
      ftsPct: pickFirst(r, ['fts_percentage', 'fail_to_score_percentage'], safeNum),
      bttsPct: pickFirst(r, ['btts_percentage'], safeNum),
      over25Pct: pickFirst(r, ['over25_percentage', 'over_25_percentage'], safeNum),
      under25Pct: pickFirst(r, ['under25_percentage', 'under_25_percentage'], safeNum),
      homePlayed: pickFirst(r, ['matches_played_home'], safeNum),
      homeWins: pickFirst(r, ['wins_home'], safeNum),
      homeDraws: pickFirst(r, ['draws_home'], safeNum),
      homeLosses: pickFirst(r, ['losses_home'], safeNum),
      homeGFAvg: pickFirst(r, ['goals_scored_per_match_home', 'avg_goals_scored_home'], safeNum),
      homeGAAvg: pickFirst(r, ['goals_conceded_per_match_home', 'avg_goals_conceded_home'], safeNum),
      homeBttsPct: pickFirst(r, ['btts_percentage_home'], safeNum),
      homeOver25Pct: pickFirst(r, ['over25_percentage_home', 'over_25_percentage_home'], safeNum),
      awayPlayed: pickFirst(r, ['matches_played_away'], safeNum),
      awayWins: pickFirst(r, ['wins_away'], safeNum),
      awayDraws: pickFirst(r, ['draws_away'], safeNum),
      awayLosses: pickFirst(r, ['losses_away'], safeNum),
      awayGFAvg: pickFirst(r, ['goals_scored_per_match_away', 'avg_goals_scored_away'], safeNum),
      awayGAAvg: pickFirst(r, ['goals_conceded_per_match_away', 'avg_goals_conceded_away'], safeNum),
      awayBttsPct: pickFirst(r, ['btts_percentage_away'], safeNum),
      awayOver25Pct: pickFirst(r, ['over25_percentage_away', 'over_25_percentage_away'], safeNum),
      cornersForAvg: pickFirst(r, ['corners_per_match', 'corners_per_match_overall', 'team_a_corners_per_match', 'corners_for_per_match'], safeNum),
      cornersAgainstAvg: pickFirst(r, ['corners_against_per_match', 'corners_against_per_match_overall'], safeNum),
      cornersForHome: pickFirst(r, ['corners_per_match_home', 'corners_for_per_match_home'], safeNum),
      cornersAgainstHome: pickFirst(r, ['corners_against_per_match_home'], safeNum),
      cornersForAway: pickFirst(r, ['corners_per_match_away', 'corners_for_per_match_away'], safeNum),
      cornersAgainstAway: pickFirst(r, ['corners_against_per_match_away'], safeNum),
      form: parseForm(formStr),
      shotsAvg: pickFirst(r, ['shots_per_match', 'avg_shots'], safeNum),
      shotsOTAvg: pickFirst(r, ['shots_on_target_per_match'], safeNum),
      shotsConcededAvg: pickFirst(r, ['shots_conceded_per_match'], safeNum),
      attackingEff: pickFirst(r, ['attacking_efficiency', 'attack_score'], safeNum),
      defensiveEff: pickFirst(r, ['defensive_efficiency', 'defence_score'], safeNum),
      fts2score: pickFirst(r, ['first_team_to_score_percentage'], safeNum),
      scoringFirstHalfPct: pickFirst(r, ['goals_scored_first_half_percentage', 'goals_scored_min_0_to_45_percentage'], safeNum),
      scoringSecondHalfPct: pickFirst(r, ['goals_scored_second_half_percentage', 'goals_scored_min_46_to_90_percentage'], safeNum),
      concedingFirstHalfPct: pickFirst(r, ['goals_conceded_first_half_percentage'], safeNum),
      concedingSecondHalfPct: pickFirst(r, ['goals_conceded_second_half_percentage'], safeNum),
      xgFor: pickFirst(r, ['xg_for_avg_overall', 'xg_for_avg', 'xg_for'], safeNum),
      xgAgainst: pickFirst(r, ['xg_against_avg_overall', 'xg_against_avg', 'xg_against'], safeNum),
      xgForHome: pickFirst(r, ['xg_for_avg_home'], safeNum),
      xgForAway: pickFirst(r, ['xg_for_avg_away'], safeNum),
      xgAgainstHome: pickFirst(r, ['xg_against_avg_home'], safeNum),
      xgAgainstAway: pickFirst(r, ['xg_against_avg_away'], safeNum),
      winPct: pickFirst(r, ['win_percentage'], safeNum),
      drawPct: pickFirst(r, ['draw_percentage_overall', 'draw_percentage'], safeNum),
      lossPct: pickFirst(r, ['loss_percentage_ovearll', 'loss_percentage_overall', 'loss_percentage'], safeNum),
      raw: buildRaw(r),
    });
  }
  return out;
}