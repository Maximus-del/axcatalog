import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useCart } from "./CartContext";
import { useCatalogAccess } from "./CatalogAccessContext";

export default function CatalogCheckout() {
  const { lines, updateQty, removeLine, clear, totalUnits } = useCart();
  const { token } = useCatalogAccess();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<{ order_number: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lines.length) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("submit-catalog-order", {
        body: {
          token: token ?? null,
          customer_name: name.trim(),
          customer_email: email.trim(),
          items: lines.map((l) => ({
            blank_id: l.blank_id,
            color: l.color,
            size: l.size,
            quantity: l.quantity,
          })),
        },
      });
      if (error) throw error;
      if (!data?.order_number) throw new Error("Missing order number");
      setConfirmation({ order_number: data.order_number });
      clear();
    } catch (err: any) {
      toast({
        title: "Order failed",
        description: err?.message ?? "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (confirmation) {
    return (
      <div className="max-w-md mx-auto py-16 text-center space-y-5">
        <h1 className="text-2xl font-bold tracking-tight">Order received</h1>
        <p className="text-sm text-muted-foreground">
          Thanks — we'll be in touch shortly. Your reference number is:
        </p>
        <p className="font-mono text-lg tabular-nums tracking-wider">
          {confirmation.order_number}
        </p>
        <Button onClick={() => navigate("/catalog")} className="w-full">
          Back to catalog
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link
        to="/catalog"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Continue browsing
      </Link>

      <h1 className="text-2xl font-bold tracking-tight">Your cart</h1>

      {lines.length === 0 ? (
        <p className="text-sm text-muted-foreground">Your cart is empty.</p>
      ) : (
        <>
          <div className="rounded-lg border border-border divide-y divide-border">
            {lines.map((l, i) => (
              <div
                key={`${l.blank_id}-${l.color}-${l.size}-${i}`}
                className="flex items-center gap-3 p-3 text-sm"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{l.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {l.color} · {l.size}
                    {l.sku ? ` · SKU ${l.sku}` : ""}
                  </p>
                </div>
                <Input
                  type="number"
                  min={1}
                  value={l.quantity}
                  onChange={(e) => updateQty(i, parseInt(e.target.value || "1", 10) || 1)}
                  className="w-20"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeLine(i)}
                  aria-label="Remove line"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>

          <div className="text-sm text-muted-foreground">
            {totalUnits} unit{totalUnits === 1 ? "" : "s"} · final pricing calculated at checkout
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
            <div className="space-y-1.5">
              <Label htmlFor="name">Your name</Label>
              <Input
                id="name"
                required
                maxLength={200}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                maxLength={255}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <Button
              type="submit"
              disabled={submitting || !name.trim() || !email.trim()}
              className="w-full"
            >
              {submitting ? "Submitting…" : "Submit order request"}
            </Button>
          </form>
        </>
      )}
    </div>
  );
}