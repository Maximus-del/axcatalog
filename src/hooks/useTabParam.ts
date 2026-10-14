// Keep a tab selection in the URL.
//
// Tabs held only in component state vanish the moment you navigate away and
// come back — the page remounts on its default. Putting the choice in the
// query string makes the browser's own back button restore it, and makes the
// address shareable. Switching tabs replaces the history entry rather than
// pushing one, so Back leaves the page instead of walking backwards through
// every tab you clicked.
import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

export function useTabParam<T extends string>(
  key: string,
  allowed: readonly T[],
  fallback: T,
): [T, (next: T) => void] {
  const [params, setParams] = useSearchParams();

  const raw = params.get(key);
  const value = (allowed as readonly string[]).includes(raw ?? "") ? (raw as T) : fallback;

  const set = useCallback(
    (next: T) => {
      setParams(
        (prev) => {
          const copy = new URLSearchParams(prev);
          if (next === fallback) copy.delete(key);
          else copy.set(key, next);
          return copy;
        },
        { replace: true },
      );
    },
    [key, fallback, setParams],
  );

  return [value, set];
}

/**
 * Same idea, but the valid set isn't known up front (team ids, for instance).
 * `fallback` wins until the caller has loaded the real options.
 */
export function useFreeTabParam(
  key: string,
  fallback: string,
): [string, (next: string) => void] {
  const [params, setParams] = useSearchParams();
  const value = params.get(key) ?? fallback;

  const set = useCallback(
    (next: string) => {
      setParams(
        (prev) => {
          const copy = new URLSearchParams(prev);
          if (!next) copy.delete(key);
          else copy.set(key, next);
          return copy;
        },
        { replace: true },
      );
    },
    [key, setParams],
  );

  return [value, set];
}
