import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Info } from 'lucide-react';

export function NumericField({ label, value, onChange, optional = false, max, min = 0, step = 'any', hint }: {
  label: string; value: number | null; onChange: (v: number | null) => void;
  optional?: boolean; max?: number; min?: number; step?: string; hint?: string;
}) {
  const id = `live-${label.replace(/\s/g, '-')}`;
  return <div className="space-y-2 min-w-0"><Label htmlFor={id} className="text-xs flex items-center gap-1.5">{label}<FieldHint text={hint ?? (optional ? 'Facultativ. Dacă lipsește, analiza indică acest lucru.' : 'Introdu valoarea cumulată până la minutul curent.')} /></Label>
    <Input id={id} type="number" inputMode="decimal" min={min} max={max} step={step} value={value ?? ''} placeholder={optional ? 'Opțional' : '0'} onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))} className="font-mono" /></div>;
}
export function FieldHint({ text }: { text: string }) {
  return <Tooltip><TooltipTrigger asChild><span tabIndex={0} aria-label={text} className="inline-flex text-muted-foreground cursor-help"><Info className="size-3" /></span></TooltipTrigger><TooltipContent className="max-w-64">{text}</TooltipContent></Tooltip>;
}
export function ChoiceField({ label, value, options, onChange, hint }: { label: string; value: string; options: Record<string, string>; onChange: (value: string) => void; hint?: string }) {
  return <div className="space-y-2 min-w-0"><Label className="text-xs flex items-center gap-1.5">{label}{hint && <FieldHint text={hint} />}</Label><Select value={value} onValueChange={onChange}><SelectTrigger aria-label={label} className="h-auto min-h-10 [&>span]:text-left [&>span]:whitespace-normal"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(options).map(([key, title]) => <SelectItem value={key} key={key}>{title}</SelectItem>)}</SelectContent></Select></div>;
}