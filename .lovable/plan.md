## Cento Power v2 — Professional Football Intelligence Terminal

Transformăm pagina actuală `/cento-power` într-un terminal premium multi-league, persistent, cu motor de value betting și bankroll integration. Restul aplicației (Dashboard, Bankroll Manager, Admin) rămâne neschimbat.

---

### 1. Persistență multi-league (Lovable Cloud)

Tabele noi (RLS: doar `owner` + `premium`):

- `cp_leagues` — `id, name, country, season, created_at, owner_id`
- `cp_teams` — `id, league_id, name, playstyle, stats jsonb, updated_at` (unique league_id+name)
- `cp_matches` — `id, league_id, season, match_date, home, away, stats jsonb, odds jsonb, source_batch_id` (unique key: `league_id+season+match_date+home+away` → upsert, fără duplicate)
- `cp_imports` — `id, league_id, season, file_type, rows_imported, created_at, owner_id`
- `cp_watchlist` — `id, owner_id, payload jsonb, created_at`

Toate cu RLS: `has_role(auth.uid(),'owner')` SAU `account_type IN ('owner','premium')` via `account_meta`.

### 2. Multi-file Upload Engine (`src/lib/cento/importer.ts`)

- Drag & drop multi-file, parse paralel cu `papaparse`.
- Detect automat: `league` (din nume fișier sau coloană), `season`, `file_type` (League / Team / H2H / Match) — **fără** a afișa parser logs sau "columns detected".
- Merge inteligent prin upsert pe unique key. Reîncărcare = update + skip duplicates.
- UI: progress card minimal ("Imported 3 leagues · 482 matches · 0 duplicates").

### 3. CSV Understanding Engine (extins)

Extind `COLUMN_ALIASES` din `src/lib/csvScanner.ts` cu: xG, xGA, possession, shots, SOT, shots off, fouls, corners, cards, BTTS%, Over/Under %, HT stats, clean sheets, scoring/conceding timing, home/away splits, PPG, league position, form, dangerous attacks, attacking/defensive intensity. Normalizare automată %, virgule, totaluri vs per-meci.

### 4. Auto Playstyle Engine (`src/lib/cento/playstyle.ts`)

Funcție `detectPlaystyles(team)` → returnează tag primary + tag-uri secundare:

```text
PRIMARY: possession / pressing / counter / low-block / high-press / bus-parking
SECONDARY (multi-tag): direct, transition-heavy, wide, def-transition-weak,
  high-xg-low-conv, low-xg-high-eff, set-piece, card-aggressive, corner-heavy,
  second-half, fast-starter, late-goal
```

Reguli pe baza pragurilor din brief (possession %, dangerous attacks, shots, conversion xG/goals etc.).

### 5. Smart Analysis & Value Engine (`src/lib/cento/valueEngine.ts`)

Pentru fiecare match generat (din Match CSV sau perechi de echipe în aceeași ligă):

- weighted recent form (ultimele 5, decay exp), home/away weighting
- xG differential, shot quality (SOT/Shots), pace projection
- variance, confidence score, risk score
- style matchup detection (mismatch flags)
- markets: 1X2, O/U 2.5, BTTS, Corners, Cards, HT, Team Totals
- pentru fiecare market: implied prob, break-even %, model WR, EV, edge
- afișează doar `WR > BE%` cu `edge ≥ threshold` (configurabil în Filters)
- alege automat **Best Value Market** per meci

Reutilizează `runAnalysis()` existent dar îl extinde — nu rescriem nucleul Poisson/MC/Kelly.

### 6. UI nou — Cento Power Terminal

Înlocuim conținutul `src/pages/CentoPower.tsx` cu shell de terminal + sub-rute interne (taburi):

- **Imports** — drag&drop multi-file, listă batch-uri recente
- **Database** — sidebar arborescent League → Season → Teams/Matches; căutare globală (echipe/ligi/markete)
- **Value Engine** — Top Value Bets Today: cards cu edge bar, WR, EV, confidence bar, risk badge, playstyle clash icon, suggested stake (Kelly adj. la bankroll)
- **Filters** sticky: WR min, EV min, odds min/max, risk, playstyle, league, market, edge min
- **Bankroll** mini-widget (link la pagina existentă) cu exposure today, max daily risk, drawdown

Componente noi:
```
src/components/cento/
  ImportDropzone.tsx
  DatabaseTree.tsx
  GlobalSearch.tsx
  ValueBetCard.tsx
  EdgeBar.tsx · ConfidenceBar.tsx · RiskBadge.tsx · PlaystyleBadge.tsx
  StickyFilters.tsx
  TopValueGrid.tsx
```

Design: dark terminal premium — folosesc tokens semantice (`--background`, `--card`, `--primary`, `--accent`, `--destructive`) + adaug în `index.css` câțiva tokens noi (`--cento-grid`, `--edge-positive`, `--edge-negative`, `--risk-low/med/high`). Fără tabele Excel-like, fără debug text. Heatmap simplu pentru xG via div-grid + opacitate.

### 7. Sidebar & access

Actualizez `AppSidebar.tsx` ordinea: Dashboard, Cento Power, Bankroll, Database (link intern Cento), Settings. Cento rămâne **premium-only** (`requirePremium` deja existent).

### 8. Performanță

- Indexed queries pe `(league_id, season, match_date)`.
- React Query cache + `staleTime` 5 min.
- Parsing în Web Worker (`src/lib/cento/parser.worker.ts`) pentru fișiere mari.
- Filtrare client-side cu `useMemo` peste rezultatul deja indexat.

### 9. Out of scope (cer confirmare după)

- CLV tracking real-time (necesită feed cote live)
- Auto-fetch CSV din site externe (CORS)
- Streak analysis avansată cu istorice de pariuri marcate (depinde de Faza 2 — Profit Tracking)

---

### Tehnic — fișiere noi/modificate

```text
supabase/migrations/<ts>_cento_power_v2.sql      (NEW)
src/lib/cento/
  importer.ts · playstyle.ts · valueEngine.ts · search.ts · types.ts   (NEW)
src/components/cento/...                                                (NEW)
src/pages/CentoPower.tsx                                                (REWRITE)
src/lib/csvScanner.ts                                                   (extend aliases)
src/components/AppSidebar.tsx                                           (reorder)
```

Fără edge functions noi. Totul client-side + Supabase pentru persistență.
