# Cento Power — Modul Premium de Analiză Tipster

Reconstruim secțiunea „Cento Power” ca modul premium complet, distinct de calculatorul de value betting existent. Folosim infrastructura DB existentă (`cp_leagues`, `cp_matches`, `cp_teams`, `cp_imports`) și adăugăm un nou parser FootyStats + motor de analiză tipster + UI premium.

## 1. Restaurare rută & navigație

- Adaug înapoi `/cento-power` în `src/App.tsx` (premium-only).
- Adaug item „Cento Power” în `AppSidebar` cu icon `Zap` (premium-only).
- Pagina e complet rescrisă (nu refolosim vechiul `CentoPower.tsx`).

## 2. Smart CSV Parser FootyStats (`src/lib/cento/footystats/`)

- `detect.ts` — detectează tipul fișierului (`league` / `matches` / `teams`) din numele fișierului + headerele coloanelor. Detectează liga (ex: `spain-la-liga` → „Spain La Liga”) și sezonul (`2025-to-2026` → `2025/2026`). Fallback pe analiza coloanelor dacă numele e ambiguu.
- `parseLeague.ts` — extrage statistici generale ligă: medii goluri, over/under %, BTTS %, tempo, avantaj gazde, clean sheets, scoring intervals, prediction risk. Coloanele lipsă = `null` (nu eroare).
- `parseMatches.ts` — extrage meciuri: data, echipe, scor, odds 1X2, pre-match averages, BTTS, over/under, HT, atac/şuturi, attendance dacă există.
- `parseTeams.ts` — extrage profil echipă: formă, puncte, WR, GS/GC, clean sheets %, BTTS %, FTS %, HT performance, split home/away, scoring/conceding timings, over/under %, attacking/defensive efficiency.
- Toate funcțiile întorc obiecte cu câmpuri opționale; folosim `safeNum` pentru parse robust.

## 3. Multi-upload UI (`src/components/cento/UploadCenter.tsx`)

- Drag & drop cu `react-dropzone` (deja în deps; dacă nu, fallback HTML5 drop).
- Acceptă 1-3 CSV-uri simultan, le grupează automat după liga + sezon detectate.
- Progress bar per fișier, status „Excellent / Good / Limited” pe baza completitudinii.
- La final: toast „League Successfully Synced” + push în DB:
  - `cp_leagues` (upsert pe `owner_id + normalized_name + season`)
  - `cp_matches` (insert batch)
  - `cp_teams` (upsert pe `league_id + name`)
  - `cp_imports` (audit)
- NU șterge ligi existente; fiecare ligă/sezon = înregistrare separată.
- Zero text tehnic („Unknown”, „columns detected”) în UI.

## 4. Multi-League Database Browser (`src/components/cento/LeagueBrowser.tsx`)

- Sidebar cu toate ligile salvate (grupate pe țară), cu badge sezon.
- Click pe ligă → fixtures viitoare (sortare cronologică, după `today`).
- Indicator de calitate date per ligă: Excellent / Good / Limited.

## 5. Cento Power Analysis Engine (`src/lib/cento/engine/`)

Motor nou, dedicat tipster premium (separat de `runAnalysis` actual).

- `ratings.ts` — calculează: Attack Rating, Defense Rating, Form Rating, Momentum, Match Tempo, Home Advantage, Defensive Stability, Offensive Consistency, Match Volatility (toate 0-100).
- `probabilities.ts` — Poisson + adjust pentru formă/momentum/home advantage → 1X2, BTTS Yes/No, Over/Under 2.5. Fără markets de cornere/cartonașe/handicap.
- `confidence.ts` — Confidence Score 0-100 din: data quality, dispersie probabilități, consistență formă, sample size.
- `pickEngine.ts` — selectează cea mai puternică piață per meci:
  - Strong Pick (conf ≥75 și prob ≥60%)
  - Medium Pick (conf 60-75)
  - Risky Pick (conf 45-60)
  - PASS (sub 45) — nu forțăm predicții slabe.
- `stake.ts` — sugestie 0.5U / 1U / 2U / 3U MAX pe baza confidence + bankroll curent (din `localStorage` bankroll existent).
- `missingData.ts` — redistribuie weights când lipsesc cornere / cards / timings; nu blochează analiza.

