// Adding someone to AX, from V2.
//
// People's "Add someone" used to send the operator to V1's athlete form, which
// only knows athletes (first + last name, team, jersey). An organisation like a
// gym went in as first="Proactive" last="Sports Performance" and every screen
// then had to undo that. Here the entity is created the way the model says it
// is: one display name, an entity type (what it IS) and roles (how AX works
// with it), written to the same `athletes` table so everything that already
// FKs to athletes — designs, mockups, products, collections, orders — works
// unchanged.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { slugify } from "@/lib/slug";
import { isPerson, type AxRole, type EntityType } from "@/lib/ecosystem/entity";

export interface NewEntityDraft {
  name: string;
  entityType: EntityType;
  roles: AxRole[];
  /** People only. Optional — some athletes go by one name. */
  lastName?: string;
}

export interface NewEntityRow {
  first_name: string;
  last_name: string;
  display_name: string;
  slug: string;
  entity_type: EntityType;
  roles: AxRole[];
  status: "active";
}

/** Pure: the form → the row. Throws a sentence the operator can act on. */
export function entityRow(draft: NewEntityDraft): NewEntityRow {
  const name = draft.name.replace(/\s+/g, " ").trim();
  if (!name) throw new Error("Give them a name.");
  if (draft.roles.length === 0) throw new Error("Pick at least one way AX works with them.");
  const person = isPerson(draft.entityType);
  const last = person ? (draft.lastName ?? "").replace(/\s+/g, " ").trim() : "";
  const display = last ? `${name} ${last}` : name;
  const slug = slugify(display);
  if (!slug) throw new Error("That name has no letters or numbers to build an address from.");
  return {
    // A non-person has ONE name. first_name carries it because the column is
    // required; last_name stays empty so full_name (first || ' ' || last) is clean.
    first_name: name,
    last_name: last,
    display_name: display,
    slug,
    entity_type: draft.entityType,
    roles: Array.from(new Set(draft.roles)),
    status: "active",
  };
}

/** "proactive" → "proactive-2", "proactive-2" → "proactive-3". */
export function nextSlug(slug: string): string {
  const m = slug.match(/^(.*)-(\d+)$/);
  return m ? `${m[1]}-${Number(m[2]) + 1}` : `${slug}-2`;
}

export function useCreateEntity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (draft: NewEntityDraft): Promise<{ id: string }> => {
      const row = entityRow(draft);
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("You are signed out.");
      const { data: profile, error: pErr } = await supabase
        .from("user_profiles")
        .select("organization_id")
        .eq("id", userId)
        .maybeSingle();
      if (pErr) throw new Error(pErr.message);
      if (!profile?.organization_id) throw new Error("Your account has no organisation to add them to.");

      // The slug is unique per organisation. A clash means a namesake already
      // exists — give this one the next free address rather than failing.
      let slug = row.slug;
      for (let attempt = 0; attempt < 6; attempt++) {
        const { data, error } = await supabase
          .from("athletes")
          .insert({ ...row, slug, organization_id: profile.organization_id } as never)
          .select("id")
          .single();
        if (!error && data) return { id: String((data as { id: string }).id) };
        if (error?.code !== "23505") throw new Error(error?.message ?? "Could not add them.");
        slug = nextSlug(slug);
      }
      throw new Error("Every address for that name is taken. Try a more specific name.");
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["v2", "entities"] });
    },
  });
}
