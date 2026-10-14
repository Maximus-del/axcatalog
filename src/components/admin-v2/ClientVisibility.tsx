import { Eye, EyeOff, Loader2, Lock } from "lucide-react";
import {
  PREVIEW_READINESS_LABEL,
  previewReadiness,
  visibilityState,
  type ClientVisibility as Visibility,
} from "@/lib/v2/visibility";
import type { Design } from "@/lib/v2/types";

// Operator-facing controls for what a client can see.
//
// The wording is deliberate throughout. "Hidden" and "Visible as preview" are
// the only two states, and the second one says *preview* every time it appears,
// so an operator is never left guessing whether making something visible also
// hands over the production file. It does not, anywhere, ever.

export function VisibilityPill({
  design,
  groupVisibility,
  busy,
  onToggle,
}: {
  design: Design;
  /** null when the design is not in a group. */
  groupVisibility: Visibility | null;
  busy?: boolean;
  onToggle: () => void;
}) {
  const state = visibilityState(design.clientVisibility, groupVisibility);
  const readiness = previewReadiness(design);

  // A design marked visible whose group is hidden is its own state. Rendering
  // it as plain "hidden" would make the operator's own earlier click look like
  // it never registered.
  const blocked = state.reason === "blocked-by-group";
  const showing = state.effective === "preview";
  const pending = showing && readiness !== "ready";

  const tone = blocked
    ? "var(--ax-faint)"
    : pending
      ? "var(--ax-amber)"
      : showing
        ? "var(--ax-accent)"
        : "var(--ax-secondary)";

  const label = blocked
    ? "Folder hidden"
    : busy
      ? "Rendering…"
      : pending
        ? "Preview pending"
        : showing
          ? "Client preview"
          : "Hidden";

  const title = blocked
    ? "This design is set to show, but its folder is hidden — so the client sees nothing. Open the folder's visibility to release it."
    : showing
      ? readiness === "ready"
        ? "The client sees a rendered preview. The production file stays internal."
        : PREVIEW_READINESS_LABEL[readiness]
      : "Not visible to the client.";

  const Icon = busy ? Loader2 : blocked ? Lock : showing ? Eye : EyeOff;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle();
      }}
      disabled={busy}
      title={title}
      aria-label={title}
      className="inline-flex max-w-full items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-medium transition-colors hover:brightness-125 disabled:opacity-70"
      style={{ background: `hsl(${tone} / 0.14)`, color: `hsl(${tone})` }}
    >
      <Icon className={`h-2.5 w-2.5 shrink-0 ${busy ? "animate-spin" : ""}`} aria-hidden />
      <span className="truncate">{label}</span>
    </button>
  );
}

/**
 * The larger two-state control used in a group's header.
 *
 * Rendered as two explicit options rather than a switch: a switch would need a
 * label to say what "on" means, and "on" is exactly the thing an operator
 * should never have to infer when the downside is leaking artwork.
 */
export function VisibilitySegmented({
  value,
  onChange,
  disabled,
}: {
  value: Visibility;
  onChange: (next: Visibility) => void;
  disabled?: boolean;
}) {
  const options: Array<{ key: Visibility; label: string; icon: typeof Eye }> = [
    { key: "hidden", label: "Hidden", icon: EyeOff },
    { key: "preview", label: "Visible as preview", icon: Eye },
  ];

  return (
    <div
      role="radiogroup"
      aria-label="Client visibility"
      className="inline-flex items-center gap-0.5 rounded-full border border-[hsl(var(--ax-border))] p-0.5"
    >
      {options.map((o) => {
        const active = value === o.key;
        const Icon = o.icon;
        return (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(o.key)}
            className={[
              "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-60",
              active
                ? o.key === "preview"
                  ? "bg-[hsl(var(--ax-accent)/0.16)] text-[hsl(var(--ax-accent))]"
                  : "bg-white/[0.08] text-[hsl(var(--ax-ink))]"
                : "text-[hsl(var(--ax-faint))] hover:text-[hsl(var(--ax-secondary))]",
            ].join(" ")}
          >
            <Icon className="h-3 w-3" aria-hidden />
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The standing explanation of what "visible" costs.
 *
 * Shown once per workspace rather than per card. Operators make better calls
 * about client access when the guarantee is written down where they are making
 * the decision, instead of living in a document nobody opens.
 */
export function VisibilityNote() {
  return (
    <p className="text-[11px] leading-relaxed text-[hsl(var(--ax-faint))]">
      <span className="font-medium text-[hsl(var(--ax-secondary))]">What the client gets.</span> A
      flattened, screen-resolution rendering — enough to recognise the artwork and ask for it on a
      garment. The transparent production file never leaves AX: it sits in a bucket no client
      account can read, so this is a property of the system rather than a hidden button.
    </p>
  );
}
