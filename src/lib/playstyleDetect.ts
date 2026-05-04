import type { TeamStats } from './types';

export type PlayStyle = 'possession' | 'pressing' | 'counter' | 'low-block' | 'bus-parking' | 'high-press';
export type Confidence = 'LOW' | 'MEDIUM' | 'HIGH';

export interface PlaystyleDetection {
  style: PlayStyle;
  confidence: Confidence;
  reasons: string[];
  label: string;
}

const LABELS: Record<PlayStyle, string> = {
  'possession': '🎯 POSSESSION',
  'pressing': '🔥 PRESSING',
  'counter': '⚡ COUNTER ATTACK',
  'low-block': '🛡️ LOW BLOCK',
  'bus-parking': '🚌 BUS PARKING',
  'high-press': '🔥 HIGH PRESS',
};

/**
 * Auto-detect playstyle following the simplified model:
 * - Possession primary rule (>=55, 50-55, 45-50, <45)
 * - Override BUS PARKING when possession < 43
 * - Override HIGH PRESS when possession 50-58 + 2/3 of (DA>=55, shots>=13)
 */
export function detectPlaystyle(team: TeamStats): PlaystyleDetection {
  const possession = team.possession || 50;
  const dangerousAttacks = team.dangerousAttacks || 0;
  const shots = team.shots || 0;
  const reasons: string[] = [];

  // 1) BUS PARKING override (strongest signal)
  if (possession < 43) {
    reasons.push(`Posesie = ${possession}% < 43% → ultra defensiv ✔`);
    return {
      style: 'bus-parking',
      confidence: 'HIGH',
      reasons,
      label: LABELS['bus-parking'],
    };
  }

  // 2) HIGH PRESS override (2/3 conditions)
  const hpPossession = possession >= 50 && possession <= 58;
  const hpDA = dangerousAttacks >= 55;
  const hpShots = shots >= 13;
  const hpScore = [hpPossession, hpDA, hpShots].filter(Boolean).length;
  if (hpScore >= 2 && hpPossession) {
    reasons.push(`Posesie = ${possession}% în 50-58% ${hpPossession ? '✔' : '✖'}`);
    reasons.push(`Atacuri periculoase = ${dangerousAttacks} ${hpDA ? '✔ (≥55)' : '✖ (<55)'}`);
    reasons.push(`Șuturi = ${shots} ${hpShots ? '✔ (≥13)' : '✖ (<13)'}`);
    return {
      style: 'high-press',
      confidence: hpScore === 3 ? 'HIGH' : 'MEDIUM',
      reasons,
      label: LABELS['high-press'],
    };
  }

  // 3) Base playstyles by possession
  let style: PlayStyle;
  if (possession >= 55) {
    style = 'possession';
    reasons.push(`Posesie = ${possession}% ≥ 55% → control prin posesie ✔`);
  } else if (possession >= 50) {
    style = 'pressing';
    reasons.push(`Posesie = ${possession}% în 50-55% → pressing ✔`);
  } else if (possession >= 45) {
    style = 'counter';
    reasons.push(`Posesie = ${possession}% în 45-50% → contraatac ✔`);
  } else {
    style = 'low-block';
    reasons.push(`Posesie = ${possession}% < 45% → low block ✔`);
  }

  // Confirmations
  let confirmations = 0;
  if (style === 'possession' && shots >= 11) { reasons.push(`Șuturi = ${shots} confirmă ✔`); confirmations++; }
  if (style === 'pressing' && dangerousAttacks >= 45) { reasons.push(`DA = ${dangerousAttacks} confirmă pressing ✔`); confirmations++; }
  if (style === 'counter' && shots <= 10) { reasons.push(`Șuturi = ${shots} confirmă counter ✔`); confirmations++; }
  if (style === 'low-block' && shots <= 9) { reasons.push(`Șuturi = ${shots} confirmă low block ✔`); confirmations++; }

  let confidence: Confidence = 'MEDIUM';
  if (!possession || !shots) confidence = 'LOW';
  else if (confirmations >= 1) confidence = 'HIGH';

  return { style, confidence, reasons, label: LABELS[style] };
}
