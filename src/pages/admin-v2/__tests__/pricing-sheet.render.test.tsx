// @vitest-environment jsdom
//
// The pricing sheet in a real DOM: products on the same blank and print collapse
// to one line that opens to its products; print type is a locked tag; a drag
// selects cells, typing fills them, Delete returns them to the preset; products
// with no blank are ticked and put on one; Save sends exactly what changed.
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
    mk("Unleashed #11 Tee"),
    mk("WRLD #11 Tee V1", { detectedSides: "front" }),
    mk("WRLD #11 Hoodie", { garment: "hoodie", blankId: HOOD, blankName: "Garment-Wash Hoodie 14oz", blankCatalogCost: 22.25, retail: 65, ruleAthletePrice: 35 }),
    mk("Comic Book Tee", { blankId: null, blankName: null, blankCatalogCost: null, detectedSides: null, onShopify: true, retail: 50 }),
    mk("All-Access Black Tee", { blankId: null, blankName: null, blankCatalogCost: null, detectedSides: null, onShopify: true, retail: 40 }),
  ],
  // Chase's example: blank $12 → $18, front $2 → $5, back $2 → $3; AX keeps 10% of the profit.
  terms: { revenueSharePercent: 90, payoutSchedule: "", note: "", splitBasis: "profit", paymentInstructions: "" },
  presets: {
    [TEE]: { blank: { cost: 12, price: 18 }, front: { cost: 2, price: 5 }, back: { cost: 2, price: 3 }, services: { cost: null, price: null } },
    [HOOD]: { blank: { cost: null, price: null }, front: { cost: null, price: null }, back: { cost: null, price: null }, services: { cost: null, price: null } },
  },
};

const saveSheet = vi.fn().mockResolvedValue(1);
const assignBlank = vi.fn();

vi.mock("@/lib/v2/pricing-sheet", async (orig) => {
  const actual = await orig<typeof import("@/lib/v2/pricing-sheet")>();
  return {
    ...actual,
    usePricingSheet: () => ({ data: SHEET, isLoading: false, isError: false, refetch: vi.fn().mockResolvedValue({}) }),
    useSavePricingSheet: () => ({ mutateAsync: saveSheet, isPending: false }),
    useBlankOptions: () => ({ data: [{ id: TEE, name: "DRI EASE OVERSIZED TEE", garmentType: "tee", cost: 12 }] }),
    useAssignBlank: () => ({ mutate: assignBlank, isPending: false }),
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
  assignBlank.mockClear();
});

const text = () => host.textContent ?? "";
const button = (label: string) => [...host.querySelectorAll("button")].find((b) => b.textContent?.trim() === label)!;
const click = async (el: Element) => {
  await act(async () => {
    (el as HTMLElement).click();
  });
};
const openAll = () => click(button("Open all"));
const rowOf = (title: string) => [...host.querySelectorAll("tr")].find((tr) => tr.querySelector("a")?.textContent === title)!;
/** The selectable cells of a product row, in column order: blank, print, services, client price, retail, share. */
const cells = (title: string) => [...rowOf(title).querySelectorAll<HTMLElement>('[role="gridcell"]')];
const fire = (el: EventTarget, type: string, init: MouseEventInit = {}) =>
  act(() => {
    el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, ...init }));
  });
const setInput = async (el: HTMLInputElement | HTMLSelectElement, v: string) => {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, v);
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
};

