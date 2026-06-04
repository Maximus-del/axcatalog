import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMyAffiliate } from "@/hooks/useAffiliate";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import AffiliateSignupCTA from "@/components/affiliate/AffiliateSignupCTA";

interface ProductRow {
  id: string;
  title: string;
  primary_image_url: string | null;
  status: string | null;
}

interface RequestRow {
  id: string;
  product_id: string;
  status: "pending" | "approved" | "rejected";
}

export default function AffiliateProducts() {
  const { affiliate, loading: affLoading } = useMyAffiliate();
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!affiliate) return;
    setLoading(true);
    const [{ data: prods }, { data: reqs }] = await Promise.all([
      supabase
        .from("products")
        .select("id, title, primary_image_url, status")
        .eq("status", "active")
        .order("title")
        .limit(200),
      supabase
        .from("affiliate_product_requests")
        .select("id, product_id, status")
        .eq("affiliate_id", affiliate.id),
    ]);
    setProducts((prods ?? []) as ProductRow[]);
    setRequests((reqs ?? []) as RequestRow[]);
    setLoading(false);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [affiliate?.id]);

  if (affLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (!affiliate) return <AffiliateSignupCTA />;

  if (affiliate.status !== "active") {
    return (
      <div className="ax-card p-6">
        <p>Your account is <Badge variant="outline">{affiliate.status}</Badge>. Product browsing unlocks once an admin approves you.</p>
      </div>
    );
  }

  const requestMap = new Map(requests.map((r) => [r.product_id, r]));

  const handleRequest = async (productId: string) => {
    const { error } = await supabase
      .from("affiliate_product_requests")
      .insert({ affiliate_id: affiliate.id, product_id: productId });
    if (error) {
      toast({ title: "Request failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Request submitted" });
    await load();
  };

  const filtered = products.filter((p) => p.title.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="ax-section-header">Promote products</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Request a product → admin approves → it counts toward your commission when buyers use your code.
        </p>
      </div>
      <Input placeholder="Search products…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />

      {loading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map((p) => {
            const req = requestMap.get(p.id);
            return (
              <div key={p.id} className="ax-card overflow-hidden flex flex-col">
                <div className="aspect-square bg-muted">
                  {p.primary_image_url ? (
                    <img src={p.primary_image_url} alt={p.title} className="w-full h-full object-cover" />
                  ) : null}
                </div>
                <div className="p-3 flex-1 flex flex-col gap-2">
                  <p className="text-sm font-medium line-clamp-2">{p.title}</p>
                  <div className="mt-auto">
                    {req ? (
                      <Badge variant={req.status === "approved" ? "default" : req.status === "rejected" ? "destructive" : "outline"} className="uppercase">
                        {req.status}
                      </Badge>
                    ) : (
                      <Button size="sm" className="w-full" onClick={() => void handleRequest(p.id)}>
                        Request
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}