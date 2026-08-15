// Operator Content: one content_assets object, two PURPOSES.
//  • ACCESS  — fan-facing, lands in Goat Farm Access (visibility-gated, notifies fans).
//  • MARKETING — athlete-facing assets (IG feed/story, reels, promos) the athlete
//    downloads/shares; never shown in the fan feed (the public view excludes it).
// Both support real media upload (hero + gallery) to the content-media bucket.
import { useState } from "react";
import { Plus, Loader2, Eye, Lock, Megaphone, Users, ImagePlus, X } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useOperatorContent } from "@/hooks/useContent";
import { useAthleteProducts } from "@/hooks/useDiscoverAthletes";
import { createContent, updateContentStatus, type ContentInput } from "@/lib/ecosystem/content";
import { uploadContentMedia, uploadContentMediaBatch } from "@/lib/upload-content-media";
import { useAuth } from "@/auth/AuthProvider";

const ACCESS_TYPES = ["photo", "video", "blog", "update", "bts", "gallery"] as const;
const VIS = ["public", "followers", "access", "vip"] as const;
const CATEGORIES = ["From the Farm", "Behind the Athlete", "Off the Field", "Game Week", "The Drop", "Camp Stories"];
const FORMATS = [
  { v: "ig_feed", l: "Instagram Feed" },
  { v: "ig_story", l: "Instagram Story" },
  { v: "reel", l: "Reel / Short Video" },
  { v: "promo", l: "Promo Video" },
  { v: "product_photo", l: "Product Photography" },
  { v: "campaign_graphic", l: "Campaign Graphic" },
  { v: "post_kit", l: "Post Kit" },
];
const VIDEO_FORMATS = new Set(["reel", "promo"]);

