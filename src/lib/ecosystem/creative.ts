// ─────────────────────────────────────────────────────────────────────────
// CREATIVE RECIPE domain: the production side of a design template.
//
// A template stops being a reference and becomes a formula — versioned master
// prompts, curated reference sets, and a collection recipe. Applying it to an
// athlete produces an INSTANCE that carries that athlete's resolved variables
// and direction; the global template is never written to from the athlete
// workflow. Compiling combines the two into one prompt ready to paste into a
// generation tool, snapshotted as a prompt package so it stays reproducible.
//
// The compiler and variable resolver below are PURE — they are the part worth
// testing, and they must not reach for the network.
// ─────────────────────────────────────────────────────────────────────────
import { supabase } from "@/integrations/supabase/client";

// ---- Variables -----------------------------------------------------------

export const VARIABLE_TOKENS = [
  "ATHLETE_NAME",
  "FIRST_NAME",
  "LAST_NAME",
  "NUMBER",
  "POSITION",
  "SPORT",
  "CITY",
  "TEAM",
  "COLOR_PALETTE",
  "COLLECTION_NAME",
  "YEAR",
  "PHRASE",
  "ATHLETE_IDEA",
  "PRODUCT_TYPE",
] as const;

export type VariableToken = (typeof VARIABLE_TOKENS)[number];
export type Variables = Partial<Record<VariableToken, string>>;

/** Human labels for the instance editor. */
export const VARIABLE_LABELS: Record<VariableToken, string> = {
  ATHLETE_NAME: "Athlete",
  FIRST_NAME: "First name",
  LAST_NAME: "Last name",
  NUMBER: "Number",
  POSITION: "Position",
  SPORT: "Sport",
  CITY: "City",
  TEAM: "Team / school",
  COLOR_PALETTE: "Colors",
  COLLECTION_NAME: "Collection name",
  YEAR: "Year",
  PHRASE: "Phrase",
  ATHLETE_IDEA: "Athlete idea",
  PRODUCT_TYPE: "Product",
};

export interface AthleteSource {
  full_name: string | null;
  first_name: string;
  last_name: string;
  jersey_number: string | number | null;
  position: string | null;
  league: string | null;
}

export interface TeamSource {
  name: string | null;
  city: string | null;
  primary_color: string | null;
  secondary_color: string | null;
}

const clean = (v: unknown): string => (v === null || v === undefined ? "" : String(v).trim());

/**
 * Everything the system can already know, filled in without asking the operator.
 * Explicit overrides always win — an operator correction must never be
 * clobbered by a re-resolve.
 */
export function resolveAthleteVariables(input: {
  athlete: AthleteSource;
  team?: TeamSource | null;
  sport?: string | null;
  collectionName?: string | null;
  productType?: string | null;
  athleteIdea?: string | null;
  year?: string | number | null;
  overrides?: Variables;
}): Variables {
  const { athlete, team } = input;
  const fullName = clean(athlete.full_name) || `${clean(athlete.first_name)} ${clean(athlete.last_name)}`.trim();
  const colors = [team?.primary_color, team?.secondary_color].map(clean).filter(Boolean).join(", ");

  const resolved: Variables = {
    ATHLETE_NAME: fullName,
    FIRST_NAME: clean(athlete.first_name),
    LAST_NAME: clean(athlete.last_name),
    NUMBER: clean(athlete.jersey_number),
    POSITION: clean(athlete.position),
    SPORT: clean(input.sport) || clean(athlete.league),
    CITY: clean(team?.city),
    TEAM: clean(team?.name),
    COLOR_PALETTE: colors,
    COLLECTION_NAME: clean(input.collectionName),
    YEAR: clean(input.year),
    PHRASE: "",
    ATHLETE_IDEA: clean(input.athleteIdea),
    PRODUCT_TYPE: clean(input.productType),
  };

  for (const [k, v] of Object.entries(input.overrides ?? {})) {
    const value = clean(v);
    if (value) resolved[k as VariableToken] = value;
  }

  // Drop empties so callers can treat "present" as "usable".
  return Object.fromEntries(Object.entries(resolved).filter(([, v]) => clean(v))) as Variables;
}

const TOKEN_RE = /\{\{\s*([A-Z_]+)\s*\}\}/g;

/** Tokens a prompt body actually references. */
export function extractTokens(body: string): string[] {
  return Array.from(new Set(Array.from(body.matchAll(TOKEN_RE)).map((m) => m[1])));
}

/**
 * Substitute what we have. Unresolved tokens are left visible rather than
 * silently blanked — a prompt that says {{NUMBER}} is obviously incomplete,
 * a prompt with a hole in the sentence is not.
 */
