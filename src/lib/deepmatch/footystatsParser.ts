// Footystats team-page parser — tolerant extractor for General / Acasă / Deplasare dumps.
// Source format: text copied from FootyStats team pages (Statistici Generale / Acasă / Deplasare).

import type { FormToken, ParsedTeamStats } from './parser';

export interface FootystatsExtract {
  // Form (interpreted differently per tab: general → formLast5, acasă/deplasare → formHomeAway)
  form5?: FormToken[];
  // Final stats per row (only the row matching the active tab is reliable for splits)
  goalsScoredSint?: number;
  goalsConcededSint?: number;
  goalsScoredHome?: number;
  goalsConcededHome?: number;
  goalsScoredAway?: number;
  goalsConcededAway?: number;
  // From MJ table
  matchesPlayedSint?: number;
  matchesPlayedHome?: number;
  matchesPlayedAway?: number;
  ppmSint?: number;
  // xG (For) — secțiunea simplă "xG", NU "xG (Împotriva)"
  xgForSint?: number;
  xgForHome?: number;
  xgForAway?: number;
  // xG Împotriva (xGA) — păstrat intern
  xgAgainstSint?: number;
  xgAgainstHome?: number;
  xgAgainstAway?: number;
  // Alte statistici (block at end of every dump)
  possession?: number;
  shotsPerMatch?: number;
  shotsOnTargetPerMatch?: number;
  foulsPerMatch?: number;
  // Cornere — "Pentru" value (cornere obținute de echipă)
  cornersForPerMatch?: number;
  // Cartonașe / Meci
  cardsPerMatch?: number;
  // Salvări portar / Intervenții portar (per meci)
  gkSavesPerMatch?: number;
  // League standings (extracted using team name)
  leaguePosition?: number;
  totalTeamsInLeague?: number;
  log: string[];
}

const FORM_MAP: Record<string, FormToken> = {
  V: 'W', W: 'W',
  E: 'D', D: 'D', N: 'D',
  'Î': 'L', I: 'L', L: 'L',
};

const NUM = /-?\d+(?:[.,]\d+)?/;

