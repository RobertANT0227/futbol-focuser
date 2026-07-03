import { supabase } from "@/integrations/supabase/client";
import type { BetRecord } from "@/lib/bankroll";
import { betStatus } from "@/lib/bankroll";

/** Fire-and-forget cloud sync. Never throws — bankroll must keep working offline. */
export async function upsertBetToCloud(userId: string, bet: BetRecord, bankrollAfter?: number) {
  try {
    const st = betStatus(bet);
    await supabase.from("bankroll_bets").upsert({
      id: bet.id,
      user_id: userId,
      match: bet.match,
      sport: bet.sport ?? "Fotbal",
      odds: bet.odds,
      stake: bet.stake,
      profit: bet.profit,
      status: st,
      confidence: bet.confidence,
      risk: bet.risk,
      win_rate: bet.winRate,
      bankroll_after: bankrollAfter ?? bet.bankrollAfter,
      placed_at: bet.date,
      settled_at: bet.settledAt ?? (st === "PENDING" ? null : bet.date),
    });
  } catch {
    /* silent */
  }
}

export async function deleteBetFromCloud(id: string) {
  try {
    await supabase.from("bankroll_bets").delete().eq("id", id);
  } catch {
    /* silent */
  }
}

export async function syncAllBetsToCloud(userId: string, bets: BetRecord[]) {
  try {
    await Promise.all(bets.map((b) => upsertBetToCloud(userId, b)));
  } catch {
    /* silent */
  }
}