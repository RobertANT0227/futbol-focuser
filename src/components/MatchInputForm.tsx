import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import type { TeamStats, MatchData } from '@/lib/types';

const FORM_OPTIONS = ['W', 'D', 'L'] as const;
const STYLES = ['possession', 'counter', 'pressing', 'low-block', 'bus-parking', 'high-press'] as const;

const STYLE_LABELS: Record<string, string> = {
  'possession': '🎯 Posesie',
  'counter': '⚡ Contraatac',
  'pressing': '🔥 Pressing',
  'low-block': '🛡️ Low-Block',
  'bus-parking': '🚌 Bus Parking',
  'high-press': '⚡ High Press (Gegenpress)',
};

function defaultTeam(name: string): TeamStats {
  return {
    name,
    goalsScored: 1.3, goalsConceded: 1.1,
    goalsScoredHome: 1.5, goalsConcededHome: 1.0,
    goalsScoredAway: 1.1, goalsConcededAway: 1.3,
    matchesPlayed: 20,
    formLast5: ['W', 'D', 'L', 'W', 'D'],
    formHome: ['W', 'W', 'D', 'W', 'L'],
    formAway: ['D', 'L', 'W', 'D', 'L'],
    xG: 1.3, xGA: 1.1,
    shots: 12, shotsOnTarget: 4,
    shotsOnTargetHome: 4.5, shotsOnTargetAway: 3.5,
    possession: 50, dangerousAttacks: 40,
    corners: 0, cornersPerMatch: 5,
    cornersPerMatchHome: 5,
    cornersPerMatchAway: 4,
    cards: 0, cardsPerMatch: 2,
    fouls: 12,
    playStyle: 'possession',
    leaguePosition: 10,
    totalTeamsInLeague: 20,
    gkSaves: 3,
  };
}

export function defaultMatch(): MatchData {
  return {
    homeTeam: defaultTeam('Echipa Gazdă'),
    awayTeam: defaultTeam('Echipa Oaspete'),
    league: '',
    oddsHome: 2.0, oddsDraw: 3.3, oddsAway: 3.5,
    oddsOver25: 1.85, oddsUnder25: 2.0,
    oddsBTTSYes: 1.8, oddsBTTSNo: 2.0,
    cornerLines: [
      { line: 10.5, oddsOver: 1.85, oddsUnder: 2.0 },
      { line: 11.5, oddsOver: 2.10, oddsUnder: 1.75 },
      { line: 12.5, oddsOver: 2.40, oddsUnder: 1.55 },
    ],
    isDerby: false,
    homeTeamFatigued: false, awayTeamFatigued: false,
    homeEuropeanMatch: false, awayEuropeanMatch: false,
  };
}

interface Props {
  match: MatchData;
  onChange: (match: MatchData) => void;
}

