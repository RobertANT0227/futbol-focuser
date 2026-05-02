import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import {
  Trash2, KeyRound, ArrowUp, ArrowDown, Lock, Unlock, CalendarPlus, Copy, Check, Eye, EyeOff,
} from "lucide-react";

type AccountType = "trial" | "premium";
type Role = "owner" | "client";

interface UserRow {
  id: string;
  username: string;
  role: Role | null;
  accountType: AccountType | null;
  expiresAt: string | null;
  blocked: boolean;
  blockedReason: string | null;
}

interface AuditEntry {
  id: string;
  actor_username: string | null;
  action: string;
  target_username: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

const fmtDate = (s: string | null) => {
  if (!s) return "—";
  const d = new Date(s);
  return d.toLocaleDateString("ro-RO", { day: "2-digit", month: "short", year: "numeric" });
};

const daysRemaining = (s: string | null): number | null => {
  if (!s) return null;
  const ms = new Date(s).getTime() - Date.now();
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
};

const Settings = () => {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Create form
  const [newType, setNewType] = useState<AccountType>("trial");
  const [manualUser, setManualUser] = useState("");
  const [manualPass, setManualPass] = useState("");
  const [creating, setCreating] = useState(false);

  // Credential modal (one-time display)
  const [credModal, setCredModal] = useState<{ username: string; password: string; type: AccountType } | null>(null);
  const [showPass, setShowPass] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const loadAll = async () => {
    setLoading(true);
    const [{ data: profiles }, { data: roles }, { data: metas }, { data: auditRows }] = await Promise.all([
      supabase.from("profiles").select("id, username").order("username"),
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("account_meta").select("user_id, account_type, expires_at, blocked, blocked_reason"),
      supabase.from("admin_audit_log")
        .select("id, actor_username, action, target_username, metadata, created_at")
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    const merged: UserRow[] = (profiles ?? []).map((p) => {
      const r = roles?.find((x) => x.user_id === p.id);
      const m = metas?.find((x) => x.user_id === p.id);
      return {
        id: p.id,
        username: p.username,
        role: (r?.role as Role) ?? null,
        accountType: (m?.account_type as AccountType) ?? null,
        expiresAt: m?.expires_at ?? null,
        blocked: !!m?.blocked,
        blockedReason: m?.blocked_reason ?? null,
      };
    });
    setUsers(merged);
    setAudit((auditRows ?? []) as AuditEntry[]);
    setLoading(false);
  };

  useEffect(() => { loadAll(); }, []);

  const copy = async (text: string, label: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-create-user", {
        body: {
          username: manualUser.trim() || undefined,
          password: manualPass || undefined,
          account_type: newType,
          trial_days: 7,
        },
      });
      if (error || !data?.ok) {
        toast({
          title: "Eroare",
          description: data?.error || error?.message || "Nu s-a putut crea contul",
          variant: "destructive",
        });
        return;
      }
      setCredModal({ username: data.username, password: data.password, type: data.account_type });
      setShowPass(false);
      setManualUser("");
      setManualPass("");
      await loadAll();
    } finally {
      setCreating(false);
    }
  };

  const callUpdate = async (action: string, user_id: string, extra: Record<string, unknown> = {}) => {
    const { data, error } = await supabase.functions.invoke("admin-update-user", {
      body: { action, user_id, ...extra },
    });
    if (error || !data?.ok) {
      toast({ title: "Eroare", description: data?.error || error?.message || "Acțiune eșuată", variant: "destructive" });
      return null;
    }
    await loadAll();
    return data;
  };

  const handleUpgrade = (u: UserRow) => callUpdate("upgrade", u.id).then((d) => d && toast({ title: "Upgrade", description: `${u.username} → Premium` }));
  const handleDowngrade = (u: UserRow) => callUpdate("downgrade", u.id, { trial_days: 7 }).then((d) => d && toast({ title: "Downgrade", description: `${u.username} → Trial 7 zile` }));
  const handleExtend = (u: UserRow) => {
    const days = Number(prompt(`Extinde abonamentul pentru ${u.username} cu câte zile?`, "7") || "0");
    if (!days || days < 1) return;
    callUpdate("extend", u.id, { days }).then((d) => d && toast({ title: "Extins", description: `+${days} zile` }));
  };
  const handleBlock = (u: UserRow) => {
    const reason = prompt(`Motiv blocare pentru ${u.username}:`, "Blocat de owner");
    if (reason === null) return;
    callUpdate("block", u.id, { reason }).then((d) => d && toast({ title: "Blocat", description: u.username }));
  };
  const handleUnblock = (u: UserRow) => callUpdate("unblock", u.id).then((d) => d && toast({ title: "Deblocat", description: u.username }));
  const handleResetPass = async (u: UserRow) => {
    if (!confirm(`Resetezi parola pentru ${u.username}? Parola actuală nu va mai funcționa.`)) return;
    const data = await callUpdate("reset_password", u.id);
    if (data?.password) {
      setCredModal({ username: u.username, password: data.password as string, type: u.accountType ?? "trial" });
      setShowPass(false);
    }
  };

