import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, ArrowLeft, BarChart3, BookOpen, Download, Save, Settings2, ShieldAlert, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import { analyzeLive, defaultInput, defaultSettings, markets, validateSettings, type LiveInput, type LiveResult, type LiveSettings } from '@/lib/tipster-live/model';
import { exportJournal, loadJournal, loadSettings, outcomes, profit, saveLocal, summarize, type JournalEntry, type Outcome } from '@/lib/tipster-live/storage';
import { ChoiceField, FieldHint, NumericField } from '@/components/tipster-live/LiveFields';
import { LiveStats, Metric, pct } from '@/components/tipster-live/LiveStats';

const settingsLabels: Record<keyof LiveSettings, string> = {
  proxyTarget: 'xG / șut pe poartă', proxyShot: 'xG / șut în afara porții', proxyCorner: 'xG / corner', lateFactor: 'Factor după minutul 60',
  pressureLow: 'Factor presiune scăzută', pressureMedium: 'Factor presiune moderată', pressureHigh: 'Factor presiune ridicată',
  redTotal: 'Factor total / cartonaș roșu', redAdvantage: 'Factor echipă în superioritate', redDisadvantage: 'Factor echipă în inferioritate',
  minEdge: 'Edge minim (pp)', minEv: 'EV minim (%)', minuteStart: 'Minut de început', minuteEnd: 'Minut de sfârșit',
  kellyFraction: 'Fracție Kelly', stakeCap: 'Limită miză (% din bancă)', defaultHome: 'xG implicit gazde', defaultAway: 'xG implicit oaspeți',
};
const settingGroups: { title: string; keys: (keyof LiveSettings)[] }[] = [
  { title: 'Estimarea golurilor', keys: ['proxyTarget', 'proxyShot', 'proxyCorner', 'lateFactor', 'defaultHome', 'defaultAway'] },
  { title: 'Presiune și cartonașe', keys: ['pressureLow', 'pressureMedium', 'pressureHigh', 'redTotal', 'redAdvantage', 'redDisadvantage'] },
  { title: 'Praguri și miză', keys: ['minEdge', 'minEv', 'minuteStart', 'minuteEnd', 'kellyFraction', 'stakeCap'] },
];

