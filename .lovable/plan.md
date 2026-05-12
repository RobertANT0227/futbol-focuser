## Cento Power — Modul Premium Analiză Tipster

Reconstruim de la zero modulul `/cento-power` (premium-only) ca terminal profesional de analiză tipster, folosind cele 3 CSV-uri FootyStats per ligă (league + matches + teams) combinate într-un singur sezon.

---

### 1. Bază de date (refolosim tabelele existente `cp_*`)

Tabelele `cp_leagues`, `cp_teams`, `cp_matches`, `cp_imports` există deja și au RLS premium. Le folosim ca atare:

- `cp_leagues` — o linie per (owner, ligă normalizată, sezon). Coloanele `has_league_stats / has_teams / has_matches` + `league_stats jsonb` reflectă acoperirea celor 3 fișiere. Trigger-ul `refresh_cp_league_rollup` rămâne.
- `cp_teams` — `stats jsonb` cu TOATE câmpurile FootyStats (form, GF/GA, BTTS%, FTS%, HT, splits, timings, corners, cards, eficiențe).
- `cp_matches` — un row per fixture cu `match_date`, `home`, `away`, `odds jsonb`, `stats jsonb` (HT, attendance, pre-match averages, BTTS, O/U, etc.).
- `cp_imports` — log audit per fișier (file_type, rows, duplicates).

**Upsert key**: leagues = (owner_id, normalized_name, season); teams = (league_id, name); matches = (league_id, season, match_date, home, away). Niciodată nu suprascriem alte ligi/sezoane.

Nicio migrație nouă necesară decât dacă lipsesc indexuri unice — dacă da, adăugăm un singur migration cu `CREATE UNIQUE INDEX IF NOT EXISTS`.

### 2. Upload System — Multi-file group sync

`src/components/cento/ImportDropzone.tsx`:

- Drag & drop simultan 3 fișiere.
- Auto-detect din nume fișier: țară + ligă + sezon (`spain-la-liga-...-2025-to-2026-stats.csv` → "Spain La Liga", "2025/2026") + tip (`-league-`, `-matches-`, `-teams-`).
- Fallback: detect tip prin coloane (heuristici interne, fără afișare).
- Normalizează `2025-to-2026` → `2025/2026`.
- Grupează fișierele în „ligă pending”, le parsează în paralel cu `papaparse`, face upsert în Supabase pe cheile unique.
- UI: progress per fișier + un singur toast final: „La Liga 2025/2026 — successfully synced (20 teams · 380 matches)”.
- Zero loguri tehnice, zero „Unknown / Columns detected”.

### 3. CSV Smart Parser (`src/lib/cento/parser.ts`)

Trei parsere dedicate (extind aliasurile din `csvScanner.ts`):

- **leagueParser** — agregate de ligă: avg goals, O/U%, BTTS%, tempo, home advantage, clean sheets, scoring intervals, cards, corners → salvate în `cp_leagues.league_stats`.
- **teamsParser** — per echipă: form, points, WR, GF/GA, CS, BTTS%, FTS%, HT perf, home/away splits, scoring/conceding timings, corners, cards, O/U%, FTS%, attacking/defensive efficiency → `cp_teams.stats`.
- **matchesParser** — per fixture: date, teams, result, odds 1X2 + O/U + BTTS, HT stats, attendance, stadium, timings, pre-match averages → `cp_matches`.

Toate câmpurile lipsă rămân `null` (nu se aruncă erori).

### 4. Missing Data System

În motorul de analiză (vezi §5), fiecare metric are pondere implicită. Dacă un metric e `null` (ex: cornere/cartonașe în ligi inferioare):

- nu blochează nimic;
- ponderea e redistribuită proporțional pe metricii disponibili;
- coverage scade (vezi §8).

### 5. Analysis Engine (`src/lib/cento/engine.ts`)

Pentru fiecare match (acasă vs deplasare în aceeași ligă/sezon):

**Rating-uri (0–100, normalizate pe ligă)**:

- Attack Rating, Defense Rating (din GF/GA + xG dacă există + eficiență)
- Form Rating (ultimele 5–6 cu decay exponențial)
- Momentum Rating (trend ultimele 3 vs precedente 3)
- Match Tempo (din shots+DA+goals/match medii ale celor 2)
- Home Advantage Score (split home GF/GA vs media ligii)
- Defensive Stability (varianță GA + CS%)
- Offensive Consistency (varianță GF + FTS%)
- BTTS Strength (BTTS% home + BTTS% away + ajustat de DEF stability)
- Goal Probability (Poisson combinat din λ_home/λ_away)
- Match Volatility (varianță combinată — input pentru risk)
- Confidence Score (acoperire date × stabilitate × edge vs medie ligă)

**Piețe analizate STRICT**:

