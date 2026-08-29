// Fan design submissions.
//
// A subscriber either fills in the idea survey or uploads artwork they already
// made. Both produce one design_submissions row, because the operator's job is
// identical either way: look at it, decide, and either turn it into work or say
// no kindly.
//
// Accepting does NOT create a parallel product world. It calls the same
// createAthleteProduct the board uses, so an accepted fan idea is an ordinary
// concept from that moment on — it can be collected, approved and published
// with no special-casing anywhere downstream.
import { supabase } from "@/integrations/supabase/client";

export const SUBMISSION_BUCKET = "fan-submissions";

export type SubmissionKind = "idea" | "artwork";
export type ReviewState = "submitted" | "in_review" | "accepted" | "declined" | "archived";

/** What the fan and the operator each see as the headline status. */
export type SubmissionStage =
  | "submitted"
  | "in_review"
  | "accepted"
  | "in_production"
  | "declined"
  | "archived";

export interface SubmissionFile {
  id: string;
  storage_bucket: string | null;
  storage_path: string;
  file_name: string | null;
  sort_order: number;
}

export interface DesignSubmission {
  id: string;
  organization_id: string;
  athlete_id: string;
  fan_user_id: string;
  kind: SubmissionKind;
  title: string | null;
  brief: string | null;
  notes: string | null;
  questionnaire_response_id: string | null;
  review_state: ReviewState;
  review_notes: string | null;
  reviewed_at: string | null;
  converted_product_id: string | null;
  converted_design_id: string | null;
  created_at: string;
  files?: SubmissionFile[];
  fan?: { display_name: string | null; avatar_url: string | null } | null;
}

interface StageInput {
  review_state: ReviewState;
  converted_product_id?: string | null;
  converted_design_id?: string | null;
}

/**
 * Accepted and accepted-and-being-made are different things to a fan waiting
 * to hear back, so the stage is derived from whether real work exists rather
 * than from a flag someone has to remember to set.
 */
export function stageOf(s: StageInput): SubmissionStage {
  if (s.review_state === "archived") return "archived";
  if (s.review_state === "declined") return "declined";
  if (s.converted_product_id || s.converted_design_id) return "in_production";
  if (s.review_state === "accepted") return "accepted";
  if (s.review_state === "in_review") return "in_review";
  return "submitted";
}

export const STAGE_LABEL: Record<SubmissionStage, string> = {
  submitted: "Submitted",
  in_review: "Being reviewed",
  accepted: "Accepted",
  in_production: "Being made",
  declined: "Not this time",
  archived: "Archived",
};

/** What the fan is told, in the athlete's voice rather than a workflow's. */
export const STAGE_BLURB: Record<SubmissionStage, string> = {
  submitted: "Sent. Someone on the team will look at it.",
  in_review: "Someone is looking at this right now.",
  accepted: "They liked it — it's queued to be made.",
  in_production: "This is being turned into a real product.",
  declined: "Not going ahead with this one.",
  archived: "Closed.",
};

/** Only the states an operator can move a submission into by hand. */
export const REVIEW_ACTIONS: { state: ReviewState; label: string }[] = [
  { state: "in_review", label: "Start review" },
  { state: "accepted", label: "Accept" },
  { state: "declined", label: "Decline" },
  { state: "archived", label: "Archive" },
];

export function isOpen(s: StageInput): boolean {
  const stage = stageOf(s);
  return stage === "submitted" || stage === "in_review";
}

/** Public URL for a submission image — the bucket is public by design. */
export function submissionFileUrl(f: { storage_bucket: string | null; storage_path: string }): string {
  return supabase.storage
    .from(f.storage_bucket || SUBMISSION_BUCKET)
    .getPublicUrl(f.storage_path).data.publicUrl;
}

const SELECT =
  "id, organization_id, athlete_id, fan_user_id, kind, title, brief, notes, questionnaire_response_id, review_state, review_notes, reviewed_at, converted_product_id, converted_design_id, created_at, files:design_submission_files(id, storage_bucket, storage_path, file_name, sort_order)";

export async function listSubmissionsForAthlete(athleteId: string): Promise<DesignSubmission[]> {
  const { data, error } = await supabase
    .from("design_submissions" as never)
    .select(SELECT)
    .eq("athlete_id", athleteId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as DesignSubmission[];
}

export async function listMySubmissions(athleteId?: string): Promise<DesignSubmission[]> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return [];
  let q = supabase
    .from("design_submissions" as never)
    .select(SELECT)
    .eq("fan_user_id", auth.user.id);
  if (athleteId) q = q.eq("athlete_id", athleteId);
  const { data, error } = await q.order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as DesignSubmission[];
}

