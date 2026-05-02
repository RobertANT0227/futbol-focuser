// Owner-only: update account meta (upgrade/downgrade/block/unblock/extend) or reset password.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.103.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function randomString(len: number, alphabet: string): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}
function generatePassword(): string {
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
    const { data: rolesData } = await admin
      .from("user_roles").select("role").eq("user_id", callerId);
    if (!rolesData?.some((r) => r.role === "owner")) {
      return new Response(JSON.stringify({ ok: false, error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const targetId = String(body.user_id ?? "");
    const action = String(body.action ?? "");
    if (!targetId || !action) {
      return new Response(JSON.stringify({ ok: false, error: "user_id & action required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (targetId === callerId) {
      return new Response(JSON.stringify({ ok: false, error: "Nu te poți modifica pe tine" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: targetProfile } = await admin
      .from("profiles").select("username").eq("id", targetId).maybeSingle();
    const { data: actorProfile } = await admin
      .from("profiles").select("username").eq("id", callerId).maybeSingle();

    let result: Record<string, unknown> = { ok: true };
    let metadata: Record<string, unknown> = {};

    switch (action) {
      case "upgrade": {
        await admin.from("account_meta").upsert({
          user_id: targetId, account_type: "premium", expires_at: null, blocked: false,
        });
        metadata = { to: "premium" };
        break;
      }
      case "downgrade": {
        const days = Number.isFinite(body.trial_days) ? Math.max(1, Math.min(365, Number(body.trial_days))) : 7;
        const exp = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
        await admin.from("account_meta").upsert({
          user_id: targetId, account_type: "trial", expires_at: exp, blocked: false,
        });
        metadata = { to: "trial", expires_at: exp };
        break;
      }
      case "extend": {
        const days = Number.isFinite(body.days) ? Math.max(1, Math.min(365, Number(body.days))) : 7;
        const { data: cur } = await admin.from("account_meta").select("expires_at").eq("user_id", targetId).maybeSingle();
        const base = cur?.expires_at && new Date(cur.expires_at).getTime() > Date.now()
          ? new Date(cur.expires_at).getTime()
          : Date.now();
        const exp = new Date(base + days * 24 * 60 * 60 * 1000).toISOString();
        await admin.from("account_meta").upsert({
          user_id: targetId, expires_at: exp,
        });
        metadata = { extended_days: days, new_expires_at: exp };
        break;
      }
      case "block": {
        const reason = String(body.reason ?? "Blocat de owner");
        await admin.from("account_meta").upsert({
          user_id: targetId, blocked: true, blocked_reason: reason,
        });
        metadata = { reason };
        break;
      }
      case "unblock": {
        await admin.from("account_meta").upsert({
          user_id: targetId, blocked: false, blocked_reason: null,
        });
        // Also clear failed login attempts
        if (targetProfile?.username) {
          await admin.from("login_attempts").delete().eq("username", targetProfile.username);
        }
        break;
      }
      case "reset_password": {
        const newPass = generatePassword();
        const { error } = await admin.auth.admin.updateUserById(targetId, { password: newPass });
        if (error) {
          return new Response(JSON.stringify({ ok: false, error: error.message }), {
            status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        result = { ok: true, password: newPass };
        break;
      }
      default:
        return new Response(JSON.stringify({ ok: false, error: "Unknown action" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    await admin.from("admin_audit_log").insert({
      actor_id: callerId,
      actor_username: actorProfile?.username ?? null,
      action,
      target_user_id: targetId,
      target_username: targetProfile?.username ?? null,
      metadata,
    });

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});