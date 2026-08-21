// Who is allowed to place artwork on a garment.
//
// Phase one is operators only. But the rollout after it is already decided —
// athletes on their own profile, then subscribed fans depending on plan, with
// everyone else seeing a locked preview that explains what subscribing buys.
// So the check is written for the end state and gated by one PHASE constant,
// rather than as an `isAdmin` sprinkled through components that would each
// need finding and editing later.
export type StudioActor =
  | { kind: "operator" }
  | { kind: "athlete"; ownsSubject: boolean }
  | { kind: "fan"; tier: "none" | "follower" | "subscriber" | "vip" }
  | { kind: "guest" };

export type StudioPhase = 1 | 2 | 3;

/** Bump this to open the studio to the next audience. Nothing else changes. */
export const STUDIO_PHASE: StudioPhase = 1;

export interface StudioAccess {
  /** May they open the placement editor and save a result? */
  allowed: boolean;
  /**
   * Show the editor in a look-but-don't-touch state rather than hiding it.
   * A locked door someone can see through sells the upgrade; a missing door
   * sells nothing.
   */
  teaser: boolean;
  reason: string;
  /** Call to action when teasing. */
  upsell?: { headline: string; body: string; cta: string };
}

const SUBSCRIBER_UPSELL = {
  headline: "Design it yourself",
  body: "Members can place artwork on any of our blanks, position it in a real print zone, and send the result straight to the team.",
  cta: "See membership",
};

export function studioAccessFor(actor: StudioActor): StudioAccess {
  if (actor.kind === "operator") {
    return { allowed: true, teaser: false, reason: "Operators can always place artwork." };
  }

  if (actor.kind === "athlete") {
    if (!actor.ownsSubject) {
      return { allowed: false, teaser: false, reason: "Athletes can only decorate their own products." };
    }
    return STUDIO_PHASE >= 2
      ? { allowed: true, teaser: false, reason: "Your own store." }
      : {
          allowed: false,
          teaser: true,
          reason: "Coming soon for athletes.",
          upsell: {
            headline: "Design it yourself",
            body: "Placing your own artwork is coming to athlete profiles. For now the team sets these up for you.",
            cta: "Ask the team",
          },
        };
  }

  if (actor.kind === "fan") {
    // A follower is not a subscriber — the paid tiers are the gate.
    const paid = actor.tier === "subscriber" || actor.tier === "vip";
    if (!paid) {
      return { allowed: false, teaser: true, reason: "Members only.", upsell: SUBSCRIBER_UPSELL };
    }
    return STUDIO_PHASE >= 3
      ? { allowed: true, teaser: false, reason: "Included with your membership." }
      : {
          allowed: false,
          teaser: true,
          reason: "Not open to members yet.",
          upsell: {
            headline: "Design it yourself — soon",
            body: "Placing your own artwork is coming to memberships. Send an idea or upload a design in the meantime.",
            cta: "Send an idea instead",
          },
        };
  }

  return { allowed: false, teaser: true, reason: "Sign in to see this.", upsell: SUBSCRIBER_UPSELL };
}

/** Convenience for the common admin case. */
export const OPERATOR: StudioActor = { kind: "operator" };