export function applyTokens(body: string, variables: Variables): string {
  return body.replace(TOKEN_RE, (match, token: string) => {
    const value = clean(variables[token as VariableToken]);
    return value || match;
  });
}

/** Required tokens with no value yet — surfaced before the operator generates. */
export function missingVariables(body: string, required: string[], variables: Variables): string[] {
  const needed = new Set([...extractTokens(body), ...required]);
  return Array.from(needed).filter((t) => !clean(variables[t as VariableToken]));
}

// ---- Creative directions -------------------------------------------------

export type DirectionMode = "closest" | "athlete" | "fashion";

export const DIRECTION_MODES: { value: DirectionMode; label: string; blurb: string; instruction: string }[] = [
  {
    value: "closest",
    label: "Closest to Template",
    blurb: "Preserve the strongest characteristics of the style.",
    instruction:
      "Stay close to the established visual system. Preserve its strongest, most recognizable characteristics — typography, composition, and treatment should read unmistakably as this style.",
  },
  {
    value: "athlete",
    label: "More Athlete-Specific",
    blurb: "Push the athlete's personal story and symbols further.",
    instruction:
      "Lean harder into this athlete's personal story and symbolism. Let their specific identity, imagery, and details drive the composition while the style system stays as the underlying framework.",
  },
  {
    value: "fashion",
    label: "More Fashion-Forward",
    blurb: "Interpret the same Style DNA in a more elevated direction.",
    instruction:
      "Interpret the same style DNA in a more elevated, fashion-forward direction. Favor restraint, considered scale, and premium finish over literal sports-merch conventions, without losing the style's core identity.",
  },
];

// ---- Output requirements -------------------------------------------------

/**
 * Appended to every compiled prompt. The whole point of the system is isolated,
 * print-ready artwork — never a mockup — so this is not optional per-prompt.
 */
export const DEFAULT_OUTPUT_REQUIREMENTS = `OUTPUT REQUIREMENTS
Create only the isolated apparel graphic — the artwork itself, nothing else.
No clothing mockup. No shirt, hoodie, or garment of any kind.
No person, model, or mannequin. No background scene, room, wall, or environment.
No frame, border, packaging, or photography.
The design must stand on its own as production artwork.
Artwork only, centered, on a fully transparent background.
High-resolution, suitable for DTG / DTF / screen-print preparation (PNG with alpha).`;

/**
 * References are a mood board, not source art. This wording is deliberate: it
 * asks for the shared language across the set and explicitly rules out copying
 * any one of them, which is what keeps output original rather than derivative.
 */
const REFERENCE_GUIDANCE = `Use the supplied reference images collectively as a visual mood board. Study the characteristics they share — typography, layout, hierarchy, graphic density, texture, color treatment, and spacing — and design to that shared language.

Create a new original composition. Do not reproduce, trace, or closely imitate any specific reference image, logo, mascot, illustration, or exact layout. The goal is to capture the broad design language, not to recreate another designer's artwork.`;

// ---- The compiler --------------------------------------------------------

export interface CompileInput {
  templateName: string;
  templateStyle?: string | null;
  promptBody: string;
  variables: Variables;
  athleteDirection?: string | null;
  directionMode?: DirectionMode;
  referenceSetName?: string | null;
  referenceCount?: number;
  outputRequirements?: string | null;
  /**
   * with_references = images will be attached alongside this prompt.
   * prompt_only = the prompt is proven enough to stand alone, so the reference
   * block is omitted even when a set is selected.
   */
  referenceMode?: ReferenceMode;
}

export type ReferenceMode = "with_references" | "prompt_only";

/**
 * One clean prompt, assembled from the template's master prompt, the athlete's
 * resolved variables, their direction, the chosen creative emphasis, reference
 * guidance, and the standard output block — in that order, because generation
 * tools weight early instructions more heavily and the style system is what we
 * most want preserved.
 */
