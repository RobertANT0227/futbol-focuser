import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import type { UserPlan } from '@/lib/types';

export const defaultPlan: UserPlan = {
  maxRisk: 'medium',
  bankroll: 1000,
  preferredBets: ['corners', 'winner', 'goals'],
};

interface Props {
  plan: UserPlan;
  onChange: (plan: UserPlan) => void;
}

export function PlanForm({ plan, onChange }: Props) {
  const toggleBet = (bet: 'corners' | 'winner' | 'goals') => {
    const bets = plan.preferredBets.includes(bet)
      ? plan.preferredBets.filter(b => b !== bet)
      : [...plan.preferredBets, bet];
    onChange({ ...plan, preferredBets: bets });
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-4">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">📋 Plan Personalizat</h3>
      
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs text-muted-foreground">Bankroll (LEI)</Label>
          <Input type="number" value={plan.bankroll} onChange={e => onChange({ ...plan, bankroll: +e.target.value })} className="bg-secondary border-border" />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Risc maxim</Label>
          <Select value={plan.maxRisk} onValueChange={v => onChange({ ...plan, maxRisk: v as any })}>
            <SelectTrigger className="bg-secondary border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Scăzut</SelectItem>
              <SelectItem value="medium">Mediu</SelectItem>
              <SelectItem value="high">Ridicat</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label className="text-xs text-muted-foreground mb-2 block">Tipuri de pariuri preferate</Label>
        <div className="flex gap-4">
          {[
            { id: 'corners' as const, label: '⛳ Cornere', color: 'text-bet-corners' },
            { id: 'winner' as const, label: '🏆 Solist', color: 'text-bet-winner' },
            { id: 'goals' as const, label: '⚽ Goluri', color: 'text-bet-goals' },
          ].map(bet => (
            <label key={bet.id} className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={plan.preferredBets.includes(bet.id)}
                onCheckedChange={() => toggleBet(bet.id)}
              />
              <span className={`text-sm font-medium ${bet.color}`}>{bet.label}</span>
            </label>
          ))}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">💡 Kelly Criterion full — robotul calculează automat miza optimă din bankroll.</p>
    </div>
  );
}
