export type ConfidenceLevel = 'VERY_LOW' | 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';

export const CONFIDENCE_STAKE_PCT: Record<ConfidenceLevel, number> = {
  VERY_LOW: 0.01,   // 1%
  LOW: 0.02,        // 2%
  MEDIUM: 0.03,     // 3%
  HIGH: 0.04,       // 4%
  VERY_HIGH: 0.05,  // 5%
};

export const CONFIDENCE_LABEL: Record<ConfidenceLevel, string> = {
  VERY_LOW: 'Very Low',
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  VERY_HIGH: 'Very High',
};

export interface BetRecord {
  id: string;
  match: string;
  odds: number;
  result: 'WIN' | 'LOSS';
  risk: 'LOW' | 'MEDIUM' | 'HIGH';
  confidence: ConfidenceLevel;
  stakePct: number;     // e.g. 0.03
  stake: number;        // lei
  profit: number;
  bankrollAfter: number;
  date: string;
  winRate: number; // estimated WR from analysis
  status?: BetStatus;     // added: PENDING/WON/LOST/VOID (fallback derived from result)
  sport?: string;         // added: for Owner Dashboard filter
  settledAt?: string;
}

export type BetStatus = 'PENDING' | 'WON' | 'LOST' | 'VOID';

export function betStatus(b: BetRecord): BetStatus {
  if (b.status) return b.status;
  return b.result === 'WIN' ? 'WON' : 'LOST';
}

export interface BankrollState {
  initialBankroll: number;
  currentBankroll: number;
  bets: BetRecord[];
  consecutiveLosses: number;
  consecutiveWins: number;
  stakeModifier: number; // 1.0 = normal
}

const RISK_FACTOR: Record<string, number> = {
  LOW: 1.0,
  MEDIUM: 0.5,
  HIGH: 0.75,
};

const STORAGE_KEY = 'bankroll_state';

export function getDefaultBankrollState(initial = 1000): BankrollState {
  return {
    initialBankroll: initial,
    currentBankroll: initial,
    bets: [],
    consecutiveLosses: 0,
    consecutiveWins: 0,
    stakeModifier: 1.0,
  };
}

