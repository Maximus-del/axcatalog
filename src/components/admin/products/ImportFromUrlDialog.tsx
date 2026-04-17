import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function isValidUrl(value: string) {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function ImportFromUrlDialog({ open, onOpenChange }: Props) {
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = url.trim();
    if (!isValidUrl(trimmed)) {
      toast({ title: "Enter a valid URL (http or https)", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const userId = (await supabase.auth.getUser()).data.user?.id;
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("organization_id")
        .eq("id", userId ?? "")
        .maybeSingle();
      if (!profile?.organization_id) {
        toast({ title: "Organization not found", variant: "destructive" });
        return;
      }

      const { error } = await supabase.from("ingestion_jobs").insert({
        organization_id: profile.organization_id,
        created_by: userId ?? null,
        source_url: trimmed,
        status: "pending",
      });
      if (error) throw error;

      toast({ title: "Queued for ingestion — review it in the Ingestion queue" });
      setUrl("");
      onOpenChange(false);
      navigate("/admin/ingestion");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to queue";
      toast({ title: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Import Product from URL</DialogTitle>
          <DialogDescription>
            Paste a product URL and we&apos;ll queue it for extraction. You&apos;ll review and
            approve before it becomes a live product.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="source_url">Product URL *</Label>
            <Input
              id="source_url"
              type="url"
              placeholder="https://example.com/product/..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Queuing…" : "Queue for Ingestion"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
