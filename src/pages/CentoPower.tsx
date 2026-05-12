import { useEffect, useMemo, useState, useCallback } from 'react';
import { format } from 'date-fns';
import { ro } from 'date-fns/locale';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Search, Zap, UploadCloud, Database, Activity, Wallet, Star, CalendarIcon, X } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import { ImportDropzone } from '@/components/cento/ImportDropzone';
import { DatabaseTree, type DbLeague } from '@/components/cento/DatabaseTree';
import { ValueBetCard } from '@/components/cento/ValueBetCard';
import { StickyFilters, type CentoFilters } from '@/components/cento/StickyFilters';
import { EdgeSettings } from '@/components/cento/EdgeSettings';
import { CentoVerdict } from '@/components/cento/CentoVerdict';
import { BetCard } from '@/components/BetCard';
import { runAnalysis } from '@/lib/engine';
import { cpToMatchData } from '@/lib/cento/dashboardAdapter';
import { buildValueBets } from '@/lib/cento/valueEngine';
import type { CpTeam, CpMatch, ValueBet, CpImportResult } from '@/lib/cento/types';
import type { BetRecommendation } from '@/lib/types';
import { loadBankrollState, getDefaultBankrollState } from '@/lib/bankroll';

const initialFilters: CentoFilters = {
  edgeMin: 3, confidenceMin: 45, sampleSizeMin: 4, oddsMin: 1.4, oddsMax: 8, risk: 'all', market: 'all', league: 'all', stakeMode: 'dynamic',
};