export interface CreateSubmissionInput {
  organization_id: string;
  athlete_id: string;
  kind: SubmissionKind;
  title?: string | null;
  brief?: string | null;
  notes?: string | null;
  questionnaire_response_id?: string | null;
  files?: File[];
}

/**
 * Create a submission and attach its files.
 *
 * Files upload after the row exists so a storage failure can roll the row back
 * — a submission with no artwork on the artwork path is worse than no
 * submission, because the operator can't act on it and the fan thinks they're
 * done.
 */
export async function createSubmission(input: CreateSubmissionInput): Promise<string> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error("Sign in to submit an idea");

  const created = await supabase
    .from("design_submissions" as never)
    .insert({
      organization_id: input.organization_id,
      athlete_id: input.athlete_id,
      fan_user_id: uid,
      kind: input.kind,
      title: input.title?.trim() || null,
      brief: input.brief?.trim() || null,
      notes: input.notes?.trim() || null,
      questionnaire_response_id: input.questionnaire_response_id ?? null,
    } as never)
    .select("id")
    .single();
  if (created.error) throw created.error;
  const id = (created.data as unknown as { id: string }).id;

  const files = input.files ?? [];
  if (files.length === 0) return id;

  try {
    for (const [i, file] of files.entries()) {
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      // Folder must be the uploader's uid — the storage policy checks it.
      const path = `${uid}/${crypto.randomUUID()}.${ext}`;
      const up = await supabase.storage.from(SUBMISSION_BUCKET).upload(path, file);
      if (up.error) throw up.error;
      const linked = await supabase.from("design_submission_files" as never).insert({
        submission_id: id,
        storage_bucket: SUBMISSION_BUCKET,
        storage_path: path,
        file_name: file.name,
        mime_type: file.type || null,
        file_size_bytes: file.size,
        sort_order: i,
      } as never);
      if (linked.error) throw linked.error;
    }
  } catch (e) {
    await supabase.from("design_submissions" as never).delete().eq("id", id);
    throw e;
  }

  return id;
}

