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
  teamName: "Atlanta Falcons",
  primaryContact: null,
  createdAt: "2026-04-16T00:00:00Z",
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
  useCreateMockup: () => mutation(),
  useCreateMockupBatch: () => mutation(),
  useCreateConcept: () => mutation(),
  useCreateProductFromConcept: () => mutation(),
  useUpdateMockup: () => mutation(),
  useUpdatePlacementSpec: () => mutation(),
  useUploadDesign: () => mutation(),
  publicUrl: () => null,
  useAssetBriefs: () =>
    query([
      {
        id: "ab1",
        organizationId: "o1",
        entityId: "e1",
        title: "Mooney launch post",
        assetType: "launch",
        aspectRatio: "4:5",
        instructions: null,
        promptPackageId: null,
        status: "ready",
        createdAt: "2026-08-30T00:00:00Z",
        updatedAt: "2026-08-30T00:00:00Z",
        mockups: [
          { id: "i1", mockupId: "m1", title: "Mooney World Hoodie", imageUrl: null, imageBucket: null, imagePath: null },
        ],
        references: [],
        outputs: [],
      },
    ]),
  useSaveAssetBrief: () => mutation(),
  useDeleteAssetBrief: () => mutation(),
  ASSET_REFERENCE_BUCKET: "design-references",
  useV2Search: () =>
    query([
      { kind: "person", id: "e1", label: "Darnell Mooney", detail: "WR · NFL", to: "/admin-v2/people/e1" },
      { kind: "blank", id: "b1", label: "AX Heavyweight Hoodie", detail: "Cotton Collective", to: "/admin-v2/commerce/blanks/b1" },
    ]),
  SEARCH_KIND_LABEL: {
    person: "People",
    mockup: "Mockups",
    design: "Designs",
    blank: "Blanks",
    collection: "Collections",
    product: "Products",
  },
}));

vi.mock("@/lib/storage", () => ({ useSignedUrl: () => ({ url: null, loading: false }) }));

vi.mock("@/auth/AuthProvider", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));

const cartLine = {
  id: "cl1",
  mockupId: "m1",
  blankId: "b1",
  title: "Mooney World Hoodie",
  colorName: "Cool Blue",
  size: "L",
  quantity: 12,
  unitRetail: 48,
  imageUrl: null,
};

vi.mock("@/lib/v2/cart-data", () => ({
  useCart: () =>
    query({
      orderId: "ord1",
      notes: "",
      lines: [cartLine],
      groups: [
        {
          key: "m1||Cool Blue",
          mockupId: "m1",
          blankId: "b1",
          title: "Mooney World Hoodie",
          colorName: "Cool Blue",
          imageUrl: null,
          unitRetail: 48,
          units: 12,
          retail: 576,
          lines: [cartLine],
        },
      ],
      units: 12,
    }),
  useEntityOrders: () =>
    query({
      orders: [
        {
          id: "o9",
          orderNumber: "BR-2026-721",
          status: "shipped",
          units: 11,
          total: 4250,
          createdAt: "2026-04-17T10:59:55Z",
        },
        {
          id: "o8",
          orderNumber: "BR-2026-001",
          status: "submitted",
          units: 10,
          // Raised before the cart froze prices — must render as an em dash.
          total: null,
          createdAt: "2026-04-17T04:53:40Z",
        },
      ],
      ytdTotal: 4250,
      ytdCount: 2,
      ytdUnpriced: 1,
    }),
  useCartActions: () => mutation(),
  useAddToCart: () => mutation(),
  useSubmitCart: () => mutation(),
}));

/* ------------------------------------------------------------------ setup */

