# Architecture rules
- Keep Tipster Premium Live in an isolated route and dedicated model/storage modules; it must not alter the existing pre-match engine or bankroll logic.
- Compute live estimates using pure TypeScript functions and store the live tool's journal/settings under versioned localStorage keys; this permits deterministic tests without external data services.