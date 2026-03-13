import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import type { MatchData } from '@/lib/types';

interface Props {
  match: MatchData;
  onChange: (match: MatchData) => void;
}

function cleanNumber(s: string): number {
  return parseFloat(s.replace('%', '').replace(',', '.').trim());
}

const STAT_MAP: Record<string, (h: number, a: number, m: MatchData) => void> = {
  'goluri așteptate': (h, a, m) => { m.homeTeam.xG = h; m.awayTeam.xG = a; },
  'xg': (h, a, m) => { m.homeTeam.xG = h; m.awayTeam.xG = a; },
  'expected goals': (h, a, m) => { m.homeTeam.xG = h; m.awayTeam.xG = a; },
  'goluri': (h, a, m) => { m.homeTeam.goalsScored = h; m.awayTeam.goalsScored = a; },
  'goals': (h, a, m) => { m.homeTeam.goalsScored = h; m.awayTeam.goalsScored = a; },
  'posesie': (h, a, m) => { m.homeTeam.possession = h; m.awayTeam.possession = a; },
  'possession': (h, a, m) => { m.homeTeam.possession = h; m.awayTeam.possession = a; },
  'șuturi pe poartă': (h, a, m) => { m.homeTeam.shotsOnTarget = h; m.awayTeam.shotsOnTarget = a; },
  'suturi pe poarta': (h, a, m) => { m.homeTeam.shotsOnTarget = h; m.awayTeam.shotsOnTarget = a; },
  'shots on target': (h, a, m) => { m.homeTeam.shotsOnTarget = h; m.awayTeam.shotsOnTarget = a; },
  'total șuturi': (h, a, m) => { m.homeTeam.shots = h; m.awayTeam.shots = a; },
  'total suturi': (h, a, m) => { m.homeTeam.shots = h; m.awayTeam.shots = a; },
  'total shots': (h, a, m) => { m.homeTeam.shots = h; m.awayTeam.shots = a; },
  'cornere': (h, a, m) => { m.homeTeam.cornersPerMatch = h; m.awayTeam.cornersPerMatch = a; },
  'corners': (h, a, m) => { m.homeTeam.cornersPerMatch = h; m.awayTeam.cornersPerMatch = a; },
  'cartonașe galbene': (h, a, m) => { m.homeTeam.cardsPerMatch = h; m.awayTeam.cardsPerMatch = a; },
  'cartonase galbene': (h, a, m) => { m.homeTeam.cardsPerMatch = h; m.awayTeam.cardsPerMatch = a; },
  'yellow cards': (h, a, m) => { m.homeTeam.cardsPerMatch = h; m.awayTeam.cardsPerMatch = a; },
  'faulturi': (h, a, m) => { m.homeTeam.fouls = h; m.awayTeam.fouls = a; },
  'fouls': (h, a, m) => { m.homeTeam.fouls = h; m.awayTeam.fouls = a; },
  'ocazii mari create': (h, a, m) => { m.homeTeam.dangerousAttacks = h; m.awayTeam.dangerousAttacks = a; },
  'big chances': (h, a, m) => { m.homeTeam.dangerousAttacks = h; m.awayTeam.dangerousAttacks = a; },
};

function parseStatFile(text: string, match: MatchData): MatchData {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length < 4) return match;

  const updated: MatchData = JSON.parse(JSON.stringify(match));
  updated.homeTeam.name = lines[0];
  updated.awayTeam.name = lines[1];

  // Scan for triplets: number, label, number
  for (let i = 2; i + 2 < lines.length; i++) {
    const homeVal = cleanNumber(lines[i]);
    const label = lines[i + 1].toLowerCase().trim();
    const awayVal = cleanNumber(lines[i + 2]);

    if (isNaN(homeVal) || isNaN(awayVal)) continue;

    // Check exact matches first, then partial
    let matched = false;
    for (const [key, fn] of Object.entries(STAT_MAP)) {
      if (label === key || label.includes(key)) {
        // For "goluri", skip if label also contains xG keywords
        if (key === 'goluri' && (label.includes('xg') || label.includes('așteptate'))) continue;
        fn(homeVal, awayVal, updated);
        matched = true;
        i += 2; // skip the consumed lines
        break;
      }
    }
  }

  console.log('Parsed file result:', updated.homeTeam.name, updated.homeTeam.goalsScored, updated.homeTeam.shots);
  return updated;
}

export function FileUpload({ match, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      if (text) {
        const updated = parseStatFile(text, match);
        onChange(updated);
      }
    };
    reader.readAsText(file);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <>
      <input ref={inputRef} type="file" accept=".txt,.csv" className="hidden" onChange={handleFile} />
      <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()} className="gap-2">
        📄 Încarcă fișier statistici
      </Button>
    </>
  );
}