export function AthleteContentTab({ athleteId, organizationId, athleteName }: { athleteId: string; organizationId: string; athleteName: string }) {
  const qc = useQueryClient();
  const { data: content = [], isLoading } = useOperatorContent(athleteId);
  const [composing, setComposing] = useState<null | "access" | "marketing">(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["op-content", athleteId] });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-sm font-bold uppercase tracking-wider text-[hsl(var(--ax-secondary))]">Content</h3>
        <div className="flex gap-2">
          <button onClick={() => setComposing("marketing")} className="h-9 px-3 rounded-lg border border-[hsl(var(--ax-border))] font-semibold text-[13px] inline-flex items-center gap-1.5 hover:bg-[hsl(var(--ax-line))]">
            <Megaphone className="h-4 w-4 text-[hsl(var(--ax-accent))]" /> Marketing
          </button>
          <button onClick={() => setComposing("access")} className="h-9 px-3 rounded-lg bg-[hsl(var(--ax-accent))] text-[hsl(var(--ax-on-accent))] font-semibold text-[13px] inline-flex items-center gap-1.5">
            <Plus className="h-4 w-4" /> Access Post
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-sm text-[hsl(var(--ax-secondary))]">Loading…</div>
      ) : content.length === 0 ? (
        <div className="ax-card p-6 text-center text-sm text-[hsl(var(--ax-secondary))]">
          No content yet. <strong>Access</strong> posts appear in Goat Farm Access; <strong>Marketing</strong> assets go to the athlete's dashboard to post/share.
        </div>
      ) : (
        <div className="ax-card divide-y divide-[hsl(var(--ax-line))]">
          {content.map((c) => {
            const marketing = c.content_purpose === "marketing";
            return (
              <div key={c.id} className="flex items-center gap-3 px-4 py-3">
                <span className={`shrink-0 h-6 px-2 rounded-md text-[10px] font-black uppercase tracking-wider inline-flex items-center gap-1 ${marketing ? "bg-[hsl(var(--ax-line))] text-[hsl(var(--ax-secondary))]" : "bg-[hsl(var(--ax-accent)/0.15)] text-[hsl(var(--ax-accent))]"}`}>
                  {marketing ? <Megaphone className="h-3 w-3" /> : <Users className="h-3 w-3" />}
                  {marketing ? "Mktg" : "Access"}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold truncate flex items-center gap-2">
                    {!marketing && c.visibility !== "public" && c.visibility !== "followers" && <Lock className="h-3.5 w-3.5 text-[hsl(var(--ax-accent))]" />}
                    {c.title}
                  </div>
                  <div className="text-[12px] text-[hsl(var(--ax-faint))] capitalize">
                    {(c.content_format?.replace(/_/g, " ") || c.type)} · {marketing ? "athlete-facing" : c.visibility} · {c.status}
                  </div>
                </div>
                {c.status !== "published" ? (
                  <button onClick={async () => { await updateContentStatus(c.id, "published"); refresh(); toast.success(marketing ? "Published to athlete dashboard" : "Published to Goat Farm Access"); }} className="h-8 px-3 rounded-lg bg-[hsl(var(--ax-accent))] text-[hsl(var(--ax-on-accent))] text-[12px] font-bold">Publish</button>
                ) : (
                  <span className="text-[11px] font-black uppercase tracking-wider text-[hsl(var(--ax-accent))]">Live</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {composing && (
        <ContentComposer
          purpose={composing}
          athleteId={athleteId} organizationId={organizationId} athleteName={athleteName}
          onClose={() => setComposing(null)}
          onSaved={() => { setComposing(null); refresh(); }}
        />
      )}
    </div>
  );
}

function ContentComposer({ purpose, athleteId, organizationId, athleteName, onClose, onSaved }: { purpose: "access" | "marketing"; athleteId: string; organizationId: string; athleteName: string; onClose: () => void; onSaved: () => void }) {
  const { user } = useAuth();
  const { data: products = [] } = useAthleteProducts(athleteId);
  const marketing = purpose === "marketing";
  const [type, setType] = useState<string>("photo");
  const [format, setFormat] = useState<string>("ig_feed");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [hero, setHero] = useState("");
  const [gallery, setGallery] = useState<string[]>([]);
  const [visibility, setVisibility] = useState("public");
  const [category, setCategory] = useState("");
  const [productId, setProductId] = useState("");
  const [notifyFollowers, setNotifyFollowers] = useState(true);
  const [notifyAccess, setNotifyAccess] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const gated = !marketing && (visibility === "access" || visibility === "vip");

  async function onHeroFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploading(true);
    try { setHero(await uploadContentMedia(f, organizationId, athleteId)); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Upload failed"); }
    finally { setUploading(false); e.target.value = ""; }
  }
  async function onGalleryFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setUploading(true);
    try {
      const urls = await uploadContentMediaBatch(files, organizationId, athleteId);
      setGallery((g) => [...g, ...urls]);
    }
    catch (err) { toast.error(err instanceof Error ? err.message : "Upload failed"); }
    finally { setUploading(false); e.target.value = ""; }
  }

  async function submit(status: "draft" | "published") {
    if (!title.trim()) { toast.error("Title required"); return; }
    setSaving(true);
    try {
      const resolvedType = marketing ? (VIDEO_FORMATS.has(format) ? "video" : "photo") : type;
      const input: ContentInput = {
        organization_id: organizationId,
        athlete_id: athleteId,
        type: resolvedType,
        title: title.trim(),
        body: body.trim() || null,
        hero_url: hero.trim() || null,
        media: gallery.length ? gallery : null,
        category: !marketing && type === "blog" ? category || null : null,
        visibility: marketing ? "public" : visibility,
        content_purpose: purpose,
        content_format: marketing ? format : null,
        product_id: productId || null,
        status,
        publish_at: status === "published" ? new Date().toISOString() : null,
        notify: marketing ? {} : { followers: notifyFollowers, access: notifyAccess },
        created_by: user?.id ?? null,
      };
      await createContent(input);
      toast.success(status === "published" ? (marketing ? "Published to athlete dashboard" : "Published to Goat Farm Access") : "Saved as draft");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/50 overflow-y-auto" onClick={onClose}>
      <div className="w-full max-w-lg ax-card p-5 my-8" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-bold text-lg mb-1 flex items-center gap-2">
          {marketing ? <Megaphone className="h-5 w-5 text-[hsl(var(--ax-accent))]" /> : <Users className="h-5 w-5 text-[hsl(var(--ax-accent))]" />}
          {marketing ? "New Marketing Asset" : "New Access Post"}
        </h3>
        <p className="text-[12px] text-[hsl(var(--ax-faint))] mb-4">
          For {athleteName} · {marketing ? "appears in the athlete's dashboard to download & share" : "appears in Goat Farm Access when published"}
        </p>

        <div className="grid grid-cols-2 gap-3">
          {marketing ? (
            <FieldC label="Format"><select className="ax-field" value={format} onChange={(e) => setFormat(e.target.value)}>{FORMATS.map((f) => <option key={f.v} value={f.v}>{f.l}</option>)}</select></FieldC>
          ) : (
            <FieldC label="Type"><select className="ax-field capitalize" value={type} onChange={(e) => setType(e.target.value)}>{ACCESS_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select></FieldC>
          )}
          {!marketing && (
            <FieldC label="Access level"><select className="ax-field capitalize" value={visibility} onChange={(e) => setVisibility(e.target.value)}>{VIS.map((v) => <option key={v} value={v}>{v}</option>)}</select></FieldC>
          )}
        </div>

        <div className="mt-3 space-y-3">
          <FieldC label="Title"><input className="ax-field" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={marketing ? "Fall Drop — launch graphic" : "Inside offseason training"} /></FieldC>
          {!marketing && type === "blog" && <FieldC label="Category"><select className="ax-field" value={category} onChange={(e) => setCategory(e.target.value)}><option value="">Select…</option>{CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></FieldC>}
          <FieldC label={marketing ? "Suggested caption" : "Body / caption"}><textarea className="ax-field min-h-[80px]" value={body} onChange={(e) => setBody(e.target.value)} /></FieldC>

          {/* Media upload */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--ax-secondary))] mb-1">Cover / hero</label>
            <div className="flex items-center gap-2">
              {hero ? (
                <div className="relative h-16 w-16 rounded-lg overflow-hidden border border-[hsl(var(--ax-border))] shrink-0">
                  <img src={hero} alt="" className="h-full w-full object-cover" />
                  <button onClick={() => setHero("")} className="absolute top-0 right-0 h-5 w-5 bg-black/60 text-white flex items-center justify-center"><X className="h-3 w-3" /></button>
                </div>
              ) : (
                <label className="h-16 w-16 rounded-lg border border-dashed border-[hsl(var(--ax-border))] flex items-center justify-center cursor-pointer shrink-0 hover:border-[hsl(var(--ax-accent))]">
                  <ImagePlus className="h-5 w-5 text-[hsl(var(--ax-faint))]" />
                  <input type="file" accept="image/*,video/*" className="hidden" onChange={onHeroFile} />
                </label>
              )}
              <input className="ax-field flex-1" value={hero} onChange={(e) => setHero(e.target.value)} placeholder="…or paste a URL" />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--ax-secondary))] mb-1">Gallery {gallery.length > 0 && `(${gallery.length})`}</label>
            <div className="flex flex-wrap gap-2">
              {gallery.map((u, i) => (
                <div key={i} className="relative h-14 w-14 rounded-lg overflow-hidden border border-[hsl(var(--ax-border))]">
                  <img src={u} alt="" className="h-full w-full object-cover" />
                  <button onClick={() => setGallery((g) => g.filter((_, j) => j !== i))} className="absolute top-0 right-0 h-4 w-4 bg-black/60 text-white flex items-center justify-center"><X className="h-2.5 w-2.5" /></button>
                </div>
              ))}
              <label className="h-14 w-14 rounded-lg border border-dashed border-[hsl(var(--ax-border))] flex items-center justify-center cursor-pointer hover:border-[hsl(var(--ax-accent))]">
                <Plus className="h-4 w-4 text-[hsl(var(--ax-faint))]" />
                <input type="file" accept="image/*,video/*" multiple className="hidden" onChange={onGalleryFiles} />
              </label>
            </div>
            {uploading && <div className="text-[11px] text-[hsl(var(--ax-accent))] mt-1 inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Uploading…</div>}
          </div>

          {products.length > 0 && (
            <FieldC label={marketing ? "Linked product (copy link on dashboard)" : "Shop the Look — linked product (optional)"}>
              <select className="ax-field" value={productId} onChange={(e) => setProductId(e.target.value)}>
                <option value="">None</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
            </FieldC>
          )}

          {!marketing && (
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" checked={notifyFollowers} onChange={(e) => setNotifyFollowers(e.target.checked)} /> Notify followers</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={notifyAccess} onChange={(e) => setNotifyAccess(e.target.checked)} /> Notify Access</label>
            </div>
          )}
          {gated && (
            <div className="rounded-lg border border-[hsl(var(--ax-accent)/0.3)] bg-[hsl(var(--ax-accent)/0.06)] p-3 text-[12px] text-[hsl(var(--ax-secondary))] flex items-start gap-2">
              <Eye className="h-4 w-4 text-[hsl(var(--ax-accent))] mt-0.5 shrink-0" />
              Fans without {visibility} will see a locked teaser (hero + title) and an Unlock prompt.
            </div>
          )}
          {marketing && (
            <div className="rounded-lg border border-[hsl(var(--ax-border))] p-3 text-[12px] text-[hsl(var(--ax-faint))]">
              Marketing assets are athlete-facing only — they never appear in the fan feed.
            </div>
          )}
        </div>

        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="h-10 px-4 rounded-lg border border-[hsl(var(--ax-border))] font-semibold text-sm">Cancel</button>
          <button onClick={() => submit("draft")} disabled={saving || uploading} className="flex-1 h-10 rounded-lg border border-[hsl(var(--ax-border))] font-semibold text-sm disabled:opacity-60">Save Draft</button>
          <button onClick={() => submit("published")} disabled={saving || uploading} className="flex-1 h-10 rounded-lg bg-[hsl(var(--ax-accent))] text-[hsl(var(--ax-on-accent))] font-bold text-sm inline-flex items-center justify-center gap-2 disabled:opacity-60">
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
