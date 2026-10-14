import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowUpRight, ExternalLink, Trash2 } from "lucide-react";
import { useDeleteProduct, useProduct } from "@/lib/v2/data";
import { entityHref, entityLibraryHref } from "@/lib/v2/entity-nav";
import { fmtMoney } from "@/lib/v2/pricing";
import { shopLink } from "@/lib/ecosystem/image";
import { AssetImage, Card, Chip, ErrorState, PageHeader, Skeleton } from "@/components/admin-v2/primitives";

// A PRODUCT, INSIDE V2.
//
// Clicking a product in V2 used to hand you to V1's product editor. There is
// only one database — V2 deliberately reuses V1's tables rather than
// duplicating the backend — so the ROW was never the problem. The problem was
// being thrown out of the dashboard you were working in, into a different
// interface, with no way back to the mockup you came from.
//
// This is a read-and-decide page, not a second product editor. It answers "what
// is this, where did it come from, is it live" and offers the two things V2
// owns: get back to the mockup, or delete it. Editing the commercial details is
// still V1's job and says so, out loud, with a link that opens in a new tab
// rather than replacing where you are.

export default function V2ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, isLoading, isError, error, refetch } = useProduct(id);
  const del = useDeleteProduct();
  const [confirming, setConfirming] = useState(false);

  if (isLoading) {
    return (
      <>
        <Skeleton className="mb-6 h-16" />
        <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
          <Skeleton className="aspect-square" />
          <Skeleton className="h-64" />
        </div>
      </>
    );
  }

  if (isError) {
    return <ErrorState error={error} what="this product" onRetry={() => void refetch()} />;
  }

  if (!data) {
    return (
      <div className="py-20 text-center text-[13px] text-[hsl(var(--ax-faint))]">
        That product does not exist, or you do not have access to its organisation.
        <div className="mt-3">
          <Link to="/admin-v2/commerce" className="text-[hsl(var(--ax-accent))]">
            Back to Commerce
          </Link>
        </div>
      </div>
    );
  }

  const isLive = Boolean(data.shopifyProductId) && data.status === "published";
  const storeUrl = data.shopifyHandle ? shopLink(data.shopifyHandle) : null;

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-1.5 text-[11px] text-[hsl(var(--ax-faint))]">
        <Link to="/admin-v2/commerce" className="transition-colors hover:text-[hsl(var(--ax-ink))]">
          Commerce
        </Link>
        <span>/</span>
        <span className="text-[hsl(var(--ax-secondary))]">Product</span>
      </div>

      <PageHeader
        title={data.title || "Untitled product"}
        subtitle={
          <span className="flex flex-wrap items-center gap-1.5">
            {isLive ? (
              <Chip tone="var(--ax-accent)">Live</Chip>
            ) : (
              <Chip tone="var(--ax-faint)">{data.status}</Chip>
            )}
            {data.sku && <span className="text-[12px]">{data.sku}</span>}
            <span className="text-[12px] tabular-nums">{fmtMoney(data.price)}</span>
          </span>
        }
        actions={
          <>
            {storeUrl && (
              <a
                href={storeUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 rounded-full border border-[hsl(var(--ax-border))] px-3.5 py-2 text-[12px] text-[hsl(var(--ax-secondary))] hover:text-[hsl(var(--ax-ink))]"
              >
                View in store <ArrowUpRight className="h-3.5 w-3.5" />
              </a>
            )}
            {/*
              V1 opens in a NEW TAB and says so. A V2 screen should never
              replace itself with a V1 one — that is the thing that made
              clicking a product feel like falling out of the dashboard.
            */}
            <a
              href={`/admin/products/${data.id}`}
              target="_blank"
              rel="noreferrer"
              title="Commercial details are still edited in V1"
              className="flex items-center gap-1.5 rounded-full border border-[hsl(var(--ax-border))] px-3.5 py-2 text-[12px] text-[hsl(var(--ax-secondary))] hover:text-[hsl(var(--ax-ink))]"
            >
              Edit in V1 <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        <div className="space-y-3">
          <AssetImage
            url={data.images[0]?.url ?? null}
            alt={data.title}
            className="aspect-square w-full rounded-2xl border border-[hsl(var(--ax-border))] bg-white/[0.03]"
            fit="contain"
            fallbackSeed={data.id}
          />
          {data.images.length > 1 && (
            <div className="grid grid-cols-4 gap-2">
              {data.images.slice(1, 9).map((im) => (
                <AssetImage
                  key={im.id}
                  url={im.url}
                  alt={data.title}
                  className="aspect-square w-full rounded-lg border border-[hsl(var(--ax-border))] bg-white/[0.03]"
                  fit="contain"
                />
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          {/*
            LINEAGE. The reason a V2 operator opened this page is usually to get
            back to the mockup — the placement is slightly off, or they want
            another colourway. A product does not record where it came from;
            the mockup records what it became, so this is read from that side.
          */}
          <Card>
            <h3 className="text-[13px] font-semibold">Where this came from</h3>
            {data.fromMockup ? (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px]">
                <span className="text-[hsl(var(--ax-secondary))]">{data.fromMockup.title}</span>
                {data.fromMockup.entityId && (
                  <>
                    <Link
                      to={entityLibraryHref(data.fromMockup.entityId, { mockup: data.fromMockup.id })}
                      className="rounded-full border border-[hsl(var(--ax-accent)/0.5)] px-3 py-1 text-[11.5px] font-semibold text-[hsl(var(--ax-accent))] hover:bg-[hsl(var(--ax-accent)/0.1)]"
                    >
                      Open the mockup
                    </Link>
                    <Link
                      to={entityLibraryHref(data.fromMockup.entityId, { edit: data.fromMockup.id })}
                      className="rounded-full border border-[hsl(var(--ax-border))] px-3 py-1 text-[11.5px] text-[hsl(var(--ax-secondary))] hover:text-[hsl(var(--ax-ink))]"
                    >
                      Edit the placement
                    </Link>
                  </>
                )}
              </div>
            ) : (
              <p className="mt-1 text-[12px] text-[hsl(var(--ax-faint))]">
                No mockup points at this product. It was configured outside V2, or the mockup was deleted.
              </p>
            )}
          </Card>

          <Card>
            <h3 className="text-[13px] font-semibold">Details</h3>
            <div className="mt-2 space-y-1.5 text-[12px]">
              <Row label="Status" value={data.status} />
              <Row label="Approval" value={data.approvalState} />
              <Row
                label="Shopify"
                value={data.shopifyProductId ? `Synced · ${data.shopifySyncStatus}` : "Not on Shopify"}
                tone={data.shopifyProductId ? "var(--ax-accent)" : "var(--ax-faint)"}
              />
              <Row label="Price" value={fmtMoney(data.price)} />
              <Row label="SKU" value={data.sku ?? "—"} />
              <Row
                label="Created"
                value={data.createdAt ? new Date(data.createdAt).toLocaleDateString() : "—"}
              />
            </div>
            {data.description && (
              <p className="mt-3 whitespace-pre-wrap text-[12px] leading-relaxed text-[hsl(var(--ax-secondary))]">
                {data.description}
              </p>
            )}
          </Card>

          {(data.entities.length > 0 || data.collections.length > 0) && (
            <Card>
              <h3 className="text-[13px] font-semibold">Linked to</h3>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {data.entities.map((e) => (
                  <Link
                    key={e.id}
                    to={entityHref(e.id)}
                    className="rounded-full border border-[hsl(var(--ax-border))] px-3 py-1 text-[11.5px] text-[hsl(var(--ax-secondary))] hover:border-[hsl(var(--ax-accent)/0.6)] hover:text-[hsl(var(--ax-ink))]"
                  >
                    {e.name}
                  </Link>
                ))}
                {data.collections.map((c) => (
                  <Chip key={c.id} tone="var(--ax-violet)">
                    {c.name}
                  </Chip>
                ))}
              </div>
            </Card>
          )}

          <Card>
            <h3 className="text-[13px] font-semibold">Delete</h3>
            {data.shopifyProductId ? (
              <p className="mt-1 text-[12px] text-[hsl(var(--ax-amber))]">
                This product is on Shopify. Remove it there first — deleting the AX record would leave a storefront
                listing with nothing behind it.
              </p>
            ) : (
              <>
                <p className="mt-1 text-[12px] text-[hsl(var(--ax-faint))]">
                  The mockup it came from is kept and goes back to being ready to configure.
                </p>
                <button
                  type="button"
                  disabled={del.isPending}
                  onClick={async () => {
                    if (!confirming) {
                      setConfirming(true);
                      return;
                    }
                    try {
                      await del.mutateAsync({ id: data.id, shopifyProductId: data.shopifyProductId });
                      toast.success(`Deleted “${data.title}”`);
                      navigate("/admin-v2/commerce");
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Could not delete that product");
                      setConfirming(false);
                    }
                  }}
                  className={`mt-2.5 inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[12px] transition-colors disabled:opacity-50 ${
                    confirming
                      ? "border-[hsl(var(--ax-red))] bg-[hsl(var(--ax-red)/0.14)] text-[hsl(var(--ax-red))]"
                      : "border-[hsl(var(--ax-border))] text-[hsl(var(--ax-faint))] hover:border-[hsl(var(--ax-red)/0.5)] hover:text-[hsl(var(--ax-red))]"
                  }`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {del.isPending
                    ? "Deleting…"
                    : confirming
                      ? "Delete — cannot be undone"
                      : "Delete this product"}
                </button>
              </>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[hsl(var(--ax-faint))]">{label}</span>
      <span className="truncate capitalize" style={tone ? { color: `hsl(${tone})` } : undefined}>
        {value.replace(/_/g, " ")}
      </span>
    </div>
  );
}