function num(s: string | undefined): number | undefined {
  if (!s) return undefined;
  const m = s.match(NUM);
  if (!m) return undefined;
  const n = parseFloat(m[0].replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
}

function escapeReg(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractForm5(block: string): FormToken[] | undefined {
  // Pick first 5 single-letter tokens from V/E/Î/W/D/L/N
  const tokens = block.match(/(?:^|[^A-Za-zÎî])([VEÎIWDLN])(?=[^A-Za-zÎî]|$)/g);
  if (!tokens) return undefined;
  const cleaned = tokens.map(t => t.replace(/[^VEÎIWDLN]/g, '')).filter(Boolean);
  if (cleaned.length < 3) return undefined;
  return cleaned.slice(0, 5).map(t => FORM_MAP[t] ?? 'D');
}

/**
 * Parse a FootyStats team-page dump. `teamName` is used to locate the team's row in standings.
 */
export function parseFootystatsRaw(text: string, teamName?: string): FootystatsExtract {
  const out: FootystatsExtract = { log: [] };
  const log = (m: string) => out.log.push(m);
  if (!text.trim()) return out;

  const lines = text.split(/\r?\n/).map(l => l.trim());
  const joined = lines.join('\n');

  // --- FORM ---
  const formIdx = lines.findIndex(l => /Rezultate\s+Finale/i.test(l));
  if (formIdx >= 0) {
    const block = lines.slice(formIdx + 1, formIdx + 25).join('\n');
    const f = extractForm5(block);
    if (f) { out.form5 = f; log(`✅ Formă: ${f.join('/')}`); }
  }

  // --- FINAL STATS (GM / GP / Medie) ---
  // Pattern: "Sinteză 1.67 ... 0.85 ... 2.51", "Acasă 2.00 ... 0.65 ... 2.65", etc.
  // We scan the "Final (Final) Statistici" zone; otherwise scan the whole text.
  const finalIdx = joined.search(/Final\s*\(\s*Final\s*\)\s*Statistici/i);
  const scope = finalIdx >= 0 ? joined.slice(finalIdx, finalIdx + 1200) : joined;

  // Real-world format glues values together, e.g.:
  //   "GMGPMedieSinteză1.38\n/meci1.00\n/meci2.38\n/meciAcasă1.500.752.25Deplasare1.251.252.50"
  // Strategy: locate each label, then pull the next 3 decimal numbers ( \d+\.\d{1,2} ) within ~80 chars.
  const labels: Array<{ key: 'sint' | 'home' | 'away'; rx: RegExp }> = [
    { key: 'sint', rx: /Sintez[ăa]/i },
    { key: 'home', rx: /Acas[ăa]/i },
    { key: 'away', rx: /Deplasare/i },
  ];
  for (const { key, rx } of labels) {
    // caută toate aparițiile etichetei; ia prima care are 2+ zecimale după ea
    const gx = new RegExp(rx.source, 'gi');
    let gm: number | undefined;
    let gp: number | undefined;
    let lm: RegExpExecArray | null;
    while ((lm = gx.exec(scope)) !== null) {
      const start = lm.index + lm[0].length;
      const win = scope.slice(start, start + 90);
      // acceptă și virgulă ca separator zecimal (1,38 / 1.38), inclusiv lipite
      const decs = win.match(/\d+[.,]\d{1,2}/g) ?? [];
      if (decs.length < 2) continue;
      const a = parseFloat(decs[0].replace(',', '.'));
      const b = parseFloat(decs[1].replace(',', '.'));
      if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
      if (a > 8 || b > 8) continue; // nu sunt medii de goluri
      gm = a; gp = b;
      break;
    }
    if (gm === undefined || gp === undefined) continue;
    if (key === 'sint') {
      out.goalsScoredSint = gm; out.goalsConcededSint = gp;
      log(`✅ GM/GP Sinteză: ${gm}/${gp}`);
    } else if (key === 'home') {
      out.goalsScoredHome = gm; out.goalsConcededHome = gp;
      log(`✅ GM/GP Acasă: ${gm}/${gp}`);
    } else {
      out.goalsScoredAway = gm; out.goalsConcededAway = gp;
      log(`✅ GM/GP Deplasare: ${gm}/${gp}`);
    }
  }

  // --- PPM from the "Sinteză" stats block (first decimal that follows the label) ---
  for (let i = 0; i < lines.length; i++) {
    if (!/^Sintez[ăa]\b/i.test(lines[i])) continue;
    const window = lines.slice(i, i + 14).join(' ');
    const decimals = window.match(/\b\d+[.,]\d+\b/g)?.map(n => parseFloat(n.replace(',', '.'))) ?? [];
    if (decimals.length >= 1) {
      out.ppmSint = decimals[0];
      log(`✅ PPM Sinteză: ${decimals[0]}`);
    }
    break;
  }

  // --- MJ (meciuri jucate) din tabelul cu antet "MJ" ---
  {
    const mjHeader = joined.search(/\bMJ\b/);
    if (mjHeader >= 0) {
      const mjScope = joined.slice(mjHeader, mjHeader + 900);
      const mjLabels: Array<{ key: 'sint' | 'home' | 'away'; rx: RegExp }> = [
        { key: 'sint', rx: /Sintez[ăa]/i },
        { key: 'home', rx: /Acas[ăa]/i },
        { key: 'away', rx: /Deplasare/i },
      ];
      for (const { key, rx } of mjLabels) {
        const m = rx.exec(mjScope);
        if (!m) continue;
        const win = mjScope.slice(m.index + m[0].length, m.index + m[0].length + 40);
        // primul întreg (nu zecimal) după etichetă
        const im = win.match(/\d{1,2}(?![\d.,])/);
        if (!im) continue;
        const mj = parseInt(im[0], 10);
        if (mj < 1 || mj > 80) continue;
        if (key === 'sint') { out.matchesPlayedSint = mj; log(`✅ MJ Sinteză: ${mj}`); }
        else if (key === 'home') { out.matchesPlayedHome = mj; log(`✅ MJ Acasă: ${mj}`); }
        else { out.matchesPlayedAway = mj; log(`✅ MJ Deplasare: ${mj}`); }
      }
    }
  }

  // --- xG (For) — header arată "xG (NumeEchipa)", NU "xG (Împotriva)" ---
  {
    const xgRe = /xG\s*\(([^)]+)\)/gi;
    let mm: RegExpExecArray | null;
    while ((mm = xgRe.exec(joined)) !== null) {
      if (/Împotriv[ăa]/i.test(mm[1])) continue; // skip xGA header
      const start = mm.index + mm[0].length;
      const block = joined.slice(start, start + 250);
      const mSint = block.match(/Sintez[ăa]\s*([\d.,]+)/i);
      const mAcasa = block.match(/Acas[ăa]\s*([\d.,]+)/i);
      const mDepl = block.match(/Deplasare\s*([\d.,]+)/i);
      if (mSint || mAcasa || mDepl) {
        if (mSint) { out.xgForSint = num(mSint[1]); log(`✅ xG Sinteză: ${out.xgForSint}`); }
        if (mAcasa) out.xgForHome = num(mAcasa[1]);
        if (mDepl) out.xgForAway = num(mDepl[1]);
        break;
      }
    }
  }

  // --- xG (Împotriva) — pentru xGA ---
  const xgAgIdx = joined.search(/xG\s*\(Împotriva\)/i);
  if (xgAgIdx >= 0) {
    const block = joined.slice(xgAgIdx, xgAgIdx + 250);
    const mSint = block.match(/Sinteză\s*([\d.,]+)/i);
    const mAcasa = block.match(/Acasă\s*([\d.,]+)/i);
    const mDepl = block.match(/Deplasare\s*([\d.,]+)/i);
    if (mSint) { out.xgAgainstSint = num(mSint[1]); }
    if (mAcasa) out.xgAgainstHome = num(mAcasa[1]);
    if (mDepl) out.xgAgainstAway = num(mDepl[1]);
  }

  // --- Alte Statistici block ---
  const poss = joined.match(/Posesie\s+Medie[^\d-]*([\d.,]+)/i);
  if (poss) { out.possession = num(poss[1]); log(`✅ Posesie: ${out.possession}`); }

  const shotsM = joined.match(/Șuturi\s+Pe\s+Meci[^\d-]*([\d.,]+)/i);
  if (shotsM) { out.shotsPerMatch = num(shotsM[1]); log(`✅ Șuturi/meci: ${out.shotsPerMatch}`); }

  const sotM = joined.match(/Șuturi\s+Pe\s+Poart[ăa][\s\S]{0,15}?Meci[^\d-]*([\d.,]+)/i);
  if (sotM) { out.shotsOnTargetPerMatch = num(sotM[1]); log(`✅ SOT/meci: ${out.shotsOnTargetPerMatch}`); }

  const foulsM = joined.match(/Faulturi\s+pe\s+Meci[^\d-]*([\d.,]+)/i);
  if (foulsM) { out.foulsPerMatch = num(foulsM[1]); log(`✅ Faulturi/meci: ${out.foulsPerMatch}`); }

  // Cornere — prioritate: "Cornere ale echipei pe meci" (din Statistici Evidențiate),
  // fallback: "Pentru X.XX" (din blocul "Cornere / Meci").
  const cornersTeam = joined.match(/Cornere\s+ale\s+echipei\s+pe\s+meci[^\d-]*([\d.,]+)/i);
  if (cornersTeam) {
    out.cornersForPerMatch = num(cornersTeam[1]);
    log(`✅ Cornere echipă/meci: ${out.cornersForPerMatch}`);
  } else {
    const cornersFor = joined.match(/Pentru\s*([\d.,]+)/i);
    if (cornersFor) { out.cornersForPerMatch = num(cornersFor[1]); log(`✅ Cornere Pentru: ${out.cornersForPerMatch}`); }
  }

  // Cartonașe / Meci: number appears just BEFORE the label
  const cardsRe = joined.match(/([\d.,]+)\s*Cartonașe\s*\/\s*Meci/i);
  if (cardsRe) { out.cardsPerMatch = num(cardsRe[1]); log(`✅ Cartonașe/meci: ${out.cardsPerMatch}`); }

  // Salvări portar / Intervenții portar (per meci) — același lucru
  const gkSaves = joined.match(/(?:Salv[ăa]ri|Interven[țt]ii)\s+portar(?:\s*\/?\s*[Mm]eci)?[^\d-]*([\d.,]+)/i);
  if (gkSaves) { out.gkSavesPerMatch = num(gkSaves[1]); log(`✅ Salvări portar/meci: ${out.gkSavesPerMatch}`); }

  // --- LEAGUE STANDINGS — extract leaguePosition, totalTeams, MJ from the standings table ---
  // Format per row (each on its own line, blank lines in between):
  //   "3"  ""  " FC Dinamo 1948 Bucuresti"  ""  "20"  ""  "55%"  ""  "30"  ...
  if (teamName) {
    const cleanTeam = teamName.replace(/^(fc|cs|cfr|scs|sc|afc|afk|ssc|acs)\s+/i, '').trim();
    const teamPart = cleanTeam.split(/\s+/).slice(0, 2).join('\\s+');
    const teamRe = new RegExp(escapeReg(cleanTeam) + '|' + teamPart, 'i');

    // Collect all standings rows: a standalone rank line followed (within 8 lines) by a team line.
    const rankIdxs: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      const rk = lines[i].match(/^(\d{1,2})$/);
      if (!rk) continue;
      const r = parseInt(rk[1], 10);
      if (r < 1 || r > 40) continue;
      // verify a team-name line follows within 6 lines (non-empty, has letters)
      let hasTeam = false;
      for (let j = i + 1; j < Math.min(lines.length, i + 7); j++) {
        if (/[A-Za-zĂÎÂȘȚăîâșț]{3,}/.test(lines[j]) && !/^\d/.test(lines[j])) { hasTeam = true; break; }
        if (lines[j].length > 0 && !/^\d{1,2}$/.test(lines[j])) break;
      }
      if (hasTeam) rankIdxs.push(i);
    }

    // Find OUR team's row
    for (const idx of rankIdxs) {
      // team line is within next 6 lines
      let teamLineIdx = -1;
      for (let j = idx + 1; j < Math.min(lines.length, idx + 7); j++) {
        if (teamRe.test(lines[j])) { teamLineIdx = j; break; }
      }
      if (teamLineIdx < 0) continue;
      out.leaguePosition = parseInt(lines[idx], 10);
      log(`✅ Loc clasament: ${out.leaguePosition}`);
      // MJ = first standalone integer after team line (skip blank lines)
      for (let k = teamLineIdx + 1; k < Math.min(lines.length, teamLineIdx + 6); k++) {
        const im = lines[k].match(/^(\d{1,3})$/);
        if (im) {
          const mj = parseInt(im[1], 10);
          if (mj >= 1 && mj <= 80) {
            // Heuristic: which tab? Use which standings header precedes this row.
            const headerSlice = joined.slice(0, joined.indexOf(lines[idx]) >= 0 ? joined.indexOf(lines[idx]) : 0);
            const lastHomeIdx = headerSlice.toLowerCase().lastIndexOf('clasament acas');
            const lastAwayIdx = headerSlice.toLowerCase().lastIndexOf('clasament deplasare');
            const lastGenIdx = Math.max(
              headerSlice.toLowerCase().lastIndexOf('liga i tabel'),
              headerSlice.toLowerCase().lastIndexOf('clasament'),
            );
            if (lastHomeIdx >= 0 && lastHomeIdx >= lastAwayIdx && lastHomeIdx >= lastGenIdx) {
              out.matchesPlayedHome = mj;
              log(`✅ MJ Acasă: ${mj}`);
            } else if (lastAwayIdx >= 0 && lastAwayIdx >= lastGenIdx) {
              out.matchesPlayedAway = mj;
              log(`✅ MJ Deplasare: ${mj}`);
            } else {
              out.matchesPlayedSint = mj;
              log(`✅ MJ Sinteză: ${mj}`);
            }
            break;
          }
        }
      }
      break;
    }

    // Total teams = number of rank rows in the most recent standings block
    if (rankIdxs.length >= 6) {
      // largest contiguous run by gap (rows within 12 lines of each other)
      let bestRun = 1, curRun = 1;
      for (let i = 1; i < rankIdxs.length; i++) {
        if (rankIdxs[i] - rankIdxs[i - 1] <= 14) { curRun++; bestRun = Math.max(bestRun, curRun); }
        else curRun = 1;
      }
      if (bestRun >= 6 && bestRun <= 32) {
        out.totalTeamsInLeague = bestRun;
        log(`✅ Total echipe: ${bestRun}`);
      }
    }
  }

  return out;
}

