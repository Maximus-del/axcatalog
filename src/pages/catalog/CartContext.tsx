import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

// Client-side cart. Prices are NEVER stored here — server recomputes at checkout.
export interface CartCustomization {
  surface: "front" | "back";
  surface_label: string;
  zone_id: string;
  placement_label: string;
  // All values are percentages of the print-zone BOX (0..1).
  // May be negative or >1 — the rendered/print-ready asset is clipped to the box.
  x_pct: number;
  y_pct: number;
  w_pct: number;
  h_pct: number;
  rotation_deg: number;
  asset_path: string;        // storage path inside the design-files bucket
  asset_filename: string;
  asset_mime: string;
  /** Local object-URL for preview only — not persisted across reloads. */
  preview_url?: string;
}

export interface CartLine {
  blank_id: string;
  sku: string | null;
  name: string;
  color: string;
  size: string;
  quantity: number;
  customization?: CartCustomization;
}

interface CartContextValue {
  lines: CartLine[];
  addLine: (line: CartLine) => void;
  updateQty: (index: number, quantity: number) => void;
  removeLine: (index: number) => void;
  clear: () => void;
  totalUnits: number;
}

const STORAGE_KEY = "wholesale_catalog_cart_v1";
const CartContext = createContext<CartContextValue | null>(null);

function loadInitial(): CartLine[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>(loadInitial);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
    } catch {
      /* ignore */
    }
  }, [lines]);

  const addLine = useCallback((line: CartLine) => {
    setLines((prev) => {
      // Never dedup customized lines — each placement is unique.
      if (line.customization) {
        return [...prev, line];
      }
      const idx = prev.findIndex(
        (l) =>
          l.blank_id === line.blank_id &&
          l.color === line.color &&
          l.size === line.size &&
          !l.customization,
      );
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + line.quantity };
        return next;
      }
      return [...prev, line];
    });
  }, []);

  const updateQty = useCallback((index: number, quantity: number) => {
    setLines((prev) => {
      const next = [...prev];
      if (!next[index]) return prev;
      next[index] = { ...next[index], quantity: Math.max(1, quantity) };
      return next;
    });
  }, []);

  const removeLine = useCallback((index: number) => {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const clear = useCallback(() => setLines([]), []);

  const totalUnits = useMemo(
    () => lines.reduce((s, l) => s + (l.quantity || 0), 0),
    [lines],
  );

  const value = useMemo(
    () => ({ lines, addLine, updateQty, removeLine, clear, totalUnits }),
    [lines, addLine, updateQty, removeLine, clear, totalUnits],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}