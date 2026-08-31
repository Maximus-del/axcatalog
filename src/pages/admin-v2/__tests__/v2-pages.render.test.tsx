// @vitest-environment jsdom
//
// DOES EVERY V2 PAGE ACTUALLY RENDER?
//
// The unit tests cover the pure modules — geometry, pricing, visibility, URL
// construction — and none of them would have caught a page that throws on
// mount. That gap is real: these screens are only reachable behind admin auth
// against a live Supabase, so nobody finds a crash until an operator does.
//
// This mounts each page with the data layer replaced by fixtures and asserts it
// renders something. It is deliberately shallow — no assertions about copy or
// layout, which would break on every legitimate edit — and deliberately
// includes the three states a page can be in: loaded, loading, and failed.
// A failed read used to render the empty state, so "failed" is not a
// hypothetical.

//
// Mounted with react-dom directly rather than @testing-library/react: that
// package is declared but its @testing-library/dom peer is not installed, and
// adding a dependency to make a test run is a worse trade than fifteen lines
// of setup. Assertions are on rendered text, which is all a smoke test needs.

import { act, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/* ------------------------------------------------------------- fixtures */

const blank = {
  id: "b1",
  name: "Premium Fleece Hoodie",
  displayName: "AX Heavyweight Hoodie",
  brand: "Cotton Collective",
  styleNumber: "CCHOD475",
  sku: null,
  garmentType: "hoodie",
  imageUrl: "https://example.test/hoodie.png",
  cost: 18.4,
  priceAthlete: null,
  priceCorporate: null,
  priceStandard: null,
  availability: "available",
  colors: [
    { id: "c1", name: "Cool Blue", hex: "#2b4c7e", imageUrl: "https://drive.google.com/f", imageUrlBack: null, available: true },
    { id: "c2", name: "Sand", hex: "#d8cbb4", imageUrl: null, imageUrlBack: null, available: true },
  ],
  sizes: [],
  assortments: ["athlete", "client", "subscriber", "standard"],
  driveFolderUrl: "https://drive.google.com/folder",
  shopifyProductId: null,
  missingCost: false,
  missingPhoto: false,
  missingAssortment: false,
};

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
  website: null,
  category: null,
  hasOwnOrg: true,
  orgName: "Mooney",
  isDemo: false,
  counts: { collections: 1, concepts: 2, designs: 3, products: 4, liveProducts: 1 },
};

const concept = {
  id: "m1",
  title: "Mooney World Hoodie",
  entityId: "e1",
  collectionId: null,
  designId: "d1",
  blankId: "b1",
  productId: null,
  colorName: "Cool Blue",
  surface: "front",
  zoneId: null,
  placementLabel: null,
  approvalState: "none",
  imageUrl: "https://example.test/m1.png",
  imageBucket: null,
  imagePath: null,
  notes: null,
  createdAt: "2026-08-30T00:00:00Z",
};

const design = {
  id: "d1",
  title: "Mooney Crest",
  status: "concept",
  entityId: "e1",
  fileBucket: "design-files",
  filePath: "d1/art.png",
  fileType: "source",
  productionReady: false,
  clientVisibility: "hidden",
  hasPreview: false,
  previewPath: null,
  createdAt: "2026-08-29T00:00:00Z",
};

const product = {
  id: "p1",
  title: "Mooney Hoodie",
  sku: "AX-1001",
  price: 68,
  status: "published",
  approvalState: "approved",
  shopifySyncStatus: "synced",
  shopifyProductId: "gid://1",
  shopifyHandle: "mooney-hoodie",
  blankId: "b1",
  imageUrl: null,
  createdAt: "2026-08-28T00:00:00Z",
};

const collection = {
  id: "col1",
  name: "Mooney World",
  slug: "mooney-world",
  status: "draft",
  collectionType: "athlete",
  entityId: "e1",
  productCount: 1,
  designCount: 2,
  conceptCount: 3,
  coverImageUrl: null,
  createdAt: "2026-08-20T00:00:00Z",
};

const order = {
  id: "o1",
  name: "#1042",
  orderDate: "2026-08-25T00:00:00Z",
  customerName: "A Customer",
  total: 220,
  financialStatus: "paid",
  fulfillmentStatus: "unfulfilled",
  shopifyOrderId: "1",
  attributedOrgId: "o1",
};

const mockup = {
  id: "m1",
  title: "Mooney World Hoodie",
  entityId: "e1",
  organizationId: "o1",
  blankId: "b1",
  blankName: "Premium Fleece Hoodie",
  colorName: "Cool Blue",
  imageUrl: "https://example.test/m1.png",
  imageBucket: null,
  imagePath: null,
  folderId: null,
  sortOrder: 0,
  status: "draft",
  lifecycle: "bin",
  approvalState: "none",
  clientVisible: false,
  productId: null,
  collectionId: null,
  guides: {},
  surfaces: ["front"],
  placementCount: 1,
  createdAt: "2026-08-30T00:00:00Z",
  updatedAt: "2026-08-30T00:00:00Z",
};

/* --------------------------------------------------------------- the mock */

// One switch drives every hook, so the same suite can run all three states
// without a second set of fixtures.
type Mode = "loaded" | "loading" | "error";
let mode: Mode = "loaded";

const query = (data: unknown) => {
  if (mode === "loading") return { data: undefined, isLoading: true, isError: false, error: null, refetch: vi.fn() };
  if (mode === "error") {
    return { data: undefined, isLoading: false, isError: true, error: new Error("network"), refetch: vi.fn() };
  }
  return { data, isLoading: false, isError: false, error: null, refetch: vi.fn() };
};

const mutation = () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false, isError: false, error: null });

