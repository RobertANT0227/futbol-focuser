import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { PickBadge } from '@/components/cento/PickBadge';
import { QualityChip } from '@/components/cento/QualityChip';
import { RatingBar } from '@/components/cento/RatingBar';
import { MatchAnalysisDialog } from '@/components/cento/MatchAnalysisDialog';
import { ContextFlagChip } from './ContextFlagChip';
import { Link } from 'react-router-dom';
import { Wallet, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PowerAnalysis2 } from '@/lib/engine2/types';

const GRADE_GLOW: Record<string, string> = {
  STRONG: 'border-primary/60 shadow-[0_0_30px_-8px_hsl(var(--primary)/0.45)]',
  MEDIUM: 'border-[hsl(var(--bet-value))/0.55] shadow-[0_0_24px_-10px_hsl(var(--bet-value)/0.45)]',
  RISKY:  'border-accent/55 shadow-[0_0_24px_-10px_hsl(var(--accent)/0.4)]',
  PASS:   'border-border/50',
};

function fmtPct(n: number) { return `${(n * 100).toFixed(0)}%`; }
function fmtDate(d: string | null) { return d ? new Date(d).toLocaleDateString('ro-RO', { day: '2-digit', month: 'short' }) : 'TBD'; }

export function PowerMatchCard2({ a, leagueName }: { a: PowerAnalysis2; leagueName?: string }) {
  const { match, ratingsHome: rh, ratingsAway: ra, topMarket, confidence, grade, stakeUnits, quality, expectedGoalsHome, expectedGoalsAway, reasoning, contextFlags } = a;
  const isPass = grade === 'PASS';

  return (
    <Card className={cn(
      'p-5 space-y-4 bg-gradient-to-b from-card/90 to-card/40 border backdrop-blur-sm transition-all hover:translate-y-[-1px]',
      GRADE_GLOW[grade],
    )}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-mono">
            <span>{leagueName ?? 'Liga'}</span>
            <span className="opacity-50">·</span>
            <span>{fmtDate(match.date)}</span>
          </div>
          <h3 className="text-lg font-bold leading-tight tracking-tight">
            {match.home} <span className="text-muted-foreground/70 font-normal text-sm font-mono">vs</span> {match.away}
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <QualityChip quality={quality} />
          <PickBadge grade={grade} />
        </div>
      </div>

      {/* Best Pick row */}
      <div className={cn(
        'rounded-lg border p-3 flex items-center justify-between gap-3 flex-wrap',
        isPass ? 'border-border/50 bg-muted/20' : 'border-primary/30 bg-primary/5',
      )}>
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-mono">Best Pick</div>
          <div className="text-base font-bold truncate">
            {isPass ? '⛔ PASS — fără recomandare' : topMarket.label}
            {!isPass && (
              <span className="ml-2 font-mono text-primary">{fmtPct(topMarket.prob)}</span>
            )}
          </div>
          {!isPass && topMarket.odds && (
            <div className="text-[11px] text-muted-foreground font-mono">cotă {topMarket.odds.toFixed(2)}</div>
          )}
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-mono">Confidence</div>
          <div className="text-2xl font-mono font-bold">{confidence}</div>
          <div className="text-[10px] font-bold text-accent font-mono">{stakeUnits}U</div>
        </div>
      </div>

      {/* Confidence bar */}
      <div className="space-y-1">
        <Progress value={confidence} className="h-1.5" />
        <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono">
          <span>xG {expectedGoalsHome.toFixed(2)} – {expectedGoalsAway.toFixed(2)}</span>
          <span>{confidence}/100</span>
        </div>
      </div>

      {/* Rating compare */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <div className="text-[10px] font-bold uppercase tracking-widest text-primary">{match.home}</div>
          <RatingBar label="Atac" value={rh.attack} accent="attack" />
          <RatingBar label="Apărare" value={rh.defense} accent="defense" />
          <RatingBar label="Formă" value={rh.form} />
        </div>
        <div className="space-y-1.5">
          <div className="text-[10px] font-bold uppercase tracking-widest text-destructive">{match.away}</div>
          <RatingBar label="Atac" value={ra.attack} accent="attack" />
          <RatingBar label="Apărare" value={ra.defense} accent="defense" />
          <RatingBar label="Formă" value={ra.form} />
        </div>
      </div>

      {/* Reasoning */}
      <div className="space-y-2">
        {reasoning.boosters.length > 0 && (
          <div className="rounded-md border border-primary/20 bg-primary/5 p-2">
            <div className="text-[10px] font-bold uppercase tracking-widest text-primary mb-1">Boosters</div>
            <ul className="text-[11px] space-y-0.5 text-foreground/90">
              {reasoning.boosters.map((b, i) => <li key={i} className="flex gap-1.5"><span className="text-primary">✓</span>{b}</li>)}
            </ul>
          </div>
        )}
        {reasoning.reducers.length > 0 && (
          <div className="rounded-md border border-accent/20 bg-accent/5 p-2">
            <div className="text-[10px] font-bold uppercase tracking-widest text-accent mb-1">Reducers</div>
            <ul className="text-[11px] space-y-0.5 text-foreground/90">
              {reasoning.reducers.map((r, i) => <li key={i} className="flex gap-1.5"><span className="text-accent">·</span>{r}</li>)}
            </ul>
          </div>
        )}
        {reasoning.riskFactors.length > 0 && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2">
            <div className="text-[10px] font-bold uppercase tracking-widest text-destructive mb-1">Risk factors</div>
            <ul className="text-[11px] space-y-0.5 text-foreground/90">
              {reasoning.riskFactors.map((r, i) => <li key={i} className="flex gap-1.5"><span className="text-destructive">⚠</span>{r}</li>)}
            </ul>
          </div>
        )}
        <p className="text-[11px] italic text-muted-foreground border-l-2 border-primary/30 pl-2">{reasoning.summary}</p>
      </div>

      {/* Context flags */}
      {contextFlags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {contextFlags.map((f) => <ContextFlagChip key={f} flag={f} />)}
        </div>
      )}

      {/* Footer actions */}
      <div className="flex items-center justify-between gap-2 flex-wrap pt-2 border-t border-border/40">
        <MatchAnalysisDialog a={a} leagueName={leagueName}>
          <button type="button" className="inline-flex items-center gap-1 text-[11px] font-mono uppercase tracking-wider text-muted-foreground hover:text-primary transition">
            Expand <ChevronRight className="h-3 w-3" />
          </button>
        </MatchAnalysisDialog>
        {!isPass && (
          <Link
            to={`/bankroll?pick=${encodeURIComponent(`${match.home} vs ${match.away}`)}&sel=${encodeURIComponent(topMarket.label)}&prob=${topMarket.prob.toFixed(4)}${topMarket.odds ? `&odds=${topMarket.odds.toFixed(2)}` : ''}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-primary/40 bg-primary/10 hover:bg-primary/20 text-primary text-[11px] font-bold uppercase tracking-wider transition"
          >
            <Wallet className="h-3 w-3" /> Add to Bankroll
          </Link>
        )}
      </div>
    </Card>
  );
}