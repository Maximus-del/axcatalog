// AX OS V2 — getting a garment photograph onto a canvas.
//
// Drawing a mockup preview means putting the garment and the artwork on one
// <canvas> and reading it back out with toBlob(). The read-back is the hard
// part: a canvas that has had a cross-origin image drawn on it is TAINTED and
// toBlob() throws, unless that image was loaded with crossOrigin="anonymous"
// AND its host sent Access-Control-Allow-Origin.
//
// Supabase storage sends that header. Google Drive does not. V2 blank
// photography is entirely Drive links, so every preview and every download was
// silently losing its garment — see image-proxy for the full post-mortem.
//
// This module decides, per URL, whether it can be drawn directly or has to go
// through the proxy. It is pure so the decision is testable without a browser.

/** Hosts that already send the CORS header a canvas needs. */
const CORS_SAFE = /(^|\.)supabase\.co$/i;

/** Hosts the proxy is allowed to relay. Must stay in step with image-proxy. */
const PROXYABLE = new Set([
  "drive.google.com",
  "lh3.googleusercontent.com",
  "drive.usercontent.google.com",
]);

export type ImagePlan =
  | { kind: "direct"; url: string }
  | { kind: "proxy"; url: string }
  /** Nothing can be done: a data: URL, a blob:, a host nobody will relay. */
  | { kind: "asis"; url: string };

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/**
 * How to load this image so the canvas stays readable.
 *
 * `asis` is not a failure — a blob: or data: URL is same-origin by definition
 * and draws fine. It means "there is nothing to decide here".
 */
export function planFor(url: string): ImagePlan {
  if (url.startsWith("data:") || url.startsWith("blob:")) return { kind: "asis", url };

  const host = hostOf(url);
  if (!host) return { kind: "asis", url };
  if (CORS_SAFE.test(host)) return { kind: "direct", url };
  if (PROXYABLE.has(host)) return { kind: "proxy", url };

  // An unknown host might send the header — worth one direct attempt, and the
  // caller falls back if it throws.
  return { kind: "direct", url };
}

/**
 * The proxied address for an image.
 *
 * The anon key rides in the query string because an <img> src cannot carry a
 * header, which is also why the function is deployed with verify_jwt = false.
 * The key is already public — it ships in the client bundle.
 */
export function proxiedUrl(url: string, supabaseUrl: string, anonKey: string): string {
  const base = supabaseUrl.replace(/\/+$/, "");
  return `${base}/functions/v1/image-proxy?url=${encodeURIComponent(url)}&apikey=${encodeURIComponent(anonKey)}`;
}

/** True when a direct load is known to taint the canvas. */
export function needsProxy(url: string): boolean {
  return planFor(url).kind === "proxy";
}