vi.mock("@/lib/v2/data", () => ({
  useOverview: () =>
    query({
      actions: [
        {
          id: "a1",
          count: 2,
          label: "Mockups awaiting approval",
          detail: "Sent for a decision",
          to: "/admin-v2/creative?tab=mockups&stage=awaiting_approval",
          tone: "var(--ax-amber)",
        },
      ],
      stats: { activeEntities: 9, concepts: 12, liveProducts: 4, blanks: 13 },
      recentEntities: [entity],
      recentConcepts: [concept],
      recentOrders: [order],
      openOrders: 3,
    }),
  useEntities: () => query([entity]),
  useEntityWorkspace: () =>
    query({
      entity,
      collections: [collection],
      concepts: [concept],
      designs: [design],
      products: [product],
      orders: [order],
      ordersNote: "Attribution only resolves for entities that own an organisation.",
    }),
  useBlanks: () => query([blank]),
  useDesigns: () => query([design]),
  useConcepts: () => query([concept]),
  useProducts: () => query([product]),
  useCollections: () => query([collection]),
  useOrders: () => query([order]),
  useDesignTemplates: () =>
    query([
      {
        id: "t1",
        name: "Collegiate 01",
        style: "collegiate",
        description: null,
        tags: ["bold"],
        sports: ["football"],
        isActive: true,
        previewImage: null,
        applications: 3,
      },
    ]),
  useMockupLibrary: () => query({ mockups: [mockup], folders: [] }),
  useDesignShelf: () => query({ designs: [design], groups: [], membership: new Map() }),
  useLookbooks: () => query([]),
  useDiscountBreaks: () => query([]),
  useMockupForEdit: () => query({ id: "m1", title: "x", placed: [], guides: {}, blankId: "b1", colorName: "Cool Blue", collectionId: null, notes: null }),
  useMockupProduction: () => query([]),
  usePrintZones: () => query([]),
  useMockupActions: () => mutation(),
  useShelfActions: () => mutation(),
  useCreateCollection: () => mutation(),
  useCreateLookbook: () => mutation(),
  useCreateBulkOrder: () => mutation(),
  useCreateMockup: () => mutation(),
  useCreateMockupBatch: () => mutation(),
  useCreateConcept: () => mutation(),
  useCreateProductFromConcept: () => mutation(),
  useUpdateMockup: () => mutation(),
  useUpdatePlacementSpec: () => mutation(),
  useUploadDesign: () => mutation(),
  publicUrl: () => null,
}));

vi.mock("@/lib/storage", () => ({ useSignedUrl: () => ({ url: null, loading: false }) }));

/* ------------------------------------------------------------------ setup */

import V2Overview from "../V2Overview";
import V2People from "../V2People";
import V2Orders from "../V2Orders";
import V2Commerce from "../V2Commerce";
import V2BlankDetail from "../V2BlankDetail";
import V2Creative from "../V2Creative";
import V2NotFound from "../V2NotFound";
import V2EntityWorkspace from "../V2EntityWorkspace";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let cleanup: (() => void) | null = null;

function mount(ui: ReactElement, route = "/admin-v2"): HTMLElement {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[route]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>
            <Route path="/admin-v2/people/:id" element={ui} />
            <Route path="/admin-v2/commerce/blanks/:id" element={ui} />
            <Route path="*" element={ui} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  });
  cleanup = () => {
    act(() => root.unmount());
    container.remove();
  };
  return container;
}

const textOf = (el: HTMLElement) => el.textContent ?? "";

const PAGES: Array<{ name: string; render: () => ReactElement; route?: string; expects: RegExp }> = [
  { name: "Overview", render: () => <V2Overview />, expects: /action required/i },
  { name: "People", render: () => <V2People />, expects: /darnell mooney/i },
  { name: "Orders", render: () => <V2Orders />, expects: /#1042/ },
  { name: "Commerce", render: () => <V2Commerce />, route: "/admin-v2/commerce", expects: /needs attention/i },
  { name: "Creative", render: () => <V2Creative />, route: "/admin-v2/creative", expects: /needs you/i },
  {
    name: "Blank catalog",
    render: () => <V2Commerce />,
    route: "/admin-v2/commerce?tab=blanks",
    expects: /AX Heavyweight Hoodie/i,
  },
  {
    name: "Blank detail",
    render: () => <V2BlankDetail />,
    route: "/admin-v2/commerce/blanks/b1",
    expects: /colourways/i,
  },
  {
    name: "Entity workspace",
    render: () => <V2EntityWorkspace />,
    route: "/admin-v2/people/e1",
    expects: /darnell mooney/i,
  },
];

beforeEach(() => {
  mode = "loaded";
});

afterEach(() => {
  cleanup?.();
  cleanup = null;
});

describe("every V2 page renders with data", () => {
  for (const page of PAGES) {
    it(page.name, () => {
      expect(textOf(mount(page.render(), page.route))).toMatch(page.expects);
    });
  }
});

describe("every V2 page renders while loading", () => {
  for (const page of PAGES) {
    it(page.name, () => {
      mode = "loading";
      expect(() => mount(page.render(), page.route)).not.toThrow();
    });
  }
});

describe("a failed read says so instead of showing an empty shelf", () => {
  for (const page of PAGES) {
    it(page.name, () => {
      mode = "error";
      // Either the page-level ErrorState, or — for pages with no record at all
      // to render — their own not-loaded message. What must NOT happen is a
      // cheerful "nothing here yet".
      expect(textOf(mount(page.render(), page.route))).toMatch(/could not load|does not exist|not found/i);
    });
  }
});

describe("an unknown V2 address stays inside V2", () => {
  it("offers the way back", () => {
    const text = textOf(mount(<V2NotFound />, "/admin-v2/nonsense"));
    expect(text).toMatch(/nothing at that address/i);
    expect(text).toMatch(/overview/i);
  });
});
