import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Sparkles } from 'lucide-react';
import type { MatchData, TeamStats } from '@/lib/types';
import { defaultMatch } from '@/components/MatchInputForm';
import type { ParsedTeamStats, FormToken } from '@/lib/deepmatch/parser';
import { computeRatings, generateInsights, predictionScore } from '@/lib/deepmatch/ratings';
import { SynthesisPanel, InsightsList } from './SynthesisPanel';
import { toast } from '@/hooks/use-toast';

interface Props {
  match: MatchData;
  onChange: (match: MatchData) => void;
}

interface Context {
  league: string;
  country: string;
  season: string;
  round: string;
  date: string;
  time: string;
  stadium: string;
  referee: string;
  weather: string;
  importance: 'normal' | 'derby' | 'european' | 'cup';
  competitionContext: string;
}

interface CornerLineState {
  line: number;
  over: number;
  under: number;
}

interface DMState {
  ctx: Context;
  homeStats: ParsedTeamStats;
  awayStats: ParsedTeamStats;
  homePlaystyle: PlayStyle;
  awayPlaystyle: PlayStyle;
  odds: {
    home: number; draw: number; away: number;
    over25: number; under25: number;
    bttsYes: number; bttsNo: number;
  };
  corners: CornerLineState[];
}

const STORAGE_KEY = 'deepmatch-intelligence-state-v2';

const defaultCtx: Context = {
  league: '', country: '', season: '', round: '', date: '', time: '',
  stadium: '', referee: '', weather: '', importance: 'normal', competitionContext: '',
};

function defaultState(): DMState {
  return {
    ctx: defaultCtx,
    homeStats: {},
    awayStats: {},
    homePlaystyle: 'possession',
    awayPlaystyle: 'possession',
    odds: { home: 2.0, draw: 3.3, away: 3.5, over25: 1.85, under25: 2.0, bttsYes: 1.8, bttsNo: 2.0 },
    corners: [
      { line: 10.5, over: 1.85, under: 2.0 },
      { line: 11.5, over: 2.10, under: 1.75 },
      { line: 12.5, over: 2.40, under: 1.55 },
    ],
  };
}

function loadState(): DMState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...defaultState(), ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return defaultState();
}

const FORM_TOKENS: FormToken[] = ['W', 'D', 'L'];
const PLAY_STYLES = ['possession', 'counter', 'pressing', 'low-block', 'bus-parking', 'high-press'] as const;
type PlayStyle = typeof PLAY_STYLES[number];

type Field = { key: keyof ParsedTeamStats; label: string; step?: string };

/** Sinteză = totaluri din coloana „Sinteză" (overall stats). xG = xGA (xG Împotriva) per cerere user. */
const SYNTH_FIELDS: Field[] = [
  { key: 'matchesPlayed', label: 'Meciuri jucate (MJ)', step: '1' },
  { key: 'goalsScored', label: 'Goluri marcate / meci' },
  { key: 'goalsConceded', label: 'Goluri primite / meci' },
  { key: 'xG', label: 'xG Sinteză (Împotriva)' },
  { key: 'shots', label: 'Șuturi / meci' },
  { key: 'shotsOnTarget', label: 'Șuturi pe poartă / meci' },
  { key: 'possession', label: 'Posesie %' },
  { key: 'dangerousAttacks', label: 'Atacuri periculoase / meci' },
  { key: 'gkSaves', label: 'Salvări portar / meci' },
  { key: 'cardsPerMatch', label: 'Cartonașe / meci' },
  { key: 'fouls', label: 'Faulturi / meci' },
  { key: 'cornersPerMatch', label: 'Cornere / meci' },
];

const HOME_FIELDS: Field[] = [
  { key: 'goalsScoredHome', label: 'Goluri marcate acasă' },
  { key: 'goalsConcededHome', label: 'Goluri primite acasă' },
  { key: 'shotsOnTargetHome', label: 'Șuturi pe poartă acasă' },
  { key: 'cornersPerMatchHome', label: 'Cornere acasă' },
];

const AWAY_FIELDS: Field[] = [
  { key: 'goalsScoredAway', label: 'Goluri marcate deplasare' },
  { key: 'goalsConcededAway', label: 'Goluri primite deplasare' },
  { key: 'shotsOnTargetAway', label: 'Șuturi pe poartă deplasare' },
  { key: 'cornersPerMatchAway', label: 'Cornere deplasare' },
];