  const handleDelete = async (u: UserRow) => {
    if (!confirm(`Șterge definitiv "${u.username}"? Acțiune ireversibilă.`)) return;
    const { data, error } = await supabase.functions.invoke("admin-delete-user", {
      body: { user_id: u.id },
    });
    if (error || !data?.ok) {
      toast({ title: "Eroare", description: data?.error || error?.message || "Eroare la ștergere", variant: "destructive" });
      return;
    }
    toast({ title: "Șters", description: u.username });
    await loadAll();
  };

  const sortedUsers = useMemo(
    () => [...users].sort((a, b) => {
      // owner first, then by username
      if (a.role === "owner" && b.role !== "owner") return -1;
      if (b.role === "owner" && a.role !== "owner") return 1;
      return a.username.localeCompare(b.username);
    }),
    [users],
  );

  return (
    <div className="container max-w-6xl mx-auto px-4 py-8 space-y-8">
      <header>
        <h1 className="text-2xl font-bold">⚙️ Admin Panel</h1>
        <p className="text-sm text-muted-foreground">
          Gestionează conturi Trial și Premium. Doar owner-ul are acces.
        </p>
      </header>

      {/* CREATE */}
      <section className="border border-border rounded-xl bg-card p-5 space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          ➕ Creează cont nou
        </h2>
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid md:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>Tip cont</Label>
              <Select value={newType} onValueChange={(v) => setNewType(v as AccountType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="trial">🆓 Trial (7 zile, 3 analize/zi)</SelectItem>
                  <SelectItem value="premium">💎 Premium (acces complet)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Username (opțional)</Label>
              <Input
                value={manualUser}
                onChange={(e) => setManualUser(e.target.value)}
                placeholder="auto-generat"
                maxLength={32}
              />
            </div>
            <div className="space-y-1">
              <Label>Parolă (opțional, min 8)</Label>
              <Input
                type="password"
                value={manualPass}
                onChange={(e) => setManualPass(e.target.value)}
                placeholder="auto-generată"
                minLength={manualPass ? 8 : 0}
                maxLength={128}
              />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-muted-foreground">
              Lasă câmpurile goale pentru generare automată. Parola se afișează O SINGURĂ DATĂ.
            </p>
            <Button type="submit" disabled={creating} className="font-bold">
              {creating ? "Creez..." : "Creează cont"}
            </Button>
          </div>
        </form>
      </section>

      {/* USERS TABLE */}
      <section className="border border-border rounded-xl bg-card p-5 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Utilizatori ({users.length})
        </h2>
        {loading ? (
          <p className="text-sm text-muted-foreground">Se încarcă...</p>
        ) : (
          <div className="space-y-2">
            {sortedUsers.map((u) => {
              const days = daysRemaining(u.expiresAt);
              const expiringSoon = u.accountType === "trial" && days !== null && days <= 2;
              const expired = u.accountType === "trial" && days !== null && days <= 0;
              return (
                <div
                  key={u.id}
                  className="flex flex-wrap items-center gap-3 p-3 rounded-lg bg-secondary/30 border border-border"
                >
                  <div className="flex-1 min-w-[200px] flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm font-semibold">{u.username}</span>
                    {u.role === "owner" ? (
                      <Badge variant="default" className="text-[9px]">OWNER</Badge>
                    ) : u.accountType === "premium" ? (
                      <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[9px]">💎 PREMIUM</Badge>
                    ) : u.accountType === "trial" ? (
                      <Badge variant="outline" className="text-[9px]">🆓 TRIAL</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[9px]">CLIENT</Badge>
                    )}
                    {u.blocked && (
                      <Badge variant="destructive" className="text-[9px]">🔒 BLOCAT</Badge>
                    )}
                    {u.accountType === "trial" && u.expiresAt && !u.blocked && (
                      <span className={`text-[10px] ${expired ? "text-destructive" : expiringSoon ? "text-amber-400" : "text-muted-foreground"}`}>
                        {expired ? "expirat" : `${days}z`} · până {fmtDate(u.expiresAt)}
                      </span>
                    )}
                    {u.id === currentUser?.id && (
                      <span className="text-[10px] text-muted-foreground">(tu)</span>
                    )}
                  </div>
                  {u.role !== "owner" && (
                    <div className="flex items-center gap-1">
                      {u.accountType === "trial" ? (
                        <Button size="sm" variant="ghost" onClick={() => handleUpgrade(u)} title="Upgrade Premium">
                          <ArrowUp className="h-4 w-4" />
                        </Button>
                      ) : (
                        <Button size="sm" variant="ghost" onClick={() => handleDowngrade(u)} title="Downgrade Trial">
                          <ArrowDown className="h-4 w-4" />
                        </Button>
                      )}
                      {u.accountType === "trial" && (
                        <Button size="sm" variant="ghost" onClick={() => handleExtend(u)} title="Extinde abonament">
                          <CalendarPlus className="h-4 w-4" />
                        </Button>
                      )}
                      {u.blocked ? (
                        <Button size="sm" variant="ghost" onClick={() => handleUnblock(u)} title="Deblochează">
                          <Unlock className="h-4 w-4" />
                        </Button>
                      ) : (
                        <Button size="sm" variant="ghost" onClick={() => handleBlock(u)} title="Blochează">
                          <Lock className="h-4 w-4" />
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => handleResetPass(u)} title="Resetează parolă">
                        <KeyRound className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDelete(u)}
                        className="text-destructive hover:bg-destructive/10"
                        title="Șterge cont"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* AUDIT LOG */}
      <section className="border border-border rounded-xl bg-card p-5 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          📜 Audit log (ultimele 50)
        </h2>
        {audit.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nicio acțiune înregistrată încă.</p>
        ) : (
          <div className="space-y-1 max-h-80 overflow-auto">
            {audit.map((a) => (
              <div key={a.id} className="text-xs flex items-center gap-2 py-1.5 border-b border-border/50 last:border-0">
                <span className="text-muted-foreground font-mono w-32 shrink-0">
                  {new Date(a.created_at).toLocaleString("ro-RO", { dateStyle: "short", timeStyle: "short" })}
                </span>
                <Badge variant="outline" className="text-[9px]">{a.action}</Badge>
                <span className="font-mono">{a.actor_username ?? "?"}</span>
                {a.target_username && (
                  <>
                    <span className="text-muted-foreground">→</span>
                    <span className="font-mono">{a.target_username}</span>
                  </>
                )}
                {a.metadata && Object.keys(a.metadata).length > 0 && (
                  <span className="text-muted-foreground truncate">
                    {JSON.stringify(a.metadata)}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* CREDENTIAL MODAL */}
      <Dialog open={!!credModal} onOpenChange={(o) => !o && setCredModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>🔐 Credențiale generate</DialogTitle>
            <DialogDescription>
              ⚠️ <strong>Salvează acum aceste date — parola NU va mai fi afișată niciodată.</strong>
            </DialogDescription>
          </DialogHeader>
          {credModal && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge className={credModal.type === "premium" ? "bg-amber-500/20 text-amber-400 border-amber-500/30" : ""}>
                  {credModal.type === "premium" ? "💎 PREMIUM" : "🆓 TRIAL"}
                </Badge>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Username</Label>
                <div className="flex items-center gap-2">
                  <Input readOnly value={credModal.username} className="font-mono" />
                  <Button size="icon" variant="outline" onClick={() => copy(credModal.username, "user")}>
                    {copied === "user" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Parolă</Label>
                <div className="flex items-center gap-2">
                  <Input readOnly type={showPass ? "text" : "password"} value={credModal.password} className="font-mono" />
                  <Button size="icon" variant="outline" onClick={() => setShowPass((s) => !s)}>
                    {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button size="icon" variant="outline" onClick={() => copy(credModal.password, "pass")}>
                    {copied === "pass" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => copy(`${credModal.username} / ${credModal.password}`, "both")}
              >
                {copied === "both" ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                Copiază user + parolă
              </Button>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setCredModal(null)}>Am salvat, închide</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Settings;