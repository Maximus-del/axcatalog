import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Save, DollarSign, Layers, Frame, Store } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface PricingTier {
  id: string;
  name: string;
  sort_order: number;
  is_default: boolean;
}
interface VolumeBreak {
  id: string;
  min_units: number;
  max_units: number | null;
  discount_percent: number;
  label: string | null;
}

export default function AdminSettings() {
  const [loading, setLoading] = useState(true);
  const [moq, setMoq] = useState<string>("");
  const [moqInitial, setMoqInitial] = useState<string>("");
  const [savingMoq, setSavingMoq] = useState(false);
  const [tiers, setTiers] = useState<PricingTier[]>([]);
  const [breaks, setBreaks] = useState<VolumeBreak[]>([]);
  const [printZoneCount, setPrintZoneCount] = useState(0);
  const [orgTotal, setOrgTotal] = useState(0);
  const [orgConnected, setOrgConnected] = useState(0);

  async function load() {
    setLoading(true);
    const [moqRes, tierRes, breakRes, pzRes, orgRes, orgConnRes] = await Promise.all([
      supabase.from("system_settings").select("value").eq("key", "moq_units").maybeSingle(),
      supabase.from("pricing_tiers").select("id, name, sort_order, is_default").order("sort_order"),
      supabase
        .from("volume_discount_breaks")
        .select("id, min_units, max_units, discount_percent, label")
        .order("min_units", { ascending: true }),
      supabase.from("print_zones").select("id", { count: "exact", head: true }),
      supabase.from("organizations").select("id", { count: "exact", head: true }),
      supabase
        .from("organizations")
        .select("id", { count: "exact", head: true })
        .eq("shopify_connected", true),
    ]);

    const moqVal = moqRes.data?.value != null ? String(moqRes.data.value) : "";
    setMoq(moqVal);
    setMoqInitial(moqVal);
    setTiers((tierRes.data ?? []) as PricingTier[]);
    setBreaks((breakRes.data ?? []) as VolumeBreak[]);
    setPrintZoneCount(pzRes.count ?? 0);
    setOrgTotal(orgRes.count ?? 0);
    setOrgConnected(orgConnRes.count ?? 0);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function saveMoq() {
    const n = Number(moq);
    if (!Number.isFinite(n) || n < 1 || !Number.isInteger(n)) {
      toast.error("Minimum order quantity must be a whole number of 1 or more.");
      return;
    }
    setSavingMoq(true);
    const { error } = await supabase
      .from("system_settings")
      .upsert({ key: "moq_units", value: n }, { onConflict: "key" });
    setSavingMoq(false);
    if (error) {
      toast.error("Could not save — you may not have permission.");
      return;
    }
    setMoqInitial(String(n));
    toast.success("Minimum order quantity saved.");
  }

  const moqDirty = moq !== moqInitial;

  return (
    <div className="p-6 lg:p-8 max-w-[1000px] mx-auto space-y-6">
      <header>
        <div className="ax-section-header mb-2">System</div>
        <h1 className="text-3xl font-bold">Settings</h1>
      </header>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : (
        <>
          {/* General / MOQ */}
          <section className="ax-card space-y-4">
            <div>
              <h2 className="font-semibold">Ordering</h2>
              <p className="text-sm text-muted-foreground">Store-wide ordering rules.</p>
            </div>
            <div className="flex items-end gap-3 flex-wrap">
              <div className="space-y-1.5">
                <label htmlFor="moq" className="text-sm font-medium">
                  Minimum order quantity (units)
                </label>
                <Input
                  id="moq"
                  type="number"
                  min={1}
                  step={1}
                  value={moq}
                  onChange={(e) => setMoq(e.target.value)}
                  className="w-40"
                  placeholder="e.g. 10"
                />
                <p className="text-xs text-muted-foreground">
                  The supplier blank cost break applies at this quantity.
                </p>
              </div>
              <Button onClick={saveMoq} disabled={!moqDirty || savingMoq} className="gap-2">
                <Save className="h-4 w-4" />
                {savingMoq ? "Saving…" : "Save"}
              </Button>
            </div>
          </section>

          {/* Pricing tiers */}
          <section className="ax-card space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold flex items-center gap-2">
                <DollarSign className="h-4 w-4" /> Pricing Tiers
              </h2>
              <Link to="/admin/pricing" className="text-accent text-sm hover:underline">
                Manage pricing
              </Link>
            </div>
            {tiers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No pricing tiers configured.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {tiers.map((t) => (
                  <span
                    key={t.id}
                    className="inline-flex items-center gap-2 rounded-[10px] border border-border px-3 py-1.5 text-sm"
                  >
                    {t.name}
                    {t.is_default && <span className="ax-badge-success">Default</span>}
                  </span>
                ))}
              </div>
            )}
          </section>

          {/* Volume discount breaks */}
          <section className="ax-card space-y-3">
            <h2 className="font-semibold flex items-center gap-2">
              <Layers className="h-4 w-4" /> Volume Discount Breaks
            </h2>
            {breaks.length === 0 ? (
              <p className="text-sm text-muted-foreground">No volume breaks configured.</p>
            ) : (
              <div className="overflow-hidden rounded-[10px] border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-2 font-medium">Units</th>
                      <th className="px-4 py-2 font-medium text-right">Discount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {breaks.map((b) => (
                      <tr key={b.id} className="border-b border-border last:border-0">
                        <td className="px-4 py-2 tabular-nums">
                          {b.label ??
                            (b.max_units
                              ? `${b.min_units}–${b.max_units}`
                              : `${b.min_units}+`)}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">{b.discount_percent}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Applied as an order-level discount after tier markup.
            </p>
          </section>

          {/* Quick links / status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Link to="/admin/print-zones" className="ax-card-hover">
              <div className="flex items-center gap-2 font-semibold">
                <Frame className="h-4 w-4" /> Print Zones
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                {printZoneCount} zone{printZoneCount === 1 ? "" : "s"} configured
              </div>
            </Link>
            <Link to="/admin/organizations" className="ax-card-hover">
              <div className="flex items-center gap-2 font-semibold">
                <Store className="h-4 w-4" /> Shopify Connections
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                {orgConnected} of {orgTotal} organization{orgTotal === 1 ? "" : "s"} connected
              </div>
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
