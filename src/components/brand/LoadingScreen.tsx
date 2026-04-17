import { Wordmark } from "./Wordmark";

export function LoadingScreen() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-6">
      <Wordmark size="lg" />
      <div className="ax-label">Loading…</div>
    </div>
  );
}
