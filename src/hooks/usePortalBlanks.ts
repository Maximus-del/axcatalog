import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface PortalBlank {
  id: string;
  name: string;
  vendor: string | null;
  garment_type: string | null;
  colors: Array<{ name: string; hex: string | null }>;
  sizes: string[];
}

/**
 * Athlete-facing AX blank garments (sellable, not internal-only) with their
 * available colors + sizes.
 */
export function usePortalBlanks() {
  const [blanks, setBlanks] = useState<PortalBlank[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data: rows } = await supabase
        .from("blanks")
        .select("id, name, vendor, garment_type, sellable_as_blank, internal_only")
        .eq("sellable_as_blank", true)
        .eq("internal_only", false)
        .order("name", { ascending: true });

      const ids = (rows ?? []).map((r) => r.id);
      const colors = new Map<string, Array<{ name: string; hex: string | null }>>();
      const sizes = new Map<string, string[]>();
      if (ids.length) {
        const [cRes, sRes] = await Promise.all([
          supabase
            .from("blank_colors")
            .select("blank_id, color_name, hex_code, sort_order")
            .in("blank_id", ids)
            .eq("available", true)
            .order("sort_order", { ascending: true }),
          supabase
            .from("blank_sizes")
            .select("blank_id, size, sort_order")
            .in("blank_id", ids)
            .eq("available", true)
            .order("sort_order", { ascending: true }),
        ]);
        (cRes.data ?? []).forEach((c) => {
          const arr = colors.get(c.blank_id) ?? [];
          arr.push({ name: c.color_name, hex: c.hex_code });
          colors.set(c.blank_id, arr);
        });
        (sRes.data ?? []).forEach((s) => {
          const arr = sizes.get(s.blank_id) ?? [];
          arr.push(s.size);
          sizes.set(s.blank_id, arr);
        });
      }

      if (cancelled) return;
      setBlanks(
        (rows ?? []).map((r) => ({
          id: r.id,
          name: r.name,
          vendor: r.vendor,
          garment_type: r.garment_type,
          colors: colors.get(r.id) ?? [],
          sizes: sizes.get(r.id) ?? [],
        })),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { blanks, loading: blanks === null };
}
