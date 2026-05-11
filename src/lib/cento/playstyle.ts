import type { CpTeamStats } from './types';

export type PrimaryStyle =
  | 'possession' | 'pressing' | 'counter' | 'low-block' | 'bus-parking' | 'high-press';

export interface PlaystyleResult {
  primary: PrimaryStyle;
  tags: string[];
}

const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

export function detectPlaystyle(s: CpTeamStats): PlaystyleResult {
  const poss = num(s.possession, 50);
  const da = num(s.dangerous_attacks, 40);
  const shots = num(s.shots, 11);
  const sot = num(s.shots_on_target, 4);
  const corners = num(s.corners, 5);
  const cards = num(s.cards, 2);
  const xg = num(s.xg, 1.3);
  const gf = num(s.goals_scored, 1.3);
  const gh1 = num(s.goals_first_half, 0.6);
  const gh2 = num(s.goals_second_half, 0.7);

  let primary: PrimaryStyle = 'pressing';
  if (poss < 43) primary = 'bus-parking';
  else if (poss < 45) primary = 'low-block';
  else if (poss < 50) primary = 'counter';
  else if (poss <= 58 && da >= 55 && shots >= 13 && shots <= 16) primary = 'high-press';
  else if (poss <= 55) primary = 'pressing';
  else primary = 'possession';

  const tags: string[] = [];
  if (shots >= 14 && poss < 50) tags.push('direct');
  if (da >= 60 && poss < 55) tags.push('transition-heavy');
  if (corners >= 6) tags.push('wide-attacking');
  if (num(s.goals_conceded, 1.1) >= 1.4 && da >= 55) tags.push('def-transition-weak');
  if (xg > gf + 0.25) tags.push('high-xg-low-conv');
  if (gf > xg + 0.2) tags.push('low-xg-high-eff');
  if (corners >= 6.5 && sot >= 4.5) tags.push('set-piece');
  if (cards >= 2.5) tags.push('card-aggressive');
  if (corners >= 6.5) tags.push('corner-heavy');
  if (gh2 > gh1 * 1.2) tags.push('second-half');
  if (gh1 > gh2 * 1.2) tags.push('fast-starter');
  if (gh2 > 0.9) tags.push('late-goal');

  return { primary, tags };
}

export function styleClash(a: PrimaryStyle, b: PrimaryStyle): boolean {
  const opp: Record<PrimaryStyle, PrimaryStyle[]> = {
    'possession': ['counter', 'low-block', 'bus-parking'],
    'pressing': ['bus-parking', 'low-block'],
    'counter': ['possession'],
    'low-block': ['possession', 'high-press'],
    'bus-parking': ['possession', 'pressing', 'high-press'],
    'high-press': ['low-block', 'bus-parking'],
  };
  return opp[a]?.includes(b) || opp[b]?.includes(a);
}

export const STYLE_LABEL: Record<PrimaryStyle, string> = {
  'possession': 'Possession',
  'pressing': 'Pressing',
  'counter': 'Counter',
  'low-block': 'Low Block',
  'bus-parking': 'Bus Parking',
  'high-press': 'High Press',
};