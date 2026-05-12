function formatIsoDate(d: Date): { iso: string | null; ms: number | null } {
  if (Number.isNaN(d.getTime())) return { iso: null, ms: null };
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return { iso: `${yyyy}-${mm}-${dd}`, ms: d.getTime() };
}

function normalizeDateText(dateStr: string): string {
  return dateStr
    .trim()
    .replace(/\s+-\s+/g, ' ')
    .replace(/(\d)(am|pm)$/i, '$1 $2')
    .replace(/\s+/g, ' ');
}

export function toIsoDate(ts: number | null, dateStr: string | null): { iso: string | null; ms: number | null } {
  if (ts && Number.isFinite(ts) && ts > 0) {
    const ms = ts > 1e12 ? ts : ts * 1000;
    const fromTs = formatIsoDate(new Date(ms));
    if (fromTs.iso) return fromTs;
  }
  if (dateStr) {
    const normalized = normalizeDateText(dateStr);
    const iso = normalized.match(/\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b/);
    if (iso) {
      const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
      const parsed = formatIsoDate(d);
      if (parsed.iso) return parsed;
    }
    const european = normalized.match(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})\b/);
    if (european) {
      const a = Number(european[1]);
      const b = Number(european[2]);
      const year = Number(european[3].length === 2 ? `20${european[3]}` : european[3]);
      const day = a > 12 ? a : b > 12 ? b : a;
      const month = a > 12 ? b : b > 12 ? a : b;
      const parsed = formatIsoDate(new Date(year, month - 1, day));
      if (parsed.iso) return parsed;
    }
    const parsed = formatIsoDate(new Date(normalized));
    if (parsed.iso) return parsed;
  }
  return { iso: null, ms: null };
}

export function isoDateFromRaw(raw?: Record<string, unknown> | null, fallbackDate?: string | null, fallbackTimestamp?: number | null): string | null {
  if (fallbackDate) return fallbackDate;
  const source = raw ?? {};
  const timestamp = fallbackTimestamp ?? Number(source.timestamp ?? source.date_unix ?? source.date_gmt_unix ?? source.date_unix_kickoff);
  const rawDate = String(source.date_GMT ?? source.date_gmt ?? source.kickoff_date ?? source.date ?? '').trim() || null;
  return toIsoDate(Number.isFinite(timestamp) ? timestamp : null, rawDate).iso;
}