function FormSelector({ form, onChange, label }: { form: ('W' | 'D' | 'L')[]; onChange: (f: ('W' | 'D' | 'L')[]) => void; label: string }) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex gap-1 mt-1">
        {form.map((f, i) => (
          <Select key={i} value={f} onValueChange={v => {
            const newForm = [...form];
            newForm[i] = v as 'W' | 'D' | 'L';
            onChange(newForm);
          }}>
            <SelectTrigger className={`w-14 text-xs font-mono ${f === 'W' ? 'bg-primary/20 text-primary' : f === 'L' ? 'bg-destructive/20 text-destructive' : 'bg-accent/20 text-accent'}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FORM_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
            </SelectContent>
          </Select>
        ))}
      </div>
    </div>
  );
}

function TeamForm({ team, onChange, label, isHome }: { team: TeamStats; onChange: (t: TeamStats) => void; label: string; isHome: boolean }) {
  const update = (key: keyof TeamStats, value: any) => onChange({ ...team, [key]: value });

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{label}</h3>
      
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs text-muted-foreground">Nume echipă</Label>
          <Input value={team.name} onChange={e => update('name', e.target.value)} className="bg-secondary border-border" />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Meciuri jucate</Label>
          <Input type="number" value={team.matchesPlayed} onChange={e => update('matchesPlayed', +e.target.value)} className="bg-secondary border-border" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <Label className="text-xs text-muted-foreground">Medie goluri marcate/meci</Label>
          <Input type="number" step="0.1" value={team.goalsScored} onChange={e => update('goalsScored', +e.target.value)} className="bg-secondary border-border" />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Medie goluri primite/meci</Label>
          <Input type="number" step="0.1" value={team.goalsConceded} onChange={e => update('goalsConceded', +e.target.value)} className="bg-secondary border-border" />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Medie xG/meci</Label>
          <Input type="number" step="0.1" value={team.xG} onChange={e => update('xG', +e.target.value)} className="bg-secondary border-border" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs text-muted-foreground">Medie goluri acasă marcate/meci</Label>
          <Input type="number" step="0.1" value={team.goalsScoredHome} onChange={e => update('goalsScoredHome', +e.target.value)} className="bg-secondary border-border" />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Medie goluri acasă primite/meci</Label>
          <Input type="number" step="0.1" value={team.goalsConcededHome} onChange={e => update('goalsConcededHome', +e.target.value)} className="bg-secondary border-border" />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Medie goluri deplasare marcate/meci</Label>
          <Input type="number" step="0.1" value={team.goalsScoredAway} onChange={e => update('goalsScoredAway', +e.target.value)} className="bg-secondary border-border" />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Medie goluri deplasare primite/meci</Label>
          <Input type="number" step="0.1" value={team.goalsConcededAway} onChange={e => update('goalsConcededAway', +e.target.value)} className="bg-secondary border-border" />
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div>
          <Label className="text-xs text-muted-foreground">Medie șuturi/meci</Label>
          <Input type="number" step="0.1" value={team.shots} onChange={e => update('shots', +e.target.value)} className="bg-secondary border-border" />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Șuturi pe poartă/meci</Label>
          <Input type="number" step="0.1" value={team.shotsOnTarget} onChange={e => update('shotsOnTarget', +e.target.value)} className="bg-secondary border-border" />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Șuturi pe poartă acasă/meci</Label>
          <Input type="number" step="0.1" value={team.shotsOnTargetHome} onChange={e => update('shotsOnTargetHome', +e.target.value)} className="bg-secondary border-border" />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Șuturi pe poartă deplasare/meci</Label>
          <Input type="number" step="0.1" value={team.shotsOnTargetAway} onChange={e => update('shotsOnTargetAway', +e.target.value)} className="bg-secondary border-border" />
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div>
          <Label className="text-xs text-muted-foreground">Posesie %</Label>
          <Input type="number" value={team.possession} onChange={e => update('possession', +e.target.value)} className="bg-secondary border-border" />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Atacuri periculoase/meci</Label>
          <Input type="number" step="1" value={team.dangerousAttacks} onChange={e => update('dangerousAttacks', +e.target.value)} className="bg-secondary border-border" />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Salvări portar/meci</Label>
          <Input type="number" step="0.1" value={team.gkSaves} onChange={e => update('gkSaves', +e.target.value)} className="bg-secondary border-border" />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Medie cartonașe/meci</Label>
          <Input type="number" step="0.1" value={team.cardsPerMatch} onChange={e => update('cardsPerMatch', +e.target.value)} className="bg-secondary border-border" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs text-muted-foreground">Medie faulturi/meci</Label>
          <Input type="number" step="0.1" value={team.fouls} onChange={e => update('fouls', +e.target.value)} className="bg-secondary border-border" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <Label className="text-xs text-muted-foreground">Cornere/meci</Label>
          <Input type="number" step="0.1" value={team.cornersPerMatch} onChange={e => update('cornersPerMatch', +e.target.value)} className="bg-secondary border-border" />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Cornere acasă/meci</Label>
          <Input type="number" step="0.1" value={team.cornersPerMatchHome} onChange={e => update('cornersPerMatchHome', +e.target.value)} className="bg-secondary border-border" />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Cornere deplasare/meci</Label>
          <Input type="number" step="0.1" value={team.cornersPerMatchAway} onChange={e => update('cornersPerMatchAway', +e.target.value)} className="bg-secondary border-border" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs text-muted-foreground">Stil de joc</Label>
          <Select value={team.playStyle} onValueChange={v => update('playStyle', v)}>
            <SelectTrigger className="bg-secondary border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STYLES.map(s => <SelectItem key={s} value={s}>{STYLE_LABELS[s] || s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Loc clasament / Echipe în ligă</Label>
          <div className="flex gap-2">
            <Input type="number" value={team.leaguePosition} onChange={e => update('leaguePosition', +e.target.value)} className="bg-secondary border-border" placeholder="Loc" />
            <Input type="number" value={team.totalTeamsInLeague} onChange={e => update('totalTeamsInLeague', +e.target.value)} className="bg-secondary border-border" placeholder="Total" />
          </div>
        </div>
      </div>

      <FormSelector
        form={team.formLast5}
        onChange={f => update('formLast5', f)}
        label="Formă ultimele 5 meciuri (general)"
      />
      <FormSelector
        form={isHome ? team.formHome : team.formAway}
        onChange={f => update(isHome ? 'formHome' : 'formAway', f)}
        label={isHome ? '🏠 Formă ultimele 5 meciuri ACASĂ' : '✈️ Formă ultimele 5 meciuri DEPLASARE'}
      />
    </div>
  );
}

export function MatchInputForm({ match, onChange }: Props) {
  const updateHome = (t: TeamStats) => onChange({ ...match, homeTeam: t });
  const updateAway = (t: TeamStats) => onChange({ ...match, awayTeam: t });

  const updateCornerLine = (index: number, field: keyof typeof match.cornerLines[0], value: number) => {
    const newLines = [...match.cornerLines];
    newLines[index] = { ...newLines[index], [field]: value };
    onChange({ ...match, cornerLines: newLines });
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-card p-4 space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Liga & Context</h3>
        <div>
          <Label className="text-xs text-muted-foreground">Liga</Label>
          <Input value={match.league} onChange={e => onChange({ ...match, league: e.target.value })} className="bg-secondary border-border" />
        </div>
        <div className="flex flex-wrap gap-6">
          <div className="flex items-center gap-2">
            <Switch checked={match.isDerby} onCheckedChange={v => onChange({ ...match, isDerby: v })} />
            <Label className="text-xs">Derby</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={match.homeTeamFatigued} onCheckedChange={v => onChange({ ...match, homeTeamFatigued: v })} />
            <Label className="text-xs">Gazdă obosită</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={match.awayTeamFatigued} onCheckedChange={v => onChange({ ...match, awayTeamFatigued: v })} />
            <Label className="text-xs">Oaspete obosit</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={match.homeEuropeanMatch} onCheckedChange={v => onChange({ ...match, homeEuropeanMatch: v })} />
            <Label className="text-xs">Gazdă europeană</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={match.awayEuropeanMatch} onCheckedChange={v => onChange({ ...match, awayEuropeanMatch: v })} />
            <Label className="text-xs">Oaspete europeană</Label>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <TeamForm team={match.homeTeam} onChange={updateHome} label="🏠 Echipa Gazdă" isHome={true} />
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <TeamForm team={match.awayTeam} onChange={updateAway} label="✈️ Echipa Oaspete" isHome={false} />
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-4 space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Cote Bookmaker</h3>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label className="text-xs text-muted-foreground">Cota 1 (Gazdă)</Label>
            <Input type="number" step="0.01" value={match.oddsHome} onChange={e => onChange({ ...match, oddsHome: +e.target.value })} className="bg-secondary border-border" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Cota X (Egal)</Label>
            <Input type="number" step="0.01" value={match.oddsDraw} onChange={e => onChange({ ...match, oddsDraw: +e.target.value })} className="bg-secondary border-border" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Cota 2 (Oaspete)</Label>
            <Input type="number" step="0.01" value={match.oddsAway} onChange={e => onChange({ ...match, oddsAway: +e.target.value })} className="bg-secondary border-border" />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <Label className="text-xs text-muted-foreground">Over 2.5</Label>
            <Input type="number" step="0.01" value={match.oddsOver25} onChange={e => onChange({ ...match, oddsOver25: +e.target.value })} className="bg-secondary border-border" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Under 2.5</Label>
            <Input type="number" step="0.01" value={match.oddsUnder25} onChange={e => onChange({ ...match, oddsUnder25: +e.target.value })} className="bg-secondary border-border" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">BTTS Da</Label>
            <Input type="number" step="0.01" value={match.oddsBTTSYes} onChange={e => onChange({ ...match, oddsBTTSYes: +e.target.value })} className="bg-secondary border-border" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">BTTS Nu</Label>
            <Input type="number" step="0.01" value={match.oddsBTTSNo} onChange={e => onChange({ ...match, oddsBTTSNo: +e.target.value })} className="bg-secondary border-border" />
          </div>
        </div>

        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mt-2">⛳ Linii Cornere</h4>
        {match.cornerLines.map((cl, idx) => (
          <div key={idx} className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Linia {cl.line}</Label>
              <Input type="number" step="0.5" value={cl.line} onChange={e => updateCornerLine(idx, 'line', +e.target.value)} className="bg-secondary border-border" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Over {cl.line}</Label>
              <Input type="number" step="0.01" value={cl.oddsOver} onChange={e => updateCornerLine(idx, 'oddsOver', +e.target.value)} className="bg-secondary border-border" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Under {cl.line}</Label>
              <Input type="number" step="0.01" value={cl.oddsUnder} onChange={e => updateCornerLine(idx, 'oddsUnder', +e.target.value)} className="bg-secondary border-border" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
