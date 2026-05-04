import type { PlaystyleDetection } from '@/lib/playstyleDetect';

interface Props {
  teamName: string;
  detection: PlaystyleDetection;
}

const CONFIDENCE_COLORS: Record<string, string> = {
  HIGH: 'bg-primary/15 text-primary border-primary/30',
  MEDIUM: 'bg-accent/15 text-accent border-accent/30',
  LOW: 'bg-muted text-muted-foreground border-border',
};

export function PlaystyleBadge({ teamName, detection }: Props) {
  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-bold">{teamName}</span>
        <span className={`px-2 py-0.5 rounded border text-[10px] font-bold ${CONFIDENCE_COLORS[detection.confidence]}`}>
          {detection.confidence}
        </span>
      </div>
      <div className="text-base font-bold">{detection.label}</div>
      <ul className="space-y-0.5">
        {detection.reasons.map((r, i) => (
          <li key={i} className="text-[11px] font-mono text-muted-foreground">• {r}</li>
        ))}
      </ul>
    </div>
  );
}
