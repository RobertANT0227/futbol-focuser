import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Cpu } from 'lucide-react';
import type { AnalysisResult } from '@/lib/types';

/**
 * Afișează verdictul motorului LEGACY (70% Poisson + 30% Monte Carlo + Full Kelly,
 * filtru Premium Tipster WR ≥ 76%) lângă cardul Cento.
 */
export function LegacyVerdictCard({ result }: { result: AnalysisResult | null }) {
  if (!result) {
    return (
      <Card className="p-3 bg-card/40 border-dashed text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5 font-bold text-foreground/80 mb-1">
          <Cpu className="h-3.5 w-3.5" /> Motor legacy
        </div>
        Lipsesc cote 1X2 — fără verdict legacy.
      </Card>
    );
  }
  const best = result.bestBet;
  const premium = result.recommendations.filter((r) => r.tipsterTier === 'tipster_premium' && r.winRate >= 76);
  return (
    <Card className="p-3 bg-card/50 border border-accent/30 text-xs space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 font-bold text-foreground">
          <Cpu className="h-3.5 w-3.5 text-accent" /> Motor legacy (70/30 + Kelly)
        </div>
        <Badge variant="outline" className="text-[10px] font-mono">
          xG {result.homeXG.toFixed(2)}-{result.awayXG.toFixed(2)}
        </Badge>
      </div>
      {best ? (
        <div className="rounded-md bg-background/50 border border-border/60 px-2.5 py-2 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="font-bold text-foreground">{best.selection}</span>
            <Badge className={best.tipsterTier === 'tipster_premium' ? 'bg-accent/20 text-accent border-accent/40' : 'bg-muted text-muted-foreground'}>
              {best.tipsterTier === 'tipster_premium' ? 'PREMIUM' : 'TIPSTER'}
            </Badge>
          </div>
          <div className="grid grid-cols-4 gap-1 text-[10px] font-mono">
            <div><span className="text-muted-foreground">WR</span> {best.winRate.toFixed(0)}%</div>
            <div><span className="text-muted-foreground">Cota</span> {best.odds.toFixed(2)}</div>
            <div><span className="text-muted-foreground">Val</span> {best.value > 0 ? '+' : ''}{best.value.toFixed(1)}%</div>
            <div><span className="text-muted-foreground">Kelly</span> {best.kellyPercent.toFixed(1)}%</div>
          </div>
          <div className="text-[10px] text-muted-foreground">
            Stake Kelly: <span className="font-mono font-bold text-foreground">{best.stakeLei.toFixed(2)} LEI</span> · risc {best.risk} · conf {best.confidence}
          </div>
        </div>
      ) : (
        <div className="text-muted-foreground">Niciun pick generat.</div>
      )}
      {premium.length > 0 && (
        <div className="text-[10px] text-muted-foreground">
          {premium.length} pick(uri) Premium (WR ≥ 76%) · 1X2 model {(result.homeWinProb * 100).toFixed(0)}/{(result.drawProb * 100).toFixed(0)}/{(result.awayWinProb * 100).toFixed(0)}
        </div>
      )}
    </Card>
  );
}