import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import type { MatchData } from '@/lib/types';

interface Props {
  match: MatchData;
  onChange: (match: MatchData) => void;
}

function clean(val: string): number {
  const s = val.replace('%', '').replace(',', '.').trim();
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function extractForm(text: string): ('W' | 'D' | 'L')[] {
  const form: ('W' | 'D' | 'L')[] = [];
  for (const ch of text.toUpperCase()) {
    if (ch === 'W' || ch === 'V') form.push('W');
    else if (ch === 'D' || ch === 'E') form.push('D');
    else if (ch === 'L' || ch === 'Î' || ch === 'I') form.push('L');
    if (form.length >= 5) break;
  }
  while (form.length < 5) form.push('D');
  return form;
}

function findValue(text: string, patterns: string[]): number | null {
  for (const pat of patterns) {
    const escapedPat = pat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const r1 = new RegExp(escapedPat + '[:\\s]+([\\d]+[.,]?[\\d]*)', 'i');
    const m1 = text.match(r1);
    if (m1) return clean(m1[1]);
    const r2 = new RegExp('([\\d]+[.,]?[\\d]*)\\s*' + escapedPat, 'i');
    const m2 = text.match(r2);
    if (m2) return clean(m2[1]);
  }
  return null;
}

function findFormValue(text: string, patterns: string[]): ('W' | 'D' | 'L')[] | null {
  for (const pat of patterns) {
    const escapedPat = pat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const r = new RegExp(escapedPat + '[:\\s]+([WDLVEIÎ]{3,5})', 'i');
    const m = text.match(r);
    if (m) return extractForm(m[1]);
  }
  return null;
}

// Table row mappings: label keyword -> [homeKey, awayKey]
const TABLE_MAPPINGS: Record<string, [string, string]> = {
  'goluri': ['goalsScored', 'goalsScored'],
  'goals': ['goalsScored', 'goalsScored'],
  'xg': ['xG', 'xG'],
  'goluri asteptate': ['xG', 'xG'],
  'goluri așteptate': ['xG', 'xG'],
  'șuturi totale': ['shots', 'shots'],
  'suturi totale': ['shots', 'shots'],
  'shots': ['shots', 'shots'],
  'suturi': ['shots', 'shots'],
  'șuturi': ['shots', 'shots'],
  'șuturi pe poartă': ['shotsOnTarget', 'shotsOnTarget'],
  'suturi pe poarta': ['shotsOnTarget', 'shotsOnTarget'],
  'shots on target': ['shotsOnTarget', 'shotsOnTarget'],
  'ocazii mari': ['shotsOnTarget', 'shotsOnTarget'],
  'possession': ['possession', 'possession'],
  'posesie': ['possession', 'possession'],
  'corners': ['cornersPerMatch', 'cornersPerMatch'],
  'cornere': ['cornersPerMatch', 'cornersPerMatch'],
  'fouls': ['fouls', 'fouls'],
  'faulturi': ['fouls', 'fouls'],
  'cards': ['cardsPerMatch', 'cardsPerMatch'],
  'cartonase': ['cardsPerMatch', 'cardsPerMatch'],
  'cartonașe': ['cardsPerMatch', 'cardsPerMatch'],
  'cartonașe galbene': ['cardsPerMatch', 'cardsPerMatch'],
  'cartonase galbene': ['cardsPerMatch', 'cardsPerMatch'],
  'yellow cards': ['cardsPerMatch', 'cardsPerMatch'],
  'ofsaiduri': ['fouls', 'fouls'], // approximate
};

export function PasteImporter({ match, onChange }: Props) {
  const [text, setText] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const handleExtract = () => {
    if (!text.trim()) return;

    const lines = text.replace(/\r\n/g, '\n').split('\n').map(l => l.trim()).filter(Boolean);
    const fullText = lines.join(' ');

    const updated = JSON.parse(JSON.stringify(match)) as MatchData;
    let fieldsFound = 0;

    // === TABULAR FORMAT: "Label  HomeValue  AwayValue" ===
    // Detect header row to find team names
    let headerFound = false;
    for (const line of lines) {
      // Split by tabs, pipes, or 2+ spaces
      const parts = line.split(/[\t|]|(?:\s{2,})/).map(p => p.trim()).filter(Boolean);

      if (parts.length >= 3) {
        const labelRaw = parts[0];
        const val1Str = parts[1];
        const val2Str = parts[parts.length - 1];

        // Check if this is a header row (contains team names, no numbers)
        if (!headerFound && isNaN(parseFloat(val1Str.replace('%', '').replace(',', '.'))) 
            && isNaN(parseFloat(val2Str.replace('%', '').replace(',', '.')))) {
          // This might be header: "Statistică  Barcelona  Sevilla"
          if (val1Str.length > 1) { updated.homeTeam.name = val1Str; fieldsFound++; }
          if (val2Str.length > 1) { updated.awayTeam.name = val2Str; fieldsFound++; }
          headerFound = true;
          continue;
        }

        const label = labelRaw.toLowerCase()
          .replace(/ș/g, 'ș').replace(/ț/g, 'ț')
          .replace(/ă/g, 'ă').replace(/â/g, 'â').replace(/î/g, 'î');
        const left = clean(val1Str);
        const right = clean(val2Str);

        if (left > 0 || right > 0) {
          // Try matching label against all mappings
          for (const [key, [homeKey, awayKey]] of Object.entries(TABLE_MAPPINGS)) {
            if (label.includes(key)) {
              if (left > 0) { (updated.homeTeam as any)[homeKey] = left; fieldsFound++; }
              if (right > 0) { (updated.awayTeam as any)[awayKey] = right; fieldsFound++; }
              break;
            }
          }
        }
      }

      // Also handle 2-column: "Label  Value" (old format, value | label | value)
      if (parts.length >= 3) {
        const midIdx = Math.floor(parts.length / 2);
        const midLabel = parts[midIdx].toLowerCase();
        const leftVal = clean(parts[0]);
        const rightVal = clean(parts[parts.length - 1]);
        
        if (leftVal > 0 || rightVal > 0) {
          for (const [key, [homeKey, awayKey]] of Object.entries(TABLE_MAPPINGS)) {
            if (midLabel.includes(key)) {
              if (leftVal > 0) { (updated.homeTeam as any)[homeKey] = leftVal; fieldsFound++; }
              if (rightVal > 0) { (updated.awayTeam as any)[awayKey] = rightVal; fieldsFound++; }
              break;
            }
          }
        }
      }
    }

    // === NON-TABLE: label-value extraction for each team section ===
    let homeText = fullText;
    let awayText = fullText;
    const halfIdx = Math.floor(lines.length / 2);
    if (lines.length > 6) {
      homeText = lines.slice(0, halfIdx).join(' ');
      awayText = lines.slice(halfIdx).join(' ');
    }

    const extractTeamStats = (section: string, isHome: boolean) => {
      const team = isHome ? updated.homeTeam : updated.awayTeam;
      const trySet = (key: string, patterns: string[]) => {
        if ((team as any)[key] > 0) return; // already set by table
        const v = findValue(section, patterns);
        if (v !== null) { (team as any)[key] = v; fieldsFound++; }
      };
      trySet('matchesPlayed', ['meciuri jucate', 'matches played', 'played', 'meciuri', 'mp']);
      trySet('goalsScored', ['goluri marcate', 'goals scored', 'goals for', 'gf', 'marcate/meci', 'scored']);
      trySet('goalsConceded', ['goluri primite', 'goals conceded', 'goals against', 'ga', 'primite/meci', 'conceded']);
      trySet('goalsScoredHome', ['goluri acasă marcate', 'home goals scored']);
      trySet('goalsConcededHome', ['goluri acasă primite', 'home goals conceded']);
      trySet('goalsScoredAway', ['goluri deplasare marcate', 'away goals scored']);
      trySet('goalsConcededAway', ['goluri deplasare primite', 'away goals conceded']);
      trySet('xG', ['xg', 'expected goals']);
      trySet('shots', ['șuturi/meci', 'suturi/meci', 'shots per', 'shots']);
      trySet('shotsOnTarget', ['șuturi pe poartă', 'suturi pe poarta', 'shots on target']);
      trySet('shotsOnTargetHome', ['șuturi pe poartă acasă', 'suturi pe poarta acasa']);
      trySet('shotsOnTargetAway', ['șuturi pe poartă deplasare', 'suturi pe poarta deplasare']);
      trySet('possession', ['posesie', 'possession']);
      trySet('cardsPerMatch', ['cartonașe', 'cartonase', 'cards']);
      trySet('fouls', ['faulturi', 'fouls']);
      trySet('cornersPerMatch', ['cornere/meci', 'corners per', 'corners']);
      trySet('cornersPerMatchHome', ['cornere acasă', 'cornere acasa']);
      trySet('cornersPerMatchAway', ['cornere deplasare', 'away corners']);
      trySet('leaguePosition', ['loc clasament', 'position', 'loc']);
      trySet('totalTeamsInLeague', ['echipe în ligă', 'echipe in liga', 'teams in league']);
    };

    extractTeamStats(homeText, true);
    extractTeamStats(awayText, false);

    // === ODDS ===
    const tryOdds = (key: string, patterns: string[]) => {
      const v = findValue(fullText, patterns);
      if (v !== null) { (updated as any)[key] = v; fieldsFound++; }
    };
    tryOdds('oddsHome', ['cota 1', 'odds home', 'home win']);
    tryOdds('oddsDraw', ['cota x', 'odds draw', 'draw']);
    tryOdds('oddsAway', ['cota 2', 'odds away', 'away win']);
    tryOdds('oddsOver25', ['over 2.5', 'o2.5', 'over 2,5']);
    tryOdds('oddsUnder25', ['under 2.5', 'u2.5', 'under 2,5']);
    tryOdds('oddsBTTSYes', ['btts yes', 'btts da', 'gg']);
    tryOdds('oddsBTTSNo', ['btts no', 'btts nu', 'ng']);

    // === CORNER LINES ===
    for (const cl of updated.cornerLines) {
      const lineStr = cl.line.toString().replace('.', '[.,]');
      const overMatch = fullText.match(new RegExp(`over\\s*${lineStr}[^\\d]*(\\d+[.,]?\\d*)`, 'i'));
      const underMatch = fullText.match(new RegExp(`under\\s*${lineStr}[^\\d]*(\\d+[.,]?\\d*)`, 'i'));
      if (overMatch) { cl.oddsOver = clean(overMatch[1]); fieldsFound++; }
      if (underMatch) { cl.oddsUnder = clean(underMatch[1]); fieldsFound++; }
    }

    // === FORM ===
    const homeForm = findFormValue(fullText, ['formă gazdă', 'home form', 'forma gazda']);
    if (homeForm) { updated.homeTeam.formLast5 = homeForm; fieldsFound++; }
    const awayForm = findFormValue(fullText, ['formă oaspete', 'away form', 'forma oaspete']);
    if (awayForm) { updated.awayTeam.formLast5 = awayForm; fieldsFound++; }

    // === LEAGUE ===
    const leagueMatch = fullText.match(/(?:liga|league|competiție|laliga|serie a|premier league|bundesliga|ligue 1)[:\s]*([A-Za-zĂÂÎȘȚăâîșț\s0-9/]+)/i);
    if (leagueMatch) {
      updated.league = leagueMatch[0].trim().slice(0, 40);
      fieldsFound++;
    }

    // === TITLE LINE: "TeamA vs TeamB" ===
    const vsMatch = fullText.match(/([A-ZĂÂÎȘȚa-zăâîșț\s]+?)\s+vs\.?\s+([A-ZĂÂÎȘȚa-zăâîșț\s]+?)(?:\s*[–—-]|\s|$)/i);
    if (vsMatch && !headerFound) {
      const home = vsMatch[1].trim();
      const away = vsMatch[2].trim();
      if (home.length > 1 && updated.homeTeam.name === '') { updated.homeTeam.name = home; fieldsFound++; }
      if (away.length > 1 && updated.awayTeam.name === '') { updated.awayTeam.name = away; fieldsFound++; }
    }

    onChange(updated);
    setStatus(`✅ ${fieldsFound} câmpuri detectate și completate automat.`);
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
          <DialogTitle className="text-sm">📋 Paste Statistics Importer</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">Paste raw match statistics here (tabel sau text)</Label>
            <Textarea
              value={text}
              onChange={e => { setText(e.target.value); setStatus(null); }}
              placeholder={"Lipește tabelul copiat, ex:\n\nStatistică\tBarcelona\tSevilla\nGoluri\t2.7\t1.3\nPosesie\t69.2%\t53.7%\nxG\t2.5\t1.1\nȘuturi pe poartă\t7.3\t3.8\nCornere\t7.4\t5.0\nFaulturi\t9.3\t15.0"}
              className="bg-secondary border-border min-h-[150px] mt-1 font-mono text-xs"
            />
          </div>
          <div className="flex items-center gap-3">
            <Button size="sm" onClick={handleExtract} disabled={!text.trim()} className="font-bold">
              🔍 Extract Data
            </Button>
            {status && <span className="text-xs text-primary">{status}</span>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
