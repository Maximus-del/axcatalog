import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, Inbox, Search, UserPlus } from "lucide-react";
import { useAssignDesigns, useEntities, useUnassignedDesigns, useUploadToInbox } from "@/lib/v2/data";
import { planDrop, titleFromFilename } from "@/lib/v2/drop-files";
import DropZone, { DropTrigger } from "./DropZone";
import { AssetImage, EmptyState, ErrorState, Skeleton } from "./primitives";

// THE DESIGN INBOX — artwork that belongs to nobody yet.
//
// Every design surface in V2 is scoped to an entity, so a design with no
// athlete appeared NOWHERE. 54 of 123 designs are in exactly that state: a
// pile that has been quietly accumulating and could neither be used nor
// cleaned up.
//
// This is the other half of how artwork actually arrives. Sometimes you know
// whose it is and drop it on their profile; sometimes you empty a folder of
// forty exports and work out whose they are afterwards. The second order needs
// somewhere for them to land.

/** The AX house organisation. Inbox uploads belong to AX until they are filed. */
const AX_ORG = "2d6f377e-4fe8-448b-84b3-42aed237f3da";

export default function DesignInbox() {
  const inbox = useUnassignedDesigns();
  const entities = useEntities();
  const assign = useAssignDesigns();
  const upload = useUploadToInbox(AX_ORG);

  const [selected, setSelected] = useState<string[]>([]);
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState("");

  const designs = inbox.data ?? [];
  const people = useMemo(() => {
    const all = (entities.data ?? []).filter((e) => !e.isDemo);
    const q = query.trim().toLowerCase();
    return q ? all.filter((e) => e.name.toLowerCase().includes(q)) : all;
  }, [entities.data, query]);

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const acceptFiles = (files: File[]) => {
    const plan = planDrop(files);
    if (plan.accepted.length === 0) {
      toast.error("Nothing there AX can store", {
        description: plan.rejected.length > 0 ? plan.rejected.map((r) => r.name).join(", ") : "Images only.",
      });
      return;
    }
    upload.mutate(
      { files: plan.accepted, titleFor: (file) => titleFromFilename(file.name) || "Untitled design" },
      {
        onSuccess: ({ uploaded, failed }) => {
          if (failed.length > 0) {
            toast.warning(`${uploaded.length} in the inbox, ${failed.length} could not be`, {
              description: failed[0].name,
            });
          } else {
            toast.success(`${uploaded.length} in the inbox`, { description: "File them onto people when you are ready." });
          }
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : "Could not upload those"),
      },
    );
  };

  const assignTo = (entityId: string, entityName: string) => {
    assign.mutate(
      { designIds: selected, entityIds: [entityId] },
      {
        onSuccess: ({ linked }) => {
          toast.success(`${linked} filed onto ${entityName}`, {
            description: "They are on that profile's design shelves now.",
          });
          setSelected([]);
          setPicking(false);
          setQuery("");
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : "Could not file those"),
      },
    );
  };

  if (inbox.isError) {
    return <ErrorState error={inbox.error} what="the design inbox" onRetry={() => void inbox.refetch()} />;
  }

  return (
    <DropZone onFiles={acceptFiles} busy={upload.isPending} label="Drop artwork into the inbox" className="rounded-2xl">
      <section className="ax-card p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Inbox className="h-4 w-4 shrink-0 text-[hsl(var(--ax-accent))]" aria-hidden />
            <h2 className="text-[15px] font-semibold">Design inbox</h2>
            <span className="text-[12px] tabular-nums text-[hsl(var(--ax-faint))]">
              {designs.length} unassigned
            </span>
          </div>
          <DropTrigger onFiles={acceptFiles} busy={upload.isPending}>
            Upload designs
          </DropTrigger>
        </div>

        <p className="mb-3 text-[11.5px] text-[hsl(var(--ax-faint))]">
          Artwork that is not on anyone yet. Drop a folder here, then file them onto people.
        </p>

        {/*
          THE BULK BAR. Filing forty designs one at a time is the chore this
          screen exists to remove, so selection is the primary interaction and
          the picker takes the whole selection at once.
        */}
        {selected.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-[hsl(var(--ax-accent))] bg-[hsl(var(--ax-accent)/0.08)] px-3 py-2">
            <span className="text-[12px] font-medium text-[hsl(var(--ax-accent))]">{selected.length} selected</span>
            <button
              type="button"
              onClick={() => setPicking((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--ax-border))] bg-[hsl(var(--ax-card))] px-3 py-1 text-[11.5px] text-[hsl(var(--ax-secondary))] hover:text-[hsl(var(--ax-ink))]"
            >
              <UserPlus className="h-3 w-3" />
              Assign to…
            </button>
            <button
              type="button"
              onClick={() => setSelected([])}
              className="text-[11px] text-[hsl(var(--ax-faint))] hover:text-[hsl(var(--ax-ink))]"
            >
              Clear
            </button>
          </div>
        )}

        {picking && selected.length > 0 && (
          <div className="mb-3 rounded-xl border border-[hsl(var(--ax-border))] p-3">
            <div className="mb-2 flex items-center gap-2 rounded-lg border border-[hsl(var(--ax-border))] bg-[hsl(var(--ax-card))] px-2.5 py-1.5">
              <Search className="h-3.5 w-3.5 shrink-0 text-[hsl(var(--ax-faint))]" aria-hidden />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find a person or organisation"
                className="min-w-0 flex-1 bg-transparent text-[12px] outline-none"
              />
            </div>
            <div className="grid max-h-[220px] grid-cols-2 gap-1.5 overflow-y-auto sm:grid-cols-3">
              {people.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  disabled={assign.isPending}
                  onClick={() => assignTo(e.id, e.name)}
                  className="flex items-center gap-2 rounded-lg border border-[hsl(var(--ax-border))] px-2 py-1.5 text-left text-[11.5px] text-[hsl(var(--ax-secondary))] transition-colors hover:border-[hsl(var(--ax-accent))] hover:text-[hsl(var(--ax-ink))] disabled:opacity-50"
                >
                  <AssetImage
                    url={e.avatarUrl}
                    alt={e.name}
                    className="h-6 w-6 shrink-0 rounded-md"
                    fallbackSeed={e.id}
                  />
                  <span className="min-w-0 truncate">{e.name}</span>
                </button>
              ))}
              {people.length === 0 && (
                <p className="col-span-full py-3 text-center text-[11.5px] text-[hsl(var(--ax-faint))]">
                  Nobody matches that.
                </p>
              )}
            </div>
          </div>
        )}

        {inbox.isLoading ? (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="aspect-square" />
            ))}
          </div>
        ) : designs.length === 0 ? (
          <EmptyState>
            Nothing waiting. Anything you upload here stays until you file it onto someone.
          </EmptyState>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 lg:grid-cols-8">
            {designs.map((d) => {
              const isSelected = selected.includes(d.id);
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => toggle(d.id)}
                  title={d.title}
                  className={`relative overflow-hidden rounded-xl border text-left transition-all ${
                    isSelected
                      ? "border-[hsl(var(--ax-accent))] ring-1 ring-[hsl(var(--ax-accent))]"
                      : "border-[hsl(var(--ax-border))] hover:border-[hsl(var(--ax-accent)/0.6)]"
                  }`}
                >
                  <AssetImage
                    bucket={d.fileBucket}
                    path={d.filePath}
                    alt={d.title}
                    className="aspect-square w-full bg-black/40"
                    fit="contain"
                    fallbackSeed={d.id}
                  />
                  {isSelected && (
                    <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[hsl(var(--ax-accent))]">
                      <Check className="h-2.5 w-2.5 text-[hsl(var(--ax-on-accent))]" />
                    </span>
                  )}
                  <span className="block truncate px-1.5 py-1 text-[10px] text-[hsl(var(--ax-secondary))]">
                    {d.title || "Untitled"}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </DropZone>
  );
}
