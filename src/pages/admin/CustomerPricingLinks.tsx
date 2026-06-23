import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Copy, Plus, Trash2 } from "lucide-react";

type Tier = "athlete" | "corporate" | "standard";

interface TokenRow {
  id: string;
  organization_id: string;
  token: string;
  tier: Tier;
  customer_name: string | null;
  customer_email: string | null;
  active: boolean;
  expires_at: string | null;
  created_at: string;
  last_used_at: string | null;
}

const CATALOG_BASE = "https://axcatalog.lovable.app/catalog";
const linkFor = (token: string) => `${CATALOG_BASE}?t=${token}`;

const tierBadgeClass: Record<Tier, string> = {
  athlete: "bg-accent text-accent-foreground",
  corporate: "bg-primary/80 text-primary-foreground",
  standard: "bg-muted text-muted-foreground",
};

function copyLink(token: string) {
  navigator.clipboard
    .writeText(linkFor(token))
    .then(() => toast.success("Link copied"))
    .catch(() => toast.error("Couldn't copy"));
}

function fmtDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString();
}

export default function CustomerPricingLinks() {
  const { user } = useAuth();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [rows, setRows] = useState<TokenRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newTier, setNewTier] = useState<Tier>("corporate");
  const [newExpires, setNewExpires] = useState("");
  const [creating, setCreating] = useState(false);
  const [justCreated, setJustCreated] = useState<TokenRow | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<TokenRow | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from("user_profiles")
      .select("organization_id")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => setOrgId(data?.organization_id ?? null));
  }, [user?.id]);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("catalog_access_tokens")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      toast.error(error.message);
    } else {
      setRows((data ?? []) as TokenRow[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const resetForm = () => {
    setNewName("");
    setNewEmail("");
    setNewTier("corporate");
    setNewExpires("");
  };

  const handleCreate = async () => {
    if (!orgId) {
      toast.error("Organization not resolved yet");
      return;
    }
    if (!newName.trim()) {
      toast.error("Customer name is required");
      return;
    }
    setCreating(true);
    const token = (crypto.randomUUID() + crypto.randomUUID()).split("-").join("");
    const { data, error } = await supabase
      .from("catalog_access_tokens")
      .insert({
        organization_id: orgId,
        token,
        tier: newTier,
        customer_name: newName.trim(),
        customer_email: newEmail.trim() || null,
        expires_at: newExpires ? new Date(newExpires).toISOString() : null,
      })
      .select("*")
      .single();
    setCreating(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setJustCreated(data as TokenRow);
    setCreateOpen(false);
    resetForm();
    load();
  };

  const toggleActive = async (row: TokenRow) => {
    const { error } = await supabase
      .from("catalog_access_tokens")
      .update({ active: !row.active })
      .eq("id", row.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(row.active ? "Revoked" : "Reactivated");
    setRows((prev) =>
      prev.map((r) => (r.id === row.id ? { ...r, active: !row.active } : r)),
    );
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase
      .from("catalog_access_tokens")
      .delete()
      .eq("id", deleteTarget.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Deleted");
    setRows((prev) => prev.filter((r) => r.id !== deleteTarget.id));
    setDeleteTarget(null);
  };

  const sorted = useMemo(
    () =>
      [...rows].sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      ),
    [rows],
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Customer Pricing Links</h1>
          <p className="text-sm text-muted-foreground">
            Share tiered pricing with a customer via a single link.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> New link
        </Button>
      </div>

      <div className="border border-border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Tier</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Last used</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  Loading…
                </TableCell>
              </TableRow>
            ) : sorted.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-10">
                  No pricing links yet — create one to share tiered pricing with a customer.
                </TableCell>
              </TableRow>
            ) : (
              sorted.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.customer_name ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{r.customer_email ?? "—"}</TableCell>
                  <TableCell>
                    <Badge className={tierBadgeClass[r.tier]} variant="secondary">
                      {r.tier.charAt(0).toUpperCase() + r.tier.slice(1)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {r.active ? (
                      <Badge variant="outline" className="border-green-500 text-green-600">
                        Active
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-destructive text-destructive">
                        Revoked
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>{fmtDate(r.created_at)}</TableCell>
                  <TableCell>{fmtDate(r.last_used_at)}</TableCell>
                  <TableCell>{r.expires_at ? fmtDate(r.expires_at) : "Never"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => copyLink(r.token)}
                      >
                        <Copy className="h-3.5 w-3.5 mr-1" /> Copy link
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => toggleActive(r)}
                      >
                        {r.active ? "Revoke" : "Reactivate"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDeleteTarget(r)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New customer pricing link</DialogTitle>
            <DialogDescription>
              Generates a unique catalog URL with the chosen tier pricing.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cname">Customer name</Label>
              <Input
                id="cname"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Acme Corp"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cemail">Email (optional)</Label>
              <Input
                id="cemail"
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="buyer@acme.com"
              />
            </div>
            <div className="space-y-2">
              <Label>Tier</Label>
              <Select value={newTier} onValueChange={(v) => setNewTier(v as Tier)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="athlete">Athlete</SelectItem>
                  <SelectItem value="corporate">Corporate</SelectItem>
                  <SelectItem value="standard">Standard</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="exp">Expiration (optional)</Label>
              <Input
                id="exp"
                type="date"
                value={newExpires}
                onChange={(e) => setNewExpires(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? "Creating…" : "Create link"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Just-created reveal dialog */}
      <Dialog
        open={!!justCreated}
        onOpenChange={(o) => !o && setJustCreated(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link ready</DialogTitle>
            <DialogDescription>
              Send this URL to {justCreated?.customer_name}. They'll see{" "}
              {justCreated?.tier} pricing.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <Input readOnly value={justCreated ? linkFor(justCreated.token) : ""} />
            <Button
              variant="outline"
              onClick={() => justCreated && copyLink(justCreated.token)}
            >
              <Copy className="h-4 w-4 mr-1" /> Copy
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setJustCreated(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this link?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the token. The URL will stop working.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}