- 1X2 (Home / Draw / Away) — Poisson 0–6 grid + ajustare home advantage și form
- BTTS (Yes / No) — derivat din λ_home, λ_away (1 − e^-λh)(1 − e^-λa)
- Goals (Over 2.5 / Under 2.5) — Poisson cumulativ

NU includem: AH, corners, cards, props.

### 6. Final Pick Engine

Per meci alegem CEA MAI PUTERNICĂ piață:

- compute prob model vs prob implied (din odds dacă există, altfel doar pe model)
- clasificăm:
  - `STRONG PICK` — confidence ≥ 75 & edge ≥ 8%
  - `MEDIUM PICK` — confidence ≥ 60 & edge ≥ 4%
  - `RISKY PICK` — confidence ≥ 50
  - `PASS` — altfel
- afișăm UN SINGUR pick principal + 2 alternative slabe ascunse într-un accordion

Nu forțăm predicții — `PASS` e răspuns valid.

### 7. UI — Cento Power Terminal

`src/pages/CentoPower.tsx` (rewrite) cu shell premium dark + 4 taburi:

```text
┌─ CENTO POWER ─────────────────────────────────┐
│ [Imports] [Database] [Fixtures] [Analysis]    │
└────────────────────────────────────────────────┘
```

- **Imports** — `ImportDropzone` + listă batch-uri recente din `cp_imports`.
- **Database** — listă carduri ligi salvate (țară · sezon · teams · matches · coverage badge). Click → drill into ligă → tab fixtures + teams.
- **Fixtures** — listă cronologică meciuri viitoare (`match_date >= today`), grupate pe zi, sortate. Auto-refresh la mount + revalidate React Query la 5min. Click meci → panou analiză.
- **Analysis** — panoul detaliat cu: header echipe, ratinguri vizuale (radial bars), comparație home/away, recent form chips, ofensiv/defensiv profile, expected goals, ritm, BTTS strength, **Final Pick card mare** (Strong/Medium/Risky/PASS) + stake suggestion din bankroll, alternative collapsed.

Componente noi:

```text
src/components/cento/
  ImportDropzone.tsx
  LeagueCard.tsx
  FixturesList.tsx
  MatchAnalysisPanel.tsx
  RatingBar.tsx · StatCompare.tsx · FinalPickCard.tsx
  CoverageBadge.tsx · ConfidenceMeter.tsx
```

### 8. Data Quality System

Per ligă calculăm coverage = % câmpuri non-null × prezența celor 3 fișiere:

- `Excellent` ≥ 85%
- `Good` 60–85%
- `Limited` < 60%

Afișat ca badge colorat. Fără numere brute, fără debug.

### 9. Bankroll Integration

Citim bankroll-ul curent din `useBankroll` (sursă existentă). Stake suggestion mapat din confidence:

- STRONG → 2U–3U (3U doar dacă confidence ≥ 88 & coverage Excellent)
- MEDIUM → 1U
- RISKY → 0.5U
- PASS → —

Sub Final Pick afișăm: „Suggested stake: 2U (≈ X LEI) of bankroll Y LEI”.

### 10. Sidebar & Access

`AppSidebar.tsx` — re-adăugăm itemul „Cento Power” (icon `Zap`, `premiumOnly: true`). Rută `/cento-power` în `App.tsx` cu `<ProtectedRoute requirePremium>`.

### 11. Design

- Dark UI cu tokens semantici existenți + adăugăm în `index.css`:
  - `--cento-bg`, `--cento-card`, `--cento-glass`, `--pick-strong`, `--pick-medium`, `--pick-risky`, `--pick-pass`, `--rating-good`, `--rating-bad`.
- Glassmorphism subtil (`backdrop-blur` pe cards).
- Tipografie: display existent + mono pentru numere/ratinguri.
- Zero text tehnic, zero loguri.

---

### Out of scope (cer confirmare după dacă vrei)

- Live odds feed în timp real.
- CLV tracking post-meci.
- Auto-update rezultate meciuri (ar necesita un API extern).
- Edge functions noi (totul rulează client-side + Supabase).

### Fișiere

```text
src/pages/CentoPower.tsx                                          REWRITE
src/lib/cento/{parser.ts, engine.ts, types.ts, normalize.ts,
              quality.ts, bankrollSuggest.ts}                     NEW
src/components/cento/*                                            NEW (vezi §7)
src/components/AppSidebar.tsx                                     edit (re-add link)
src/App.tsx                                                       edit (route)
src/index.css                                                     extend tokens
supabase/migrations/<ts>_cento_unique_indexes.sql                 doar dacă lipsesc
```

# 1. IMPORTANT — NU FOLOSI TOATE MECIURILE DIN SEZON LA FORMĂ

Acum ai:

> Form Rating = ultimele 5–6 meciuri

Foarte bine.

Dar trebuie să specifici:

