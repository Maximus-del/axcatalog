// Operator Content tab: an athlete-specific CMS. Create posts/photos/videos/
// blogs/access content → content_assets (shared object) → flows to fans.
import { useState } from "react";
import { Plus, Loader2, Eye, Lock } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useOperatorContent } from "@/hooks/useContent";
import { useAthleteProducts } from "@/hooks/useDiscoverAthletes";
import { createContent, updateContentStatus, type ContentInput } from "@/lib/ecosystem/content";
import { useAuth } from "@/auth/AuthProvider";

const TYPES = ["photo", "video", "blog", "update", "bts", "gallery"] as const;
const VIS = ["public", "followers", "access", "vip"] as const;
const CATEGORIES = ["From the Farm", "Behind the Athlete", "Off the Field", "Game Week", "The Drop", "Camp Stories"];

export function AthleteContentTab({ athleteId, organizationId, athleteName }: { athleteId: string; organizationId: string; athleteName: string }) {
  const qc = useQueryClient();
  const { data: content = [], isLoading } = useOperatorContent(athleteId);
  const [composing, setComposing] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ["op-content", athleteId] });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold uppercase tracking-wider text-[hsl(var(--ax-secondary))]">Content</h3>
        <button onClick={() => setComposing(true)} className="h-9 px-3 rounded-lg bg-[hsl(var(--ax-accent))] text-[hsl(var(--ax-on-accent))] font-semibold text-[13px] inline-flex items-center gap-1.5">
          <Plus className="h-4 w-4" /> New Post
        </button>
      </div>

      {isLoading ? (
        <div className="text-sm text-[hsl(var(--ax-secondary))]">Loading…</div>
      ) : content.length === 0 ? (
        <div className="ax-card p-6 text-center text-sm text-[hsl(var(--ax-secondary))]">
          No content yet. Publish photos, videos, blogs, or Access-only posts — they appear in Goat Farm Access.
        </div>
      ) : (
        <div className="ax-card divide-y divide-[hsl(var(--ax-line))]">
          {content.map((c) => (
            <div key={c.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="font-semibold truncate flex items-center gap-2">
                  {c.visibility !== "public" && c.visibility !== "followers" && <Lock className="h-3.5 w-3.5 text-[hsl(var(--ax-accent))]" />}
                  {c.title}
                </div>
                <div className="text-[12px] text-[hsl(var(--ax-faint))] capitalize">{c.type} · {c.visibility} · {c.status}</div>
              </div>
              {c.status !== "published" ? (
                <button onClick={async () => { await updateContentStatus(c.id, "published"); refresh(); toast.success("Published to Goat Farm Access"); }} className="h-8 px-3 rounded-lg bg-[hsl(var(--ax-accent))] text-[hsl(var(--ax-on-accent))] text-[12px] font-bold">Publish</button>
              ) : (
                <span className="text-[11px] font-black uppercase tracking-wider text-[hsl(var(--ax-accent))]">Live</span>
              )}
            </div>
          ))}
        </div>
      )}

      {composing && (
        <ContentComposer
          athleteId={athleteId} organizationId={organizationId} athleteName={athleteName}
          onClose={() => setComposing(false)}
          onSaved={() => { setComposing(false); refresh(); }}
        />
      )}
    </div>
  );
}

