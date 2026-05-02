// Owner-only: create a new client user (username + password).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.103.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function usernameToEmail(username: string): string {
  const safe = username.replace(/[^a-zA-Z0-9_]/g, "").toLowerCase();
  return `${safe}@local.app`;
}

function randomString(len: number, alphabet: string): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

function generateUsername(): string {
  return "client_" + randomString(6, "abcdefghijkmnpqrstuvwxyz23456789");
}

function generatePassword(): string {
  // 14 chars, mixed letters + digits + symbols
  const base = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const sym = "!@#$%&*?";
  return randomString(12, base) + randomString(2, sym);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claims } = await admin.auth.getClaims(token);
    const callerId = claims?.claims?.sub;
    if (!callerId) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify caller is owner
    const { data: rolesData } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId);
    if (!rolesData?.some((r) => r.role === "owner")) {
      return new Response(JSON.stringify({ ok: false, error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const accountType: "trial" | "premium" =
      body.account_type === "premium" ? "premium" : "trial";
    const trialDays = Number.isFinite(body.trial_days) ? Math.max(1, Math.min(365, Number(body.trial_days))) : 7;

    // Hybrid: owner may pass username/password; otherwise auto-generate
    let username = String(body.username ?? "").trim();
    let password = String(body.password ?? "");
    const autoUser = !username;
    const autoPass = !password;
    if (autoUser) username = generateUsername();
    if (autoPass) password = generatePassword();

    if (!/^[a-zA-Z0-9_]{3,32}$/.test(username)) {
      return new Response(
        JSON.stringify({ ok: false, error: "Username invalid (3-32 char, doar litere/cifre/underscore)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (password.length < 8 || password.length > 128) {
      return new Response(
        JSON.stringify({ ok: false, error: "Parola: minim 8 caractere" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Check duplicate
    const { data: existing } = await admin
      .from("profiles")
      .select("id")
      .eq("username", username)
      .maybeSingle();
    if (existing) {
      return new Response(
        JSON.stringify({ ok: false, error: "Username deja folosit" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const email = usernameToEmail(username);
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { username },
    });

    if (createErr || !created.user) {
      return new Response(
        JSON.stringify({ ok: false, error: createErr?.message ?? "Eroare la creare user" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const newUserId = created.user.id;
    const { error: roleErr } = await admin
      .from("user_roles")
      .insert({ user_id: newUserId, role: "client" });
    if (roleErr) {
      return new Response(
        JSON.stringify({ ok: false, error: roleErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Insert account_meta
    const expiresAt = accountType === "trial"
      ? new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000).toISOString()
      : null;
    await admin.from("account_meta").upsert({
      user_id: newUserId,
      account_type: accountType,
      expires_at: expiresAt,
      blocked: false,
    });

    // Audit
    const { data: actorProfile } = await admin
      .from("profiles").select("username").eq("id", callerId).maybeSingle();
    await admin.from("admin_audit_log").insert({
      actor_id: callerId,
      actor_username: actorProfile?.username ?? null,
      action: "create_user",
      target_user_id: newUserId,
      target_username: username,
      metadata: { account_type: accountType, expires_at: expiresAt },
    });

    return new Response(
      JSON.stringify({
        ok: true,
        user_id: newUserId,
        username,
        password, // shown ONCE to owner — never stored in plaintext
        account_type: accountType,
        expires_at: expiresAt,
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
