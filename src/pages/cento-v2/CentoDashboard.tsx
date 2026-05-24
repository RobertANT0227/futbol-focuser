// CENTO-V2
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { CalendarIcon } from 'lucide-react';
import { CentoHeader } from '@/components/cento-v2/CentoHeader';
import { CentoEmpty } from '@/components/cento-v2/CentoEmpty';
import { PowerMatchCard } from '@/components/cento-v2/PowerMatchCard';
import { useCentoData } from '@/lib/cento-v2/useCentoData';
import { useSelectedDate, toLocalISO } from '@/lib/cento-v2/useSelectedDate';
import { cn } from '@/lib/utils';
import type { PickGrade } from '@/lib/cento-v2/engine/types';

const FILTERS: { key: 'ALL' | PickGrade; label: string }[] = [
  { key: 'ALL', label: 'Toate' },
  { key: 'STRONG', label: 'Strong' },
  { key: 'MEDIUM', label: 'Medium' },
  { key: 'RISKY', label: 'Risky' },
  { key: 'PASS', label: 'Pass' },
];

export default function CentoDashboard() {
  const { leagues, activeLeague, activeLeagueId, setActiveLeagueId, analyses, availableDates, loading, reload } = useCentoData();
  const [filter, setFilter] = useState<'ALL' | PickGrade>('ALL');
  const [selectedDate, setSelectedDate] = useSelectedDate(availableDates);

  const ls = (activeLeague?.league_stats ?? {}) as { goalsPerMatch?: number | null; over25Pct?: number | null; homeAdvantagePct?: number | null; xgPerMatch?: number | null };

  const dateSet = useMemo(() => new Set(availableDates), [availableDates]);
  const dateModifiers = useMemo(() => ({
    hasMatches: availableDates.map((d) => new Date(d + 'T00:00:00')),
  }), [availableDates]);

  const rows = useMemo(() => {
    let filtered = selectedDate ? analyses.filter((r) => r.analysis.matchDate === selectedDate) : analyses;
    if (filter !== 'ALL') filtered = filtered.filter((r) => r.analysis.topPick.grade === filter);
    return [...filtered].sort((a, b) => b.analysis.topPick.confidence - a.analysis.topPick.confidence);
  }, [analyses, filter, selectedDate]);

  return (
    <div className="container max-w-7xl mx-auto px-4 py-6 space-y-5">
      <CentoHeader title="Dashboard" leagues={leagues} activeLeagueId={activeLeagueId} setActiveLeagueId={setActiveLeagueId} onSynced={reload} />

      {leagues.length === 0 ? (
        <CentoEmpty message="Importă cele 3 CSV-uri FootyStats (league + matches + teams) pentru a începe." />
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Goluri/meci', value: ls.goalsPerMatch?.toFixed(2) ?? '—' },
              { label: 'Over 2.5 ligă', value: ls.over25Pct != null ? `${ls.over25Pct.toFixed(1)}%` : '—' },
              { label: 'xG / meci', value: ls.xgPerMatch != null ? ls.xgPerMatch.toFixed(2) : '—' },
              { label: 'Home advantage', value: ls.homeAdvantagePct != null ? `${ls.homeAdvantagePct.toFixed(1)}%` : '—' },
            ].map((s) => (
              <Card key={s.label} className="p-3 bg-card/60">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{s.label}</div>
                <div className="text-lg font-mono font-bold">{s.value}</div>
              </Card>
            ))}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs font-mono">
                  <CalendarIcon className="h-3.5 w-3.5" />
                  {selectedDate ? new Date(selectedDate + 'T00:00:00').toLocaleDateString('ro-RO', { weekday: 'short', day: '2-digit', month: 'short' }) : 'Alege data'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={selectedDate ? new Date(selectedDate + 'T00:00:00') : undefined}
                  onSelect={(d) => d && setSelectedDate(toLocalISO(d))}
                  modifiers={dateModifiers}
                  modifiersClassNames={{ hasMatches: 'relative after:content-[""] after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:h-1 after:w-1 after:rounded-full after:bg-primary' }}
                  disabled={(d) => !dateSet.has(toLocalISO(d))}
                  className={cn('p-3 pointer-events-auto')}
                />
              </PopoverContent>
            </Popover>
            {FILTERS.map((f) => (
              <Button
                key={f.key}
                variant={filter === f.key ? 'default' : 'outline'}
                size="sm"
                className={cn('h-8 text-xs', filter === f.key && 'font-bold')}
                onClick={() => setFilter(f.key)}
              >
                {f.label}
              </Button>
            ))}
            <span className="text-[11px] text-muted-foreground ml-auto font-mono">{rows.length} meciuri</span>
          </div>

          {loading ? (
            <CentoEmpty message="Se încarcă..." />
          ) : rows.length === 0 ? (
            <CentoEmpty message={selectedDate ? `Niciun meci analizat pentru ${new Date(selectedDate + 'T00:00:00').toLocaleDateString('ro-RO')}.` : 'Nimic de afișat pentru filtrul curent.'} />
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {rows.map((r) => <PowerMatchCard key={r.analysis.matchId} a={r.analysis} />)}
            </div>
          )}
        </>
      )}
    </div>
  );
}