## 6. Match Analysis Panel (`src/components/cento/PowerMatchCard.tsx`)

Pentru fiecare meci afișează (premium dashboard):

- Header: echipe, dată, ligă, badge calitate date.
- Grid Ratings (Attack/Defense/Form/Momentum/Tempo/Stability/Volatility) — bare progres + culori semantice.
- Probabilități: 1X2, BTTS Y/N, Over/Under 2.5 — DOAR aceste 5 piețe.
- Form comparison home vs away (ultimele 5).
- Profil ofensiv & defensiv (mini cards).
- Final Pick badge (Strong/Medium/Risky/PASS) + stake recomandat (units).
- Confidence score circular.
- Narrativ scurt generat din rating-uri (1-2 fraze, fără text tehnic).

## 7. Pagina principală (`src/pages/CentoPower.tsx` — rewrite)

Layout premium dark, glassmorphism:

- Top bar: bankroll curent + buton „Import CSVs”.
- Tab 1: **Fixtures** — toate meciurile viitoare din ligile încărcate (cronologic), filtrare per ligă.
- Tab 2: **Leagues** — browser ligi + statistici ligă + listă echipe.
- Tab 3: **Today's Top Picks** — top picks cu confidence ≥75 din toate ligile, ordonate.
- Drawer pentru upload (UploadCenter).

## 8. Design tokens

- Folosim tokenii existenți din `index.css`. Adăugăm dacă lipsesc:
  - `--cento-glass`, `--cento-glow`, `--rating-strong`, `--rating-medium`, `--rating-risky`, `--rating-pass`.
- Fonturi & spacing existente; tipografie premium fără text tehnic vizibil.

## Detalii tehnice (rezumat dev)

```text
src/
  lib/cento/
    footystats/
      detect.ts
      parseLeague.ts
      parseMatches.ts
      parseTeams.ts
      index.ts
    engine/
      ratings.ts
      probabilities.ts
      confidence.ts
      pickEngine.ts
      stake.ts
      missingData.ts
      index.ts
    persistence.ts        # upsert ligi/echipe/meciuri în Supabase
  components/cento/
    UploadCenter.tsx
    LeagueBrowser.tsx
    PowerMatchCard.tsx
    RatingBar.tsx
    PickBadge.tsx
    QualityChip.tsx
  pages/CentoPower.tsx    # rewrite
```

Schema DB e suficientă (toate tabelele `cp_*` există deja cu RLS pe owner). Nu sunt necesare migrații.

Piețele analizate: STRICT 1X2, BTTS, Over/Under 2.5. Restul ignorate.

## Out of scope (acum)

- Live odds din API extern.
- Auto-refresh fixtures zilnic prin cron edge function (lăsăm refresh manual; pot adăuga ulterior dacă vrei).
- Asian handicap, corners, cards, player props.  
  
