import { useCallback, useRef, useState } from 'react';
import { UploadCloud, Loader2, FileText, CheckCircle2, X, Package, Database, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { importLeaguePackage, peekCsv, groupBundles, type ParsedLeagueCsv, type LeagueImportPackage } from '@/lib/cento/importer';
import type { CpImportResult } from '@/lib/cento/types';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

interface Props { onDone: (results: CpImportResult[]) => void }

const TYPE_LABEL: Record<string, string> = {
  league: 'League Stats',
  match: 'Match Database',
  team: 'Team Database',
  h2h: 'H2H',
  unknown: 'Needs Review',
};

export function ImportDropzone({ onDone }: Props) {
  const { user } = useAuth();
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [packages, setPackages] = useState<LeagueImportPackage[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const stage = useCallback(async (files: FileList | null) => {
    if (!files || !files.length) return;
    setBusy(true);
    try {
      const peeked = (await Promise.all(Array.from(files).map(async (f) => {
        try { return await peekCsv(f); } catch { return null; }
      }))).filter(Boolean) as ParsedLeagueCsv[];
      const newPackages = groupBundles(peeked);
      if (!newPackages.length) {
        toast({ title: 'Import nevalidat', description: 'Liga și sezonul trebuie detectate din coloanele CSV pentru a crea baza de date.' });
        return;
      }
      setPackages((cur) => {
        const merged = new Map(cur.map((b) => [b.key, b]));
        for (const nb of newPackages) {
          if (merged.has(nb.key)) {
            const ex = merged.get(nb.key)!;
            const seen = new Set(ex.entries.map((f) => f.file.name + f.file.size));
            for (const f of nb.entries) {
              if (!seen.has(f.file.name + f.file.size)) ex.entries.push(f);
            }
            ex.importStatus.hasLeagueStats = ex.importStatus.hasLeagueStats || nb.importStatus.hasLeagueStats;
            ex.importStatus.hasMatches = ex.importStatus.hasMatches || nb.importStatus.hasMatches;
            ex.importStatus.hasTeams = ex.importStatus.hasTeams || nb.importStatus.hasTeams;
            ex.stats.matchesCount += nb.stats.matchesCount;
            ex.stats.teamsCount += nb.stats.teamsCount;
            ex.coverage = nb.coverage.overall > ex.coverage.overall ? nb.coverage : ex.coverage;
          } else {
            merged.set(nb.key, nb);
          }
        }
        return Array.from(merged.values());
      });
    } finally {
      setBusy(false);
    }
  }, []);

  const removeFile = (bundleKey: string, fileIdx: number) => {
    setPackages((cur) => cur.flatMap((b) => {
      if (b.key !== bundleKey) return [b];
      const entries = b.entries.filter((_, i) => i !== fileIdx);
      if (!entries.length) return [];
      const rebuilt = groupBundles(entries);
      if (!rebuilt.length) return [];
      return [{
        ...b,
        ...rebuilt[0],
      }];
    }));
  };

  const importAll = async () => {
    if (!user) return;
    setBusy(true);
    const allResults: CpImportResult[] = [];
    for (const b of packages) {
      try {
        allResults.push(await importLeaguePackage(b, { ownerId: user.id }));
      } catch (e) {
        toast({ title: `Eroare la ${b.leagueName}`, description: (e as Error).message, variant: 'destructive' });
      }
    }
    setBusy(false);
    if (allResults.length) {
      const ligi = new Set(allResults.map((r) => `${r.league}::${r.season}`)).size;
      const totalRows = allResults.reduce((a, r) => a + r.rowsImported, 0);
      toast({ title: 'Import complet', description: `${ligi} ligă/sezon · ${totalRows} rânduri` });
      setPackages([]);
      onDone(allResults);
    }
  };

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); stage(e.dataTransfer.files); }}
        className={cn(
          'rounded-xl border-2 border-dashed p-8 text-center transition-all cursor-pointer',
          'bg-card/40 hover:bg-card/60',
          drag ? 'border-primary bg-primary/5' : 'border-border/60',
        )}
        onClick={() => inputRef.current?.click()}
      >
        <input ref={inputRef} type="file" multiple accept=".csv,text/csv" className="hidden"
          onChange={(e) => { stage(e.target.files); if (inputRef.current) inputRef.current.value = ''; }} />
        <div className="flex flex-col items-center gap-3">
          {busy ? <Loader2 className="h-9 w-9 animate-spin text-primary" /> : <Package className="h-9 w-9 text-primary" />}
          <div>
            <div className="font-semibold text-base">Import League Package</div>
            <div className="text-xs text-muted-foreground mt-1">
              Selectează simultan League · Matches · Team CSV — sistemul le grupează într-o singură ligă.
            </div>
          </div>
          <Button variant="outline" size="sm" disabled={busy}>
            <UploadCloud className="h-4 w-4 mr-2" /> Selectează fișiere
          </Button>
        </div>
      </div>

      {packages.map((b) => {
        const quality = b.coverage.overall >= 80 ? 'Excellent' : b.coverage.overall >= 55 ? 'Good' : 'Limited';
        return (
          <div key={b.key} className="rounded-lg border border-border/60 bg-card/40 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <Database className="h-4 w-4 text-primary" />
                  <h3 className="font-semibold text-base">{b.leagueName}</h3>
                </div>
                <div className="text-xs text-muted-foreground mt-1">Season: <span className="font-mono text-foreground">{b.season}</span></div>
              </div>
              <div className="flex items-center gap-1.5">
                <Pill ok={b.importStatus.hasLeagueStats} label="League Stats" />
                <Pill ok={b.importStatus.hasMatches} label="Match Database" />
                <Pill ok={b.importStatus.hasTeams} label="Team Database" />
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
              <Metric label="Matches" value={b.stats.matchesCount} />
              <Metric label="Teams" value={b.stats.teamsCount} />
              <Metric label="Coverage" value={`${b.coverage.overall}%`} />
              <Metric label="Data Quality" value={quality} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-3 text-xs">
              <Coverage label="League Data" value={b.coverage.leagueData} />
              <Coverage label="Match Data" value={b.coverage.matchData} />
              <Coverage label="Team Data" value={b.coverage.teamData} />
            </div>

            <div className="space-y-1.5">
              {b.entries.map((f, i) => (
                <div key={f.file.name + i} className="flex items-center gap-2 text-sm rounded-md border border-border/40 bg-background/40 px-2.5 py-1.5">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  <span className="truncate flex-1 font-mono text-xs">{f.file.name}</span>
                  <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                    {TYPE_LABEL[f.detectedType] || f.detectedType}
                  </Badge>
                  <span className="text-[11px] text-muted-foreground font-mono">{f.rowCount} rows</span>
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => removeFile(b.key, i)}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {packages.length > 0 && (
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={() => setPackages([])} disabled={busy}>Anulează</Button>
          <Button onClick={importAll} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
            Import {packages.length} {packages.length === 1 ? 'ligă' : 'ligi'}
          </Button>
        </div>
      )}
    </div>
  );
}

function Pill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'text-[10px] uppercase tracking-wider',
        ok ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
           : 'bg-muted/30 text-muted-foreground border-border/40 opacity-60',
      )}
    >
      {ok ? <ShieldCheck className="h-3 w-3 mr-1" /> : '○'} {label} {ok ? 'Loaded' : 'Missing'}
    </Badge>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-border/40 bg-background/40 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-mono font-semibold text-sm mt-0.5">{value}</div>
    </div>
  );
}

function Coverage({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border/40 bg-background/40 p-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-muted-foreground uppercase tracking-wider text-[10px]">{label}</span>
        <span className="font-mono text-[11px]">{value}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div className="h-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </div>
  );
}