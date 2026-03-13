import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { AnalysisStep } from '@/lib/types';

interface Props {
  steps?: AnalysisStep[];
}

export function HowItWorks({ steps }: Props) {
  const hasSteps = steps && steps.length > 0;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <span>🧠</span> {hasSteps ? 'Vezi cum a gândit robotul' : 'Cum funcționează'}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg">
            {hasSteps ? '🧠 Analiza LIVE — Cum a ajuns robotul la decizii' : '🧠 Cum funcționează BetAnalyzer AI'}
          </DialogTitle>
        </DialogHeader>

        {hasSteps ? (
          <div className="space-y-4">
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
            <p>Analizează un meci mai întâi, apoi apasă din nou acest buton pentru a vedea <strong>pas cu pas</strong> cum a gândit robotul și ce calcule a făcut.</p>
            <div className="rounded-lg border border-border bg-secondary/30 p-3 text-xs space-y-1">
              <p>📊 <strong>Pașii analizei:</strong></p>
              <p>1. Citire date de intrare → 2. Calcul forță ofensivă/defensivă → 3. Ajustări (teren, formă, stil, oboseală) → 4. xG final → 5. Distribuția Poisson → 6. 10.000 simulări Monte Carlo → 7. Blend 70/30 → 8. Cornere estimate → 9. Detecție value → 10. Kelly Criterion Full</p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
