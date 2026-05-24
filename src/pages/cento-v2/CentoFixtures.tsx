// CENTO-V2
import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { CentoHeader } from '@/components/cento-v2/CentoHeader';
import { CentoEmpty } from '@/components/cento-v2/CentoEmpty';
import { PickBadge } from '@/components/cento-v2/PickBadge';
import { useCentoData } from '@/lib/cento-v2/useCentoData';
import { useSelectedDate, toLocalISO } from '@/lib/cento-v2/useSelectedDate';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

function fmt(d: string | null) {
  if (!d) return 'TBD';
  return new Date(d + 'T00:00:00').toLocaleDateString('ro-RO', { weekday: 'short', day: '2-digit', month: 'short' });
}

function nearest(target: string, available: string[]): string | null {
  if (!available.length) return null;
  const t = new Date(target + 'T00:00:00').getTime();
  let best = available[0];
  let bestDiff = Math.abs(new Date(best + 'T00:00:00').getTime() - t);
  for (const d of available) {
    const diff = Math.abs(new Date(d + 'T00:00:00').getTime() - t);
    if (diff < bestDiff) { best = d; bestDiff = diff; }
  }
  return best;
}

export default function CentoFixtures() {
  const { leagues, activeLeagueId, setActiveLeagueId, analyses, availableDates, loading, reload } = useCentoData();
  const [selectedDate, setSelectedDate] = useSelectedDate(availableDates);

  const dateSet = useMemo(() => new Set(availableDates), [availableDates]);
  const dateModifiers = useMemo(() => ({
    hasMatches: availableDates.map((d) => new Date(d + 'T00:00:00')),
  }), [availableDates]);

  const filtered = useMemo(() => {
    const list = selectedDate ? analyses.filter((r) => r.analysis.matchDate === selectedDate) : analyses;
    return [...list].sort((a, b) => b.analysis.topPick.confidence - a.analysis.topPick.confidence);
  }, [analyses, selectedDate]);

  const today = toLocalISO(new Date());
  const todayHasMatches = dateSet.has(today);
  const suggestion = !filtered.length && selectedDate ? nearest(selectedDate, availableDates) : null;

  return (
    <div className="container max-w-5xl mx-auto px-4 py-6 space-y-5">
      <CentoHeader title="Fixtures" leagues={leagues} activeLeagueId={activeLeagueId} setActiveLeagueId={setActiveLeagueId} onSynced={reload} />
      {leagues.length === 0 ? (
        <CentoEmpty message="Niciun meci. Importă datele." />
      ) : loading ? (
        <CentoEmpty message="Se încarcă..." />
      ) : availableDates.length === 0 ? (
        <CentoEmpty message="Nici un meci viitor în CSV." />
      ) : (
        <>
          <Card className="p-3 sm:p-4 bg-card/60 flex flex-col lg:flex-row gap-4">
            <div className="lg:w-auto">
              <Calendar
                mode="single"
                selected={selectedDate ? new Date(selectedDate + 'T00:00:00') : undefined}
                onSelect={(d) => d && setSelectedDate(toLocalISO(d))}
                modifiers={dateModifiers}
                modifiersClassNames={{ hasMatches: 'relative after:content-[""] after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:h-1 after:w-1 after:rounded-full after:bg-primary' }}
                disabled={(d) => !dateSet.has(toLocalISO(d))}
                defaultMonth={selectedDate ? new Date(selectedDate + 'T00:00:00') : undefined}
                className={cn('p-3 pointer-events-auto')}
              />
            </div>
            <div className="flex-1 flex flex-col justify-between gap-3">
              <div className="space-y-1">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Sumar import</div>
                <div className="text-sm font-mono">
                  Meciuri disponibile: <span className="font-bold text-primary">{analyses.length}</span>
                  <span className="text-muted-foreground"> · </span>
                  Zile cu meciuri: <span className="font-bold text-primary">{availableDates.length}</span>
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Ziua selectată: <span className="font-mono text-foreground">{selectedDate ? fmt(selectedDate) : '—'}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  size="sm" variant="outline" className="h-8 text-xs"
                  onClick={() => setSelectedDate(todayHasMatches ? today : availableDates[0])}
                >
                  Azi
                </Button>
                {!todayHasMatches && (
                  <span className="text-[10px] text-muted-foreground">Azi nu există meciuri — sărit la prima zi disponibilă.</span>
                )}
              </div>
            </div>
          </Card>

          <div className="text-[11px] uppercase tracking-widest text-muted-foreground">
            Meciuri pentru {selectedDate ? fmt(selectedDate) : '—'}
          </div>

          {filtered.length === 0 ? (
            <CentoEmpty
              message={`Nu există meciuri analizate pentru această dată.${suggestion ? ` Cea mai apropiată zi cu meciuri: ${fmt(suggestion)}.` : ''}`}
            />
          ) : (
            <Card className="divide-y divide-border/40 bg-card/60">
              {filtered.map((r) => (
                <Link
                  key={r.analysis.matchId}
                  to={`/cento-power/analysis?m=${r.analysis.matchId}`}
                  className="flex items-center justify-between gap-3 p-3 hover:bg-secondary/30 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{fmt(r.analysis.matchDate)}</div>
                    <div className="text-sm font-semibold truncate">
                      {r.analysis.home} <span className="text-muted-foreground font-normal">vs</span> {r.analysis.away}
                    </div>
                    <div className="text-[10px] font-mono text-muted-foreground">{r.analysis.topPick.label}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 text-right">
                    <div>
                      <div className="font-mono text-sm font-bold">{(r.analysis.topPick.probability * 100).toFixed(1)}%</div>
                      <div className="text-[10px] font-mono text-muted-foreground">conf {r.analysis.topPick.confidence}</div>
                    </div>
                    <PickBadge grade={r.analysis.topPick.grade} />
                  </div>
                </Link>
              ))}
            </Card>
          )}
        </>
      )}
    </div>
  );
}