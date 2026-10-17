import type { MatchData, TeamStats } from '../types';

/**
 * Stocare locală pentru ponderile învățate (model_weights activ).
 * Se încarcă din backend la montarea aplicației; motorul citește sincron de aici.
 */

export interface LearnedWeights {
  /** Coeficienți Poisson (inclusiv intercept), în ordinea FEATURE_NAMES. */
  coefficients: number[];
  /** Mediile trăsăturilor pe setul de antrenare (pentru z-score și ln-rapoarte). */
  featureMeans: number[];
  /** Deviațiile standard (0 => tratat ca 1). */
  featureStds: number[];
  nRecords: number;
  brierLearned: number;
  brierFixed: number;
}

export const FEATURE_NAMES = [
  'intercept',
  'ln_scored', 'ln_xg', 'ln_sot', 'ln_da', 'ln_shots', 'ln_corners',
  'z_possession', 'z_fouls', 'z_cards',
  'style_possession', 'style_counter', 'style_pressing', 'style_lowblock', 'style_busparking',
  'ln_opp_conceded', 'ln_opp_xga', 'z_opp_gksaves',
  'z_shots_interaction',
] as const;

const LS_KEY = 'ba_learned_weights';
let cached: LearnedWeights | null | undefined = undefined;
let enabled = false;

export function setLearnedWeights(w: LearnedWeights | null) {
  cached = w;
  try {
    if (w) localStorage.setItem(LS_KEY, JSON.stringify(w));
    else localStorage.removeItem(LS_KEY);
  } catch { /* ignore */ }
}

export function getLearnedWeights(): LearnedWeights | null {
  if (cached !== undefined) return cached;
  try {
    const raw = localStorage.getItem(LS_KEY);
    cached = raw ? (JSON.parse(raw) as LearnedWeights) : null;
  } catch { cached = null; }
  return cached;
}

export function setLearnedWeightsEnabled(on: boolean) {
  enabled = on;
  try { localStorage.setItem(LS_KEY + '_enabled', on ? '1' : '0'); } catch { /* ignore */ }
}

export function isLearnedWeightsEnabled(): boolean {
  if (enabled) return true;
  try { return localStorage.getItem(LS_KEY + '_enabled') === '1'; } catch { return false; }
}

/** Ponderi active = există, sunt activate în backend ȘI comutatorul e pornit. */
export function getActiveLearnedWeights(): LearnedWeights | null {
  if (!isLearnedWeightsEnabled()) return null;
  return getLearnedWeights();
}

// ===== FEATURE EXTRACTION =====

function safeLn(v: number, ref: number): number {
  if (!(v > 0) || !(ref > 0)) return 0;
  return Math.log(v / ref);
}

function z(v: number, mean: number, std: number): number {
  if (!(std > 0)) return 0;
  if (!Number.isFinite(v)) return 0;
  return (v - mean) / std;
}

function styleBin(style: string, target: string): number {
  return style === target ? 1 : 0;
}

/**
 * Construiește vectorul de trăsături pentru o echipă care marchează
 * împotriva adversarului. Ordinea = FEATURE_NAMES.
 * Valori lipsă/0 => trăsătură 0 (neutru).
 */
export function buildFeatures(
  scoring: TeamStats,
  opponent: TeamStats,
  scoringStyle: string,
  shotsBoth: number,
  means: number[],
  stds: number[],
): number[] {
  // means/stds indexate ca FEATURE_NAMES (fără intercept la index 0 => shift)
  const m = (i: number) => means[i] ?? 0;
  const s = (i: number) => (stds[i] ?? 0) > 0 ? stds[i] : 1;
  return [
    1,
    safeLn(scoring.goalsScored, Math.exp(m(1))),
    safeLn(scoring.xG, Math.exp(m(2))),
    safeLn(scoring.shotsOnTarget, Math.exp(m(3))),
    safeLn(scoring.dangerousAttacks, Math.exp(m(4))),
    safeLn(scoring.shots, Math.exp(m(5))),
    safeLn(scoring.cornersPerMatch, Math.exp(m(6))),
    z(scoring.possession, m(7), s(7)),
    z(scoring.fouls, m(8), s(8)),
    z(scoring.cardsPerMatch, m(9), s(9)),
    styleBin(scoringStyle, 'possession'),
    styleBin(scoringStyle, 'counter'),
    styleBin(scoringStyle, 'pressing'),
    styleBin(scoringStyle, 'low-block'),
    styleBin(scoringStyle, 'bus-parking'),
    safeLn(opponent.goalsConceded, Math.exp(m(15))),
    safeLn(opponent.xGA, Math.exp(m(16))),
    z(opponent.gkSaves, m(17), s(17)),
    z(shotsBoth, m(18), s(18)),
  ];
}

/**
 * xG cu ponderi învățate: media ligii × exp(w · trăsături).
 * Stilul NU se aplică separat — este deja trăsătură în model.
 */
export function computeLearnedXG(match: MatchData, w: LearnedWeights): { homeXG: number; awayXG: number } {
  const leagueHome = match.leagueAvgHomeGoals > 0 ? match.leagueAvgHomeGoals : 1.5;
  const leagueAway = match.leagueAvgAwayGoals > 0 ? match.leagueAvgAwayGoals : 1.2;
  const h = match.homeTeam, a = match.awayTeam;
  const shotsBoth = Math.log(Math.max(h.shots, 1)) + Math.log(Math.max(a.shots, 1));

  const dot = (feats: number[]) => feats.reduce((s, f, i) => s + f * (w.coefficients[i] ?? 0), 0);
  const clamp = (x: number) => Math.min(4.5, Math.max(0.15, x));

  const fH = buildFeatures(h, a, h.playStyle, shotsBoth, w.featureMeans, w.featureStds);
  const fA = buildFeatures(a, h, a.playStyle, shotsBoth, w.featureMeans, w.featureStds);

  return {
    homeXG: clamp(leagueHome * Math.exp(dot(fH))),
    awayXG: clamp(leagueAway * Math.exp(dot(fA))),
  };
}
