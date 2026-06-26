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
  filename: z.string().trim().min(1).max(255).optional(),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: jsonHeaders,
    });
  }

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: parsed.error.flatten().fieldErrors }),
      { status: 400, headers: jsonHeaders },
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: "Server misconfigured" }), {
      status: 500,
      headers: jsonHeaders,
    });
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const safeName =
    (parsed.data.filename ?? "design.png")
      .replace(/[^\w.\-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(-80) || "design.png";
  const finalName = /\.png$/i.test(safeName) ? safeName : `${safeName}.png`;
  const path = `catalog-mockups/${crypto.randomUUID()}/${finalName}`;

  const { data, error } = await admin.storage
    .from("design-files")
    .createSignedUploadUrl(path);

  if (error || !data) {
    console.error("createSignedUploadUrl failed", error);
    return new Response(
      JSON.stringify({ error: error?.message ?? "Could not create upload URL" }),
      { status: 500, headers: jsonHeaders },
    );
  }

  return new Response(
    JSON.stringify({ path: data.path, token: data.token }),
    { status: 200, headers: jsonHeaders },
  );
});