import { defaultSettings, validateSettings, type LiveInput, type LiveResult, type LiveSettings } from './model';
export type Outcome = 'pending' | 'won' | 'lost' | 'void' | 'unplaced';
export const outcomes: Record<Outcome, string> = { pending: 'În așteptare', won: 'Câștigat', lost: 'Pierdut', void: 'Anulat', unplaced: 'Neplasat' };
export interface JournalEntry {
  id: string; date: string; input: LiveInput; result: LiveResult;
  outcome: Outcome; units: number; correctData: boolean;
}
const key = (userId: string, section: string) => `tipster-live:v1:${userId}:${section}`;
export function loadJournal(userId: string): JournalEntry[] {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(key(userId, 'journal')) ?? '[]');
    if (!Array.isArray(data)) return [];
    return data.filter((e): e is JournalEntry => typeof e === 'object' && e !== null && typeof e.id === 'string' && typeof e.date === 'string' && !!e.input && !!e.result && e.outcome in outcomes && Number.isFinite(e.units) && typeof e.correctData === 'boolean');
  } catch { return []; }
}
export function loadSettings(userId: string): LiveSettings {
  try {
    const data = { ...defaultSettings, ...JSON.parse(localStorage.getItem(key(userId, 'settings')) ?? '{}') };
    return validateSettings(data).length ? { ...defaultSettings } : data;
  } catch { return { ...defaultSettings }; }
}
export function saveLocal(userId: string, section: 'journal' | 'settings', value: JournalEntry[] | LiveSettings) {
  localStorage.setItem(key(userId, section), JSON.stringify(value));
}
export function isSettled(e: JournalEntry) { return e.outcome === 'won' || e.outcome === 'lost'; }
export function profit(e: JournalEntry): number { return e.outcome === 'won' ? e.units * (e.input.odds - 1) : e.outcome === 'lost' ? -e.units : 0; }
export function summarize(entries: JournalEntry[]) {
  const settled = entries.filter(isSettled);
  const stake = settled.reduce((sum, e) => sum + e.units, 0);
  const net = settled.reduce((sum, e) => sum + profit(e), 0);
  return { total: entries.length, settled: settled.length, wins: settled.filter(e => e.outcome === 'won').length,
    winRate: settled.length ? settled.filter(e => e.outcome === 'won').length / settled.length * 100 : 0,
    roi: stake ? net / stake * 100 : 0, profit: net,
    avgEdge: entries.length ? entries.reduce((sum, e) => sum + e.result.edge, 0) / entries.length : 0 };
}
export function exportJournal(entries: JournalEntry[]) {
  const header = ['Dată', 'Ligă', 'Minut', 'Scor', 'Piață', 'Cotă', 'Probabilitate %', 'Verdict', 'Mod test', 'Rezultat', 'Miză u', 'Profit u', 'Date live corecte'];
  const rows = entries.map(e => [e.date, e.input.league, e.input.minute, `${e.input.homeGoals}-${e.input.awayGoals}`, e.input.market,
    e.input.odds, (e.result.probability * 100).toFixed(1), e.result.verdict, e.result.testMode ? 'Da' : 'Nu', outcomes[e.outcome], e.units, profit(e).toFixed(2), e.correctData ? 'Da' : 'Nu']);
  const cell = (v: unknown) => `"${String(v).replace(/^[=+\-@\t\r]/, "'$&").replace(/"/g, '""')}"`;
  return '\uFEFF' + [header, ...rows].map(row => row.map(cell).join(';')).join('\r\n');
}