function FormPills({ form, onChange }: { form: FormToken[]; onChange: (f: FormToken[]) => void }) {
  const padded: FormToken[] = [...form];
  while (padded.length < 5) padded.push('D');
  return (
    <div className="flex gap-1">
      {padded.slice(0, 5).map((f, i) => (
        <button
          key={i}
          type="button"
          onClick={() => {
            const next = [...padded];
            const cur = next[i];
            const idx = FORM_TOKENS.indexOf(cur);
            next[i] = FORM_TOKENS[(idx + 1) % FORM_TOKENS.length];
            onChange(next.slice(0, 5));
          }}
          className={`w-8 h-8 rounded-md text-xs font-mono font-bold transition-colors ${
            f === 'W' ? 'bg-primary/30 text-primary border border-primary/50' :
            f === 'L' ? 'bg-destructive/30 text-destructive border border-destructive/50' :
            'bg-accent/30 text-accent border border-accent/50'
          }`}
        >{f}</button>
      ))}
    </div>
  );
}

function FieldGrid({
  fields, stats, update,
}: {
  fields: Field[];
  stats: ParsedTeamStats;
  update: <K extends keyof ParsedTeamStats>(key: K, v: ParsedTeamStats[K]) => void;
}) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
      {fields.map((f) => (
        <div key={f.key}>
          <Label className="text-[10px] text-muted-foreground">{f.label}</Label>
          <Input
            type="number"
            step={f.step ?? '0.01'}
            value={(stats[f.key] as number | undefined) ?? ''}
            onChange={(e) =>
              update(f.key, e.target.value === '' ? undefined : (+e.target.value as never))
            }
            className="bg-secondary border-border h-8 text-xs"
            placeholder="—"
          />
        </div>
      ))}
    </div>
  );
}

function TeamBlock({
  title, icon, side, stats, setStats, playstyle, setPlaystyle,
}: {
  title: string; icon: string; side: 'home' | 'away';
  stats: ParsedTeamStats; setStats: (s: ParsedTeamStats) => void;
  playstyle: PlayStyle; setPlaystyle: (p: PlayStyle) => void;
}) {
  const update = <K extends keyof ParsedTeamStats>(key: K, v: ParsedTeamStats[K]) =>
    setStats({ ...stats, [key]: v });

  const splitFields = side === 'home' ? HOME_FIELDS : AWAY_FIELDS;
  const splitLabel = side === 'home' ? 'Acasă' : 'Deplasare';
  const splitIcon = side === 'home' ? '🏠' : '✈️';

  return (
    <div className="rounded-lg border border-border bg-card/40 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wider">{icon} {title}</h3>
        <span className="text-[10px] font-mono text-muted-foreground">
          {Object.keys(stats).filter((k) => stats[k as keyof ParsedTeamStats] !== undefined).length} câmpuri
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <Label className="text-xs text-muted-foreground">Nume echipă</Label>
          <Input
            value={stats.name ?? ''}
            onChange={(e) => update('name', e.target.value)}
            placeholder={side === 'home' ? 'Echipa Gazdă' : 'Echipa Oaspete'}
            className="bg-secondary border-border h-9"
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Stil de joc</Label>
          <Select value={playstyle} onValueChange={(v) => setPlaystyle(v as PlayStyle)}>
            <SelectTrigger className="bg-secondary border-border h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PLAY_STYLES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-[10px] text-muted-foreground">Loc clasament</Label>
          <Input
            type="number" step="1"
            value={stats.leaguePosition ?? ''}
            onChange={(e) => update('leaguePosition', e.target.value === '' ? undefined : +e.target.value)}
            className="bg-secondary border-border h-8 text-xs" placeholder="—"
          />
        </div>
        <div>
          <Label className="text-[10px] text-muted-foreground">Echipe în ligă</Label>
          <Input
            type="number" step="1"
            value={stats.totalTeamsInLeague ?? ''}
            onChange={(e) => update('totalTeamsInLeague', e.target.value === '' ? undefined : +e.target.value)}
            className="bg-secondary border-border h-8 text-xs" placeholder="—"
          />
        </div>
      </div>

      {/* Sinteză */}
      <div className="rounded-md border border-border/60 bg-background/40 p-3 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-primary">📊 Sinteză (total)</h4>
          <span className="text-[10px] text-muted-foreground">xG = coloana „Împotriva"</span>
        </div>
        <FieldGrid fields={SYNTH_FIELDS} stats={stats} update={update} />
        <div>
          <Label className="text-xs text-muted-foreground">Formă ultimele 5 meciuri (general)</Label>
          <FormPills form={stats.formLast5 ?? ['D','D','D','D','D']} onChange={(f) => update('formLast5', f)} />
        </div>
      </div>

      {/* Split (Acasă pentru gazdă / Deplasare pentru oaspete) */}
      <div className="rounded-md border border-border/60 bg-background/40 p-3 space-y-3">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-accent">{splitIcon} {splitLabel}</h4>
        <FieldGrid fields={splitFields} stats={stats} update={update} />
        <div>
          <Label className="text-xs text-muted-foreground">
            Formă ultimele 5 meciuri {splitLabel.toUpperCase()}
          </Label>
          <FormPills form={stats.formHomeAway ?? ['D','D','D','D','D']} onChange={(f) => update('formHomeAway', f)} />
        </div>
      </div>
    </div>
  );
}

