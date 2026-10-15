import { describe, expect, it } from "vitest";
import { sniffMime } from "../../../../supabase/functions/portal-files/sniff.ts";

const bytes = (...xs: (number | string)[]) =>
  new Uint8Array(xs.flatMap((x) => (typeof x === "string" ? [...x].map((c) => c.charCodeAt(0)) : [x])));

describe("upload content check (portal-files)", () => {
  it("recognises the accepted types by their bytes", () => {
    expect(sniffMime(bytes(0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a, 0, 0))).toBe("image/png");
    expect(sniffMime(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(sniffMime(bytes("GIF89a"))).toBe("image/gif");
    expect(sniffMime(bytes("RIFF", 0, 0, 0, 0, "WEBPVP8 "))).toBe("image/webp");
    expect(sniffMime(bytes("%PDF-1.7"))).toBe("application/pdf");
    expect(sniffMime(bytes(0, 0, 0, 0x18, "ftypheic"))).toBe("image/heic");
  });

  it("rejects things renamed to look like images", () => {
    expect(sniffMime(bytes("MZ", 0x90, 0))).toBeNull(); // Windows executable
    expect(sniffMime(bytes("<html><script>"))).toBeNull();
    expect(sniffMime(bytes("PK", 3, 4))).toBeNull(); // zip
    expect(sniffMime(new Uint8Array(0))).toBeNull();
  });
});