// ===== APPLIERS =====

/** Apply general tab: overall season metrics. */
export function applyGeneral(p: FootystatsExtract, base: ParsedTeamStats): ParsedTeamStats {
  return {
    ...base,
    formLast5: p.form5 ?? base.formLast5,
    goalsScored: p.goalsScoredSint ?? base.goalsScored,
    goalsConceded: p.goalsConcededSint ?? base.goalsConceded,
    matchesPlayed: p.matchesPlayedSint ?? base.matchesPlayed,
    ppm: p.ppmSint ?? base.ppm,
    // user rule: xG-ul echipei = xG simplu (NU Împotriva). xGA = xG Împotriva.
    xG: p.xgForSint ?? base.xG,
    xGA: p.xgAgainstSint ?? base.xGA,
    possession: p.possession ?? base.possession,
    shots: p.shotsPerMatch ?? base.shots,
    shotsOnTarget: p.shotsOnTargetPerMatch ?? base.shotsOnTarget,
    fouls: p.foulsPerMatch ?? base.fouls,
    cardsPerMatch: p.cardsPerMatch ?? base.cardsPerMatch,
    gkSaves: p.gkSavesPerMatch ?? base.gkSaves,
    // cornere medii/meci → din Statistici Generale
    cornersPerMatch: p.cornersForPerMatch ?? base.cornersPerMatch,
    leaguePosition: p.leaguePosition ?? base.leaguePosition,
    totalTeamsInLeague: p.totalTeamsInLeague ?? base.totalTeamsInLeague,
  };
}

