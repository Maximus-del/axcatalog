// Reference images attached to a Design Studio request.
//
// The picker let a client choose images, showed them thumbnails, and then threw
// the files away — the message sent to AX said only "Reference images: 3
// (athlete will share)". The client had every reason to believe they had
// attached something. Nobody had told them to go and share it separately, and
// the operator had a count with no way to ask for the rest.
//
// These go into `design-references`, the bucket the design-template reference
// sets already use, under a per-thread prefix. NOTE: that bucket is public-read
// — a reference image is reachable by anyone holding its URL. That is how the
// bucket was already configured for operator-uploaded references; nothing here
// changes a policy. It is fine for inspiration imagery and would not be fine
// for anything confidential, which is worth knowing before this is reused.

export const REFERENCE_BUCKET = "design-references";
export const MAX_REFERENCE_FILES = 8;
export const MAX_REFERENCE_BYTES = 10 * 1024 * 1024; // 10MB each

export interface ReferenceCandidate {
  name: string;
  size: number;
  type: string;
}

export function isAcceptedReference(file: ReferenceCandidate): boolean {
  return file.type.startsWith("image/") && file.size > 0 && file.size <= MAX_REFERENCE_BYTES;
}

/** Strip anything that would make a storage key awkward or ambiguous. */
export function safeFileName(name: string): string {
  const trimmed = name.trim().toLowerCase();
  const dot = trimmed.lastIndexOf(".");
  const stem = (dot > 0 ? trimmed.slice(0, dot) : trimmed).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const ext = dot > 0 ? trimmed.slice(dot + 1).replace(/[^a-z0-9]/g, "") : "";
  const base = stem.slice(0, 48) || "reference";
  return ext ? `${base}.${ext}` : base;
}

/**
 * Where one reference lives. Prefixed by athlete and thread so an operator
 * reading the thread can find every file for it, and so two clients uploading
 * `photo.jpg` at the same moment cannot collide.
 */
export function referenceObjectPath(
  athleteId: string,
  threadId: string,
  index: number,
  fileName: string,
): string {
  return `portal/${athleteId}/${threadId}/${String(index + 1).padStart(2, "0")}-${safeFileName(fileName)}`;
}

export interface UploadOutcome {
  uploaded: string[];
  failed: string[];
}

/**
 * The line that goes into the message body.
 *
 * Says what actually happened. A partial failure is named rather than rounded
 * up — the operator needs to know to ask for the missing one, and the client
 * needs to know it did not arrive.
 */
export function referenceSummary(outcome: UploadOutcome): string | null {
  const { uploaded, failed } = outcome;
  if (uploaded.length === 0 && failed.length === 0) return null;
  const lines: string[] = [];
  if (uploaded.length > 0) {
    lines.push(`Reference images (${uploaded.length}):`);
    for (const url of uploaded) lines.push(`  ${url}`);
  }
  if (failed.length > 0) {
    lines.push(
      `${failed.length} reference ${failed.length === 1 ? "image" : "images"} failed to upload: ${failed.join(", ")}`,
    );
  }
  return lines.join("\n");
}

/** What to tell the client after submitting. */
export function referenceToast(outcome: UploadOutcome): string | null {
  if (outcome.failed.length === 0) return null;
  if (outcome.uploaded.length === 0) {
    return "Your idea was sent, but the reference images didn't upload. You can add them in Messages.";
  }
  return `Sent, but ${outcome.failed.length} reference ${outcome.failed.length === 1 ? "image" : "images"} didn't upload. You can add them in Messages.`;
}
