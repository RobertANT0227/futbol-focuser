import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import type { MatchData } from '@/lib/types';
import { parseMatchStats, applyParsedStats, type ParsedMatchStats } from '@/lib/statsParser';

interface Props {
  match: MatchData;
  onChange: (match: MatchData) => void;
}

export function PasteImporter({ match, onChange }: Props) {
  const [text, setText] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [debugLog, setDebugLog] = useState<string[]>([]);
  const [parsed, setParsed] = useState<ParsedMatchStats | null>(null);
  const [open, setOpen] = useState(false);

  const handleExtract = () => {
    if (!text.trim()) return;

    const p = parseMatchStats(text);
    setParsed(p);
    const { updated, fieldsFound, log } = applyParsedStats(p, match);

    onChange(updated as MatchData);
    setDebugLog(log);
    setStatus(`✅ ${fieldsFound} câmpuri completate din ${Object.keys(p.stats).length} statistici detectate.`);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <span>📋</span> Import Statistici
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-sm">📋 Import Statistici</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">
              Lipește statisticile copiate — format: Echipa1, Echipa2, apoi val1 / stat / val2
            </Label>
            <Textarea
              value={text}
              onChange={e => { setText(e.target.value); setStatus(null); setDebugLog([]); setParsed(null); }}
              placeholder={`Barcelona\nSevilla\n2.7\nGoluri\n1.3\n69.2%\nPosesie\n53.7%\n2.5\nxG\n1.1\n7.3\nȘuturi pe poartă\n3.8\n7.4\nCornere\n5.0`}
              className="bg-secondary border-border min-h-[180px] mt-1 font-mono text-xs"
            />
          </div>
          <div className="flex items-center gap-3">
            <Button size="sm" onClick={handleExtract} disabled={!text.trim()} className="font-bold">
              🔍 Extract Data
            </Button>
            {status && <span className="text-xs text-primary">{status}</span>}
          </div>

          {parsed && Object.keys(parsed.stats).length > 0 && (
            <div className="rounded-md border border-border overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="text-left p-2 font-semibold text-muted-foreground">Stat</th>
                    <th className="text-center p-2 font-semibold text-muted-foreground">{parsed.team1 || 'Team 1'}</th>
                    <th className="text-center p-2 font-semibold text-muted-foreground">{parsed.team2 || 'Team 2'}</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(parsed.stats).map(([key, pair]) => (
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

          {debugLog.length > 0 && (
            <div className="bg-muted/50 rounded p-2 space-y-0.5">
              <p className="text-xs font-semibold text-muted-foreground mb-1">Debug Log:</p>
              {debugLog.map((line, i) => (
                <p key={i} className="text-xs font-mono text-foreground">{line}</p>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
