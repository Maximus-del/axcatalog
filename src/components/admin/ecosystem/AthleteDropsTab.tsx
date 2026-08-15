// Operator DROPS: a Drop is a release/campaign event that groups selected
// products from a Collection with access/public dates + notifications. Products
// are referenced, never duplicated. Product-level quick scheduling stays below
// for one-off releases. Fan state everywhere derives from the timestamps.
import { useEffect, useState } from "react";
import { Loader2, Send, Save, Clock, Plus, Rocket, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useAthleteOperatorProducts } from "@/hooks/useContent";
import { useAthleteCollections, useAthleteDrops, useDropSelectableProducts } from "@/hooks/useCommerce";
import { scheduleProduct, sendProductForApproval, type OperatorProduct } from "@/lib/ecosystem/content";
import { createDrop, scheduleDrop, sendDropForApproval, type DropRow } from "@/lib/ecosystem/commerce";
import { earlyAccess } from "@/lib/ecosystem/access";
import { useAuth } from "@/auth/AuthProvider";

const APPROVAL_CHIP: Record<string, string> = {
  none: "text-[hsl(var(--ax-faint))]",
  pending: "text-[hsl(var(--ax-amber))]",
  approved: "text-[hsl(var(--ax-accent))]",
  rejected: "text-[hsl(var(--ax-red))]",
};
const STATUS_CHIP: Record<string, string> = {
  draft: "text-[hsl(var(--ax-faint))]",
  scheduled: "text-[hsl(var(--ax-accent))]",
  live: "text-[hsl(var(--ax-accent))]",
  ended: "text-[hsl(var(--ax-secondary))]",
};
const toDate = (iso: string | null) => (iso ? iso.slice(0, 10) : "");
const fromDate = (d: string) => (d ? new Date(d + "T10:00:00").toISOString() : null);

export function AthleteDropsTab({ athleteId, organizationId }: { athleteId: string; organizationId: string }) {
  const qc = useQueryClient();
  const { data: drops = [], isLoading } = useAthleteDrops(athleteId);
  const [building, setBuilding] = useState(false);
  const [showProducts, setShowProducts] = useState(false);
  const refreshDrops = () => qc.invalidateQueries({ queryKey: ["athlete-drops", athleteId] });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider text-[hsl(var(--ax-secondary))]">Drops</h3>
          <p className="text-[12px] text-[hsl(var(--ax-faint))] mt-0.5">A release event: pick products from a collection, set access + public dates, notify fans.</p>
        </div>
        <button onClick={() => setBuilding(true)} className="h-9 px-3 rounded-lg bg-[hsl(var(--ax-accent))] text-[hsl(var(--ax-on-accent))] font-semibold text-[13px] inline-flex items-center gap-1.5">
          <Plus className="h-4 w-4" /> New Drop
        </button>
      </div>

      {isLoading ? (
        <div className="text-sm text-[hsl(var(--ax-secondary))]">Loading…</div>
      ) : drops.length === 0 ? (
        <div className="ax-card p-6 text-center text-sm text-[hsl(var(--ax-secondary))]">
          No drops yet. Create one to schedule a coordinated release.
        </div>
      ) : (
        <div className="space-y-3">
          {drops.map((d) => <DropCard key={d.id} drop={d} onChanged={refreshDrops} />)}
        </div>
      )}

      {/* Per-product quick scheduling (one-off releases without a full drop) */}
      <div className="pt-2">
        <button onClick={() => setShowProducts((s) => !s)} className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[hsl(var(--ax-secondary))] hover:text-[hsl(var(--ax-ink))]">
          <ChevronDown className={`h-4 w-4 transition-transform ${showProducts ? "rotate-180" : ""}`} /> Quick product scheduling
        </button>
        {showProducts && <ProductQuickSchedule athleteId={athleteId} />}
      </div>

      {building && (
        <DropBuilder
          athleteId={athleteId}
          organizationId={organizationId}
          onClose={() => setBuilding(false)}
          onSaved={() => { setBuilding(false); refreshDrops(); }}
        />
      )}
    </div>
  );
}

