import type { CpMatch, CpTeam, CpTeamStats } from './types';
import type { MatchData, TeamStats, CornerLine } from '../types';
import { detectPlaystyle } from './playstyle';

/** Strict numeric reader (supports %, comma decimals); returns null if missing. */
function n(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const x = typeof v === 'number' ? v : parseFloat(String(v).replace('%', '').replace(',', '.'));
  return Number.isFinite(x) ? x : null;
}
const num = (v: unknown, d: number) => n(v) ?? d;

/** If value looks like a season total (>12) and we know matches played, convert to per-match. */
function perMatch(value: number | null, mp: number | null): number | null {
  if (value === null) return null;
  if (mp && mp > 0 && value > 12) return value / mp;
  return value;
}

function parseForm(raw: unknown, len = 5): ('W' | 'D' | 'L')[] {
  const s = String(raw || '').toUpperCase().replace(/[^WDL]/g, '');
  const last = s.slice(-len);
  return last.split('').filter((c): c is 'W' | 'D' | 'L' => c === 'W' || c === 'D' || c === 'L');
}

function pickPlaystyle(team: CpTeam): TeamStats['playStyle'] {
  const manual = (team.playstyle || '').toLowerCase().trim();
  const allowed = ['possession', 'counter', 'pressing', 'low-block', 'bus-parking', 'high-press'] as const;
  if (allowed.includes(manual as (typeof allowed)[number])) return manual as TeamStats['playStyle'];
  return detectPlaystyle(team.stats).primary as TeamStats['playStyle'];
}

function buildTeamStats(team: CpTeam, isHome: boolean): TeamStats {
  const s: CpTeamStats = team.stats || {};
  const mp = n(s.matches_played);
  const mpH = n(s.matches_played_home) ?? mp;
  const mpA = n(s.matches_played_away) ?? mp;

  const gs = perMatch(n(s.goals_scored_per_match) ?? n(s.goals_scored), mp);
  const gc = perMatch(n(s.goals_conceded_per_match) ?? n(s.goals_conceded), mp);
  const gsH = perMatch(n(s.goals_scored_per_match_home) ?? n(s.goals_scored_home), mpH) ?? gs;
  const gcH = perMatch(n(s.goals_conceded_per_match_home) ?? n(s.goals_conceded_home), mpH) ?? gc;
  const gsA = perMatch(n(s.goals_scored_per_match_away) ?? n(s.goals_scored_away), mpA) ?? gs;
  const gcA = perMatch(n(s.goals_conceded_per_match_away) ?? n(s.goals_conceded_away), mpA) ?? gc;

  const xg = n(s.xg) ?? n(isHome ? s.xg_for_avg_home : s.xg_for_avg_away) ?? n(s.xg_avg_per_match) ?? 1.3;
  const xga = n(s.xga) ?? n(isHome ? s.xg_against_avg_home : s.xg_against_avg_away) ?? n(s.xga_avg_per_match) ?? 1.3;

  const shots = perMatch(n(s.shots) ?? n(s.shots_per_match), mp) ?? 11;
  const sot = perMatch(n(s.shots_on_target) ?? n(s.shots_on_target_per_match), mp) ?? 4;
  const sotH = perMatch(n(s.shots_on_target_home), mpH) ?? sot;
  const sotA = perMatch(n(s.shots_on_target_away), mpA) ?? sot;
  const possession = (() => {
    const p = n(s.possession);
    if (p === null) return 50;
    return p > 1 ? p : p * 100;
  })();
  const da = perMatch(n(s.dangerous_attacks), mp) ?? 40;
  const corners = perMatch(n(s.corners_per_match) ?? n(s.corners), mp) ?? 5;
  const cornersH = perMatch(n(s.corners_per_match_home) ?? n(s.corners_home), mpH) ?? corners;
  const cornersA = perMatch(n(s.corners_per_match_away) ?? n(s.corners_away), mpA) ?? corners;
  const cards = perMatch(n(s.cards_per_match) ?? n(s.cards), mp) ?? 2;
  const fouls = perMatch(n(s.fouls_per_match) ?? n(s.fouls), mp) ?? 11;
  const cs = n(s.clean_sheets) ?? 0;
  const pos = n(s.league_position) ?? 10;
  const totalTeams = n(s.total_teams_in_league) ?? n(s.teams_in_league) ?? 20;

  const formAll = parseForm(s.form);
  const formH = parseForm(s.form_home ?? s.formHome ?? s.form, 5);
  const formA = parseForm(s.form_away ?? s.formAway ?? s.form, 5);

  return {
    name: team.name,
    goalsScored: gs ?? 1.3,
    goalsConceded: gc ?? 1.2,
    goalsScoredHome: gsH ?? 1.3,
    goalsConcededHome: gcH ?? 1.2,
    goalsScoredAway: gsA ?? 1.1,
    goalsConcededAway: gcA ?? 1.3,
    matchesPlayed: mp ?? 10,
    formLast5: formAll,
    formHome: formH,
    formAway: formA,
    xG: xg,
    xGA: xga,
    shots,
    shotsOnTarget: sot,
    shotsOnTargetHome: sotH,
    shotsOnTargetAway: sotA,
    possession,
    dangerousAttacks: da,
    corners,
    cornersPerMatch: corners,
    cornersPerMatchHome: cornersH,
    cornersPerMatchAway: cornersA,
    cards,
    cardsPerMatch: cards,
    fouls,
    playStyle: pickPlaystyle(team),
    leaguePosition: pos,
    totalTeamsInLeague: totalTeams,
    gkSaves: num(s.gk_saves ?? s.saves, 3),
  };
}

/** Convert Cento Power CSV-derived match into the dashboard's MatchData type. */
export function cpToMatchData(
  match: CpMatch,
  homeTeam: CpTeam,
  awayTeam: CpTeam,
  league: string,
): MatchData {
  const o = match.odds || {};
  const cornerLines: CornerLine[] = [];
  if (o.over_corners && o.under_corners) {
    cornerLines.push({ line: 9.5, oddsOver: o.over_corners, oddsUnder: o.under_corners });
  }
  return {
    homeTeam: buildTeamStats(homeTeam, true),
    awayTeam: buildTeamStats(awayTeam, false),
    league,
    oddsHome: o.home ?? 0,
    oddsDraw: o.draw ?? 0,
    oddsAway: o.away ?? 0,
    oddsOver25: o.over25 ?? 0,
    oddsUnder25: o.under25 ?? 0,
    oddsBTTSYes: o.btts_yes ?? 0,
    oddsBTTSNo: o.btts_no ?? 0,
    cornerLines,
    isDerby: false,
    homeTeamFatigued: false,
    awayTeamFatigued: false,
    homeEuropeanMatch: false,
    awayEuropeanMatch: false,
  };
}