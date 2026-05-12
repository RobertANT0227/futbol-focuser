/** Safe number parser: returns null for empty, "-", "N/A", "?", -1 sentinel etc. */
export function safeNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).trim();
  if (!s || s === '-' || /^n\/?a$/i.test(s) || s === '?' || s === 'null' || s === 'undefined') return null;
  const cleaned = s.replace('%', '').replace(/,/g, '.').replace(/\s/g, '');
  const n = parseFloat(cleaned);
  if (!Number.isFinite(n)) return null;
  // FootyStats sentinel for missing = -1
  if (n === -1) return null;
  return n;
}

export function pickFirst<T>(row: Record<string, unknown>, keys: string[], fn: (v: unknown) => T | null): T | null {
  for (const k of keys) {
    if (k in row) {
      const v = fn(row[k]);
      if (v !== null && v !== undefined) return v;
    }
  }
  return null;
}

export function safeStr(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s || /^n\/?a$/i.test(s)) return null;
  return s;
}

/** Normalize team name for fuzzy matching. */
export function normalizeTeamName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(fc|cf|sc|ac|afc|cfc|club|de|del|la|el|the|united|utd|city)\b/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Levenshtein distance for fuzzy matching. */
export function distance(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0]; dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : Math.min(prev, dp[j - 1], dp[j]) + 1;
      prev = tmp;
    }
  }
  return dp[n];
}

export function fuzzyMatch(query: string, candidates: string[], threshold = 0.35): string | null {
  const q = normalizeTeamName(query);
  if (!candidates.length) return null;
  let best = candidates[0];
  let bestScore = Infinity;
  for (const c of candidates) {
    const nc = normalizeTeamName(c);
    if (!nc) continue;
    if (nc === q) return c;
    const d = distance(q, nc) / Math.max(q.length, nc.length);
    if (d < bestScore) { bestScore = d; best = c; }
  }
  return bestScore <= threshold ? best : null;
}