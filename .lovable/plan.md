# Cento Power — Engine2 Evolution + UI Rebuild

Scope is large. Below is the staged plan; I'll implement after approval.

## Part 1 — `src/lib/engine2/` (new, parallel to Cento)

Create mirror architecture. Cento engine stays untouched.

```
src/lib/engine2/
├── index.ts          → export analyzeMatch2, types
├── types.ts          → PickGrade, MarketKey, MarketProb, PowerAnalysis2,
│                       TeamRatings, AnalysisReasoning, ContextFlag
├── ratings.ts        → computeRatings(team, ctx, league) with home/away splits,
│                       recency weighting (last3=50%, 4-6=30%, rest=20%),
│                       consistencyRating (new vs Cento)
├── probabilities.ts  → computeLambdas (70% model + 30% FootyStats blend,
│                       league home_advantage_percentage),
│                       poissonGrid 7×7, computeMarketProbs (1X2 / O-U 2.5 /
│                       BTTS blended 40/35/25), value flag at 5% edge,
│                       draw boost on half-time tendencies
├── quality.ts        → coverage (0/0.1/0.35/0.6/0.8/1), band, hasSplits
└── pickEngine.ts     → analyzeMatch2(): ratings → quality → probs →
                        confidence (35 base + cov*25 + dispersion*80 −
                        samplePenalty*35 − conflicts*8, capped 15-92),
                        grade thresholds identical to Cento, stake units,
                        buildReasoning(), detectContextFlags()
```

Strict TS, no `any`. Graceful degradation when corners/cards/timings/odds missing.

## Part 2 — FootyStats parsers (extend, don't break)

In `src/lib/cento/footystats/parseLeague.ts`, `parseTeams.ts`, `parseMatches.ts`:
- Keep existing exports for Cento.
- Add parallel exports `parseLeagueCSV2 / parseTeamsCSV2 / parseMatchesCSV2` returning the richer engine2 shapes (home/away PPG, average_scored_home/away_team, home_advantage_percentage, prediction_risk, btts_percentage_pre_match, odds_ft_*, etc.).
- Auto-detect file type by column signature (not filename).

## Part 3 — Legacy replacement (`/` page)

Replace legacy `src/lib/engine.ts` pipeline in `src/pages/Index.tsx`:
- Swap `runAnalysis` → `analyzeMatch2()`.
- Replace `VerdictDisplay` with the new `PowerMatchCard2`.
- Reuse new `UploadCenter2` for CSV intake.
- Keep auth / trial quota / sidebar untouched.

`src/lib/engine.ts` + `statsParser.ts` + `VerdictDisplay.tsx` become unused (kept for now, not deleted, to avoid breaking imports until verified).

## Part 4 — UI rebuild

Per the brief: do NOT touch `src/pages/CentoPower.tsx` or `src/components/cento/PowerMatchCard.tsx` (Cento stays intact). New components live alongside:

```
src/components/engine2/
├── PowerMatchCard2.tsx       → new card (grade glow, rating bars,
│                                boosters/reducers, context chips,
│                                Add to Bankroll, Expand)
├── UploadCenter2.tsx         → drag&drop 3 CSV, auto-detect, progress,
│                                "La Liga 2025/26 — 38 meciuri, 20 echipe — READY"
├── MatchAnalysisDialog2.tsx  → drill-down: markets+odds+value, Poisson heatmap,
│                                radar/bar compare, reasoning, context
├── ConfidenceBar.tsx
└── ContextFlagChip.tsx
```

Design tokens added in `src/index.css` + `tailwind.config.ts`:
- HSL versions of #0a0c0f / #161a22 / #00d4ff cyan / #7c3aed violet / etc.
- Glow utilities, glass surface, mono display font (IBM Plex Mono via Google Fonts), DM Sans body.
- Grade variants on a `cva` for the badge.

Layout on `/`: header + left panel (UploadCenter2 + league summary + filters) + center grid of `PowerMatchCard2`. Mobile: stack, panel becomes Sheet.

## Part 5 — Performance

- `useMemo` per match for `analyzeMatch2`.
- Team ratings cache keyed by `teamId+context`.
- Virtualized list (`@tanstack/react-virtual`, already common) when >20 cards.

## Out of scope (explicit)

- `src/lib/cento/engine/*` — untouched.
- `src/pages/CentoPower.tsx` and `src/components/cento/PowerMatchCard.tsx` — untouched.
- Bankroll logic — unchanged, only the "Add to Bankroll" CTA wires into existing `PickStakePlan` flow.
- No new markets beyond 1X2 / BTTS / O-U 2.5.

## Verification

- Type-check via build.
- Smoke: load a 3-CSV La Liga sample, verify a `STRONG` and a `PASS` render correctly, confirm graceful degradation when odds column missing.

---

This is a multi-day-sized change (≈15 new files, ~2k LOC). Approve the plan and I'll execute it in one pass, or tell me to slice it (e.g. Part 1+2 first, then UI).
