import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

const BodySchema = z.object({
  path: z.string().trim().min(1).max(1000),
});

function normalizeDesignPath(input: string): string {
  let path = input.trim();
  const marker = "/design-files/";
  const idx = path.indexOf(marker);
  if (idx !== -1) path = path.slice(idx + marker.length);
  const q = path.indexOf("?");
  if (q !== -1) path = path.slice(0, q);
  path = path.replace(/^\/+/, "");
  if (path.startsWith("design-files/")) path = path.slice("design-files/".length);
  return path;
}

function jsonRes(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: jsonHeaders });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonRes({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceKey) {
      return jsonRes({ error: "Server misconfigured" }, 500);
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return jsonRes({ error: "Unauthorized" }, 401);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: authHeader } },
    });
    const { data: isAdmin, error: adminErr } = await userClient.rpc(
      "current_user_is_admin",
    );
    if (adminErr) {
      console.error("admin check failed", adminErr);
      return jsonRes({ error: adminErr.message }, 400);
    }
    if (isAdmin !== true) {
      return jsonRes({ error: "Forbidden — admin only" }, 403);
    }

    let payload: unknown;
    try {
      payload = await req.json();
    } catch {
      return jsonRes({ error: "Invalid JSON" }, 400);
    }
    const parsed = BodySchema.safeParse(payload);
    if (!parsed.success) {
      return jsonRes({ error: parsed.error.flatten().fieldErrors }, 400);
    }

    const path = normalizeDesignPath(parsed.data.path);
    if (!path) return jsonRes({ error: "Missing design path" }, 400);

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await admin.storage
      .from("design-files")
      .createSignedUrl(path, 3600);

    if (error || !data?.signedUrl) {
      console.error("createSignedUrl failed", error, path);
      return jsonRes({ error: error?.message ?? "Could not load design" }, 400);
    }

    return jsonRes({ signedUrl: data.signedUrl });
  } catch (error) {
    console.error("design-signed-url error", error);
    return jsonRes(
      { error: error instanceof Error ? error.message : String(error) },
      400,
    );
  }
});