const normalizeTeamAlias = (name: string) => name
  .toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/\b(real|reial|club|deportivo|deportiu|futbol|football|balompie|cf|fc|cd|ca|rcd|de|del|la|el)\b/g, ' ')
  .replace(/[^a-z0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const teamAliases = (team: CpTeam) => Array.from(new Set([
  team.name,
  String(team.stats?.common_name || ''),
  String(team.stats?.team_name || ''),
].map(normalizeTeamAlias).filter(Boolean)));

const findTeam = (leagueId: string, rawName: string, aliasMap: Map<string, CpTeam>) => {
  const key = `${leagueId}::${normalizeTeamAlias(rawName)}`;
  const exact = aliasMap.get(key);
  if (exact) return exact;
  const wanted = new Set(normalizeTeamAlias(rawName).split(' ').filter(Boolean));
  for (const [candidateKey, team] of aliasMap) {
    if (!candidateKey.startsWith(`${leagueId}::`)) continue;
    const candidate = new Set(candidateKey.split('::')[1].split(' ').filter(Boolean));
    const overlap = [...wanted].filter((token) => candidate.has(token)).length;
    if (overlap >= Math.min(2, wanted.size, candidate.size)) return team;
  }
  return undefined;
};

export default function CentoPower() {
  const { user } = useAuth();
  const [leagues, setLeagues] = useState<DbLeague[]>([]);
  const [teams, setTeams] = useState<CpTeam[]>([]);
  const [matches, setMatches] = useState<CpMatch[]>([]);
  const [selectedLeague, setSelectedLeague] = useState<string | null>(null);
  const [filters, setFilters] = useState<CentoFilters>(initialFilters);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('value');
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(() => new Date());

  const reload = useCallback(async () => {
    if (!user) return;
    const [{ data: lg }, { data: tm }, { data: mt }] = await Promise.all([
      supabase.from('cp_leagues').select('id,name,country,season,has_league_stats,has_matches,has_teams,matches_count,teams_count,coverage').order('name'),
      supabase.from('cp_teams').select('id,league_id,name,playstyle,tags,stats'),
      supabase.from('cp_matches').select('id,league_id,season,match_date,home,away,stats,odds').order('match_date', { ascending: false }),
    ]);
    const teamsByLg = (tm || []).reduce<Record<string, number>>((a, t) => { a[t.league_id] = (a[t.league_id] || 0) + 1; return a; }, {});
    const matchesByLg = (mt || []).reduce<Record<string, number>>((a, m) => { a[m.league_id] = (a[m.league_id] || 0) + 1; return a; }, {});
    setLeagues((lg || []).map((l) => ({ ...l, teams: teamsByLg[l.id] || 0, matches: matchesByLg[l.id] || 0 })));
    setTeams((tm || []) as unknown as CpTeam[]);
    setMatches((mt || []) as unknown as CpMatch[]);
  }, [user]);

  useEffect(() => { reload(); }, [reload]);

  const bankroll = useMemo(() => (loadBankrollState() ?? getDefaultBankrollState()).currentBankroll, []);

  // Compute value bets across DB
  const allBets = useMemo<ValueBet[]>(() => {
    if (!matches.length || !teams.length) return [];
    const teamMap = new Map<string, CpTeam>();
    teams.forEach((t) => teamAliases(t).forEach((alias) => teamMap.set(`${t.league_id}::${alias}`, t)));
    const out: ValueBet[] = [];
    for (const m of matches) {
      const home = findTeam(m.league_id, m.home, teamMap);
      const away = findTeam(m.league_id, m.away, teamMap);
      if (!home || !away) continue;
      const lg = leagues.find((l) => l.id === m.league_id);
      const bets = buildValueBets(m, home, away, {
        bankroll,
        edgeMin: -100,
        kellyFraction: filters.stakeMode === 'flat' ? 0 : 1,
        maxStakePct: Number.POSITIVE_INFINITY,
      });
      bets.forEach((b) => { b.league = lg ? `${lg.name} · ${lg.season}` : ''; out.push(b); });
    }
    return out;
  }, [matches, teams, leagues, bankroll, filters.stakeMode]);

  const filteredBets = useMemo(() => {
    return allBets.filter((b) => {
      if (selectedLeague && !b.league.includes(leagues.find((l) => l.id === selectedLeague)?.name || '____')) return false;
      if (selectedDate) {
        const m = matches.find((mm) => mm.id === b.matchId);
        const iso = format(selectedDate, 'yyyy-MM-dd');
        if (!m || m.match_date !== iso) return false;
      }
      if (b.edge < filters.edgeMin) return false;
      if (b.confidence < filters.confidenceMin) return false;
      if (b.sampleSize < filters.sampleSizeMin) return false;
      if (b.odds < filters.oddsMin || b.odds > filters.oddsMax) return false;
      if (b.dataReliability === 'low' && b.edge < Math.max(filters.edgeMin, 8)) return false;
      if (filters.risk !== 'all' && b.risk !== filters.risk) return false;
      if (filters.market !== 'all' && b.category !== filters.market) return false;
      if (filters.league !== 'all' && !b.league.startsWith(filters.league)) return false;
      if (search && !`${b.home} ${b.away} ${b.league}`.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    }).sort((a, b) => b.edge - a.edge);
  }, [allBets, filters, search, selectedLeague, leagues, selectedDate, matches]);

  const dateBestBets = useMemo(() => {
    if (!selectedDate) return filteredBets;
    const iso = format(selectedDate, 'yyyy-MM-dd');
    const selectedLeagueName = selectedLeague ? leagues.find((l) => l.id === selectedLeague)?.name : undefined;
    return matches
      .filter((m) => m.match_date === iso)
      .flatMap((m) => {
        const candidates = allBets.filter((b) => {
          if (b.matchId !== m.id) return false;
          if (selectedLeagueName && !b.league.includes(selectedLeagueName)) return false;
          if (filters.market !== 'all' && b.category !== filters.market) return false;
          if (filters.league !== 'all' && !b.league.startsWith(filters.league)) return false;
          if (search && !`${b.home} ${b.away} ${b.league}`.toLowerCase().includes(search.toLowerCase())) return false;
          if (b.odds < filters.oddsMin || b.odds > filters.oddsMax) return false;
          return true;
        }).sort((a, b) => b.edge - a.edge);
        return candidates[0] ? [candidates[0]] : [];
      });
  }, [allBets, filteredBets, filters.league, filters.market, filters.oddsMax, filters.oddsMin, leagues, matches, search, selectedDate, selectedLeague]);

  const matchesOnDate = useMemo(() => {
    if (!selectedDate) return null;
    const iso = format(selectedDate, 'yyyy-MM-dd');
    return matches.filter((m) => m.match_date === iso);
  }, [selectedDate, matches]);

  // Resolve teams for matches on the selected date so we can render full analysis panels
  const dateAnalyses = useMemo(() => {
    if (!matchesOnDate || !teams.length) return [];
    const teamMap = new Map<string, CpTeam>();
    teams.forEach((t) => teamAliases(t).forEach((alias) => teamMap.set(`${t.league_id}::${alias}`, t)));
    return matchesOnDate.map((m) => {
      const home = findTeam(m.league_id, m.home, teamMap);
      const away = findTeam(m.league_id, m.away, teamMap);
      const lg = leagues.find((l) => l.id === m.league_id);
      return { match: m, home, away, league: lg ? `${lg.name} · ${lg.season}` : '' };
    });
  }, [matchesOnDate, teams, leagues]);

  const leagueNames = useMemo(() => Array.from(new Set(leagues.map((l) => l.name))), [leagues]);

  const handleDeleteLeague = async (id: string) => {
    if (!confirm('Șterge această ligă și toate datele aferente?')) return;
    const { error } = await supabase.from('cp_leagues').delete().eq('id', id);
    if (error) toast({ title: 'Eroare', description: error.message, variant: 'destructive' });
    else { toast({ title: 'Ligă ștearsă' }); reload(); }
  };

  const saveBet = async (bet: ValueBet) => {
    if (!user) return;
    await supabase.from('cp_watchlist').insert({
      owner_id: user.id,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      payload: bet as any,
    });
    toast({ title: 'Salvat în watchlist' });
  };

  const onImportDone = async (_results: CpImportResult[]) => { await reload(); setTab('value'); };

  // KPIs
  const totalMatches = matches.length;
  const totalLeagues = leagues.length;
  const visibleBets = selectedDate ? dateBestBets : filteredBets;
  const topBets = visibleBets.slice(0, 12);

  // Top Today (Tipster) — alege cel mai mare WR per meci, sortat descrescător
  const tipsterTop = useMemo(() => {
    if (!teams.length || !matches.length) return [] as { bet: BetRecommendation; matchLabel: string; league: string }[];
    const teamMap = new Map<string, CpTeam>();
    teams.forEach((t) => teamAliases(t).forEach((alias) => teamMap.set(`${t.league_id}::${alias}`, t)));
    const iso = selectedDate ? format(selectedDate, 'yyyy-MM-dd') : null;
    const selectedLeagueName = selectedLeague ? leagues.find((l) => l.id === selectedLeague)?.name : undefined;
    const out: { bet: BetRecommendation; matchLabel: string; league: string }[] = [];
    for (const m of matches) {
      if (iso && m.match_date !== iso) continue;
      if (selectedLeague && m.league_id !== selectedLeague) continue;
      const home = findTeam(m.league_id, m.home, teamMap);
      const away = findTeam(m.league_id, m.away, teamMap);
      if (!home || !away) continue;
      const lg = leagues.find((l) => l.id === m.league_id);
      const leagueLabel = lg ? `${lg.name} · ${lg.season}` : '';
      if (selectedLeagueName && !leagueLabel.includes(selectedLeagueName)) continue;
      try {
        const md = cpToMatchData(m, home, away, leagueLabel);
        const res = runAnalysis(md, { bankroll, maxRisk: 'high', preferredBets: ['winner', 'goals', 'corners'] });
        const best = [...res.recommendations]
          .filter((r) => r.modelProbability >= 0.5)
          .sort((a, b) => b.winRate - a.winRate || b.modelProbability - a.modelProbability)[0];
        if (best) {
          if (search) {
            const hay = `${m.home} ${m.away} ${leagueLabel}`.toLowerCase();
            if (!hay.includes(search.toLowerCase())) continue;
          }
          out.push({ bet: best, matchLabel: `${m.home} vs ${m.away}`, league: leagueLabel });
        }
      } catch { /* skip */ }
    }
    return out.sort((a, b) => b.bet.winRate - a.bet.winRate);
  }, [matches, teams, leagues, selectedDate, selectedLeague, bankroll, search]);

  return (
    <div className="min-h-screen bg-background">
      {/* Header strip */}
      <div className="border-b border-border/60 bg-card/30 backdrop-blur">
        <div className="px-6 py-4 flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-center">
              <Zap className="h-5 w-5 text-primary" />
            </div>
            <div>
              <div className="font-bold text-lg leading-tight">Cento Power</div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Football Intelligence Terminal</div>
            </div>
          </div>
          <div className="flex-1 max-w-md ml-6 relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Caută echipă, ligă, market..."
              className="pl-9 h-9 bg-background/60"
            />
          </div>
          <div className="hidden md:flex items-center gap-6 text-xs">
            <KPI label="Ligi" value={totalLeagues} />
            <KPI label="Meciuri" value={totalMatches} />
            <KPI label="Value Bets" value={allBets.length} />
            <KPI label="Bankroll" value={`${bankroll.toFixed(0)} LEI`} />
          </div>
          <EdgeSettings filters={filters} setFilters={setFilters} bankroll={bankroll} />
        </div>
      </div>

      <div className="grid grid-cols-12 gap-0">
        {/* Left rail: Database tree */}
        <aside className="col-span-12 lg:col-span-3 xl:col-span-2 border-r border-border/60 p-4 min-h-[calc(100vh-72px)] bg-card/20">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-3 flex items-center gap-2">
            <Database className="h-3 w-3" /> Database
          </div>
          <DatabaseTree
            leagues={leagues}
            selected={selectedLeague}
            onSelect={setSelectedLeague}
            onDelete={handleDeleteLeague}
          />
        </aside>

        {/* Main content */}
        <main className="col-span-12 lg:col-span-9 xl:col-span-10 p-6">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="bg-card/40 border border-border/40">
              <TabsTrigger value="value"><Activity className="h-3.5 w-3.5 mr-2" />Value Engine</TabsTrigger>
              <TabsTrigger value="top"><Star className="h-3.5 w-3.5 mr-2" />Top Today</TabsTrigger>
              <TabsTrigger value="imports"><UploadCloud className="h-3.5 w-3.5 mr-2" />Imports</TabsTrigger>
              <TabsTrigger value="bankroll"><Wallet className="h-3.5 w-3.5 mr-2" />Bankroll</TabsTrigger>
            </TabsList>

            <TabsContent value="value" className="mt-4">
              <div className="flex flex-wrap items-center gap-3 mb-3">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className={cn('h-9', !selectedDate && 'text-muted-foreground')}>
                      <CalendarIcon className="h-4 w-4 mr-2" />
                      {selectedDate ? format(selectedDate, 'd MMM yyyy', { locale: ro }) : 'Alege dată meciuri'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      onSelect={setSelectedDate}
                      initialFocus
                      className={cn('p-3 pointer-events-auto')}
                    />
                  </PopoverContent>
                </Popover>
                {selectedDate && (
                  <>
                    <Badge variant="outline" className="border-primary/40 text-primary">
                      {matchesOnDate?.length || 0} meciuri în CSV pe {format(selectedDate, 'd MMM yyyy', { locale: ro })}
                    </Badge>
                    <Button variant="ghost" size="sm" className="h-8" onClick={() => setSelectedDate(undefined)}>
                      <X className="h-3.5 w-3.5 mr-1" /> Resetează data
                    </Button>
                  </>
                )}
              </div>
              <StickyFilters filters={filters} setFilters={setFilters} leagues={leagueNames} />
              {selectedDate ? (
                dateAnalyses.length === 0 ? (
                  <EmptyHint hasDate matchesOnDate={0} />
                ) : (
                  <div className="space-y-6">
                    {dateAnalyses.map(({ match, home, away, league }) => (
                      home && away ? (
                        <CentoVerdict
                          key={match.id}
                          match={match}
                          home={home}
                          away={away}
                          league={league}
                          bankroll={bankroll}
                        />
                      ) : (
                        <Card key={match.id} className="p-4 bg-card/40 text-sm text-muted-foreground">
                          {match.home} vs {match.away} — echipele nu au fost găsite în baza de date pentru această ligă.
                        </Card>
                      )
                    ))}
                  </div>
                )
              ) : (
                visibleBets.length === 0 ? (
                  <EmptyHint hasDate={false} matchesOnDate={0} />
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {visibleBets.map((b) => (
                      <ValueBetCard key={`${b.matchId}-${b.market}`} bet={b} onSave={saveBet} />
                    ))}
                  </div>
                )
              )}
            </TabsContent>

            <TabsContent value="top" className="mt-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-xs uppercase tracking-widest text-muted-foreground">Top Tipster · sortat după Win Rate</div>
                  <h2 className="font-bold text-2xl">
                    {selectedDate ? `Pronosticuri ${format(selectedDate, 'd MMM yyyy', { locale: ro })}` : 'Top Today'}
                  </h2>
                </div>
                <Badge variant="outline" className="border-primary/40 text-primary">{tipsterTop.length} selecții</Badge>
              </div>
              {tipsterTop.length === 0 ? <EmptyHint hasDate={!!selectedDate} matchesOnDate={matchesOnDate?.length || 0} /> : (
                <div className="space-y-3">
                  {tipsterTop.slice(0, 25).map((item, i) => (
                    <div key={`${item.matchLabel}-${i}`} className="flex items-center gap-3">
                      <div className={cn(
                        'shrink-0 w-10 h-10 rounded-lg flex items-center justify-center font-bold font-mono',
                        i === 0 ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30' :
                        i < 3 ? 'bg-primary/15 text-primary border border-primary/30' :
                        'bg-secondary/40 text-muted-foreground border border-border/40'
                      )}>
                        {i === 0 ? '⭐' : `#${i + 1}`}
                      </div>
                      <div className="flex-1 min-w-0">
                        <BetCard bet={item.bet} matchLabel={`${item.matchLabel} · ${item.league}`} rank={i + 1} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="imports" className="mt-4 space-y-4">
              <ImportDropzone onDone={onImportDone} />
              <ImportHistory userId={user?.id} />
            </TabsContent>

            <TabsContent value="bankroll" className="mt-4">
              <Card className="p-6">
                <div className="text-sm text-muted-foreground">Bankroll curent</div>
                <div className="font-mono text-3xl font-bold mt-1">{bankroll.toFixed(2)} LEI</div>
                <div className="text-xs text-muted-foreground mt-2">
                  Stake-urile sugerate folosesc Half-Kelly cu cap la 5% din bankroll. Configurează detaliile în Bankroll Manager.
                </div>
                <Button asChild variant="outline" size="sm" className="mt-4">
                  <a href="/bankroll">Deschide Bankroll Manager</a>
                </Button>
              </Card>
            </TabsContent>
          </Tabs>
        </main>
      </div>
    </div>
  );
}

function KPI({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="font-mono font-bold text-sm">{value}</div>
    </div>
  );
}

function EmptyHint({ hasDate, matchesOnDate }: { hasDate?: boolean; matchesOnDate?: number } = {}) {
  return (
    <Card className="p-12 text-center bg-card/40">
      <div className="text-base font-semibold mb-1">Niciun value bet detectat</div>
      <div className="text-sm text-muted-foreground">
        {hasDate
          ? `Pentru data selectată sunt ${matchesOnDate ?? 0} meciuri în CSV. Relaxează filtrele (Edge Min, interval cote) sau alege altă dată.`
          : 'Importă CSV-uri sau relaxează filtrele (Edge Min, interval cote).'}
      </div>
    </Card>
  );
}

function ImportHistory({ userId }: { userId?: string }) {
  const [rows, setRows] = useState<Array<{ id: string; league_name: string; season: string; file_type: string; rows_imported: number; duplicates: number; created_at: string; file_name: string }>>([]);
  useEffect(() => {
    if (!userId) return;
    supabase.from('cp_imports').select('*').order('created_at', { ascending: false }).limit(20).then(({ data }) => {
      setRows((data || []) as typeof rows);
    });
  }, [userId]);
  if (!rows.length) return null;
  return (
    <Card className="p-4">
      <div className="text-xs uppercase tracking-widest text-muted-foreground mb-3">Importuri recente</div>
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.id} className="flex items-center justify-between text-sm border-b border-border/40 pb-2 last:border-0">
            <div>
              <div className="font-medium">{r.league_name} <span className="text-muted-foreground font-mono text-xs">· {r.season}</span></div>
              <div className="text-[11px] text-muted-foreground">{r.file_name} · {r.file_type}</div>
            </div>
            <div className="text-right text-xs font-mono">
              <div>{r.rows_imported} rânduri</div>
              <div className="text-muted-foreground">{r.duplicates} dup.</div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}