describe("pricing sheet", () => {
  it("collapses each blank to one line per print type, with the shared breakdown", () => {
    // Products are closed by default: the line carries the numbers.
    expect(host.querySelector('a[href="/admin-v2/products/Signature Jersey #11 Tee"]')).toBeNull();
    const fb = [...host.querySelectorAll("tr[aria-expanded]")].find((tr) => tr.textContent?.includes("Front + back") && tr.textContent.includes("2 products"))!;
    expect(fb).toBeTruthy();
    // $16 true cost, $26 client price, $10 AX/unit; $45 sale: $19 profit, $17.10 to Mooney, $11.90 to AX.
    for (const v of ["$16.00", "$26.00", "$10.00", "$19.00", "$17.10", "$1.90", "$11.90"]) expect(fb.textContent).toContain(v);
    const front = [...host.querySelectorAll("tr[aria-expanded]")].find((tr) => tr.textContent?.startsWith("Front") && !tr.textContent.includes("+ back"))!;
    expect(front.textContent).toContain("$23.00");
    expect(text()).toContain("3 portal prices will update");
  });

  it("opens a line to its products, where print type is a locked tag", async () => {
    const fb = [...host.querySelectorAll("tr[aria-expanded]")].find((tr) => tr.textContent?.includes("2 products"))!;
    await click(fb);
    expect(rowOf("Signature Jersey #11 Tee")).toBeTruthy();
    expect(rowOf("Unleashed #11 Tee")).toBeTruthy();
    // No toggle: nothing on the row lets you flip front / front + back.
    expect(rowOf("Signature Jersey #11 Tee").querySelector('[role="group"][aria-label="Print"]')).toBeNull();
    expect(rowOf("Signature Jersey #11 Tee").textContent).toContain("Front + back");
  });

  it("a product changed on its own shows as custom on its line, and Delete puts it back", async () => {
    await openAll();
    const a = cells("Signature Jersey #11 Tee")[3];
    fire(a, "mousedown");
    fire(window, "mouseup");
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "3", bubbles: true }));
    });
    const input = host.querySelector<HTMLInputElement>('input[placeholder="Value for all"]')!;
    await setInput(input, "30");
    await act(async () => {
      host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(cells("Signature Jersey #11 Tee")[3].textContent).toContain("$30.00");
    expect(text()).toContain("1 custom");
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true }));
    });
    expect(cells("Signature Jersey #11 Tee")[3].textContent).toContain("$26.00");
    expect(text()).not.toContain("1 custom");
  });

  it("drag-selects across products and fills them with one value", async () => {
    await openAll();
    const a = cells("Signature Jersey #11 Tee")[1];
    const b = cells("Unleashed #11 Tee")[1];
    fire(a, "mousedown");
    fire(a, "mouseout", { relatedTarget: b });
    fire(window, "mouseup");
    expect(text()).toContain("2 cells");
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "7", bubbles: true }));
    });
    await act(async () => {
      host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(cells("Signature Jersey #11 Tee")[1].textContent).toContain("$7.00");
    expect(cells("Unleashed #11 Tee")[1].textContent).toContain("$7.00");
    await click(button("Save"));
    const arg = saveSheet.mock.calls[0][0];
    expect(arg.changes.map((c: { product: SheetProduct }) => c.product.id).sort()).toEqual(["Signature Jersey #11 Tee", "Unleashed #11 Tee"]);
    expect(arg.prices.map((x: { athletePrice: number }) => x.athletePrice).sort()).toEqual([23, 26, 26]);
  });

  it("ticks products with no blank and assigns them to one", async () => {
    expect(text()).toContain("No blank linked");
    const boxes = [...host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
    await click(boxes.find((b) => b.getAttribute("aria-label") === "Select all products with no blank")!);
    expect(text()).toContain("2 selected");
    await setInput(host.querySelector<HTMLSelectElement>('select[aria-label="Blank"]')!, TEE);
    await setInput(host.querySelector<HTMLSelectElement>('select[aria-label="Print"]')!, "front_back");
    await click(button("Assign 2"));
    expect(assignBlank).toHaveBeenCalledTimes(1);
    expect(assignBlank.mock.calls[0][0]).toEqual({
      productIds: expect.arrayContaining(["Comic Book Tee", "All-Access Black Tee"]),
      blankId: TEE,
      sides: "front_back",
    });
  });

  it("a preset edit re-prices the whole line", async () => {
    const card = [...host.querySelectorAll(".ax-card")].find((c) => c.querySelector("h3")?.textContent === "DRI EASE OVERSIZED TEE")!;
    const backRow = [...card.querySelectorAll("tr")].find((tr) => tr.textContent?.startsWith("Back print"))!;
    const [, backPrice] = backRow.querySelectorAll("input");
    await setInput(backPrice, "4");
    const fb = [...host.querySelectorAll("tr[aria-expanded]")].find((tr) => tr.textContent?.includes("2 products"))!;
    expect(fb.textContent).toContain("$27.00");
  });
});
