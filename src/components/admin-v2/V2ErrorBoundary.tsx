import { Component, type ErrorInfo, type ReactNode } from "react";
import { clearDraft } from "@/lib/v2/mockup-draft";

// A CRASH SHOULD NOT LOOK LIKE LOADING.
//
// React unmounts the whole tree when a render throws. With nothing to catch it
// the dashboard went blank behind its loading skeleton and stayed there — no
// error, no way out, and no hint that the cause was a saved draft rather than
// a slow network. That is how a one-line type error cost an afternoon.
//
// The usual cause is the studio draft: it is written by whatever build was
// deployed when the operator last had the builder open, restored into a newer
// one, and a shape that has since gained a field comes back without it. So the
// escape hatch is specifically "throw the draft away" — the one piece of state
// that survives a refresh and can therefore keep breaking the page forever.

interface Props {
  children: ReactNode;
  /** Whose draft to offer to clear. Omitted where there is no entity in scope. */
  entityId?: string;
}

interface State {
  error: Error | null;
}

export default class V2ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // The stack is the only record of what happened; the interface below shows
    // the message, but the console is where this gets diagnosed.
    console.error("V2 crashed", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-[hsl(var(--ax-red)/0.4)] bg-[hsl(var(--ax-red)/0.06)] px-5 py-6 text-center">
        <div className="text-[14px] font-semibold text-[hsl(var(--ax-ink))]">This screen stopped working.</div>
        <p className="mt-1 text-[12px] text-[hsl(var(--ax-faint))]">{error.message}</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-full border border-[hsl(var(--ax-border))] px-4 py-1.5 text-[12px] text-[hsl(var(--ax-secondary))] hover:text-[hsl(var(--ax-ink))]"
          >
            Reload
          </button>
          {this.props.entityId && (
            <button
              type="button"
              onClick={() => {
                clearDraft(this.props.entityId as string);
                window.location.reload();
              }}
              title="Unsaved work in the mockup builder is discarded. Saved mockups are untouched."
              className="rounded-full bg-[hsl(var(--ax-accent))] px-4 py-1.5 text-[12px] font-semibold text-[hsl(var(--ax-on-accent))]"
            >
              Discard the unsaved draft and reload
            </button>
          )}
        </div>
        <p className="mt-3 text-[11px] text-[hsl(var(--ax-faint))]">
          Saved mockups, products and orders are not affected.
        </p>
      </div>
    );
  }
}
