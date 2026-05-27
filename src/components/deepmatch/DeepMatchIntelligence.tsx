import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Sparkles, Wand2 } from 'lucide-react';
import type { MatchData, TeamStats } from '@/lib/types';
import { defaultMatch } from '@/components/MatchInputForm';
import type { ParsedTeamStats } from '@/lib/deepmatch/parser';
import { computeRatings, generateInsights, predictionScore } from '@/lib/deepmatch/ratings';
import { parseFootystatsRaw, applyGeneral, applyHome, applyAway } from '@/lib/deepmatch/footystatsParser';
import { parseStatsOnly } from '@/lib/statsParser';
import { SynthesisPanel, InsightsList } from './SynthesisPanel';
import { toast } from '@/hooks/use-toast';

interface Props {
  match: MatchData;
  onChange: (match: MatchData) => void;
}

interface CornerLineState {
  line: number;
  over: number;
  under: number;
}

interface DMState {
  homeStats: ParsedTeamStats;
  awayStats: ParsedTeamStats;
  // raw paste buffers (persisted so user can iterate)
  compRaw: string;
  homeGeneralRaw: string;
  homeAcasaRaw: string;
  homeDeplasareRaw: string;
  awayGeneralRaw: string;
  awayAcasaRaw: string;
  awayDeplasareRaw: string;
  odds: {
    home: number; draw: number; away: number;
    over25: number; under25: number;
    bttsYes: number; bttsNo: number;
  };
  corners: CornerLineState[];
}

const STORAGE_KEY = 'deepmatch-intelligence-state-v3';

