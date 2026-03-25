import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import type { MatchData } from '@/lib/types';
import { parseStatsText } from '@/lib/statsParser';

interface Props {
  match: MatchData;
  onChange: (match: MatchData) => void;
}

export function PasteImporter({ match, onChange }: Props) {
  const [text, setText] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [debugLog, setDebugLog] = useState<string[]>([]);
  const [open, setOpen] = useState(false);

  const handleExtract = () => {
    if (!text.trim()) return;

    const parsed = parseStatsText(text);
    const updated = JSON.parse(JSON.stringify(match)) as MatchData;
    const log: string[] = [];
    let fieldsFound = 0;

    for (const stat of parsed) {
      // Apply to home team
      if (stat.homeKey in updated.homeTeam) {
        (updated.homeTeam as any)[stat.homeKey] = stat.team1;
        fieldsFound++;
      }
      // Apply to away team
      if (stat.awayKey in updated.awayTeam) {
        (updated.awayTeam as any)[stat.awayKey] = stat.team2;
        fieldsFound++;
      }
      log.push(`${stat.name} → ${stat.team1} / ${stat.team2}`);
    }

    onChange(updated);
    setDebugLog(log);
    setStatus(`✅ ${fieldsFound} câmpuri completate din ${parsed.length} statistici detectate.`);
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
          <DialogTitle className="text-sm">📋 Import Statistici (Sequential Parser)</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">
              Lipește statisticile copiate — fiecare stat pe linie separată, apoi valorile numerice
            </Label>
            <Textarea
              value={text}
              onChange={e => { setText(e.target.value); setStatus(null); setDebugLog([]); }}
              placeholder={`Goluri\n1.6\n2.1\nPosesie\n51.9%\n57.8%\nxG\n2.5\n1.1\nȘuturi pe poartă\n7.3\n3.8\nCornere\n7.4\n5.0\nFaulturi\n9.3\n15.0`}
              className="bg-secondary border-border min-h-[180px] mt-1 font-mono text-xs"
            />
          </div>
          <div className="flex items-center gap-3">
            <Button size="sm" onClick={handleExtract} disabled={!text.trim()} className="font-bold">
              🔍 Extract Data
            </Button>
            {status && <span className="text-xs text-primary">{status}</span>}
          </div>
          {debugLog.length > 0 && (
            <div className="bg-muted/50 rounded p-2 space-y-0.5">
              <p className="text-xs font-semibold text-muted-foreground mb-1">Parsed results:</p>
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
