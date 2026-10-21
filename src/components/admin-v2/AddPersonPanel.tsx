import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { AX_ROLES, ENTITY_TYPES, isPerson, type AxRole, type EntityType } from "@/lib/ecosystem/entity";
import { entityRow, useCreateEntity } from "@/lib/v2/add-entity";

// Add someone, without leaving V2. Name, what they are, how AX works with them
// — everything else (portal look, products, client login) is set up from their
// page, which is where this sends you once they exist.

const field =
  "w-full rounded-lg border border-[hsl(var(--ax-border))] bg-white px-3 py-2 text-[13px] outline-none focus:border-[hsl(var(--ax-accent))]";

export default function AddPersonPanel({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState("");
  const [lastName, setLastName] = useState("");
  const [entityType, setEntityType] = useState<EntityType>("person");
  const [roles, setRoles] = useState<AxRole[]>(["client"]);
  const create = useCreateEntity();
  const person = isPerson(entityType);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  let preview = "";
  let problem = "";
  try {
    preview = entityRow({ name, lastName, entityType, roles }).display_name;
  } catch (e) {
    problem = e instanceof Error ? e.message : "";
  }

  const toggleRole = (r: AxRole) => setRoles((cur) => (cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r]));

  const submit = async () => {
    try {
      const { id } = await create.mutateAsync({ name, lastName, entityType, roles });
      toast.success(`${preview} added`);
      onCreated(id);
    } catch (e) {
      toast.error("Not added", { description: e instanceof Error ? e.message : undefined });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-labelledby="add-person-title">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-[#142b3c]/50" />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="relative flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-[hsl(var(--ax-border))] bg-white sm:rounded-2xl"
      >
        <div className="flex items-center gap-3 border-b border-[hsl(var(--ax-line))] px-5 py-4">
          <h2 id="add-person-title" className="flex-1 text-[17px] font-bold">
            Add someone
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1.5 text-[hsl(var(--ax-secondary))] hover:bg-black/5">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 overflow-y-auto px-5 py-5">
          <fieldset>
            <legend className="text-[12px] font-semibold text-[hsl(var(--ax-secondary))]">What are they?</legend>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {ENTITY_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  title={t.blurb}
                  aria-pressed={entityType === t.value}
                  onClick={() => setEntityType(t.value)}
                  className={`rounded-full border px-3 py-1.5 text-[12px] ${
                    entityType === t.value
                      ? "border-[hsl(var(--ax-accent))] bg-[hsl(var(--ax-accent))] text-white"
                      : "border-[hsl(var(--ax-border))] text-[hsl(var(--ax-secondary))] hover:text-[hsl(var(--ax-ink))]"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </fieldset>

          <div className={person ? "grid grid-cols-2 gap-3" : ""}>
            <label className="block text-[12px] font-semibold text-[hsl(var(--ax-secondary))]">
              {person ? "First name" : "Name"}
              <input
                autoFocus
                className={`${field} mt-1.5`}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={person ? "Darnell" : "Proactive Sports Performance"}
                required
              />
            </label>
            {person && (
              <label className="block text-[12px] font-semibold text-[hsl(var(--ax-secondary))]">
                Last name
                <input className={`${field} mt-1.5`} value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Mooney" />
              </label>
            )}
          </div>

          <fieldset>
            <legend className="text-[12px] font-semibold text-[hsl(var(--ax-secondary))]">How does AX work with them?</legend>
            <div className="mt-2 space-y-1.5">
              {AX_ROLES.map((r) => (
                <label key={r.value} className="flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-1.5 hover:bg-black/[0.03]">
                  <input type="checkbox" className="mt-0.5" checked={roles.includes(r.value)} onChange={() => toggleRole(r.value)} />
                  <span className="text-[13px]">
                    <strong className="font-semibold">{r.label}</strong>
                    <span className="block text-[12px] text-[hsl(var(--ax-faint))]">{r.blurb}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        <div className="flex items-center gap-3 border-t border-[hsl(var(--ax-line))] px-5 py-4">
          <span className="flex-1 truncate text-[12px] text-[hsl(var(--ax-faint))]">{problem && name ? problem : preview}</span>
          <button type="button" onClick={onClose} className="rounded-full px-4 py-2 text-[13px] text-[hsl(var(--ax-secondary))]">
            Cancel
          </button>
          <button
            type="submit"
            disabled={!!problem || create.isPending}
            className="flex items-center gap-1.5 rounded-full bg-[hsl(var(--ax-accent))] px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
          >
            {create.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Add
          </button>
        </div>
      </form>
    </div>
  );
}
