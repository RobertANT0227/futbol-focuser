import type { AnalysisResult } from '@/lib/types';
import { BetCard } from './BetCard';

function pct(n: number): string {
  return (n * 100).toFixed(1) + '%';
}

function StyleBadge({ style }: { style: string }) {
  const labels: Record<string, { icon: string; label: string; color: string }> = {
    'bus-parking': { icon: '🚌', label: 'BUS PARKING', color: 'bg-destructive/20 text-destructive' },
    'high-press': { icon: '⚡', label: 'HIGH PRESS', color: 'bg-primary/20 text-primary' },
    'pressing': { icon: '🔥', label: 'PRESSING', color: 'bg-accent/20 text-accent' },
    'possession': { icon: '🎯', label: 'POSESIE', color: 'bg-bet-corners/20 text-bet-corners' },
    'counter': { icon: '⚡', label: 'CONTRAATAC', color: 'bg-bet-value/20 text-bet-value' },
    'low-block': { icon: '🛡️', label: 'LOW-BLOCK', color: 'bg-muted text-muted-foreground' },
  };
  const s = labels[style] || { icon: '📊', label: style, color: 'bg-secondary text-muted-foreground' };
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded ${s.color}`}>
      {s.icon} {s.label}
    </span>
  );
}

interface Props {
  result: AnalysisResult;
  homeTeamName: string;
  awayTeamName: string;
}

export function VerdictDisplay({ result, homeTeamName, awayTeamName }: Props) {
  // Sort by EV desc (then WR) — only positive-value bets become "Top Bets"
  const valueBets = result.recommendations
    .filter((r) => r.value > 0)
    .sort((a, b) => b.ev - a.ev || b.winRate - a.winRate);
  const otherBets = result.recommendations.filter((r) => r.value <= 0);
  const matchLabel = `${homeTeamName} vs ${awayTeamName}`;

  return (
    <div className="space-y-6">
      {/* Summary header */}
      <div className="gradient-verdict rounded-xl p-6 border border-border">
        <h2 className="text-xl font-bold text-gradient-primary mb-4">📊 {matchLabel}</h2>
        
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="text-center">
            <div className="text-2xl font-bold font-mono text-primary">{pct(result.homeWinProb)}</div>
            <div className="text-xs text-muted-foreground">Gazdă</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold font-mono text-muted-foreground">{pct(result.drawProb)}</div>
            <div className="text-xs text-muted-foreground">Egal</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold font-mono text-destructive">{pct(result.awayWinProb)}</div>
            <div className="text-xs text-muted-foreground">Oaspete</div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs font-mono">
          <div className="bg-secondary/50 rounded p-2">
            <div className="text-muted-foreground">xG Gazdă</div>
            <div className="text-lg font-bold">{result.homeXG.toFixed(2)}</div>
          </div>
          <div className="bg-secondary/50 rounded p-2">
            <div className="text-muted-foreground">xG Oaspete</div>
            <div className="text-lg font-bold">{result.awayXG.toFixed(2)}</div>
          </div>
          <div className="bg-secondary/50 rounded p-2">
            <div className="text-muted-foreground">Over 2.5</div>
            <div className="text-lg font-bold text-bet-goals">{pct(result.over25Prob)}</div>
          </div>
          <div className="bg-secondary/50 rounded p-2">
            <div className="text-muted-foreground">BTTS</div>
            <div className="text-lg font-bold text-bet-goals">{pct(result.bttsProb)}</div>
          </div>
          <div className="bg-secondary/50 rounded p-2">
            <div className="text-muted-foreground">Cornere</div>
            <div className="text-lg font-bold text-bet-corners">{result.expectedCorners.toFixed(1)}</div>
          </div>
        </div>
      </div>

      {/* Play Style Detection */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">🏠 {homeTeamName}</h3>
            <StyleBadge style={result.detectedStyles.home} />
          </div>
          <p className="text-xs text-secondary-foreground leading-relaxed">{result.styleAnalysis.split('. ').filter(s => s.includes(homeTeamName)).join('. ')}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">✈️ {awayTeamName}</h3>
            <StyleBadge style={result.detectedStyles.away} />
          </div>
          <p className="text-xs text-secondary-foreground leading-relaxed">{result.styleAnalysis.split('. ').filter(s => s.includes(awayTeamName)).join('. ')}</p>
        </div>
      </div>

      {/* Motivation */}
      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2">💪 Motivare & Context</h3>
        <p className="text-xs text-secondary-foreground leading-relaxed">{result.motivationAnalysis}</p>
      </div>

      {/* TOP BETS — trader-style cards */}
      {valueBets.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              🔥 Top Bets <span className="text-xs font-normal text-muted-foreground">(sortat după EV)</span>
            </h2>
            <span className="text-[10px] font-mono text-muted-foreground">{valueBets.length} selecții</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {valueBets.map((bet, i) => (
              <BetCard key={`top-${i}`} bet={bet} matchLabel={matchLabel} rank={i + 1} />
            ))}
          </div>

          {/* AI explanation for top pick only */}
          {valueBets[0] && (
            <div className="rounded-lg border border-border bg-secondary/30 p-3 mt-4">
              <div className="flex items-start gap-2">
                <span className="text-sm mt-0.5">🤖</span>
                <div className="text-xs text-secondary-foreground leading-relaxed">
                  <strong className="text-foreground">Top pick — {valueBets[0].selection}:</strong>{' '}
                  {valueBets[0].aiExplanation}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Other bets — compact list */}
      {otherBets.length > 0 && (
        <details className="rounded-lg border border-border bg-card/40 p-3">
          <summary className="text-xs font-semibold uppercase tracking-wider text-muted-foreground cursor-pointer">
            📋 Alte selecții analizate ({otherBets.length})
          </summary>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-3">
            {otherBets.map((bet, i) => (
              <BetCard key={`other-${i}`} bet={bet} compact />
            ))}
          </div>
        </details>
      )}

      {result.recommendations.length === 0 && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-center">
          <p className="text-sm text-destructive">⚠️ Niciun pariu cu value detectat. Ajustează parametrii sau verifică datele.</p>
        </div>
      )}
    </div>
  );
}
