// How the portal should talk to whoever is looking at it.
//
// The portal was written for one athlete and never learned that anything else
// exists. `athletes` has carried entity_type and roles since August — a school,
// an organization and a team hold rows in it right now — but the portal did not
// even select those columns, so every entity was addressed as an individual
// player: position defaulting to "Athlete", a "Rookie → Legend" ladder, a Game
// Day builder offering "your number" and "your name".
//
// Abbotsford Senior Secondary does not have a jersey number.
//
// It also read the name as `full_name || first + last`, which is a generated
// column: Dash Letics stores last_name "." and renders as "Dashletics .". The
// entity model already settled this — display_name is authoritative and
// displayNameOf() is the one resolver — but the portal predates it.
//
// This module is the single place that decides voice. Components ask it
// questions; they do not branch on entity_type themselves.
import { displayNameOf, type EntityType, type AxRole } from "@/lib/ecosystem/entity";

export interface VoiceInput {
  display_name?: string | null;
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  entity_type?: EntityType | string | null;
  roles?: string[] | null;
  position?: string | null;
}

const KIND_LABEL: Record<string, string> = {
  person: "Athlete",
  organization: "Organization",
  school: "School",
  team: "Team",
  brand: "Brand",
  facility: "Facility",
  agency: "Agency",
  other: "Partner",
};

export interface EntityVoice {
  /** The name to print. Never a generated column, never first + last. */
  name: string;
  /** Avatar initials — works for "Dash Letics" and "Darnell Mooney" alike. */
  initials: string;
  /** What kind of entity this is, for the header's second line. */
  kindLabel: string;
  /** Header subtitle: an athlete's position, otherwise what they are. */
  subtitle: string;
  /** True when the entity is an individual person. */
  isPerson: boolean;
  /** True when AX works with them as an athlete (roles, not type). */
  isAthlete: boolean;
  /** Whether "your name / your number" on a garment means anything. */
  supportsJerseyPersonalisation: boolean;
  /** Whether the Rookie -> Legend ladder is the right frame. */
  showsAthleteTier: boolean;
  /** Possessive form for headings: "Darnell's", "Abbotsford Senior Secondary's". */
  possessive: string;
  /** Heading for the profile page. */
  brandHeading: string;
}

function possessiveOf(name: string): string {
  if (!name) return "Their";
  return /s$/i.test(name) ? `${name}'` : `${name}'s`;
}

/** First word of a person's name; the whole name for anything else. */
export function shortNameOf(input: VoiceInput): string {
  const name = displayNameOf(input);
  const type = (input.entity_type ?? "person") as string;
  if (type !== "person") return name;
  const first = input.first_name?.trim();
  return first || name.split(/\s+/)[0] || name;
}

export function initialsOf(name: string): string {
  if (!name || name === "Unnamed") return "AX";
  const words = name.split(/\s+/).filter((w) => /[a-z0-9]/i.test(w));
  if (words.length === 0) return "AX";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function entityVoice(input: VoiceInput | null | undefined): EntityVoice {
  const e = input ?? {};
  const type = ((e.entity_type ?? "person") as string).toLowerCase();
  const roles = (e.roles ?? []).map((r) => String(r).toLowerCase()) as AxRole[];
  const isPerson = type === "person";
  // Role decides how AX works with them; type decides what they are. A person
  // with no roles recorded is still treated as an athlete, because that is the
  // portal's original and overwhelmingly common case.
  const isAthlete = roles.includes("athlete") || (isPerson && roles.length === 0);

  const name = displayNameOf(e);
  const kindLabel = KIND_LABEL[type] ?? "Partner";
  const position = e.position?.trim();

  return {
    name,
    initials: initialsOf(name),
    kindLabel,
    subtitle: isPerson ? (position || "Athlete") : kindLabel,
    isPerson,
    isAthlete,
    supportsJerseyPersonalisation: isPerson && isAthlete,
    showsAthleteTier: isPerson && isAthlete,
    possessive: possessiveOf(name),
    brandHeading: isPerson && isAthlete ? "Your Brand" : "Your Account",
  };
}