- să NU folosească forma generală dacă există sample recent suficient
- să dea prioritate ultimelor meciuri
- decay exponențial mai agresiv pe ultimele 3

Adaugă:

```

```

```
Recent matches must have exponentially higher importance than old matches.

Example:
- last 3 matches = highest weight
- matches 4–6 = medium weight
- older season data = low contextual weight

The engine must avoid overrating teams because of early-season performance.
```

---

# 2. FOARTE IMPORTANT — SMALL SAMPLE PROTECTION

Asta îți lipsește și e CRITIC.

Dacă o echipă are:

-   
doar 2 meciuri home  

-   
sau 3 meciuri away  


NU trebuie să tragă concluzii puternice.

Adaugă:

```

```

```
If sample size is too small:
- reduce confidence automatically
- reduce home/away split importance
- reduce trend confidence
- avoid extreme probabilities

The engine must protect against early-season variance.
```

---

# 3. MATCH IMPORTANCE CONTEXT

Asta îți lipsește complet și contează enorm pentru analiză premium.

Exemple:

-   
final de sezon  

-   
echipe fără miză  

-   
titlu  

-   
retrogradare  

-   
diferență mare clasament  


CSV-urile permit deducții indirecte.

Adaugă:

```

```

```
The engine should derive contextual motivation signals from:
- league position
- points per game
- season progression
- goal difference
- title/relegation proximity

Without inventing narratives.

These signals should slightly influence confidence and risk.
```

---

# 4. DRAW MODEL IMPROVEMENT (FOARTE IMPORTANT)

Majoritatea modelelor Poisson sunt slabe pe egaluri.

Adaugă:

```

```

```
Draw probability must be adjusted using:
- low tempo matches
- low attacking efficiency
- strong defensive stability
- low expected goals
- historical draw tendency

Do not rely purely on raw Poisson draw probability.
```

---

# 5. ANTI-OVERFITTING SYSTEM

Foarte important.

Acum modelul poate deveni prea agresiv.

Adaugă:

```

```

```
The engine must avoid overfitting on:
- single high scoring matches
- outlier results
- red-card influenced games
- extreme variance

Use smoothing and normalization across league averages.
```

---

# 6. LEAGUE TEMPO NORMALIZATION

Asta e IMPORTANTĂ rău.

Over 2.5 în Olanda ≠ Over 2.5 în Italia.

Tu deja ai league stats.

Adaugă:

```

```

```
All attacking and goal metrics must be normalized relative to league averages.

Example:
- a 65% over 2.5 team in a low-scoring league is stronger than a 65% over team in a high-scoring league.
```

---

# 7. ODDS MOVEMENT PLACEHOLDER (SMART)

Chiar dacă nu ai live odds acum, pregătește arhitectura.

Adaugă:

```

```

```
Prepare engine architecture for future odds movement integration.
Store opening and latest odds if available later.
```

---

# 8. CONFIDENCE ≠ PROBABILITY

FOARTE IMPORTANT.

Mulți confundă astea.

Trebuie specificat clar.

Adaugă:

```

```

```
Confidence Score is NOT the same as win probability.

Confidence should reflect:
- data quality
- model agreement
- variance stability
- consistency
- sample reliability

A high probability pick may still have low confidence.
```

---

# 9. SMART PASS SYSTEM

Asta e vital pentru aplicație premium.

Adaugă:

```

```

```
PASS must be treated as a high-quality professional output.

The engine should prefer PASS when:
- variance is too high
- confidence is unstable
- data coverage is low
- probabilities are too close
- match volatility is extreme
```

---

# 10. FOARTE IMPORTANT — TEAM NAME NORMALIZATION

O să te lovești GARANTAT de asta.

Ex:

-   
Man Utd  

-   
Manchester United  

-   
Manchester Utd  


Adaugă:

```

```

```
Implement robust team name normalization and fuzzy matching.

Examples:
- Man United
- Manchester United
- Manchester Utd

must resolve to the same internal team entity.
```

---

# 11. DATE VIITOARE — CRITIC

Ai zis că:

> vrei meciurile de azi → viitor

Trebuie specificat clar:

```

```

```
Fixtures page must ONLY show:
- today matches
- future scheduled matches

Past matches are used for analysis only.
```

---

# 12. PERFORMANCE OPTIMIZATION

380 meciuri × multe ligi = lag.

Adaugă:

```

```

```
Use memoization and cached derived metrics.

Do not recompute all ratings on every render.
```

---

# 13. CEL MAI IMPORTANT LUCRU — EXPLAINABLE ANALYSIS

Asta transformă aplicația din „tool” în „premium terminal”.

Adaugă:

```

```

```
Every final pick must include explainable reasoning.

The engine should describe:
- WHY the pick was selected
- which metrics contributed most
- what increased confidence
- what reduced confidence

Avoid generic AI text.
```