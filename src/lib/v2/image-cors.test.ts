import { describe, expect, it } from "vitest";
import { needsProxy, planFor, proxiedUrl } from "./image-cors";

const SB = "https://cuidofxidstqpgypxcop.supabase.co";

describe("deciding how to load a garment photograph", () => {
  it("loads Supabase storage directly — it already sends the CORS header", () => {
    expect(planFor(`${SB}/storage/v1/object/public/blanks/hoodie.png`).kind).toBe("direct");
  });

  it("proxies a Google Drive thumbnail, which is why previews lost their garment", () => {
    expect(planFor("https://drive.google.com/thumbnail?id=1abc").kind).toBe("proxy");
    expect(needsProxy("https://drive.google.com/thumbnail?id=1abc")).toBe(true);
  });

  it("proxies the googleusercontent host Drive redirects to", () => {
    expect(planFor("https://lh3.googleusercontent.com/d/1abc").kind).toBe("proxy");
  });

  it("leaves data and blob URLs alone — they cannot taint anything", () => {
    expect(planFor("data:image/png;base64,AAAA").kind).toBe("asis");
    expect(planFor("blob:https://example.test/abc").kind).toBe("asis");
  });

  it("does not choke on a string that is not a URL", () => {
    expect(planFor("not a url").kind).toBe("asis");
  });

  it("gives an unknown host one direct attempt rather than refusing it", () => {
    expect(planFor("https://cdn.example.test/shirt.png").kind).toBe("direct");
  });

  it("is not fooled by a lookalike hostname", () => {
    // The allowlist is exact-match. A suffix test would relay this.
    expect(needsProxy("https://drive.google.com.evil.tld/thumbnail?id=1")).toBe(false);
    expect(planFor("https://notsupabase.co.evil.tld/x.png").kind).toBe("direct");
  });

  it("treats a subdomain of supabase.co as CORS-safe but not a lookalike", () => {
    expect(planFor("https://abc.supabase.co/x.png").kind).toBe("direct");
    expect(planFor("https://evilsupabase.co.attacker.tld/x.png").kind).toBe("direct");
  });
});

describe("the proxied address", () => {
  const url = proxiedUrl("https://drive.google.com/thumbnail?id=1abc&sz=w1000", SB, "anon-key");

  it("points at the edge function", () => {
    expect(url).toContain(`${SB}/functions/v1/image-proxy`);
  });

  it("escapes the target so its own query string is not lost", () => {
    expect(url).toContain(encodeURIComponent("https://drive.google.com/thumbnail?id=1abc&sz=w1000"));
    expect(url).not.toContain("&sz=w1000&");
  });

  it("carries the key in the query, because an img tag cannot send a header", () => {
    expect(url).toContain("apikey=anon-key");
  });

  it("does not double the slash when the base has a trailing one", () => {
    expect(proxiedUrl("https://drive.google.com/x", `${SB}/`, "k")).toContain(`${SB}/functions/v1/image-proxy`);
    expect(proxiedUrl("https://drive.google.com/x", `${SB}/`, "k")).not.toContain("co//functions");
  });
});
