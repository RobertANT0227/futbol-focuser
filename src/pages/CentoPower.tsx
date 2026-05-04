import { useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { MatchInputForm, defaultMatch } from '@/components/MatchInputForm';
import { CentoPasteImporter } from '@/components/CentoPasteImporter';
import { PlanForm, defaultPlan } from '@/components/PlanForm';
import { VerdictDisplay } from '@/components/VerdictDisplay';
import { DailyTop } from '@/components/DailyTop';
import { HowItWorks } from '@/components/HowItWorks';
import { PlaystyleBadge } from '@/components/PlaystyleBadge';
import { runAnalysis } from '@/lib/engine';
import { saveSyncedTopBets, type SyncedTopBet, loadSyncedTopBets } from '@/lib/bankroll';
import { useAuth } from '@/contexts/AuthContext';
import { detectPlaystyle } from '@/lib/playstyleDetect';
import type { MatchData, UserPlan, AnalysisResult, DailyMatch } from '@/lib/types';

/**
 * Cento Power — advanced version of the dashboard.
 * Same engine (WR/EV/verdict logic untouched), but:
 *  • Auto-detects playstyle for each team (overrides manual selection)
 *  • Uses 3-section parser (General / Home / Away)
 */
const CentoPower = () => {
  const { user, isOwner } = useAuth();
  const [match, setMatch] = useState<MatchData>(defaultMatch());
  const [plan, setPlan] = useState<UserPlan>(defaultPlan);
  const [planSet, setPlanSet] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [dailyMatches, setDailyMatches] = useState<DailyMatch[]>([]);
  const [savedMatch, setSavedMatch] = useState<MatchData | null>(null);

  // Auto-detected playstyles based on current stats
  const homeDetection = useMemo(() => detectPlaystyle(match.homeTeam), [match.homeTeam]);
  const awayDetection = useMemo(() => detectPlaystyle(match.awayTeam), [match.awayTeam]);

  // Inject auto-playstyle into match BEFORE analysis (override manual)
  const buildMatchWithAutoStyles = (m: MatchData): MatchData => ({
    ...m,
    homeTeam: { ...m.homeTeam, playStyle: homeDetection.style },
    awayTeam: { ...m.awayTeam, playStyle: awayDetection.style },
  });

  const handleAnalyze = async () => {
    setAnalyzing(true);
    const enriched = buildMatchWithAutoStyles(match);
    setSavedMatch({ ...match });
    setTimeout(() => {
      const analysis = runAnalysis(enriched, planSet ? plan : undefined);
      setResult(analysis);
      setAnalyzing(false);

      if (isOwner) {
        const matchLabel = `[CP] ${match.homeTeam.name} vs ${match.awayTeam.name}`;
        const synced: SyncedTopBet[] = analysis.recommendations
          .filter(r => r.value > 0)
          .sort((a, b) => b.ev - a.ev)
          .map(r => ({
            matchLabel,
            selection: r.selection,
            category: r.category,
            odds: r.odds,
            winRate: r.winRate,
            ev: r.ev,
            value: r.value,
            stakeConfidence: r.stakeConfidence,
            stakePct: r.stakePct,
            stakeLei: r.stakeLei,
            fragile: r.fragile,
            risk: r.risk,
            addedAt: new Date().toISOString(),
          }));
        const prev = loadSyncedTopBets().filter(b => b.matchLabel !== matchLabel);
        saveSyncedTopBets([...prev, ...synced]);
      }
    }, 500);
  };

  const handleReverse = () => {
    if (savedMatch) setMatch(savedMatch);
    setResult(null);
    setSavedMatch(null);
  };

  const handleAddToDaily = () => {
    if (!result) return;
    const dm: DailyMatch = {
      id: crypto.randomUUID(),
      match: buildMatchWithAutoStyles(match),
      result,
      addedAt: new Date(),
    };
    setDailyMatches(prev => [...prev, dm]);
    setMatch(defaultMatch());
    setResult(null);
    setSavedMatch(null);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⚡</span>
            <div>
              <h1 className="text-lg font-bold tracking-tight">
                Cento Power
                <span className="ml-2 text-[10px] font-bold text-primary border border-primary/30 bg-primary/10 px-1.5 py-0.5 rounded">
                  ADVANCED
                </span>
              </h1>
              <p className="text-xs text-muted-foreground">Auto-playstyle • Date avansate • Aceeași logică WR/EV</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <HowItWorks steps={result?.analysisSteps} result={result} />
          </div>
        </div>
      </header>

      <main className="container max-w-6xl mx-auto px-4 py-6 space-y-6">
        <DailyTop matches={dailyMatches} onClear={() => setDailyMatches([])} />

        {/* Auto-detected playstyles */}
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            🤖 Auto-detect Playstyle
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <PlaystyleBadge teamName={`🏠 ${match.homeTeam.name}`} detection={homeDetection} />
            <PlaystyleBadge teamName={`✈️ ${match.awayTeam.name}`} detection={awayDetection} />
          </div>
        </div>

        {/* Plan */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Pasul 1: Plan personalizat</h2>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={planSet}
                onChange={e => setPlanSet(e.target.checked)}
                className="rounded border-border"
              />
              <span className="text-xs text-muted-foreground">Activează planul</span>
            </label>
          </div>
          {planSet && <PlanForm plan={plan} onChange={setPlan} />}
          {!planSet && (
            <div className="rounded-lg border border-border bg-card/50 p-4 text-center">
              <p className="text-sm text-muted-foreground">💡 Activează planul personalizat pentru filtrarea pariurilor după risc și preferințe.</p>
            </div>
          )}
        </div>

        {!result && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Pasul 2: Date meci avansate</h2>
              <CentoPasteImporter match={match} onChange={setMatch} />
            </div>
            <MatchInputForm match={match} onChange={setMatch} />
          </div>
        )}

        <div className="text-center space-y-3">
          {!result ? (
            <Button
              size="lg"
              onClick={handleAnalyze}
              disabled={analyzing}
              className="px-12 font-bold"
            >
              {analyzing ? (
                <span className="flex items-center gap-2"><span className="animate-pulse-glow">⏳</span> Analizez...</span>
              ) : (
                <span className="flex items-center gap-2">⚡ Analizează cu Cento Power</span>
              )}
            </Button>
          ) : (
            <Button
              size="lg"
              variant="outline"
              onClick={handleReverse}
              className="px-8 font-bold border-accent text-accent hover:bg-accent hover:text-accent-foreground gap-2"
            >
              🔄 Reverse — Editează datele
            </Button>
          )}
        </div>

        {result && (
          <>
            <VerdictDisplay
              result={result}
              homeTeamName={match.homeTeam.name}
              awayTeamName={match.awayTeam.name}
            />
            <div className="text-center">
              <Button
                size="lg"
                variant="outline"
                onClick={handleAddToDaily}
                className="px-8 font-bold border-accent text-accent hover:bg-accent hover:text-accent-foreground gap-2"
              >
                🏅 Adaugă în Top of the Day
              </Button>
            </div>
          </>
        )}
      </main>

      <footer className="border-t border-border py-4 mt-8">
        <p className="text-center text-xs text-muted-foreground">
          ⚡ Cento Power — date avansate, model identic. Pariurile sportive implică risc. Jucați responsabil.
        </p>
      </footer>
    </div>
  );
};

export default CentoPower;
