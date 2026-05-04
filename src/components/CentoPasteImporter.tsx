import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { PasteImporter } from '@/components/PasteImporter';
import type { MatchData } from '@/lib/types';
import { parseGeneral, parseTeam, applyGeneral, applyTeam } from '@/lib/centoParser';

interface Props {
  match: MatchData;
  onChange: (match: MatchData) => void;
}

interface SectionState {
  text: string;
  status: string | null;
  log: string[];
}
const INITIAL: SectionState = { text: '', status: null, log: [] };

export function CentoPasteImporter({ match, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [general, setGeneral] = useState<SectionState>(INITIAL);
  const [home, setHome] = useState<SectionState>(INITIAL);
  const [away, setAway] = useState<SectionState>(INITIAL);

  const handleGeneral = () => {
    if (!general.text.trim()) return;
    const parsed = parseGeneral(general.text);
    const { updated, fields, log } = applyGeneral(parsed, match);
    onChange(updated);
    setGeneral(s => ({
      ...s,
      log: [...parsed.log, '---', ...log],
      status: `✅ ${Object.keys(parsed.stats).length} statistici / ${fields} câmpuri completate`,
    }));
  };

  const handleTeam = (side: 'home' | 'away') => {
    const state = side === 'home' ? home : away;
    const setState = side === 'home' ? setHome : setAway;
    if (!state.text.trim()) return;
    const parsed = parseTeam(state.text);
    const { updated, fields, log } = applyTeam(parsed, match, side);
    onChange(updated);
    setState(s => ({
      ...s,
      log: [...parsed.log, '---', ...log],
      status: `✅ ${fields} câmpuri completate (${side === 'home' ? 'GAZDĂ' : 'OASPETE'})`,
    }));
  };

  const renderLog = (logs: string[]) => {
    if (logs.length === 0) return null;
    return (
      <div className="bg-muted/50 rounded p-2 space-y-0.5 mt-2 max-h-48 overflow-y-auto">
        <p className="text-xs font-semibold text-muted-foreground mb-1">Debug Log:</p>
        {logs.map((line, i) => (
          <p key={i} className="text-xs font-mono text-foreground">{line}</p>
        ))}
      </div>
    );
  };

  return (
    <div className="flex items-center gap-2">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="default" size="sm" className="gap-2 font-bold">
            <span>⚡</span> Cento Import
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-sm">⚡ Cento Power — Advanced Import</DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="general" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="general" className="text-xs">🔵 General</TabsTrigger>
              <TabsTrigger value="home" className="text-xs">🟢 Acasă</TabsTrigger>
              <TabsTrigger value="away" className="text-xs">🔴 Deplasare</TabsTrigger>
            </TabsList>

            {/* GENERAL */}
            <TabsContent value="general" className="space-y-2 mt-3">
              <Label className="text-xs text-muted-foreground">
                Statistici meci (HOME = stânga, AWAY = dreapta). Suport „Posesie / Șuturi pe poartă / Total șuturi / Cornere / xG / Atacuri periculoase".
              </Label>
              <Textarea
                value={general.text}
                onChange={e => setGeneral({ text: e.target.value, status: null, log: [] })}
                placeholder={`Posesie\n53.7%\n46.3%\nȘuturi pe poartă\n5.2\n3.1\nTotal șuturi\n14\n9\nCornere\n6\n4\nAtacuri periculoase\n62\n41`}
                className="bg-secondary border-border min-h-[160px] font-mono text-xs"
              />
              <div className="flex items-center gap-3">
                <Button size="sm" onClick={handleGeneral} disabled={!general.text.trim()} className="font-bold">
                  🔍 Extract General
                </Button>
                {general.status && <span className="text-xs text-primary">{general.status}</span>}
              </div>
              {renderLog(general.log)}
            </TabsContent>

            {/* HOME */}
            <TabsContent value="home" className="space-y-2 mt-3">
              <Label className="text-xs text-muted-foreground">
                Date echipa GAZDĂ (forma „Acasă"). Acceptă „Acasă 1.38 0.75 2.13" pentru GM/GP.
              </Label>
              <Textarea
                value={home.text}
                onChange={e => setHome({ text: e.target.value, status: null, log: [] })}
                placeholder={`Acasă 1.38 0.75 2.13\nPosesie 56\nTotal șuturi 13\nȘuturi pe poartă 5\nCornere 6.2\nAtacuri periculoase 58\nCartonașe galbene 2.1`}
                className="bg-secondary border-border min-h-[160px] font-mono text-xs"
              />
              <div className="flex items-center gap-3">
                <Button size="sm" onClick={() => handleTeam('home')} disabled={!home.text.trim()} className="font-bold">
                  🔍 Extract HOME
                </Button>
                {home.status && <span className="text-xs text-primary">{home.status}</span>}
              </div>
              {renderLog(home.log)}
            </TabsContent>

            {/* AWAY */}
            <TabsContent value="away" className="space-y-2 mt-3">
              <Label className="text-xs text-muted-foreground">
                Date echipa OASPETE (forma „Deplasare"). Acceptă „Deplasare 1.40 1.20 2.60" pentru GM/GP.
              </Label>
              <Textarea
                value={away.text}
                onChange={e => setAway({ text: e.target.value, status: null, log: [] })}
                placeholder={`Deplasare 1.40 1.20 2.60\nPosesie 44\nTotal șuturi 9\nȘuturi pe poartă 3\nCornere 4.1\nAtacuri periculoase 42\nCartonașe galbene 2.4`}
                className="bg-secondary border-border min-h-[160px] font-mono text-xs"
              />
              <div className="flex items-center gap-3">
                <Button size="sm" onClick={() => handleTeam('away')} disabled={!away.text.trim()} className="font-bold">
                  🔍 Extract AWAY
                </Button>
                {away.status && <span className="text-xs text-primary">{away.status}</span>}
              </div>
              {renderLog(away.log)}
            </TabsContent>
          </Tabs>

          <div className="border-t border-border pt-3 mt-2">
            <p className="text-[10px] text-muted-foreground">
              💡 Dacă datele nu se potrivesc, folosește importul clasic (4 secțiuni) →
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Classic fallback */}
      <PasteImporter match={match} onChange={onChange} />
    </div>
  );
}
