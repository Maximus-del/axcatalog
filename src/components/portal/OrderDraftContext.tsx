import { createContext, useCallback, useContext, useMemo, useState, ReactNode } from "react";

/**
 * In-memory order draft. productId -> colorKey -> size -> qty.
 * colorKey is the color name, or "" when the product has no color choice.
 * Cleared on refresh (per design decision).
 */
type DraftMap = Record<string, Record<string, Record<string, number>>>;

interface DraftCtx {
  draft: DraftMap;
  setQty: (productId: string, size: string, qty: number, color?: string) => void;
  clearProductColor: (productId: string, color?: string) => void;
  clear: () => void;
  itemCount: number;
  unitCount: number;
}

const Ctx = createContext<DraftCtx | undefined>(undefined);

export function OrderDraftProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<DraftMap>({});

  const setQty = useCallback(
    (productId: string, size: string, qty: number, color = "") => {
      setDraft((prev) => {
        const next = { ...prev };
        const byColor = { ...(next[productId] ?? {}) };
        const sizes = { ...(byColor[color] ?? {}) };
        if (!qty || qty <= 0) {
          delete sizes[size];
        } else {
          sizes[size] = qty;
        }
        if (Object.keys(sizes).length === 0) {
          delete byColor[color];
        } else {
          byColor[color] = sizes;
        }
        if (Object.keys(byColor).length === 0) {
          delete next[productId];
        } else {
          next[productId] = byColor;
        }
        return next;
      });
    },
    [],
  );

  const clearProductColor = useCallback((productId: string, color = "") => {
    setDraft((prev) => {
      if (!prev[productId]?.[color]) return prev;
      const next = { ...prev };
      const byColor = { ...next[productId] };
      delete byColor[color];
      if (Object.keys(byColor).length === 0) delete next[productId];
      else next[productId] = byColor;
      return next;
    });
  }, []);

  const clear = useCallback(() => setDraft({}), []);

  const { itemCount, unitCount } = useMemo(() => {
    let units = 0;
    let items = 0;
    for (const byColor of Object.values(draft)) {
      for (const sizes of Object.values(byColor)) {
        for (const qty of Object.values(sizes)) {
          if (qty > 0) {
            units += qty;
            items += 1;
          }
        }
      }
    }
    return { itemCount: items, unitCount: units };
  }, [draft]);

  const value = useMemo<DraftCtx>(
    () => ({ draft, setQty, clearProductColor, clear, itemCount, unitCount }),
    [draft, setQty, clearProductColor, clear, itemCount, unitCount],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOrderDraft() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useOrderDraft must be used within <OrderDraftProvider>");
  return ctx;
}
