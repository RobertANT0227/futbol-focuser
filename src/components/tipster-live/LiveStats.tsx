import { isSettled, summarize, type JournalEntry } from '@/lib/tipster-live/storage';
import { markets } from '@/lib/tipster-live/model';

export const pct = (n: number) => `${n.toFixed(1)}%`;
export function Metric({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><dt className="text-xs text-muted-foreground mb-1.5">{label}</dt><dd className="text-lg font-mono font-semibold break-words">{value}</dd></div>;
}
export function LiveStats({ entries }: { entries: JournalEntry[] }) {
  const s = summarize(entries);
  const settled = entries.filter(isSettled);
  const leagues = [...new Set(entries.map(e => e.input.league))];
  const groups = leagues.map(name => ({ name, entries: entries.filter(e => e.input.league === name) }));
  const intervals = [[0, 30], [30, 60], [60, 91]].map(([lo, hi]) => ({ name: `${lo}–${Math.min(90, hi)} minute`, entries: entries.filter(e => e.input.minute >= lo && e.input.minute < hi) }));
  return <div className="space-y-8">
    {s.settled < 300 && <p role="status" className="border-l-2 border-accent bg-accent/10 p-4 text-accent text-sm">Seria este prea scurtă pentru concluzii · {s.settled}/300 rezultate Câștigat/Pierdut.</p>}
    <dl className="grid grid-cols-2 lg:grid-cols-6 gap-6 border-b border-border pb-6"><Metric label="Observații" value={String(s.total)} /><Metric label="Rată de câștig" value={s.settled ? pct(s.winRate) : '—'} /><Metric label="ROI" value={s.settled ? pct(s.roi) : '—'} /><Metric label="Profit" value={`${s.profit.toFixed(2)} u`} /><Metric label="Edge mediu" value={`${s.avgEdge.toFixed(1)} pp`} /><Metric label="Rezultate încheiate" value={String(s.settled)} /></dl>
    <section><h2 className="font-semibold mb-4">Calibrare probabilități</h2><div className="overflow-x-auto"><table className="w-full text-sm text-left"><thead className="text-muted-foreground border-b border-border"><tr><th className="p-3">Probabilitate estimată</th><th className="p-3">Observații</th><th className="p-3">Medie estimată</th><th className="p-3">Rată reală de câștig</th></tr></thead><tbody>{[[0, .5], [.5, .6], [.6, .7], [.7, .8], [.8, .9], [.9, 1.01]].map(([lo, hi]) => {
      const bucket = settled.filter(e => e.result.probability >= lo && e.result.probability < hi);
      return <tr key={lo} className="border-b border-border"><td className="p-3">{lo === 0 ? '< 50%' : lo === .9 ? '90%' : `${(lo * 100).toFixed(0)}–${(hi * 100).toFixed(0)}%`}</td><td className="p-3">{bucket.length}</td><td className="p-3">{bucket.length ? pct(bucket.reduce((sum, e) => sum + e.result.probability * 100, 0) / bucket.length) : '—'}</td><td className="p-3">{bucket.length ? pct(summarize(bucket).winRate) : '—'}</td></tr>;
    })}</tbody></table></div></section>
    {[{ title: 'Performanță per ligă', rows: groups }, { title: 'Performanță per minut', rows: intervals }].map(group => <section key={group.title}><h2 className="font-semibold mb-3">{group.title}</h2>{group.rows.length ? <div className="overflow-x-auto"><table className="w-full text-sm text-left"><thead className="border-b border-border text-muted-foreground"><tr><th className="p-3">Grup</th><th className="p-3">Încheiate</th><th className="p-3">Câștig</th><th className="p-3">ROI</th><th className="p-3">Profit</th></tr></thead><tbody>{group.rows.map(row => { const stats = summarize(row.entries); return <tr key={row.name} className="border-b border-border"><td className="p-3">{row.name}</td><td className="p-3">{stats.settled}</td><td className="p-3">{stats.settled ? pct(stats.winRate) : '—'}</td><td className="p-3">{stats.settled ? pct(stats.roi) : '—'}</td><td className="p-3">{stats.profit.toFixed(2)} u</td></tr>; })}</tbody></table></div> : <p className="text-muted-foreground text-sm">Nu există observații.</p>}</section>)}
    {entries.some(e => !e.correctData) && <p className="text-sm text-accent">{entries.filter(e => !e.correctData).length} observații au date live marcate incorecte; sunt incluse în rezultate.</p>}
    <p className="text-xs text-muted-foreground">Piețe urmărite: {Object.values(markets).join(' · ')}</p>
  </div>;
}