import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/auth/AuthProvider";
import { slugify } from "@/lib/slug";
import {
  BLANK_AVAILABILITIES,
  GARMENT_TYPES,
  formatAvailability,
  formatGarmentType,
} from "@/lib/blank-status";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}

interface ColorRow {
  color_name: string;
  hex_code: string;
  available: boolean;
}
interface SizeRow {
  size: string;
  available: boolean;
}
interface SpecRow {
  key: string;
  value: string;
}

const DEFAULT_SPECS: SpecRow[] = [
  { key: "weight_oz", value: "" },
  { key: "composition", value: "" },
  { key: "gsm", value: "" },
  { key: "thickness", value: "" },
];

const DEFAULT_SIZES: SizeRow[] = ["S", "M", "L", "XL", "2XL"].map((s) => ({
  size: s,
  available: true,
}));

export function BlankFormDialog({ open, onOpenChange, onCreated }: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [submitting, setSubmitting] = useState(false);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [vendor, setVendor] = useState("");
  const [brand, setBrand] = useState("");
  const [styleNumber, setStyleNumber] = useState("");
  const [garmentType, setGarmentType] = useState<string>("tee");
  const [specs, setSpecs] = useState<SpecRow[]>(DEFAULT_SPECS);
  const [cost, setCost] = useState("");
  const [moq, setMoq] = useState("");
  const [sellable, setSellable] = useState(false);
  const [internal, setInternal] = useState(true);
  const [availability, setAvailability] = useState<string>("in_stock");
  const [colors, setColors] = useState<ColorRow[]>([]);
  const [sizes, setSizes] = useState<SizeRow[]>(DEFAULT_SIZES);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!slugTouched) setSlug(slugify(name));
  }, [name, slugTouched]);

  function reset() {
    setName("");
    setSlug("");
    setSlugTouched(false);
    setVendor("");
    setBrand("");
    setStyleNumber("");
    setGarmentType("tee");
    setSpecs(DEFAULT_SPECS);
    setCost("");
    setMoq("");
    setSellable(false);
    setInternal(true);
    setAvailability("in_stock");
    setColors([]);
    setSizes(DEFAULT_SIZES);
    setNotes("");
  }

  async function handleSubmit() {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (!user) {
      toast.error("Not signed in");
      return;
    }
    setSubmitting(true);
    try {
      const profileRes = await supabase
        .from("user_profiles")
        .select("organization_id")
        .eq("id", user.id)
        .maybeSingle();
      const orgId = profileRes.data?.organization_id;
      if (!orgId) throw new Error("No organization");

      const fabricSpecs: Record<string, string | number> = {};
      specs.forEach((s) => {
        if (!s.key.trim() || !s.value.trim()) return;
        const num = Number(s.value);
        fabricSpecs[s.key.trim()] = isNaN(num) ? s.value.trim() : num;
      });

      const insertRes = await supabase
        .from("blanks")
        .insert({
          organization_id: orgId,
          name: name.trim(),
          slug: slug || slugify(name),
          vendor: vendor || null,
          brand: brand || null,
          style_number: styleNumber || null,
          garment_type: garmentType as
            | "tee"
            | "long_sleeve"
            | "hoodie"
            | "crewneck"
            | "zip_hoodie"
            | "tank"
            | "polo"
            | "jersey"
            | "shorts"
            | "sweatpants"
            | "hat"
            | "beanie"
            | "other",
          fabric_specs: fabricSpecs,
          cost: cost ? Number(cost) : null,
          moq: moq ? Math.floor(Number(moq)) : null,
          sellable_as_blank: sellable,
          internal_only: internal,
          availability_status: availability as
            | "in_stock"
            | "low_stock"
            | "out_of_stock"
            | "discontinued"
            | "preorder",
          notes: notes || null,
        })
        .select("id")
        .single();
      if (insertRes.error) throw insertRes.error;
      const blankId = insertRes.data.id;

      const validColors = colors.filter((c) => c.color_name.trim());
      if (validColors.length) {
        await supabase.from("blank_colors").insert(
          validColors.map((c, i) => ({
            blank_id: blankId,
            color_name: c.color_name.trim(),
            hex_code: c.hex_code || null,
            available: c.available,
            sort_order: i,
          })),
        );
      }
      const validSizes = sizes.filter((s) => s.size.trim());
      if (validSizes.length) {
        await supabase.from("blank_sizes").insert(
          validSizes.map((s, i) => ({
            blank_id: blankId,
            size: s.size.trim(),
            available: s.available,
            sort_order: i,
          })),
        );
      }

      toast.success("Blank created");
      reset();
      onOpenChange(false);
      onCreated?.();
      navigate(`/admin/blanks/${blankId}`);
    } catch (err) {
      console.error(err);
      toast.error("Failed to create blank");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Blank</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-2">
          <Section title="Basics">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Name *</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Slug</Label>
                <Input
                  value={slug}
                  onChange={(e) => {
                    setSlug(e.target.value);
                    setSlugTouched(true);
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label>Vendor</Label>
                <Input value={vendor} onChange={(e) => setVendor(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Brand</Label>
                <Input value={brand} onChange={(e) => setBrand(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Style Number</Label>
                <Input value={styleNumber} onChange={(e) => setStyleNumber(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Garment Type *</Label>
                <Select value={garmentType} onValueChange={setGarmentType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {GARMENT_TYPES.map((g) => (
                      <SelectItem key={g} value={g} className="capitalize">
                        {formatGarmentType(g)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </Section>

          <Section title="Fabric Specs">
            <div className="space-y-2">
              {specs.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    placeholder="Field"
                    value={s.key}
                    onChange={(e) => {
                      const next = [...specs];
                      next[i] = { ...next[i], key: e.target.value };
                      setSpecs(next);
                    }}
                  />
                  <Input
                    placeholder="Value"
                    value={s.value}
                    onChange={(e) => {
                      const next = [...specs];
                      next[i] = { ...next[i], value: e.target.value };
                      setSpecs(next);
                    }}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setSpecs(specs.filter((_, idx) => idx !== i))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSpecs([...specs, { key: "", value: "" }])}
                className="gap-2"
              >
                <Plus className="h-3 w-3" /> Add Custom Field
              </Button>
            </div>
          </Section>

          <Section title="Pricing & Ordering">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Cost</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>MOQ</Label>
                <Input
                  type="number"
                  step="1"
                  value={moq}
                  onChange={(e) => setMoq(e.target.value)}
                />
              </div>
              <div className="space-y-2 col-span-2">
                <Label>Availability</Label>
                <Select value={availability} onValueChange={setAvailability}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BLANK_AVAILABILITIES.map((a) => (
                      <SelectItem key={a} value={a} className="capitalize">
                        {formatAvailability(a)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between p-3 border border-border rounded-md col-span-2">
                <div>
                  <Label className="text-sm">Sellable as Blank</Label>
                  <p className="text-xs text-muted-foreground">Available for direct sale</p>
                </div>
                <Switch checked={sellable} onCheckedChange={setSellable} />
              </div>
              <div className="flex items-center justify-between p-3 border border-border rounded-md col-span-2">
                <div>
                  <Label className="text-sm">Internal Only</Label>
                  <p className="text-xs text-muted-foreground">Hide from public catalogs</p>
                </div>
                <Switch checked={internal} onCheckedChange={setInternal} />
              </div>
            </div>
          </Section>

          <Section title="Colors">
            <div className="space-y-2">
              {colors.map((c, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    placeholder="Color name"
                    value={c.color_name}
                    onChange={(e) => {
                      const next = [...colors];
                      next[i] = { ...next[i], color_name: e.target.value };
                      setColors(next);
                    }}
                  />
                  <Input
                    type="color"
                    className="w-16 p-1 h-10"
                    value={c.hex_code || "#000000"}
                    onChange={(e) => {
                      const next = [...colors];
                      next[i] = { ...next[i], hex_code: e.target.value };
                      setColors(next);
                    }}
                  />
                  <div className="flex items-center gap-1">
                    <Switch
                      checked={c.available}
                      onCheckedChange={(v) => {
                        const next = [...colors];
                        next[i] = { ...next[i], available: v };
                        setColors(next);
                      }}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setColors(colors.filter((_, idx) => idx !== i))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setColors([...colors, { color_name: "", hex_code: "#000000", available: true }])
                }
                className="gap-2"
              >
                <Plus className="h-3 w-3" /> Add Color
              </Button>
            </div>
          </Section>

          <Section title="Sizes">
            <div className="space-y-2">
              {sizes.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    placeholder="Size"
                    value={s.size}
                    onChange={(e) => {
                      const next = [...sizes];
                      next[i] = { ...next[i], size: e.target.value };
                      setSizes(next);
                    }}
                  />
                  <Switch
                    checked={s.available}
                    onCheckedChange={(v) => {
                      const next = [...sizes];
                      next[i] = { ...next[i], available: v };
                      setSizes(next);
                    }}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setSizes(sizes.filter((_, idx) => idx !== i))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSizes([...sizes, { size: "", available: true }])}
                className="gap-2"
              >
                <Plus className="h-3 w-3" /> Add Size
              </Button>
            </div>
          </Section>

          <Section title="Notes">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Creating…" : "Create Blank"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="ax-section-header">{title}</div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}
