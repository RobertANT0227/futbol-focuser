# CSV League Scanner — Cento Power

Construim o pagină nouă `/cento-power` (premium-only) care permite import CSV cu echipe/meciuri dintr-o ligă și generează automat Top Bets pe toată liga.

## 1. Pagină nouă `src/pages/CentoPower.tsx`

Acces: doar `isPremium` (owner + premium). Trial/client primesc redirect.

Structură:
- **Upload zone** — drop / select CSV. Detect tip automat: League / Team / H2H / Match.
- **Preview & Mapping** — tabel cu primele 10 rânduri + coloane recunoscute; user poate corecta maparea manual.
- **Scan button** — rulează engine pe toate meciurile/perechile.
- **Mass Scanner Dashboard** — taburi: Best Value, Highest WR, Best Low Risk, Playstyle Mismatch, High EV.
- **Filters bar** — WR, EV, Odds (min/max), Risk, Playstyle, League, Bet Type.
- **Export** — CSV / Excel / Save to Watchlist (localStorage).

## 2. CSV parsing & auto-mapping (`src/lib/csvScanner.ts`)

Folosesc `papaparse` (deja prezent? altfel îl adaug).

Detect tip CSV după coloane:
- **League CSV**: are `team` + agregate (GF, GA, MP, …)
- **Team CSV**: un singur rând per echipă cu detalii granulare
- **H2H CSV**: două coloane echipe + istoric
- **Match CSV**: home, away, odds, dată

Dicționar de aliasuri (case-insensitive, fără diacritice):

```ts
const COLUMN_ALIASES = {
  team:           ['team','echipa','club','squad','nume'],
  goals_scored:   ['gf','goals','goals for','goluri','goluri marcate','scored'],
  goals_conceded: ['ga','goals against','goluri primite','conceded'],
  xg:             ['xg','expected goals'],
  xga:            ['xga','expected goals against'],
  possession:     ['poss','possession','posesie','%poss'],
  shots:          ['sh','shots','suturi','total shots'],
  shots_on_target:['sot','shots on target','shots ot','suturi pe poarta','sh ot'],
  dangerous_att:  ['da','dangerous attacks','atacuri periculoase'],
  corners:        ['cr','corners','cornere'],
  cards:          ['cards','cart','yellow','yc'],
  fouls:          ['fouls','faulturi'],
  clean_sheets:   ['cs','clean sheets','meciuri fara gol primit'],
  btts:           ['btts','both teams to score'],
  matches_played: ['mp','games','meciuri','played'],
};
```

Funcție `autoMapColumns(headers) → { canonical: rawHeader }`.

Normalize: convert `%`, virgule decimale, "65.4%" → 0.654.

## 3. Engine integration

Pentru fiecare echipă din CSV produc un `TeamStats` (din `src/lib/types.ts`) folosind valorile detectate; câmpurile lipsă primesc default-uri rezonabile (medii lige).

Pentru a genera bets pe toată liga:
- **Mode A (League CSV)**: produc toate perechile home/away realiste din runda curentă (dacă există coloane fixture) sau toate combinațiile relevante (top × top etc.).
- **Mode B (Match CSV)**: pentru fiecare rând rulez `runAnalysis` cu cotele din CSV.

Pentru fiecare meci → rulez `runAnalysis()` existent (păstrăm 70/30 Poisson/MC + Kelly). Extrag `bestBet` și recommendations cu `value > 0`.

## 4. Mass Scanner & filtre

Result list = `ScannedBet[]` cu: matchLabel, league, selection, category (Goals/1X2/Corners), odds, WR, EV, risk, playstyle home/away, stakePct.

Filtre derivate din state:
```ts
{ wrMin, evMin, oddsMin, oddsMax, risk[], playstyle[], league[], betType[] }
```

Tab-urile sortează același array filtrat:
- Best Value → desc EV
- Highest WR → desc winRate
- Low Risk → risk='low' apoi desc WR
- Playstyle Mismatch → flag când styles sunt opuse (ex: bus-parking vs high-press)
- High EV → EV > 10%

## 5. Export

- **CSV** — generare manuală (nu nevoie de lib).
- **Excel** — `xlsx` (SheetJS).
- **Watchlist** — `localStorage` key `cento_watchlist`, vizibil în pagină separată / secțiune.

## 6. Sidebar & routing

`src/App.tsx` — adaug ruta `/cento-power` protejată cu `requirePremium`.
`src/components/AppSidebar.tsx` — item nou "Cento Power" (icon: Radar / Zap), vizibil doar premium.

## 7. Dependențe

- `papaparse` + `@types/papaparse`
- `xlsx` (SheetJS)

## Detalii tehnice

```text
src/
  pages/CentoPower.tsx          // UI principal
  lib/csvScanner.ts             // parse + auto-map + normalize
  lib/leagueAnalyzer.ts         // build TeamStats[] + run engine în masă
  components/cento/
    CsvUploader.tsx
    ColumnMapper.tsx
    ScannerFilters.tsx
    ScannerResults.tsx
    ExportMenu.tsx
```

Fără modificări de schemă DB. Fără edge functions. Totul rulează client-side.

## Out of scope (cer confirmare dacă vrei incluse)

- Persistarea scanărilor în DB (acum doar localStorage pentru watchlist).
- Auto-fetch CSV din site-uri externe (CORS — necesită edge function proxy).
- Cote live de la bookmaker (folosim doar cotele din CSV-ul Match).
