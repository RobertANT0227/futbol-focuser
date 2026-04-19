import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { AnalysisStep, AnalysisResult } from '@/lib/types';

interface Props {
  steps?: AnalysisStep[];
  result?: AnalysisResult | null;
}

export function HowItWorks({ steps, result }: Props) {
  const hasSteps = steps && steps.length > 0;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <span>🧠</span> {hasSteps ? 'Live Statistics Analysis' : 'Live Statistics Analysis'}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg">
            🧠 Live Statistics Analysis
          </DialogTitle>
        </DialogHeader>

        {hasSteps ? (
          <div className="space-y-4">
            {/* Summary */}
            {result?.bestBet && (
              <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-4">
                <div className="flex items-start gap-2 mb-2">
                  <span className="text-lg">📌</span>
                  <h3 className="font-bold text-primary text-sm">Verdict</h3>
                </div>
                <p className="text-sm text-secondary-foreground leading-relaxed mb-3">
                  {result.bestBet.aiExplanation}
                </p>
                <div className="text-xs text-muted-foreground font-mono">
                  Best Bet: <span className="text-primary font-bold">{result.bestBet.selection}</span> @ {result.bestBet.odds.toFixed(2)} — WR: {result.bestBet.winRate.toFixed(1)}%
                </div>
              </div>
            )}

            {steps.map((step, i) => (
              <div key={i} className="rounded-lg border border-border bg-card p-4 animate-slide-up" style={{ animationDelay: `${i * 50}ms` }}>
                <h3 className="font-semibold text-foreground mb-1 text-sm">{step.title}</h3>
                <p className="text-xs text-muted-foreground mb-2">{step.description}</p>
                {step.data && (
                  <div className="grid grid-cols-2 gap-1">
                    {Object.entries(step.data).map(([key, val]) => (
                      <div key={key} className="text-xs font-mono bg-secondary/50 rounded px-2 py-1">
                        <span className="text-muted-foreground">{key}:</span>{' '}
                        <span className="text-primary font-semibold">{val}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3 text-sm text-secondary-foreground">
            <p>Analizează un meci mai întâi, apoi apasă din nou pentru a vedea <strong>analiza LIVE pas cu pas</strong> cu explicații AI.</p>
            <div className="rounded-lg border border-border bg-secondary/30 p-3 text-xs space-y-1">
              <p>📊 <strong>Pașii analizei:</strong></p>
              <p>1. Date de intrare → 2. Forță ofensivă/defensivă → 3. Detecție stil (Bus Parking / High Press) → 4. Ajustări → 5. xG final → 6. Poisson → 7. Monte Carlo → 8. Blend → 9. Cornere → 10. Value & Kelly</p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
