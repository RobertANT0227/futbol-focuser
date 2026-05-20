// CENTO-V2
import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { CentoHeader } from '@/components/cento-v2/CentoHeader';
import { CentoEmpty } from '@/components/cento-v2/CentoEmpty';
import { PickBadge } from '@/components/cento-v2/PickBadge';
import { useCentoData } from '@/lib/cento-v2/useCentoData';
import { Link } from 'react-router-dom';

function fmt(d: string | null) {
  if (!d) return 'TBD';
  return new Date(d).toLocaleDateString('ro-RO', { weekday: 'short', day: '2-digit', month: 'short' });
}

export default function CentoFixtures() {
  const { leagues, activeLeagueId, setActiveLeagueId, analyses, loading, reload } = useCentoData();
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = useMemo(() => analyses
    .filter((r) => !r.analysis.matchDate || r.analysis.matchDate >= today)
    .sort((a, b) => (a.analysis.matchDate ?? '9999').localeCompare(b.analysis.matchDate ?? '9999'))
  , [analyses, today]);

  return (
    <div className="container max-w-5xl mx-auto px-4 py-6 space-y-5">
      <CentoHeader title="Fixtures" leagues={leagues} activeLeagueId={activeLeagueId} setActiveLeagueId={setActiveLeagueId} onSynced={reload} />
      {leagues.length === 0 ? (
        <CentoEmpty message="Niciun meci. Importă datele." />
      ) : loading ? (
        <CentoEmpty message="Se încarcă..." />
      ) : upcoming.length === 0 ? (
        <CentoEmpty message="Nici un meci viitor cu status incomplete." />
      ) : (
        <Card className="divide-y divide-border/40 bg-card/60">
          {upcoming.map((r) => (
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
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="font-mono text-sm">{(r.analysis.topPick.probability * 100).toFixed(1)}%</span>
                <PickBadge grade={r.analysis.topPick.grade} />
              </div>
            </Link>
          ))}
        </Card>
      )}
    </div>
  );
}