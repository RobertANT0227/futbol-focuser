import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';

export interface CentoFilters {
  edgeMin: number;
  oddsMin: number;
  oddsMax: number;
  risk: string;
  market: string;
  league: string;
}

interface Props {
  filters: CentoFilters;
  setFilters: (f: CentoFilters) => void;
  leagues: string[];
}

export function StickyFilters({ filters, setFilters, leagues }: Props) {
  const set = <K extends keyof CentoFilters>(k: K, v: CentoFilters[K]) => setFilters({ ...filters, [k]: v });
  return (
    <div className="sticky top-0 z-10 bg-background/85 backdrop-blur-md border-b border-border/60 -mx-6 px-6 py-3 mb-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[180px] flex-1">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Edge Min · {filters.edgeMin}%</div>
          <Slider value={[filters.edgeMin]} min={0} max={20} step={0.5} onValueChange={([v]) => set('edgeMin', v)} />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Cota</div>
          <div className="flex items-center gap-1">
            <Input className="w-20 h-9 font-mono" type="number" step="0.05" value={filters.oddsMin} onChange={(e) => set('oddsMin', +e.target.value)} />
            <span className="text-muted-foreground">–</span>
            <Input className="w-20 h-9 font-mono" type="number" step="0.05" value={filters.oddsMax} onChange={(e) => set('oddsMax', +e.target.value)} />
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Risc</div>
          <Select value={filters.risk} onValueChange={(v) => set('risk', v)}>
            <SelectTrigger className="h-9 w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toate</SelectItem>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Piață</div>
          <Select value={filters.market} onValueChange={(v) => set('market', v)}>
            <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toate</SelectItem>
              <SelectItem value="winner">1X2</SelectItem>
              <SelectItem value="goals">Goluri</SelectItem>
              <SelectItem value="corners">Cornere</SelectItem>
              <SelectItem value="cards">Cartonașe</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Ligă</div>
          <Select value={filters.league} onValueChange={(v) => set('league', v)}>
            <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toate ligile</SelectItem>
              {leagues.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
