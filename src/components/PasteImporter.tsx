import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
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

// Try to find a number near a label in the text
function findValue(text: string, patterns: string[]): number | null {
  for (const pat of patterns) {
    // Try "label: value" or "label value" or "value label"
    const escapedPat = pat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // label followed by number
    const r1 = new RegExp(escapedPat + '[:\\s]+([\\d]+[.,]?[\\d]*)', 'i');
    const m1 = text.match(r1);
    if (m1) return clean(m1[1]);

    // number followed by label
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

export function PasteImporter({ match, onChange }: Props) {
  const [text, setText] = useState('');
  const [status, setStatus] = useState<string | null>(null);

  const handleExtract = () => {
    if (!text.trim()) return;

    const lines = text.replace(/\r\n/g, '\n').split('\n').map(l => l.trim()).filter(Boolean);
    const fullText = lines.join(' ');
    
    // Try to split into home/away sections
    let homeText = fullText;
    let awayText = fullText;
    
    // Look for team name patterns or "home" / "away" / "gazdă" / "oaspete" sections
    const halfIdx = Math.floor(lines.length / 2);
    if (lines.length > 6) {
      homeText = lines.slice(0, halfIdx).join(' ');
      awayText = lines.slice(halfIdx).join(' ');
    }

    const updated = JSON.parse(JSON.stringify(match)) as MatchData;
    let fieldsFound = 0;

    // === TEAM STATS EXTRACTION ===
    const extractTeamStats = (section: string, isHome: boolean) => {
      const team = isHome ? updated.homeTeam : updated.awayTeam;
      
      // Team name - first word/phrase that looks like a name
      const nameMatch = section.match(/^([A-ZĂÂÎȘȚa-zăâîșț\s]{3,30})/);
      if (nameMatch) {
        const potentialName = nameMatch[1].trim();
        if (potentialName.length > 2 && !/^\d/.test(potentialName)) {
          team.name = potentialName;
          fieldsFound++;
        }
      }

      const trySet = (key: string, patterns: string[]) => {
        const v = findValue(section, patterns);
        if (v !== null) {
          (team as any)[key] = v;
          fieldsFound++;
        }
      };

      trySet('matchesPlayed', ['meciuri jucate', 'matches played', 'played', 'meciuri', 'mp']);
      trySet('goalsScored', ['goluri marcate', 'goals scored', 'goals for', 'gf', 'marcate/meci', 'scored']);
      trySet('goalsConceded', ['goluri primite', 'goals conceded', 'goals against', 'ga', 'primite/meci', 'conceded']);
      trySet('goalsScoredHome', ['goluri acasă marcate', 'home goals scored', 'goluri acasa marcate']);
      trySet('goalsConcededHome', ['goluri acasă primite', 'home goals conceded', 'goluri acasa primite']);
      trySet('goalsScoredAway', ['goluri deplasare marcate', 'away goals scored']);
      trySet('goalsConcededAway', ['goluri deplasare primite', 'away goals conceded']);
      trySet('xG', ['xg', 'expected goals']);
      trySet('shots', ['șuturi/meci', 'suturi/meci', 'shots per', 'shots']);
      trySet('shotsOnTarget', ['șuturi pe poartă', 'suturi pe poarta', 'shots on target', 'sot']);
      trySet('shotsOnTargetHome', ['șuturi pe poartă acasă', 'suturi pe poarta acasa', 'sot home']);
      trySet('shotsOnTargetAway', ['șuturi pe poartă deplasare', 'suturi pe poarta deplasare', 'sot away']);
      trySet('possession', ['posesie', 'possession', 'ball possession']);
      trySet('cardsPerMatch', ['cartonașe', 'cartonase', 'cards', 'yellow cards']);
      trySet('fouls', ['faulturi', 'fouls']);
      trySet('cornersPerMatch', ['cornere/meci', 'corners per', 'corners']);
      trySet('cornersPerMatchHome', ['cornere acasă', 'cornere acasa', 'home corners']);
      trySet('cornersPerMatchAway', ['cornere deplasare', 'away corners']);
      trySet('leaguePosition', ['loc clasament', 'position', 'loc', 'clasament']);
      trySet('totalTeamsInLeague', ['echipe în ligă', 'echipe in liga', 'teams in league', 'total teams']);
    };

    extractTeamStats(homeText, true);
    extractTeamStats(awayText, false);

    // === ODDS EXTRACTION (from full text) ===
    const tryOdds = (key: string, patterns: string[]) => {
      const v = findValue(fullText, patterns);
      if (v !== null) {
        (updated as any)[key] = v;
        fieldsFound++;
      }
    };

    tryOdds('oddsHome', ['cota 1', 'odds home', 'home win', '1x2.*1']);
    tryOdds('oddsDraw', ['cota x', 'odds draw', 'draw']);
    tryOdds('oddsAway', ['cota 2', 'odds away', 'away win']);
    tryOdds('oddsOver25', ['over 2.5', 'o2.5', 'over 2,5']);
    tryOdds('oddsUnder25', ['under 2.5', 'u2.5', 'under 2,5']);
    tryOdds('oddsBTTSYes', ['btts yes', 'btts da', 'gg', 'both teams to score yes']);
    tryOdds('oddsBTTSNo', ['btts no', 'btts nu', 'ng', 'both teams to score no']);

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
    const leagueMatch = fullText.match(/(?:liga|league|competiție)[:\s]+([A-Za-zĂÂÎȘȚăâîșț\s0-9]+)/i);
    if (leagueMatch) {
      updated.league = leagueMatch[1].trim().slice(0, 40);
      fieldsFound++;
    }

    // === SCAN FOR NUMBERS IN TABULAR FORMAT ===
    // Many stats sites show: "Home Value | Label | Away Value"
    for (const line of lines) {
      const parts = line.split(/[\t|]+/).map(p => p.trim());
      if (parts.length >= 3) {
        const left = clean(parts[0]);
        const label = parts[1].toLowerCase();
        const right = clean(parts[parts.length - 1]);

        if (left > 0 || right > 0) {
          const mappings: Record<string, [string, string]> = {
            'goluri': ['goalsScored', 'goalsScored'],
            'goals': ['goalsScored', 'goalsScored'],
            'xg': ['xG', 'xG'],
            'shots': ['shots', 'shots'],
            'suturi': ['shots', 'shots'],
            'shots on target': ['shotsOnTarget', 'shotsOnTarget'],
            'possession': ['possession', 'possession'],
            'posesie': ['possession', 'possession'],
            'corners': ['cornersPerMatch', 'cornersPerMatch'],
            'cornere': ['cornersPerMatch', 'cornersPerMatch'],
            'fouls': ['fouls', 'fouls'],
            'faulturi': ['fouls', 'fouls'],
            'cards': ['cardsPerMatch', 'cardsPerMatch'],
            'cartonase': ['cardsPerMatch', 'cardsPerMatch'],
          };

          for (const [key, [homeKey, awayKey]] of Object.entries(mappings)) {
            if (label.includes(key)) {
              if (left > 0) { (updated.homeTeam as any)[homeKey] = left; fieldsFound++; }
              if (right > 0) { (updated.awayTeam as any)[awayKey] = right; fieldsFound++; }
              break;
            }
          }
        }
      }
    }

    onChange(updated);
    setStatus(`✅ ${fieldsFound} câmpuri detectate și completate automat.`);
    console.log('PasteImporter: extracted', fieldsFound, 'fields', updated);
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        📋 Paste Statistics Importer
      </h3>
      <div>
        <Label className="text-xs text-muted-foreground">Paste raw match statistics here</Label>
        <Textarea
          value={text}
          onChange={e => { setText(e.target.value); setStatus(null); }}
          placeholder="Lipește aici statisticile copiate de pe site-uri (ex: flashscore, soccerstats, sofascore)..."
          className="bg-secondary border-border min-h-[120px] mt-1 font-mono text-xs"
        />
      </div>
      <div className="flex items-center gap-3">
        <Button onClick={handleExtract} disabled={!text.trim()} className="font-bold">
          🔍 Extract Data
        </Button>
        {status && <span className="text-xs text-primary">{status}</span>}
      </div>
    </div>
  );
}
