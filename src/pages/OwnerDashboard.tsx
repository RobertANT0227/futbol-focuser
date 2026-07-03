import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Users, TrendingUp, Trophy, Target, Percent, Wallet } from "lucide-react";

type BetRow = {
  id: string;
  user_id: string;
  match: string;
  sport: string;
  odds: number;
  stake: number;
  profit: number;
  status: "PENDING" | "WON" | "LOST" | "VOID";
  placed_at: string;
  settled_at: string | null;
};

type ProfileRow = { id: string; username: string | null };

type UserAgg = {
  user_id: string;
  username: string;
  total: number;
  won: number;
  lost: number;
  voids: number;
  pending: number;
  winRate: number;
  profit: number;
  roi: number;
  stake: number;
  lastActivity: string | null;
};

function aggregate(bets: BetRow[], profiles: ProfileRow[]): UserAgg[] {
  const byUser = new Map<string, BetRow[]>();
  for (const b of bets) {
    const arr = byUser.get(b.user_id) ?? [];
    arr.push(b);
    byUser.set(b.user_id, arr);
  }
  const profMap = new Map(profiles.map((p) => [p.id, p.username ?? "—"]));
  const rows: UserAgg[] = [];
  for (const [uid, list] of byUser.entries()) {
    const won = list.filter((b) => b.status === "WON").length;
    const lost = list.filter((b) => b.status === "LOST").length;
    const voids = list.filter((b) => b.status === "VOID").length;
    const pending = list.filter((b) => b.status === "PENDING").length;
    const settled = won + lost;
    const profit = list.reduce((s, b) => s + Number(b.profit ?? 0), 0);
    const stake = list
      .filter((b) => b.status === "WON" || b.status === "LOST")
      .reduce((s, b) => s + Number(b.stake ?? 0), 0);
    const last = list.reduce<string | null>((acc, b) => {
      const d = b.settled_at ?? b.placed_at;
      if (!acc || d > acc) return d;
      return acc;
    }, null);
    rows.push({
      user_id: uid,
      username: profMap.get(uid) ?? uid.slice(0, 8),
      total: list.length,
      won,
      lost,
      voids,
      pending,
      winRate: settled > 0 ? Math.round((won / settled) * 1000) / 10 : 0,
      profit: Math.round(profit * 100) / 100,
      roi: stake > 0 ? Math.round((profit / stake) * 1000) / 10 : 0,
      stake: Math.round(stake * 100) / 100,
      lastActivity: last,
    });
  }
  // Include profiles with no bets so owner sees the whole roster
  for (const p of profiles) {
    if (!byUser.has(p.id)) {
      rows.push({
        user_id: p.id,
        username: p.username ?? p.id.slice(0, 8),
        total: 0, won: 0, lost: 0, voids: 0, pending: 0,
        winRate: 0, profit: 0, roi: 0, stake: 0, lastActivity: null,
      });
    }
  }
  return rows;
}

