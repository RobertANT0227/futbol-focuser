import { useEffect, useMemo, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarUI } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { UploadCenter } from '@/components/cento/UploadCenter';
import { PowerMatchCard } from '@/components/cento/PowerMatchCard';
import { PickBadge } from '@/components/cento/PickBadge';
import { QualityChip } from '@/components/cento/QualityChip';
import { useAuth } from '@/contexts/AuthContext';
import { listLeagues, getLeagueData, deleteLeague, type SyncedLeague, type SyncedMatch, type SyncedTeam } from '@/lib/cento/persistence';
import { analyzeMatch } from '@/lib/cento/engine';
import type { LeagueStats, ParsedMatch, TeamProfile } from '@/lib/cento/footystats/types';
import type { PowerAnalysis } from '@/lib/cento/engine/types';
import { fuzzyMatch, normalizeTeamName } from '@/lib/cento/footystats/util';
import { loadBankrollState, getDefaultBankrollState } from '@/lib/bankroll';
import { Upload, Trash2, Database, Calendar, Trophy } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

const TODAY = () => new Date().toISOString().slice(0, 10);

export default function CentoPower() {
  const { user } = useAuth();
  const [leagues, setLeagues] = useState<SyncedLeague[]>([]);
  const [activeLeagueId, setActiveLeagueId] = useState<string | null>(null);
  const [data, setData] = useState<{ matches: SyncedMatch[]; teams: SyncedTeam[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const bankroll = (loadBankrollState() ?? getDefaultBankrollState()).currentBankroll;

  const reloadLeagues = async () => {
    if (!user) return;
    const ls = await listLeagues(user.id);
    setLeagues(ls);
    if (!activeLeagueId && ls.length) setActiveLeagueId(ls[0].id);
  };

  useEffect(() => { reloadLeagues(); /* eslint-disable-next-line */ }, [user?.id]);

  useEffect(() => {
    if (!activeLeagueId) { setData(null); return; }
    setLoading(true);
    getLeagueData(activeLeagueId).then(setData).finally(() => setLoading(false));
  }, [activeLeagueId]);

  const activeLeague = leagues.find((l) => l.id === activeLeagueId);

  // Build analyses
  const analyses: { league: SyncedLeague; analysis: PowerAnalysis }[] = useMemo(() => {
    if (!activeLeague || !data) return [];
    const leagueStats = (activeLeague.league_stats ?? {}) as LeagueStats;
    const teamNames = data.teams.map((t) => t.name);
    const findTeam = (name: string): TeamProfile | undefined => {
      const direct = data.teams.find((t) => normalizeTeamName(t.name) === normalizeTeamName(name));
      if (direct) return direct.stats as TeamProfile;
      const fuzzy = fuzzyMatch(name, teamNames);
      if (fuzzy) return data.teams.find((t) => t.name === fuzzy)?.stats as TeamProfile;
      return undefined;
    };
    const upcoming = data.matches.filter((m) => {
      const s = (m.stats ?? {}) as { played?: boolean; homeGoals?: number | null; awayGoals?: number | null };
      // Unplayed if explicitly flagged or no final score recorded
      if (s.played === true) return false;
      if (s.homeGoals !== null && s.homeGoals !== undefined && s.awayGoals !== null && s.awayGoals !== undefined) return false;
      return true;
    });
    return upcoming.map((m) => {
      const stats = (m.stats ?? {}) as ParsedMatch;
      const odds = (m.odds ?? {}) as Record<string, number | null>;
      const matchObj: ParsedMatch = {
        ...stats,
        date: m.match_date,
        home: m.home, away: m.away,
        oddsHome: odds.oddsHome ?? null, oddsDraw: odds.oddsDraw ?? null, oddsAway: odds.oddsAway ?? null,
        oddsBttsYes: odds.oddsBttsYes ?? null, oddsBttsNo: odds.oddsBttsNo ?? null,
        oddsOver25: odds.oddsOver25 ?? null, oddsUnder25: odds.oddsUnder25 ?? null,
      };
      const a = analyzeMatch(matchObj, findTeam(m.home), findTeam(m.away), leagueStats);
      return { league: activeLeague, analysis: a };
    }).sort((a, b) => (a.analysis.match.date ?? '').localeCompare(b.analysis.match.date ?? ''));
  }, [activeLeague, data]);

  const filtered = analyses.filter((x) => {
    if (selectedDate) {
      const day = format(selectedDate, 'yyyy-MM-dd');
      if ((x.analysis.match.date ?? '') !== day) return false;
    }
    if (!search) return true;
    const s = search.toLowerCase();
    return x.analysis.match.home.toLowerCase().includes(s) || x.analysis.match.away.toLowerCase().includes(s);
  });

  const topPicks = useMemo(() => {
    return analyses
      .filter((x) => x.analysis.grade === 'STRONG' || x.analysis.grade === 'MEDIUM')
      .sort((a, b) => b.analysis.confidence - a.analysis.confidence)
      .slice(0, 12);
  }, [analyses]);

  const handleDeleteLeague = async (id: string) => {
    if (!confirm('Ștergi această ligă și toate datele?')) return;
    await deleteLeague(id);
    if (activeLeagueId === id) setActiveLeagueId(null);
    toast({ title: 'Liga ștearsă' });
    reloadLeagues();
  };

  return (
    <div className="container max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Top bar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Trophy className="h-6 w-6 text-primary" /> Cento Power
          </h1>
          <p className="text-xs text-muted-foreground">Premium tipster intelligence · multi-ligă</p>
        </div>
        <div className="flex items-center gap-3">
          <Card className="px-3 py-1.5 bg-card/60">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Bankroll</div>
            <div className="text-sm font-mono font-bold">{bankroll.toFixed(0)} LEI</div>
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
                <UploadCenter onSynced={() => { setUploadOpen(false); reloadLeagues(); }} />
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
        <Tabs defaultValue="fixtures" className="space-y-4">
          <TabsList>
            <TabsTrigger value="fixtures"><Calendar className="h-3.5 w-3.5 mr-1.5" /> Fixtures</TabsTrigger>
            <TabsTrigger value="leagues"><Database className="h-3.5 w-3.5 mr-1.5" /> Ligi</TabsTrigger>
            <TabsTrigger value="top"><Trophy className="h-3.5 w-3.5 mr-1.5" /> Top Picks</TabsTrigger>
          </TabsList>

          <TabsContent value="fixtures" className="space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <Select value={activeLeagueId ?? ''} onValueChange={setActiveLeagueId}>
                <SelectTrigger className="w-[280px]"><SelectValue placeholder="Alege liga" /></SelectTrigger>
                <SelectContent>
                  {leagues.map((l) => (
                    <SelectItem key={l.id} value={l.id}>{l.country ? `${l.country} · ` : ''}{l.name} · {l.season}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input placeholder="Caută echipă..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn('justify-start text-left font-normal gap-2', !selectedDate && 'text-muted-foreground')}>
                    <Calendar className="h-4 w-4" />
                    {selectedDate ? format(selectedDate, 'PPP') : 'Toate zilele'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarUI
                    mode="single"
                    selected={selectedDate}
                    onSelect={setSelectedDate}
                    initialFocus
                    className={cn('p-3 pointer-events-auto')}
                  />
                  <div className="p-2 border-t flex justify-end">
                    <Button variant="ghost" size="sm" onClick={() => setSelectedDate(undefined)}>Șterge filtru</Button>
                  </div>
                </PopoverContent>
              </Popover>
              <Badge variant="outline" className="font-mono text-[10px]">
                {filtered.length} {selectedDate ? `meciuri pe ${format(selectedDate, 'dd MMM')}` : 'meciuri viitoare'}
              </Badge>
            </div>
            {loading ? (
              <Card className="p-6 text-center text-sm text-muted-foreground">Se încarcă...</Card>
            ) : filtered.length === 0 ? (
              <Card className="p-6 text-center text-sm text-muted-foreground">Niciun meci viitor.</Card>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {filtered.map(({ analysis, league }, i) => (
                  <PowerMatchCard key={i} a={analysis} leagueName={league.name} />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="leagues" className="space-y-3">
            {leagues.map((l) => (
              <Card key={l.id} className={`p-4 flex items-center justify-between gap-3 bg-card/60 ${activeLeagueId === l.id ? 'border-primary/50' : ''}`}>
                <button className="text-left flex-1 min-w-0" onClick={() => setActiveLeagueId(l.id)}>
                  <div className="font-bold">{l.country ? `${l.country} · ` : ''}{l.name}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {l.season} · {l.matches_count} meciuri · {l.teams_count} echipe
                  </div>
                </button>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">{l.has_league_stats && l.has_matches && l.has_teams ? 'Excellent' : (l.has_matches && l.has_teams) ? 'Good' : 'Limited'}</Badge>
                  <Button variant="ghost" size="icon" onClick={() => handleDeleteLeague(l.id)}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="top" className="space-y-4">
            {topPicks.length === 0 ? (
              <Card className="p-6 text-center text-sm text-muted-foreground">Nicio recomandare puternică pentru ligile încărcate.</Card>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {topPicks.map(({ analysis, league }, i) => (
                  <PowerMatchCard key={i} a={analysis} leagueName={league.name} />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}