export const markets = {
  over05: 'Peste 0.5 în restul meciului',
  over15: 'Peste 1.5 în restul meciului',
  over25: 'Peste 2.5 în tot meciul',
  nextHome: 'Următorul gol – gazde',
  nextAway: 'Următorul gol – oaspeți',
} as const;
export type Market = keyof typeof markets;
export interface LiveInput {
  league: string; minute: number; homeGoals: number; awayGoals: number;
  shotsHome: number; shotsAway: number; targetHome: number; targetAway: number;
  cornersHome: number; cornersAway: number; hasXg: boolean;
  xgHome: number | null; xgAway: number | null;
  preHome: number | null; preAway: number | null;
  pressure: 'low' | 'medium' | 'high'; confirmed: boolean;
  reds: 'none' | 'home' | 'away' | 'both'; market: Market;
  odds: number; oppositeOdds: number | null; bank: number | null;
}
export interface LiveSettings {
  proxyTarget: number; proxyShot: number; proxyCorner: number; lateFactor: number;
  pressureLow: number; pressureMedium: number; pressureHigh: number;
  redTotal: number; redAdvantage: number; redDisadvantage: number;
  minEdge: number; minEv: number; minuteStart: number; minuteEnd: number;
  kellyFraction: number; stakeCap: number; defaultHome: number; defaultAway: number;
}
export const defaultSettings: LiveSettings = {
  proxyTarget: .30, proxyShot: .04, proxyCorner: .02, lateFactor: 1.08,
  pressureLow: .9, pressureMedium: 1, pressureHigh: 1.1,
  redTotal: 1.1, redAdvantage: 1.25, redDisadvantage: .75,
  minEdge: 5, minEv: 5, minuteStart: 20, minuteEnd: 80,
  kellyFraction: .25, stakeCap: 2, defaultHome: 1.35, defaultAway: 1.15,
};
export const defaultInput: LiveInput = {
  league: '', minute: 30, homeGoals: 0, awayGoals: 0,
  shotsHome: 0, shotsAway: 0, targetHome: 0, targetAway: 0,
  cornersHome: 0, cornersAway: 0, hasXg: false, xgHome: null, xgAway: null,
  preHome: null, preAway: null, pressure: 'medium', confirmed: false,
  reds: 'none', market: 'over05', odds: 2, oppositeOdds: null, bank: null,
};
export interface LiveResult {
  probability: number; rawProbability: number; breakEven: number; edge: number; ev: number;
  lambda: number; lambdaHome: number; lambdaAway: number; weight: number;
  xgHome: number; xgAway: number; minOdds: number | null;
  confidence: 'Mare' | 'Medie' | 'Mică'; confidenceScore: number;
  verdict: 'PARIAZĂ' | 'AȘTEAPTĂ' | 'PAS'; testMode: boolean; won: boolean;
  stakeFraction: number; stake: number; reasons: string[];
}
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export function poissonAtLeast(lambda: number, k: number): number {
  if (k <= 0) return 1;
  if (lambda <= 0) return 0;
  let term = Math.exp(-lambda), sum = term;
  for (let i = 1; i < k; i++) { term *= lambda / i; sum += term; }
  return clamp(1 - sum, 0, 1);
}
export function validateInput(i: LiveInput): string[] {
  const errors: string[] = [];
  if (!i.league.trim()) errors.push('Completează liga.');
  if (!Number.isInteger(i.minute) || i.minute < 0 || i.minute > 90) errors.push('Minutul trebuie să fie între 0 și 90.');
  const counts = [i.homeGoals, i.awayGoals, i.shotsHome, i.shotsAway, i.targetHome, i.targetAway, i.cornersHome, i.cornersAway];
  if (counts.some(v => !Number.isInteger(v) || v < 0)) errors.push('Scorul, șuturile și cornerele trebuie să fie numere întregi pozitive sau zero.');
  if (!Number.isFinite(i.odds) || i.odds <= 1) errors.push('Cota trebuie să fie mai mare decât 1.');
  if (i.oppositeOdds !== null && (!Number.isFinite(i.oppositeOdds) || i.oppositeOdds <= 1)) errors.push('Cota opusă trebuie să fie mai mare decât 1.');
  if (i.hasXg && (i.xgHome === null || i.xgAway === null)) errors.push('Completează ambele valori xG live sau selectează Indisponibil.');
  if ([i.xgHome, i.xgAway, i.preHome, i.preAway, i.bank].some(v => v !== null && (!Number.isFinite(v) || v < 0))) errors.push('xG și banca nu pot fi negative sau invalide.');
  if ((i.preHome ?? 1) === 0 && (i.preAway ?? 1) === 0) errors.push('Totalul golurilor așteptate pre-meci trebuie să fie pozitiv.');
  return errors;
}
export function validateSettings(s: LiveSettings): string[] {
  const errors: string[] = [];
  if (Object.values(s).some(v => !Number.isFinite(v) || v < 0)) errors.push('Constantele trebuie să fie numere pozitive sau zero.');
  if (!Number.isInteger(s.minuteStart) || !Number.isInteger(s.minuteEnd) || s.minuteStart > s.minuteEnd || s.minuteEnd > 90) errors.push('Fereastra de minute trebuie să fie ordonată, între 0 și 90.');
  if (s.kellyFraction > 1 || s.stakeCap > 100 || s.minEdge >= 90 || s.minEv > 100) errors.push('Fracția Kelly ≤ 1, limita mizei ≤ 100%, edge < 90 pp și EV ≤ 100%.');
  if (s.defaultHome + s.defaultAway <= 0) errors.push('Totalul xG implicit trebuie să fie pozitiv.');
  return errors;
}
export function analyzeLive(i: LiveInput, s: LiveSettings = defaultSettings, settled = 0): LiveResult {
  const errors = [...validateInput(i), ...validateSettings(s)];
  if (errors.length) throw new Error(errors.join(' '));
  const rem = 90 - i.minute;
  const preHome = i.preHome ?? s.defaultHome, preAway = i.preAway ?? s.defaultAway;
  const preTotal = preHome + preAway;
  const proxy = (shots: number, target: number, corners: number) => s.proxyTarget * target + s.proxyShot * Math.max(0, shots - target) + s.proxyCorner * corners;
  const xgHome = i.hasXg ? (i.xgHome ?? 0) : proxy(i.shotsHome, i.targetHome, i.cornersHome);
  const xgAway = i.hasXg ? (i.xgAway ?? 0) : proxy(i.shotsAway, i.targetAway, i.cornersAway);
  const xgTotal = xgHome + xgAway;
  const base = preTotal * rem / 90 * (i.minute > 60 ? s.lateFactor : 1);
  const live = xgTotal / Math.max(i.minute, 1) * rem;
  const weight = Math.min(.6, i.minute / (i.minute + 30));
  const pressure = i.pressure === 'low' ? s.pressureLow : i.pressure === 'high' && i.confirmed ? s.pressureHigh : i.pressure === 'medium' ? s.pressureMedium : 1;
  const lambda = rem === 0 ? 0 : clamp(((1 - weight) * base + weight * live) * pressure * (i.reds === 'none' ? 1 : s.redTotal), .02, 3);
  let share = .5 * (xgTotal > 0 ? xgHome / xgTotal : preHome / preTotal) + .5 * preHome / preTotal;
  let homeWeight = share, awayWeight = 1 - share;
  if (i.reds === 'home') { homeWeight *= s.redDisadvantage; awayWeight *= s.redAdvantage; }
  if (i.reds === 'away') { homeWeight *= s.redAdvantage; awayWeight *= s.redDisadvantage; }
  if (i.reds === 'both') { homeWeight *= s.redDisadvantage; awayWeight *= s.redDisadvantage; }
  share = homeWeight + awayWeight > 0 ? homeWeight / (homeWeight + awayWeight) : .5;
  const lambdaHome = lambda * share, lambdaAway = lambda - lambdaHome;
  const won = i.market === 'over25' && i.homeGoals + i.awayGoals >= 3;
  const rawProbability = i.market === 'over05' ? poissonAtLeast(lambda, 1)
    : i.market === 'over15' ? poissonAtLeast(lambda, 2)
    : i.market === 'over25' ? poissonAtLeast(lambda, 3 - i.homeGoals - i.awayGoals)
    : (i.market === 'nextHome' ? share : 1 - share) * poissonAtLeast(lambda, 1);
  // Conservative cap also applies to decision math, avoiding a hidden higher probability.
  const probability = Math.min(.9, rawProbability);
  const implied = 1 / i.odds;
  // The opposite next-goal selection omits the no-goal outcome and is not a binary complement.
  const binary = i.market !== 'nextHome' && i.market !== 'nextAway';
  const breakEven = i.oppositeOdds && binary ? implied / (implied + 1 / i.oppositeOdds) : implied;
  const edge = (probability - breakEven) * 100, ev = probability * i.odds - 1;
  let score = 3;
  const reasons: string[] = [];
  if (!i.hasXg) { score--; reasons.push('xG live indisponibil: aproximare din șuturi și cornere.'); }
  if (i.preHome === null || i.preAway === null) { score--; reasons.push('Date pre-meci incomplete: se folosesc valorile implicite pentru câmpurile goale.'); }
  if (i.minute < 15) { score--; reasons.push('Mai puțin de 15 minute: eșantion live scurt.'); }
  const inconsistent = i.targetHome > i.shotsHome || i.targetAway > i.shotsAway;
  if (inconsistent) { score--; reasons.push('Date neconcordante: șuturile pe poartă depășesc șuturile totale.'); }
  if (!i.confirmed) { score--; reasons.push('Presiunea nu este confirmată în două actualizări.'); }
  const confidence = score >= 3 ? 'Mare' : score === 2 ? 'Medie' : 'Mică';
  const inWindow = i.minute >= s.minuteStart && i.minute <= s.minuteEnd;
  if (!inWindow) reasons.push(`Minutul este în afara ferestrei ${s.minuteStart}–${s.minuteEnd}.`);
  if (confidence === 'Mică') reasons.push('Încrederea datelor este insuficientă.');
  if (won) reasons.push('Piață deja câștigată: nu se recomandă o intrare nouă.');
  if (rem === 0) reasons.push('Meciul a ajuns la minutul 90; modelul nu include prelungiri.');
  if (i.oppositeOdds && !binary) reasons.push('Cota opusă nu elimină marja la următorul gol: există și rezultatul fără gol.');
  const edgePass = edge >= s.minEdge - 1e-10, evPass = ev * 100 >= s.minEv - 1e-10;
  if (!edgePass) reasons.push(`Edge sub pragul de ${s.minEdge.toFixed(1)} pp.`);
  if (!evPass) reasons.push(`EV sub pragul de ${s.minEv.toFixed(1)}%.`);
  const edgeOdds = probability > s.minEdge / 100 ? 1 / (probability - s.minEdge / 100) : null;
  const minOdds = edgeOdds === null ? null : Math.max(edgeOdds, (1 + s.minEv / 100) / probability);
  const eligible = confidence !== 'Mică' && inWindow && !won && rem > 0 && !inconsistent;
  const verdict = eligible && edgePass && evPass ? 'PARIAZĂ' : eligible && minOdds !== null ? 'AȘTEAPTĂ' : 'PAS';
  if (verdict === 'PARIAZĂ') reasons.unshift('Probabilitatea estimată depășește pragul pieței; edge și EV îndeplinesc limitele configurate.');
  if (verdict === 'AȘTEAPTĂ') reasons.unshift(`Pariază doar dacă cota ≥ ${minOdds?.toFixed(2)}, în fereastra ${s.minuteStart}–${s.minuteEnd}. Reanalizează datele înainte de intrare.`);
  const stakeFraction = verdict === 'PARIAZĂ' ? clamp(s.kellyFraction * ev / (i.odds - 1), 0, s.stakeCap / 100) : 0;
  return { probability, rawProbability, breakEven, edge, ev, lambda, lambdaHome, lambdaAway, weight, xgHome, xgAway, minOdds,
    confidence, confidenceScore: score, verdict, testMode: settled < 300, won, stakeFraction,
    stake: i.bank ? i.bank * stakeFraction : 0, reasons };
}