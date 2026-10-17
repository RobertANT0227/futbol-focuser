# Roadmap

- [ ] Partea 1: rescriere motor (MODEL_PARAMS, medii ligă, stil auto din posesie, xG nou, Poisson+Dixon-Coles, cornere binomial negativ) — engine.ts, types.ts, MatchInputForm.tsx, csvScanner.ts
- [ ] Repară build-ul (csvScanner: leagueAvgHomeGoals/AwayGoals lipsă)
- [ ] Partea 2: removeMargin, amestec model+piață, decizie/mize noi, elimină winRate, analysisSteps, teste vitest engine.test.ts
- [ ] Partea 3: tabel predictions + model_weights (migrare), salvare automată predicții, pagina /istoric cu metrici (Brier, log loss, ROI, CLV, calibrare), fitWeights.ts (regresie Poisson ridge), ponderi învățate în engine, teste
