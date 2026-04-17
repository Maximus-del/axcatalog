import { createContext, useCallback, useContext, useMemo, useState, ReactNode } from "react";

/**
 * In-memory order draft. Maps productId -> { size -> qty }.
 * Cleared on refresh (per design decision).
 */
type DraftMap = Record<string, Record<string, number>>;

interface DraftCtx {
  draft: DraftMap;
  setQty: (productId: string, size: string, qty: number) => void;
  bulkSet: (productId: string, sizes: Record<string, number>) => void;
  clear: () => void;
  itemCount: number;
  unitCount: number;
}

const Ctx = createContext<DraftCtx | undefined>(undefined);

export function OrderDraftProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<DraftMap>({});

  const setQty = useCallback((productId: string, size: string, qty: number) => {
    setDraft((prev) => {
      const next = { ...prev };
      const product = { ...(next[productId] ?? {}) };
      if (!qty || qty <= 0) {
        delete product[size];
      } else {
        product[size] = qty;
      }
      if (Object.keys(product).length === 0) {
        delete next[productId];
      } else {
        next[productId] = product;
      }
      return next;
    });
  }, []);

  const bulkSet = useCallback((productId: string, sizes: Record<string, number>) => {
    setDraft((prev) => {
      const next = { ...prev };
      const cleaned: Record<string, number> = {};
      for (const [size, qty] of Object.entries(sizes)) {
        if (qty > 0) cleaned[size] = qty;
      }
      if (Object.keys(cleaned).length === 0) {
        delete next[productId];
      } else {
        next[productId] = { ...(next[productId] ?? {}), ...cleaned };
        // Re-clean zeroes
        for (const [s, q] of Object.entries(next[productId])) {
          if (q <= 0) delete next[productId][s];
        }
        if (Object.keys(next[productId]).length === 0) delete next[productId];
      }
      return next;
    });
  }, []);

  const clear = useCallback(() => setDraft({}), []);

  const { itemCount, unitCount } = useMemo(() => {
    let units = 0;
    let items = 0;
    for (const product of Object.values(draft)) {
      for (const qty of Object.values(product)) {
        if (qty > 0) {
          units += qty;
          items += 1;
        }
      }
    }
    return { itemCount: items, unitCount: units };
  }, [draft]);

  const value = useMemo<DraftCtx>(
    () => ({ draft, setQty, bulkSet, clear, itemCount, unitCount }),
    [draft, setQty, bulkSet, clear, itemCount, unitCount],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOrderDraft() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useOrderDraft must be used within <OrderDraftProvider>");
  return ctx;
}
