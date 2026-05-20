// CENTO-V2
/** Normalize a team name for fuzzy lookup. */
export function normalizeTeam(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[._'"`]+/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\butd\b/g, 'united')
    .replace(/\b(fc|cf|sc|ac|afc|cfc|club)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
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

/** Returns the best candidate >= 90% similarity (or null). */
export function matchTeam(query: string, candidates: string[]): string | null {
  const q = normalizeTeam(query);
  if (!q) return null;
  let best: string | null = null;
  let bestScore = 0;
  for (const c of candidates) {
    const nc = normalizeTeam(c);
    if (!nc) continue;
    if (nc === q) return c;
    if (nc.includes(q) || q.includes(nc)) return c;
    const d = levenshtein(q, nc);
    const sim = 1 - d / Math.max(q.length, nc.length);
    if (sim > bestScore) { bestScore = sim; best = c; }
  }
  return bestScore >= 0.9 ? best : null;
}