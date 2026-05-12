import { useState } from 'react';
import { ChevronDown, ChevronRight, Trash2, Database, Layers, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface DbLeague {
  id: string; name: string; season: string; country?: string | null; teams: number; matches: number;
  has_league_stats?: boolean; has_matches?: boolean; has_teams?: boolean;
  matches_count?: number; teams_count?: number; coverage?: Record<string, unknown> | null;
}

interface Props {
  leagues: DbLeague[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  onDelete: (id: string) => void;
}

export function DatabaseTree({ leagues, selected, onSelect, onDelete }: Props) {
  const grouped = leagues.reduce<Record<string, DbLeague[]>>((acc, l) => {
    (acc[l.name] = acc[l.name] || []).push(l);
    return acc;
  }, {});
  const [openLeagues, setOpenLeagues] = useState<Record<string, boolean>>({});

  if (!leagues.length) {
    return (
      <div className="text-center text-sm text-muted-foreground py-12 px-4 border border-dashed border-border/60 rounded-lg">
        <Database className="h-8 w-8 mx-auto mb-2 opacity-50" />
        Nicio ligă încă. Importă CSV-uri pentru a începe.
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <button
        onClick={() => onSelect(null)}
        className={cn(
          'w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-muted/50',
          !selected && 'bg-primary/10 text-primary'
        )}
      >
        <Layers className="h-4 w-4" /> Toate ligile
        <span className="ml-auto text-[10px] text-muted-foreground font-mono">
          {leagues.reduce((a, l) => a + l.matches, 0)}
        </span>
      </button>
      {Object.entries(grouped).map(([name, list]) => (
        <div key={name}>
          <button
            className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-muted/40 text-left"
            onClick={() => setOpenLeagues((s) => ({ ...s, [name]: !s[name] }))}
          >
            {openLeagues[name] ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            <span className="font-semibold truncate">{name}</span>
          </button>
          {openLeagues[name] && (
            <div className="ml-5 border-l border-border/40 pl-2 space-y-1 py-1">
              {list.map((l) => {
                const coverage = Number(l.coverage?.overall || 0);
                return (
                <div key={l.id} className="flex items-center gap-1 group">
                  <button
                    onClick={() => onSelect(l.id)}
                    className={cn(
                      'flex-1 px-2 py-1.5 rounded text-xs hover:bg-muted/40 text-left',
                      selected === l.id && 'bg-primary/10 text-primary'
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono">{l.season}</span>
                      <span className="text-muted-foreground text-[10px]">{l.teams_count ?? l.teams}T · {l.matches_count ?? l.matches}M</span>
                    </div>
                    <div className="mt-1 flex items-center gap-1 text-[9px] text-muted-foreground">
                      <StatusDot ok={Boolean(l.has_league_stats)} label="L" />
                      <StatusDot ok={Boolean(l.has_matches)} label="M" />
                      <StatusDot ok={Boolean(l.has_teams)} label="T" />
                      {coverage > 0 && <span className="ml-auto font-mono">{coverage}%</span>}
                    </div>
                  </button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100"
                    onClick={() => onDelete(l.id)}>
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              );})}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function StatusDot({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={cn('inline-flex items-center gap-0.5', ok ? 'text-emerald-400' : 'text-muted-foreground/50')}>
      {ok ? <CheckCircle2 className="h-2.5 w-2.5" /> : <span className="h-2 w-2 rounded-full border border-current" />} {label}
    </span>
  );
}
