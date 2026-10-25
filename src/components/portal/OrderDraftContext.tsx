import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { cartStorageKey, parseStoredDraft, setDraftQty, type DraftMap } from "@/lib/portal/cart";

/**
 * The portal cart. productId -> colorKey -> size -> qty.
 * colorKey is the color name, or "" when the product has no color choice.
 *
 * Kept per client in this browser (localStorage), so a refresh or closing the
 * app doesn't empty it. Quick Order, the product page and the bulk sheet all
 * write here; CartSheet checks it out.
 */
interface DraftCtx {
  draft: DraftMap;
  setQty: (productId: string, size: string, qty: number, color?: string) => void;
  /** Add (or with a negative number, remove) units of one cell. */
  addQty: (productId: string, size: string, delta: number, color?: string) => void;
  clearProductColor: (productId: string, color?: string) => void;
  clear: () => void;
  itemCount: number;
  unitCount: number;
  cartOpen: boolean;
  openCart: () => void;
  setCartOpen: (open: boolean) => void;
}

const Ctx = createContext<DraftCtx | undefined>(undefined);

function readStored(key: string | null): DraftMap {
  if (!key) return {};
  try {
    return parseStoredDraft(window.localStorage.getItem(key));
  } catch {
    return {};
  }
}

export function OrderDraftProvider({ children, storageKeyFor }: { children: ReactNode; storageKeyFor?: string | null }) {
  const key = storageKeyFor ? cartStorageKey(storageKeyFor) : null;
  // The cart and the client it belongs to travel together, so switching
  // clients (View-as, test drive) never writes one client's cart under another.
  const [store, setStore] = useState<{ key: string | null; draft: DraftMap }>(() => ({ key, draft: readStored(key) }));
  if (store.key !== key) setStore({ key, draft: readStored(key) });
  const draft = useMemo<DraftMap>(() => (store.key === key ? store.draft : {}), [store, key]);
  const setDraft = useCallback((fn: (prev: DraftMap) => DraftMap) => setStore((s) => ({ ...s, draft: fn(s.draft) })), []);
  const [cartOpen, setCartOpen] = useState(false);

  useEffect(() => {
    if (!store.key) return;
    try {
      if (Object.keys(store.draft).length) window.localStorage.setItem(store.key, JSON.stringify(store.draft));
      else window.localStorage.removeItem(store.key);
    } catch {
      /* private mode / storage full: the cart still works for this visit */
    }
  }, [store]);

  const setQty = useCallback((productId: string, size: string, qty: number, color = "") => {
    setDraft((prev) => setDraftQty(prev, productId, size, qty, color));
  }, [setDraft]);

  const addQty = useCallback((productId: string, size: string, delta: number, color = "") => {
    setDraft((prev) => setDraftQty(prev, productId, size, (prev[productId]?.[color]?.[size] ?? 0) + delta, color));
  }, [setDraft]);

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
  }, [setDraft]);

  const clear = useCallback(() => setDraft(() => ({})), [setDraft]);
  const openCart = useCallback(() => setCartOpen(true), []);

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
    () => ({ draft, setQty, addQty, clearProductColor, clear, itemCount, unitCount, cartOpen, openCart, setCartOpen }),
    [draft, setQty, addQty, clearProductColor, clear, itemCount, unitCount, cartOpen, openCart],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOrderDraft() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useOrderDraft must be used within <OrderDraftProvider>");
  return ctx;
}
