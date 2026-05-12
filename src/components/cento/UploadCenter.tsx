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

interface FileItem {
  file: File;
  parsed?: ParsedFile;
  error?: string;
  parsing: boolean;
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
            <Card key={i} className="p-3 flex items-center justify-between gap-3 bg-card/60">
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
            </Card>
          ))}
        </div>
      )}

      {bundles.length > 0 && (
        <Card className="p-3 bg-card/60 space-y-2">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Grupare automată</div>
          {bundles.map((b, i) => (
            <div key={i} className="flex items-center justify-between text-xs">
              <span className="font-bold">{b.meta.leagueName} <span className="text-muted-foreground font-normal">· {b.meta.season}</span></span>
              <span className="text-muted-foreground font-mono">
                {b.league ? '✓ league ' : ''}{b.matches ? `✓ ${b.matches.length} matches ` : ''}{b.teams ? `✓ ${b.teams.length} teams` : ''}
              </span>
            </div>
          ))}
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