function ContentComposer({ athleteId, organizationId, athleteName, onClose, onSaved }: { athleteId: string; organizationId: string; athleteName: string; onClose: () => void; onSaved: () => void }) {
  const { user } = useAuth();
  const { data: products = [] } = useAthleteProducts(athleteId);
  const [type, setType] = useState<string>("photo");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [hero, setHero] = useState("");
  const [visibility, setVisibility] = useState("public");
  const [category, setCategory] = useState("");
  const [productId, setProductId] = useState("");
  const [notifyFollowers, setNotifyFollowers] = useState(true);
  const [notifyAccess, setNotifyAccess] = useState(true);
  const [saving, setSaving] = useState(false);
  const gated = visibility === "access" || visibility === "vip";

  async function submit(status: "draft" | "published") {
    if (!title.trim()) { toast.error("Title required"); return; }
    setSaving(true);
    try {
      const input: ContentInput = {
        organization_id: organizationId,
        athlete_id: athleteId,
        type,
        title: title.trim(),
        body: body.trim() || null,
        hero_url: hero.trim() || null,
        category: type === "blog" ? category || null : null,
        visibility,
        product_id: productId || null,
        status,
        publish_at: status === "published" ? new Date().toISOString() : null,
        notify: { followers: notifyFollowers, access: notifyAccess },
        created_by: user?.id ?? null,
      };
      await createContent(input);
      toast.success(status === "published" ? "Published to Goat Farm Access" : "Saved as draft");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/50 overflow-y-auto" onClick={onClose}>
      <div className="w-full max-w-lg ax-card p-5 my-8" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-bold text-lg mb-1">New Post</h3>
        <p className="text-[12px] text-[hsl(var(--ax-faint))] mb-4">For {athleteName} · appears in Goat Farm Access when published</p>
        <div className="grid grid-cols-2 gap-3">
          <FieldC label="Type"><select className="ax-field capitalize" value={type} onChange={(e) => setType(e.target.value)}>{TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select></FieldC>
          <FieldC label="Access level"><select className="ax-field capitalize" value={visibility} onChange={(e) => setVisibility(e.target.value)}>{VIS.map((v) => <option key={v} value={v}>{v}</option>)}</select></FieldC>
        </div>
        <div className="mt-3 space-y-3">
          <FieldC label="Title"><input className="ax-field" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Inside offseason training" /></FieldC>
          {type === "blog" && <FieldC label="Category"><select className="ax-field" value={category} onChange={(e) => setCategory(e.target.value)}><option value="">Select…</option>{CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></FieldC>}
          <FieldC label="Body / caption"><textarea className="ax-field min-h-[90px]" value={body} onChange={(e) => setBody(e.target.value)} /></FieldC>
          <FieldC label="Hero image URL (optional)"><input className="ax-field" value={hero} onChange={(e) => setHero(e.target.value)} placeholder="https://…" /></FieldC>
          {products.length > 0 && (
            <FieldC label="Shop the Look — linked product (optional)">
              <select className="ax-field" value={productId} onChange={(e) => setProductId(e.target.value)}>
                <option value="">None</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
            </FieldC>
          )}
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={notifyFollowers} onChange={(e) => setNotifyFollowers(e.target.checked)} /> Notify followers</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={notifyAccess} onChange={(e) => setNotifyAccess(e.target.checked)} /> Notify Access</label>
          </div>
          {gated && (
            <div className="rounded-lg border border-[hsl(var(--ax-accent)/0.3)] bg-[hsl(var(--ax-accent)/0.06)] p-3 text-[12px] text-[hsl(var(--ax-secondary))] flex items-start gap-2">
              <Eye className="h-4 w-4 text-[hsl(var(--ax-accent))] mt-0.5 shrink-0" />
              Fans without {visibility} will see a locked teaser (hero + title) and an Unlock prompt.
            </div>
          )}
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="h-10 px-4 rounded-lg border border-[hsl(var(--ax-border))] font-semibold text-sm">Cancel</button>
          <button onClick={() => submit("draft")} disabled={saving} className="flex-1 h-10 rounded-lg border border-[hsl(var(--ax-border))] font-semibold text-sm disabled:opacity-60">Save Draft</button>
          <button onClick={() => submit("published")} disabled={saving} className="flex-1 h-10 rounded-lg bg-[hsl(var(--ax-accent))] text-[hsl(var(--ax-on-accent))] font-bold text-sm inline-flex items-center justify-center gap-2 disabled:opacity-60">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Publish
          </button>
        </div>
      </div>
    </div>
  );
}

function FieldC({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--ax-secondary))] mb-1">{label}</label>
      {children}
    </div>
  );
}
