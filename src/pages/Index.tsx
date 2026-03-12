import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { MatchInputForm, defaultMatch } from '@/components/MatchInputForm';
import { PlanForm, defaultPlan } from '@/components/PlanForm';
import { VerdictDisplay } from '@/components/VerdictDisplay';
import { runAnalysis } from '@/lib/engine';
import type { MatchData, UserPlan, AnalysisResult } from '@/lib/types';

const Index = () => {
  const [match, setMatch] = useState<MatchData>(defaultMatch());
  const [plan, setPlan] = useState<UserPlan>(defaultPlan);
  const [planSet, setPlanSet] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  const handleAnalyze = () => {
    setAnalyzing(true);
    // Small delay for UX
    setTimeout(() => {
      const analysis = runAnalysis(match, planSet ? plan : undefined);
      setResult(analysis);
      setAnalyzing(false);
    }, 500);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⚽</span>
            <div>
              <h1 className="text-lg font-bold tracking-tight">BetAnalyzer AI</h1>
              <p className="text-xs text-muted-foreground">Motor de analiză pentru pariuri sportive</p>
            </div>
          </div>
          <div className="text-xs font-mono text-muted-foreground">
            Poisson + Monte Carlo + Kelly
          </div>
        </div>
      </header>

      <main className="container max-w-6xl mx-auto px-4 py-6 space-y-6">
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
              <p className="text-sm text-muted-foreground">💡 Activează planul personalizat pentru filtrarea automată a pariurilor după risc, value și preferințe.</p>
            </div>
          )}
        </div>

        {/* Match Data */}
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2">Pasul 2: Date meci</h2>
          <MatchInputForm match={match} onChange={setMatch} />
        </div>

        {/* Analyze button */}
        <div className="text-center">
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
          <p className="text-xs text-muted-foreground mt-2">
            Poisson Distribution • 10.000 simulări Monte Carlo • Kelly Criterion
          </p>
        </div>

        {/* Results */}
        {result && (
          <VerdictDisplay
            result={result}
            homeTeamName={match.homeTeam.name}
            awayTeamName={match.awayTeam.name}
          />
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
