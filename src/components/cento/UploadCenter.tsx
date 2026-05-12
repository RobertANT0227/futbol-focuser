import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { parseFootyStatsFile, groupFiles, type ParsedFile } from '@/lib/cento/footystats';
import { persistBundle } from '@/lib/cento/persistence';
import { useAuth } from '@/contexts/AuthContext';
import { Upload, FileText, CheckCircle2, X, Loader2, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';

interface FileItem {
  file: File;
  parsed?: ParsedFile;
  error?: string;
  parsing: boolean;
}

type CoverageSpec = { label: string; keys: string[]; requiredRatio?: number };
type CoverageReport = { pct: number; missing: string[]; present: number; total: number };

const SPECS: Record<'league' | 'matches' | 'teams', CoverageSpec[]> = {
  league: [
    { label: 'media goluri ligă', keys: ['goalsPerMatch'] },
    { label: 'goluri acasă/deplasare ligă', keys: ['homeGoalsAvg', 'awayGoalsAvg'] },
    { label: 'procente Over 2.5', keys: ['over25Pct'] },
    { label: 'procente BTTS', keys: ['bttsPct'] },
    { label: 'cornere pe meci', keys: ['cornersPerMatch'] },
    { label: 'xG mediu ligă', keys: ['xgPerMatch'] },
  ],
  matches: [
    { label: 'data meciului', keys: ['date'] },
    { label: 'echipa gazdă', keys: ['home'] },
    { label: 'echipa oaspete', keys: ['away'] },
    { label: 'status incomplete/complete', keys: ['played'] },
    { label: 'cote 1X2', keys: ['oddsHome', 'oddsDraw', 'oddsAway'] },
    { label: 'cote Over/Under 2.5', keys: ['oddsOver25', 'oddsUnder25'] },
    { label: 'cote BTTS', keys: ['oddsBttsYes', 'oddsBttsNo'] },
    { label: 'xG/PPG prematch gazdă', keys: ['preXgHome', 'preHomeGoalsAvg'] },
    { label: 'xG/PPG prematch oaspete', keys: ['preXgAway', 'preAwayGoalsAvg'] },
    { label: 'potențial Over 2.5 prematch', keys: ['preOver25Pct'] },
    { label: 'potențial BTTS prematch', keys: ['preBttsPct'] },
  ],
  teams: [
    { label: 'meciuri jucate', keys: ['matchesPlayed'] },
    { label: 'poziție clasament', keys: ['position'] },
    { label: 'PPG / puncte', keys: ['ppg', 'points'] },
    { label: 'goluri marcate/primite', keys: ['goalsFor', 'goalsAgainst'] },
    { label: 'formă / win rate', keys: ['form', 'winPct', 'ppg'] },
    { label: 'procente Over 2.5', keys: ['over25Pct'] },
    { label: 'procente BTTS', keys: ['bttsPct'] },
    { label: 'split acasă goluri', keys: ['homeGFAvg', 'homeGAAvg'] },
    { label: 'split deplasare goluri', keys: ['awayGFAvg', 'awayGAAvg'] },
    { label: 'xG for/against', keys: ['xgFor', 'xgAgainst'] },
  ],
};

function hasValue(obj: Record<string, unknown>, key: string): boolean {
  const v = obj[key];
  if (v === null || v === undefined) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'number') return Number.isFinite(v);
  if (typeof v === 'string') return v.trim().length > 0;
  return true;
}

function coverageForRecords(kind: 'league' | 'matches' | 'teams', records: Record<string, unknown>[]): CoverageReport {
  const specs = SPECS[kind];
  if (!records.length) return { pct: 0, missing: [`lipsește fișierul ${kind}`], present: 0, total: specs.length };
  let present = 0;
  const missing: string[] = [];
  for (const spec of specs) {
    const completeRows = records.filter((r) => spec.keys.some((k) => hasValue(r, k))).length;
    const ratio = completeRows / records.length;
    if (ratio >= (spec.requiredRatio ?? 1)) present++;
    else missing.push(records.length === 1 ? spec.label : `${spec.label} (${completeRows}/${records.length} rânduri)`);
  }
  return { pct: Math.round((present / specs.length) * 100), missing, present, total: specs.length };
}