1. IMPORTANT — NU FOLOSI TOATE MECIURILE DIN SEZON LA FORMĂ
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
    
  CE MAI TREBUIE ADĂUGAT (IMPORTANT)
  ## 1. Fixture Deduplication (CRITIC)
  Asta îți va salva baza de date.
  Uneori FootyStats:
  - schimbă naming
  - schimbă timezone
  - dublează fixture-uri postponed
  Adaugă:
  ```

  ```
  ```
  Implement fixture deduplication protection.

  A match must be considered identical if:
  - same normalized home team
  - same normalized away team
  - same competition
  - kickoff time difference < 24h

  Prevent duplicate fixture creation.
  ```
  ---
  # 2. Odds Reliability Filter
  Foarte important.
  Uneori CSV-urile au:
  -   
  odds lipsă  

  -   
  odds 0  

  -   
  odds greșite  

  Adaugă:
  ```

  ```
  ```
  Ignore invalid odds:
  - null
  - 0
  - negative values
  - unrealistic values

  If odds are invalid:
  - run pure model analysis
  - reduce confidence slightly
  ```
  ---
  # 3. Season Transition Protection
  Foarte important pentru început de sezon.
  Ex:
  -   
  etapa 1  

  -   
  etapa 2  

  Modelul NU trebuie să creadă că:  
    
  „echipa are 100% WR”.
  Adaugă:
  ```

  ```
  ```
  At early season stages:
  - rely more on league averages
  - reduce extreme team ratings
  - shrink probabilities toward league mean

  The engine must gradually increase team-specific influence as sample size grows.
  ```
  ---
  # 4. Recency Bias Protection
  Ai pus decay — foarte bine.
  DAR trebuie și protecție inversă.
  Ex:
  -   
  o echipă pierde ultimele 2  

  -   
  dar sezonul e foarte solid  

  Adaugă:
  ```

  ```
  ```
  Avoid excessive recency bias.

  Recent matches are important, but the engine must preserve medium-term team strength signals.
  ```
  ---
  # 5. Home/Away Split Reliability
  Foarte important.
  Uneori:
  -   
  echipa are doar 3 deplasări  

  NU trebuie supraevaluate spliturile.
  Adaugă:
  ```

  ```
  ```
  Home/Away splits must scale dynamically with sample reliability.

  Small split samples should have reduced influence.
  ```
  ---
  # 6. Match State Volatility
  Foarte important pentru BTTS / Over.
  Adaugă:
  ```

  ```
  ```
  High-volatility teams should reduce confidence on low-variance markets.

  Example:
  - chaotic teams
  - inconsistent scoring patterns
  - unstable defensive variance

  should increase uncertainty.
  ```
  ---
  # 7. Market Conflict Detection (EXTREM DE IMPORTANT)
  Asta e premium-level logic.
  Ex:
  -   
  Home Win 64%  

  -   
  BTTS Yes 68%  

  -   
  Over 2.5 69%  

  Perfect.
  Dar dacă:
  -   
  Home Win 66%  

  -   
  Under 2.5 71%  

  -   
  BTTS Yes 70%  

  → model conflict.
  Adaugă:
  ```

  ```
  ```
  Detect logical conflicts between markets.

  If multiple market outputs are statistically inconsistent:
  - reduce confidence
  - increase volatility score
  - prefer PASS when conflicts are severe.
  ```
  ---
  # 8. Confidence Ceiling
  FOARTE IMPORTANT.
  Nu vrei:  
    
  „98% confidence”.
  Adaugă:
  ```

  ```
  ```
  Confidence must be capped realistically.

  Even elite picks should rarely exceed:
  - 88–92 confidence

  Avoid unrealistic certainty.
  ```
  ---
  # 9. Team Strength Anchoring
  Foarte important.
  Ex:
  -   
  Real Madrid pierde 2 meciuri  

  -   
  nu devine instant slabă  

  Adaugă:
  ```

  ```
  ```
  Long-term team strength should not collapse from short negative streaks.

  Use anchored normalization to preserve structural team quality.
  ```
  ---
  # 10. Explainability Upgrade (IMPORTANT)
  Acum ai:  
    
  „explain why”.
  Dar trebuie să fie clar:
  ```

  ```
  ```
  Explainability must include:
  - strongest supporting metrics
  - strongest risk factors
  - confidence drivers
  - volatility warnings
  - why alternative markets were rejected
  ```
  Asta transformă aplicația în:  
    
  „human analyst feeling”.
  ---
  # 11. IMPORT FOARTE IMPORTANT — PARTIAL CSV SUPPORT
  Asta e critic.
  Unele ligi:
  -   
  nu au teams complet  

  -   
  nu au timings  

  -   
  nu au cards  

  Trebuie să specifici clar:
  ```

  ```
  ```
  The system must gracefully support incomplete FootyStats datasets.

  Analysis quality should degrade progressively, not fail.

  Missing metrics must:
  - reduce confidence
  - reduce coverage
  - redistribute weights dynamically

  Never block analysis because of missing optional columns.
  ```
  ---
  # 12. CACHE SYSTEM (IMPORTANT)
  Foarte important pentru performanță.
  Adaugă:
  ```

  ```
  ```
  Cache:
  - derived team ratings
  - probabilities
  - league averages
  - normalized metrics

  Recompute only when source league data changes.
  ```
  ---
  # 13. MOST IMPORTANT — NO FAKE AI NARRATIVE
  Asta e CRITIC.
  Adaugă:
  ```

  ```
  ```
  Do not invent tactical narratives, psychology, injuries, or motivations.

  Only derive conclusions from available structured data.

  No fake AI storytelling.
  ```
  Asta îl ține profesional.