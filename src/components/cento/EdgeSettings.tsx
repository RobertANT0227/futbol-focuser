import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Sliders, Info, Shield, Scale, Flame, Wand2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CentoFilters } from './StickyFilters';

export type EdgePresetId = 'safe' | 'balanced' | 'aggressive' | 'custom';

export interface EdgePreset {
  id: EdgePresetId;
  label: string;
  edgeMin: number;
  risk: CentoFilters['risk'];
  oddsMin: number;
  oddsMax: number;
  description: string;
  icon: typeof Shield;
}

export const EDGE_PRESETS: EdgePreset[] = [
  { id: 'safe', label: 'Safe', edgeMin: 3, risk: 'low', oddsMin: 1.4, oddsMax: 3.5,
    description: 'Mai multe pariuri, varianță mică, risc redus.', icon: Shield },
  { id: 'balanced', label: 'Balanced', edgeMin: 5, risk: 'all', oddsMin: 1.4, oddsMax: 5,
    description: 'Echilibru între volum și valoare. Default recomandat.', icon: Scale },
  { id: 'aggressive', label: 'Aggressive', edgeMin: 8, risk: 'all', oddsMin: 1.5, oddsMax: 8,
    description: 'Mai puține pariuri, value mare, varianță ridicată.', icon: Flame },
  { id: 'custom', label: 'Custom', edgeMin: 5, risk: 'all', oddsMin: 1.4, oddsMax: 8,
    description: 'Setări personalizate via slider.', icon: Wand2 },
];

interface Props {
  filters: CentoFilters;
  setFilters: (f: CentoFilters) => void;
  bankroll: number;
}

export function EdgeSettings({ filters, setFilters, bankroll }: Props) {
  const [open, setOpen] = useState(false);

  const recommended: EdgePresetId = useMemo(() => {
    if (bankroll < 500) return 'aggressive';
    if (bankroll < 2000) return 'balanced';
    return 'safe';
  }, [bankroll]);

  const activePreset: EdgePresetId = useMemo(() => {
    const match = EDGE_PRESETS.find((p) =>
      p.id !== 'custom' && p.edgeMin === filters.edgeMin && p.risk === filters.risk
      && p.oddsMin === filters.oddsMin && p.oddsMax === filters.oddsMax,
    );
    return match?.id ?? 'custom';
  }, [filters]);

  const apply = (p: EdgePreset) => {
    setFilters({
      ...filters,
      edgeMin: p.edgeMin,
      risk: p.risk,
      oddsMin: p.oddsMin,
      oddsMax: p.oddsMax,
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-2">
          <Sliders className="h-3.5 w-3.5" />
          Edge Settings
          <Badge variant="outline" className="ml-1 text-[10px] uppercase tracking-wider border-primary/40 text-primary">
            {activePreset === 'custom' ? `${filters.edgeMin}%` : EDGE_PRESETS.find((p) => p.id === activePreset)?.label}
          </Badge>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sliders className="h-4 w-4 text-primary" /> Edge Settings
          </DialogTitle>
        </DialogHeader>

        <div className="rounded-lg border border-border/60 bg-card/40 p-3 text-xs space-y-2">
          <div className="flex items-center gap-2 text-foreground font-semibold">
            <Info className="h-3.5 w-3.5 text-primary" /> Ce este Edge?
          </div>
          <p className="text-muted-foreground leading-relaxed">
            <strong>EDGE</strong> = diferența dintre probabilitatea reală estimată de model
            (<strong>WR</strong>) și probabilitatea implicită a cotei (<strong>BE%</strong>).
          </p>
          <div className="rounded-md bg-background/60 border border-border/40 p-2 font-mono text-[11px]">
            EDGE = WR − BE% &nbsp;·&nbsp; ex: cotă 2.00 → BE = 50%, WR = 58% → <span className="text-primary">EDGE = +8%</span>
          </div>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <div className="rounded-md border border-border/40 bg-background/40 p-2">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Low Edge</div>
              <div className="text-foreground">Volum mare · risc mai mic · value mai mic</div>
            </div>
            <div className="rounded-md border border-border/40 bg-background/40 p-2">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">High Edge</div>
              <div className="text-foreground">Mai puține pariuri · value mare · varianță mai mare</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {EDGE_PRESETS.map((p) => {
            const Icon = p.icon;
            const isActive = activePreset === p.id;
            const isRecommended = recommended === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => apply(p)}
                className={cn(
                  'text-left rounded-lg border p-3 transition-all',
                  isActive ? 'border-primary bg-primary/10' : 'border-border/60 bg-card/40 hover:bg-card/70',
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Icon className={cn('h-4 w-4', isActive ? 'text-primary' : 'text-muted-foreground')} />
                  <div className="font-semibold text-sm">{p.label}</div>
                  {isRecommended && (
                    <Badge variant="outline" className="ml-auto text-[9px] uppercase border-primary/40 text-primary">
                      Recomandat
                    </Badge>
                  )}
                </div>
                <div className="text-[11px] text-muted-foreground mb-2">{p.description}</div>
                <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground">
                  <span>Edge ≥ {p.edgeMin}%</span>
                  <span>·</span>
                  <span>Cote {p.oddsMin}–{p.oddsMax}</span>
                </div>
              </button>
            );
          })}
        </div>

        <div className="rounded-lg border border-border/60 bg-card/40 p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Edge personalizat</div>
            <div className="font-mono text-sm text-primary">{filters.edgeMin.toFixed(1)}%</div>
          </div>
          <Slider
            value={[filters.edgeMin]}
            min={0} max={20} step={0.5}
            onValueChange={([v]) => setFilters({ ...filters, edgeMin: v })}
          />
          <div className="flex justify-between text-[10px] text-muted-foreground mt-1.5 font-mono">
            <span>0%</span><span>10%</span><span>20%</span>
          </div>
        </div>

        <div className="rounded-md border border-border/40 bg-background/40 px-3 py-2 text-[11px] text-muted-foreground flex items-start gap-2">
          <Info className="h-3 w-3 mt-0.5 text-primary flex-shrink-0" />
          <span>
            Bankroll curent: <span className="font-mono text-foreground">{bankroll.toFixed(0)} LEI</span>.
            Pentru bankroll {bankroll < 500 ? 'mic' : bankroll < 2000 ? 'mediu' : 'mare'}, recomandăm preset-ul
            <strong className="text-primary"> {EDGE_PRESETS.find((p) => p.id === recommended)?.label}</strong>.
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}