export function compilePrompt(input: CompileInput): string {
  const vars = input.variables ?? {};
  const sections: string[] = [];

  sections.push(applyTokens(input.promptBody.trim(), vars));

  const detailKeys: VariableToken[] = [
    "ATHLETE_NAME", "LAST_NAME", "NUMBER", "POSITION", "SPORT", "TEAM", "CITY", "COLOR_PALETTE", "PHRASE", "PRODUCT_TYPE", "COLLECTION_NAME", "YEAR",
  ];
  const details = detailKeys
    .filter((k) => clean(vars[k]))
    .map((k) => `${VARIABLE_LABELS[k]}: ${clean(vars[k])}`);
  if (details.length) sections.push(`ATHLETE DETAILS\n${details.join("\n")}`);

  const direction = clean(input.athleteDirection) || clean(vars.ATHLETE_IDEA);
  if (direction) sections.push(`CREATIVE DIRECTION\n${direction}`);

  const mode = DIRECTION_MODES.find((m) => m.value === (input.directionMode ?? "closest"));
  if (mode) sections.push(`EMPHASIS — ${mode.label.toUpperCase()}\n${mode.instruction}`);

  if ((input.referenceMode ?? "with_references") === "with_references" && input.referenceCount && input.referenceCount > 0) {
    const named = clean(input.referenceSetName);
    const header = named
      ? `REFERENCES — ${named} (${input.referenceCount} image${input.referenceCount === 1 ? "" : "s"})`
      : `REFERENCES (${input.referenceCount} image${input.referenceCount === 1 ? "" : "s"})`;
    sections.push(`${header}\n${REFERENCE_GUIDANCE}`);
  }

  sections.push(clean(input.outputRequirements) || DEFAULT_OUTPUT_REQUIREMENTS);

  return sections.join("\n\n");
}

// ---- Master prompts (versioned) -----------------------------------------

export type PromptVariation = "classic" | "creative" | "experimental";

export const PROMPT_VARIATIONS: { value: PromptVariation; label: string; blurb: string }[] = [
  { value: "classic", label: "Classic", blurb: "The dependable read of this style." },
  { value: "creative", label: "Creative", blurb: "Looser interpretation, more invention." },
  { value: "experimental", label: "Experimental", blurb: "Push the style somewhere new." },
];

/**
 * A prompt is either the template's MASTER prompt (reference_set_id null, keyed
 * by variation) or a REFERENCE SET's prompt (keyed by role). Same table, because
 * promoting a strong set prompt toward the master is then a flag, not a move.
 */
export type PromptRole = "master" | "primary" | "backup" | "alt";

export const SET_PROMPT_ROLES: { value: PromptRole; label: string; blurb: string }[] = [
  { value: "primary", label: "Primary", blurb: "Our best prompt for this set." },
  { value: "backup", label: "Backup", blurb: "A different strategy for the same style — not a reword." },
  { value: "alt", label: "Alternate", blurb: "A third approach when the first two miss." },
];

export interface TemplatePrompt {
  id: string;
  organization_id: string | null;
  template_id: string;
  reference_set_id: string | null;
  role: PromptRole;
  variation: PromptVariation;
  version: number;
  title: string | null;
  body: string;
  output_requirements: string | null;
  required_variables: string[];
  is_current_best: boolean;
  master_candidate: boolean;
  notes: string | null;
  created_at: string;
}

const PROMPT_COLUMNS =
  "id, organization_id, template_id, reference_set_id, role, variation, version, title, body, " +
  "output_requirements, required_variables, is_current_best, master_candidate, notes, created_at";