function defaultState(): DMState {
  return {
    homeStats: {},
    awayStats: {},
    compRaw: '',
    homeGeneralRaw: '', homeAcasaRaw: '', homeDeplasareRaw: '',
    awayGeneralRaw: '', awayAcasaRaw: '', awayDeplasareRaw: '',
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

/** Map SofaScore comparison parser output → both teams' ParsedTeamStats fields. */
function applySofaComparison(
  rawText: string,
  homeBase: ParsedTeamStats,
  awayBase: ParsedTeamStats,
): { home: ParsedTeamStats; away: ParsedTeamStats; fields: number; t1: string; t2: string } {
  const p = parseStatsOnly(rawText);
  const home = { ...homeBase };
  const away = { ...awayBase };
  if (p.team1 && !home.name) home.name = p.team1;
  if (p.team2 && !away.name) away.name = p.team2;

  const map: Record<string, keyof ParsedTeamStats> = {
    possession: 'possession',
    shots: 'shots',
    shots_on_target: 'shotsOnTarget',
    corners: 'cornersPerMatch',
    fouls: 'fouls',
    yellow_cards: 'cardsPerMatch',
    xg: 'xG',
    dangerous_attacks: 'dangerousAttacks',
    gk_saves: 'gkSaves',
    goals: 'goalsScored',
  };
  let fields = 0;
  Object.entries(p.stats).forEach(([key, pair]) => {
    const field = map[key];
    if (!field) return;
    (home as Record<string, unknown>)[field] = pair.team1;
    (away as Record<string, unknown>)[field] = pair.team2;
    fields += 2;
  });
  return { home, away, fields, t1: p.team1, t2: p.team2 };
}

function PasteBox({
  label, value, onChange, onExtract, hint,
}: {
  label: string; value: string; onChange: (v: string) => void; onExtract: () => void; hint?: string;
}) {
  return (
    <div className="space-y-2">
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={label}
        className="bg-secondary border-border min-h-[120px] font-mono text-xs"
      />
      <Button size="sm" onClick={onExtract} disabled={!value.trim()} className="gap-1.5">
        <Wand2 className="h-3.5 w-3.5" /> Extract
      </Button>
    </div>
  );
}

function TeamPasteBlock({
  title, icon, side, stats, setStats,
  generalRaw, setGeneralRaw,
  acasaRaw, setAcasaRaw,
  deplasareRaw, setDeplasareRaw,
}: {
  title: string; icon: string; side: 'home' | 'away';
  stats: ParsedTeamStats; setStats: (s: ParsedTeamStats) => void;
  generalRaw: string; setGeneralRaw: (v: string) => void;
  acasaRaw: string; setAcasaRaw: (v: string) => void;
  deplasareRaw: string; setDeplasareRaw: (v: string) => void;
}) {
  const extract = (kind: 'general' | 'home' | 'away', raw: string) => {
    const p = parseFootystatsRaw(raw, stats.name);
    const merged = kind === 'general' ? applyGeneral(p, stats)
      : kind === 'home' ? applyHome(p, stats)
      : applyAway(p, stats);
    setStats(merged);
    const detected = p.log.length;
    toast({
      title: `${icon} ${title} — ${kind === 'general' ? 'Statistici Generale' : kind === 'home' ? 'Acasă' : 'Deplasare'}`,
      description: `${detected} câmpuri detectate și aplicate.`,
    });
  };

  return (
    <div className="rounded-lg border border-border bg-card/40 p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider">{icon} {title}</h3>
        <span className="text-[10px] font-mono text-muted-foreground">
          {Object.keys(stats).filter((k) => stats[k as keyof ParsedTeamStats] !== undefined).length} câmpuri
        </span>
      </div>

      <div>
        <Label className="text-xs text-muted-foreground">Nume echipă (folosit la căutarea în clasament)</Label>
        <Input
          value={stats.name ?? ''}
          onChange={(e) => setStats({ ...stats, name: e.target.value })}
          placeholder={side === 'home' ? 'ex: FC Rapid Bucuresti' : 'ex: CS Universitatea Craiova'}
          className="bg-secondary border-border h-9"
        />
      </div>

      <Tabs defaultValue="general" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="general" className="text-xs">📊 Statistici Generale</TabsTrigger>
          <TabsTrigger value="home" className="text-xs">🏠 Acasă</TabsTrigger>
          <TabsTrigger value="away" className="text-xs">✈️ Deplasare</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="mt-3">
          <PasteBox
            label="Lipește aici tot textul de la FootyStats → Statistici Generale (Formă, MJ, GM/GP Sinteză, xG Împotriva, Alte Statistici, Clasament Liga I Tabel)"
            hint="Se extrage: formă generală, loc clasament, MJ Sinteză, GM/GP Sinteză, xG (Împotriva) Sinteză, posesie, șuturi, cornere, faulturi, cartonașe."
            value={generalRaw} onChange={setGeneralRaw}
            onExtract={() => extract('general', generalRaw)}
          />
        </TabsContent>
        <TabsContent value="home" className="mt-3">
          <PasteBox
            label="Lipește aici FootyStats → Statistici Acasă (Formă acasă, GM/GP Acasă, Cornere Pentru acasă, Liga I Clasament Acasă)"
            hint="Se extrage: formă ACASĂ, GM/GP acasă, cornere pentru acasă, șuturi pe poartă acasă."
            value={acasaRaw} onChange={setAcasaRaw}
            onExtract={() => extract('home', acasaRaw)}
          />
        </TabsContent>
        <TabsContent value="away" className="mt-3">
          <PasteBox
            label="Lipește aici FootyStats → Statistici Deplasare (Formă deplasare, GM/GP Deplasare, Cornere Pentru deplasare, Liga I Clasament deplasare)"
            hint="Se extrage: formă DEPLASARE, GM/GP deplasare, cornere pentru deplasare, șuturi pe poartă deplasare."
            value={deplasareRaw} onChange={setDeplasareRaw}
            onExtract={() => extract('away', deplasareRaw)}
          />
        </TabsContent>
      </Tabs>
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
    // xG = secțiunea simplă "xG" din FootyStats. xGA = "xG (Împotriva)".
    xG: parsed.xG ?? fallback.xG,
    xGA: parsed.xGA ?? fallback.xGA,
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
    // Regula utilizator: forma echipei gazdă = tab "Acasă"; forma echipei oaspete = tab "Deplasare".
    formHome: isHome ? (parsed.formHomeAway ?? fallback.formHome) : fallback.formHome,
    formAway: !isHome ? (parsed.formHomeAway ?? fallback.formAway) : fallback.formAway,
  });

  return {
    ...base,
    homeTeam: buildTeam(s.homeStats, base.homeTeam, true),
    awayTeam: buildTeam(s.awayStats, base.awayTeam, false),
    oddsHome: s.odds.home, oddsDraw: s.odds.draw, oddsAway: s.odds.away,
    oddsOver25: s.odds.over25, oddsUnder25: s.odds.under25,
    oddsBTTSYes: s.odds.bttsYes, oddsBTTSNo: s.odds.bttsNo,
    cornerLines: s.corners.map((c) => ({ line: c.line, oddsOver: c.over, oddsUnder: c.under })),
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

  const setOdds = (patch: Partial<DMState['odds']>) => setState((s) => ({ ...s, odds: { ...s.odds, ...patch } }));
  const setCorner = (i: number, patch: Partial<CornerLineState>) =>
    setState((s) => ({ ...s, corners: s.corners.map((c, idx) => (idx === i ? { ...c, ...patch } : c)) }));

  const handleExtractComparison = () => {
    if (!state.compRaw.trim()) return;
    const { home, away, fields, t1, t2 } = applySofaComparison(state.compRaw, state.homeStats, state.awayStats);
    setState((s) => ({ ...s, homeStats: home, awayStats: away }));
    toast({
      title: '📊 Sinteză comparativă',
      description: `${fields} valori aplicate. ${t1 || '?'} vs ${t2 || '?'}.`,
    });
  };

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
            {/* 1. Sinteză comparativă (SofaScore) */}
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold uppercase tracking-wider">📊 Sinteză comparativă (SofaScore)</h3>
                <span className="text-[10px] text-muted-foreground">Aplică automat pentru AMBELE echipe</span>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Lipește tot textul comparativ din SofaScore (Gazdă apoi Oaspete, urmate de perechi valoare/etichetă/valoare).
                Se extrag: posesie, șuturi, șuturi pe poartă, cornere, faulturi, cartonașe, xG, atacuri periculoase.
              </p>
              <Textarea
                value={state.compRaw}
                onChange={(e) => setState((s) => ({ ...s, compRaw: e.target.value }))}
                placeholder={`Rapid București\nUniversitatea Craiova\n1.5\nGoluri\n1.8\n53.1%\nPosesie\n58.2%\n1.4\nGoluri Așteptate (xG)\n1.5\n13.2\nTotal șuturi\n14.9\n4.0\nȘuturi pe poartă\n5.1\n5.4\nCornere\n5.0\n10.9\nFaulturi\n11.5\n2.1\nCartonașe galbene\n2.1`}
                className="bg-secondary border-border min-h-[140px] font-mono text-xs"
              />
              <Button size="sm" onClick={handleExtractComparison} disabled={!state.compRaw.trim()} className="gap-1.5">
                <Wand2 className="h-3.5 w-3.5" /> Extract sinteză comparativă
              </Button>
            </div>

            {/* 2 & 3. Teams (paste-based) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <TeamPasteBlock
                title="Echipa Gazdă" icon="🏠" side="home"
                stats={state.homeStats}
                setStats={(v) => setState((s) => ({ ...s, homeStats: v }))}
                generalRaw={state.homeGeneralRaw}
                setGeneralRaw={(v) => setState((s) => ({ ...s, homeGeneralRaw: v }))}
                acasaRaw={state.homeAcasaRaw}
                setAcasaRaw={(v) => setState((s) => ({ ...s, homeAcasaRaw: v }))}
                deplasareRaw={state.homeDeplasareRaw}
                setDeplasareRaw={(v) => setState((s) => ({ ...s, homeDeplasareRaw: v }))}
              />
              <TeamPasteBlock
                title="Echipa Oaspete" icon="✈️" side="away"
                stats={state.awayStats}
                setStats={(v) => setState((s) => ({ ...s, awayStats: v }))}
                generalRaw={state.awayGeneralRaw}
                setGeneralRaw={(v) => setState((s) => ({ ...s, awayGeneralRaw: v }))}
                acasaRaw={state.awayAcasaRaw}
                setAcasaRaw={(v) => setState((s) => ({ ...s, awayAcasaRaw: v }))}
                deplasareRaw={state.awayDeplasareRaw}
                setDeplasareRaw={(v) => setState((s) => ({ ...s, awayDeplasareRaw: v }))}
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