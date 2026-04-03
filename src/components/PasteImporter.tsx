import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import type { MatchData } from '@/lib/types';
import { parseStatsOnly, parseGoalsOnly, parseFormOnly, applyParsedStats, parseOdds, applyParsedOdds, type ParsedMatchStats, type ParsedOdds } from '@/lib/statsParser';

interface Props {
  match: MatchData;
  onChange: (match: MatchData) => void;
}

interface SectionState {
  text: string;
  status: string | null;
  debugLog: string[];
}

const INITIAL_SECTION: SectionState = { text: '', status: null, debugLog: [] };

export function PasteImporter({ match, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [statsSection, setStatsSection] = useState<SectionState>(INITIAL_SECTION);
  const [goalsSection, setGoalsSection] = useState<SectionState>(INITIAL_SECTION);
  const [formSection, setFormSection] = useState<SectionState>(INITIAL_SECTION);
  const [oddsSection, setOddsSection] = useState<SectionState>(INITIAL_SECTION);
  const [parsedStats, setParsedStats] = useState<ParsedMatchStats | null>(null);
  const [parsedOdds, setParsedOdds] = useState<ParsedOdds | null>(null);

  const handleExtractStats = () => {
    if (!statsSection.text.trim()) return;
    const p = parseMatchStats(statsSection.text);
    setParsedStats(p);
    const { updated, fieldsFound, log } = applyParsedStats(p, match);
    onChange(updated as MatchData);
    setStatsSection(s => ({ ...s, debugLog: log, status: `✅ ${fieldsFound} câmpuri completate din ${Object.keys(p.stats).length} statistici.` }));
  };

  const handleExtractGoals = () => {
    if (!goalsSection.text.trim()) return;
    const p = parseMatchStats(goalsSection.text);
    setParsedStats(p);
    const { updated, fieldsFound, log } = applyParsedStats(p, match);
    onChange(updated as MatchData);
    setGoalsSection(s => ({ ...s, debugLog: log, status: `✅ ${fieldsFound} câmpuri GM/GP completate.` }));
  };

  const handleExtractForm = () => {
    if (!formSection.text.trim()) return;
    const p = parseMatchStats(formSection.text);
    setParsedStats(p);
    const { updated, fieldsFound, log } = applyParsedStats(p, match);
    onChange(updated as MatchData);
    setFormSection(s => ({ ...s, debugLog: log, status: `✅ ${fieldsFound} câmpuri formă completate.` }));
  };

  const handleExtractOdds = () => {
    if (!oddsSection.text.trim()) return;
    const p = parseOdds(oddsSection.text);
    setParsedOdds(p);
    const { updated, fieldsFound, log } = applyParsedOdds(p, match);
    onChange(updated as MatchData);
    setOddsSection(s => ({ ...s, debugLog: log, status: `✅ ${fieldsFound} cote importate.` }));
  };

  const renderDebugLog = (logs: string[]) => {
    if (logs.length === 0) return null;
    return (
      <div className="bg-muted/50 rounded p-2 space-y-0.5 mt-2">
        <p className="text-xs font-semibold text-muted-foreground mb-1">Debug Log:</p>
        {logs.map((line, i) => (
          <p key={i} className="text-xs font-mono text-foreground">{line}</p>
        ))}
      </div>
    );
  };

  const renderExtractButton = (onClick: () => void, disabled: boolean, status: string | null) => (
    <div className="flex items-center gap-3 mt-2">
      <Button size="sm" onClick={onClick} disabled={disabled} className="font-bold">
        🔍 Extract
      </Button>
      {status && <span className="text-xs text-primary">{status}</span>}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <span>📋</span> Import
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-sm">📋 Import Date Meci</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="stats" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="stats" className="text-xs">📊 Statistici</TabsTrigger>
            <TabsTrigger value="goals" className="text-xs">⚽ GM/GP</TabsTrigger>
            <TabsTrigger value="form" className="text-xs">📝 Formă</TabsTrigger>
            <TabsTrigger value="odds" className="text-xs">💰 Cote</TabsTrigger>
          </TabsList>

          {/* === SECTION 1: STATISTICS === */}
          <TabsContent value="stats" className="space-y-2 mt-3">
            <Label className="text-xs text-muted-foreground">
              Posesie, Total șuturi, Șuturi pe poartă, Ocazii mari, Cornere, Faulturi, Cartonașe
            </Label>
            <Textarea
              value={statsSection.text}
              onChange={e => setStatsSection({ text: e.target.value, status: null, debugLog: [] })}
              placeholder={`Barcelona\nSevilla\n2.7\nGoluri\n1.3\n69.2%\nPosesie\n53.7%\n7.3\nȘuturi pe poartă\n3.8\n7.4\nCornere\n5.0`}
              className="bg-secondary border-border min-h-[140px] font-mono text-xs"
            />
            {renderExtractButton(handleExtractStats, !statsSection.text.trim(), statsSection.status)}

            {parsedStats && Object.keys(parsedStats.stats).length > 0 && (
              <div className="rounded-md border border-border overflow-hidden mt-2">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="text-left p-2 font-semibold text-muted-foreground">Stat</th>
                      <th className="text-center p-2 font-semibold text-muted-foreground">{parsedStats.team1 || 'Team 1'}</th>
                      <th className="text-center p-2 font-semibold text-muted-foreground">{parsedStats.team2 || 'Team 2'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(parsedStats.stats).map(([key, pair]) => (
                      <tr key={key} className="border-t border-border/50">
                        <td className="p-2 font-mono text-muted-foreground">{key}</td>
                        <td className="p-2 text-center font-bold">{pair.team1}</td>
                        <td className="p-2 text-center font-bold">{pair.team2}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {renderDebugLog(statsSection.debugLog)}
          </TabsContent>

          {/* === SECTION 2: GOALS (GM/GP) === */}
          <TabsContent value="goals" className="space-y-2 mt-3">
            <Label className="text-xs text-muted-foreground">
              GM GP Medie → Sinteză, Acasă, Deplasare (val1=GM, val2=GP, val3=total)
            </Label>
            <Textarea
              value={goalsSection.text}
              onChange={e => setGoalsSection({ text: e.target.value, status: null, debugLog: [] })}
              placeholder={`Echipa Gazdă\nGM GP Medie\nSinteză 1.42\n/meci 1.13\n/meci 2.55\nAcasă 1.38 0.75 2.13\nDeplasare 1.47 1.53 3.00\n\nEchipa Oaspete\nGM GP Medie\nSinteză 1.67\n/meci 0.83\n/meci 2.50\nAcasă 1.86 0.57 2.43\nDeplasare 1.40 1.20 2.60`}
              className="bg-secondary border-border min-h-[140px] font-mono text-xs"
            />
            {renderExtractButton(handleExtractGoals, !goalsSection.text.trim(), goalsSection.status)}
            {renderDebugLog(goalsSection.debugLog)}
          </TabsContent>

          {/* === SECTION 3: TEAM FORM === */}
          <TabsContent value="form" className="space-y-2 mt-3">
            <Label className="text-xs text-muted-foreground">
              Formă ultimele 5 meciuri: V=W, E=D, Î=L — Sinteză, Acasă, Deplasare
            </Label>
            <Textarea
              value={formSection.text}
              onChange={e => setFormSection({ text: e.target.value, status: null, debugLog: [] })}
              placeholder={`Echipa Gazdă\nSinteză\nV\nÎ\nÎ\nV\nÎ\nAcasă\nE\nÎ\nE\nV\nÎ\nDeplasare\nÎ\nÎ\nÎ\nV\nÎ\n\nEchipa Oaspete\nSinteză\nV\nV\nE\nV\nÎ\nAcasă\nV\nV\nV\nE\nÎ\nDeplasare\nÎ\nV\nE\nV\nÎ`}
              className="bg-secondary border-border min-h-[140px] font-mono text-xs"
            />
            {renderExtractButton(handleExtractForm, !formSection.text.trim(), formSection.status)}
            {renderDebugLog(formSection.debugLog)}
          </TabsContent>

          {/* === SECTION 4: ODDS === */}
          <TabsContent value="odds" className="space-y-2 mt-3">
            <Label className="text-xs text-muted-foreground">
              1X2, Over/Under (SUB/PESTE), BTTS (GG/NG), Cornere — first value=Under, second=Over
            </Label>
            <Textarea
              value={oddsSection.text}
              onChange={e => setOddsSection({ text: e.target.value, status: null, debugLog: [] })}
              placeholder={`Final\n1 4.55\nX 4.00\n2 1.75\n\n0.5 13.00 1.04\n1.5 4.35 1.22\n2.5 2.17 1.70\n3.5 1.46 2.72\n\nDa 1.69\nNu 2.17\n\nCornere\n7.5 2.10 1.70\n8.5 1.75 2.05\n9.5 1.50 2.45\n10.5 1.56 2.32\n11.5 1.80 1.95`}
              className="bg-secondary border-border min-h-[140px] font-mono text-xs"
            />
            {renderExtractButton(handleExtractOdds, !oddsSection.text.trim(), oddsSection.status)}

            {parsedOdds && (
              <div className="rounded-md border border-border overflow-hidden mt-2">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="text-left p-2 font-semibold text-muted-foreground">Piață</th>
                      <th className="text-center p-2 font-semibold text-muted-foreground">Valoare</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedOdds.home !== undefined && (
                      <tr className="border-t border-border/50">
                        <td className="p-2 font-mono text-muted-foreground">1 (Home)</td>
                        <td className="p-2 text-center font-bold">{parsedOdds.home}</td>
                      </tr>
                    )}
                    {parsedOdds.draw !== undefined && (
                      <tr className="border-t border-border/50">
                        <td className="p-2 font-mono text-muted-foreground">X (Draw)</td>
                        <td className="p-2 text-center font-bold">{parsedOdds.draw}</td>
                      </tr>
                    )}
                    {parsedOdds.away !== undefined && (
                      <tr className="border-t border-border/50">
                        <td className="p-2 font-mono text-muted-foreground">2 (Away)</td>
                        <td className="p-2 text-center font-bold">{parsedOdds.away}</td>
                      </tr>
                    )}
                    {parsedOdds.overUnderLines.map((line, i) => (
                      <tr key={`ou-${i}`} className="border-t border-border/50">
                        <td className="p-2 font-mono text-muted-foreground">Goals {line.line}</td>
                        <td className="p-2 text-center font-bold">U {line.under} / O {line.over}</td>
                      </tr>
                    ))}
                    {parsedOdds.bttsYes !== undefined && (
                      <tr className="border-t border-border/50">
                        <td className="p-2 font-mono text-muted-foreground">BTTS Da (GG)</td>
                        <td className="p-2 text-center font-bold">{parsedOdds.bttsYes}</td>
                      </tr>
                    )}
                    {parsedOdds.bttsNo !== undefined && (
                      <tr className="border-t border-border/50">
                        <td className="p-2 font-mono text-muted-foreground">BTTS Nu (NG)</td>
                        <td className="p-2 text-center font-bold">{parsedOdds.bttsNo}</td>
                      </tr>
                    )}
                    {parsedOdds.cornerLines.map((line, i) => (
                      <tr key={`c-${i}`} className="border-t border-border/50">
                        <td className="p-2 font-mono text-muted-foreground">Cornere {line.line}</td>
                        <td className="p-2 text-center font-bold">U {line.under} / O {line.over}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {renderDebugLog(oddsSection.debugLog)}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