export async function setReviewState(input: {
  id: string;
  review_state: ReviewState;
  review_notes?: string | null;
}): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("design_submissions" as never)
    .update({
      review_state: input.review_state,
      review_notes: input.review_notes ?? null,
      reviewed_at: new Date().toISOString(),
      reviewed_by: auth.user?.id ?? null,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", input.id);
  if (error) throw error;
}

/**
 * Accept a submission and put it on the athlete's board as a concept.
 *
 * The fan's uploaded file is COPIED into product-images rather than moved:
 * their submission stays intact and viewable, which matters if the credit or
 * the terms are ever questioned later.
 */
export async function convertSubmissionToConcept(input: {
  submission: DesignSubmission;
  team_id_at_release?: string | null;
}): Promise<string> {
  const s = input.submission;
  if (s.converted_product_id) return s.converted_product_id;

  const { createAthleteProduct } = await import("@/lib/ecosystem/merch");
  const productId = await createAthleteProduct({
    organization_id: s.organization_id,
    athlete_id: s.athlete_id,
    title: s.title?.trim() || "Fan concept",
    description: s.brief ?? null,
    team_id_at_release: input.team_id_at_release ?? null,
  });

  try {
    const files = (s.files ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);
    for (const [i, f] of files.entries()) {
      const download = await supabase.storage
        .from(f.storage_bucket || SUBMISSION_BUCKET)
        .download(f.storage_path);
      if (download.error) throw download.error;
      const ext = f.storage_path.split(".").pop()?.toLowerCase() || "png";
      const path = `${productId}/${crypto.randomUUID()}.${ext}`;
      const up = await supabase.storage.from("product-images").upload(path, download.data);
      if (up.error) throw up.error;
      const linked = await supabase.from("product_images" as never).insert({
        product_id: productId,
        storage_bucket: "product-images",
        storage_path: path,
        sort_order: i,
      } as never);
      if (linked.error) throw linked.error;
    }
  } catch (e) {
    await supabase.from("products" as never).delete().eq("id", productId);
    throw e;
  }

  const { error } = await supabase
    .from("design_submissions" as never)
    .update({
      converted_product_id: productId,
      review_state: "accepted",
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", s.id);
  if (error) throw error;

  return productId;
}

// ---- The idea survey ------------------------------------------------------

export const FAN_DESIGN_PURPOSE = "fan_design_idea";

export interface SurveyQuestion {
  id: string;
  position: number;
  type: string;
  prompt: string;
  help_text: string | null;
  required: boolean;
  options: { id: string; label: string; image_url: string | null; position: number }[];
}

export interface Survey {
  id: string;
  title: string;
  description: string | null;
  intro_text: string | null;
  thank_you_text: string | null;
  questions: SurveyQuestion[];
}

/**
 * Find the idea survey for an athlete: their own if they have one, otherwise
 * the org-wide default. Chosen by `purpose`, never by a hardcoded slug, so the
 * questionnaire can be renamed without breaking the fan page.
 */
export async function loadFanDesignSurvey(athleteId: string, organizationId: string): Promise<Survey | null> {
  const { data, error } = await supabase
    .from("questionnaires" as never)
    .select("id, title, description, intro_text, thank_you_text, athlete_id, organization_id")
    .eq("purpose", FAN_DESIGN_PURPOSE)
    .eq("is_active", true);
  if (error || !data) return null;

  const rows = data as unknown as {
    id: string; title: string; description: string | null; intro_text: string | null;
    thank_you_text: string | null; athlete_id: string | null; organization_id: string | null;
  }[];
  const chosen =
    rows.find((r) => r.athlete_id === athleteId) ??
    rows.find((r) => !r.athlete_id && r.organization_id === organizationId) ??
    rows.find((r) => !r.athlete_id && !r.organization_id) ??
    null;
  if (!chosen) return null;

  const [q, o] = await Promise.all([
    supabase
      .from("questionnaire_questions" as never)
      .select("id, position, type, prompt, help_text, required")
      .eq("questionnaire_id", chosen.id)
      .order("position"),
    supabase
      .from("questionnaire_question_options" as never)
      .select("id, question_id, label, image_url, position, questionnaire_questions!inner(questionnaire_id)")
      .eq("questionnaire_questions.questionnaire_id", chosen.id)
      .order("position"),
  ]);

  const options = (o.data ?? []) as unknown as {
    id: string; question_id: string; label: string; image_url: string | null; position: number;
  }[];

  return {
    id: chosen.id,
    title: chosen.title,
    description: chosen.description,
    intro_text: chosen.intro_text,
    thank_you_text: chosen.thank_you_text,
    questions: ((q.data ?? []) as unknown as Omit<SurveyQuestion, "options">[]).map((row) => ({
      ...row,
      options: options.filter((op) => op.question_id === row.id),
    })),
  };
}

export interface SurveyAnswer {
  question_id: string;
  text_value?: string | null;
  selected_option_ids?: string[];
}

/** Store the answers using the existing questionnaire tables, then return the response id. */
export async function saveSurveyResponse(input: {
  survey_id: string;
  athlete_id: string;
  answers: SurveyAnswer[];
  respondent_name?: string | null;
}): Promise<string> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error("Sign in first");

  const res = await supabase
    .from("questionnaire_responses" as never)
    .insert({
      questionnaire_id: input.survey_id,
      athlete_id: input.athlete_id,
      fan_user_id: uid,
      respondent_name: input.respondent_name ?? null,
    } as never)
    .select("id")
    .single();
  if (res.error) throw res.error;
  const responseId = (res.data as unknown as { id: string }).id;

  const rows = input.answers
    .filter((a) => (a.text_value?.trim() ?? "") !== "" || (a.selected_option_ids?.length ?? 0) > 0)
    .map((a) => ({
      response_id: responseId,
      question_id: a.question_id,
      text_value: a.text_value?.trim() || null,
      selected_option_ids: a.selected_option_ids ?? [],
    }));
  if (rows.length) {
    const { error } = await supabase.from("questionnaire_answers" as never).insert(rows as never);
    if (error) throw error;
  }

  return responseId;
}

/** Which required questions are still unanswered — empty means ready to send. */
export function missingRequired(questions: SurveyQuestion[], answers: SurveyAnswer[]): string[] {
  const byId = new Map(answers.map((a) => [a.question_id, a]));
  return questions
    .filter((q) => q.required)
    .filter((q) => {
      const a = byId.get(q.id);
      if (!a) return true;
      return (a.text_value?.trim() ?? "") === "" && (a.selected_option_ids?.length ?? 0) === 0;
    })
    .map((q) => q.prompt);
}