export function loadBankrollState(): BankrollState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveBankrollState(state: BankrollState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// ===== TOP BETS SYNC (analysis -> bankroll manager) =====
const TOP_BETS_KEY = 'bankroll_top_bets';

export interface SyncedTopBet {
  matchLabel: string;
  selection: string;
  category: 'corners' | 'winner' | 'goals';
  odds: number;
  winRate: number;
  ev: number;
  value: number;
  stakeConfidence: ConfidenceLevel;
  stakePct: number;
  stakeLei: number;
  fragile: boolean;
  risk: 'low' | 'medium' | 'high';
  addedAt: string;
}

export function loadSyncedTopBets(): SyncedTopBet[] {
  try {
    const raw = localStorage.getItem(TOP_BETS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveSyncedTopBets(bets: SyncedTopBet[]) {
  localStorage.setItem(TOP_BETS_KEY, JSON.stringify(bets));
}

export function clearSyncedTopBets() {
  localStorage.removeItem(TOP_BETS_KEY);
}

export function calculateKelly(winRate: number, odds: number): number {
  const p = winRate / 100;
  const q = 1 - p;
  const b = odds - 1;
  if (b <= 0) return 0;
  const kelly = (b * p - q) / b;
  return Math.max(0, kelly);
}

export function calculateStake(
  bankroll: number,
  winRate: number,
  odds: number,
  risk: 'LOW' | 'MEDIUM' | 'HIGH',
  stakeModifier: number
): number {
  const kelly = calculateKelly(winRate, odds);
  const factor = RISK_FACTOR[risk];
  const stake = bankroll * kelly * factor * stakeModifier;
  return Math.max(0, Math.round(stake * 100) / 100);
}

/**
 * Confidence-based fixed stake (1%–5% of bankroll).
 */
export function calculateConfidenceStake(
  bankroll: number,
  confidence: ConfidenceLevel,
  stakeModifier: number = 1
): { pct: number; lei: number } {
  const pct = CONFIDENCE_STAKE_PCT[confidence] * stakeModifier;
  const lei = Math.round(bankroll * pct * 100) / 100;
  return { pct, lei };
}

/**
 * Determine confidence level from analysis signals.
 */
export function deriveConfidence(args: {
  modelConfidence: 'high' | 'medium' | 'low';
  winRate: number;
  value: number;
  stability: number;
  risk: 'low' | 'medium' | 'high';
  fragile?: boolean;
}): ConfidenceLevel {
  const { modelConfidence, winRate, value, stability, risk, fragile } = args;

  const cap = (lvl: ConfidenceLevel): ConfidenceLevel => {
    if (!fragile) return lvl;
    if (lvl === 'VERY_HIGH' || lvl === 'HIGH' || lvl === 'MEDIUM') return 'LOW';
    return lvl;
  };

  if (stability < 0.35 || risk === 'high' || winRate < 55) return cap('VERY_LOW');
  if (modelConfidence === 'high' && winRate >= 80 && stability >= 0.7 && value >= 8 && risk === 'low') return cap('VERY_HIGH');
  if (modelConfidence === 'high' && winRate >= 75 && stability >= 0.6 && value >= 5) return cap('HIGH');
  if (winRate >= 65 && value >= 3) return cap('MEDIUM');
  return cap('LOW');
}

export function addBet(
  state: BankrollState,
  match: string,
  odds: number,
  result: 'WIN' | 'LOSS',
  risk: 'LOW' | 'MEDIUM' | 'HIGH',
  winRate: number,
  confidence: ConfidenceLevel = 'MEDIUM',
  sport: string = 'Fotbal',
  status?: BetStatus,
): BankrollState {
  const { pct, lei: stake } = calculateConfidenceStake(state.currentBankroll, confidence, state.stakeModifier);
  const st: BetStatus = status ?? (result === 'WIN' ? 'WON' : 'LOST');
  const profit = profitFor(st, stake, odds);
  const bankrollAfter = Math.round((state.currentBankroll + profit) * 100) / 100;

  let consecutiveLosses = result === 'LOSS' ? state.consecutiveLosses + 1 : 0;
  let consecutiveWins = result === 'WIN' ? state.consecutiveWins + 1 : 0;

  let stakeModifier = 1.0;
  if (consecutiveLosses >= 5) stakeModifier = 0.5;
  else if (consecutiveLosses >= 3) stakeModifier = 0.75;
  else if (consecutiveWins >= 5) stakeModifier = 1.1;

  const bet: BetRecord = {
    id: crypto.randomUUID(),
    match,
    odds,
    result,
    risk,
    confidence,
    stakePct: pct,
    stake,
    profit: Math.round(profit * 100) / 100,
    bankrollAfter,
    date: new Date().toISOString(),
    winRate,
    status: st,
    sport,
    settledAt: st === 'PENDING' ? undefined : new Date().toISOString(),
  };

  const newState: BankrollState = {
    ...state,
    currentBankroll: bankrollAfter,
    bets: [...state.bets, bet],
    consecutiveLosses,
    consecutiveWins,
    stakeModifier,
  };

  saveBankrollState(newState);
  return newState;
}

export function profitFor(status: BetStatus, stake: number, odds: number): number {
  if (status === 'WON') return stake * (odds - 1);
  if (status === 'LOST') return -stake;
  return 0; // PENDING / VOID
}

/** Rebuild bankroll chain and streaks after any bet edit/delete/status change. */
export function recomputeBankroll(state: BankrollState): BankrollState {
  let bank = state.initialBankroll;
  let cLoss = 0;
  let cWin = 0;
  const bets = state.bets.map((b) => {
    const st = betStatus(b);
    const profit = Math.round(profitFor(st, b.stake, b.odds) * 100) / 100;
    bank = Math.round((bank + profit) * 100) / 100;
    if (st === 'WON') { cWin++; cLoss = 0; }
    else if (st === 'LOST') { cLoss++; cWin = 0; }
    return { ...b, status: st, profit, bankrollAfter: bank, result: st === 'WON' ? 'WIN' as const : 'LOSS' as const };
  });
  let stakeModifier = 1.0;
  if (cLoss >= 5) stakeModifier = 0.5;
  else if (cLoss >= 3) stakeModifier = 0.75;
  else if (cWin >= 5) stakeModifier = 1.1;
  const next: BankrollState = {
    ...state,
    bets,
    currentBankroll: bank,
    consecutiveLosses: cLoss,
    consecutiveWins: cWin,
    stakeModifier,
  };
  saveBankrollState(next);
  return next;
}

export function updateBet(state: BankrollState, id: string, patch: Partial<BetRecord>): BankrollState {
  const bets = state.bets.map((b) => (b.id === id ? { ...b, ...patch } : b));
  return recomputeBankroll({ ...state, bets });
}

export function deleteBet(state: BankrollState, id: string): BankrollState {
  return recomputeBankroll({ ...state, bets: state.bets.filter((b) => b.id !== id) });
}

export function setBetStatus(state: BankrollState, id: string, status: BetStatus): BankrollState {
  return updateBet(state, id, {
    status,
    result: status === 'WON' ? 'WIN' : 'LOSS',
    settledAt: status === 'PENDING' ? undefined : new Date().toISOString(),
  });
}

export function getStats(state: BankrollState) {
  const total = state.bets.length;
  const withStatus = state.bets.map((b) => ({ b, s: betStatus(b) }));
  const wins = withStatus.filter((x) => x.s === 'WON').length;
  const losses = withStatus.filter((x) => x.s === 'LOST').length;
  const voids = withStatus.filter((x) => x.s === 'VOID').length;
  const pending = withStatus.filter((x) => x.s === 'PENDING').length;
  const settled = wins + losses;
  const winrate = settled > 0 ? (wins / settled) * 100 : 0;
  const settledBets = withStatus.filter((x) => x.s === 'WON' || x.s === 'LOST');
  const totalStaked = settledBets.reduce((s, x) => s + x.b.stake, 0);
  const totalProfit = state.currentBankroll - state.initialBankroll;
  const roi = totalStaked > 0 ? (totalProfit / totalStaked) * 100 : 0;
  const avgOdds = total > 0 ? state.bets.reduce((s, b) => s + b.odds, 0) / total : 0;
  const yieldPct = totalStaked > 0 ? (totalProfit / totalStaked) * 100 : 0;
  const avgProfitPerBet = settled > 0 ? totalProfit / settled : 0;

  return {
    total,
    wins,
    losses,
    voids,
    pending,
    winrate: Math.round(winrate * 10) / 10,
    avgOdds: Math.round(avgOdds * 100) / 100,
    roi: Math.round(roi * 10) / 10,
    yieldPct: Math.round(yieldPct * 10) / 10,
    totalProfit: Math.round(totalProfit * 100) / 100,
    netProfit: Math.round(totalProfit * 100) / 100,
    totalStaked: Math.round(totalStaked * 100) / 100,
    avgProfitPerBet: Math.round(avgProfitPerBet * 100) / 100,
  };
}

export function getCashOutStatus(state: BankrollState): {
  canCashOut: boolean;
  reason: string;
  suggestedWithdrawal: number;
} {
  const profitPct = ((state.currentBankroll - state.initialBankroll) / state.initialBankroll) * 100;
  const profit = state.currentBankroll - state.initialBankroll;

  if (profitPct >= 25 || profit >= 20) {
    const withdrawal = Math.round(profit * 0.4 * 100) / 100; // 40% of profit
    return {
      canCashOut: true,
      reason: profitPct >= 25
        ? `Bancă +${profitPct.toFixed(1)}% față de start`
        : `Profit ≥ 20 unități`,
      suggestedWithdrawal: Math.max(0, withdrawal),
    };
  }

  return {
    canCashOut: false,
    reason: profit < 0
      ? `Drawdown activ (${profit.toFixed(2)})`
      : `Sub +25% (actual: +${profitPct.toFixed(1)}%)`,
    suggestedWithdrawal: 0,
  };
}

export function getBankrollChartData(state: BankrollState) {
  const data = [{ index: 0, bankroll: state.initialBankroll, label: 'Start' }];
  state.bets.forEach((bet, i) => {
    data.push({
      index: i + 1,
      bankroll: bet.bankrollAfter,
      label: `#${i + 1}`,
    });
  });
  return data;
}

export function getMonthlyProfitData(state: BankrollState) {
  const monthly: Record<string, number> = {};
  state.bets.forEach(bet => {
    const month = bet.date.slice(0, 7); // YYYY-MM
    monthly[month] = (monthly[month] || 0) + bet.profit;
  });
  return Object.entries(monthly).map(([month, profit]) => ({
    month,
    profit: Math.round(profit * 100) / 100,
  }));
}
