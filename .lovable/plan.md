## Ce adăugăm (fără a schimba logica actuală)

### A. Bankroll — statistici extinse + editare/status
- Extindem `BetRecord` cu `status: 'PENDING' | 'WON' | 'LOST' | 'VOID'` (implicit `WON`/`LOST` rămân valide pentru pariurile existente; migrare în-loc).
- Adăugăm în `getStats()`:
  - Total, Won, Lost, Void, Pending
  - Win Rate (Won / (Won+Lost))
  - Profit total, Profit net, ROI, Yield, Stake total, Cotă medie, Profit mediu / bilet
- UI: în pagina `/bankroll` afișăm un card „Statistici detaliate" cu toate valorile — reactiv, se actualizează instant la orice modificare de bilet.
- În lista de pariuri: butoane **Edit** / **Delete** / **Schimbă status** (Pending → Won/Lost/Void). Recalcul instant (bankroll refăcut din secvența biletelor).
- Fără buton „Recalculate" — totul reactiv.

### B. Sincronizare backend pentru Owner Dashboard
Pariurile sunt în `localStorage` — Owner nu le poate vedea. Adăugăm sincronizare paralelă în DB (nu înlocuim localStorage-ul; scriem în ambele locuri când user-ul e autentificat).

Migrare nouă (Lovable Cloud):
- `bankroll_bets` — 1 rând / pariu, cu `user_id`, `status`, `stake`, `odds`, `profit`, `sport`, `placed_at`, `settled_at`, `bankroll_after`.
- RLS: user vede/scrie doar propriile; owner poate SELECT toate (via `has_role(auth.uid(),'owner')`).
- View `bankroll_user_stats` (per user, agregat) — owner SELECT all, user SELECT own.

### C. Pagină nouă `/owner` — Owner Dashboard
Vizibilă doar `isOwner` (ProtectedRoute `requireRole="owner"`). Link în `AppSidebar` (ownerOnly).

Layout:
1. **Statistici globale** (top): Total utilizatori, Total bilete, Won, Lost, Win Rate global, Profit global, ROI global, Stake total global.
2. **Filtre**: user (select), perioadă (date range), sport (select), status (select).
3. **Tabel per utilizator**: Username, Nume, Total, Won, Lost, Void, WR%, Profit, ROI, Stake total, Ultima activitate.
4. **Clasamente** (4 mini-carduri, sortare desc): Top Profit, Top ROI, Top Win Rate, Top nr. bilete.

Toate calculele făcute în DB (view/RPC) — instant reactive prin Supabase Realtime pe `bankroll_bets`.

### D. Sport pe pariu
Adăugăm câmp opțional `sport` (text) în formularul de adăugare pariu, salvat în DB (necesar pentru filtrul din Owner Dashboard). Nu îl impunem — default `"Fotbal"`.

## Detalii tehnice

- `src/lib/bankroll.ts`: extensie `BetRecord`, funcții `updateBet`, `deleteBet`, `setBetStatus`, `recomputeBankroll(state)`; noi câmpuri în `getStats`.
- `src/lib/bankrollSync.ts` (nou): `upsertBetToCloud`, `deleteBetFromCloud` — fire-and-forget, doar dacă `session` există.
- `src/pages/BankrollManager.tsx`: adaugă card „Statistici detaliate" + acțiuni pe pariuri; hook sync după orice mutație.
- `src/pages/OwnerDashboard.tsx` (nou): consumă `bankroll_bets` + agregate; folosește `supabase.channel` pentru realtime.
- `src/App.tsx`: rută nouă `/owner` cu `ProtectedRoute requireRole="owner"`.
- `src/components/AppSidebar.tsx`: item nou „Owner Dashboard" (ownerOnly).
- Migrare SQL: `bankroll_bets` + RLS + GRANT + `ALTER PUBLICATION supabase_realtime ADD TABLE`.

## Ce NU schimbăm

- Logica motorului V2 HARDCORE, DeepMatch, importurile, PickStakePlan, cash-out logic — intacte.
- Formulele Kelly/Confidence stake — neschimbate.
- Structura de rutare existentă și componentele UI shadcn.