export default function TipsterLive() {
  const { user } = useAuth();
  const userId = user?.id ?? '';
  const [input, setInput] = useState<LiveInput>({ ...defaultInput });
  const [settings, setSettings] = useState<LiveSettings>(() => loadSettings(userId));
  const [draftSettings, setDraftSettings] = useState(settings);
  const [entries, setEntries] = useState<JournalEntry[]>(() => loadJournal(userId));
  const [result, setResult] = useState<LiveResult | null>(null);
  const [saved, setSaved] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const stats = summarize(entries);
  useEffect(() => {
    const refresh = (e: StorageEvent) => { if (e.key?.includes(`tipster-live:v1:${userId}:`)) { setEntries(loadJournal(userId)); const next = loadSettings(userId); setSettings(next); setDraftSettings(next); setResult(null); } };
    window.addEventListener('storage', refresh);
    const previous = document.title; document.title = 'Tipster Premium Live — Analiză fotbal';
    return () => { window.removeEventListener('storage', refresh); document.title = previous; };
  }, [userId]);
  const update = <K extends keyof LiveInput>(key: K, value: LiveInput[K]) => { setInput(prev => ({ ...prev, [key]: value })); setResult(null); setSaved(false); setErrors([]); };
  const numeric = (key: keyof LiveInput, label: string, optional = false, max?: number, step = 'any', hint?: string) => <NumericField key={key} label={label} value={typeof input[key] === 'number' ? input[key] as number : null} optional={optional} max={max} step={step} hint={hint} onChange={v => update(key, (optional ? v : v ?? 0) as LiveInput[typeof key])} />;
  const persistEntries = (next: JournalEntry[]) => {
    try { saveLocal(userId, 'journal', next); setEntries(next); return true; }
    catch { toast({ title: 'Salvare imposibilă', description: 'Stocarea acestui browser este indisponibilă sau plină.', variant: 'destructive' }); return false; }
  };
  const analyze = () => { try { setResult(analyzeLive(input, settings, stats.settled)); setErrors([]); setSaved(false); } catch (e) { setErrors([e instanceof Error ? e.message : 'Verifică datele introduse.']); } };
  const save = () => {
    if (!result || saved) return;
    const entry: JournalEntry = { id: crypto.randomUUID(), date: new Date().toISOString(), input: { ...input }, result: { ...result }, outcome: 'pending', units: 1, correctData: true };
    if (persistEntries([entry, ...entries])) { setSaved(true); toast({ title: 'Observație salvată în jurnal' }); }
  };
  const editEntry = (id: string, change: Partial<JournalEntry>) => persistEntries(entries.map(e => e.id === id ? { ...e, ...change } : e));
  const exportCsv = () => { const url = URL.createObjectURL(new Blob([exportJournal(entries)], { type: 'text/csv;charset=utf-8;' })); const a = document.createElement('a'); a.href = url; a.download = 'tipster-premium-live-jurnal.csv'; a.click(); URL.revokeObjectURL(url); };
  const saveSettings = () => {
    const problems = validateSettings(draftSettings);
    if (problems.length) { toast({ title: 'Setări invalide', description: problems.join(' '), variant: 'destructive' }); return; }
    try { saveLocal(userId, 'settings', draftSettings); setSettings({ ...draftSettings }); setResult(null); toast({ title: 'Setări salvate' }); }
    catch { toast({ title: 'Nu s-au putut salva setările', variant: 'destructive' }); }
  };
  return <div className="min-h-screen bg-background text-foreground">
    <header className="border-b border-border"><div className="max-w-7xl mx-auto px-4 sm:px-8 py-6 flex flex-wrap items-center justify-between gap-4"><div className="flex items-center gap-3"><div className="bg-primary/10 text-primary p-3 rounded-md"><Activity className="size-6" /></div><div><h1 className="text-xl sm:text-2xl font-bold">Tipster Premium Live</h1><p className="text-xs text-muted-foreground mt-1">FOTBAL · ANALIZĂ ÎN TIMP REAL</p></div></div><Button variant="ghost" asChild><Link to="/"><ArrowLeft /> Înapoi la aplicație</Link></Button></div></header>
    <main className="max-w-7xl mx-auto px-4 sm:px-8 py-6">
      {stats.settled < 300 && <div className="mb-6 flex items-center gap-3 border-l-2 border-accent bg-accent/10 px-4 py-3 text-accent"><ShieldAlert className="size-5 shrink-0" /><div><p className="font-semibold text-sm">Model necalibrat – mod test</p><p className="text-xs mt-1">{stats.settled}/300 rezultate încheiate · fără bani reali</p></div></div>}
      <Tabs defaultValue="analysis" className="space-y-6"><TabsList className="grid grid-cols-4 w-full sm:w-auto sm:inline-flex h-auto bg-secondary"><TabsTrigger value="analysis" className="gap-2 py-3 text-xs sm:text-sm"><Activity className="size-4 hidden sm:block" />Analiză live</TabsTrigger><TabsTrigger value="journal" className="gap-2 py-3 text-xs sm:text-sm"><BookOpen className="size-4 hidden sm:block" />Jurnal</TabsTrigger><TabsTrigger value="stats" className="gap-2 py-3 text-xs sm:text-sm"><BarChart3 className="size-4 hidden sm:block" />Statistici</TabsTrigger><TabsTrigger value="settings" className="gap-2 py-3 text-xs sm:text-sm"><Settings2 className="size-4 hidden sm:block" />Setări</TabsTrigger></TabsList>
        <TabsContent value="analysis"><div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-8 lg:gap-12">
          <form onSubmit={e => { e.preventDefault(); analyze(); }} className="space-y-7">
            <section className="space-y-4"><h2 className="font-semibold border-b border-border pb-3">01 / Meci și scor</h2><div className="grid grid-cols-2 gap-4"><div className="col-span-2 space-y-2"><Label htmlFor="live-league" className="text-xs flex items-center gap-1">Ligă<FieldHint text="Numele competiției; folosit în jurnal și statistici." /></Label><Input id="live-league" value={input.league} onChange={e => update('league', e.target.value)} placeholder="Ex. SuperLiga România" /></div>{numeric('minute', 'Minut', false, 90, '1')}{numeric('bank', 'Banca totală (LEI)', true)}{numeric('homeGoals', 'Scor gazde', false, undefined, '1')}{numeric('awayGoals', 'Scor oaspeți', false, undefined, '1')}</div></section>
            <section className="space-y-4"><h2 className="font-semibold border-b border-border pb-3">02 / Date live</h2><div className="grid grid-cols-2 gap-4">{numeric('shotsHome', 'Șuturi gazde', false, undefined, '1')}{numeric('shotsAway', 'Șuturi oaspeți', false, undefined, '1')}{numeric('targetHome', 'Șuturi pe poartă gazde', false, undefined, '1')}{numeric('targetAway', 'Șuturi pe poartă oaspeți', false, undefined, '1')}{numeric('cornersHome', 'Cornere gazde', false, undefined, '1')}{numeric('cornersAway', 'Cornere oaspeți', false, undefined, '1')}</div>
              <div className="flex items-center justify-between gap-3"><Label htmlFor="live-xg" className="text-sm flex items-center gap-2">xG live<FieldHint text="Folosește valorile cumulate publicate pentru meci. Dacă lipsesc, modelul estimează xG din șuturi și cornere." /></Label><div className="flex items-center gap-2 text-xs text-muted-foreground"><span>{input.hasXg ? 'Disponibil' : 'Indisponibil'}</span><Switch id="live-xg" checked={input.hasXg} onCheckedChange={v => update('hasXg', v)} /></div></div>
              {input.hasXg && <div className="grid grid-cols-2 gap-4">{numeric('xgHome', 'xG live gazde', true)}{numeric('xgAway', 'xG live oaspeți', true)}</div>}
              <div className="grid grid-cols-2 gap-4">{numeric('preHome', 'Goluri așteptate pre-meci gazde', true, undefined, 'any', `Implicit ${settings.defaultHome} dacă lipsește; reduce încrederea datelor.`)}{numeric('preAway', 'Goluri așteptate pre-meci oaspeți', true, undefined, 'any', `Implicit ${settings.defaultAway} dacă lipsește; reduce încrederea datelor.`)}</div>
            </section>
            <section className="space-y-4"><h2 className="font-semibold border-b border-border pb-3">03 / Context și piață</h2><div className="grid sm:grid-cols-2 gap-4"><ChoiceField label="Presiune ofensivă" value={input.pressure} options={{ low: 'Scăzută', medium: 'Moderată', high: 'Ridicată' }} onChange={v => update('pressure', v as LiveInput['pressure'])} hint="Presiunea ridicată mărește estimarea doar dacă este confirmată." /><ChoiceField label="Cartonașe roșii" value={input.reds} options={{ none: 'Niciuna', home: 'Gazde', away: 'Oaspeți', both: 'Ambele' }} onChange={v => update('reds', v as LiveInput['reds'])} hint="Indică echipa aflată în inferioritate numerică." /></div><div className="flex items-center gap-2"><Checkbox id="live-confirmed" checked={input.confirmed} onCheckedChange={v => update('confirmed', v === true)} /><Label htmlFor="live-confirmed" className="text-xs leading-relaxed">Presiune confirmată în minim 2 actualizări</Label><FieldHint text="Bifează numai după ce presiunea a fost observată în cel puțin două actualizări succesive." /></div><ChoiceField label="Piața" value={input.market} options={markets} onChange={v => update('market', v as LiveInput['market'])} hint="Piețele în restul meciului ignoră golurile deja marcate. Peste 2.5 în tot meciul le include." /><div className="grid grid-cols-2 gap-4">{numeric('odds', 'Cota disponibilă acum', false, undefined, 'any', 'Cotă zecimală mai mare decât 1.')}{numeric('oppositeOdds', 'Cota opusă', true, undefined, 'any', 'Doar complementul binar al pieței, de exemplu Under. Nu elimină marja pentru următorul gol.')}</div></section>
            {errors.length > 0 && <div role="alert" className="text-destructive text-sm border border-destructive/30 p-3 rounded-md">{errors.join(' ')}</div>}
            <Button type="submit" size="lg" className="w-full"><Activity />Analizează</Button>
          </form>
          <aside className="min-w-0"><div className="lg:sticky lg:top-6 rounded-lg border border-border bg-card p-5 sm:p-6">
            {result ? <div className="space-y-6"><div><p className="text-xs uppercase text-muted-foreground mb-3">Verdict final</p><h2 className={`text-2xl font-bold ${result.verdict === 'PARIAZĂ' ? 'text-primary' : result.verdict === 'AȘTEAPTĂ' ? 'text-accent' : 'text-destructive'}`}>{result.verdict}</h2>{result.verdict === 'PARIAZĂ' && result.testMode && <p className="text-accent text-sm font-semibold mt-2">TEST – fără bani reali</p>}<p className="text-sm mt-3">{markets[input.market]}</p>{result.won && <p className="text-accent text-sm mt-2">Piață deja câștigată · probabilitate matematică 100%</p>}</div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-5 border-y border-border py-5"><Metric label="Probabilitate estimată" value={pct(result.probability * 100)} /><Metric label="Cota actuală" value={input.odds.toFixed(2)} /><Metric label="Prag de rentabilitate" value={pct(result.breakEven * 100)} /><Metric label="Edge" value={`${result.edge.toFixed(1)} pp`} /><Metric label="Valoare așteptată (EV)" value={pct(result.ev * 100)} /><Metric label="Goluri așteptate rămase (λ)" value={result.lambda.toFixed(2)} /><Metric label="Cota minimă acceptabilă" value={result.minOdds ? (Math.ceil(result.minOdds * 100) / 100).toFixed(2) : 'n/a'} /><Metric label="Fereastra de minute" value={`${settings.minuteStart}–${settings.minuteEnd}`} /><Metric label="Încredere date" value={result.confidence} /><Metric label={result.testMode ? 'Miză simulată' : 'Miză sugerată'} value={result.verdict === 'PARIAZĂ' && input.bank ? `${result.stake.toFixed(2)} LEI` : '—'} /></dl>
              <div><h3 className="text-sm font-semibold mb-3">Raționamentul analizei</h3><ul className="space-y-2 text-xs leading-relaxed text-muted-foreground">{result.reasons.map(reason => <li key={reason}>• {reason}</li>)}</ul></div>
              <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">Detalii model</summary><p className="mt-3 leading-relaxed">xG gazde {result.xgHome.toFixed(2)} · oaspeți {result.xgAway.toFixed(2)}<br />Pondere live {pct(result.weight * 100)}<br />λ gazde {result.lambdaHome.toFixed(2)} · oaspeți {result.lambdaAway.toFixed(2)}<br />Probabilitatea afișată și folosită în verdict este limitată la 90%. Prelungirile nu sunt incluse.</p></details>
              <Button className="w-full" variant="outline" onClick={save} disabled={saved}><Save />{saved ? 'Salvat în jurnal' : 'Salvează în jurnal'}</Button>
            </div> : <div className="py-12 text-center"><Activity className="size-10 text-primary mx-auto mb-5" /><h2 className="text-lg font-semibold">Verdict live</h2><p className="text-sm text-muted-foreground mt-2">Nicio analiză efectuată.</p><dl className="grid grid-cols-2 gap-6 border-t border-border pt-6 mt-8 text-left"><Metric label="Fereastra activă" value={`${settings.minuteStart}–${settings.minuteEnd} min`} /><Metric label="Edge minim" value={`${settings.minEdge.toFixed(1)} pp`} /></dl></div>}
          </div></aside>
        </div></TabsContent>
        <TabsContent value="journal"><div className="flex justify-between gap-3 items-center mb-5"><h2 className="text-lg font-semibold">Jurnal <span className="text-muted-foreground">({entries.length})</span></h2><Button variant="outline" onClick={exportCsv} disabled={!entries.length}><Download />Export CSV</Button></div>{entries.length ? <div className="overflow-x-auto"><table className="w-full text-xs text-left whitespace-nowrap"><thead className="text-muted-foreground border-b border-border"><tr>{['Dată / Ligă', 'Minut / Scor', 'Piață', 'Cotă / Prob.', 'Verdict', 'Rezultat', 'Miză (u)', 'Profit (u)', 'Date corecte?', ''].map((h, n) => <th className="p-3" key={n}>{h}</th>)}</tr></thead><tbody>{entries.map(e => <tr key={e.id} className="border-b border-border"><td className="p-3">{new Date(e.date).toLocaleString('ro-RO')}<div className="text-muted-foreground mt-1">{e.input.league}</div></td><td className="p-3">{e.input.minute}′ · {e.input.homeGoals}–{e.input.awayGoals}</td><td className="p-3 max-w-44 whitespace-normal">{markets[e.input.market]}</td><td className="p-3 font-mono">{e.input.odds.toFixed(2)} / {pct(e.result.probability * 100)}</td><td className="p-3">{e.result.verdict}{e.result.testMode && <div className="text-accent mt-1">TEST</div>}</td><td className="p-3 min-w-40"><ChoiceField label={`Rezultat ${e.input.league} ${e.input.minute}′`} value={e.outcome} options={outcomes} onChange={v => editEntry(e.id, { outcome: v as Outcome })} /></td><td className="p-3"><Input type="number" aria-label={`Miză ${e.id}`} min="0" step="0.1" className="w-20" value={e.units} onChange={ev => { const units = Number(ev.target.value); if (Number.isFinite(units) && units >= 0) editEntry(e.id, { units }); }} /></td><td className={`p-3 font-mono ${profit(e) >= 0 ? 'text-primary' : 'text-destructive'}`}>{profit(e).toFixed(2)}</td><td className="p-3"><ChoiceField label={`Date corecte ${e.input.league} ${e.input.minute}′`} value={e.correctData ? 'yes' : 'no'} options={{ yes: 'Da', no: 'Nu' }} onChange={v => editEntry(e.id, { correctData: v === 'yes' })} /></td><td className="p-3"><Button variant="ghost" size="icon" title="Șterge observația" aria-label="Șterge observația" onClick={() => { if (window.confirm('Ștergi această observație din jurnal?')) persistEntries(entries.filter(row => row.id !== e.id)); }}><Trash2 /></Button></td></tr>)}</tbody></table></div> : <div className="py-20 text-center border-y border-border"><BookOpen className="size-8 mx-auto text-muted-foreground mb-4" /><p>Jurnalul este gol.</p></div>}</TabsContent>
        <TabsContent value="stats"><LiveStats entries={entries} /></TabsContent>
        <TabsContent value="settings"><div className="max-w-3xl space-y-8">{settingGroups.map(group => <section key={group.title}><h2 className="font-semibold border-b border-border pb-3 mb-4">{group.title}</h2><div className="grid sm:grid-cols-2 gap-4">{group.keys.map(key => <NumericField key={key} label={settingsLabels[key]} value={draftSettings[key]} hint={`Constantă a modelului. Valoare implicită: ${defaultSettings[key]}.`} onChange={value => setDraftSettings(prev => ({ ...prev, [key]: value ?? 0 }))} />)}</div></section>)}<div className="flex flex-wrap gap-3"><Button onClick={saveSettings}><Save />Salvează setările</Button><Button variant="outline" onClick={() => setDraftSettings({ ...defaultSettings })}>Restabilește valorile implicite</Button></div></div></TabsContent>
      </Tabs>
    </main><footer className="border-t border-border mt-10 p-5 text-center text-xs text-muted-foreground">Instrument de estimare, nu garanție de profit. Pariurile implică risc. Joacă responsabil, 18+.</footer>
  </div>;
}