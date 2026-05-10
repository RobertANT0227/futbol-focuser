import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import {
  parseCsvText,
  rowToTeamStats,
  buildLeagueFixtures,
  buildMatchesFromMatchCsv,
  scanMatches,
  betsToCsv,
  addToWatchlist,
  loadWatchlist,
  saveWatchlist,
  type ScannedBet,
  type ParsedCsv,
} from '@/lib/csvScanner';

type Filters = {
  wrMin: number;
  evMin: number;
  oddsMin: number;
  oddsMax: number;
  risk: string;
  category: string;
  styleMismatchOnly: boolean;
};

const initialFilters: Filters = {
  wrMin: 0, evMin: -100, oddsMin: 1, oddsMax: 20,
  risk: 'all', category: 'all', styleMismatchOnly: false,
};

const RISK_COLOR: Record<string, string> = {
  low: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  medium: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  high: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
};

export default function CentoPower() {
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [leagueName, setLeagueName] = useState('Liga');
  const [bets, setBets] = useState<ScannedBet[]>([]);
  const [scanning, setScanning] = useState(false);
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [watch, setWatch] = useState<ScannedBet[]>(loadWatchlist());

  const handleFile = async (file: File) => {
    const text = await file.text();
    const p = parseCsvText(text);
    setParsed(p);
    setBets([]);
    toast({ title: 'CSV importat', description: `Tip detectat: ${p.type.toUpperCase()} • ${p.rows.length} rânduri • ${Object.keys(p.map).length} coloane mapate` });
  };

  const handleScan = () => {
    if (!parsed) return;
    setScanning(true);
    setTimeout(() => {
      try {
        let matches: { match: import('@/lib/types').MatchData }[] = [];
        if (parsed.type === 'match') {
          matches = buildMatchesFromMatchCsv(parsed.rows, parsed.map, leagueName);
        } else {
          // league or team — build TeamStats[]
          const teams = parsed.rows.map((r, i) => rowToTeamStats(r, parsed.map, `Team ${i + 1}`));
          matches = buildLeagueFixtures(teams, leagueName);
        }
        const result = scanMatches(matches);
        setBets(result);
        toast({ title: 'Scanare completă', description: `${matches.length} meciuri analizate • ${result.length} pariuri generate` });
      } catch (e) {
        toast({ title: 'Eroare', description: String(e), variant: 'destructive' });
      } finally {
        setScanning(false);
      }
    }, 50);
  };

  const filtered = useMemo(() => {
    return bets.filter((b) =>
      b.winRate >= filters.wrMin &&
      b.ev * 100 >= filters.evMin &&
      b.odds >= filters.oddsMin && b.odds <= filters.oddsMax &&
      (filters.risk === 'all' || b.risk === filters.risk) &&
      (filters.category === 'all' || b.category === filters.category) &&
      (!filters.styleMismatchOnly || b.styleMismatch),
    );
  }, [bets, filters]);

  const tabs = useMemo(() => ({
    bestValue: [...filtered].sort((a, b) => b.ev - a.ev).slice(0, 50),
    highWR: [...filtered].sort((a, b) => b.winRate - a.winRate).slice(0, 50),
    lowRisk: filtered.filter((b) => b.risk === 'low').sort((a, b) => b.winRate - a.winRate).slice(0, 50),
    mismatch: filtered.filter((b) => b.styleMismatch).sort((a, b) => b.ev - a.ev).slice(0, 50),
    highEV: filtered.filter((b) => b.ev * 100 >= 10).sort((a, b) => b.ev - a.ev).slice(0, 50),
  }), [filtered]);

  const exportCsv = () => {
    const csv = betsToCsv(filtered);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `cento-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const exportXlsx = () => {
    const ws = XLSX.utils.json_to_sheet(filtered);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Cento Bets');
    XLSX.writeFile(wb, `cento-${Date.now()}.xlsx`);
  };

  const addAllToWatchlist = () => {
    filtered.forEach(addToWatchlist);
    setWatch(loadWatchlist());
    toast({ title: 'Watchlist', description: `${filtered.length} pariuri salvate` });
  };

  return (
    <div className="container max-w-7xl mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">⚡ Cento Power — CSV League Scanner</h1>
        <p className="text-sm text-muted-foreground">Importă CSV cu statistici sau meciuri și generează automat top bets pe toată liga.</p>
      </div>

      {/* Upload */}
      <Card>
        <CardHeader><CardTitle className="text-base">1. Import CSV</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-3 items-end flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <Label className="text-xs">Fișier CSV</Label>
              <Input type="file" accept=".csv,text/csv" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
            </div>
            <div>
              <Label className="text-xs">Nume ligă</Label>
              <Input value={leagueName} onChange={(e) => setLeagueName(e.target.value)} className="w-40" />
            </div>
            <Button onClick={handleScan} disabled={!parsed || scanning} className="font-bold">
              {scanning ? '⏳ Scanez...' : '🔬 Scan League'}
            </Button>
          </div>

          {parsed && (
            <div className="text-xs space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline">Tip: {parsed.type.toUpperCase()}</Badge>
                <Badge variant="outline">{parsed.rows.length} rânduri</Badge>
                <Badge variant="outline">{parsed.headers.length} coloane</Badge>
                <Badge variant="outline">{Object.keys(parsed.map).length} mapate</Badge>
              </div>
              <details className="border border-border rounded-md p-2">
                <summary className="cursor-pointer text-muted-foreground">Coloane detectate ({Object.keys(parsed.map).length})</summary>
                <div className="mt-2 grid grid-cols-2 md:grid-cols-3 gap-1 font-mono">
                  {Object.entries(parsed.map).map(([k, v]) => (
                    <div key={k}><span className="text-primary">{k}</span> ← {v}</div>
                  ))}
                </div>
              </details>
            </div>
          )}
        </CardContent>
      </Card>

      {bets.length > 0 && (
        <>
          {/* Filters */}
          <Card>
            <CardHeader><CardTitle className="text-base">2. Filtre</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                <div><Label className="text-xs">WR min %</Label><Input type="number" value={filters.wrMin} onChange={(e) => setFilters({ ...filters, wrMin: +e.target.value })} /></div>
                <div><Label className="text-xs">EV min %</Label><Input type="number" value={filters.evMin} onChange={(e) => setFilters({ ...filters, evMin: +e.target.value })} /></div>
                <div><Label className="text-xs">Odds min</Label><Input type="number" step="0.05" value={filters.oddsMin} onChange={(e) => setFilters({ ...filters, oddsMin: +e.target.value })} /></div>
                <div><Label className="text-xs">Odds max</Label><Input type="number" step="0.05" value={filters.oddsMax} onChange={(e) => setFilters({ ...filters, oddsMax: +e.target.value })} /></div>
                <div>
                  <Label className="text-xs">Risk</Label>
                  <Select value={filters.risk} onValueChange={(v) => setFilters({ ...filters, risk: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Toate</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Bet type</Label>
                  <Select value={filters.category} onValueChange={(v) => setFilters({ ...filters, category: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Toate</SelectItem>
                      <SelectItem value="goals">Goals</SelectItem>
                      <SelectItem value="winner">1X2</SelectItem>
                      <SelectItem value="corners">Corners</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input type="checkbox" checked={filters.styleMismatchOnly} onChange={(e) => setFilters({ ...filters, styleMismatchOnly: e.target.checked })} />
                    Doar style mismatch
                  </label>
                </div>
              </div>
              <div className="flex gap-2 mt-3 flex-wrap">
                <Button size="sm" variant="outline" onClick={exportCsv}>📄 Export CSV</Button>
                <Button size="sm" variant="outline" onClick={exportXlsx}>📊 Export Excel</Button>
                <Button size="sm" variant="outline" onClick={addAllToWatchlist}>⭐ Salvează în Watchlist ({filtered.length})</Button>
                <Button size="sm" variant="ghost" onClick={() => setFilters(initialFilters)}>Reset</Button>
              </div>
            </CardContent>
          </Card>

          {/* Mass Scanner Tabs */}
          <Card>
            <CardHeader><CardTitle className="text-base">3. Mass Scanner — {filtered.length} pariuri</CardTitle></CardHeader>
            <CardContent>
              <Tabs defaultValue="bestValue">
                <TabsList className="flex-wrap h-auto">
                  <TabsTrigger value="bestValue">💰 Best Value ({tabs.bestValue.length})</TabsTrigger>
                  <TabsTrigger value="highWR">🎯 Highest WR ({tabs.highWR.length})</TabsTrigger>
                  <TabsTrigger value="lowRisk">🛡️ Low Risk ({tabs.lowRisk.length})</TabsTrigger>
                  <TabsTrigger value="mismatch">⚔️ Style Mismatch ({tabs.mismatch.length})</TabsTrigger>
                  <TabsTrigger value="highEV">🚀 High EV ({tabs.highEV.length})</TabsTrigger>
                </TabsList>
                {(['bestValue', 'highWR', 'lowRisk', 'mismatch', 'highEV'] as const).map((k) => (
                  <TabsContent key={k} value={k}>
                    <BetTable bets={tabs[k]} />
                  </TabsContent>
                ))}
              </Tabs>
            </CardContent>
          </Card>
        </>
      )}

      {watch.length > 0 && (
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">⭐ Watchlist ({watch.length})</CardTitle>
            <Button size="sm" variant="ghost" onClick={() => { saveWatchlist([]); setWatch([]); }}>Golește</Button>
          </CardHeader>
          <CardContent><BetTable bets={watch} /></CardContent>
        </Card>
      )}
    </div>
  );
}

function BetTable({ bets }: { bets: ScannedBet[] }) {
  if (!bets.length) return <p className="text-sm text-muted-foreground py-6 text-center">Niciun pariu.</p>;
  return (
    <div className="overflow-auto max-h-[500px]">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Meci</TableHead>
            <TableHead>Selecție</TableHead>
            <TableHead className="text-right">Cotă</TableHead>
            <TableHead className="text-right">WR</TableHead>
            <TableHead className="text-right">EV</TableHead>
            <TableHead>Risk</TableHead>
            <TableHead className="text-right">Stake</TableHead>
            <TableHead>Flags</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {bets.map((b, i) => (
            <TableRow key={i}>
              <TableCell className="text-xs font-mono">{b.matchLabel}</TableCell>
              <TableCell className="text-xs">{b.selection}</TableCell>
              <TableCell className="text-right font-mono">{b.odds.toFixed(2)}</TableCell>
              <TableCell className="text-right font-mono">{b.winRate.toFixed(1)}%</TableCell>
              <TableCell className={`text-right font-mono ${b.ev > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{(b.ev * 100).toFixed(1)}%</TableCell>
              <TableCell><Badge className={RISK_COLOR[b.risk]}>{b.risk}</Badge></TableCell>
              <TableCell className="text-right font-mono text-xs">{b.stakeLei.toFixed(0)} LEI</TableCell>
              <TableCell className="text-xs">
                {b.styleMismatch && <Badge variant="outline" className="mr-1">⚔️</Badge>}
                {b.fragile && <Badge variant="outline" className="text-amber-400">⚠️</Badge>}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}