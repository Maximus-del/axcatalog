// Mobile-first. Test at 375px before merging.
//
// Tiny haptic helper. Uses the Vibration API where available
// (Chrome on Android, some others). iOS Safari ignores it silently,
// which is the right fallback — no errors, no noise.
//
// Usage: haptic.tap() on small confirmations, haptic.success() on
// applied tags / saved actions, haptic.warn() on destructive prompts.

function vibrate(pattern: number | number[]) {
  if (typeof navigator === "undefined") return;
  const nav = navigator as Navigator & { vibrate?: (p: number | number[]) => boolean };
  try {
    nav.vibrate?.(pattern);
  } catch {
    // no-op — never throw from a haptic call
  }
}

export const haptic = {
  tap: () => vibrate(10),
  success: () => vibrate([12, 40, 12]),
  warn: () => vibrate([20, 60, 20]),
};
