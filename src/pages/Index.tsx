import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { UploadCenter } from '@/components/cento/UploadCenter';
import { PowerMatchCard2 } from '@/components/engine2/PowerMatchCard2';
import { analyzeMatch2 } from '@/lib/engine2';
import type { PowerAnalysis2, PickGrade } from '@/lib/engine2/types';
import { useAuth } from '@/contexts/AuthContext';
import { listLeagues, getLeagueData, type SyncedLeague, type SyncedMatch, type SyncedTeam } from '@/lib/cento/persistence';
import { fuzzyMatch, normalizeTeamName } from '@/lib/cento/footystats/util';
import { isoDateFromRaw } from '@/lib/cento/footystats/date';
import type { LeagueStats, ParsedMatch, TeamProfile } from '@/lib/cento/footystats/types';
import { Upload, Database, Trophy, Zap } from 'lucide-react';

type AnalysisItem = { league: SyncedLeague; analysis: PowerAnalysis2 };

const GRADES: (PickGrade | 'ALL')[] = ['ALL', 'STRONG', 'MEDIUM', 'RISKY', 'PASS'];
const MARKETS = ['ALL', '1X2', 'BTTS', 'OVER25'] as const;
type MarketFilter = (typeof MARKETS)[number];

const Index = () => {
  const { user } = useAuth();
  const [leagues, setLeagues] = useState<SyncedLeague[]>([]);
  const [allData, setAllData] = useState<Record<string, { matches: SyncedMatch[]; teams: SyncedTeam[] }>>({});
  const [activeLeagueId, setActiveLeagueId] = useState<string>('__all__');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [gradeFilter, setGradeFilter] = useState<PickGrade | 'ALL'>('ALL');
  const [marketFilter, setMarketFilter] = useState<MarketFilter>('ALL');
  const [tab, setTab] = useState<'today' | 'upcoming' | 'all'>('upcoming');

  const reload = async () => {
    if (!user) return;
    const ls = await listLeagues(user.id);
    setLeagues(ls);
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [user?.id]);

  useEffect(() => {
    if (!leagues.length) return;
    let cancelled = false;
    (async () => {
      const missing = leagues.filter((l) => !allData[l.id]);
      if (!missing.length) return;
      const entries = await Promise.all(missing.map(async (l) => {
        try { return [l.id, await getLeagueData(l.id)] as const; }
        catch { return [l.id, { matches: [] as SyncedMatch[], teams: [] as SyncedTeam[] }] as const; }
      }));
      if (cancelled) return;
      setAllData((prev) => {
        const next = { ...prev };
        for (const [id, d] of entries) next[id] = d;
        return next;
      });
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line
  }, [leagues]);

  const analyses: AnalysisItem[] = useMemo(() => {
    const out: AnalysisItem[] = [];
    const target = activeLeagueId === '__all__' ? leagues : leagues.filter((l) => l.id === activeLeagueId);
    for (const league of target) {
      const d = allData[league.id];
      if (!d) continue;
      const leagueStats = (league.league_stats ?? {}) as LeagueStats;
      const names = d.teams.map((t) => t.name);
      const find = (name: string): TeamProfile | undefined => {
        const direct = d.teams.find((t) => normalizeTeamName(t.name) === normalizeTeamName(name));
        if (direct) return direct.stats as TeamProfile;
        const fz = fuzzyMatch(name, names);
        return fz ? (d.teams.find((t) => t.name === fz)?.stats as TeamProfile | undefined) : undefined;
      };
      for (const m of d.matches) {
        const stats = (m.stats ?? {}) as ParsedMatch;
        const status = String(stats.raw?.status ?? '').toLowerCase();
        const upcoming = status === 'incomplete' || status === 'scheduled' || status === 'postponed' || stats.played === false;
        if (!upcoming) continue;
        const odds = (m.odds ?? {}) as Record<string, number | null>;
        const matchDate = isoDateFromRaw(stats.raw, m.match_date ?? stats.date, stats.timestamp);
        const matchObj: ParsedMatch = {
          ...stats,
          date: matchDate,
          home: m.home, away: m.away,
          oddsHome: odds.oddsHome ?? null, oddsDraw: odds.oddsDraw ?? null, oddsAway: odds.oddsAway ?? null,
          oddsBttsYes: odds.oddsBttsYes ?? null, oddsBttsNo: odds.oddsBttsNo ?? null,
          oddsOver25: odds.oddsOver25 ?? null, oddsUnder25: odds.oddsUnder25 ?? null,
        };
        out.push({ league, analysis: analyzeMatch2(matchObj, find(m.home), find(m.away), leagueStats) });
      }
    }
    return out.sort((a, b) => b.analysis.confidence - a.analysis.confidence);
  }, [leagues, allData, activeLeagueId]);

  const today = new Date().toISOString().slice(0, 10);
  const filtered = useMemo(() => {
    return analyses.filter((x) => {
      const d = x.analysis.match.date ?? '';
      if (tab === 'today' && d !== today) return false;
      if (tab === 'upcoming' && d && d < today) return false;
      if (gradeFilter !== 'ALL' && x.analysis.grade !== gradeFilter) return false;
      if (marketFilter !== 'ALL') {
        const key = x.analysis.topMarket.key;
        if (marketFilter === '1X2' && !['1', 'X', '2'].includes(key)) return false;
        if (marketFilter === 'BTTS' && !key.startsWith('BTTS')) return false;
        if (marketFilter === 'OVER25' && !['OVER_2_5', 'UNDER_2_5'].includes(key)) return false;
      }
      if (search) {
        const s = search.toLowerCase();
        if (!x.analysis.match.home.toLowerCase().includes(s) && !x.analysis.match.away.toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }, [analyses, gradeFilter, marketFilter, search, tab, today]);

  const totals = useMemo(() => {
    const g: Record<PickGrade, number> = { STRONG: 0, MEDIUM: 0, RISKY: 0, PASS: 0 };
    for (const a of analyses) g[a.analysis.grade]++;
    return g;
  }, [analyses]);

  return (
    <div className="container max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Zap className="h-6 w-6 text-primary" /> Cento Power <span className="text-xs font-mono uppercase tracking-widest text-muted-foreground px-2 py-0.5 border border-primary/30 rounded">engine v2</span>
          </h1>
          <p className="text-xs text-muted-foreground font-mono">FootyStats powered · multi-ligă · tipster intelligence</p>
        </div>
        <div className="flex items-center gap-2">
          <Card className="px-3 py-1.5 bg-card/60 hidden md:block">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono">Picks</div>
            <div className="text-xs font-mono font-bold flex gap-2">
              <span className="text-primary">🟢 {totals.STRONG}</span>
              <span className="text-accent">🟡 {totals.MEDIUM}</span>
              <span className="text-muted-foreground">🟠 {totals.RISKY}</span>
              <span className="text-muted-foreground/70">⚪ {totals.PASS}</span>
            </div>
          </Card>
          <Sheet open={uploadOpen} onOpenChange={setUploadOpen}>
            <SheetTrigger asChild>
              <Button className="font-bold gap-2"><Upload className="h-4 w-4" /> Import CSV</Button>
            </SheetTrigger>
            <SheetContent className="sm:max-w-xl overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Import FootyStats</SheetTitle>
              </SheetHeader>
              <div className="mt-6">
                <UploadCenter onSynced={() => { setUploadOpen(false); reload(); }} />
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {leagues.length === 0 ? (
        <Card className="p-10 text-center bg-card/40 border-dashed">
          <Database className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <h3 className="font-bold mb-1">Nicio ligă încărcată</h3>
          <p className="text-sm text-muted-foreground mb-4">Importă cele 3 CSV-uri FootyStats pentru o ligă (league + matches + teams).</p>
          <Button onClick={() => setUploadOpen(true)} className="font-bold">Importă acum</Button>
        </Card>
      ) : (
        <>
          {/* Filters */}
          <Card className="p-3 bg-card/60 flex items-center gap-2 flex-wrap">
            <Select value={activeLeagueId} onValueChange={setActiveLeagueId}>
              <SelectTrigger className="w-[260px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">🌍 Toate ligile</SelectItem>
                {leagues.map((l) => (
                  <SelectItem key={l.id} value={l.id}>{l.country ? `${l.country} · ` : ''}{l.name} · {l.season}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input placeholder="Caută echipă..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
            <Select value={gradeFilter} onValueChange={(v) => setGradeFilter(v as PickGrade | 'ALL')}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {GRADES.map((g) => <SelectItem key={g} value={g}>{g === 'ALL' ? 'Toate gradele' : g}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={marketFilter} onValueChange={(v) => setMarketFilter(v as MarketFilter)}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MARKETS.map((m) => <SelectItem key={m} value={m}>{m === 'ALL' ? 'Toate piețele' : m}</SelectItem>)}
              </SelectContent>
            </Select>
            <Badge variant="outline" className="font-mono text-[10px] ml-auto"><Trophy className="h-3 w-3 mr-1" />{filtered.length} meciuri</Badge>
          </Card>

          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList>
              <TabsTrigger value="today">Today</TabsTrigger>
              <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
              <TabsTrigger value="all">All</TabsTrigger>
            </TabsList>
            <TabsContent value={tab} className="mt-4">
              {filtered.length === 0 ? (
                <Card className="p-6 text-center text-sm text-muted-foreground">Niciun meci pentru filtrele active.</Card>
              ) : (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  {filtered.map(({ analysis, league }, i) => (
                    <PowerMatchCard2 key={i} a={analysis} leagueName={league.name} />
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
};

export default Index;
