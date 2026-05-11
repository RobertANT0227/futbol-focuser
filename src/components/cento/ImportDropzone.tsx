import { useCallback, useRef, useState } from 'react';
import { UploadCloud, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { importCsvFile } from '@/lib/cento/importer';
import type { CpImportResult } from '@/lib/cento/types';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

interface Props { onDone: (results: CpImportResult[]) => void }

export function ImportDropzone({ onDone }: Props) {
  const { user } = useAuth();
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handle = useCallback(async (files: FileList | null) => {
    if (!files || !files.length || !user) return;
    setBusy(true);
    const results: CpImportResult[] = [];
    for (const f of Array.from(files)) {
      try {
        const r = await importCsvFile(f, { ownerId: user.id });
        results.push(r);
      } catch (e) {
        toast({ title: `Eroare la ${f.name}`, description: (e as Error).message, variant: 'destructive' });
      }
    }
    setBusy(false);
    if (results.length) {
      const totalRows = results.reduce((a, r) => a + r.rowsImported, 0);
      const totalDup = results.reduce((a, r) => a + r.duplicates, 0);
      const ligi = new Set(results.map((r) => r.league)).size;
      toast({ title: 'Import complet', description: `${ligi} ligi · ${totalRows} rânduri · ${totalDup} duplicate` });
      onDone(results);
    }
  }, [user, onDone]);

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); handle(e.dataTransfer.files); }}
      className={cn(
        'rounded-xl border-2 border-dashed p-10 text-center transition-all cursor-pointer',
        'bg-card/40 hover:bg-card/60',
        drag ? 'border-primary bg-primary/5' : 'border-border/60',
      )}
      onClick={() => inputRef.current?.click()}
    >
      <input ref={inputRef} type="file" multiple accept=".csv,text/csv" className="hidden"
        onChange={(e) => handle(e.target.files)} />
      <div className="flex flex-col items-center gap-3">
        {busy ? <Loader2 className="h-10 w-10 animate-spin text-primary" /> : <UploadCloud className="h-10 w-10 text-primary" />}
        <div>
          <div className="font-semibold text-base">Drop CSV files (League · Team · H2H · Match)</div>
          <div className="text-xs text-muted-foreground mt-1">Multi-file · auto-detect ligă, sezon și tip · merge fără duplicate</div>
        </div>
        <Button variant="outline" size="sm" disabled={busy}>Selectează fișiere</Button>
      </div>
    </div>
  );
}
