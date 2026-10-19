// @vitest-environment jsdom
//
// AX STUDIO OS — the shell and the two promises the integration makes:
//   1. seven sections, every one a real route, and old Creative shelf links
//      land in the Asset Library with their filters;
//   2. View Portal is the real portal address (/portal?as=<id>, new tab),
//      not a preview, and is separate from editing the client.

import { act, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const q = (data: unknown) => ({ data, isLoading: false, isError: false, error: null, refetch: vi.fn() });
const m = () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false });

const entity = {
  id: "e1",
  organizationId: "o1",
  name: "Darnell Mooney",
  slug: "darnell-mooney",
  entityType: "person",
  roles: ["athlete"],
  status: "active",
  position: "WR",
  league: "NFL",
  avatarUrl: null,
  teamName: null,
  primaryContact: null,
  createdAt: "2026-04-16T00:00:00Z",
  website: null,
  category: null,
  hasOwnOrg: true,
  orgName: "Mooney",
  isDemo: false,
  counts: { collections: 1, concepts: 2, designs: 3, products: 4, liveProducts: 1 },
};

vi.mock("@/lib/v2/data", () => ({
  useOverview: () => q({ actions: [], stats: {}, recentEntities: [entity], recentConcepts: [], recentOrders: [], openOrders: 0 }),
  useConcepts: () => q([]),
  useBlanks: () => q([]),
  useDesigns: () => q([]),
  useEntities: () => q([entity]),
  useUnassignedDesigns: () => q([]),
  useUploadToInbox: () => m(),
  useAssignDesigns: () => m(),
  useUnassignDesigns: () => m(),
  useV2Search: () => q([]),
  SEARCH_KIND_LABEL: {},
}));
vi.mock("@/lib/v2/desk", async (orig) => ({
  ...(await orig<typeof import("@/lib/v2/desk")>()),
  useDeskWaitingCount: () => 2,
}));
vi.mock("@/lib/v2/work", async (orig) => ({
  ...(await orig<typeof import("@/lib/v2/work")>()),
  useOpenTaskCount: () => 3,
}));
vi.mock("@/lib/storage", () => ({ useSignedUrl: () => ({ url: null, loading: false }) }));

import V2Layout from "@/components/admin-v2/V2Layout";
import V2Creative from "../V2Creative";
import { entityPortalHref } from "@/lib/v2/entity-nav";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()?.();
});

function mount(ui: ReactElement, route: string): HTMLElement {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  act(() => {
    root.render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[route]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          {ui}
        </MemoryRouter>
      </QueryClientProvider>,
    );
  });
  cleanups.push(() => {
    act(() => root.unmount());
    el.remove();
  });
  return el;
}

function Where() {
  const loc = useLocation();
  return <output data-testid="where">{loc.pathname + loc.search}</output>;
}

describe("the Studio OS shell", () => {
  it("shows the seven approved sections and keeps the V1 way back", () => {
    const el = mount(
      <Routes>
        <Route path="/admin-v2" element={<V2Layout />}>
          <Route index element={<p>today body</p>} />
        </Route>
      </Routes>,
      "/admin-v2",
    );
    const desktopNav = el.querySelector('aside nav[aria-label="AX Studio OS sections"]');
    const labels = [...(desktopNav?.querySelectorAll("a.ax-rail-link") ?? [])].map((a) => a.textContent?.replace(/\d+$/, "").trim());
    expect(labels).toEqual([
      "Today",
      "Projects & Tasks",
      "Client Spaces",
      "Creative Studio",
      "Asset Library",
      "Releases",
      "Business",
    ]);
    // Client requests (the Desk) kept a home under Projects & Tasks.
    expect(el.querySelector('a[href="/admin-v2/desk"]')).not.toBeNull();
    expect(el.querySelector('a[href="/admin"]')).not.toBeNull();
    // The light theme is scoped to V2.
    expect(el.querySelector(".admin-os.ax-studio")).not.toBeNull();
    expect(el.querySelector('main[data-section="today"]')).not.toBeNull();
  });

  it("lights Business for the old commerce and orders addresses", () => {
    const el = mount(
      <Routes>
        <Route path="/admin-v2" element={<V2Layout />}>
          <Route path="orders" element={<p>orders</p>} />
        </Route>
      </Routes>,
      "/admin-v2/orders",
    );
    expect(el.querySelector('main[data-section="business"]')).not.toBeNull();
    const current = el.querySelector('aside a[aria-current="page"]');
    expect(current?.textContent).toMatch(/Business/);
  });
});

describe("Creative Studio and Asset Library", () => {
  const routes = (
    <>
      <Routes>
        <Route path="/admin-v2/creative" element={<V2Creative />} />
        <Route path="/admin-v2/library" element={<V2Creative variant="library" />} />
      </Routes>
      <Where />
    </>
  );

  it("forwards an old Creative shelf link to the Library, filters intact", () => {
    const el = mount(routes, "/admin-v2/creative?tab=mockups&stage=awaiting_approval&entity=e1");
    const where = el.querySelector('[data-testid="where"]')?.textContent ?? "";
    expect(where.startsWith("/admin-v2/library?")).toBe(true);
    const params = new URLSearchParams(where.split("?")[1]);
    expect(params.get("tab")).toBe("mockups");
    expect(params.get("stage")).toBe("awaiting_approval");
    expect(params.get("entity")).toBe("e1");
  });

  it("keeps making in the Studio", () => {
    const el = mount(routes, "/admin-v2/creative?tab=prompts");
    expect(el.querySelector('[data-testid="where"]')?.textContent).toBe("/admin-v2/creative?tab=prompts");
    expect(el.textContent).toMatch(/Creative Studio/);
  });

  it("is honest that prompts run outside the app", () => {
    const el = mount(routes, "/admin-v2/creative");
    expect(el.textContent).toMatch(/Prompts run in ChatGPT/);
  });
});

describe("View Portal", () => {
  it("is the real portal address, not a preview", () => {
    expect(entityPortalHref("e1")).toBe("/portal?as=e1");
    expect(entityPortalHref("a b")).toBe("/portal?as=a%20b");
  });
});
