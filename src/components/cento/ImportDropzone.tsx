import { useCallback, useRef, useState } from 'react';
import { UploadCloud, Loader2, FileText, AlertTriangle, CheckCircle2, X, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { importCsvFile, peekCsv, groupBundles, type PeekedFile, type FileBundle } from '@/lib/cento/importer';
import type { CpImportResult } from '@/lib/cento/types';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

interface Props { onDone: (results: CpImportResult[]) => void }

const TYPE_LABEL: Record<string, string> = {
  league: 'League Table',
  match: 'Matches',
  team: 'Team Stats',
  h2h: 'H2H',
  unknown: 'Unknown',
};

export function ImportDropzone({ onDone }: Props) {
  const { user } = useAuth();
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [bundles, setBundles] = useState<FileBundle[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const stage = useCallback(async (files: FileList | null) => {
    if (!files || !files.length) return;
    setBusy(true);
    try {
      const peeked: PeekedFile[] = [];
      for (const f of Array.from(files)) {
        try { peeked.push(await peekCsv(f)); } catch { /* ignore */ }
      }
      const newBundles = groupBundles(peeked);
      // merge with existing staged bundles by key
      setBundles((cur) => {
        const merged = new Map(cur.map((b) => [b.key, b]));
        for (const nb of newBundles) {
          if (merged.has(nb.key)) {
            const ex = merged.get(nb.key)!;
            const seen = new Set(ex.files.map((f) => f.file.name + f.file.size));
            for (const f of nb.files) {
              if (!seen.has(f.file.name + f.file.size)) ex.files.push(f);
            }
            ex.hasLeague = ex.hasLeague || nb.hasLeague;
            ex.hasMatches = ex.hasMatches || nb.hasMatches;
            ex.hasTeam = ex.hasTeam || nb.hasTeam;
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

  const updateBundle = (key: string, patch: Partial<FileBundle>) => {
    setBundles((cur) => cur.map((b) => (b.key === key ? { ...b, ...patch } : b)));
  };

  const removeFile = (bundleKey: string, fileIdx: number) => {
    setBundles((cur) => cur.flatMap((b) => {
      if (b.key !== bundleKey) return [b];
      const files = b.files.filter((_, i) => i !== fileIdx);
      if (!files.length) return [];
      return [{
        ...b,
        files,
        hasLeague: files.some((f) => f.detectedType === 'league'),
        hasMatches: files.some((f) => f.detectedType === 'match'),
        hasTeam: files.some((f) => f.detectedType === 'team'),
      }];
    }));
  };

  const importAll = async () => {
    if (!user) return;
    setBusy(true);
    const allResults: CpImportResult[] = [];
    for (const b of bundles) {
      // Order: league → team → matches (so teams have their league row first)
      const ordered = [...b.files].sort((a, c) => order(a.detectedType) - order(c.detectedType));
      for (const p of ordered) {
        try {
          const r = await importCsvFile(p.file, {
            ownerId: user.id,
            defaultLeague: b.league,
            defaultSeason: b.season,
          });
          allResults.push({ ...r, league: b.league, season: b.season });
        } catch (e) {
          toast({ title: `Eroare la ${p.file.name}`, description: (e as Error).message, variant: 'destructive' });
        }
      }
    }
    setBusy(false);
    if (allResults.length) {
      const ligi = new Set(allResults.map((r) => `${r.league}::${r.season}`)).size;
      const totalRows = allResults.reduce((a, r) => a + r.rowsImported, 0);
      toast({ title: 'Import complet', description: `${ligi} ligă/sezon · ${totalRows} rânduri` });
      setBundles([]);
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

      {bundles.map((b) => {
        const missing: string[] = [];
        if (!b.hasLeague) missing.push('League');
        if (!b.hasMatches) missing.push('Matches');
        if (!b.hasTeam) missing.push('Team');
        return (
          <div key={b.key} className="rounded-lg border border-border/60 bg-card/40 p-4">
            <div className="flex flex-wrap items-end gap-3 mb-3">
              <div className="flex-1 min-w-[200px]">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Ligă</div>
                <Input className="h-9" value={b.league} onChange={(e) => updateBundle(b.key, { league: e.target.value })} />
              </div>
              <div className="w-32">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Sezon</div>
                <Input className="h-9 font-mono" value={b.season} onChange={(e) => updateBundle(b.key, { season: e.target.value })} />
              </div>
              <div className="flex items-center gap-1">
                <Pill ok={b.hasLeague} label="League" />
                <Pill ok={b.hasMatches} label="Matches" />
                <Pill ok={b.hasTeam} label="Team" />
              </div>
            </div>

            <div className="space-y-1.5">
              {b.files.map((f, i) => (
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

            {missing.length > 0 && (
              <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                <span>Lipsesc: <strong>{missing.join(', ')}</strong>. Analiza va funcționa, dar calitatea poate fi redusă.</span>
              </div>
            )}
          </div>
        );
      })}

      {bundles.length > 0 && (
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={() => setBundles([])} disabled={busy}>Anulează</Button>
          <Button onClick={importAll} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
            Import {bundles.length} {bundles.length === 1 ? 'ligă' : 'ligi'}
          </Button>
        </div>
      )}
    </div>
  );
}

function order(t: string) {
  if (t === 'league') return 0;
  if (t === 'team') return 1;
  if (t === 'match') return 2;
  return 3;
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
      {ok ? '✓' : '○'} {label}
    </Badge>
  );
}