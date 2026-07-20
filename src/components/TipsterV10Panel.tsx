import type { TipsterV10Report } from '@/lib/tipsterV10';

interface Props {
  report: TipsterV10Report;
  matchLabel: string;
}

const bandColor = {
  excellent: 'text-primary border-primary/40 bg-primary/10',
  good: 'text-accent border-accent/40 bg-accent/10',
  ok: 'text-muted-foreground border-border bg-secondary/40',
  weak: 'text-destructive border-destructive/40 bg-destructive/10',
} as const;

const classColor: Record<TipsterV10Report['classification'], string> = {
  'Elite Pick': 'from-primary/30 via-accent/20 to-primary/30 border-primary',
  'Premium A+': 'from-primary/25 to-accent/15 border-primary/70',
  'Premium A': 'from-primary/20 to-accent/10 border-primary/60',
  'Premium B+': 'from-accent/20 to-primary/10 border-accent/60',
  'Premium B': 'from-accent/15 to-transparent border-accent/50',
  'PAS': 'from-destructive/20 to-transparent border-destructive/50',
};

export function TipsterV10Panel({ report, matchLabel }: Props) {
  const isPick = report.verdict === 'PICK';
  return (
    <div className={`rounded-xl border-2 bg-gradient-to-br p-5 ${classColor[report.classification]}`}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Tipster Premium V10</div>
          <h3 className="text-lg font-bold">{matchLabel}</h3>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase text-muted-foreground">Clasificare</div>
          <div className="text-lg font-black">{report.classification}</div>
          <div className="text-xs font-mono">PCS {report.pcs.toFixed(0)}/100</div>
        </div>
      </div>

      {/* Verdict */}
      <div className={`rounded-lg border-2 p-4 mb-4 ${isPick ? 'border-primary bg-primary/10' : 'border-destructive bg-destructive/10'}`}>
        {isPick && report.finalPick ? (
          <>
            <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">🏆 Pronostic Final</div>
            <div className="flex items-baseline gap-3 flex-wrap">
              <div className="text-2xl font-black text-primary">{report.finalPick.selection}</div>
              <div className="text-sm font-mono text-muted-foreground">
                P {(report.finalPick.probability * 100).toFixed(1)}%
                {report.finalPick.odds ? ` · @ ${report.finalPick.odds.toFixed(2)}` : ''}
              </div>
            </div>
            <p className="text-xs text-secondary-foreground mt-2">{report.finalPick.reason}</p>
          </>
        ) : (
          <>
            <div className="text-lg font-black text-destructive">🚫 PAS</div>
            <p className="text-xs text-secondary-foreground mt-1">{report.summary}</p>
          </>
        )}
      </div>

      {/* Indicators grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-4">
        {report.indicators.map((ind) => (
          <div key={ind.key} className={`rounded border p-2 ${bandColor[ind.band]}`}>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider">{ind.label}</span>
              <span className="font-mono text-sm font-bold">{ind.score.toFixed(0)}</span>
            </div>
            <p className="text-[10px] leading-tight mt-1 opacity-80">{ind.note}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="rounded-lg border border-border bg-card/60 p-3 mb-3">
        <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Filtre Tipster Premium</div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5 text-xs">
          {report.filtersPassed.map((f) => (
            <div key={f.name} className="flex items-center gap-1.5">
              <span className={f.ok ? 'text-primary' : 'text-destructive'}>{f.ok ? '✓' : '✗'}</span>
              <span className="text-secondary-foreground">{f.name}</span>
              <span className="font-mono text-muted-foreground ml-auto">{f.detail}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Top scores */}
      {report.topScores.length > 0 && (
        <div className="rounded-lg border border-border bg-card/60 p-3">
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Top 5 scoruri (Poisson × MC)</div>
          <div className="flex flex-wrap gap-2">
            {report.topScores.map((s) => (
              <div key={s.score} className="rounded border border-border bg-secondary/40 px-2 py-1 text-xs font-mono">
                <span className="font-bold">{s.score}</span>
                <span className="text-muted-foreground ml-2">{(s.prob * 100).toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}