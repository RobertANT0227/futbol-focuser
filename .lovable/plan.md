# Cento Power — Rebuild total (V2)

Sterg tot ce ține de Cento Power și reconstruiesc după planul matematic. **Nu se ating**: `src/lib/bankroll.ts`, `src/pages/BankrollManager.tsx`, `src/components/PickStakePlan.tsx`.

## 1. Engine matematic (`src/lib/cento-v2/engine/`)

Pur aritmetic — zero Poisson, zero Monte Carlo.

- `types.ts` — `PickGrade`, `MarketKey` (`BTTS_YES|BTTS_NO|OVER25|UNDER25`), `MarketResult`, `SignalItem`, `TeamRatings`, `PowerAnalysis`, `QualityBand`.
- `normalize.ts` — Team normalization: lowercase, strip punct, `utd→united`, drop `fc/cf/sc`, fuzzy fallback (Levenshtein ≥90%).
- `smoothing.ts` — `smooth(teamVal, sample, leagueAvg, k=5)` pentru sample <8.
- `btts.ts` — `P_Hscores = 1 − H_fts/100`; `P_Ascores = 1 − A_fts/100`; `P_indep = P_H × P_A`; blend 0.30/0.30/0.20/0.20 (cu redistribuire dacă `M_btts` lipsește → 0.40/0.40/0.20).
- `over25.ts` — Blend 0.30/0.30/0.25/0.15 (redistribuie 0.35/0.35/0.30 fără `M_o25`); cross BTTS: <0.40 ×0.92, >0.65 ×1.05; clamp [0.05, 0.95]; cap dur **0.82 BTTS / 0.85 O25**.
- `confidence.ts` — `spread = max−min` pe semnale; `smallSamplePenalty` (20/10/5/0 pentru n<4/<7/<10/≥10); `conf_BTTS = 75 − spread×60 − pen`; `conf_O25 = 75 − spread×55 − pen`; −5 per CSV lipsă (max −15); ×0.90 dacă `prediction_risk>70`; conflict BTTS_YES↑ & UNDER25↑ → −5 ambele; clamp [15, 92].
- `grading.ts` — Tabelele STRONG/MEDIUM/RISKY/PASS din plan. PASS preferat dacă spread mare / sample fragil / conflict.
- `ratings.ts` — `attack/defense` raportate la `league.avg_scored_home/away`; `form = ppg×33.33`; `tempo` din corners (fallback `form×0.8`); `volatility = prediction_risk`. Toate clamp 0–100.
- `quality.ts` — Excellent (n≥10 ambele + 3 CSV-uri), Good (n≥5), Limited.
- `pickEngine.ts` — `analyzeMatch()`: ordine **data validity → sample → signal agreement → prob → conf → grade → final pick**. Final pick = max(conf×prob), tie-break spread mic, apoi sample mare.

## 2. Date & import (`src/lib/cento-v2/data/`)

- `csvDetect.ts` — auto-detect league/matches/teams după coloane (nu nume fișier).
- `parseLeague.ts`, `parseMatches.ts`, `parseTeams.ts` — extrag exact câmpurile cerute: `btts_percentage` (home/away split), `fts_percentage`, `over25_percentage`, `matches_played`, `btts_percentage_pre_match`, `over_25_percentage_pre_match`, `over_25_percentage`, `average_goals_per_match`, `goals_scored/conceded_per_match`, `ppg`, `corners_per_match`, `prediction_risk`, `suspended_matches`.
- `dataset.ts` — `LeagueDataset` merge unic + `CentoDataContext` (React context, parse o singură dată).

## 3. UI (`src/components/cento-v2/` + `src/pages/cento-v2/`)

Design tokens noi în `index.css` (extind paleta — bg `#0A0A0F`, card `#111118`, brand `#6C63FF`, glow, glass).

Componente:
- `CentoLayout.tsx` + `CentoSidebar.tsx` — sidebar dark cu 5 itemi (Dashboard, Fixtures, Analiză, Database, Bankroll).
- `UploadCenter.tsx` — drop zone, progress, auto-detect, confirm vizual.
- `PowerMatchCard.tsx` — header, `QualityChip`, top pick (market + prob% + conf% + grade badge cu glow), stake suggestion, expand markets, buton **„Adaugă în Bankroll"** (link `/bankroll?pick=…&sel=…&prob=…&odds=…` — refoloseste `PickStakePlan`).
- `PickBadge.tsx`, `QualityChip.tsx`, `RatingBar.tsx`, `MarketRow.tsx`, `MatchExplanationPanel.tsx` (semnale + boosters/reducers/risk, doar text determinist din semnale CSV).

Pagini:
- `CentoDashboard.tsx` — stats ligă + grid carduri + filtru grade + sort conf desc.
- `CentoFixtures.tsx` — doar `incomplete` & date ≥ azi.
- `CentoAnalysis.tsx` — dropdown meci + card complet + explanation panel.
- `CentoDatabase.tsx` — tabel echipe sortabil + search.

## 4. Routing

`src/App.tsx`: înlocuiesc `/cento-power` cu `CentoLayout` + sub-rute `''`, `fixtures`, `analysis`, `database`. Vechiul `AppSidebar` rămâne pentru restul aplicației (rută în afara `/cento-power`).

## 5. Curățenie

Șterg: `src/pages/CentoPower.tsx`, `src/components/cento/*`, `src/lib/cento/engine/*`, `src/lib/cento/footystats/*` (le înlocuiesc cu cento-v2).

## Notă tehnică

- Fiecare fișier nou începe cu `// CENTO-V2`.
- TS strict, zero `any`.
- `useMemo` pe ratings + probabilities; parse CSV o singură dată în context.
- UI: 1 zecimală; intern: 4 zecimale.
- Toate explicațiile mapate 1:1 pe `SignalItem` (label + valoare + greutate + sursă).

Confirmi să încep implementarea?