function mergeIntoMatchData(s: DMState, base: MatchData): MatchData {
  const buildTeam = (parsed: ParsedTeamStats, fallback: TeamStats, isHome: boolean): TeamStats => ({
    ...fallback,
    name: parsed.name || fallback.name,
    matchesPlayed: parsed.matchesPlayed ?? fallback.matchesPlayed,
    goalsScored: parsed.goalsScored ?? fallback.goalsScored,
    goalsConceded: parsed.goalsConceded ?? fallback.goalsConceded,
    goalsScoredHome: parsed.goalsScoredHome ?? fallback.goalsScoredHome,
    goalsConcededHome: parsed.goalsConcededHome ?? fallback.goalsConcededHome,
    goalsScoredAway: parsed.goalsScoredAway ?? fallback.goalsScoredAway,
    goalsConcededAway: parsed.goalsConcededAway ?? fallback.goalsConcededAway,
    // User cere: xG-ul echipei = valoarea din coloana xG „Împotriva" (= xG-ul concedat al adversarului perspectivei).
    // Stocăm valoarea introdusă ca xG ofensiv (compatibil engine), iar xGA = aceeași dacă nu e setată separat.
    xG: parsed.xG ?? fallback.xG,
    xGA: parsed.xG ?? fallback.xGA,
    shots: parsed.shots ?? fallback.shots,
    shotsOnTarget: parsed.shotsOnTarget ?? fallback.shotsOnTarget,
    shotsOnTargetHome: parsed.shotsOnTargetHome ?? fallback.shotsOnTargetHome,
    shotsOnTargetAway: parsed.shotsOnTargetAway ?? fallback.shotsOnTargetAway,
    possession: parsed.possession ?? fallback.possession,
    dangerousAttacks: parsed.dangerousAttacks ?? fallback.dangerousAttacks,
    gkSaves: parsed.gkSaves ?? fallback.gkSaves,
    cardsPerMatch: parsed.cardsPerMatch ?? fallback.cardsPerMatch,
    fouls: parsed.fouls ?? fallback.fouls,
    cornersPerMatch: parsed.cornersPerMatch ?? fallback.cornersPerMatch,
    cornersPerMatchHome: parsed.cornersPerMatchHome ?? fallback.cornersPerMatchHome,
    cornersPerMatchAway: parsed.cornersPerMatchAway ?? fallback.cornersPerMatchAway,
    leaguePosition: parsed.leaguePosition ?? fallback.leaguePosition,
    totalTeamsInLeague: parsed.totalTeamsInLeague ?? fallback.totalTeamsInLeague,
    formLast5: parsed.formLast5 ?? fallback.formLast5,
    formHome: isHome ? (parsed.formHomeAway ?? fallback.formHome) : fallback.formHome,
    formAway: !isHome ? (parsed.formHomeAway ?? fallback.formAway) : fallback.formAway,
  });

  return {
    ...base,
    league: s.ctx.league || base.league,
    homeTeam: buildTeam(s.homeStats, base.homeTeam, true),
    awayTeam: buildTeam(s.awayStats, base.awayTeam, false),
    oddsHome: s.odds.home, oddsDraw: s.odds.draw, oddsAway: s.odds.away,
    oddsOver25: s.odds.over25, oddsUnder25: s.odds.under25,
    oddsBTTSYes: s.odds.bttsYes, oddsBTTSNo: s.odds.bttsNo,
    cornerLines: s.corners.map((c) => ({ line: c.line, oddsOver: c.over, oddsUnder: c.under })),
    isDerby: s.ctx.importance === 'derby',
    homeEuropeanMatch: s.ctx.importance === 'european',
    awayEuropeanMatch: s.ctx.importance === 'european',
  };
}