/** Apply home tab: home splits + home form. */
export function applyHome(p: FootystatsExtract, base: ParsedTeamStats): ParsedTeamStats {
  return {
    ...base,
    formHomeAway: p.form5 ?? base.formHomeAway,
    goalsScoredHome: p.goalsScoredHome ?? base.goalsScoredHome,
    goalsConcededHome: p.goalsConcededHome ?? base.goalsConcededHome,
    // cornere ACASĂ/meci → din secțiunea Acasă
    cornersPerMatchHome: p.cornersForPerMatch ?? base.cornersPerMatchHome,
    shotsOnTargetHome: p.shotsOnTargetPerMatch ?? base.shotsOnTargetHome,
  };
}

/** Apply away tab: away splits + away form. */
export function applyAway(p: FootystatsExtract, base: ParsedTeamStats): ParsedTeamStats {
  return {
    ...base,
    formHomeAway: p.form5 ?? base.formHomeAway,
    goalsScoredAway: p.goalsScoredAway ?? base.goalsScoredAway,
    goalsConcededAway: p.goalsConcededAway ?? base.goalsConcededAway,
    // cornere DEPLASARE/meci → din secțiunea Deplasare
    cornersPerMatchAway: p.cornersForPerMatch ?? base.cornersPerMatchAway,
    shotsOnTargetAway: p.shotsOnTargetPerMatch ?? base.shotsOnTargetAway,
  };
}