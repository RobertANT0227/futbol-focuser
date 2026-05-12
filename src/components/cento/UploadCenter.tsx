import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { parseFootyStatsFile, groupFiles, type ParsedFile } from '@/lib/cento/footystats';
import { persistBundle } from '@/lib/cento/persistence';
import { useAuth } from '@/contexts/AuthContext';
import { Upload, FileText, CheckCircle2, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';

interface FileItem {
  file: File;
  parsed?: ParsedFile;
  error?: string;
  parsing: boolean;
}

function completeness(obj: Record<string, unknown> | null | undefined): number {
  if (!obj) return 0;
  const keys = Object.keys(obj).filter((k) => k !== 'name' && k !== 'home' && k !== 'away');
  if (!keys.length) return 0;
  let filled = 0;
  for (const k of keys) {
    const v = (obj as any)[k];
    if (v === null || v === undefined) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (typeof v === 'number' && Number.isNaN(v)) continue;
    filled++;
  }
  return Math.round((filled / keys.length) * 100);
}

function fileCoverage(p?: ParsedFile): number {
  if (!p) return 0;
  if (p.league) return completeness(p.league as Record<string, unknown>);
  if (p.matches?.length) {
    const sum = p.matches.reduce((a, m) => a + completeness(m as unknown as Record<string, unknown>), 0);
    return Math.round(sum / p.matches.length);
  }
  if (p.teams?.length) {
    const sum = p.teams.reduce((a, t) => a + completeness(t as unknown as Record<string, unknown>), 0);
    return Math.round(sum / p.teams.length);
  }
  return 0;
}

function coverageColor(pct: number): string {
  if (pct >= 80) return 'text-emerald-500';
  if (pct >= 55) return 'text-amber-500';
  return 'text-destructive';
}

export function UploadCenter({ onSynced }: { onSynced?: () => void }) {
  const { user } = useAuth();
  const [items, setItems] = useState<FileItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const handleFiles = useCallback(async (files: File[]) => {
    const accepted = files.filter((f) => /\.csv$/i.test(f.name));
    if (!accepted.length) return;
    const next: FileItem[] = accepted.map((f) => ({ file: f, parsing: true }));
    setItems((prev) => [...prev, ...next]);
    for (const it of next) {
      try {
        const parsed = await parseFootyStatsFile(it.file);
        setItems((prev) => prev.map((p) => p.file === it.file ? { ...p, parsed, parsing: false } : p));
      } catch (e: any) {
        setItems((prev) => prev.map((p) => p.file === it.file ? { ...p, error: e?.message ?? 'parse error', parsing: false } : p));
      }
    }
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    handleFiles(Array.from(e.dataTransfer.files));
  }, [handleFiles]);

  const remove = (file: File) => setItems((prev) => prev.filter((p) => p.file !== file));

  const sync = async () => {
    if (!user) return;
    const parsed = items.map((i) => i.parsed).filter(Boolean) as ParsedFile[];
    if (!parsed.length) return;
    setSyncing(true);
    try {
      const bundles = groupFiles(parsed);
      for (const b of bundles) {
        await persistBundle(b, user.id);
      }
      toast({ title: 'League Successfully Synced', description: `${bundles.length} ligă/li importate.` });
      setItems([]);
      onSynced?.();
    } catch (e: any) {
      toast({ title: 'Eroare la import', description: e?.message ?? 'unknown', variant: 'destructive' });
    } finally {
      setSyncing(false);
    }
  };

  const bundles = groupFiles(items.map((i) => i.parsed).filter(Boolean) as ParsedFile[]);

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={cn(
          'rounded-xl border-2 border-dashed p-8 text-center transition-all cursor-pointer',
          dragOver ? 'border-primary bg-primary/10' : 'border-border bg-card/40 hover:bg-card/60',
        )}
        onClick={() => document.getElementById('cp-file-input')?.click()}
      >
        <input
          id="cp-file-input" type="file" multiple accept=".csv" className="hidden"
          onChange={(e) => e.target.files && handleFiles(Array.from(e.target.files))}
        />
        <Upload className="h-8 w-8 mx-auto text-primary mb-2" />
        <div className="text-sm font-bold">Drag & drop CSV-uri FootyStats</div>
        <div className="text-xs text-muted-foreground mt-1">league + matches + teams · selectează simultan toate cele 3 fișiere</div>
      </div>

      {items.length > 0 && (
        <div className="space-y-2">
          {items.map((it, i) => (
            <Card key={i} className="p-3 bg-card/60 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="h-4 w-4 text-primary shrink-0" />
                  <div className="min-w-0">
                    <div className="text-xs font-medium truncate">{it.file.name}</div>
                    {it.parsed && (
                      <div className="text-[10px] text-muted-foreground">
                        {it.parsed.meta.leagueName} · {it.parsed.meta.season} · <span className="capitalize">{it.parsed.meta.kind}</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {it.parsing && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                  {it.parsed && <CheckCircle2 className="h-4 w-4 text-primary" />}
                  {it.error && <Badge variant="destructive" className="text-[10px]">eroare</Badge>}
                  <button onClick={() => remove(it.file)} className="text-muted-foreground hover:text-destructive">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              {it.parsed && (() => {
                const pct = fileCoverage(it.parsed);
                return (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-muted-foreground uppercase tracking-widest">Informație disponibilă</span>
                      <span className={cn('font-mono font-bold', coverageColor(pct))}>{pct}%</span>
                    </div>
                    <Progress value={pct} className="h-1.5" />
                  </div>
                );
              })()}
            </Card>
          ))}
        </div>
      )}

      {bundles.length > 0 && (
        <Card className="p-3 bg-card/60 space-y-3">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Grupare automată</div>
          {bundles.map((b, i) => {
            const lp = b.league ? completeness(b.league as unknown as Record<string, unknown>) : 0;
            const mp = b.matches?.length
              ? Math.round(b.matches.reduce((a, m) => a + completeness(m as unknown as Record<string, unknown>), 0) / b.matches.length)
              : 0;
            const tp = b.teams?.length
              ? Math.round(b.teams.reduce((a, t) => a + completeness(t as unknown as Record<string, unknown>), 0) / b.teams.length)
              : 0;
            const overall = Math.round((lp + mp + tp) / 3);
            return (
              <div key={i} className="space-y-2 border-t pt-2 first:border-t-0 first:pt-0">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold truncate">{b.meta.leagueName} <span className="text-muted-foreground font-normal">· {b.meta.season}</span></span>
                  <span className={cn('font-mono font-bold text-[11px]', coverageColor(overall))}>{overall}% total</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-[10px]">
                  {[
                    { label: 'League', pct: lp, present: !!b.league },
                    { label: 'Matches', pct: mp, present: !!b.matches?.length, count: b.matches?.length },
                    { label: 'Teams', pct: tp, present: !!b.teams?.length, count: b.teams?.length },
                  ].map((s) => (
                    <div key={s.label} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="uppercase tracking-widest text-muted-foreground">{s.label}{s.count ? ` ·${s.count}` : ''}</span>
                        <span className={cn('font-mono font-bold', s.present ? coverageColor(s.pct) : 'text-muted-foreground/60')}>
                          {s.present ? `${s.pct}%` : '—'}
                        </span>
                      </div>
                      <Progress value={s.present ? s.pct : 0} className="h-1" />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </Card>
      )}

      <div className="flex justify-end">
        <Button onClick={sync} disabled={!bundles.length || syncing} className="font-bold">
          {syncing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sincronizare...</> : `Sync ${bundles.length || ''} ligă/li`}
        </Button>
      </div>
    </div>
  );
}