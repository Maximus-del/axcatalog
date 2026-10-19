import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { useEntities } from "@/lib/v2/data";
import { EmptyState, ErrorState, PageHeader, Skeleton, TabBar } from "@/components/admin-v2/primitives";
import { DropsTab } from "./V2Desk";
import { CollectionGrid } from "./V2Commerce";

// RELEASES — what goes out, and to whom.
//
// Three existing things, each kept as its own object:
//   Drops        client portal drops (draft → review → scheduled → live),
//                approved and scheduled through the same Desk RPCs
//   Collections  permanent groups of creative work. A collection does NOT
//                need Shopify products — it is not a Shopify publication.
//   Lineups      what each client sees in My Gear, edited per client
//
// Putting something in a client's portal and publishing to Shopify stay two
// different operations; neither happens from this page by accident.

const TABS = ["drops", "collections", "lineups"] as const;
type Tab = (typeof TABS)[number];
const LABEL: Record<Tab, string> = { drops: "Portal drops", collections: "Collections", lineups: "Client lineups" };

export default function V2Releases() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = (TABS as readonly string[]).includes(params.get("tab") ?? "") ? (params.get("tab") as Tab) : "drops";
  const go = (t: Tab) => setParams(t === "drops" ? {} : { tab: t }, { replace: true });

  return (
    <>
      <PageHeader
        eyebrow="Releases"
        title="Ship it to the right place."
        subtitle="Portal drops, collections and each client’s lineup. Sharing to a client’s portal and publishing to Shopify are separate steps."
      />
      <TabBar tabs={TABS} active={tab} onSelect={go} label={(t) => LABEL[t]} />
      {tab === "drops" && <DropsTab />}
      {tab === "collections" && <CollectionGrid />}
      {tab === "lineups" && <Lineups />}
    </>
  );
}

function Lineups() {
  const { data, isLoading, isError, error, refetch } = useEntities();
  const clients = useMemo(
    () =>
      (data ?? [])
        .filter((e) => !e.isDemo && e.status === "active")
        .sort((a, b) => b.counts.products - a.counts.products || a.name.localeCompare(b.name)),
    [data],
  );

  if (isError) return <ErrorState error={error} what="client spaces" onRetry={() => void refetch()} />;
  if (isLoading) return <Skeleton className="h-40" />;
  if (clients.length === 0) return <EmptyState>No active client spaces.</EmptyState>;

  return (
    <div className="ax-card divide-y divide-[hsl(var(--ax-line))] p-0">
      {clients.map((c) => (
        <Link
          key={c.id}
          to={`/admin-v2/people/${c.id}/lineup`}
          className="flex items-center gap-3 px-4 py-3 text-[13px] hover:bg-white/[0.03]"
        >
          <span className="min-w-0 flex-1 truncate font-semibold">{c.name}</span>
          <span className="hidden text-[12px] tabular-nums text-[hsl(var(--ax-secondary))] sm:block">
            {c.counts.products} products · {c.counts.collections} collections
          </span>
          <span className="flex shrink-0 items-center gap-1 text-[12px] font-semibold text-[hsl(var(--ax-secondary))]">
            Edit lineup <ArrowUpRight className="h-3.5 w-3.5" />
          </span>
        </Link>
      ))}
    </div>
  );
}
