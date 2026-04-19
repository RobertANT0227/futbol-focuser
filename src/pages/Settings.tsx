import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Trash2 } from "lucide-react";

interface UserRow {
  id: string;
  username: string;
  role: "owner" | "client" | null;
}

const Settings = () => {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [creating, setCreating] = useState(false);

  const loadUsers = async () => {
    setLoading(true);
    const { data: profiles, error } = await supabase
      .from("profiles")
      .select("id, username")
      .order("username");
    if (error) {
      toast({ title: "Eroare", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }
    const { data: roles } = await supabase.from("user_roles").select("user_id, role");
    const merged: UserRow[] = (profiles ?? []).map((p) => {
      const r = roles?.find((x) => x.user_id === p.id);
      return { id: p.id, username: p.username, role: (r?.role as "owner" | "client") ?? null };
    });
    setUsers(merged);
    setLoading(false);
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-create-user", {
        body: { username: newUsername.trim(), password: newPassword, role: "client" },
      });
      if (error || !data?.ok) {
        toast({
          title: "Eroare",
          description: data?.error || error?.message || "Nu s-a putut crea contul",
          variant: "destructive",
        });
        return;
      }
      toast({ title: "Cont creat", description: `Client: ${data.username}` });
      setNewUsername("");
      setNewPassword("");
      await loadUsers();
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string, username: string) => {
    if (!confirm(`Ștergi definitiv utilizatorul "${username}"?`)) return;
    const { data, error } = await supabase.functions.invoke("admin-delete-user", {
      body: { user_id: id },
    });
    if (error || !data?.ok) {
      toast({
        title: "Eroare",
        description: data?.error || error?.message || "Eroare la ștergere",
        variant: "destructive",
      });
      return;
    }
    toast({ title: "Șters", description: `Utilizatorul ${username} a fost șters` });
    await loadUsers();
  };

  return (
    <div className="container max-w-4xl mx-auto px-4 py-8 space-y-8">
      <header>
        <h1 className="text-2xl font-bold">⚙️ Settings — Users</h1>
        <p className="text-sm text-muted-foreground">
          Gestionează utilizatorii și parolele lor. Doar owner-ul are acces.
        </p>
      </header>

      <section className="border border-border rounded-xl bg-card p-5 space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Adaugă client nou
        </h2>
        <form onSubmit={handleCreate} className="grid md:grid-cols-3 gap-3 items-end">
          <div className="space-y-1">
            <Label htmlFor="nu">Username</Label>
            <Input
              id="nu"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              placeholder="ex: client_8472"
              maxLength={32}
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="np">Parolă (min 8)</Label>
            <Input
              id="np"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={8}
              maxLength={128}
              required
            />
          </div>
          <Button type="submit" disabled={creating} className="font-bold">
            {creating ? "Creez..." : "➕ Creează client"}
          </Button>
        </form>
      </section>

      <section className="border border-border rounded-xl bg-card p-5 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Utilizatori existenți
        </h2>
        {loading ? (
          <p className="text-sm text-muted-foreground">Se încarcă...</p>
        ) : (
          <div className="space-y-2">
            {users.map((u) => (
              <div
                key={u.id}
                className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 border border-border"
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm">{u.username}</span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                      u.role === "owner"
                        ? "bg-primary/15 text-primary border-primary/30"
                        : "bg-accent/15 text-accent border-accent/30"
                    }`}
                  >
                    {u.role?.toUpperCase() ?? "—"}
                  </span>
                  {u.id === currentUser?.id && (
                    <span className="text-[10px] text-muted-foreground">(tu)</span>
                  )}
                </div>
                {u.id !== currentUser?.id && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDelete(u.id, u.username)}
                    className="text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default Settings;
