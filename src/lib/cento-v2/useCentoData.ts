// CENTO-V2
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { listLeagues, getLeagueData, type SyncedLeague, type SyncedMatch, type SyncedTeam } from '@/lib/cento/persistence';
import { buildAnalyses, type AnalysisRow, type LeagueDataset } from './adapter';

export interface CentoDataState {
  leagues: SyncedLeague[];
  activeLeagueId: string | null;
  setActiveLeagueId: (id: string | null) => void;
  activeLeague: SyncedLeague | undefined;
  data: { matches: SyncedMatch[]; teams: SyncedTeam[] } | null;
  loading: boolean;
  analyses: AnalysisRow[];
  reload: () => Promise<void>;
}

export function useCentoData(): CentoDataState {
  const { user } = useAuth();
  const [leagues, setLeagues] = useState<SyncedLeague[]>([]);
  const [activeLeagueId, setActiveLeagueId] = useState<string | null>(null);
  const [data, setData] = useState<{ matches: SyncedMatch[]; teams: SyncedTeam[] } | null>(null);
  const [loading, setLoading] = useState(false);

  const reload = async () => {
    if (!user) return;
    const ls = await listLeagues(user.id);
    setLeagues(ls);
    if (!activeLeagueId && ls.length) setActiveLeagueId(ls[0].id);
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [user?.id]);

  useEffect(() => {
    if (!activeLeagueId) { setData(null); return; }
    setLoading(true);
    getLeagueData(activeLeagueId).then(setData).finally(() => setLoading(false));
  }, [activeLeagueId]);

  const activeLeague = leagues.find((l) => l.id === activeLeagueId);

  const analyses = useMemo(() => {
    if (!activeLeague || !data) return [];
    const ds: LeagueDataset = { league: activeLeague, matches: data.matches, teams: data.teams };
    return buildAnalyses(ds);
  }, [activeLeague, data]);

  return { leagues, activeLeagueId, setActiveLeagueId, activeLeague, data, loading, analyses, reload };
}