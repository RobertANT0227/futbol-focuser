import type { DailyMatch, BetRecommendation } from '@/lib/types';
import { Button } from '@/components/ui/button';

function pct(n: number): string {
  return (n * 100).toFixed(1) + '%';
}

function GoldenStars({ count }: { count: number }) {
  const stars = Math.min(count, 5);
  return (
    <span className="text-amber-400 text-sm">
      {'⭐'.repeat(stars)}
    </span>
  );
}

interface Props {
  matches: DailyMatch[];
  onClear: () => void;
}

export function DailyTop({ matches, onClear }: Props) {
  if (matches.length === 0) return null;

  const allBets: { bet: BetRecommendation; matchLabel: string }[] = [];
  for (const dm of matches) {
    const label = `${dm.match.homeTeam.name} vs ${dm.match.awayTeam.name}`;
    for (const bet of dm.result.recommendations) {
      allBets.push({ bet, matchLabel: label });
    }
  }

  // Sort: premium first, then by value * stability
  allBets.sort((a, b) => {
    if (a.bet.tipsterTier !== b.bet.tipsterTier) {
      return a.bet.tipsterTier === 'tipster_premium' ? -1 : 1;
    }
    return (b.bet.value * b.bet.stability) - (a.bet.value * a.bet.stability);
  });

  const topBets = allBets.filter(b => b.bet.value > 0).slice(0, 10);

  const categoryIcon = (cat: string) => {
    switch (cat) {
      case 'corners': return '⛳';
      case 'winner': return '🏆';
      case 'goals': return '⚽';
      default: return '📊';
    }
  };

  const riskLabel = (risk: string) => {
    switch (risk) {
      case 'low': return '🟢 Scăzut';
      case 'medium': return '🟡 Mediu';
      case 'high': return '🔴 Ridicat';
      default: return risk;
    }
  };

  // Calculate stars for top 3 premium: 5, 4, 3
  const starsForIndex = (i: number, tier: string): number => {
    if (tier !== 'tipster_premium') return 0;
    if (i === 0) return 5;
    if (i === 1) return 4;
    if (i === 2) return 3;
    return 0;
  };

  return (
    <div className="rounded-xl border-2 border-accent/30 bg-card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-accent flex items-center gap-2">
          🏅 TOP Pariuri Ziua de Azi
          <span className="text-xs font-normal text-muted-foreground">({matches.length} meciuri analizate)</span>
        </h2>
        <Button variant="ghost" size="sm" onClick={onClear} className="text-xs text-muted-foreground">
          🗑️ Resetează topul
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {matches.map(dm => (
          <span key={dm.id} className="bg-secondary text-xs px-3 py-1 rounded-full font-mono">
            {dm.match.homeTeam.name} vs {dm.match.awayTeam.name}
            {dm.match.league && <span className="text-muted-foreground ml-1">({dm.match.league})</span>}
          </span>
        ))}
      </div>

      {topBets.length > 0 ? (
        <div className="space-y-2">
          {topBets.map((item, i) => {
            const stars = starsForIndex(i, item.bet.tipsterTier);
            return (
              <div key={i} className={`flex items-center gap-3 rounded-lg p-3 text-sm ${item.bet.tipsterTier === 'tipster_premium' && i < 3 ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-secondary/50'}`}>
                <span className="text-lg font-bold text-muted-foreground w-6 text-center">#{i + 1}</span>
                <span className="text-base">{categoryIcon(item.bet.category)}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate flex items-center gap-2">
                    {item.bet.selection}
                    {stars > 0 && <GoldenStars count={stars} />}
                    {item.bet.tipsterTier === 'tipster_premium' && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400">PREMIUM</span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">{item.matchLabel}</div>
                </div>
                <div className="text-right font-mono text-xs space-y-0.5">
                  <div>Cotă: <span className="text-foreground font-semibold">{item.bet.odds.toFixed(2)}</span></div>
                  <div>Value: <span className={item.bet.value > 0 ? 'text-primary' : 'text-destructive'}>+{item.bet.value.toFixed(1)}%</span></div>
                </div>
                <div className="text-right text-xs space-y-0.5">
                  <div>Model: <span className="text-primary">{pct(item.bet.modelProbability)}</span></div>
                  <div>{riskLabel(item.bet.risk)}</div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground text-center">Niciun pariu cu value pozitiv detectat din meciurile analizate.</p>
      )}
    </div>
  );
}
