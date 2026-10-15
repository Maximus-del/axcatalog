// Which collections (client destinations) a product belongs to — tap to tag
// or untag. A tagged product appears in that locker in the client's portal.
import { Check, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/admin-v2/primitives";
import { useProductCollectionOptions, useSetProductCollection } from "@/lib/v2/product-collections";

export default function ProductCollectionsCard({
  productId,
  entityIds,
  currentIds,
  status,
}: {
  productId: string;
  entityIds: string[];
  currentIds: string[];
  status: string;
}) {
  const options = useProductCollectionOptions(productId, entityIds, currentIds);
  const set = useSetProductCollection(productId);
  const tagged = new Set(currentIds);
  const list = options.data ?? [];

  return (
    <Card>
      <h3 className="text-[13px] font-semibold">Collections</h3>
      <p className="mt-1 text-[12px] text-[hsl(var(--ax-faint))]">
        Tap to tag. A tagged product shows in that collection in the client&apos;s portal
        {status === "archived" ? " (under Archive, still orderable)" : status === "draft" ? " once it is published" : ""}.
      </p>
      {entityIds.length === 0 && currentIds.length === 0 ? (
        <p className="mt-3 text-[12px] text-[hsl(var(--ax-amber))]">Link this product to a client first.</p>
      ) : options.isLoading ? (
        <p className="mt-3 text-[12px] text-[hsl(var(--ax-faint))]">Loading collections…</p>
      ) : options.isError ? (
        <p className="mt-3 text-[12px] text-[hsl(var(--ax-amber))]">Collections did not load. Refresh to try again.</p>
      ) : list.length === 0 ? (
        <p className="mt-3 text-[12px] text-[hsl(var(--ax-faint))]">This client has no collections yet.</p>
      ) : (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {list.map((c) => {
            const on = tagged.has(c.id);
            const busy = set.isPending && set.variables?.collectionId === c.id;
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={on}
                disabled={set.isPending}
                title={c.name}
                onClick={() =>
                  set.mutate(
                    { collectionId: c.id, on: !on },
                    {
                      onSuccess: () => toast.success(on ? `Removed from ${c.label ?? c.name}` : `Added to ${c.label ?? c.name}`),
                      onError: (e) => toast.error(e.message),
                    },
                  )
                }
                className={`flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-[12px] transition-colors disabled:opacity-60 ${
                  on
                    ? "border-[hsl(var(--ax-accent))] text-[hsl(var(--ax-ink))]"
                    : "border-[hsl(var(--ax-border))] text-[hsl(var(--ax-secondary))] hover:border-[hsl(var(--ax-accent)/0.6)]"
                }`}
              >
                {busy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : on ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <Plus className="h-3.5 w-3.5" />
                )}
                {c.accent && <span className="h-2 w-2 rounded-full" style={{ background: c.accent }} aria-hidden />}
                {c.label ?? c.name}
              </button>
            );
          })}
        </div>
      )}
    </Card>
  );
}
