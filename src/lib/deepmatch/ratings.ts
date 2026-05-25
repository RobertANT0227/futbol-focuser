// DeepMatch Intelligence — derived ratings & insights
import type { ParsedTeamStats } from './parser';

export interface TeamRatings {
  offensive: number;       // 0-100
  defensive: number;       // 0-100 (higher = better defense)
  tempo: number;           // 0-100
  cornerPressure: number;  // 0-100
  bttsPotential: number;   // 0-100
  overPotential: number;   // 0-100
  discipline: number;      // 0-100 (higher = MORE risk)
  homeAdvantage?: number;  // 0-100 (home team only)
  awayResistance?: number; // 0-100 (away team only)
  confidence: number;      // 0-100 (sample reliability)
}

const clamp = (v: number, min = 0, max = 100) => Math.max(min, Math.min(max, v));
const safe = (v: number | undefined, fallback = 0) => (v === undefined || !Number.isFinite(v) ? fallback : v);

export function computeRatings(t: ParsedTeamStats, isHome: boolean): TeamRatings {
  const gs = safe(t.goalsScored, 1.2);
  const gc = safe(t.goalsConceded, 1.2);
  const xG = safe(t.xG, gs);
  const xGA = safe(t.xGA, gc);
  const sot = safe(t.shotsOnTarget, 3.5);
  const sh = safe(t.shots, 11);
  const da = safe(t.dangerousAttacks, 40);
  const cpm = safe(t.cornersPerMatch, 5);
  const cards = safe(t.cardsPerMatch, 2);
  const fouls = safe(t.fouls, 12);
  const cs = safe(t.cleanSheetPct, 25);
  const btts = safe(t.bttsPct, 50);
  const over = safe(t.over25Pct, 50);

  const offensive = clamp((gs * 22) + (xG * 18) + (sot * 4) + (da * 0.15));
  const defensive = clamp(100 - ((gc * 25) + (xGA * 18) - (cs * 0.4)));
  const tempo = clamp((sh * 3) + (da * 0.4) + (cpm * 2.5));
  const cornerPressure = clamp(cpm * 8.5);
  const bttsPotential = clamp(btts > 0 ? btts : (gs * 25 + (100 - defensive) * 0.3));
  const overPotential = clamp(over > 0 ? over : ((gs + gc) * 22));
  const discipline = clamp(cards * 18 + fouls * 1.4);
  const mp = safe(t.matchesPlayed, 15);
  const confidence = clamp(Math.min(mp, 30) * 3.33);

  const r: TeamRatings = { offensive, defensive, tempo, cornerPressure, bttsPotential, overPotential, discipline, confidence };

  if (isHome) {
    const gsh = safe(t.goalsScoredHome, gs);
    const gsa = safe(t.goalsScoredAway, gs * 0.7);
    r.homeAdvantage = clamp(50 + (gsh - gsa) * 30);
  } else {
    const gca = safe(t.goalsConcededAway, gc);
    const gch = safe(t.goalsConcededHome, gc * 0.85);
    r.awayResistance = clamp(100 - (gca * 30) + (gch - gca) * 15);
  }

  return r;
}

export interface MatchInsight {
  text: string;
  tone: 'positive' | 'negative' | 'neutral';
}

export function generateInsights(
  home: ParsedTeamStats,
  away: ParsedTeamStats,
  hr: TeamRatings,
  ar: TeamRatings,
): MatchInsight[] {
  const out: MatchInsight[] = [];

  if (hr.offensive - ar.defensive > 20) out.push({ tone: 'positive', text: 'Gazdele au avantaj ofensiv clar acasă vs. defensiva oaspeților.' });
  if (ar.offensive - hr.defensive > 15) out.push({ tone: 'negative', text: 'Oaspeții pun presiune ofensivă peste capacitatea defensivă a gazdelor.' });

  const xgDiff = Math.abs(safe(home.xG, 0) - safe(away.xG, 0));
  if (xgDiff > 0.6) out.push({ tone: 'neutral', text: `Diferență mare de xG între echipe (${xgDiff.toFixed(2)}).` });

  if ((hr.bttsPotential + ar.bttsPotential) / 2 > 60) out.push({ tone: 'positive', text: 'Meci cu potențial ridicat de BTTS.' });
  if ((hr.overPotential + ar.overPotential) / 2 > 60) out.push({ tone: 'positive', text: 'Profil clar de Over 2.5 — ambele echipe au medii ofensive ridicate.' });
  if ((hr.overPotential + ar.overPotential) / 2 < 40) out.push({ tone: 'negative', text: 'Profil de Under 2.5 — ritm scăzut, ambele echipe defensive.' });

  if ((hr.cornerPressure + ar.cornerPressure) / 2 > 60) out.push({ tone: 'positive', text: 'Ritm ridicat de cornere așteptat.' });

  if (hr.discipline > 60 || ar.discipline > 60) out.push({ tone: 'negative', text: 'Risc disciplinar ridicat — multe faulturi/cartonașe.' });

  const sotAway = safe(away.shotsOnTargetAway, safe(away.shotsOnTarget, 0));
  if (sotAway > 4.5) out.push({ tone: 'neutral', text: 'Oaspeții generează șuturi pe poartă consistente în deplasare.' });

  if (hr.confidence < 40 || ar.confidence < 40) out.push({ tone: 'neutral', text: 'Atenție: eșantion de meciuri redus — încredere statistică limitată.' });

  if (!out.length) out.push({ tone: 'neutral', text: 'Datele indică un meci echilibrat fără edge-uri statistice majore.' });
  return out;
}

export interface PredictionScore {
  overallEdge: 'home' | 'away' | 'balanced';
  confidence: number; // 0-100
}

export function predictionScore(hr: TeamRatings, ar: TeamRatings): PredictionScore {
  const homeScore = hr.offensive + hr.defensive + (hr.homeAdvantage ?? 50);
  const awayScore = ar.offensive + ar.defensive + (ar.awayResistance ?? 50);
  const diff = homeScore - awayScore;
  const overallEdge: PredictionScore['overallEdge'] = Math.abs(diff) < 15 ? 'balanced' : diff > 0 ? 'home' : 'away';
  const confidence = clamp((hr.confidence + ar.confidence) / 2 + Math.min(Math.abs(diff) / 3, 20));
  return { overallEdge, confidence };
}