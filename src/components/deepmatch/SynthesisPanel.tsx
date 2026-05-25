import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer, PolarRadiusAxis } from 'recharts';
import type { TeamRatings, MatchInsight } from '@/lib/deepmatch/ratings';
import type { ParsedTeamStats } from '@/lib/deepmatch/parser';
import { TrendingUp, Shield, Activity, Flag, Target, Goal, AlertTriangle } from 'lucide-react';

interface Props {
  title: string;
  icon: string;
  team: ParsedTeamStats;
  ratings: TeamRatings;
  compareRatings?: TeamRatings;
}

const METRICS: Array<{ key: keyof TeamRatings; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { key: 'offensive', label: 'Ofensiv', icon: TrendingUp },
  { key: 'defensive', label: 'Defensiv', icon: Shield },
  { key: 'tempo', label: 'Tempo', icon: Activity },
  { key: 'cornerPressure', label: 'Cornere', icon: Flag },
  { key: 'bttsPotential', label: 'BTTS', icon: Target },
  { key: 'overPotential', label: 'Over 2.5', icon: Goal },
  { key: 'discipline', label: 'Disciplină', icon: AlertTriangle },
];

function barColor(diff: number, invert = false): string {
  const d = invert ? -diff : diff;
  if (d > 8) return 'bg-primary';
  if (d < -8) return 'bg-destructive';
  return 'bg-accent';
}

export function SynthesisPanel({ title, icon, team, ratings, compareRatings }: Props) {
  const radarData = METRICS.map((m) => ({ metric: m.label, value: Math.round(ratings[m.key] as number) }));

  return (
    <Card className="p-4 space-y-4 bg-card/60">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {icon} {title}
        </h3>
        <span className="text-[10px] font-mono text-muted-foreground">
          Confidence {Math.round(ratings.confidence)}%
        </span>
      </div>

      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={radarData}>
            <PolarGrid stroke="hsl(var(--border))" />
            <PolarAngleAxis dataKey="metric" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} />
            <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
            <Radar dataKey="value" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.35} />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      <div className="space-y-2">
        {METRICS.map((m) => {
          const v = ratings[m.key] as number;
          const cv = compareRatings?.[m.key] as number | undefined;
          const diff = cv !== undefined ? v - cv : 0;
          const invert = m.key === 'discipline';
          const Icon = m.icon;
          return (
            <div key={m.key} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Icon className="h-3 w-3" /> {m.label}
                </span>
                <span className="font-mono font-bold">{Math.round(v)}</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div className={`h-full ${compareRatings ? barColor(diff, invert) : 'bg-primary'} transition-all`} style={{ width: `${Math.round(v)}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      {ratings.homeAdvantage !== undefined && (
        <div className="pt-2 border-t border-border/50 text-xs">
          <span className="text-muted-foreground">Home advantage: </span>
          <span className="font-mono font-bold">{Math.round(ratings.homeAdvantage)}/100</span>
        </div>
      )}
      {ratings.awayResistance !== undefined && (
        <div className="pt-2 border-t border-border/50 text-xs">
          <span className="text-muted-foreground">Away resistance: </span>
          <span className="font-mono font-bold">{Math.round(ratings.awayResistance)}/100</span>
        </div>
      )}
    </Card>
  );
}

export function InsightsList({ insights }: { insights: MatchInsight[] }) {
  return (
    <Card className="p-4 bg-card/60">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
        💡 Insights automate
      </h3>
      <ul className="space-y-2">
        {insights.map((ins, i) => (
          <li
            key={i}
            className={`text-xs px-3 py-2 rounded-md border-l-2 ${
              ins.tone === 'positive'
                ? 'border-primary bg-primary/10 text-foreground'
                : ins.tone === 'negative'
                ? 'border-destructive bg-destructive/10 text-foreground'
                : 'border-accent bg-accent/10 text-foreground'
            }`}
          >
            {ins.text}
          </li>
        ))}
      </ul>
    </Card>
  );
}