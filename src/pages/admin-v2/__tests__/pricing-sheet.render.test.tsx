// @vitest-environment jsdom
//
// The pricing sheet's spreadsheet behaviour, in a real DOM: presets fill rows,
// a drag selects a block of cells, typing a number fills them all, Delete puts
// them back on their preset, and Save sends exactly the changed rows.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PricingSheet, SheetProduct } from "@/lib/v2/pricing-sheet";

const TEE = "tee-blank";
const HOOD = "hood-blank";
const mk = (id: string, over: Partial<SheetProduct> = {}): SheetProduct => ({
  id,
  title: id,
  status: "published",
  garment: "tee",
  onShopify: false,
  blankId: TEE,
  blankName: "DRI EASE OVERSIZED TEE",
  blankCatalogCost: 12,
  detectedSides: "front_back",
  retail: 45,
  athletePrice: null,
  ruleAthletePrice: 18,
  pricing: { blankCost: null, printCost: null, otherCost: null, clientPrice: null, sharePercent: null, printSides: null, notes: "" },
  ...over,
});

const SHEET: PricingSheet = {
  products: [
    mk("Signature Jersey #11 Tee"),
    mk("WRLD #11 Tee V1", { detectedSides: "front" }),
    mk("WRLD #11 Hoodie", { garment: "hoodie", blankId: HOOD, blankName: "Garment-Wash Hoodie 14oz", blankCatalogCost: 22.25, retail: 65, ruleAthletePrice: 35 }),
  ],
  // Chase's example: blank $12 → $18, front $2 → $5, back $2 → $3; AX keeps 10% of the profit.
  terms: { revenueSharePercent: 90, payoutSchedule: "", note: "", splitBasis: "profit", paymentInstructions: "" },
  presets: {
    [TEE]: { blank: { cost: 12, price: 18 }, front: { cost: 2, price: 5 }, back: { cost: 2, price: 3 }, services: { cost: null, price: null } },
    [HOOD]: { blank: { cost: null, price: null }, front: { cost: null, price: null }, back: { cost: null, price: null }, services: { cost: null, price: null } },
  },
};

const saveSheet = vi.fn().mockResolvedValue(1);

vi.mock("@/lib/v2/pricing-sheet", async (orig) => {
  const actual = await orig<typeof import("@/lib/v2/pricing-sheet")>();
  return {
    ...actual,
    usePricingSheet: () => ({ data: SHEET, isLoading: false, isError: false, refetch: vi.fn().mockResolvedValue({}) }),
    useSavePricingSheet: () => ({ mutateAsync: saveSheet, isPending: false }),
  };
});
vi.mock("@/lib/v2/brand-terms", async (orig) => {
  const actual = await orig<typeof import("@/lib/v2/brand-terms")>();
  return { ...actual, useSaveBrandTerms: () => ({ mutateAsync: vi.fn(), isPending: false }) };
});
vi.mock("@/lib/v2/data", () => ({ useEntityWorkspace: () => ({ data: { entity: { name: "Darnell Mooney" } } }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import V2PricingSheet from "../V2PricingSheet";

let root: Root;
let host: HTMLDivElement;

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => (cb(0), 0);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={["/admin-v2/people/e1/pricing"]}>
          <Routes>
            <Route path="/admin-v2/people/:id/pricing" element={<V2PricingSheet />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  });
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  saveSheet.mockClear();
});

const text = () => host.textContent ?? "";
const rowOf = (title: string) => [...host.querySelectorAll("tr")].find((tr) => tr.textContent?.includes(title))!;
/** The selectable cells of a row, in column order: blank, print, services, client price, retail, share. */
const cells = (title: string) => [...rowOf(title).querySelectorAll<HTMLElement>('[role="gridcell"]')];
const fire = (el: EventTarget, type: string, init: MouseEventInit = {}) =>
  act(() => {
    el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, ...init }));
  });

