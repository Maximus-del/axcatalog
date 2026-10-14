// Global system prompts — one copy, used everywhere.
//
// The canonical text lives here in code rather than in a seed row, for two
// reasons: a brand-new org gets the current best prompt with no setup step, and
// "reset to default" is just deleting the override. The `system_prompts` table
// stores only what an admin has changed.
//
// PNG Creation is deliberately NOT part of the design-template prompt system.
// That system generates new creative direction; this one is a production
// utility that extracts artwork already sitting inside a mockup. Keeping them
// apart is what stops someone reaching for "variation B" when all they wanted
// was a print file.
import { supabase } from "@/integrations/supabase/client";

export const PNG_CREATION_KEY = "png_creation";

export interface SystemPromptDef {
  key: string;
  name: string;
  category: string;
  /** One line, shown next to the Copy button wherever the prompt appears. */
  description: string;
  body: string;
}

export const PNG_CREATION_DEFAULT: SystemPromptDef = {
  key: PNG_CREATION_KEY,
  name: "PNG Creation",
  category: "Production Utility",
  description:
    "Extract the artwork from a mockup or flattened image into a transparent production-ready PNG.",
  body: `Extract the primary apparel graphic from the provided image and recreate it as a clean, isolated production-ready design asset.

Preserve the original artwork as accurately as possible, including:
- Typography
- Layout
- Graphic elements
- Colors
- Distressing
- Texture
- Line work
- Relative spacing
- Overall composition

Remove everything that is not part of the actual printable design. Remove:
- Shirt or garment
- Model/person
- Background
- Room or environment
- Mockup shadows
- Fabric texture
- Folds
- Wrinkles
- Lighting effects caused by the garment
- Hangers
- Tags
- Product photography
- Any surrounding objects

The final result should contain only the isolated graphic artwork.

Reconstruct any areas of the design that are partially distorted, curved, folded, obscured, or affected by the garment so the artwork appears flat and complete.

Keep the design centered and maintain the original proportions.

Do not redesign, reinterpret, modernize, or add new creative elements. The goal is to faithfully extract the existing design into a production-ready asset.

Final output requirements:
- Transparent background
- PNG
- High resolution
- Clean edges
- No garment
- No mockup
- No background
- No unnecessary shadows
- No surrounding environment
- No added text or graphics
- Artwork only

The final image should be suitable for apparel printing, including DTG, DTF, screen printing preparation, or product mockup creation.`,
};

export const SYSTEM_PROMPT_DEFAULTS: Record<string, SystemPromptDef> = {
  [PNG_CREATION_KEY]: PNG_CREATION_DEFAULT,
};

/**
 * Assemble what actually gets copied.
 *
 * The master prompt is never edited per use — a design name and any extra
 * instructions are appended after it. That is the whole reason this stays a
 * single prompt instead of sprouting variants.
 */
export function composeSystemPrompt(input: {
  body: string;
  designName?: string | null;
  additionalInstructions?: string | null;
}): string {
  const parts = [input.body.trim()];

  const name = input.designName?.trim();
  if (name) parts.push(`DESIGN NAME\n${name}`);

  const extra = input.additionalInstructions?.trim();
  if (extra) parts.push(`ADDITIONAL INSTRUCTIONS\n${extra}`);

  return parts.join("\n\n");
}

export interface SystemPrompt extends SystemPromptDef {
  /** True when an admin has edited it away from the shipped default. */
  customized: boolean;
  updated_at: string | null;
}

function withDefault(key: string, row: { body: string; name: string | null; updated_at: string } | null): SystemPrompt {
  const def = SYSTEM_PROMPT_DEFAULTS[key];
  if (!def) throw new Error(`Unknown system prompt: ${key}`);
  if (!row) return { ...def, customized: false, updated_at: null };
  return {
    ...def,
    name: row.name?.trim() || def.name,
    body: row.body,
    customized: true,
    updated_at: row.updated_at,
  };
}

// Cached per org+key: the prompt is read on nearly every upload surface and it
// changes about once a quarter.
const cache = new Map<string, Promise<SystemPrompt>>();

export function invalidateSystemPrompt(organizationId: string, key: string): void {
  cache.delete(`${organizationId}::${key}`);
}

export async function loadSystemPrompt(organizationId: string, key: string): Promise<SystemPrompt> {
  const cacheKey = `${organizationId}::${key}`;
  const hit = cache.get(cacheKey);
  if (hit) return hit;

  const request = (async () => {
    const { data, error } = await supabase
      .from("system_prompts" as never)
      .select("body, name, updated_at")
      .eq("organization_id", organizationId)
      .eq("key", key)
      .maybeSingle();
    // A read failure must not block an upload — fall back to the shipped text.
    if (error) return withDefault(key, null);
    return withDefault(key, (data ?? null) as unknown as { body: string; name: string | null; updated_at: string } | null);
  })();

  cache.set(cacheKey, request);
  return request;
}

export async function saveSystemPrompt(input: {
  organization_id: string;
  key: string;
  body: string;
  name?: string | null;
  notes?: string | null;
}): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase.from("system_prompts" as never).upsert(
    {
      organization_id: input.organization_id,
      key: input.key,
      body: input.body,
      name: input.name ?? SYSTEM_PROMPT_DEFAULTS[input.key]?.name ?? null,
      notes: input.notes ?? null,
      updated_at: new Date().toISOString(),
      updated_by: auth.user?.id ?? null,
    } as never,
    { onConflict: "organization_id,key" },
  );
  if (error) throw error;
  invalidateSystemPrompt(input.organization_id, input.key);
}

/** Reset is deleting the override, not writing the default back in. */
export async function resetSystemPrompt(organizationId: string, key: string): Promise<void> {
  const { error } = await supabase
    .from("system_prompts" as never)
    .delete()
    .eq("organization_id", organizationId)
    .eq("key", key);
  if (error) throw error;
  invalidateSystemPrompt(organizationId, key);
}

/**
 * Does this concept have its production PNG yet?
 *
 * Derived from the design link rather than stored, so it can never disagree
 * with reality — the same reasoning as product lifecycle.
 */
export function productionPngState(product: { designs?: { design_id: string }[] | null }): "pending" | "ready" {
  return (product.designs?.length ?? 0) > 0 ? "ready" : "pending";
}

/** What the operator confirms before the file becomes the production design. */
export const PRODUCTION_FILE_CHECKS = [
  "Transparent background",
  "Artwork only",
  "High resolution",
  "Correct colors",
  "Correct text",
  "No garment/background",
] as const;
