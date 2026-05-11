import { useEffect, useMemo, useState, useCallback } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Search, Zap, UploadCloud, Database, Activity, Wallet, Star } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import { ImportDropzone } from '@/components/cento/ImportDropzone';
import { DatabaseTree, type DbLeague } from '@/components/cento/DatabaseTree';
import { ValueBetCard } from '@/components/cento/ValueBetCard';
import { StickyFilters, type CentoFilters } from '@/components/cento/StickyFilters';
import { buildValueBets } from '@/lib/cento/valueEngine';
import type { CpTeam, CpMatch, ValueBet, CpImportResult } from '@/lib/cento/types';
import { loadBankroll } from '@/lib/bankroll';

const initialFilters: CentoFilters = {
  edgeMin: 3, oddsMin: 1.4, oddsMax: 8, risk: 'all', market: 'all', league: 'all',
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

  const reload = useCallback(async () => {
    if (!user) return;
    const [{ data: lg }, { data: tm }, { data: mt }] = await Promise.all([
      supabase.from('cp_leagues').select('id,name,season').order('name'),
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

  const bankroll = useMemo(() => loadBankroll().current, []);

  // Compute value bets across DB
  const allBets = useMemo<ValueBet[]>(() => {
    if (!matches.length || !teams.length) return [];
    const teamMap = new Map<string, CpTeam>();
    teams.forEach((t) => teamMap.set(`${t.league_id}::${t.name.toLowerCase()}`, t));
    const out: ValueBet[] = [];
    for (const m of matches) {
      const home = teamMap.get(`${m.league_id}::${m.home.toLowerCase()}`);
      const away = teamMap.get(`${m.league_id}::${m.away.toLowerCase()}`);
      if (!home || !away) continue;
      const lg = leagues.find((l) => l.id === m.league_id);
      const bets = buildValueBets(m, home, away, {
        bankroll, edgeMin: 0, kellyFraction: 0.5, maxStakePct: 0.05,
      });
      bets.forEach((b) => { b.league = lg ? `${lg.name} · ${lg.season}` : ''; out.push(b); });
    }
    return out;
  }, [matches, teams, leagues, bankroll]);

  const filteredBets = useMemo(() => {
    return allBets.filter((b) => {
      if (selectedLeague && !b.league.includes(leagues.find((l) => l.id === selectedLeague)?.name || '____')) return false;
      if (b.edge < filters.edgeMin) return false;
      if (b.odds < filters.oddsMin || b.odds > filters.oddsMax) return false;
      if (filters.risk !== 'all' && b.risk !== filters.risk) return false;
      if (filters.market !== 'all' && b.category !== filters.market) return false;
      if (filters.league !== 'all' && !b.league.startsWith(filters.league)) return false;
      if (search && !`${b.home} ${b.away} ${b.league}`.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    }).sort((a, b) => b.edge - a.edge);
  }, [allBets, filters, search, selectedLeague, leagues]);

  const leagueNames = useMemo(() => Array.from(new Set(leagues.map((l) => l.name))), [leagues]);

  const handleDeleteLeague = async (id: string) => {
    if (!confirm('Șterge această ligă și toate datele aferente?')) return;
    const { error } = await supabase.from('cp_leagues').delete().eq('id', id);
    if (error) toast({ title: 'Eroare', description: error.message, variant: 'destructive' });
    else { toast({ title: 'Ligă ștearsă' }); reload(); }
  };

  const saveBet = async (bet: ValueBet) => {
    if (!user) return;
    await supabase.from('cp_watchlist').insert({ owner_id: user.id, payload: bet as unknown as Record<string, unknown> });
    toast({ title: 'Salvat în watchlist' });
  };

  const onImportDone = async (_results: CpImportResult[]) => { await reload(); setTab('value'); };

  // KPIs
  const totalMatches = matches.length;
  const totalLeagues = leagues.length;
  const topBets = filteredBets.slice(0, 12);

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
              <StickyFilters filters={filters} setFilters={setFilters} leagues={leagueNames} />
              {filteredBets.length === 0 ? (
                <EmptyHint />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {filteredBets.map((b) => (
                    <ValueBetCard key={`${b.matchId}-${b.market}`} bet={b} onSave={saveBet} />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="top" className="mt-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-xs uppercase tracking-widest text-muted-foreground">Top Value Bets</div>
                  <h2 className="font-bold text-2xl">Today's Best Edges</h2>
                </div>
                <Badge variant="outline" className="border-primary/40 text-primary">Auto-Shortlist</Badge>
              </div>
              {topBets.length === 0 ? <EmptyHint /> : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {topBets.map((b) => <ValueBetCard key={`${b.matchId}-${b.market}`} bet={b} onSave={saveBet} />)}
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

function EmptyHint() {
  return (
    <Card className="p-12 text-center bg-card/40">
      <div className="text-base font-semibold mb-1">Niciun value bet detectat</div>
      <div className="text-sm text-muted-foreground">
        Importă CSV-uri sau relaxează filtrele (Edge Min, interval cote).
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