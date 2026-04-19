import type { DailyMatch, BetRecommendation } from '@/lib/types';
import { Button } from '@/components/ui/button';

function pct(n: number): string {
  return (n * 100).toFixed(1) + '%';
}

interface Props {
  matches: DailyMatch[];
  onClear: () => void;
}

export function DailyTop({ matches, onClear }: Props) {
  if (matches.length === 0) return null;

  // Collect best bet from each match, sorted by WR
  const topBets: { bet: BetRecommendation; matchLabel: string; league: string }[] = [];
  for (const dm of matches) {
    const label = `${dm.match.homeTeam.name} vs ${dm.match.awayTeam.name}`;
    if (dm.result.bestBet) {
      topBets.push({ bet: dm.result.bestBet, matchLabel: label, league: dm.match.league });
    }
  }

  topBets.sort((a, b) => b.bet.winRate - a.bet.winRate);

  const categoryIcon = (cat: string) => {
    switch (cat) {
      case 'corners': return '⛳';
      case 'winner': return '🏆';
      case 'goals': return '⚽';
      default: return '📊';
    }
  };

  const catLabel = (cat: string) => {
    switch (cat) {
      case 'corners': return 'Cornere';
      case 'winner': return '1X2';
      case 'goals': return 'Goluri';
      default: return cat;
    }
  };

  return (
    <div className="rounded-xl border-2 border-accent/30 bg-card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-accent flex items-center gap-2">
          🏅 Top of the Day
          <span className="text-xs font-normal text-muted-foreground">({matches.length} meciuri)</span>
        </h2>
        <Button variant="ghost" size="sm" onClick={onClear} className="text-xs text-muted-foreground">
          🗑️ Reset
        </Button>
      </div>

      {topBets.length > 0 ? (
        <div className="space-y-2">
          {topBets.map((item, i) => (
            <div key={i} className={`flex items-center gap-3 rounded-lg p-4 text-sm ${i === 0 ? 'bg-amber-500/10 border-2 border-amber-500/30' : i < 3 ? 'bg-primary/5 border border-primary/20' : 'bg-secondary/50'}`}>
              <span className={`text-xl font-bold w-8 text-center ${i === 0 ? 'text-amber-400' : i < 3 ? 'text-primary' : 'text-muted-foreground'}`}>
                #{i + 1}
              </span>
              <span className="text-xl">{categoryIcon(item.bet.category)}</span>
              <div className="flex-1 min-w-0">
                <div className="font-bold truncate">{item.bet.selection}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {item.matchLabel}
                  {item.league && <span className="ml-1">• {item.league}</span>}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  Piață: {catLabel(item.bet.category)}
                </div>
              </div>
              <div className="text-right space-y-1">
                <div className={`text-lg font-bold font-mono ${item.bet.winRate >= 76 ? 'text-primary' : 'text-accent'}`}>
                  {item.bet.winRate.toFixed(1)}%
                </div>
                <div className="text-[10px] text-muted-foreground">Win Rate</div>
              </div>
              <div className="text-right font-mono text-xs space-y-0.5 min-w-[80px]">
                <div>Cotă: <span className="font-bold">{item.bet.odds.toFixed(2)}</span></div>
                <div>Value: <span className={item.bet.value > 0 ? 'text-primary' : 'text-destructive'}>
                  {item.bet.value > 0 ? '+' : ''}{item.bet.value.toFixed(1)}%
                </span></div>
                <div>Stake: <span className="text-accent">{item.bet.kellyPercent.toFixed(2)}%</span></div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground text-center">Niciun pariu cu value detectat.</p>
      )}
    </div>
  );
}
