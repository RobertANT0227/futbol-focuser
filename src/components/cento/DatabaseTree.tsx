import { useState } from 'react';
import { ChevronDown, ChevronRight, Trash2, Database, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface DbLeague { id: string; name: string; season: string; teams: number; matches: number }

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
              {list.map((l) => (
                <div key={l.id} className="flex items-center gap-1 group">
                  <button
                    onClick={() => onSelect(l.id)}
                    className={cn(
                      'flex-1 flex items-center justify-between px-2 py-1.5 rounded text-xs hover:bg-muted/40',
                      selected === l.id && 'bg-primary/10 text-primary'
                    )}
                  >
                    <span className="font-mono">{l.season}</span>
                    <span className="text-muted-foreground text-[10px]">{l.teams}T · {l.matches}M</span>
                  </button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100"
                    onClick={() => onDelete(l.id)}>
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
