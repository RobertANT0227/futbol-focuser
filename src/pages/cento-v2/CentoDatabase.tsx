// CENTO-V2
import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { CentoHeader } from '@/components/cento-v2/CentoHeader';
import { CentoEmpty } from '@/components/cento-v2/CentoEmpty';
import { useCentoData } from '@/lib/cento-v2/useCentoData';
import { cn } from '@/lib/utils';
import { ArrowUpDown } from 'lucide-react';
import type { TeamProfile } from '@/lib/cento/footystats/types';

type Col = { key: string; label: string; get: (t: TeamProfile) => number | string | null };

const COLS: Col[] = [
  { key: 'name', label: 'Echipă', get: (t) => t.name },
  { key: 'matchesPlayed', label: 'Meciuri', get: (t) => t.matchesPlayed },
  { key: 'ppg', label: 'PPG', get: (t) => t.ppg },
  { key: 'goalsFor', label: 'GF', get: (t) => t.goalsFor },
  { key: 'goalsAgainst', label: 'GA', get: (t) => t.goalsAgainst },
  { key: 'over25Pct', label: 'Over2.5%', get: (t) => t.over25Pct },
  { key: 'cleanSheetsPct', label: 'CS%', get: (t) => t.cleanSheetsPct },
];

export default function CentoDatabase() {
  const { leagues, activeLeagueId, setActiveLeagueId, data, loading, reload } = useCentoData();
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: 'ppg', dir: 'desc' });

  const teams = useMemo(() => {
    if (!data) return [] as TeamProfile[];
    const rows = data.teams.map((t) => t.stats as TeamProfile);
    const filtered = q ? rows.filter((t) => t.name.toLowerCase().includes(q.toLowerCase())) : rows;
    const col = COLS.find((c) => c.key === sort.key);
    if (!col) return filtered;
    return [...filtered].sort((a, b) => {
      const va = col.get(a); const vb = col.get(b);
      const na = typeof va === 'number' ? va : -Infinity;
      const nb = typeof vb === 'number' ? vb : -Infinity;
      if (typeof va === 'string' && typeof vb === 'string') return sort.dir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      return sort.dir === 'asc' ? na - nb : nb - na;
    });
  }, [data, q, sort]);

  return (
    <div className="container max-w-6xl mx-auto px-4 py-6 space-y-5">
      <CentoHeader title="Baza de date echipe" leagues={leagues} activeLeagueId={activeLeagueId} setActiveLeagueId={setActiveLeagueId} onSynced={reload} />
      {leagues.length === 0 ? (
        <CentoEmpty message="Niciun set de date încărcat." />
      ) : loading ? (
        <CentoEmpty message="Se încarcă..." />
      ) : (
        <>
          <Input placeholder="Caută echipă..." value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm" />
          <Card className="overflow-x-auto bg-card/60">
            <table className="w-full text-xs">
              <thead className="bg-secondary/40">
                <tr>
                  {COLS.map((c) => (
                    <th key={c.key} className="text-left p-2 font-bold uppercase tracking-wider text-[10px]">
                      <button className={cn('inline-flex items-center gap-1 hover:text-primary', sort.key === c.key && 'text-primary')}
                        onClick={() => setSort((s) => s.key === c.key ? { key: c.key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: c.key, dir: 'desc' })}>
                        {c.label} <ArrowUpDown className="h-3 w-3 opacity-50" />
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {teams.map((t, i) => (
                  <tr key={`${t.name}-${i}`} className="border-t border-border/30 hover:bg-secondary/20">
                    {COLS.map((c) => {
                      const v = c.get(t);
                      return <td key={c.key} className="p-2 font-mono">{v == null ? '—' : typeof v === 'number' ? v.toFixed(c.key === 'name' ? 0 : 1) : v}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}