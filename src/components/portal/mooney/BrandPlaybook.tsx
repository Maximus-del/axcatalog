// Brand HQ → Your playbook: one-pagers every client can open from their own
// Brand HQ. Same pages for every client on the world shell, each filled with
// that client's live numbers (usePortalPlaybook). A page never states a figure
// the order sheet would not charge, and never invents a term AX has not set.
//
// Each page has an address (?guide=money|level|code|bulk|promote) so AX can
// send a client straight to the right page from AX Team.
import { useMemo, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, BadgeDollarSign, Boxes, Copy, Megaphone, Ticket, TrendingUp, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { usePortalPlaybook, usePortalSummary } from "@/hooks/usePortalApi";
import { usePortalData } from "../PortalDataContext";
import { entityVoice } from "@/lib/portal/entity-voice";
import {
  bulkCost,
  codeExample,
  levelLadder,
  monthsToFullCredit,
  resaleExample,
  storeShareExample,
  usd,
  type Playbook,
} from "@/lib/portal/api/playbook";
import { portalLink } from "./navigation";

type GuideKey = "money" | "level" | "code" | "bulk" | "promote";

interface Guide {
  key: GuideKey;
  title: string;
  icon: LucideIcon;
  /** One live line for the card. */
  hook: string;
}

function Row({ label, value, strong }: { label: ReactNode; value: ReactNode; strong?: boolean }) {
  return <div className="mw-pb-row" data-strong={strong || undefined}><span>{label}</span><b>{value}</b></div>;
}

function Note({ children }: { children: ReactNode }) {
  return <p className="mw-pb-note">{children}</p>;
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return <section className="mw-pb-block"><h3>{title}</h3>{children}</section>;
}

function MoneyPage({ pb }: { pb: Playbook }) {
  const tee = pb.bulkSamples.find((s) => s.kind === "tee") ?? pb.bulkSamples[0];
  const share = pb.terms?.revenueSharePercent ?? null;
  const onProfit = pb.terms?.splitBasis === "profit";
  // On a profit split the client's cost is their own bulk price — theirs to see.
  const store = storeShareExample(tee?.retail ?? null, share, 100, { basis: onProfit ? "profit" : "gross", clientCost: tee?.athleteUnit ?? null });
  const resale = tee ? resaleExample(tee, 50, pb.volumeBreaks) : null;
  const code = codeExample(pb.code);
  return <>
    <p className="mw-pb-lede">You make money three ways: fans buying on the store, gear you buy in bulk and sell yourself, and fans who shop with your code. AX credit pays for gear on top of that.</p>
    <Block title="1 · Fans buy on the store">
      {tee && <Row label={tee.title} value={`${usd(tee.retail)} to the fan`} />}
      {share != null ? <>
        <Row label={onProfit ? "Your share of the profit on every store sale" : "Your share of every store sale"} value={`${share}%`} strong />
        {store && onProfit && tee && <>
          <Row label="A fan pays" value={usd(tee.retail)} />
          <Row label="Your cost for that piece" value={`−${usd(tee.athleteUnit, { cents: true })}`} />
          <Row label="Profit" value={usd(store.profitPerUnit, { cents: true })} />
          <Row label={`You keep ${share}%`} value={usd(store.perUnit, { cents: true })} strong />
        </>}
        {store && <Row label={`${store.units} sales at ${usd(tee?.retail)}`} value={`${usd(store.earned)} to you`} />}
      </> : <Note>Your store revenue share is set in your AX agreement. Ask the AX team and they'll add it here.</Note>}
      {pb.terms?.payoutSchedule && <Row label="Paid out" value={pb.terms.payoutSchedule} />}
      {pb.terms?.note && <Note>{pb.terms.note}</Note>}
      <Note>AX handles production, printing, the store, shipping and customer service.</Note>
    </Block>
    <Block title="2 · Buy in bulk, sell it yourself">
      {resale ? <>
        <Row label={`50 × ${tee!.title}`} value={`${usd(resale.total)} (${usd(resale.perUnit, { cents: true })} each)`} />
        <Row label={`Sold at ${usd(resale.retail)} each`} value={usd(resale.revenue)} />
        <Row label="You keep" value={usd(resale.profit)} strong />
      </> : <Note>Bulk prices appear here once you have a live tee or hoodie.</Note>}
      <Note>Camps, appearances, signings, your own table at an event. You set the price, the margin is yours.</Note>
    </Block>
    <Block title="3 · Fans use your code">
      {pb.code && code ? <>
        <Row label={<>Code <code>{pb.code.code}</code></>} value={pb.code.live ? "Live" : "Being set up"} />
        {pb.code.fanDiscountPercent != null && <Row label="Fans save" value={`${pb.code.fanDiscountPercent}%`} />}
        <Row label="You earn on those sales" value={`${pb.code.commissionPercent}%`} strong />
        <Row label={`${usd(code.fanSpend)} spent with your code`} value={`${usd(code.earned)} to you`} />
      </> : <Note>Coming soon: a personal code that gives your fans a discount and pays you on every sale they make with it.</Note>}
    </Block>
    {pb.credit && <Block title="+ AX credit">
      <Row label="Every month" value={`+${usd(pb.credit.monthly)}`} />
      <Row label="Holds up to" value={usd(pb.credit.max)} />
      <Row label="Balance now" value={usd(pb.credit.balance, { cents: true })} strong />
      <Note>Spend it on any bulk order. Unused credit stops growing once it's full, so use it.</Note>
    </Block>}
  </>;
}

function LevelPage({ lifetime }: { lifetime: number | null }) {
  const { progress, tiers } = levelLadder(lifetime);
  return <>
    <p className="mw-pb-lede">Your level comes from lifetime gross store revenue. Each level unlocks more from AX.</p>
    {progress && <Block title="Where you are">
      <Row label={progress.label} value={progress.next ? `${usd(progress.untilNext)} to ${progress.next.name}` : "Top level"} strong />
      <div className="mw-studio-track"><span style={{ width: `${progress.progressPct}%` }} /></div>
    </Block>}
    <Block title="The ladder">
      <ol className="mw-pb-ladder">{tiers.map((t) => <li key={t.level} data-current={progress?.current.level === t.level || undefined}>
        <div><strong>Level {t.level} · {t.name}</strong><span>{t.minRevenue === 0 ? "Start here" : `${usd(t.minRevenue)} lifetime`}</span></div>
        {t.perks.length > 0 && <small>{t.perks.join(" · ")}</small>}
      </li>)}</ol>
    </Block>
    <Block title="Fastest ways up">
      <ul className="mw-pb-list"><li>Run a drop around a game or milestone. Fans buy in bursts.</li><li>Share your code in your bio and stories.</li><li>Post the content AX makes for you in Content &amp; Drops.</li></ul>
    </Block>
  </>;
}

function CodePage({ pb }: { pb: Playbook }) {
  const ex = codeExample(pb.code);
  const copy = async () => {
    if (!pb.code) return;
    try { await navigator.clipboard.writeText(pb.code.code); toast.success("Code copied."); } catch { toast.error("Couldn't copy."); }
  };
  if (!pb.code) return <>
    <p className="mw-pb-lede">Coming soon: a personal code that gives your fans a discount and pays you on every sale they make with it.</p>
    <Note>When it launches, your code shows here ready to copy, with what fans save and what you earn.</Note>
  </>;
  return <>
    <div className="mw-pb-code"><code>{pb.code.code}</code><Button variant="outline" className="mw-pill" onClick={copy}><Copy />Copy</Button></div>
    {!pb.code.live && <Note>Your code is being approved. Don't share it until it says Live here.</Note>}
    <Block title="How it pays">
      {pb.code.fanDiscountPercent != null && <Row label="Fans save" value={`${pb.code.fanDiscountPercent}% at checkout`} />}
      {pb.code.commissionPercent != null && <Row label="You earn" value={`${pb.code.commissionPercent}% of what they spend`} strong />}
      {ex && <Row label={`${usd(ex.fanSpend)} spent with your code`} value={`${usd(ex.earned)} to you`} />}
    </Block>
    <Block title="Where to put it">
      <ul className="mw-pb-list"><li>Your Instagram and TikTok bio.</li><li>Every story or post with your gear: "Use {pb.code.code} for {pb.code.fanDiscountPercent ?? ""}% off".</li><li>Game days, signings and camps. Say it out loud and print it on a sign.</li></ul>
    </Block>
  </>;
}

function BulkPage({ pb }: { pb: Playbook }) {
  const sizes = [25, 50, 100, 250];
  const months = monthsToFullCredit(pb.credit);
  return <>
    <p className="mw-pb-lede">Order gear for camps, events, your team or to sell yourself. The more you order at once, the less each piece costs.</p>
    <Block title="Volume discounts">
      {pb.volumeBreaks.map((b) => <Row key={b.minUnits} label={`${b.minUnits}+ pieces in one order`} value={`${b.percent}% off`} />)}
      <Note>The discount counts every piece in the order, across all products and sizes.</Note>
    </Block>
    {pb.bulkSamples.map((s) => <Block key={s.productId} title={`${s.kind === "tee" ? "Tees" : "Hoodies"} · ${usd(s.athleteUnit)} each`}>
      {sizes.map((n) => { const c = bulkCost(s, n, pb.volumeBreaks); return <Row key={n} label={`${n} pieces${c.percent ? ` · ${c.percent}% off` : ""}`} value={`${usd(c.total)} · ${usd(c.perUnit, { cents: true })} ea`} />; })}
      <Note>Standard bulk price is {usd(s.compareUnit)} each, so 50 saves you {usd(bulkCost(s, 50, pb.volumeBreaks).saved)}.</Note>
    </Block>)}
    <Block title="Good to know">
      {pb.rushSurcharge > 0 && <Row label="Need it fast? Rush" value={`+${usd(pb.rushSurcharge)}`} />}
      {pb.credit && <Row label="AX credit you can use" value={usd(pb.credit.balance, { cents: true })} strong />}
      {months != null && <Note>Your credit is full in about {months} month{months === 1 ? "" : "s"}. After that it stops growing.</Note>}
    </Block>
  </>;
}

function PromotePage({ link }: { link: (href: string) => string }) {
  const steps: Array<{ title: string; body: string; href: string; cta: string }> = [
    { title: "Pick the moment", body: "A game, a milestone, a new city, a holiday. A drop needs a reason.", href: "/portal/content?panel=drops", cta: "Plan a drop" },
    { title: "Grab the content", body: "AX makes photos and graphics for every product, hosted and ready to share.", href: "/portal/content", cta: "Content & Drops" },
    { title: "Share the link", body: "Every product in My Gear has Copy to grab its store link. Put it in your bio and stories.", href: "/portal/products", cta: "My Gear" },
    { title: "Add your code", body: "Fans save, you earn more. Mention it in every post.", href: "/portal/analytics?guide=code", cta: "Your code" },
    { title: "Tell AX", body: "Message the team before a drop so stock, content and timing line up.", href: "/portal/studio", cta: "Creative Studio" },
  ];
  return <>
    <p className="mw-pb-lede">Five steps for every drop. It takes about ten minutes once the content is ready.</p>
    <ol className="mw-pb-steps">{steps.map((s, i) => <li key={s.title}><span className="mw-hq-rank">{i + 1}</span><div><strong>{s.title}</strong><p>{s.body}</p><Link to={link(s.href)} className="mw-pb-link">{s.cta}<ArrowRight /></Link></div></li>)}</ol>
    <Block title="What works">
      <ul className="mw-pb-list"><li>Post the back print. It's the part fans can't get anywhere else.</li><li>Go live or post a story the hour a drop opens.</li><li>Wear it. A photo of you in the gear sells more than any graphic.</li></ul>
    </Block>
  </>;
}

export function BrandPlaybook() {
  const { athlete } = usePortalData();
  const voice = entityVoice(athlete);
  const pb = usePortalPlaybook();
  const summary = usePortalSummary();
  const location = useLocation();
  const navigate = useNavigate();
  const link = (href: string) => portalLink(href, location.search);
  const open = new URLSearchParams(location.search).get("guide") as GuideKey | null;
  // Only a level we can actually measure: unattributed revenue means no position on the ladder.
  const lifetime = summary.data?.revenueAttributable && summary.data.lifetimeRevenue
    ? summary.data.lifetimeRevenue.amountMinor / 100
    : summary.data?.revenueAttributable ? 0 : null;

  const setOpen = (key: GuideKey | null) => {
    const p = new URLSearchParams(location.search);
    if (key) p.set("guide", key); else p.delete("guide");
    const q = p.toString();
    navigate({ pathname: location.pathname, search: q ? `?${q}` : "" }, { replace: !key });
  };

  const guides = useMemo<Guide[]>(() => {
    const d = pb.data;
    const tee = d?.bulkSamples.find((s) => s.kind === "tee");
    const list: Guide[] = [
      { key: "money", title: "How your money works", icon: BadgeDollarSign, hook: d?.terms?.revenueSharePercent != null ? `${d.terms.revenueSharePercent}% of every store sale is yours` : "Store sales, bulk resale, your code and credit" },
      { key: "bulk", title: "Stock up smart", icon: Boxes, hook: tee ? `Tees from ${usd(bulkCost(tee, 250, d!.volumeBreaks).perUnit, { cents: true })} each in bulk` : "Volume discounts from 50 pieces" },
      { key: "code", title: "Your code", icon: Ticket, hook: d?.code?.live ? `${d.code.code} · fans save ${d.code.fanDiscountPercent ?? 0}%` : "Coming soon" },
      { key: "promote", title: "Promote a drop", icon: Megaphone, hook: "Five steps, about ten minutes" },
    ];
    if (voice.showsAthleteTier) list.splice(1, 0, { key: "level", title: "Level up", icon: TrendingUp, hook: lifetime != null ? levelLadder(lifetime).progress?.label ?? "Your level" : "Your level" });
    return list;
  }, [pb.data, voice.showsAthleteTier, lifetime]);

  const active = guides.find((g) => g.key === open) ?? null;

  return <section className="mw-studio-panel mw-pb" aria-labelledby="pb-title">
    <div className="mw-hq-head"><h2 id="pb-title" className="mw-section-title">Your playbook</h2><span className="mw-studio-meta">One-pagers with your own numbers</span></div>
    {pb.isError ? <div className="mw-state" role="alert"><p>Unable to load your playbook.</p><Button variant="outline" className="mw-pill" onClick={() => void pb.refetch()}>Try again</Button></div>
      : <div className="mw-pb-cards">{guides.map((g) => <button key={g.key} type="button" className="mw-pb-card" onClick={() => setOpen(g.key)} aria-haspopup="dialog">
        <g.icon aria-hidden="true" />
        <strong>{g.title}</strong>
        {pb.isLoading ? <Skeleton className="h-4 w-32" /> : <span>{g.hook}</span>}
        <em>Open<ArrowRight /></em>
      </button>)}</div>}
    <Sheet open={!!active} onOpenChange={(v) => { if (!v) setOpen(null); }}>
      <SheetContent className="mw-drawer mw-pb-sheet w-full sm:max-w-[520px] overflow-y-auto">
        {active && <>
          <SheetHeader className="text-left"><SheetTitle className="flex items-center gap-2"><active.icon className="h-5 w-5 text-accent" />{active.title}</SheetTitle><SheetDescription>{voice.possessive} numbers, live from AX</SheetDescription></SheetHeader>
          <div className="mw-pb-page">
            {!pb.data ? <Skeleton className="h-64" />
              : active.key === "money" ? <MoneyPage pb={pb.data} />
              : active.key === "level" ? <LevelPage lifetime={lifetime} />
              : active.key === "code" ? <CodePage pb={pb.data} />
              : active.key === "bulk" ? <BulkPage pb={pb.data} />
              : <PromotePage link={link} />}
            <p className="mw-pb-foot">Questions? Message the AX team any time.</p>
          </div>
        </>}
      </SheetContent>
    </Sheet>
  </section>;
}