function DropCard({ drop, onChanged }: { drop: DropRow; onChanged: () => void }) {
  const [access, setAccess] = useState(toDate(drop.access_date));
  const [pub, setPub] = useState(toDate(drop.public_date));
  const [busy, setBusy] = useState<string | null>(null);
  const derived = earlyAccess(drop.access_date, drop.public_date, true);

  async function save() {
    setBusy("save");
    try { await scheduleDrop(drop.id, { access_date: fromDate(access), public_date: fromDate(pub) }); toast.success("Drop scheduled"); onChanged(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); } finally { setBusy(null); }
  }
  async function send() {
    setBusy("send");
    try { await sendDropForApproval(drop.id); toast.success("Sent to athlete for approval"); onChanged(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); } finally { setBusy(null); }
  }

  return (
    <div className="ax-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold truncate flex items-center gap-2"><Rocket className="h-4 w-4 text-[hsl(var(--ax-accent))]" /> {drop.name}</div>
          <div className="text-[12px] text-[hsl(var(--ax-faint))] mt-0.5">
            {drop.product_count ?? 0} product{(drop.product_count ?? 0) === 1 ? "" : "s"} ·
            {" "}<span className={`capitalize font-semibold ${STATUS_CHIP[drop.status] ?? ""}`}>{drop.status}</span> ·
            {" "}approval <span className={`capitalize font-semibold ${APPROVAL_CHIP[drop.approval_state] ?? ""}`}>{drop.approval_state}</span>
          </div>
        </div>
        {drop.approval_state !== "pending" && drop.approval_state !== "approved" && (
          <button onClick={send} disabled={busy === "send"} className="h-9 px-3 rounded-lg border border-[hsl(var(--ax-border))] text-[13px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-60">
            {busy === "send" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send for Approval
          </button>
        )}
      </div>
      {drop.approval_note && <div className="mt-2 text-[12px] text-[hsl(var(--ax-amber))]">Athlete note: {drop.approval_note}</div>}
      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--ax-secondary))]">Access early</span>
          <input type="date" className="ax-field mt-1" value={access} onChange={(e) => setAccess(e.target.value)} />
        </label>
        <label className="block">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--ax-secondary))]">Public</span>
          <input type="date" className="ax-field mt-1" value={pub} onChange={(e) => setPub(e.target.value)} />
        </label>
      </div>
      <div className="mt-3 flex items-center justify-between">
        {derived.label ? (
          <span className="text-[12px] font-semibold text-[hsl(var(--ax-accent))] inline-flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> Fan state: {derived.label}</span>
        ) : <span />}
        <button onClick={save} disabled={busy === "save"} className="h-9 px-3 rounded-lg bg-[hsl(var(--ax-accent))] text-[hsl(var(--ax-on-accent))] text-[13px] font-bold inline-flex items-center gap-1.5 disabled:opacity-60">
          {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Schedule
        </button>
      </div>
    </div>
  );
}

function DropBuilder({ athleteId, organizationId, onClose, onSaved }: { athleteId: string; organizationId: string; onClose: () => void; onSaved: () => void }) {
  const { user } = useAuth();
  const { data: collections = [] } = useAthleteCollections(athleteId);
  const [collectionId, setCollectionId] = useState<string | null>(null);
  const { data: products = [] } = useDropSelectableProducts(athleteId, collectionId);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [name, setName] = useState("");
  const [campaign, setCampaign] = useState("");
  const [access, setAccess] = useState("");
  const [pub, setPub] = useState("");
  const [nAccess, setNAccess] = useState(true);
  const [nVip, setNVip] = useState(true);
  const [nFollowers, setNFollowers] = useState(true);
  const [saving, setSaving] = useState(false);

  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  async function save() {
    if (!name.trim()) { toast.error("Drop name required"); return; }
    if (selected.size === 0) { toast.error("Select at least one product"); return; }
    setSaving(true);
    try {
      await createDrop({
        organization_id: organizationId,
        athlete_id: athleteId,
        collection_id: collectionId,
        name: name.trim(),
        campaign_image_url: campaign.trim() || null,
        access_date: fromDate(access),
        public_date: fromDate(pub),
        notify: { access: nAccess, vip: nVip, followers: nFollowers },
        created_by: user?.id ?? null,
      }, Array.from(selected));
      toast.success("Drop created");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/50 overflow-y-auto" onClick={onClose}>
      <div className="w-full max-w-lg ax-card p-5 my-8" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-bold text-lg mb-1">New Drop</h3>
        <p className="text-[12px] text-[hsl(var(--ax-faint))] mb-4">Group products from a collection into a scheduled release.</p>

        <div className="space-y-3">
          <Field label="Collection">
            <select className="ax-field" value={collectionId ?? ""} onChange={(e) => { setCollectionId(e.target.value || null); setSelected(new Set()); }}>
              <option value="">All of this athlete's products</option>
              {collections.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.product_count})</option>)}
            </select>
          </Field>

          <Field label={`Products (${selected.size} selected)`}>
            <div className="ax-card max-h-44 overflow-y-auto divide-y divide-[hsl(var(--ax-line))]">
              {products.length === 0 ? (
                <div className="px-3 py-4 text-[12px] text-[hsl(var(--ax-faint))]">No products available here yet.</div>
              ) : products.map((p) => (
                <label key={p.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
                  <span className="truncate flex-1">{p.title}</span>
                  <span className="text-[11px] text-[hsl(var(--ax-faint))] capitalize">{p.status}</span>
                </label>
              ))}
            </div>
          </Field>

          <Field label="Drop name"><input className="ax-field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Mooney World — Fall Drop" /></Field>
          <Field label="Campaign image URL (optional)"><input className="ax-field" value={campaign} onChange={(e) => setCampaign(e.target.value)} placeholder="https://…" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Access date"><input type="date" className="ax-field" value={access} onChange={(e) => setAccess(e.target.value)} /></Field>
            <Field label="Public date"><input type="date" className="ax-field" value={pub} onChange={(e) => setPub(e.target.value)} /></Field>
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={nAccess} onChange={(e) => setNAccess(e.target.checked)} /> Notify Access</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={nVip} onChange={(e) => setNVip(e.target.checked)} /> Notify VIP</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={nFollowers} onChange={(e) => setNFollowers(e.target.checked)} /> Followers when public</label>
          </div>
        </div>

        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="h-10 px-4 rounded-lg border border-[hsl(var(--ax-border))] font-semibold text-sm">Cancel</button>
          <button onClick={save} disabled={saving} className="flex-1 h-10 rounded-lg bg-[hsl(var(--ax-accent))] text-[hsl(var(--ax-on-accent))] font-bold text-sm inline-flex items-center justify-center gap-2 disabled:opacity-60">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Create Drop
          </button>
        </div>
      </div>
    </div>
  );
}

