// Login with brute-force protection.
// Clients (non-owner) blocked for 15 min after 3 failed attempts.
// Owner has no limit.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_ATTEMPTS = 3;
const LOCKOUT_MINUTES = 15;

function usernameToEmail(username: string): string {
  // Sanitize: only allow [a-zA-Z0-9_]
  const safe = username.replace(/[^a-zA-Z0-9_]/g, "").toLowerCase();
  return `${safe}@local.app`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const username = String(body.username ?? "").trim();
    const normalizedUsername = username.toLowerCase();
    const password = String(body.password ?? "").trim();

    if (!username || !password || username.length > 64 || password.length > 128) {
      return new Response(
        JSON.stringify({ ok: false, error: "Invalid input" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Find user by username
    const { data: profile } = await admin
      .from("profiles")
      .select("id, username")
      .ilike("username", normalizedUsername)
      .maybeSingle();

    // Check if owner (no rate limit)
    let isOwner = false;
    if (profile) {
      const { data: roles } = await admin
        .from("user_roles")
        .select("role")
        .eq("user_id", profile.id);
      isOwner = !!roles?.some((r) => r.role === "owner");
    }

    // Check account_meta: blocked or expired
    if (profile && !isOwner) {
      const { data: meta } = await admin
        .from("account_meta")
        .select("blocked, blocked_reason, expires_at")
        .eq("user_id", profile.id)
        .maybeSingle();
      if (meta?.blocked) {
        return new Response(
          JSON.stringify({ ok: false, error: "blocked", message: meta.blocked_reason || "Cont blocat de administrator." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (meta?.expires_at && new Date(meta.expires_at).getTime() <= Date.now()) {
        return new Response(
          JSON.stringify({ ok: false, error: "expired", message: "Contul a expirat. Contactează administratorul." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // Apply rate limit only for non-owner
    if (!isOwner) {
      const cutoff = new Date(Date.now() - LOCKOUT_MINUTES * 60 * 1000).toISOString();
      const { data: recent } = await admin
        .from("login_attempts")
        .select("success, attempted_at")
        .ilike("username", normalizedUsername)
        .gte("attempted_at", cutoff)
        .order("attempted_at", { ascending: false });

      // Count consecutive failures (since last success or window start)
      let consecutiveFails = 0;
      for (const a of recent ?? []) {
        if (a.success) break;
        consecutiveFails++;
      }
      if (consecutiveFails >= MAX_ATTEMPTS) {
        const oldest = recent?.[Math.min(MAX_ATTEMPTS - 1, (recent?.length ?? 1) - 1)];
        const unlocksAt = oldest
          ? new Date(new Date(oldest.attempted_at).getTime() + LOCKOUT_MINUTES * 60 * 1000)
          : new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
        return new Response(
          JSON.stringify({
            ok: false,
            error: "locked",
            message: `Cont blocat. Reîncearcă după ${unlocksAt.toLocaleTimeString("ro-RO")}.`,
          }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // Attempt sign-in via anon client
    const anon = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
    );
    // Use the canonical email derived from username (since we control account creation)
    const loginEmail = usernameToEmail(normalizedUsername);
    const { data: signin, error: signinErr } = await anon.auth.signInWithPassword({
      email: loginEmail,
      password,
    });

    if (signinErr || !signin.session) {
      // Log failed attempt
      await admin.from("login_attempts").insert({ username: normalizedUsername, success: false });
      return new Response(
        JSON.stringify({ ok: false, error: "invalid_credentials", message: "Username sau parolă incorectă." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Log success
    await admin.from("login_attempts").insert({ username: normalizedUsername, success: true });

    return new Response(
      JSON.stringify({
        ok: true,
        session: {
          access_token: signin.session.access_token,
          refresh_token: signin.session.refresh_token,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
