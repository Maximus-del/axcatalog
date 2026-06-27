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
} from "lucide-react";

interface Hit {
  id: string;
  label: string;
  sub?: string;
  to: string;
}

interface Buckets {
  products: Hit[];
  athletes: Hit[];
  orders: Hit[];
  designs: Hit[];
}

const EMPTY: Buckets = { products: [], athletes: [], orders: [], designs: [] };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function GlobalSearch({ open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Buckets>(EMPTY);
  const [loading, setLoading] = useState(false);

  // Reset when reopened
  useEffect(() => {
    if (!open) {
      setQ("");
      setHits(EMPTY);
    }
  }, [open]);

  // Debounced search
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
      const [pRes, aRes, oRes, dRes] = await Promise.all([
        supabase
          .from("products")
          .select("id, title, status")
          .ilike("title", like)
          .limit(6),
        supabase
          .from("athletes")
          .select("id, first_name, last_name, league")
          .or(`first_name.ilike.${like},last_name.ilike.${like}`)
          .limit(6),
        supabase
          .from("bulk_order_requests")
          .select("id, customer_name, status, created_at")
          .ilike("customer_name", like)
          .order("created_at", { ascending: false })
          .limit(6),
        supabase
          .from("designs")
          .select("id, title, status")
          .ilike("title", like)
          .limit(6),
      ]);
      if (cancelled) return;
      setHits({
        products: (pRes.data ?? []).map((p) => ({
          id: p.id,
          label: p.title,
          sub: p.status ?? undefined,
          to: `/admin/products/${p.id}`,
        })),
        athletes: (aRes.data ?? []).map((a) => ({
          id: a.id,
          label: `${a.first_name ?? ""} ${a.last_name ?? ""}`.trim(),
          sub: a.league ?? undefined,
          to: `/admin/athletes/${a.id}`,
        })),
        orders: (oRes.data ?? []).map((o) => ({
          id: o.id,
          label: o.customer_name ?? "Order",
          sub: o.status ?? undefined,
          to: `/admin/orders/${o.id}`,
        })),
        designs: (dRes.data ?? []).map((d) => ({
          id: d.id,
          label: d.title ?? "Untitled",
          sub: d.status ?? undefined,
          to: `/admin/designs/${d.id}`,
        })),
      });
      setLoading(false);
    }, 180);
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
  const noHits =
    showResults &&
    !loading &&
    !hits.products.length &&
    !hits.athletes.length &&
    !hits.orders.length &&
    !hits.designs.length;

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
        placeholder="Search products, athletes, orders, designs…"
        value={q}
        onValueChange={setQ}
      />
      <CommandList className="max-h-[60vh]">
        {!showResults && (
          <CommandGroup heading="Quick actions">
            {quickActions.map((a) => (
              <CommandItem
                key={a.label}
                onSelect={() => go(a.to)}
                className="gap-2"
              >
                <a.icon className="h-4 w-4 text-muted-foreground" />
                <span>{a.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {noHits && <CommandEmpty>No results for "{q}".</CommandEmpty>}

        {hits.products.length > 0 && (
          <CommandGroup heading="Products">
            {hits.products.map((h) => (
              <CommandItem key={h.id} onSelect={() => go(h.to)} className="gap-2">
                <Package className="h-4 w-4 text-muted-foreground" />
                <span className="truncate">{h.label}</span>
                {h.sub && (
                  <span className="ml-auto text-[11px] text-muted-foreground capitalize">
                    {h.sub}
                  </span>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {hits.athletes.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Athletes">
              {hits.athletes.map((h) => (
                <CommandItem key={h.id} onSelect={() => go(h.to)} className="gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="truncate">{h.label}</span>
                  {h.sub && (
                    <span className="ml-auto text-[11px] text-muted-foreground">
                      {h.sub}
                    </span>
                  )}
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
                <CommandItem key={h.id} onSelect={() => go(h.to)} className="gap-2">
                  <ClipboardList className="h-4 w-4 text-muted-foreground" />
                  <span className="truncate">{h.label}</span>
                  {h.sub && (
                    <span className="ml-auto text-[11px] text-muted-foreground capitalize">
                      {h.sub.replaceAll("_", " ")}
                    </span>
                  )}
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
                <CommandItem key={h.id} onSelect={() => go(h.to)} className="gap-2">
                  <Palette className="h-4 w-4 text-muted-foreground" />
                  <span className="truncate">{h.label}</span>
                  {h.sub && (
                    <span className="ml-auto text-[11px] text-muted-foreground capitalize">
                      {h.sub}
                    </span>
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