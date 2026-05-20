// CENTO-V2
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CentoHeader } from '@/components/cento-v2/CentoHeader';
import { CentoEmpty } from '@/components/cento-v2/CentoEmpty';
import { PowerMatchCard } from '@/components/cento-v2/PowerMatchCard';
import { useCentoData } from '@/lib/cento-v2/useCentoData';
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
  const { leagues, activeLeague, activeLeagueId, setActiveLeagueId, analyses, loading, reload } = useCentoData();
  const [filter, setFilter] = useState<'ALL' | PickGrade>('ALL');

  const ls = (activeLeague?.league_stats ?? {}) as { goalsPerMatch?: number | null; over25Pct?: number | null; bttsPct?: number | null; homeAdvantagePct?: number | null };

  const rows = useMemo(() => {
    const filtered = filter === 'ALL' ? analyses : analyses.filter((r) => r.analysis.topPick.grade === filter);
    return [...filtered].sort((a, b) => b.analysis.topPick.confidence - a.analysis.topPick.confidence);
  }, [analyses, filter]);

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
              { label: 'BTTS ligă', value: ls.bttsPct != null ? `${ls.bttsPct.toFixed(1)}%` : '—' },
              { label: 'Home advantage', value: ls.homeAdvantagePct != null ? `${ls.homeAdvantagePct.toFixed(1)}%` : '—' },
            ].map((s) => (
              <Card key={s.label} className="p-3 bg-card/60">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{s.label}</div>
                <div className="text-lg font-mono font-bold">{s.value}</div>
              </Card>
            ))}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
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
            <CentoEmpty message="Nimic de afișat pentru filtrul curent." />
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