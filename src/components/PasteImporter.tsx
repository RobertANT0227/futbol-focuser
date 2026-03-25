import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import type { MatchData } from '@/lib/types';
import { parseMatchStats, applyParsedStats } from '@/lib/statsParser';

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

    const parsed = parseMatchStats(text);
    const { updated, fieldsFound, log } = applyParsedStats(parsed, match);

    onChange(updated as MatchData);
    setDebugLog(log);
    setStatus(`✅ ${fieldsFound} câmpuri completate din ${Object.keys(parsed.stats).length} statistici detectate.`);
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
              onChange={e => { setText(e.target.value); setStatus(null); setDebugLog([]); }}
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
          {debugLog.length > 0 && (
            <div className="bg-muted/50 rounded p-2 space-y-0.5">
              <p className="text-xs font-semibold text-muted-foreground mb-1">Parsed:</p>
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
