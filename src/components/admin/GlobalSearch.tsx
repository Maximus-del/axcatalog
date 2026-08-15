import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { supabase } from "@/integrations/supabase/client";
import {
  Package,
  User,
  ClipboardList,
  Palette,
  Plus,
  Frame,
  DollarSign,
  Compass,
  Users,
  Newspaper,
  Star,
  CalendarDays,
  Layers,
  LayoutTemplate,
  Shapes,
  BarChart3,
} from "lucide-react";

interface Hit {
  id: string;
  label: string;
  sub?: string;
  to: string;
}

interface Buckets {
  athletes: Hit[];
  products: Hit[];
  orders: Hit[];
  designs: Hit[];
}

const EMPTY: Buckets = { athletes: [], products: [], orders: [], designs: [] };

// Static page index — typed nav search (grouped under PAGES). Fast, no query.
const PAGES: { label: string; to: string; keywords: string; icon: typeof Compass }[] = [
  { label: "Ecosystem Overview", to: "/admin", keywords: "overview home dashboard ecosystem", icon: Compass },
  { label: "Athletes", to: "/admin/athletes", keywords: "athletes roster players", icon: Users },
  { label: "Products", to: "/admin/products", keywords: "products merch catalog", icon: Package },
  { label: "Collections", to: "/admin/collections", keywords: "collections capsules", icon: Layers },
  { label: "Designs", to: "/admin/designs", keywords: "designs graphics art", icon: Palette },
  { label: "Design Templates", to: "/admin/design-templates", keywords: "design templates style system vintage streetwear collegiate luxury y2k heritage", icon: Shapes },
  { label: "Mockups", to: "/admin/mockups", keywords: "mockups product photos", icon: Frame },
  { label: "Content", to: "/admin/content", keywords: "content posts cms marketing access", icon: Newspaper },
  { label: "Access & Memberships", to: "/admin/access", keywords: "access memberships plans subscribers", icon: Star },
  { label: "Camps & Events", to: "/admin/events", keywords: "camps events schedule", icon: CalendarDays },
  { label: "Templates", to: "/admin/templates", keywords: "templates design style provisioning", icon: LayoutTemplate },
  { label: "Orders", to: "/admin/orders", keywords: "orders fulfillment", icon: ClipboardList },
  { label: "Analytics", to: "/admin/analytics", keywords: "analytics metrics reports", icon: BarChart3 },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function GlobalSearch({ open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Buckets>(EMPTY);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setQ("");
      setHits(EMPTY);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const term = q.trim();
    if (term.length < 2) {
      setHits(EMPTY);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const handle = setTimeout(async () => {
      const like = `%${term}%`;
      const [aRes, pRes, oRes, dRes] = await Promise.all([
        // Athletes first — match first, last, OR full name so "Darnell Mooney" works.
        supabase
          .from("public_athletes" as never)
          .select("id, first_name, last_name, full_name, position, team_name, league")
          .or(`first_name.ilike.${like},last_name.ilike.${like},full_name.ilike.${like}`)
          .limit(8),
        supabase.from("products").select("id, title, status").ilike("title", like).limit(6),
        supabase
          .from("bulk_order_requests")
          .select("id, customer_name, status, created_at")
          .ilike("customer_name", like)
          .order("created_at", { ascending: false })
          .limit(5),
        supabase.from("designs").select("id, title, status").ilike("title", like).limit(5),
      ]);
      if (cancelled) return;
      const aRows = (aRes.data ?? []) as unknown as Array<{
        id: string; first_name: string; last_name: string; full_name: string | null;
        position: string | null; team_name: string | null; league: string | null;
      }>;
      setHits({
        athletes: aRows.map((a) => ({
          id: a.id,
          label: (a.full_name && a.full_name.trim()) || `${a.first_name ?? ""} ${a.last_name ?? ""}`.trim(),
          sub: [a.position, a.team_name].filter(Boolean).join(" · ") || a.league || undefined,
          to: `/admin/athletes/${a.id}`,
        })),
        products: (pRes.data ?? []).map((p) => ({
          id: p.id, label: p.title, sub: p.status ?? undefined, to: `/admin/products/${p.id}`,
        })),
        orders: (oRes.data ?? []).map((o) => ({
          id: o.id, label: o.customer_name ?? "Order", sub: o.status ?? undefined, to: `/admin/orders/${o.id}`,
        })),
        designs: (dRes.data ?? []).map((d) => ({
          id: d.id, label: d.title ?? "Untitled", sub: d.status ?? undefined, to: `/admin/designs/${d.id}`,
        })),
      });
      setLoading(false);
    }, 160);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [q, open]);

  const go = (to: string) => {
    onOpenChange(false);
    navigate(to);
  };

  const showResults = q.trim().length >= 2;
  const term = q.trim().toLowerCase();
  const pageHits = useMemo(
    () =>
      showResults
        ? PAGES.filter((p) => p.label.toLowerCase().includes(term) || p.keywords.includes(term)).slice(0, 6)
        : [],
    [showResults, term],
  );
  const noHits =
    showResults &&
    !loading &&
    !hits.athletes.length &&
    !hits.products.length &&
    !hits.orders.length &&
    !hits.designs.length &&
    pageHits.length === 0;

  const quickActions = useMemo(
    () => [
      { label: "New product", to: "/admin/products", icon: Package },
      { label: "New athlete", to: "/admin/athletes", icon: User },
      { label: "New design", to: "/admin/designs", icon: Palette },
      { label: "New order", to: "/admin/orders", icon: ClipboardList },
      { label: "Print zones", to: "/admin/print-zones", icon: Frame },
      { label: "Pricing links", to: "/admin/pricing-links", icon: DollarSign },
    ],
    [],
  );

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Search athletes, products, pages…"
        value={q}
        onValueChange={setQ}
      />
      <CommandList className="max-h-[60vh]">
        {!showResults && (
          <CommandGroup heading="Quick actions">
            {quickActions.map((a) => (
              <CommandItem key={a.label} onSelect={() => go(a.to)} className="gap-2">
                <a.icon className="h-4 w-4 text-muted-foreground" />
                <span>{a.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {noHits && <CommandEmpty>No results for "{q}".</CommandEmpty>}

        {hits.athletes.length > 0 && (
          <CommandGroup heading="Athletes">
            {hits.athletes.map((h) => (
              <CommandItem key={h.id} value={`${h.label} ${h.sub ?? ""} athlete`} onSelect={() => go(h.to)} className="gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="truncate">{h.label}</span>
                {h.sub && <span className="ml-auto text-[11px] text-muted-foreground truncate">{h.sub}</span>}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {pageHits.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Pages">
              {pageHits.map((p) => (
                <CommandItem key={p.to} value={`${p.label} ${p.keywords} page`} onSelect={() => go(p.to)} className="gap-2">
                  <p.icon className="h-4 w-4 text-muted-foreground" />
                  <span className="truncate">{p.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {hits.products.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Products">
              {hits.products.map((h) => (
                <CommandItem key={h.id} value={`${h.label} product`} onSelect={() => go(h.to)} className="gap-2">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  <span className="truncate">{h.label}</span>
                  {h.sub && <span className="ml-auto text-[11px] text-muted-foreground capitalize">{h.sub}</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {hits.designs.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Designs">
              {hits.designs.map((h) => (
                <CommandItem key={h.id} value={`${h.label} design`} onSelect={() => go(h.to)} className="gap-2">
                  <Palette className="h-4 w-4 text-muted-foreground" />
                  <span className="truncate">{h.label}</span>
                  {h.sub && <span className="ml-auto text-[11px] text-muted-foreground capitalize">{h.sub}</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {hits.orders.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Orders">
              {hits.orders.map((h) => (
                <CommandItem key={h.id} value={`${h.label} order`} onSelect={() => go(h.to)} className="gap-2">
                  <ClipboardList className="h-4 w-4 text-muted-foreground" />
                  <span className="truncate">{h.label}</span>
                  {h.sub && (
                    <span className="ml-auto text-[11px] text-muted-foreground capitalize">{h.sub.replace(/_/g, " ")}</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
