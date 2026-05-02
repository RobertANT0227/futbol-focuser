import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { MatchInputForm, defaultMatch } from '@/components/MatchInputForm';
import { PasteImporter } from '@/components/PasteImporter';
import { PlanForm, defaultPlan } from '@/components/PlanForm';
import { VerdictDisplay } from '@/components/VerdictDisplay';
import { DailyTop } from '@/components/DailyTop';
import { HowItWorks } from '@/components/HowItWorks';
import { runAnalysis } from '@/lib/engine';
import { saveSyncedTopBets, type SyncedTopBet, loadSyncedTopBets } from '@/lib/bankroll';
import { useAuth } from '@/contexts/AuthContext';
import { ROBOT_DAILY_LIMIT_CLIENT, getTodayRobotUsage, recordRobotUsage } from '@/lib/robotQuota';
import { toast } from '@/hooks/use-toast';
import type { MatchData, UserPlan, AnalysisResult, DailyMatch } from '@/lib/types';

const Index = () => {
  const { user, isOwner, isTrial } = useAuth();
  const [match, setMatch] = useState<MatchData>(defaultMatch());
  const [plan, setPlan] = useState<UserPlan>(defaultPlan);
  const [planSet, setPlanSet] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [dailyMatches, setDailyMatches] = useState<DailyMatch[]>([]);
  const [savedMatch, setSavedMatch] = useState<MatchData | null>(null);
  const [robotUsedToday, setRobotUsedToday] = useState<number>(0);

  // Load today's robot usage for trial
  useEffect(() => {
    if (!user || !isTrial) return;
    getTodayRobotUsage(user.id).then(setRobotUsedToday);
  }, [user, isTrial]);

  const robotRemaining = isTrial ? Math.max(0, ROBOT_DAILY_LIMIT_CLIENT - robotUsedToday) : Infinity;
  const robotBlocked = isTrial && robotRemaining <= 0;

  const handleAnalyze = async () => {
    if (robotBlocked) {
      toast({
        title: 'Limită atinsă',
        description: `Ai folosit cele ${ROBOT_DAILY_LIMIT_CLIENT} analize zilnice. Reîncearcă mâine.`,
        variant: 'destructive',
      });
      return;
    }

    // Consume quota for trial BEFORE analysis
    if (isTrial && user) {
      const ok = await recordRobotUsage(user.id);
      if (!ok) {
        toast({ title: 'Eroare', description: 'Nu s-a putut înregistra utilizarea.', variant: 'destructive' });
        return;
      }
      setRobotUsedToday((n) => n + 1);
    }

    setAnalyzing(true);
    setSavedMatch({ ...match });
    setTimeout(() => {
      const analysis = runAnalysis(match, planSet ? plan : undefined);
      setResult(analysis);
      setAnalyzing(false);

      // Sync top bets to Bankroll Manager (only useful for owner; harmless for client)
      if (isOwner) {
        const matchLabel = `${match.homeTeam.name} vs ${match.awayTeam.name}`;
        const synced: SyncedTopBet[] = analysis.recommendations
          .filter((r) => r.value > 0)
          .sort((a, b) => b.ev - a.ev)
          .map((r) => ({
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
        const prev = loadSyncedTopBets().filter((b) => b.matchLabel !== matchLabel);
        saveSyncedTopBets([...prev, ...synced]);
      }
    }, 500);
  };

  const handleReverse = () => {
    if (savedMatch) {
      setMatch(savedMatch);
    }
    setResult(null);
    setSavedMatch(null);
  };

  const handleAddToDaily = () => {
    if (!result) return;
    const dm: DailyMatch = {
      id: crypto.randomUUID(),
      match: { ...match },
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
            <span className="text-2xl">⚽</span>
            <div>
              <h1 className="text-lg font-bold tracking-tight">BetAnalyzer AI</h1>
              <p className="text-xs text-muted-foreground">Professional Football Betting Intelligence</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <HowItWorks steps={result?.analysisSteps} result={result} />
          </div>
        </div>
      </header>

      <main className="container max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Daily Top */}
        <DailyTop matches={dailyMatches} onClear={() => setDailyMatches([])} />

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
              <p className="text-sm text-muted-foreground">💡 Activează planul personalizat pentru filtrarea automată a pariurilor după risc și preferințe.</p>
            </div>
          )}
        </div>

        {/* Match Data - hide when result is shown */}
        {!result && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Pasul 2: Date meci (medii/meci)</h2>
              <PasteImporter match={match} onChange={setMatch} />
            </div>
            <MatchInputForm match={match} onChange={setMatch} />
          </div>
        )}

        {/* Analyze / Reverse buttons */}
        <div className="text-center space-y-3">
          {!result ? (
            <>
              {isTrial && (
                <div className="text-xs text-muted-foreground">
                  🤖 Analize rămase azi:{' '}
                  <span className={`font-mono font-bold ${robotBlocked ? 'text-destructive' : 'text-primary'}`}>
                    {robotRemaining}/{ROBOT_DAILY_LIMIT_CLIENT}
                  </span>
                </div>
              )}
              <Button
                size="lg"
                onClick={handleAnalyze}
                disabled={analyzing || robotBlocked}
                className="px-12 font-bold"
              >
                {analyzing ? (
                  <span className="flex items-center gap-2">
                    <span className="animate-pulse-glow">⏳</span> Analizez...
                  </span>
                ) : robotBlocked ? (
                  <span className="flex items-center gap-2">🚫 Limită atinsă</span>
                ) : (
                  <span className="flex items-center gap-2">🔬 Analizează meciul</span>
                )}
              </Button>
            </>
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

        {/* Results */}
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
              <p className="text-xs text-muted-foreground mt-1">
                Adaugă acest meci în topul zilei și continuă cu alt meci
              </p>
            </div>
          </>
        )}
      </main>

      <footer className="border-t border-border py-4 mt-8">
        <p className="text-center text-xs text-muted-foreground">
          ⚠️ Acest robot este un instrument de analiză statistică. Pariurile sportive implică risc. Jucați responsabil.
        </p>
      </footer>
    </div>
  );
};

export default Index;
