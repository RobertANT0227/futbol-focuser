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

  const rowRe = /(Sinteză|Acasă|Deplasare)[\s\S]{0,80}?([\d.,]+)[^\d]{1,15}?([\d.,]+)[^\d]{1,15}?([\d.,]+)/gi;
  let m: RegExpExecArray | null;
  const seen = new Set<string>();
  while ((m = rowRe.exec(scope)) !== null) {
    const label = m[1].toLowerCase();
    if (seen.has(label)) continue;
    seen.add(label);
    const gm = num(m[2]);
    const gp = num(m[3]);
    if (label.startsWith('sint')) {
      if (gm !== undefined) { out.goalsScoredSint = gm; log(`✅ GM Sinteză: ${gm}`); }
      if (gp !== undefined) { out.goalsConcededSint = gp; log(`✅ GP Sinteză: ${gp}`); }
    } else if (label.startsWith('acas')) {
      if (gm !== undefined) { out.goalsScoredHome = gm; log(`✅ GM Acasă: ${gm}`); }
      if (gp !== undefined) { out.goalsConcededHome = gp; log(`✅ GP Acasă: ${gp}`); }
    } else if (label.startsWith('depl')) {
      if (gm !== undefined) { out.goalsScoredAway = gm; log(`✅ GM Deplasare: ${gm}`); }
      if (gp !== undefined) { out.goalsConcededAway = gp; log(`✅ GP Deplasare: ${gp}`); }
    }
  }

  // --- MJ TABLE: "Sinteză 39 23 10 6 ... 2.03" ---
  // Look for the first "Sinteză" followed by integers; the 4 ints are MJ V E Î, last decimal is PPM.
  for (let i = 0; i < lines.length; i++) {
    if (!/^Sinteză\b/i.test(lines[i])) continue;
    // Collect numeric tokens from the next ~12 lines (skip form letters)
    const window = lines.slice(i, i + 14).join(' ');
    const ints = window.match(/\b\d+\b/g)?.map(n => parseInt(n, 10)) ?? [];
    const decimals = window.match(/\b\d+[.,]\d+\b/g)?.map(n => parseFloat(n.replace(',', '.'))) ?? [];
    if (ints.length >= 1) {
      out.matchesPlayedSint = ints[0];
      log(`✅ MJ Sinteză: ${ints[0]}`);
    }
    if (decimals.length >= 1) {
      out.ppmSint = decimals[0];
      log(`✅ PPM Sinteză: ${decimals[0]}`);
    }
    break;
  }
  // MJ for Acasă / Deplasare rows
  for (const label of ['Acasă', 'Deplasare'] as const) {
    const idx = lines.findIndex(l => new RegExp(`^${label}\\b`, 'i').test(l));
    if (idx < 0) continue;
    const window = lines.slice(idx, idx + 14).join(' ');
    const ints = window.match(/\b\d+\b/g)?.map(n => parseInt(n, 10)) ?? [];
    if (ints.length >= 1) {
      if (label === 'Acasă') out.matchesPlayedHome = ints[0];
      else out.matchesPlayedAway = ints[0];
    }
  }

  // --- xG (For) — secțiunea simplă "xG" (NU "xG (Împotriva)") ---
  // Caută o etichetă "xG" pe propria linie, fără paranteza "(Împotriva)".
  {
    const xgRe = /(?:^|\n)\s*xG\s*(?:\n|$)/g;
    let mm: RegExpExecArray | null;
    while ((mm = xgRe.exec(joined)) !== null) {
      const start = mm.index + mm[0].length;
      const block = joined.slice(start, start + 220);
      // Skip dacă următoarele caractere indică "(Împotriva)"
      if (/^\s*\(Împotriva\)/i.test(block)) continue;
      const mSint = block.match(/Sinteză\s*([\d.,]+)/i);
      const mAcasa = block.match(/Acasă\s*([\d.,]+)/i);
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

  // --- LEAGUE STANDINGS ---
  if (teamName) {
    // Find rows of pattern: "<rank>\t<team>\t<MJ>\t..." across multi-line dumps.
    // Strategy: find the line containing the team name, then walk back to find the rank (number 1-50).
    const cleanTeam = teamName.replace(/^(fc|cs|cfr|scs|sc|afc|afk|ssc|acs)\s+/i, '').trim();
    const teamPart = cleanTeam.split(/\s+/).slice(0, 2).join('\\s+');
    const teamRe = new RegExp(escapeReg(cleanTeam) + '|' + teamPart, 'i');

    for (let i = 0; i < lines.length; i++) {
      if (!teamRe.test(lines[i])) continue;
      // Walk back up to 5 lines looking for a standalone rank (1-30)
      for (let j = Math.max(0, i - 5); j < i; j++) {
        const rk = lines[j].match(/^(\d{1,2})$/);
        if (rk) {
          const r = parseInt(rk[1], 10);
          if (r >= 1 && r <= 32) {
            out.leaguePosition = r;
            log(`✅ Loc clasament: ${r}`);
            break;
          }
        }
      }
      if (out.leaguePosition) break;
    }
    // Total teams = highest rank found across all lines
    const allRanks = joined.match(/^\s*(\d{1,2})\s*$/gm)?.map(s => parseInt(s.trim(), 10)) ?? [];
    const maxRank = allRanks.length ? Math.max(...allRanks) : 0;
    if (maxRank >= 6 && maxRank <= 32) {
      out.totalTeamsInLeague = maxRank;
      log(`✅ Total echipe: ${maxRank}`);
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