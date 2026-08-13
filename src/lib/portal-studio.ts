// Design Studio config + project status mapping.
import type { PortalThread } from "@/lib/portal-messaging";

export const STUDIO_CATEGORIES = [
  { key: "merch", label: "New Merch" },
  { key: "game_day", label: "Game Day" },
  { key: "camp", label: "Football Camp" },
  { key: "brand", label: "Personal Brand" },
  { key: "collection", label: "Collection" },
  { key: "other", label: "Something Else" },
] as const;

export const STUDIO_VIBES = [
  "Streetwear",
  "Vintage",
  "Minimal",
  "Athletic",
  "Luxury",
  "Y2K",
  "Clean",
  "Surprise Me",
] as const;

/** Timeline stages we can infer from a request thread's status. */
export const PROJECT_STAGES = ["Submitted", "In Progress", "Ready for You", "Completed"] as const;
export type ProjectStage = (typeof PROJECT_STAGES)[number];

export interface Project {
  id: string;
  title: string;
  category: string;
  stage: ProjectStage;
  stageIndex: number;
  /** Athlete action needed (AX replied / marked ready). */
  actionRequired: boolean;
  updatedAt: string;
}

/**
 * Map a request thread → project. Threads only carry open/pending/resolved/
 * closed, so we infer a simplified timeline. `portal_unread` means AX has
 * sent something the athlete hasn't seen → action may be required.
 */
export function threadToProject(t: PortalThread): Project {
  let stage: ProjectStage = "Submitted";
  let stageIndex = 0;
  if (t.status === "pending") {
    stage = "In Progress";
    stageIndex = 1;
  } else if (t.status === "resolved" || t.status === "closed") {
    stage = "Completed";
    stageIndex = 3;
  }
  // AX replied on an active thread → surface for review.
  if (t.portal_unread && t.status !== "resolved" && t.status !== "closed") {
    stage = "Ready for You";
    stageIndex = 2;
  }
  return {
    id: t.id,
    title: t.subject,
    category: t.category,
    stage,
    stageIndex,
    actionRequired: !!t.portal_unread && t.status !== "closed",
    updatedAt: t.last_message_at,
  };
}
