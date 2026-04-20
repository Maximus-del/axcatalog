// Mobile-first. Test at 375px before merging.
//
// Animate a numeric value from 0 to `target` over `duration` ms using
// requestAnimationFrame. Honors prefers-reduced-motion (snaps instantly).
import { useEffect, useState } from "react";

export function useCountUp(target: number | null, duration = 800): number {
  const [val, setVal] = useState(0);

  useEffect(() => {
    if (target == null || Number.isNaN(target)) return;

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || target === 0) {
      setVal(target);
      return;
    }

    let raf = 0;
    const start = performance.now();
    const from = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      setVal(Math.round(from + (target - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return val;
}