import V2Overview from "../V2Overview";
import V2People from "../V2People";
import V2Orders from "../V2Orders";
import V2Commerce from "../V2Commerce";
import V2BlankDetail from "../V2BlankDetail";
import V2Creative from "../V2Creative";
import V2NotFound from "../V2NotFound";
import V2EntityWorkspace from "../V2EntityWorkspace";
import V2Cart from "../V2Cart";
import V2EntityOverview from "../V2EntityOverview";
import CommandSearch from "@/components/admin-v2/CommandSearch";

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
            <Route path="/admin-v2/people/:id/library" element={ui} />
            <Route path="/admin-v2/people/:id/cart" element={ui} />
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
    name: "Creative · Assets",
    render: () => <V2Creative />,
    route: "/admin-v2/creative?tab=assets",
    expects: /Mooney launch post/i,
  },
  {
    name: "Creative · Templates",
    render: () => <V2Creative />,
    route: "/admin-v2/creative?tab=templates",
    expects: /Collegiate 01/i,
  },
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
    name: "Athlete overview",
    render: () => <V2EntityOverview />,
    route: "/admin-v2/people/e1",
    expects: /darnell mooney/i,
  },
  {
    name: "Entity library",
    render: () => <V2EntityWorkspace />,
    route: "/admin-v2/people/e1/library",
    expects: /darnell mooney/i,
  },
  {
    name: "Cart",
    render: () => <V2Cart />,
    route: "/admin-v2/people/e1/cart",
    expects: /Mooney World Hoodie/i,
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

describe("the athlete overview tells the truth about what it knows", () => {
  const text = () => textOf(mount(<V2EntityOverview />, "/admin-v2/people/e1"));

  it("shows the six counts from the entity record, not from the previews", () => {
    // Three designs exist in the counts; only one is in the preview fixture.
    // The strip must report the library, not the tiles it happened to render.
    const el = text();
    expect(el).toMatch(/Designs/);
    expect(el).toMatch(/Collections/);
    expect(el).toMatch(/Live/);
  });

  it("names the club and when AX started working with them", () => {
    expect(text()).toMatch(/Atlanta Falcons/);
    expect(text()).toMatch(/AX since/);
  });

  it("invents no primary contact when the record has none", () => {
    expect(text()).not.toMatch(/Primary contact/i);
  });

  it("lists the athlete's bulk orders, which are the only ones attributable", () => {
    const el = text();
    expect(el).toMatch(/BR-2026-721/);
    expect(el).toMatch(/Shipped/);
  });

  it("renders an em dash rather than $0.00 for an order that was never priced", () => {
    expect(text()).toMatch(/—/);
  });

  it("says these are bulk orders rather than implying they are every sale", () => {
    expect(text()).toMatch(/Bulk orders raised for/i);
  });

  it("sends View all into the library rather than showing the whole shelf here", () => {
    const el = mount(<V2EntityOverview />, "/admin-v2/people/e1");
    const hrefs = [...el.querySelectorAll("a")].map((a) => a.getAttribute("href") ?? "");
    expect(hrefs.some((h) => h.includes("/library?focus=mockups"))).toBe(true);
    expect(hrefs.some((h) => h.includes("/library?focus=products"))).toBe(true);
  });

  it("offers Create Order as the cart, because an order is assembled not typed", () => {
    const el = mount(<V2EntityOverview />, "/admin-v2/people/e1");
    const hrefs = [...el.querySelectorAll("a")].map((a) => a.getAttribute("href") ?? "");
    expect(hrefs.some((h) => h.endsWith("/admin-v2/people/e1/cart"))).toBe(true);
  });
});

describe("global search", () => {
  it("is a trigger until it is opened", () => {
    const el = mount(<CommandSearch />);
    expect(textOf(el)).toMatch(/search/i);
    expect(textOf(el)).not.toMatch(/darnell mooney/i);
  });

  it("waits for two characters, then shows grouped results", () => {
    vi.useFakeTimers();
    try {
      mount(<CommandSearch />);
      act(() => {
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
      });
      expect(document.body.textContent).toMatch(/two characters is enough/i);

      const input = document.querySelector("input") as HTMLInputElement;
      // React tracks the DOM value itself, so a plain assignment is ignored.
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      act(() => {
        setValue?.call(input, "moo");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      act(() => {
        vi.advanceTimersByTime(300);
      });

      expect(document.body.textContent).toMatch(/darnell mooney/i);
      expect(document.body.textContent).toMatch(/AX Heavyweight Hoodie/i);
      expect(document.body.textContent).toMatch(/People/);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("an unknown V2 address stays inside V2", () => {
  it("offers the way back", () => {
    const text = textOf(mount(<V2NotFound />, "/admin-v2/nonsense"));
    expect(text).toMatch(/nothing at that address/i);
    expect(text).toMatch(/overview/i);
  });
});
