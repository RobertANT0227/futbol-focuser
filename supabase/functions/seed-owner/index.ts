// Seed the owner account (RobertANT). Idempotent: only creates if not present.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const OWNER_USERNAME = "RobertANT";
const OWNER_EMAIL = "robertant@local.app";
const OWNER_PASSWORD = "Baterie212!";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Check if owner profile already exists
    const { data: existingProfile } = await admin
      .from("profiles")
      .select("id")
      .eq("username", OWNER_USERNAME)
      .maybeSingle();

    if (existingProfile) {
      return new Response(
        JSON.stringify({ ok: true, status: "already_seeded" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Create user via admin API (auto-confirmed)
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: OWNER_EMAIL,
      password: OWNER_PASSWORD,
      email_confirm: true,
      user_metadata: { username: OWNER_USERNAME },
    });

    if (createErr || !created.user) {
      // Account may already exist in auth (profile row missing/not yet visible) — not fatal.
      const { data: list } = await admin.auth.admin.listUsers();
      const existing = list?.users?.find((u) => u.email === OWNER_EMAIL);
      if (existing) {
        await admin.from("profiles").upsert({ id: existing.id, username: OWNER_USERNAME });
        await admin.from("user_roles").upsert(
          { user_id: existing.id, role: "owner" },
          { onConflict: "user_id,role" },
        );
        return new Response(
          JSON.stringify({ ok: true, status: "already_seeded" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({ ok: false, error: createErr?.message ?? "create failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Assign owner role
    const { error: roleErr } = await admin
      .from("user_roles")
      .insert({ user_id: created.user.id, role: "owner" });

    if (roleErr) {
      return new Response(
        JSON.stringify({ ok: false, error: roleErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ ok: true, status: "seeded", user_id: created.user.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
