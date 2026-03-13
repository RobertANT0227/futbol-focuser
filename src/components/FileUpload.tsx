import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import type { MatchData } from '@/lib/types';

interface Props {
  match: MatchData;
  onChange: (match: MatchData) => void;
}

function parseStatFile(text: string, match: MatchData): MatchData {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 4) return match;

  const homeName = lines[0];
  const awayName = lines[1];

  const updated = { ...match, homeTeam: { ...match.homeTeam, name: homeName }, awayTeam: { ...match.awayTeam, name: awayName } };

  // Parse triplets: homeValue, label, awayValue
  let i = 2;
  while (i + 2 < lines.length) {
    const homeVal = parseFloat(lines[i]);
    const label = lines[i + 1].toLowerCase();
    const awayVal = parseFloat(lines[i + 2]);

    if (isNaN(homeVal) || isNaN(awayVal)) {
      i++;
      continue;
    }

    if (label.includes('goluri') && !label.includes('xg') && !label.includes('așteptate')) {
      updated.homeTeam.goalsScored = homeVal;
      updated.awayTeam.goalsScored = awayVal;
    } else if (label.includes('xg') || label.includes('așteptate')) {
      updated.homeTeam.xG = homeVal;
      updated.awayTeam.xG = awayVal;
    } else if (label.includes('posesie')) {
      updated.homeTeam.possession = homeVal;
      updated.awayTeam.possession = awayVal;
    } else if (label.includes('șuturi pe poartă') || label.includes('suturi pe poarta')) {
      updated.homeTeam.shotsOnTarget = homeVal;
      updated.awayTeam.shotsOnTarget = awayVal;
    } else if (label.includes('total șuturi') || label.includes('total suturi') || (label.includes('șuturi') && !label.includes('poartă'))) {
      updated.homeTeam.shots = homeVal;
      updated.awayTeam.shots = awayVal;
    } else if (label.includes('cornere')) {
      updated.homeTeam.cornersPerMatch = homeVal;
      updated.awayTeam.cornersPerMatch = awayVal;
    } else if (label.includes('cartonașe') || label.includes('cartonase') || label.includes('galbene')) {
      updated.homeTeam.cardsPerMatch = homeVal;
      updated.awayTeam.cardsPerMatch = awayVal;
    } else if (label.includes('faulturi') || label.includes('fauluri')) {
      updated.homeTeam.fouls = homeVal;
      updated.awayTeam.fouls = awayVal;
    } else if (label.includes('ocazii') || label.includes('dangerous') || label.includes('mari create')) {
      updated.homeTeam.dangerousAttacks = homeVal;
      updated.awayTeam.dangerousAttacks = awayVal;
    }

    i += 3;
  }

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