export function DeepMatchIntelligence({ match, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<DMState>(() => loadState());

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* ignore */ }
  }, [state]);

  const homeRatings = useMemo(() => computeRatings(state.homeStats, true), [state.homeStats]);
  const awayRatings = useMemo(() => computeRatings(state.awayStats, false), [state.awayStats]);
  const insights = useMemo(
    () => generateInsights(state.homeStats, state.awayStats, homeRatings, awayRatings),
    [state.homeStats, state.awayStats, homeRatings, awayRatings],
  );
  const pred = useMemo(() => predictionScore(homeRatings, awayRatings), [homeRatings, awayRatings]);

  const setCtx = (patch: Partial<Context>) => setState((s) => ({ ...s, ctx: { ...s.ctx, ...patch } }));
  const setOdds = (patch: Partial<DMState['odds']>) => setState((s) => ({ ...s, odds: { ...s.odds, ...patch } }));
  const setCorner = (i: number, patch: Partial<CornerLineState>) =>
    setState((s) => ({ ...s, corners: s.corners.map((c, idx) => (idx === i ? { ...c, ...patch } : c)) }));

  const handleApply = () => {
    const merged = mergeIntoMatchData(state, defaultMatch());
    // Preserve any user edits already on `match` for fields DM didn't touch
    onChange({ ...match, ...merged });
    setOpen(false);
    toast({ title: '✨ DeepMatch aplicat', description: 'Datele au fost transferate în formularul de analiză. Apasă „Analizează meciul".' });
  };

  const handleReset = () => {
    if (!confirm('Reset toate datele DeepMatch?')) return;
    setState(defaultState());
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 border-primary/40 text-primary hover:bg-primary/10">
          <Sparkles className="h-3.5 w-3.5" /> DeepMatch
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-6xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" />
            DeepMatch Intelligence
            <span className="text-[10px] font-mono text-muted-foreground ml-2">AI Football Data Intelligence Layer</span>
          </DialogTitle>
        </DialogHeader>

        <TooltipProvider>
          <div className="space-y-5 pt-2">
            {/* 1. Liga & Context */}
            <div className="rounded-lg border border-border bg-card/40 p-4 space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wider">🏆 Liga & Context</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  ['league', 'Liga'], ['country', 'Țara'], ['season', 'Sezon'], ['round', 'Etapă'],
                  ['date', 'Dată meci'], ['time', 'Ora meci'], ['stadium', 'Stadion'], ['referee', 'Arbitru'],
                  ['weather', 'Condiții meteo'],
                ].map(([k, label]) => (
                  <div key={k}>
                    <Label className="text-[10px] text-muted-foreground">{label}</Label>
                    <Input
                      value={state.ctx[k as keyof Context] as string}
                      onChange={(e) => setCtx({ [k]: e.target.value } as Partial<Context>)}
                      className="bg-secondary border-border h-8 text-xs"
                    />
                  </div>
                ))}
                <div>
                  <Label className="text-[10px] text-muted-foreground">Importanță</Label>
                  <Select value={state.ctx.importance} onValueChange={(v) => setCtx({ importance: v as Context['importance'] })}>
                    <SelectTrigger className="bg-secondary border-border h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="derby">Derby</SelectItem>
                      <SelectItem value="european">European</SelectItem>
                      <SelectItem value="cup">Cupă</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="md:col-span-2">
                  <Label className="text-[10px] text-muted-foreground">Context competițional</Label>
                  <Input
                    value={state.ctx.competitionContext}
                    onChange={(e) => setCtx({ competitionContext: e.target.value })}
                    placeholder="ex: luptă la titlu, retrogradare..."
                    className="bg-secondary border-border h-8 text-xs"
                  />
                </div>
              </div>
            </div>

            {/* 2 & 3. Teams */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <TeamBlock
                title="Echipa Gazdă" icon="🏠" side="home"
                stats={state.homeStats}
                setStats={(v) => setState((s) => ({ ...s, homeStats: v }))}
                playstyle={state.homePlaystyle}
                setPlaystyle={(p) => setState((s) => ({ ...s, homePlaystyle: p }))}
              />
              <TeamBlock
                title="Echipa Oaspete" icon="✈️" side="away"
                stats={state.awayStats}
                setStats={(v) => setState((s) => ({ ...s, awayStats: v }))}
                playstyle={state.awayPlaystyle}
                setPlaystyle={(p) => setState((s) => ({ ...s, awayPlaystyle: p }))}
              />
            </div>

            {/* AUTO SYNTHESIS */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <SynthesisPanel
                title="Sinteză Acasă" icon="🏠"
                team={state.homeStats} ratings={homeRatings} compareRatings={awayRatings}
              />
              <SynthesisPanel
                title="Sinteză Deplasare" icon="✈️"
                team={state.awayStats} ratings={awayRatings} compareRatings={homeRatings}
              />
            </div>

            <InsightsList insights={insights} />

            <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 flex items-center justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Prediction confidence</div>
                <div className="text-2xl font-mono font-bold">{Math.round(pred.confidence)}%</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Edge global</div>
                <div className={`text-sm font-bold uppercase ${
                  pred.overallEdge === 'home' ? 'text-primary' :
                  pred.overallEdge === 'away' ? 'text-destructive' : 'text-accent'
                }`}>
                  {pred.overallEdge === 'home' ? '🏠 Gazdă' : pred.overallEdge === 'away' ? '✈️ Oaspete' : '⚖️ Echilibrat'}
                </div>
              </div>
            </div>

            {/* 4. Cote */}
            <div className="rounded-lg border border-border bg-card/40 p-4 space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wider">💰 Cote Bookmaker</h3>
              <div className="grid grid-cols-3 md:grid-cols-7 gap-3">
                {([
                  ['home', '1'], ['draw', 'X'], ['away', '2'],
                  ['over25', 'Over 2.5'], ['under25', 'Under 2.5'],
                  ['bttsYes', 'BTTS Da'], ['bttsNo', 'BTTS Nu'],
                ] as const).map(([k, label]) => (
                  <div key={k}>
                    <Label className="text-[10px] text-muted-foreground">{label}</Label>
                    <Input
                      type="number" step="0.01"
                      value={state.odds[k]}
                      onChange={(e) => setOdds({ [k]: +e.target.value })}
                      className="bg-secondary border-border h-8 text-xs"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* 5. Cornere */}
            <div className="rounded-lg border border-border bg-card/40 p-4 space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wider">⛳ Linii Cornere</h3>
              {state.corners.map((c, i) => (
                <div key={i} className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Linia</Label>
                    <Input type="number" step="0.5" value={c.line} onChange={(e) => setCorner(i, { line: +e.target.value })} className="bg-secondary border-border h-8 text-xs" />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Over {c.line}</Label>
                    <Input type="number" step="0.01" value={c.over} onChange={(e) => setCorner(i, { over: +e.target.value })} className="bg-secondary border-border h-8 text-xs" />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Under {c.line}</Label>
                    <Input type="number" step="0.01" value={c.under} onChange={(e) => setCorner(i, { under: +e.target.value })} className="bg-secondary border-border h-8 text-xs" />
                  </div>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="sticky bottom-0 -mx-6 px-6 py-3 bg-background/95 backdrop-blur border-t border-border flex items-center justify-between">
              <Button variant="ghost" size="sm" onClick={handleReset} className="text-muted-foreground">
                Reset
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Anulează</Button>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button onClick={handleApply} className="gap-1.5 font-bold">
                      <Sparkles className="h-3.5 w-3.5" /> Trimite la motorul de analiză
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Transferă datele în formular și închide. Apasă apoi „Analizează meciul".</TooltipContent>
                </Tooltip>
              </div>
            </div>
          </div>
        </TooltipProvider>
      </DialogContent>
    </Dialog>
  );
}