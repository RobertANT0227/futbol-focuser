// CENTO-V2
import type { PickGrade, QualityBand } from './types';

export function gradeO25(p: number, conf: number): { grade: PickGrade; side: 'OVER' | 'UNDER' | null } {
  // OVER 2.5
  if (p >= 0.62 && conf >= 72) return { grade: 'STRONG', side: 'OVER' };
  if (p >= 0.55 && conf >= 58) return { grade: 'MEDIUM', side: 'OVER' };
  if (p >= 0.50 && conf >= 50) return { grade: 'RISKY', side: 'OVER' };
  // UNDER 2.5
  if (p <= 0.30 && conf >= 72) return { grade: 'STRONG', side: 'UNDER' };
  if (p <= 0.36 && conf >= 58) return { grade: 'MEDIUM', side: 'UNDER' };
  return { grade: 'PASS', side: null };
}

export function stakeFor(grade: PickGrade, conf: number, quality: QualityBand): 0 | 0.5 | 1 | 2 | 3 {
  if (grade === 'PASS') return 0;
  if (grade === 'RISKY') return 0.5;
  if (grade === 'MEDIUM') return 1;
  if (conf >= 80 && quality === 'Excellent') return 3;
  return 2;
}