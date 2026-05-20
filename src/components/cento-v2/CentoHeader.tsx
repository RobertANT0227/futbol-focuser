// CENTO-V2
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, Zap } from 'lucide-react';
import { UploadCenter } from '@/components/cento/UploadCenter';
import { useState } from 'react';
import type { SyncedLeague } from '@/lib/cento/persistence';

export function CentoHeader({
  title, leagues, activeLeagueId, setActiveLeagueId, onSynced,
}: {
  title: string;
  leagues: SyncedLeague[];
  activeLeagueId: string | null;
  setActiveLeagueId: (id: string | null) => void;
  onSynced: () => void;
}) {
  const [open, setOpen] = useState(false);
  const active = leagues.find((l) => l.id === activeLeagueId);
  return (
    <Card className="p-3 sm:p-4 flex items-center justify-between gap-3 flex-wrap border-border/60 bg-card/60 backdrop-blur-sm">
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-primary/15 text-primary">
          <Zap className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Cento Power</div>
          <h1 className="text-base sm:text-lg font-bold leading-tight truncate">{title}</h1>
          {active && (
            <div className="text-[11px] text-muted-foreground truncate">
              {active.country ? `${active.country} · ` : ''}{active.name} · {active.season}
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {leagues.length > 0 && (
          <Select value={activeLeagueId ?? ''} onValueChange={(v) => setActiveLeagueId(v)}>
            <SelectTrigger className="w-[220px] h-9 text-xs"><SelectValue placeholder="Alege liga" /></SelectTrigger>
            <SelectContent>
              {leagues.map((l) => (
                <SelectItem key={l.id} value={l.id} className="text-xs">
                  {l.country ? `${l.country} · ` : ''}{l.name} · {l.season}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button size="sm" className="h-9 gap-1.5 font-bold"><Upload className="h-3.5 w-3.5" /> Importă CSV</Button>
          </SheetTrigger>
          <SheetContent className="sm:max-w-xl overflow-y-auto">
            <SheetHeader><SheetTitle>Import FootyStats</SheetTitle></SheetHeader>
            <div className="mt-6">
              <UploadCenter onSynced={() => { setOpen(false); onSynced(); }} />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </Card>
  );
}