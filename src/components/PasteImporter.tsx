import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import type { MatchData } from '@/lib/types';
import { parseMatchStats, applyParsedStats, type ParsedMatchStats, type PlaystyleResult } from '@/lib/statsParser';

interface Props {
  match: MatchData;
  onChange: (match: MatchData) => void;
}

function PlaystyleCard({ teamName, result }: { teamName: string; result: PlaystyleResult }) {
  const icon = result.style === 'BUS PARKING' ? '🚌' : result.style === 'HIGH PRESS' ? '⚡' : '⚪';
  const colorClass = result.style === 'BUS PARKING'
    ? 'border-orange-500/50 bg-orange-500/10'
    : result.style === 'HIGH PRESS'
    ? 'border-red-500/50 bg-red-500/10'
    : 'border-border bg-muted/30';

  return (
    <div className={`rounded-md border p-2 ${colorClass}`}>
      <p className="text-xs font-bold">
        {icon} {teamName || 'Team'}: <span className="uppercase">{result.style}</span>
      </p>
      {result.reasons.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {result.reasons.map((r, i) => (
            <li key={i} className="text-xs text-muted-foreground">• {r}</li>
          ))}
        </ul>
      )}
      {result.bettingSuggestions.length > 0 && (
        <div className="mt-1 pt-1 border-t border-border/50">
          <p className="text-xs font-semibold text-primary">Betting suggestions:</p>
          <p className="text-xs text-muted-foreground">{result.bettingSuggestions.join(' · ')}</p>
        </div>
      )}
    </div>
  );
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

          {parsed && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">🎯 Playstyle Detection:</p>
              <PlaystyleCard teamName={parsed.team1} result={parsed.team1Playstyle} />
              <PlaystyleCard teamName={parsed.team2} result={parsed.team2Playstyle} />
            </div>
          )}

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
