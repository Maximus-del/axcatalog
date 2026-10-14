// AX OS V2 — a CORS shim for garment photography.
//
// WHY THIS EXISTS
//
// A mockup preview is the garment photograph with the artwork flattened onto
// it, drawn on a <canvas> and read back out with toBlob(). Reading a canvas
// back requires every image on it to have been loaded with
// crossOrigin="anonymous", which requires the origin serving that image to
// send Access-Control-Allow-Origin.
//
// V2 blank photography is Google Drive links — v2_blank_images stores
// drive_url and nothing else, and Drive sends no such header. So the garment
// load threw, a catch swallowed it, and EVERY mockup preview and every
// downloaded PNG was the artwork alone on a dark square. Five mockups on five
// different garments produced byte-identical 20,451-byte files, which is how
// it was finally caught.
//
// This fetches the image server-side, where CORS does not apply, and re-serves
// it with the header the canvas needs.
//
// NOT AN OPEN PROXY. An endpoint that fetches any URL a caller names is an
// SSRF hole: it would happily read cloud metadata endpoints and private
// network addresses on behalf of a stranger. Only the hosts AX actually stores
// photography on are allowed through, and the allowlist is exact-match on the
// hostname rather than a suffix test — "drive.google.com.evil.tld" must not
// pass.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

/** Exactly the hosts AX stores garment and design photography on. */
const ALLOWED_HOSTS = new Set([
  "drive.google.com",
  "lh3.googleusercontent.com",
  "drive.usercontent.google.com",
  "cuidofxidstqpgypxcop.supabase.co",
]);

/** Only ever hand back images. A proxy that will relay text/html is a phishing tool. */
const ALLOWED_TYPES = /^image\//i;

const MAX_BYTES = 25 * 1024 * 1024;

function deny(message: string, status = 400): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") return deny("Use GET", 405);

  const target = new URL(req.url).searchParams.get("url");
  if (!target) return deny("A url parameter is required");

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return deny("That is not a URL");
  }

  if (parsed.protocol !== "https:") return deny("Only https is proxied");
  if (!ALLOWED_HOSTS.has(parsed.hostname)) return deny(`${parsed.hostname} is not a photography host AX uses`, 403);

  let upstream: Response;
  try {
    // `redirect: follow` is deliberate — Drive thumbnails redirect to
    // googleusercontent, which is on the allowlist anyway. The check above has
    // already constrained where the request STARTS, which is what stops a
    // caller choosing an internal address.
    upstream = await fetch(parsed.toString(), { redirect: "follow" });
  } catch (err) {
    return deny(`Could not reach ${parsed.hostname}: ${err instanceof Error ? err.message : "unknown error"}`, 502);
  }

  if (!upstream.ok) return deny(`${parsed.hostname} answered ${upstream.status}`, 502);

  const contentType = upstream.headers.get("content-type") ?? "";
  if (!ALLOWED_TYPES.test(contentType)) {
    // Drive serves an HTML interstitial instead of a 404 for a file that is not
    // shared publicly, so this is the common real failure and it deserves a
    // message that says what to fix.
    return deny(
      `${parsed.hostname} returned ${contentType || "no content type"} rather than an image — the file is probably not shared publicly`,
      502,
    );
  }

  const length = Number(upstream.headers.get("content-length") ?? 0);
  if (length > MAX_BYTES) return deny("That image is too large to proxy", 413);

  return new Response(upstream.body, {
    headers: {
      ...corsHeaders,
      "Content-Type": contentType,
      // Garment photography does not change. Cache hard, at the edge and in
      // the browser, so a run of thirteen colourways is not thirteen round
      // trips to Drive every time a preview re-renders.
      "Cache-Control": "public, max-age=86400, s-maxage=604800, immutable",
    },
  });
});
