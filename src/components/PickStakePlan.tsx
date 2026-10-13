import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calculator } from 'lucide-react';

/**
 * Staking plan card afișat pe /bankroll când vii din analiza unui pick.
 * URL params: ?pick=match&sel=label&prob=0.65&odds=1.85
 * Arată Flat (1/2/3% bankroll) și Kelly (¼ / ½ / Full).
 */
export function PickStakePlan({ bankroll }: { bankroll: number }) {
  const [params] = useSearchParams();
  const pick = params.get('pick');
  const sel = params.get('sel');
  const prob = parseFloat(params.get('prob') ?? '');
  const oddsRaw = parseFloat(params.get('odds') ?? '');
  const odds = Number.isFinite(oddsRaw) && oddsRaw > 1 ? oddsRaw : null;

  const plan = useMemo(() => {
    if (!Number.isFinite(prob) || prob <= 0 || prob >= 1) return null;
    const flat = [
      { label: 'Flat conservator', pct: 0.01 },
      { label: 'Flat standard', pct: 0.02 },
      { label: 'Flat agresiv', pct: 0.03 },
    ].map((f) => ({ ...f, lei: +(bankroll * f.pct).toFixed(2) }));

    let kelly: { full: number; half: number; quarter: number; edge: number } | null = null;
    if (odds) {
      const b = odds - 1;
      const q = 1 - prob;
      const fStar = (b * prob - q) / b; // full Kelly fraction of bankroll
      const edge = prob * odds - 1;
      const safeFull = Math.max(0, fStar);
      kelly = {
        full: +(bankroll * safeFull).toFixed(2),
        half: +(bankroll * safeFull * 0.5).toFixed(2),
        quarter: +(bankroll * safeFull * 0.25).toFixed(2),
        edge,
      };
    }
    return { flat, kelly };
  }, [prob, odds, bankroll]);

  if (!pick || !plan) return null;

  return (
    <Card className="border-primary/40 bg-primary/5">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-foreground text-base">
          <Calculator className="h-4 w-4 text-primary" />
          Plan stake — {pick}
        </CardTitle>
        <div className="text-xs text-muted-foreground">
          {sel && <span className="font-medium text-foreground">{sel}</span>}
          {sel && ' · '}Probabilitate model {(prob * 100).toFixed(0)}%
          {odds ? ` · cota ${odds.toFixed(2)}` : ' · fără cotă'}
          {' · '}bancă {bankroll.toFixed(2)} LEI
        </div>
      </CardHeader>
      <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-2">Stake flat</div>
          <div className="space-y-1.5">
            {plan.flat.map((f) => (
              <div key={f.label} className="flex items-center justify-between rounded-md border border-border/60 bg-background/40 px-3 py-2 text-sm">
                <span className="text-muted-foreground">{f.label} <span className="text-[10px]">({(f.pct * 100).toFixed(0)}%)</span></span>
                <span className="font-mono font-bold text-foreground">{f.lei.toFixed(2)} LEI</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-2">Kelly fracționat</div>
          {plan.kelly ? (
            plan.kelly.full <= 0 ? (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive-foreground/90">
                Kelly = 0 — fără edge față de cotă ({(plan.kelly.edge * 100).toFixed(1)}%). Nu pariem după Kelly.
              </div>
            ) : (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between rounded-md border border-border/60 bg-background/40 px-3 py-2 text-sm">
                  <span className="text-muted-foreground">¼ Kelly <span className="text-[10px]">(safe)</span></span>
                  <span className="font-mono font-bold text-foreground">{plan.kelly.quarter.toFixed(2)} LEI</span>
                </div>
                <div className="flex items-center justify-between rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm">
                  <span className="text-muted-foreground">½ Kelly <span className="text-[10px]">(recomandat)</span></span>
                  <span className="font-mono font-bold text-primary">{plan.kelly.half.toFixed(2)} LEI</span>
                </div>
                <div className="flex items-center justify-between rounded-md border border-border/60 bg-background/40 px-3 py-2 text-sm">
                  <span className="text-muted-foreground">Full Kelly <span className="text-[10px]">(agresiv)</span></span>
                  <span className="font-mono font-bold text-foreground">{plan.kelly.full.toFixed(2)} LEI</span>
                </div>
                <div className="text-[10px] text-muted-foreground">Edge model vs cotă: {(plan.kelly.edge * 100).toFixed(1)}%</div>
              </div>
            )
          ) : (
            <div className="rounded-md border border-border/40 bg-background/40 p-3 text-xs text-muted-foreground">
              Fără cotă disponibilă — nu pot calcula Kelly. Folosește planul flat.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}