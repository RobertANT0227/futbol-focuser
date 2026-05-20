// CENTO-V2
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CentoHeader } from '@/components/cento-v2/CentoHeader';
import { CentoEmpty } from '@/components/cento-v2/CentoEmpty';
import { PowerMatchCard } from '@/components/cento-v2/PowerMatchCard';
import { useCentoData } from '@/lib/cento-v2/useCentoData';

export default function CentoAnalysis() {
  const { leagues, activeLeagueId, setActiveLeagueId, analyses, loading, reload } = useCentoData();
  const [params, setParams] = useSearchParams();
  const requested = params.get('m');
  const [selected, setSelected] = useState<string | null>(requested);

  useEffect(() => {
    if (requested) setSelected(requested);
  }, [requested]);

  useEffect(() => {
    if (!selected && analyses.length) setSelected(analyses[0].analysis.matchId);
  }, [analyses, selected]);

  const current = useMemo(() => analyses.find((r) => r.analysis.matchId === selected), [analyses, selected]);

  return (
    <div className="container max-w-5xl mx-auto px-4 py-6 space-y-5">
      <CentoHeader title="Analiză meci" leagues={leagues} activeLeagueId={activeLeagueId} setActiveLeagueId={setActiveLeagueId} onSynced={reload} />
      {leagues.length === 0 ? (
        <CentoEmpty message="Importă date pentru a analiza meciurile." />
      ) : loading ? (
        <CentoEmpty message="Se încarcă..." />
      ) : analyses.length === 0 ? (
        <CentoEmpty message="Nu sunt meciuri disponibile pentru ligă." />
      ) : (
        <>
          <Select
            value={selected ?? ''}
            onValueChange={(v) => { setSelected(v); setParams({ m: v }); }}
          >
            <SelectTrigger className="max-w-md"><SelectValue placeholder="Alege un meci" /></SelectTrigger>
            <SelectContent>
              {analyses.map((r) => (
                <SelectItem key={r.analysis.matchId} value={r.analysis.matchId}>
                  {r.analysis.home} vs {r.analysis.away}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {current ? <PowerMatchCard a={current.analysis} /> : <CentoEmpty message="Selectează un meci." />}
        </>
      )}
    </div>
  );
}