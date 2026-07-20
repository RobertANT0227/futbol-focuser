import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";

export type AppRole = "owner" | "client";
export type AccountType = "trial" | "premium";

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  username: string | null;
  role: AppRole | null;
  accountType: AccountType | null;
  expiresAt: string | null;
  loading: boolean;
  isOwner: boolean;
  isClient: boolean;
  isPremium: boolean;
  isTrial: boolean;
  signOut: () => Promise<void>;
  refreshRole: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [accountType, setAccountType] = useState<AccountType | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfileAndRole = async (uid: string) => {
    const [{ data: profile }, { data: roles }, { data: meta }] = await Promise.all([
      supabase.from("profiles").select("username").eq("id", uid).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", uid),
      supabase.from("account_meta").select("account_type, expires_at").eq("user_id", uid).maybeSingle(),
    ]);
    setUsername(profile?.username ?? null);
    if (roles?.some((r) => r.role === "owner")) setRole("owner");
    else if (roles?.some((r) => r.role === "client")) setRole("client");
    else setRole(null);
    setAccountType((meta?.account_type as AccountType) ?? null);
    setExpiresAt(meta?.expires_at ?? null);
  };

  useEffect(() => {
    // Set up listener FIRST
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user) {
        // Defer DB calls to avoid deadlock in callback
        setTimeout(() => loadProfileAndRole(sess.user.id), 0);
      } else {
        setUsername(null);
        setRole(null);
        setAccountType(null);
        setExpiresAt(null);
      }
    });

    // THEN check existing session
    supabase.auth.getSession().then(({ data: { session: sess } }) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user) {
        loadProfileAndRole(sess.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const refreshRole = async () => {
    if (user) await loadProfileAndRole(user.id);
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        username,
        role,
        accountType,
        expiresAt,
        loading,
        isOwner: role === "owner",
        isClient: role === "client",
        isPremium: role === "owner" || accountType === "premium",
        isTrial: role === "client" && accountType === "trial",
        signOut,
        refreshRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
