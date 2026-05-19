// ENGINE2 — FootyStats powered
// Wraps the existing Cento engine (analyzeMatch) and enriches the result with
// structured reasoning (boosters / reducers / risk factors / summary) and
// context flags. Preserves the entire Cento DNA — confidence math, grading,
// market ranking, volatility handling, draw calibration, bankroll integration.
import { analyzeMatch } from '@/lib/cento/engine/pickEngine';
import type {
  LeagueStats,
  ParsedMatch,
  TeamProfile,
} from '@/lib/cento/footystats/types';
import type { AnalysisReasoning, ContextFlag, PowerAnalysis2 } from './types';

function buildReasoning(a: ReturnType<typeof analyzeMatch>): AnalysisReasoning {
  const boosters: string[] = [];
  const reducers: string[] = [];
  const riskFactors: string[] = [];
  const { ratingsHome: rh, ratingsAway: ra, expectedGoalsHome, expectedGoalsAway, quality, topMarket, context, conflicts, explanation, league, homeTeam, awayTeam } = a;

  // Boosters — derived from support bullets + strong signals
  for (const b of explanation) {
    if (b.kind === 'support') boosters.push(b.text);
    else if (b.kind === 'risk') reducers.push(b.text);
  }
  if (rh.attack >= 70 && (topMarket.key === '1' || topMarket.key === 'OVER_2_5' || topMarket.key === 'BTTS_YES')) {
    boosters.push(`Atac gazdă peste media ligii (${rh.attack.toFixed(0)}/100).`);
  }
  if (ra.defense >= 70 && (topMarket.key === 'UNDER_2_5' || topMarket.key === 'BTTS_NO')) {
    boosters.push(`Apărare oaspete solidă (${ra.defense.toFixed(0)}/100).`);
  }
  if (topMarket.odds && topMarket.prob * topMarket.odds > 1.05) {
    boosters.push(`Cotele confirmă probabilitatea modelului (edge ${((topMarket.prob * topMarket.odds - 1) * 100).toFixed(1)}%).`);
  }

  // Reducers — additional context
  if (quality.sampleHome < 5 || quality.sampleAway < 5) {
    reducers.push(`Eșantion mic — ${quality.sampleHome}/${quality.sampleAway} meciuri în split.`);
  }
  if (league?.predictionRisk != null && league.predictionRisk > 65) {
    reducers.push(`Liga are risc de predicție ${league.predictionRisk.toFixed(0)}%.`);
  }
  if (quality.band === 'Limited') reducers.push('Date limitate — coverage redus.');

  // Risk factors — hard blockers / PASS reasons
  if (a.grade === 'PASS') {
    if (topMarket.prob < 0.42) riskFactors.push(`Probabilitate top doar ${(topMarket.prob * 100).toFixed(0)}% — sub pragul 42%.`);
    if (a.confidence < 50) riskFactors.push(`Confidence ${a.confidence}/100 sub pragul 50.`);
  }
  for (const c of conflicts) riskFactors.push(c);
  if (rh.matchVolatility > 75 && ra.matchVolatility > 75) riskFactors.push('Ambele echipe imprevizibile — volatilitate dublă.');
  if (!homeTeam) riskFactors.push(`Profil lipsă: ${a.match.home}.`);
  if (!awayTeam) riskFactors.push(`Profil lipsă: ${a.match.away}.`);

  const summary = a.grade === 'PASS'
    ? `Modelul preferă PASS — semnal insuficient (xG ${expectedGoalsHome.toFixed(2)}-${expectedGoalsAway.toFixed(2)}, top ${(topMarket.prob * 100).toFixed(0)}%).`
    : `${topMarket.label} la ${(topMarket.prob * 100).toFixed(0)}% pe model ${expectedGoalsHome.toFixed(2)}-${expectedGoalsAway.toFixed(2)} xG, confidence ${a.confidence}.`;

  // Dedupe while preserving order
  const dedupe = (arr: string[]) => Array.from(new Set(arr));
  return {
    boosters: dedupe(boosters).slice(0, 6),
    reducers: dedupe(reducers).slice(0, 6),
    riskFactors: dedupe(riskFactors).slice(0, 6),
    summary,
  };
}

function detectContextFlags(a: ReturnType<typeof analyzeMatch>): ContextFlag[] {
  const flags: ContextFlag[] = [];
  const { ratingsHome: rh, ratingsAway: ra, context, league, homeTeam, awayTeam, expectedGoalsHome, expectedGoalsAway } = a;
  if (context.earlySeason) flags.push('EARLY_SEASON');
  if ((rh.matchVolatility + ra.matchVolatility) / 2 > 65) flags.push('HIGH_VOLATILITY');
  if (rh.homeAdvantage > 65) flags.push('STRONG_HOME_ENV');
  if (expectedGoalsHome + expectedGoalsAway < 2.2) flags.push('LOW_SCORING_LEAGUE');
  if (league?.drawPct != null && league.drawPct >= 28) flags.push('HIGH_DRAW_TENDENCY');
  const h2 = homeTeam?.scoringSecondHalfPct;
  const a2 = awayTeam?.scoringSecondHalfPct;
  if ((h2 ?? 0) >= 55 && (a2 ?? 0) >= 55) flags.push('LATE_SCORING_TEAMS');
  if (rh.matchVolatility > 70 || ra.matchVolatility > 70) {
    if (!flags.includes('HIGH_VOLATILITY')) flags.push('INCONSISTENT_FORM');
  }
  return flags;
}

export function analyzeMatch2(
  match: ParsedMatch,
  home: TeamProfile | undefined,
  away: TeamProfile | undefined,
  league: LeagueStats | undefined,
): PowerAnalysis2 {
  const base = analyzeMatch(match, home, away, league);
  return {
    ...base,
    reasoning: buildReasoning(base),
    contextFlags: detectContextFlags(base),
  };
}