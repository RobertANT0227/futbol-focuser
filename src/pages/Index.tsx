import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { MatchInputForm, defaultMatch } from '@/components/MatchInputForm';
import { PasteImporter } from '@/components/PasteImporter';
import { PlanForm, defaultPlan } from '@/components/PlanForm';
import { VerdictDisplay } from '@/components/VerdictDisplay';
import { DailyTop } from '@/components/DailyTop';
import { HowItWorks } from '@/components/HowItWorks';
import { PasswordGate } from '@/components/PasswordGate';
import { runAnalysis } from '@/lib/engine';
import type { MatchData, UserPlan, AnalysisResult, DailyMatch } from '@/lib/types';

const Index = () => {
  const navigate = useNavigate();
  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem('unlocked') === '1');
  const [match, setMatch] = useState<MatchData>(defaultMatch());
  const [plan, setPlan] = useState<UserPlan>(defaultPlan);
  const [planSet, setPlanSet] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [dailyMatches, setDailyMatches] = useState<DailyMatch[]>([]);
  const [savedMatch, setSavedMatch] = useState<MatchData | null>(null);

  if (!unlocked) {
    return <PasswordGate onUnlock={() => setUnlocked(true)} />;
  }

  const handleAnalyze = () => {
    setAnalyzing(true);
    setSavedMatch({ ...match });
    setTimeout(() => {
      const analysis = runAnalysis(match, planSet ? plan : undefined);
      setResult(analysis);
      setAnalyzing(false);
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
            <Button variant="outline" size="sm" onClick={() => navigate('/bankroll')} className="gap-2">
              <span>📊</span> Bankroll Manager
            </Button>
            <HowItWorks steps={result?.analysisSteps} result={result} />
            <div className="text-xs font-mono text-muted-foreground hidden md:block">
              Poisson + Monte Carlo + Kelly
            </div>
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
              <p className="text-sm text-muted-foreground">💡 Activează planul personalizat pentru filtrarea automată a pariurilor după risc și preferințe. Kelly Criterion full automat.</p>
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
              <Button
                size="lg"
                onClick={handleAnalyze}
                disabled={analyzing}
                className="px-12 font-bold"
              >
                {analyzing ? (
                  <span className="flex items-center gap-2">
                    <span className="animate-pulse-glow">⏳</span> Analizez...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">🔬 Analizează meciul</span>
                )}
              </Button>
              <p className="text-xs text-muted-foreground">
                Poisson Distribution • 10.000 simulări Monte Carlo • Kelly Criterion Full • AI Explanation
              </p>
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
