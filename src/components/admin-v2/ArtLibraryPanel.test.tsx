// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

const uploadMutate = vi.fn(async (_: unknown) => ({ designId: "d-new" }));
const deleteMutate = vi.fn();
const items = [
  { fileId: "f1", designId: "d1", designTitle: "Set A", role: "front", inferred: false, bucket: "design-files", path: "d1/a.png", fileName: "front.png", createdAt: null, url: null },
  { fileId: "f2", designId: "d1", designTitle: "Set A", role: "back", inferred: false, bucket: "external", path: "https://drive", fileName: "back.png", createdAt: null, url: null },
];
vi.mock("@/lib/v2/art-library", async (orig) => {
  const real = await orig<typeof import("@/lib/v2/art-library")>();
  return {
    ...real,
    useClientArt: () => ({ data: items, isLoading: false }),
    useSetArtRole: () => ({ mutate: vi.fn() }),
    useUploadArt: () => ({ mutateAsync: uploadMutate, isPending: false }),
    useDeleteArt: () => ({ mutate: deleteMutate, isPending: false }),
  };
});
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { ArtLibraryPanel } from "./ArtLibraryPanel";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const renderPanel = () => {
  const container = document.createElement("div");
  document.body.replaceChildren(container);
  act(() => createRoot(container).render(
    <ArtLibraryPanel entities={[{ id: "c1", name: "Mooney", organizationId: "o1" } as never]} clientId="c1"
      onClientChange={() => {}} autoPair onAutoPairChange={() => {}} onPick={() => {}} activeFileIds={new Set()} />,
  ));
  return { container };
};
const click = (el: Element | null | undefined) => act(() => { (el as HTMLElement).click(); });
const byLabel = (l: string) => document.querySelector(`[aria-label="${l}"]`);
const btn = (name: string) => [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === name);

describe("ArtLibraryPanel files", () => {
  beforeEach(() => { uploadMutate.mockClear(); deleteMutate.mockClear(); });

  it("uploads images dropped from the computer, skipping non-images", async () => {
    const { container } = renderPanel();
    const png = new File(["x"], "logo.png", { type: "image/png" });
    const pdf = new File(["x"], "notes.pdf", { type: "application/pdf" });
    const zone = container.querySelector("section > div.relative") as HTMLElement;
    const ev = new Event("drop", { bubbles: true, cancelable: true }) as Event & { dataTransfer: unknown };
    ev.dataTransfer = { types: ["Files"], files: [png, pdf], items: [] };
    await act(async () => { zone.dispatchEvent(ev); await new Promise((r) => setTimeout(r, 20)); });
    expect(uploadMutate).toHaveBeenCalledTimes(1);
    expect((uploadMutate.mock.calls[0][0] as { file: File }).file.name).toBe("logo.png");
  });

  it("asks before deleting, then deletes that file", () => {
    renderPanel();
    click(byLabel("Delete front.png"));
    expect(deleteMutate).not.toHaveBeenCalled();
    click(btn("Delete"));
    expect(deleteMutate.mock.calls[0][0]).toMatchObject({ fileId: "f1" });
  });

  it("only unlinks Drive files", () => {
    renderPanel();
    click(byLabel("Delete back.png"));
    expect(btn("Remove")).toBeTruthy();
  });
});
