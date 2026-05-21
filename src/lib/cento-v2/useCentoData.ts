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
  availableDates: string[];
  reload: () => Promise<void>;
}

const LS_LEAGUE = 'cento.activeLeagueId';

export function useCentoData(): CentoDataState {
  const { user } = useAuth();
  const [leagues, setLeagues] = useState<SyncedLeague[]>([]);
  const [activeLeagueId, setActiveLeagueIdState] = useState<string | null>(() => {
    try { return sessionStorage.getItem(LS_LEAGUE); } catch { return null; }
  });
  const setActiveLeagueId = (id: string | null) => {
    setActiveLeagueIdState(id);
    try { if (id) sessionStorage.setItem(LS_LEAGUE, id); else sessionStorage.removeItem(LS_LEAGUE); } catch { /* noop */ }
  };
  const [data, setData] = useState<{ matches: SyncedMatch[]; teams: SyncedTeam[] } | null>(null);
  const [loading, setLoading] = useState(false);

  const reload = async () => {
    if (!user) return;
    const ls = await listLeagues(user.id);
    setLeagues(ls);
    const stillValid = ls.find((l) => l.id === activeLeagueId);
    if (!stillValid && ls.length) setActiveLeagueId(ls[0].id);
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

  const availableDates = useMemo(() => {
    const set = new Set<string>();
    for (const r of analyses) if (r.analysis.matchDate) set.add(r.analysis.matchDate);
    return [...set].sort();
  }, [analyses]);

  return { leagues, activeLeagueId, setActiveLeagueId, activeLeague, data, loading, analyses, availableDates, reload };
}