const OwnerDashboard = () => {
  const [bets, setBets] = useState<BetRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [fUser, setFUser] = useState<string>("all");
  const [fSport, setFSport] = useState<string>("all");
  const [fStatus, setFStatus] = useState<string>("all");
  const [fFrom, setFFrom] = useState<string>("");
  const [fTo, setFTo] = useState<string>("");

  const load = async () => {
    const [{ data: b }, { data: p }] = await Promise.all([
      supabase.from("bankroll_bets").select("*").order("placed_at", { ascending: false }),
      supabase.from("profiles").select("id, username"),
    ]);
    setBets((b as BetRow[]) ?? []);
    setProfiles((p as ProfileRow[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("owner-bankroll")
      .on("postgres_changes", { event: "*", schema: "public", table: "bankroll_bets" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  const sports = useMemo(() => Array.from(new Set(bets.map((b) => b.sport))).sort(), [bets]);

  const filteredBets = useMemo(() => {
    return bets.filter((b) => {
      if (fUser !== "all" && b.user_id !== fUser) return false;
      if (fSport !== "all" && b.sport !== fSport) return false;
      if (fStatus !== "all" && b.status !== fStatus) return false;
      if (fFrom && b.placed_at < fFrom) return false;
      if (fTo && b.placed_at > fTo + "T23:59:59") return false;
      return true;
    });
  }, [bets, fUser, fSport, fStatus, fFrom, fTo]);

  const perUser = useMemo(() => aggregate(filteredBets, profiles), [filteredBets, profiles]);

  const global = useMemo(() => {
    const total = filteredBets.length;
    const won = filteredBets.filter((b) => b.status === "WON").length;
    const lost = filteredBets.filter((b) => b.status === "LOST").length;
    const settled = won + lost;
    const profit = filteredBets.reduce((s, b) => s + Number(b.profit ?? 0), 0);
    const stake = filteredBets
      .filter((b) => b.status === "WON" || b.status === "LOST")
      .reduce((s, b) => s + Number(b.stake ?? 0), 0);
    return {
      users: perUser.filter((u) => u.total > 0).length,
      total,
      won,
      lost,
      winRate: settled > 0 ? Math.round((won / settled) * 1000) / 10 : 0,
      profit: Math.round(profit * 100) / 100,
      roi: stake > 0 ? Math.round((profit / stake) * 1000) / 10 : 0,
      stake: Math.round(stake * 100) / 100,
    };
  }, [filteredBets, perUser]);

  const topProfit = [...perUser].sort((a, b) => b.profit - a.profit).slice(0, 5);
  const topRoi = [...perUser].filter((u) => u.stake > 0).sort((a, b) => b.roi - a.roi).slice(0, 5);
  const topWinRate = [...perUser].filter((u) => u.won + u.lost >= 5).sort((a, b) => b.winRate - a.winRate).slice(0, 5);
  const topVolume = [...perUser].sort((a, b) => b.total - a.total).slice(0, 5);

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border px-4 py-3">
        <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
          <Trophy className="h-5 w-5 text-primary" /> Owner Dashboard
        </h1>
        <p className="text-xs text-muted-foreground">Statisticile tuturor conturilor din sistem — live.</p>
      </div>

      <div className="max-w-7xl mx-auto p-4 space-y-6">
        {/* GLOBAL STATS */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          {[
            { icon: Users, label: "Utilizatori", value: global.users },
            { icon: Target, label: "Total bilete", value: global.total },
            { icon: TrendingUp, label: "Câștigate", value: global.won, color: "text-primary" },
            { icon: TrendingUp, label: "Pierdute", value: global.lost, color: "text-destructive" },
            { icon: Percent, label: "Win Rate", value: `${global.winRate}%` },
            { icon: Wallet, label: "Profit", value: `${global.profit >= 0 ? "+" : ""}${global.profit.toFixed(2)}`, color: global.profit >= 0 ? "text-primary" : "text-destructive" },
            { icon: Percent, label: "ROI", value: `${global.roi}%`, color: global.roi >= 0 ? "text-primary" : "text-destructive" },
            { icon: Wallet, label: "Stake total", value: global.stake.toFixed(2) },
          ].map((s) => (
            <Card key={s.label} className="border-border">
              <CardContent className="p-3 text-center">
                <div className="flex items-center justify-center gap-1 text-[10px] uppercase text-muted-foreground">
                  <s.icon className="h-3 w-3" /> {s.label}
                </div>
                <p className={`text-lg font-bold font-mono ${s.color || "text-foreground"}`}>{s.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* FILTERS */}
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-foreground">Filtre</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div>
              <label className="text-[10px] text-muted-foreground uppercase">Utilizator</label>
              <Select value={fUser} onValueChange={setFUser}>
                <SelectTrigger className="bg-secondary border-border"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toți</SelectItem>
                  {profiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.username ?? p.id.slice(0, 8)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground uppercase">Sport</label>
              <Select value={fSport} onValueChange={setFSport}>
                <SelectTrigger className="bg-secondary border-border"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toate</SelectItem>
                  {sports.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground uppercase">Status</label>
              <Select value={fStatus} onValueChange={setFStatus}>
                <SelectTrigger className="bg-secondary border-border"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toate</SelectItem>
                  <SelectItem value="PENDING">Pending</SelectItem>
                  <SelectItem value="WON">Won</SelectItem>
                  <SelectItem value="LOST">Lost</SelectItem>
                  <SelectItem value="VOID">Void</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground uppercase">De la</label>
              <Input type="date" value={fFrom} onChange={(e) => setFFrom(e.target.value)} className="bg-secondary border-border" />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground uppercase">Până la</label>
              <Input type="date" value={fTo} onChange={(e) => setFTo(e.target.value)} className="bg-secondary border-border" />
            </div>
          </CardContent>
        </Card>

        {/* PER-USER TABLE */}
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-foreground">Statistici per utilizator</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Se încarcă...</p>
            ) : perUser.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Niciun utilizator.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground text-xs">
                      <th className="text-left py-2 px-2">Username</th>
                      <th className="text-right py-2 px-2">Total</th>
                      <th className="text-right py-2 px-2">Won</th>
                      <th className="text-right py-2 px-2">Lost</th>
                      <th className="text-right py-2 px-2">Void</th>
                      <th className="text-right py-2 px-2">WR%</th>
                      <th className="text-right py-2 px-2">Profit</th>
                      <th className="text-right py-2 px-2">ROI%</th>
                      <th className="text-right py-2 px-2">Stake</th>
                      <th className="text-right py-2 px-2">Ultima activitate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {perUser.map((u) => (
                      <tr key={u.user_id} className="border-b border-border/50 hover:bg-muted/30">
                        <td className="py-2 px-2 text-foreground font-medium">{u.username}</td>
                        <td className="py-2 px-2 text-right font-mono">{u.total}</td>
                        <td className="py-2 px-2 text-right font-mono text-primary">{u.won}</td>
                        <td className="py-2 px-2 text-right font-mono text-destructive">{u.lost}</td>
                        <td className="py-2 px-2 text-right font-mono text-muted-foreground">{u.voids}</td>
                        <td className="py-2 px-2 text-right font-mono">{u.winRate}%</td>
                        <td className={`py-2 px-2 text-right font-mono font-semibold ${u.profit >= 0 ? "text-primary" : "text-destructive"}`}>
                          {u.profit >= 0 ? "+" : ""}{u.profit.toFixed(2)}
                        </td>
                        <td className={`py-2 px-2 text-right font-mono ${u.roi >= 0 ? "text-primary" : "text-destructive"}`}>
                          {u.roi}%
                        </td>
                        <td className="py-2 px-2 text-right font-mono">{u.stake.toFixed(2)}</td>
                        <td className="py-2 px-2 text-right font-mono text-xs text-muted-foreground">
                          {u.lastActivity ? new Date(u.lastActivity).toLocaleString("ro-RO") : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* LEADERBOARDS */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { title: "Top Profit", rows: topProfit, fmt: (u: UserAgg) => `${u.profit >= 0 ? "+" : ""}${u.profit.toFixed(2)}` },
            { title: "Top ROI", rows: topRoi, fmt: (u: UserAgg) => `${u.roi}%` },
            { title: "Top Win Rate", rows: topWinRate, fmt: (u: UserAgg) => `${u.winRate}%` },
            { title: "Top Volum", rows: topVolume, fmt: (u: UserAgg) => `${u.total}` },
          ].map((lb) => (
            <Card key={lb.title} className="border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-foreground flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-primary" /> {lb.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {lb.rows.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Fără date</p>
                ) : (
                  lb.rows.map((u, i) => (
                    <div key={u.user_id} className="flex items-center justify-between text-sm py-1 border-b border-border/40 last:border-0">
                      <span className="text-foreground">
                        <span className="text-muted-foreground font-mono text-xs mr-2">#{i + 1}</span>
                        {u.username}
                      </span>
                      <span className="font-mono font-semibold text-primary">{lb.fmt(u)}</span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};

export default OwnerDashboard;