function ProductQuickSchedule({ athleteId }: { athleteId: string }) {
  const qc = useQueryClient();
  const { data: products = [], isLoading } = useAthleteOperatorProducts(athleteId);
  const refresh = () => qc.invalidateQueries({ queryKey: ["op-products", athleteId] });
  if (isLoading) return <div className="mt-3 text-sm text-[hsl(var(--ax-secondary))]">Loading…</div>;
  if (products.length === 0) return <div className="mt-3 text-[12px] text-[hsl(var(--ax-faint))]">No products yet for this athlete.</div>;
  return <div className="mt-3 space-y-3">{products.map((p) => <ProductRow key={p.id} product={p} onChanged={refresh} />)}</div>;
}

function ProductRow({ product, onChanged }: { product: OperatorProduct; onChanged: () => void }) {
  const [access, setAccess] = useState(toDate(product.access_date));
  const [pub, setPub] = useState(toDate(product.public_date));
  const [busy, setBusy] = useState<string | null>(null);
  const derived = earlyAccess(product.access_date, product.public_date, true);

  async function save() {
    setBusy("save");
    try { await scheduleProduct(product.id, { access_date: fromDate(access), public_date: fromDate(pub) }); toast.success("Schedule saved"); onChanged(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); } finally { setBusy(null); }
  }
  async function send() {
    setBusy("send");
    try { await sendProductForApproval(product.id); toast.success("Sent to athlete for approval"); onChanged(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); } finally { setBusy(null); }
  }

  return (
    <div className="ax-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold truncate">{product.title}</div>
          <div className="text-[12px] text-[hsl(var(--ax-faint))]">
            <span className="capitalize">{product.status}</span> · approval <span className={`capitalize font-semibold ${APPROVAL_CHIP[product.approval_state] ?? ""}`}>{product.approval_state}</span>
          </div>
        </div>
        {product.approval_state !== "pending" && product.approval_state !== "approved" && (
          <button onClick={send} disabled={busy === "send"} className="h-9 px-3 rounded-lg border border-[hsl(var(--ax-border))] text-[13px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-60">
            {busy === "send" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send for Approval
          </button>
        )}
      </div>
      {product.approval_note && <div className="mt-2 text-[12px] text-[hsl(var(--ax-amber))]">Athlete note: {product.approval_note}</div>}
      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--ax-secondary))]">Access early</span>
          <input type="date" className="ax-field mt-1" value={access} onChange={(e) => setAccess(e.target.value)} />
        </label>
        <label className="block">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--ax-secondary))]">Public</span>
          <input type="date" className="ax-field mt-1" value={pub} onChange={(e) => setPub(e.target.value)} />
        </label>
      </div>
      <div className="mt-3 flex items-center justify-between">
        {derived.label ? (
          <span className="text-[12px] font-semibold text-[hsl(var(--ax-accent))] inline-flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> Fan state: {derived.label}</span>
        ) : <span />}
        <button onClick={save} disabled={busy === "save"} className="h-9 px-3 rounded-lg bg-[hsl(var(--ax-accent))] text-[hsl(var(--ax-on-accent))] text-[13px] font-bold inline-flex items-center gap-1.5 disabled:opacity-60">
          {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Schedule
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--ax-secondary))] mb-1">{label}</label>
      {children}
    </div>
  );
}