describe("pricing sheet", () => {
  it("groups by blank and costs each row from its presets", () => {
    expect(text()).toContain("Unit economics");
    const groups = [...host.querySelectorAll("section h2")].map((h) => h.textContent).filter((t) => t !== "Unit economics");
    expect(groups[0]).toContain("DRI EASE OVERSIZED TEE");
    expect(groups[1]).toContain("Garment-Wash Hoodie 14oz");
    // Front + back tee: $2 + $2 print, $18 + $5 + $3 = $26 to the client; front-only: $2 print, $23.
    expect(cells("Signature Jersey #11 Tee")[1].textContent).toContain("$4.00");
    expect(cells("Signature Jersey #11 Tee")[3].textContent).toContain("$26.00");
    expect(cells("WRLD #11 Tee V1")[1].textContent).toContain("$2.00");
    expect(cells("WRLD #11 Tee V1")[3].textContent).toContain("$23.00");
    // The store sale: $45 − $26 = $19 profit, client keeps 90% ($17.10), AX total $11.90.
    expect(rowOf("Signature Jersey #11 Tee").textContent).toContain("$17.10");
    expect(rowOf("Signature Jersey #11 Tee").textContent).toContain("$11.90");
    // The portal still charges the rule until Save.
    expect(text()).toContain("2 portal prices will update");
  });

  it("drag-selects a block, fills it with one value, and Delete puts it back on the preset", async () => {
    const a = cells("Signature Jersey #11 Tee")[1];
    const b = cells("WRLD #11 Tee V1")[1];
    fire(a, "mousedown");
    // React builds onMouseEnter from mouseover + relatedTarget.
    fire(a, "mouseout", { relatedTarget: b });
    fire(window, "mouseup");
    expect(text()).toContain("2 cells");

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "7", bubbles: true }));
    });
    const form = host.querySelector("form")!;
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(cells("Signature Jersey #11 Tee")[1].textContent).toContain("$7.00");
    expect(cells("WRLD #11 Tee V1")[1].textContent).toContain("$7.00");
    expect(text()).toContain("2 changes not saved");
    expect(cells("Signature Jersey #11 Tee")[1].textContent).toContain("$7.00");

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true }));
    });
    expect(cells("Signature Jersey #11 Tee")[1].textContent).toContain("$4.00");
    expect(text()).not.toContain("not saved");
  });

  it("clicking a column name selects that column in the group, and Save sends only changed rows", async () => {
    const header = [...host.querySelectorAll("th")].find((th) => th.textContent === "Retail")!;
    fire(header, "click");
    expect(text()).toContain("2 cells");
    const input = host.querySelector<HTMLInputElement>('input[placeholder="Value for all"]')!;
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      set.call(input, "50");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    const save = [...host.querySelectorAll("button")].find((x) => x.textContent?.trim() === "Save")!;
    await act(async () => {
      save.click();
    });
    expect(saveSheet).toHaveBeenCalledTimes(1);
    const arg = saveSheet.mock.calls[0][0];
    expect(arg.changes.map((c: { product: SheetProduct }) => c.product.id).sort()).toEqual(["Signature Jersey #11 Tee", "WRLD #11 Tee V1"]);
    expect(arg.changes.every((c: { draft: { retail: number } }) => c.draft.retail === 50)).toBe(true);
    // And the client prices the presets produce go to the portal.
    expect(arg.prices.map((x: { athletePrice: number }) => x.athletePrice).sort()).toEqual([23, 26]);
  });

  it("a preset edit re-costs and re-prices every row on that blank", async () => {
    const card = [...host.querySelectorAll(".ax-card")].find((c) => c.querySelector("h3")?.textContent === "DRI EASE OVERSIZED TEE")!;
    const backRow = [...card.querySelectorAll("tr")].find((tr) => tr.textContent?.startsWith("Back print"))!;
    const [backCost, backPrice] = backRow.querySelectorAll("input");
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await act(async () => {
      set.call(backCost, "3");
      backCost.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      set.call(backPrice, "4");
      backPrice.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(cells("Signature Jersey #11 Tee")[1].textContent).toContain("$5.00");
    expect(cells("Signature Jersey #11 Tee")[3].textContent).toContain("$27.00");
    expect(cells("WRLD #11 Tee V1")[1].textContent).toContain("$2.00");
    expect(cells("WRLD #11 Tee V1")[3].textContent).toContain("$23.00");
  });
});
