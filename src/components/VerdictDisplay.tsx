import type { AnalysisResult, BetRecommendation } from '@/lib/types';

function pct(n: number): string {
  return (n * 100).toFixed(1) + '%';
}

function ConfidenceBadge({ confidence }: { confidence: string }) {
  const colors = {
    high: 'bg-primary/20 text-primary',
    medium: 'bg-accent/20 text-accent',
    low: 'bg-destructive/20 text-destructive',
  };
  return (
    <span className={`text-xs font-mono px-2 py-0.5 rounded ${colors[confidence as keyof typeof colors] || ''}`}>
      {confidence === 'high' ? '🟢 ÎNALT' : confidence === 'medium' ? '🟡 MEDIU' : '🔴 SCĂZUT'}
    </span>
  );
}

function CategoryIcon({ category }: { category: string }) {
  switch (category) {
    case 'corners': return <span className="text-bet-corners">⛳</span>;
    case 'winner': return <span className="text-bet-winner">🏆</span>;
    case 'goals': return <span className="text-bet-goals">⚽</span>;
    default: return null;
  }
}

function BetCard({ bet }: { bet: BetRecommendation }) {
  const borderColor = bet.category === 'corners' ? 'border-bet-corners/30' : bet.category === 'winner' ? 'border-bet-winner/30' : 'border-bet-goals/30';
  const glowClass = bet.category === 'corners' ? 'glow-blue' : bet.category === 'winner' ? 'glow-green' : 'glow-amber';

  return (
    <div className={`rounded-lg border ${borderColor} bg-card p-4 ${bet.value > 10 ? glowClass : ''} animate-slide-up`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <CategoryIcon category={bet.category} />
          <span className="font-semibold text-sm">{bet.selection}</span>
        </div>
        <ConfidenceBadge confidence={bet.confidence} />
      </div>
      
      <div className="grid grid-cols-2 gap-2 text-xs font-mono">
        <div>
          <span className="text-muted-foreground">Model:</span>
          <span className="ml-1 text-foreground">{pct(bet.modelProbability)}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Bookmaker:</span>
          <span className="ml-1 text-foreground">{pct(bet.bookmakerProbability)}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Value:</span>
          <span className={`ml-1 ${bet.value > 0 ? 'text-primary' : 'text-destructive'}`}>{bet.value > 0 ? '+' : ''}{bet.value.toFixed(1)}%</span>
        </div>
        <div>
          <span className="text-muted-foreground">Cotă:</span>
          <span className="ml-1 text-foreground">{bet.odds.toFixed(2)}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Kelly Stake:</span>
          <span className="ml-1 text-accent">{bet.kellyStake.toFixed(1)}€</span>
        </div>
        <div>
          <span className="text-muted-foreground">Risc:</span>
          <span className={`ml-1 ${bet.risk === 'low' ? 'text-primary' : bet.risk === 'medium' ? 'text-accent' : 'text-destructive'}`}>
            {bet.risk === 'low' ? 'Scăzut' : bet.risk === 'medium' ? 'Mediu' : 'Ridicat'}
          </span>
        </div>
      </div>
    </div>
  );
}

interface Props {
  result: AnalysisResult;
  homeTeamName: string;
  awayTeamName: string;
}

export function VerdictDisplay({ result, homeTeamName, awayTeamName }: Props) {
  const cornersBets = result.recommendations.filter(r => r.category === 'corners');
  const winnerBets = result.recommendations.filter(r => r.category === 'winner');
  const goalsBets = result.recommendations.filter(r => r.category === 'goals');

  // Determine best verdict for each
  const bestCorner = cornersBets.length > 0 ? cornersBets[0] : null;
  const bestWinner = winnerBets.length > 0 ? winnerBets[0] : null;
  const bestGoal = goalsBets.length > 0 ? goalsBets[0] : null;

  return (
    <div className="space-y-6">
      {/* Summary header */}
      <div className="gradient-verdict rounded-xl p-6 border border-border">
        <h2 className="text-xl font-bold text-gradient-primary mb-4">📊 Analiză completă: {homeTeamName} vs {awayTeamName}</h2>
        
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

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs font-mono">
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
        </div>
      </div>

      {/* Monte Carlo */}
      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">🎲 Simulare Monte Carlo (10.000)</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs font-mono">
          <div>Media goluri gazdă: <span className="text-primary">{result.monteCarloResults.avgHomeGoals.toFixed(2)}</span></div>
          <div>Media goluri oaspete: <span className="text-primary">{result.monteCarloResults.avgAwayGoals.toFixed(2)}</span></div>
          <div>Media cornere: <span className="text-bet-corners">{result.monteCarloResults.avgCorners.toFixed(1)}</span></div>
          <div>Over 2.5: <span className="text-bet-goals">{pct(result.monteCarloResults.over25Pct)}</span></div>
        </div>
        <div className="mt-3">
          <div className="text-xs text-muted-foreground mb-1">Top scoruri probabile:</div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(result.monteCarloResults.scoreDistribution).slice(0, 6).map(([score, prob]) => (
              <span key={score} className="bg-secondary px-2 py-1 rounded text-xs font-mono">
                {score} <span className="text-muted-foreground">({(prob * 100).toFixed(1)}%)</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Style & Motivation */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2">🎯 Analiză stil</h3>
          <p className="text-xs text-secondary-foreground leading-relaxed">{result.styleAnalysis}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2">💪 Motivare</h3>
          <p className="text-xs text-secondary-foreground leading-relaxed">{result.motivationAnalysis}</p>
        </div>
      </div>

      {/* VERDICT FINAL */}
      <div className="rounded-xl border-2 border-primary/30 bg-card p-6 glow-green">
        <h2 className="text-lg font-bold text-primary mb-4">🎯 VERDICT FINAL</h2>
        
        <div className="space-y-4">
          {/* Corners */}
          <div className="border-l-4 border-bet-corners pl-4">
            <h4 className="text-sm font-semibold text-bet-corners mb-1">⛳ CORNERE</h4>
            {bestCorner ? (
              <div className="text-sm">
                <span className="font-bold">{bestCorner.selection}</span>
                <span className="text-muted-foreground ml-2">@ {bestCorner.odds.toFixed(2)}</span>
                <span className={`ml-2 text-xs ${bestCorner.value > 0 ? 'text-primary' : 'text-destructive'}`}>
                  (value: {bestCorner.value > 0 ? '+' : ''}{bestCorner.value.toFixed(1)}%)
                </span>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">Cornere estimate: {result.expectedCorners.toFixed(1)} — nicio valoare detectată sau linie nedisponibilă</div>
            )}
          </div>

          {/* Winner */}
          <div className="border-l-4 border-bet-winner pl-4">
            <h4 className="text-sm font-semibold text-bet-winner mb-1">🏆 SOLIST</h4>
            {bestWinner ? (
              <div className="text-sm">
                <span className="font-bold">{bestWinner.selection}</span>
                <span className="text-muted-foreground ml-2">@ {bestWinner.odds.toFixed(2)}</span>
                <span className={`ml-2 text-xs ${bestWinner.value > 0 ? 'text-primary' : 'text-destructive'}`}>
                  (value: {bestWinner.value > 0 ? '+' : ''}{bestWinner.value.toFixed(1)}%)
                </span>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">Niciun solist cu value detectat</div>
            )}
          </div>

          {/* Goals */}
          <div className="border-l-4 border-bet-goals pl-4">
            <h4 className="text-sm font-semibold text-bet-goals mb-1">⚽ GOLURI</h4>
            {bestGoal ? (
              <div className="text-sm">
                <span className="font-bold">{bestGoal.selection}</span>
                <span className="text-muted-foreground ml-2">@ {bestGoal.odds.toFixed(2)}</span>
                <span className={`ml-2 text-xs ${bestGoal.value > 0 ? 'text-primary' : 'text-destructive'}`}>
                  (value: {bestGoal.value > 0 ? '+' : ''}{bestGoal.value.toFixed(1)}%)
                </span>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">Nicio valoare detectată pe goluri</div>
            )}
          </div>
        </div>
      </div>

      {/* All recommendations */}
      {result.recommendations.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">📋 Toate pariurile cu value</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {result.recommendations.map((bet, i) => (
              <BetCard key={i} bet={bet} />
            ))}
          </div>
        </div>
      )}

      {result.recommendations.length === 0 && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-center">
          <p className="text-sm text-destructive">⚠️ Niciun pariu cu value nu a fost detectat conform planului tău. Ajustează parametrii sau verifică datele introduse.</p>
        </div>
      )}
    </div>
  );
}