/** Every prompt for a template — master and all reference-set prompts. */
export async function listTemplatePrompts(templateId: string): Promise<TemplatePrompt[]> {
  const { data, error } = await supabase
    .from("design_template_prompts" as never)
    .select(PROMPT_COLUMNS)
    .eq("template_id", templateId)
    .order("version", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as TemplatePrompt[];
}

/** The master prompt to use for a variation: current best, else newest. */
export function pickCurrentPrompt(prompts: TemplatePrompt[], variation: PromptVariation = "classic"): TemplatePrompt | null {
  const master = prompts.filter((p) => !p.reference_set_id);
  const inVariation = master.filter((p) => p.variation === variation);
  const pool = inVariation.length ? inVariation : master;
  return pool.find((p) => p.is_current_best) ?? pool[0] ?? null;
}

/** The prompt to use for one reference set + role: current best, else newest. */
export function pickSetPrompt(prompts: TemplatePrompt[], referenceSetId: string, role: PromptRole = "primary"): TemplatePrompt | null {
  const pool = prompts.filter((p) => p.reference_set_id === referenceSetId && p.role === role);
  return pool.find((p) => p.is_current_best) ?? pool[0] ?? null;
}

export interface SavePromptInput {
  organization_id: string;
  template_id: string;
  variation: PromptVariation;
  /** Omit for a master prompt; set for a reference-set prompt. */
  reference_set_id?: string | null;
  role?: PromptRole;
  title?: string | null;
  body: string;
  output_requirements?: string | null;
  required_variables?: string[];
  notes?: string | null;
  created_by?: string | null;
  /** Existing prompts, used to pick the next version number. */
  existing: TemplatePrompt[];
  makeCurrentBest?: boolean;
}

/** Next version within this scope — master variation, or set + role. */
export function nextPromptVersion(existing: TemplatePrompt[], scope: { reference_set_id?: string | null; role?: PromptRole; variation?: PromptVariation }): number {
  const setId = scope.reference_set_id ?? null;
  const inScope = setId
    ? existing.filter((p) => p.reference_set_id === setId && p.role === (scope.role ?? "primary"))
    : existing.filter((p) => !p.reference_set_id && p.variation === (scope.variation ?? "classic"));
  return Math.max(0, ...inScope.map((p) => p.version)) + 1;
}

/** Saving never edits history — it writes the next version within the scope. */
export async function savePromptVersion(input: SavePromptInput): Promise<string> {
  const referenceSetId = input.reference_set_id ?? null;
  const role: PromptRole = referenceSetId ? (input.role ?? "primary") : "master";
  const nextVersion = nextPromptVersion(input.existing, {
    reference_set_id: referenceSetId,
    role,
    variation: input.variation,
  });
  const row = {
    organization_id: input.organization_id,
    template_id: input.template_id,
    reference_set_id: referenceSetId,
    role,
    variation: input.variation,
    version: nextVersion,
    title: input.title?.trim() || null,
    body: input.body.trim(),
    output_requirements: input.output_requirements?.trim() || null,
    required_variables: input.required_variables ?? extractTokens(input.body),
    notes: input.notes?.trim() || null,
    created_by: input.created_by ?? null,
    is_current_best: false,
  };
  const { data, error } = await supabase.from("design_template_prompts" as never).insert(row as never).select("id").single();
  if (error) throw error;
  const id = (data as unknown as { id: string }).id;
  if (input.makeCurrentBest !== false) {
    if (referenceSetId) await setCurrentBestSetPrompt(referenceSetId, role, id);
    else await setCurrentBestPrompt(input.template_id, input.variation, id);
  }
  return id;
}

/** Exactly one current best per template+variation (enforced by a partial unique index). */
export async function setCurrentBestPrompt(templateId: string, variation: PromptVariation, promptId: string): Promise<void> {
  const clearErr = (
    await supabase
      .from("design_template_prompts" as never)
      .update({ is_current_best: false } as never)
      .eq("template_id", templateId)
      .is("reference_set_id", null)
      .eq("variation", variation)
      .eq("is_current_best", true)
  ).error;
  if (clearErr) throw clearErr;
  const { error } = await supabase
    .from("design_template_prompts" as never)
    .update({ is_current_best: true } as never)
    .eq("id", promptId);
  if (error) throw error;
}

/** Exactly one current best per reference set + role. */
export async function setCurrentBestSetPrompt(referenceSetId: string, role: PromptRole, promptId: string): Promise<void> {
  const clearErr = (
    await supabase
      .from("design_template_prompts" as never)
      .update({ is_current_best: false } as never)
      .eq("reference_set_id", referenceSetId)
      .eq("role", role)
      .eq("is_current_best", true)
  ).error;
  if (clearErr) throw clearErr;
  const { error } = await supabase
    .from("design_template_prompts" as never)
    .update({ is_current_best: true } as never)
    .eq("id", promptId);
  if (error) throw error;
}

/**
 * Mark a set prompt as worth folding into the master. Deliberately does NOT
 * rewrite the master — a human decides what made it work.
 */
export async function setMasterCandidate(promptId: string, value: boolean): Promise<void> {
  const { error } = await supabase
    .from("design_template_prompts" as never)
    .update({ master_candidate: value } as never)
    .eq("id", promptId);
  if (error) throw error;
}

// ---- Reference sets ------------------------------------------------------

export interface ReferenceImage {
  id: string;
  reference_set_id: string;
  url: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  title: string | null;
  sort_order: number;
  /** Only recommended images ride along in a prompt package. */
  is_recommended: boolean;
}

/** How much this set still leans on its images. Low = the prompt stands alone. */
export type ReferenceDependency = "high" | "medium" | "low";

export const DEPENDENCY_LABELS: Record<ReferenceDependency, string> = {
  high: "References needed",
  medium: "References recommended",
  low: "Prompt proven",
};

/** Structured observations about what the references share. Seeds prompt drafts. */
export const STYLE_NOTE_FIELDS = [
  { key: "typography", label: "Typography", hint: "Letterforms, weight, secondary type" },
  { key: "composition", label: "Composition", hint: "Arrangement, alignment, balance" },
  { key: "graphics", label: "Graphics", hint: "Marks, crests, illustration behaviour" },
  { key: "texture", label: "Texture", hint: "Distress, grain, print feel" },
  { key: "color", label: "Color", hint: "Palette logic and relationships" },
  { key: "hierarchy", label: "Hierarchy", hint: "What leads, what supports" },
  { key: "mood", label: "Mood", hint: "The feeling in one line" },
  { key: "apparel", label: "Apparel application", hint: "Placement, scale, print method" },
] as const;

export type StyleNoteKey = (typeof STYLE_NOTE_FIELDS)[number]["key"];
export type StyleNotes = Partial<Record<StyleNoteKey, string>>;

export interface ReferenceSet {
  id: string;
  organization_id: string | null;
  template_id: string;
  name: string;
  description: string | null;
  recommended_min: number;
  recommended_max: number;
  is_default: boolean;
  style_notes: StyleNotes;
  reference_dependency: ReferenceDependency;
  images: ReferenceImage[];
}

export const REFERENCE_BUCKET = "design-references";

/** Public URL for an image however it was stored. */
export function referenceImageUrl(img: ReferenceImage): string | null {
  if (img.url) return img.url;
  if (img.storage_path) {
    const bucket = img.storage_bucket || REFERENCE_BUCKET;
    return supabase.storage.from(bucket).getPublicUrl(img.storage_path).data.publicUrl;
  }
  return null;
}

export async function listReferenceSets(templateId: string): Promise<ReferenceSet[]> {
  const { data, error } = await supabase
    .from("reference_sets" as never)
    .select("id, organization_id, template_id, name, description, recommended_min, recommended_max, is_default, style_notes, reference_dependency")
    .eq("template_id", templateId)
    .order("is_default", { ascending: false })
    .order("name");
  if (error) throw error;
  const sets = (data ?? []) as unknown as Omit<ReferenceSet, "images">[];
  if (sets.length === 0) return [];
  const { data: imgs } = await supabase
    .from("reference_images" as never)
    .select("id, reference_set_id, url, storage_bucket, storage_path, title, sort_order, is_recommended")
    .in("reference_set_id", sets.map((s) => s.id))
    .order("sort_order");
  const bySet = new Map<string, ReferenceImage[]>();
  for (const i of ((imgs ?? []) as unknown as ReferenceImage[])) {
    if (!bySet.has(i.reference_set_id)) bySet.set(i.reference_set_id, []);
    bySet.get(i.reference_set_id)!.push(i);
  }
  return sets.map((s) => ({ ...s, images: bySet.get(s.id) ?? [] }));
}

export async function createReferenceSet(input: {
  organization_id: string;
  template_id: string;
  name: string;
  description?: string | null;
  created_by?: string | null;
}): Promise<string> {
  const { data, error } = await supabase
    .from("reference_sets" as never)
    .insert({
      organization_id: input.organization_id,
      template_id: input.template_id,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      created_by: input.created_by ?? null,
    } as never)
    .select("id")
    .single();
  if (error) throw error;
  return (data as unknown as { id: string }).id;
}

export async function deleteReferenceSet(id: string): Promise<void> {
  const { error } = await supabase.from("reference_sets" as never).delete().eq("id", id);
  if (error) throw error;
}

export async function addReferenceImageUrl(input: {
  organization_id: string;
  reference_set_id: string;
  url: string;
  title?: string | null;
  sort_order?: number;
}): Promise<void> {
  const { error } = await supabase.from("reference_images" as never).insert({
    organization_id: input.organization_id,
    reference_set_id: input.reference_set_id,
    url: input.url.trim(),
    title: input.title?.trim() || null,
    sort_order: input.sort_order ?? 0,
  } as never);
  if (error) throw error;
}

export async function uploadReferenceImage(input: {
  organization_id: string;
  reference_set_id: string;
  file: File;
  sort_order?: number;
}): Promise<void> {
  const ext = input.file.name.split(".").pop()?.toLowerCase() || "png";
  const path = `${input.reference_set_id}/${crypto.randomUUID()}.${ext}`;
  const up = await supabase.storage.from(REFERENCE_BUCKET).upload(path, input.file, { upsert: false });
  if (up.error) throw up.error;
  const { error } = await supabase.from("reference_images" as never).insert({
    organization_id: input.organization_id,
    reference_set_id: input.reference_set_id,
    storage_bucket: REFERENCE_BUCKET,
    storage_path: path,
    title: input.file.name,
    sort_order: input.sort_order ?? 0,
  } as never);
  if (error) throw error;
}

export async function removeReferenceImage(id: string): Promise<void> {
  const { error } = await supabase.from("reference_images" as never).delete().eq("id", id);
  if (error) throw error;
}

/** Marking an image recommended is what puts it in the generation package. */
export async function setImageRecommended(id: string, value: boolean): Promise<void> {
  const { error } = await supabase
    .from("reference_images" as never)
    .update({ is_recommended: value } as never)
    .eq("id", id);
  if (error) throw error;
}

export async function updateReferenceSet(
  id: string,
  patch: Partial<Pick<ReferenceSet, "name" | "description" | "style_notes" | "reference_dependency" | "is_default">>,
): Promise<void> {
  const { error } = await supabase
    .from("reference_sets" as never)
    .update({ ...patch, updated_at: new Date().toISOString() } as never)
    .eq("id", id);
  if (error) throw error;
}

/** The images a prompt package should carry: recommended ones, else the first few. */
export function packagedReferences(set: ReferenceSet | null | undefined): ReferenceImage[] {
  if (!set) return [];
  const recommended = set.images.filter((i) => i.is_recommended);
  if (recommended.length > 0) return recommended;
  return set.images.slice(0, set.recommended_max || 5);
}

export interface SetReadiness {
  hasPrimary: boolean;
  hasBackup: boolean;
  imageCount: number;
  recommendedCount: number;
  /** Short status for the card: what's missing, or that it's ready. */
  label: string;
  ready: boolean;
}

/**
 * Tells an operator at a glance which sub-styles can actually be used to
 * produce work today, versus which are still just a pile of images.
 */
export function referenceSetReadiness(set: ReferenceSet, prompts: TemplatePrompt[]): SetReadiness {
  const hasPrimary = !!pickSetPrompt(prompts, set.id, "primary");
  const hasBackup = !!pickSetPrompt(prompts, set.id, "backup");
  const imageCount = set.images.length;
  const recommendedCount = set.images.filter((i) => i.is_recommended).length;
  let label: string;
  if (hasPrimary && hasBackup) label = "Primary + Backup ready";
  else if (hasPrimary) label = "Primary ready";
  else label = "Needs prompt";
  return { hasPrimary, hasBackup, imageCount, recommendedCount, label, ready: hasPrimary };
}

export interface TemplateReadiness { items: { label: string; done: boolean }[]; done: number; total: number; productionReady: boolean }

/** A subtle "can we move fast with this style yet?" signal — not a scorecard. */
export function templateReadiness(input: {
  masterPrompt: boolean;
  referenceSets: number;
  setsWithPrimary: number;
  setsWithBackup: number;
  hasRecipe: boolean;
  hasStyleDna: boolean;
}): TemplateReadiness {
  const items = [
    { label: "Master prompt", done: input.masterPrompt },
    { label: "Reference sets", done: input.referenceSets > 0 },
    { label: "Primary prompts", done: input.referenceSets > 0 && input.setsWithPrimary === input.referenceSets },
    { label: "Backup prompts", done: input.referenceSets > 0 && input.setsWithBackup === input.referenceSets },
    { label: "Collection recipe", done: input.hasRecipe },
    { label: "Style DNA", done: input.hasStyleDna },
  ];
  const done = items.filter((i) => i.done).length;
  return { items, done, total: items.length, productionReady: done === items.length };
}

/**
 * Turn structured style observations into a prompt draft. No image analysis —
 * the operator looks at their own references, writes what they see, and this
 * assembles it into the shape a good prompt takes. Refined by hand from there.
 */
export function draftPromptFromNotes(input: {
  templateName: string;
  setName: string;
  notes: StyleNotes;
  role?: PromptRole;
}): string {
  const { notes } = input;
  const lines: string[] = [
    `Create an original apparel graphic for {{ATHLETE_NAME}} in the ${input.setName} interpretation of the ${input.templateName} visual system.`,
    "",
  ];
  for (const field of STYLE_NOTE_FIELDS) {
    const value = clean(notes[field.key]);
    if (!value) continue;
    lines.push(field.label.toUpperCase(), value, "");
  }
  if (input.role === "backup") {
    lines.push(
      "APPROACH",
      "Interpret the style more loosely than a literal reading — keep the same design family, but let composition and typographic relationships breathe. This is a different strategy toward the same look, not a reworded version of it.",
      "",
    );
  }
  lines.push(
    "ATHLETE DETAILS TO INCORPORATE",
    "Use {{LAST_NAME}}, number {{NUMBER}}, and {{COLOR_PALETTE}} where they strengthen the composition.",
    "",
    "ORIGINALITY",
    "Create an original composition. Do not reproduce or closely imitate any existing school, team, or brand mark, and do not use real trademarked logos or wordmarks.",
  );
  return lines.join("\n").trim();
}

// ---- Collection recipe ---------------------------------------------------

export interface RecipeSlot { name: string; purpose?: string }
export interface CollectionRecipe {
  designs?: RecipeSlot[];
  products?: string[];
  notes?: string;
}

export const DEFAULT_RECIPE: CollectionRecipe = {
  designs: [
    { name: "Primary Athlete Graphic", purpose: "Lead name/identity piece" },
    { name: "Secondary / Number Graphic", purpose: "Number or heritage mark" },
    { name: "Experimental Graphic", purpose: "Looser, more expressive take" },
  ],
  products: ["Heavyweight Tee", "Premium Hoodie", "Crewneck"],
};

export function parseRecipe(raw: unknown): CollectionRecipe {
  const r = (raw ?? {}) as CollectionRecipe;
  return {
    designs: Array.isArray(r.designs) ? r.designs.filter((d) => d && typeof d.name === "string") : [],
    products: Array.isArray(r.products) ? r.products.filter((p) => typeof p === "string") : [],
    notes: typeof r.notes === "string" ? r.notes : undefined,
  };
}

// ---- Athlete instance (the working version) ------------------------------

export interface InstanceRecord {
  id: string;
  organization_id: string;
  template_id: string | null;
  athlete_id: string;
  status: string;
  notes: string | null;
  variables: Variables;
  athlete_direction: string | null;
  default_reference_set_id: string | null;
  created_at: string;
}

export async function fetchInstance(id: string): Promise<InstanceRecord | null> {
  const { data, error } = await supabase
    .from("design_template_applications" as never)
    .select("id, organization_id, template_id, athlete_id, status, notes, variables, athlete_direction, default_reference_set_id, created_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as unknown as InstanceRecord | null;
}

export async function updateInstance(
  id: string,
  patch: Partial<Pick<InstanceRecord, "variables" | "athlete_direction" | "default_reference_set_id" | "status" | "notes">>,
): Promise<void> {
  const { error } = await supabase
    .from("design_template_applications" as never)
    .update({ ...patch, updated_at: new Date().toISOString() } as never)
    .eq("id", id);
  if (error) throw error;
}

/**
 * Free-text the athlete has already given us, newest first — the seed for
 * Athlete Direction so nobody retypes what the questionnaire already captured.
 */
export async function fetchAthleteFreeText(athleteId: string): Promise<string[]> {
  const { data: responses } = await supabase
    .from("questionnaire_responses" as never)
    .select("id")
    .eq("athlete_id", athleteId)
    .order("submitted_at", { ascending: false })
    .limit(5);
  const ids = ((responses ?? []) as unknown as { id: string }[]).map((r) => r.id);
  if (ids.length === 0) return [];
  const { data: answers } = await supabase
    .from("questionnaire_answers" as never)
    .select("text_value")
    .in("response_id", ids)
    .not("text_value", "is", null);
  return ((answers ?? []) as unknown as { text_value: string | null }[])
    .map((a) => clean(a.text_value))
    .filter(Boolean);
}

// ---- Prompt packages -----------------------------------------------------

export interface PromptPackage {
  id: string;
  organization_id: string;
  application_id: string | null;
  template_id: string | null;
  athlete_id: string | null;
  prompt_id: string | null;
  reference_set_id: string | null;
  collection_id: string | null;
  slot_id: string | null;
  label: string | null;
  variation: string;
  direction_mode: DirectionMode;
  variables: Variables;
  athlete_direction: string | null;
  compiled_prompt: string;
  status: string;
  rating: number | null;
  rating_notes: Record<string, unknown>;
  created_at: string;
}

export async function listPromptPackages(applicationId: string): Promise<PromptPackage[]> {
  const { data, error } = await supabase
    .from("prompt_packages" as never)
    .select("id, organization_id, application_id, template_id, athlete_id, prompt_id, reference_set_id, collection_id, slot_id, label, variation, direction_mode, variables, athlete_direction, compiled_prompt, status, rating, rating_notes, created_at")
    .eq("application_id", applicationId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as PromptPackage[];
}

export interface SavePackageInput {
  organization_id: string;
  application_id: string;
  template_id: string;
  athlete_id: string;
  prompt_id: string | null;
  reference_set_id: string | null;
  collection_id?: string | null;
  slot_id?: string | null;
  label: string;
  variation: string;
  /** master | primary | backup | alt — which prompt produced this generation. */
  prompt_role?: string;
  direction_mode: DirectionMode;
  variables: Variables;
  athlete_direction: string | null;
  compiled_prompt: string;
  created_by?: string | null;
}

export async function savePromptPackage(input: SavePackageInput): Promise<string> {
  const { data, error } = await supabase.from("prompt_packages" as never).insert(input as never).select("id").single();
  if (error) throw error;
  return (data as unknown as { id: string }).id;
}

export async function ratePromptPackage(id: string, rating: number, notes?: Record<string, unknown>): Promise<void> {
  const { error } = await supabase
    .from("prompt_packages" as never)
    .update({ rating, rating_notes: notes ?? {}, updated_at: new Date().toISOString() } as never)
    .eq("id", id);
  if (error) throw error;
}

export async function deletePromptPackage(id: string): Promise<void> {
  const { error } = await supabase.from("prompt_packages" as never).delete().eq("id", id);
  if (error) throw error;
}

// ---- Collection concepts -------------------------------------------------

export interface DesignSlot {
  id: string;
  collection_id: string;
  slot_no: number;
  name: string;
  purpose: string | null;
  product_type: string | null;
  status: string;
  design_id: string | null;
}

export interface ConceptCollection {
  id: string;
  name: string;
  status: string;
  description: string | null;
  source_template_id: string | null;
  source_application_id: string | null;
  created_at: string;
  slots: DesignSlot[];
}

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60) || "concept";

export interface CreateConceptInput {
  organization_id: string;
  athlete_id: string;
  template_id: string;
  application_id: string | null;
  name: string;
  description?: string | null;
  slots: { name: string; purpose?: string | null; product_type?: string | null }[];
}

/**
 * A concept IS a collection (status 'concept') plus its design slots, so the
 * lineage concept → designs → products → drop never needs a migration step.
 */
export async function createCollectionConcept(input: CreateConceptInput): Promise<string> {
  const { data, error } = await supabase
    .from("collections" as never)
    .insert({
      organization_id: input.organization_id,
      athlete_id: input.athlete_id,
      name: input.name.trim(),
      slug: `${slugify(input.name)}-${Math.floor(Math.random() * 1e4)}`,
      description: input.description?.trim() || null,
      collection_type: "athlete",
      status: "concept",
      source_template_id: input.template_id,
      source_application_id: input.application_id,
    } as never)
    .select("id")
    .single();
  if (error) throw error;
  const collectionId = (data as unknown as { id: string }).id;

  if (input.slots.length) {
    const rows = input.slots.map((s, i) => ({
      organization_id: input.organization_id,
      collection_id: collectionId,
      slot_no: i + 1,
      name: s.name,
      purpose: s.purpose ?? null,
      product_type: s.product_type ?? null,
      status: "needs_generation",
    }));
    const slotErr = (await supabase.from("collection_design_slots" as never).insert(rows as never)).error;
    if (slotErr) throw slotErr;
  }
  return collectionId;
}

export async function listConceptsForInstance(applicationId: string): Promise<ConceptCollection[]> {
  const { data, error } = await supabase
    .from("collections" as never)
    .select("id, name, status, description, source_template_id, source_application_id, created_at")
    .eq("source_application_id", applicationId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return attachSlots((data ?? []) as unknown as Omit<ConceptCollection, "slots">[]);
}

export async function listConceptsForAthlete(athleteId: string): Promise<ConceptCollection[]> {
  const { data, error } = await supabase
    .from("collections" as never)
    .select("id, name, status, description, source_template_id, source_application_id, created_at")
    .eq("athlete_id", athleteId)
    .not("source_template_id", "is", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return attachSlots((data ?? []) as unknown as Omit<ConceptCollection, "slots">[]);
}

async function attachSlots(rows: Omit<ConceptCollection, "slots">[]): Promise<ConceptCollection[]> {
  if (rows.length === 0) return [];
  const { data: slots } = await supabase
    .from("collection_design_slots" as never)
    .select("id, collection_id, slot_no, name, purpose, product_type, status, design_id")
    .in("collection_id", rows.map((r) => r.id))
    .order("slot_no");
  const byCollection = new Map<string, DesignSlot[]>();
  for (const s of ((slots ?? []) as unknown as DesignSlot[])) {
    if (!byCollection.has(s.collection_id)) byCollection.set(s.collection_id, []);
    byCollection.get(s.collection_id)!.push(s);
  }
  return rows.map((r) => ({ ...r, slots: byCollection.get(r.id) ?? [] }));
}

export async function setSlotStatus(id: string, status: string): Promise<void> {
  const { error } = await supabase
    .from("collection_design_slots" as never)
    .update({ status, updated_at: new Date().toISOString() } as never)
    .eq("id", id);
  if (error) throw error;
}

/** Suggested concept name — "MOONEY COLLEGIATE" from athlete + style. */
export function suggestConceptName(lastName: string, styleOrTemplate: string): string {
  const style = styleOrTemplate.replace(/\s*\d+$/, "").trim();
  return `${lastName} ${style}`.trim().toUpperCase();
}
