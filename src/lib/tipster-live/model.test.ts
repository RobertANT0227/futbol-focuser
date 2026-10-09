import { describe, expect, it } from 'vitest';
import { analyzeLive, defaultInput, defaultSettings, poissonAtLeast, validateInput, validateSettings } from './model';
import { exportJournal, summarize, type JournalEntry } from './storage';
const input = { ...defaultInput, league: 'Test', minute: 45, hasXg: true, xgHome: .8, xgAway: .6, preHome: 1.35, preAway: 1.15, confirmed: true, odds: 2.5, bank: 1000 };
describe('Poisson live', () => {
  it('matches closed forms and handles zero', () => {
    expect(poissonAtLeast(1.5, 1)).toBeCloseTo(1 - Math.exp(-1.5), 12);
    expect(poissonAtLeast(1.5, 2)).toBeCloseTo(1 - Math.exp(-1.5) * 2.5, 12);
    expect(poissonAtLeast(0, 1)).toBe(0);
    expect(poissonAtLeast(0, 0)).toBe(1);
  });
  it('implements the specified blend', () => {
    const r = analyzeLive(input);
    expect(r.lambda).toBeCloseTo(.4 * 1.25 + .6 * 1.4);
    expect(r.lambdaHome + r.lambdaAway).toBeCloseTo(r.lambda);
    expect(r.verdict).toBe('PARIAZĂ'); expect(r.testMode).toBe(true);
    expect(r.stake).toBeLessThanOrEqual(20);
    expect(analyzeLive(input, defaultSettings, 300).testMode).toBe(false);
  });
  it('normalizes red card team shares', () => {
    const normal = analyzeLive({ ...input, market: 'nextHome' });
    const red = analyzeLive({ ...input, market: 'nextHome', reds: 'home' });
    expect(red.lambdaHome / red.lambda).toBeLessThan(normal.lambdaHome / normal.lambda);
    const away = analyzeLive({ ...input, market: 'nextAway' });
    expect(normal.rawProbability + away.rawProbability).toBeCloseTo(poissonAtLeast(normal.lambda, 1));
  });
  it('removes binary vig but not incomplete next-goal odds', () => {
    expect(analyzeLive({ ...input, odds: 2, oppositeOdds: 2 }).breakEven).toBe(.5);
    expect(analyzeLive({ ...input, odds: 2, oppositeOdds: 3, market: 'nextHome' }).breakEven).toBe(.5);
  });
  it('never recommends won markets or minute 90', () => {
    expect(analyzeLive({ ...input, market: 'over25', homeGoals: 3 }).verdict).toBe('PAS');
    const end = analyzeLive({ ...input, minute: 90 });
    expect(end.lambda).toBe(0); expect(end.probability).toBe(0); expect(end.verdict).toBe('PAS');
  });
  it('waits for better odds, rejects low confidence and inconsistent data', () => {
    expect(analyzeLive({ ...input, odds: 1.1 }).verdict).toBe('AȘTEAPTĂ');
    expect(analyzeLive({ ...input, hasXg: false, preHome: null, preAway: null }).verdict).toBe('PAS');
    expect(analyzeLive({ ...input, shotsHome: 1, targetHome: 2 }).verdict).toBe('PAS');
  });
  it('does not amplify unconfirmed high pressure', () => {
    expect(analyzeLive({ ...input, pressure: 'high', confirmed: false }).lambda).toBe(analyzeLive({ ...input, pressure: 'medium', confirmed: false }).lambda);
  });
  it('handles zero xG, caps probability, validates inputs/settings', () => {
    const r = analyzeLive({ ...input, xgHome: 0, xgAway: 0 });
    expect(Number.isFinite(r.lambdaHome)).toBe(true);
    expect(analyzeLive({ ...input, xgHome: 20 }).probability).toBeLessThanOrEqual(.9);
    expect(validateInput({ ...input, odds: 1 }).length).toBeGreaterThan(0);
    expect(validateSettings({ ...defaultSettings, minuteStart: 80, minuteEnd: 20 }).length).toBeGreaterThan(0);
  });
});
describe('Journal math', () => {
  const base: JournalEntry = { id: '1', date: '2026-10-09', input, result: analyzeLive(input), outcome: 'won', units: 1, correctData: true };
  it('excludes pending, void and unplaced from ROI and settlement counts', () => {
    const s = summarize([base, { ...base, outcome: 'lost' }, { ...base, outcome: 'void' }, { ...base, outcome: 'unplaced' }]);
    expect(s.settled).toBe(2); expect(s.winRate).toBe(50); expect(s.profit).toBe(.5); expect(s.roi).toBe(25);
  });
  it('quotes and protects CSV cells', () => {
    expect(exportJournal([{ ...base, input: { ...input, league: '=DANGER' } }])).toContain("'=DANGER");
  });
});