function fileCoverage(p?: ParsedFile): CoverageReport {
  if (!p) return { pct: 0, missing: ['fișier neparsat'], present: 0, total: 1 };
  if (p.league) return coverageForRecords('league', [p.league as unknown as Record<string, unknown>]);
  if (p.matches?.length) return coverageForRecords('matches', p.matches as unknown as Record<string, unknown>[]);
  if (p.teams?.length) return coverageForRecords('teams', p.teams as unknown as Record<string, unknown>[]);
  return { pct: 0, missing: [`nu am găsit rânduri valide în CSV ${p.meta.kind}`], present: 0, total: 1 };
}

function coverageColor(pct: number): string {
  if (pct >= 80) return 'text-emerald-500';
  if (pct >= 55) return 'text-amber-500';
  return 'text-destructive';
}

export function UploadCenter({ onSynced }: { onSynced?: () => void }) {
  const { user } = useAuth();
  const [items, setItems] = useState<FileItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const handleFiles = useCallback(async (files: File[]) => {
    const accepted = files.filter((f) => /\.csv$/i.test(f.name));
    if (!accepted.length) return;
    const next: FileItem[] = accepted.map((f) => ({ file: f, parsing: true }));
    setItems((prev) => [...prev, ...next]);
    for (const it of next) {
      try {
        const parsed = await parseFootyStatsFile(it.file);
        setItems((prev) => prev.map((p) => p.file === it.file ? { ...p, parsed, parsing: false } : p));
      } catch (e: any) {
        setItems((prev) => prev.map((p) => p.file === it.file ? { ...p, error: e?.message ?? 'parse error', parsing: false } : p));
      }
    }
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    handleFiles(Array.from(e.dataTransfer.files));
  }, [handleFiles]);

  const remove = (file: File) => setItems((prev) => prev.filter((p) => p.file !== file));

  const sync = async () => {
    if (!user) return;
    const parsed = items.map((i) => i.parsed).filter(Boolean) as ParsedFile[];
    if (!parsed.length) return;
    setSyncing(true);
    try {
      const bundles = groupFiles(parsed);
      for (const b of bundles) {
        await persistBundle(b, user.id);
      }
      toast({ title: 'League Successfully Synced', description: `${bundles.length} ligă/li importate.` });
      setItems([]);
      onSynced?.();
    } catch (e: any) {
      toast({ title: 'Eroare la import', description: e?.message ?? 'unknown', variant: 'destructive' });
    } finally {
      setSyncing(false);
    }
  };

  const bundles = groupFiles(items.map((i) => i.parsed).filter(Boolean) as ParsedFile[]);

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={cn(
          'rounded-xl border-2 border-dashed p-8 text-center transition-all cursor-pointer',
          dragOver ? 'border-primary bg-primary/10' : 'border-border bg-card/40 hover:bg-card/60',
        )}
        onClick={() => document.getElementById('cp-file-input')?.click()}
      >
        <input
          id="cp-file-input" type="file" multiple accept=".csv" className="hidden"
          onChange={(e) => e.target.files && handleFiles(Array.from(e.target.files))}
        />
        <Upload className="h-8 w-8 mx-auto text-primary mb-2" />
        <div className="text-sm font-bold">Drag & drop CSV-uri FootyStats</div>
        <div className="text-xs text-muted-foreground mt-1">league + matches + teams · selectează simultan toate cele 3 fișiere</div>
      </div>

      {items.length > 0 && (
        <div className="space-y-2">
          {items.map((it, i) => (
            <Card key={i} className="p-3 bg-card/60 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="h-4 w-4 text-primary shrink-0" />
                  <div className="min-w-0">
                    <div className="text-xs font-medium truncate">{it.file.name}</div>
                    {it.parsed && (
                      <div className="text-[10px] text-muted-foreground">
                        {it.parsed.meta.leagueName} · {it.parsed.meta.season} · <span className="capitalize">{it.parsed.meta.kind}</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {it.parsing && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                  {it.parsed && <CheckCircle2 className="h-4 w-4 text-primary" />}
                  {it.error && <Badge variant="destructive" className="text-[10px]">eroare</Badge>}
                  <button onClick={() => remove(it.file)} className="text-muted-foreground hover:text-destructive">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              {it.parsed && (() => {
                const report = fileCoverage(it.parsed);
                return (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-muted-foreground uppercase tracking-widest">Informație disponibilă</span>
                      <span className={cn('font-mono font-bold', coverageColor(report.pct))}>{report.pct}%</span>
                    </div>
                    <Progress value={report.pct} className="h-1.5" />
                    {report.missing.length > 0 && (
                      <div className="rounded-md border border-destructive/20 bg-destructive/5 p-2 text-[10px] text-muted-foreground">
                        <div className="mb-1 flex items-center gap-1 font-bold text-destructive"><AlertTriangle className="h-3 w-3" /> Lipsește pentru 100%</div>
                        <div>{report.missing.slice(0, 6).join(' · ')}{report.missing.length > 6 ? ` · +${report.missing.length - 6}` : ''}</div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </Card>
          ))}
        </div>
      )}

      {bundles.length > 0 && (
        <Card className="p-3 bg-card/60 space-y-3">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Grupare automată</div>
          {bundles.map((b, i) => {
            const leagueReport = coverageForRecords('league', b.league ? [b.league as unknown as Record<string, unknown>] : []);
            const matchesReport = coverageForRecords('matches', (b.matches ?? []) as unknown as Record<string, unknown>[]);
            const teamsReport = coverageForRecords('teams', (b.teams ?? []) as unknown as Record<string, unknown>[]);
            const overall = Math.round((leagueReport.pct + matchesReport.pct + teamsReport.pct) / 3);
            return (
              <div key={i} className="space-y-2 border-t pt-2 first:border-t-0 first:pt-0">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold truncate">{b.meta.leagueName} <span className="text-muted-foreground font-normal">· {b.meta.season}</span></span>
                  <span className={cn('font-mono font-bold text-[11px]', coverageColor(overall))}>{overall}% total</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-[10px]">
                  {[
                    { label: 'League', report: leagueReport, present: !!b.league },
                    { label: 'Matches', report: matchesReport, present: !!b.matches?.length, count: b.matches?.length },
                    { label: 'Teams', report: teamsReport, present: !!b.teams?.length, count: b.teams?.length },
                  ].map((s) => (
                    <div key={s.label} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="uppercase tracking-widest text-muted-foreground">{s.label}{s.count ? ` ·${s.count}` : ''}</span>
                        <span className={cn('font-mono font-bold', s.present ? coverageColor(s.report.pct) : 'text-muted-foreground/60')}>
                          {s.present ? `${s.report.pct}%` : '—'}
                        </span>
                      </div>
                      <Progress value={s.present ? s.report.pct : 0} className="h-1" />
                    </div>
                  ))}
                </div>
                {[leagueReport, matchesReport, teamsReport].some((r) => r.missing.length > 0) && (
                  <div className="rounded-md border border-border/60 bg-muted/20 p-2 text-[10px] text-muted-foreground">
                    <span className="font-bold text-foreground">Lipsuri CSV:</span>{' '}
                    {[
                      leagueReport.missing.length ? `League: ${leagueReport.missing.slice(0, 3).join(', ')}` : '',
                      matchesReport.missing.length ? `Matches: ${matchesReport.missing.slice(0, 4).join(', ')}` : '',
                      teamsReport.missing.length ? `Teams: ${teamsReport.missing.slice(0, 4).join(', ')}` : '',
                    ].filter(Boolean).join(' · ')}
                  </div>
                )}
              </div>
            );
          })}
        </Card>
      )}

      <div className="flex justify-end">
        <Button onClick={sync} disabled={!bundles.length || syncing} className="font-bold">
          {syncing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sincronizare...</> : `Sync ${bundles.length || ''} ligă/li`}
        </Button>
      </div>
    </div>
  );
}