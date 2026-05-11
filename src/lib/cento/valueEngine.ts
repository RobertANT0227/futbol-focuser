import type { CpMatch, CpTeam, ValueBet, MarketKey } from './types';
import { detectPlaystyle, styleClash, STYLE_LABEL, type PrimaryStyle } from './playstyle';

const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

// Poisson PMF
function pois(lambda: number, k: number) {
  let p = Math.exp(-lambda);
  for (let i = 1; i <= k; i++) p *= lambda / i;
  return p;
}
function poissonMatrix(lh: number, la: number, max = 7) {
  let pHome = 0, pDraw = 0, pAway = 0, pOver25 = 0, pBtts = 0;
  for (let h = 0; h <= max; h++) {
    for (let a = 0; a <= max; a++) {
      const p = pois(lh, h) * pois(la, a);
      if (h > a) pHome += p;
      else if (h === a) pDraw += p;
      else pAway += p;
      if (h + a > 2) pOver25 += p;
      if (h > 0 && a > 0) pBtts += p;
    }
  }
  return { pHome, pDraw, pAway, pOver25, pBtts };
}

function teamLambda(team: CpTeam, opp: CpTeam, isHome: boolean): number {
  const att = num(team.stats.xg, num(team.stats.goals_scored, 1.3));
  const def = num(opp.stats.xga, num(opp.stats.goals_conceded, 1.1));
  const homeBoost = isHome ? 1.12 : 0.92;
  return Math.max(0.2, ((att + def) / 2) * homeBoost);
}

function riskFromConfidence(conf: number, edge: number): 'low' | 'medium' | 'high' {
  if (conf >= 70 && edge >= 5) return 'low';
  if (conf >= 55) return 'medium';
  return 'high';
}

export interface EngineOptions {
  bankroll: number;
  edgeMin: number;       // % minimum edge
  kellyFraction: number; // 0..1 (e.g. 0.5 = half-Kelly)
  maxStakePct: number;   // cap (e.g. 0.05)
}

export function buildValueBets(
  match: CpMatch,
  homeTeam: CpTeam,
  awayTeam: CpTeam,
  opts: EngineOptions,
): ValueBet[] {
  const lh = teamLambda(homeTeam, awayTeam, true);
  const la = teamLambda(awayTeam, homeTeam, false);
  const m = poissonMatrix(lh, la);

  const psH = detectPlaystyle(homeTeam.stats).primary as PrimaryStyle;
  const psA = detectPlaystyle(awayTeam.stats).primary as PrimaryStyle;
  const clash = styleClash(psH, psA);

  const odds = match.odds || {};
  const candidates: { market: MarketKey; cat: ValueBet['category']; prob: number; odd?: number }[] = [
    { market: '1', cat: 'winner', prob: m.pHome, odd: odds.home },
    { market: 'X', cat: 'winner', prob: m.pDraw, odd: odds.draw },
    { market: '2', cat: 'winner', prob: m.pAway, odd: odds.away },
    { market: 'Over 2.5', cat: 'goals', prob: m.pOver25, odd: odds.over25 },
    { market: 'Under 2.5', cat: 'goals', prob: 1 - m.pOver25, odd: odds.under25 },
    { market: 'BTTS Yes', cat: 'goals', prob: m.pBtts, odd: odds.btts_yes },
    { market: 'BTTS No', cat: 'goals', prob: 1 - m.pBtts, odd: odds.btts_no },
  ];

  // Corners (rough Poisson on combined corners-per-match)
  const cph = num(homeTeam.stats.corners, 5);
  const cpa = num(awayTeam.stats.corners, 5);
  const cornersLambda = cph + cpa;
  // P(over 9.5) = 1 - CDF(9)
  let cdf = 0;
  for (let k = 0; k <= 9; k++) cdf += pois(cornersLambda, k);
  const pOver95Corners = 1 - cdf;
  candidates.push({ market: 'Over 9.5 Corners', cat: 'corners', prob: pOver95Corners, odd: odds.over_corners });
  candidates.push({ market: 'Under 9.5 Corners', cat: 'corners', prob: 1 - pOver95Corners, odd: odds.under_corners });

  // Cards
  const cardsLambda = num(homeTeam.stats.cards, 2) + num(awayTeam.stats.cards, 2);
  let ccdf = 0;
  for (let k = 0; k <= 4; k++) ccdf += pois(cardsLambda, k);
  const pOver45Cards = 1 - ccdf;
  candidates.push({ market: 'Over 4.5 Cards', cat: 'cards', prob: pOver45Cards, odd: odds.over_cards });
  candidates.push({ market: 'Under 4.5 Cards', cat: 'cards', prob: 1 - pOver45Cards, odd: odds.under_cards });

  const variance = Math.min(1, Math.abs(lh - la) < 0.3 ? 0.7 : 0.4);
  const out: ValueBet[] = [];

  for (const c of candidates) {
    const odd = c.odd && c.odd > 1.01 ? c.odd : null;
    if (!odd) continue;
    const implied = 1 / odd;
    const wr = c.prob;
    const edge = (wr - implied) * 100;
    if (edge < opts.edgeMin) continue;
    const ev = wr * odd - 1;
    // Kelly
    const b = odd - 1;
    const kelly = Math.max(0, (b * wr - (1 - wr)) / b);
    const stakePct = Math.min(opts.maxStakePct, kelly * opts.kellyFraction);
    const conf = Math.round(Math.min(100, 40 + edge * 4 + (clash ? 5 : 0) - variance * 10));
    out.push({
      matchId: match.id,
      league: '',
      home: match.home,
      away: match.away,
      market: c.market,
      category: c.cat,
      odds: odd,
      impliedProb: implied,
      modelWR: wr,
      ev,
      edge,
      confidence: conf,
      risk: riskFromConfidence(conf, edge),
      variance,
      styleClash: clash,
      homeStyle: STYLE_LABEL[psH],
      awayStyle: STYLE_LABEL[psA],
      suggestedStakePct: stakePct,
      suggestedStakeLei: Math.round(stakePct * opts.bankroll),
    });
  }

  // Best-value first per match
  out.sort((a, b) => b.edge - a.edge);
  return out;
}