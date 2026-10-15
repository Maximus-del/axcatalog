import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
const uploadToSignedUrl = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: (...a: unknown[]) => invoke(...a) },
    storage: { from: () => ({ uploadToSignedUrl: (...a: unknown[]) => uploadToSignedUrl(...a) }) },
  },
}));

import { uploadFile } from "./studio";

const scope = { athleteId: "a", organizationId: "o", viewingAs: false };
const file = (type = "image/png", size = 2048) => ({ name: "ref.png", type, size }) as unknown as File;
const err = (status: number, code: string, message = "x") => ({
  data: null,
  error: { message, context: { status, json: () => Promise.resolve({ code, message, requestId: "r" }) } },
});

beforeEach(() => {
  vi.useFakeTimers();
  invoke.mockReset();
  uploadToSignedUrl.mockReset();
});

async function run<T>(p: Promise<T>): Promise<T> {
  // Observe the outcome first so a rejection is never "unhandled", then let
  // the retry backoffs elapse.
  const settled = p.then(
    (v) => ({ ok: true as const, v }),
    (e: unknown) => ({ ok: false as const, e }),
  );
  for (let i = 0; i < 20; i++) await vi.advanceTimersByTimeAsync(2000);
  const r = await settled;
  if ("e" in r) throw r.e;
  return r.v;
}

describe("uploads: failed and retried", () => {
  it("happy path: begin → PUT → complete", async () => {
    invoke
      .mockResolvedValueOnce({ data: { uploadId: "u1", path: "a/general/u1/ref.png", token: "t" }, error: null })
      .mockResolvedValueOnce({ data: { status: "finalized" }, error: null });
    uploadToSignedUrl.mockResolvedValueOnce({ error: null });
    await expect(run(uploadFile(scope, file(), "inspiration"))).resolves.toEqual({ uploadId: "u1", name: "ref.png" });
    expect((invoke.mock.calls[0][1] as { body: Record<string, unknown> }).body).toMatchObject({ action: "begin_upload", mime: "image/png", size: 2048 });
  });

  it("a failed PUT is retried, then succeeds", async () => {
    invoke
      .mockResolvedValueOnce({ data: { uploadId: "u2", path: "p", token: "t" }, error: null })
      .mockResolvedValueOnce({ data: { status: "finalized" }, error: null });
    uploadToSignedUrl.mockResolvedValueOnce({ error: { message: "network" } }).mockResolvedValueOnce({ error: null });
    await expect(run(uploadFile(scope, file(), "attachment"))).resolves.toMatchObject({ uploadId: "u2" });
    expect(uploadToSignedUrl).toHaveBeenCalledTimes(2);
  });

  it("'not uploaded yet' (409) on complete is retried", async () => {
    invoke
      .mockResolvedValueOnce({ data: { uploadId: "u3", path: "p", token: "t" }, error: null })
      .mockResolvedValueOnce(err(409, "not_uploaded"))
      .mockResolvedValueOnce({ data: { status: "finalized" }, error: null });
    uploadToSignedUrl.mockResolvedValueOnce({ error: null });
    await expect(run(uploadFile(scope, file(), "attachment"))).resolves.toMatchObject({ uploadId: "u3" });
  });

  it("a file the server rejects (422) is final — no retry, no attachable id", async () => {
    invoke
      .mockResolvedValueOnce({ data: { uploadId: "u4", path: "p", token: "t" }, error: null })
      .mockResolvedValueOnce(err(422, "P0422", "That file isn't what it says it is."));
    uploadToSignedUrl.mockResolvedValueOnce({ error: null });
    await expect(run(uploadFile(scope, file(), "attachment"))).rejects.toMatchObject({ status: 422 });
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it("PUT fails every time → clear error, never 'completes'", async () => {
    invoke.mockResolvedValueOnce({ data: { uploadId: "u5", path: "p", token: "t" }, error: null });
    uploadToSignedUrl.mockResolvedValue({ error: { message: "network" } });
    await expect(run(uploadFile(scope, file(), "attachment"))).rejects.toMatchObject({ status: 503 });
    expect(invoke).toHaveBeenCalledTimes(1); // complete never called
  });

  it("wrong type or size is refused before anything is sent", async () => {
    await expect(uploadFile(scope, file("image/svg+xml"), "attachment")).rejects.toMatchObject({ status: 422 });
    await expect(uploadFile(scope, file("image/png", 11 * 1024 * 1024), "attachment")).rejects.toMatchObject({ status: 422 });
    expect(invoke).not.toHaveBeenCalled();
  });
});
