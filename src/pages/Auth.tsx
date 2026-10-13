import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";

const Auth = () => {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && session) {
      navigate("/", { replace: true });
    }
  }, [loading, session, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("login-guarded", {
        body: { username: username.trim(), password },
      });

      if (error || !data?.ok) {
        let msg = data?.message as string | undefined;
        const ctx = (error as { context?: Response } | null)?.context;
        if (!msg && ctx && typeof ctx.json === "function") {
          try {
            const body = await ctx.json();
            msg = body?.message;
          } catch {
            /* ignore */
          }
        }
        toast({ title: "Eroare", description: msg || "Autentificare eșuată", variant: "destructive" });
        return;
      }

      // Set session client-side
      const { error: setErr } = await supabase.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      });
      if (setErr) {
        toast({ title: "Eroare", description: setErr.message, variant: "destructive" });
        return;
      }

      toast({ title: "Bine ai venit!", description: `Logat ca ${username.trim()}` });
      navigate("/", { replace: true });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-5 border border-border rounded-xl bg-card p-6 shadow-xl"
      >
        <div className="text-center space-y-1">
          <span className="text-3xl">⚽</span>
          <h1 className="text-xl font-bold">BetAnalyzer AI</h1>
          <p className="text-xs text-muted-foreground">Autentificare securizată</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="username">Username</Label>
          <Input
            id="username"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            maxLength={32}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Parolă</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            maxLength={128}
            required
          />
        </div>

        <Button type="submit" className="w-full font-bold" disabled={submitting}>
          {submitting ? "Verific..." : "🔓 Autentificare"}
        </Button>

        <p className="text-[10px] text-muted-foreground text-center">
          Cont blocat 15 min după 3 încercări eșuate (clienți).
        </p>
      </form>
    </div>
  );
};

export default Auth;
