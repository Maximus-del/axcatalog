// A professional invoice for one order — on screen, printed, or saved as PDF.
//
// Lives outside the V2 shell (no sidebar) so it prints as a clean page. Every
// figure is read from the order itself, the same record Email invoice and Mark
// paid use, so the document can never disagree with what is owed. "Copy for
// Claude Design" hands the same facts to a designer as a brief.
import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Copy, Loader2, Mail, Printer } from "lucide-react";
import { claudeDesignBrief, fetchInvoiceDocument, invoiceEmail, mailtoHref, useSetPaymentStatus } from "@/lib/v2/invoices";

const FROM = { name: "Athlete Xclusive", site: "athletexclusive.com" };
const DUE = "Due on receipt";

const usd = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const longDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "—";

const tool =
  "inline-flex items-center gap-1.5 rounded-full border border-neutral-300 bg-white px-3.5 py-1.5 text-[12px] font-medium text-neutral-700 hover:border-neutral-500 disabled:opacity-50";

export default function V2InvoiceDocument() {
  const { orderId } = useParams();
  const q = useQuery({ queryKey: ["v2", "invoice-document", orderId], queryFn: () => fetchInvoiceDocument(orderId as string), enabled: !!orderId });
  const d = q.data;
  const setPayment = useSetPaymentStatus(d?.athleteId ?? "");

  useEffect(() => {
    if (d) document.title = `Invoice ${d.orderNumber} · ${d.clientName}`;
  }, [d]);

  if (q.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-100 text-neutral-500">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }
  if (q.isError || !d) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-neutral-100 text-[13px] text-neutral-600">
        {q.error instanceof Error ? q.error.message : "Invoice not found."}
        <Link to="/admin-v2" className="text-[#03AC13] underline">
          Back to the dashboard
        </Link>
      </div>
    );
  }

  const paid = d.paymentStatus === "paid" || d.paymentStatus === "waived";
  const statusTone = paid ? "bg-[#03AC13]/10 text-[#027a0e] border-[#03AC13]/40" : "bg-amber-50 text-amber-800 border-amber-300";

  const copyBrief = async () => {
    try {
      await navigator.clipboard.writeText(claudeDesignBrief(d, { from: `${FROM.name} · ${FROM.site}`, dueLabel: DUE }));
      toast.success("Copied. Paste it into Claude Design to get a designed version.");
    } catch {
      toast.error("Couldn't copy — your browser blocked the clipboard.");
    }
  };
  const email = () => {
    window.location.href = mailtoHref(d.clientEmail, invoiceEmail(d));
    if (d.paymentStatus === "unpaid") setPayment.mutate({ orderId: d.id, status: "invoiced" }, { onSuccess: () => void q.refetch() });
  };

  return (
    <div className="min-h-screen bg-neutral-100 py-6 text-neutral-900 print:bg-white print:py-0">
      <style>{`@page { size: letter; margin: 0; } @media print { html, body, #root { background: #fff !important; color-scheme: light; min-width: 0 !important; width: auto !important; } }`}</style>

      {/* Toolbar — never printed */}
      <div className="mx-auto mb-4 flex max-w-[816px] flex-wrap items-center gap-2 px-4 print:hidden">
        <Link to={`/admin-v2/people/${d.athleteId}`} className={tool}>
          <ArrowLeft className="h-3.5 w-3.5" /> {d.clientName}
        </Link>
        <span className="flex-1" />
        <button type="button" className={tool} onClick={copyBrief} title="Copies every figure as a brief for Claude Design">
          <Copy className="h-3.5 w-3.5" /> Copy for Claude Design
        </button>
        <button type="button" className={tool} onClick={email}>
          <Mail className="h-3.5 w-3.5" /> Email invoice
        </button>
        <button type="button" className={`${tool} !border-[#03AC13] !bg-[#03AC13] !text-white`} onClick={() => window.print()}>
          <Printer className="h-3.5 w-3.5" /> Print / Save PDF
        </button>
      </div>

      {/* The page */}
      <article className="mx-auto box-border max-w-[816px] bg-white px-12 py-12 shadow-sm print:w-full print:max-w-none print:px-[14mm] print:py-[12mm] print:shadow-none" style={{ fontFeatureSettings: '"tnum"' }}>
        <header className="flex items-start justify-between gap-8">
          <div>
            <div className="text-[22px] font-extrabold uppercase tracking-[0.18em]" aria-label="Athlete Xclusive">
              Athlete <span className="text-[#03AC13]">X</span>clusive
            </div>
            <div className="mt-1 text-[11px] uppercase tracking-[0.2em] text-neutral-500">Premium athlete merchandise</div>
          </div>
          <div className="text-right">
            <div className="text-[30px] font-light uppercase leading-none tracking-[0.12em] text-neutral-900">Invoice</div>
            <div className="mt-2 text-[13px] font-semibold">{d.orderNumber}</div>
            <span className={`mt-2 inline-block rounded-full border px-2.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] ${statusTone}`}>
              {paid ? (d.paymentStatus === "waived" ? "Covered" : "Paid") : "Due"}
            </span>
          </div>
        </header>

        <div className="mt-10 grid grid-cols-3 gap-6 border-y border-neutral-200 py-5 text-[12px]">
          <div>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-500">From</div>
            <div className="font-semibold">{FROM.name}</div>
            <div className="text-neutral-600">{FROM.site}</div>
          </div>
          <div>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Bill to</div>
            <div className="font-semibold">{d.clientName}</div>
            {d.clientEmail && <div className="text-neutral-600">{d.clientEmail}</div>}
          </div>
          <div className="text-right">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Issued</div>
            <div>{longDate(d.createdAt)}</div>
            <div className="mt-2 mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Due</div>
            <div>{paid ? `Paid ${longDate(d.paidAt)}` : DUE}</div>
          </div>
        </div>

        <table className="mt-8 w-full border-collapse text-[12.5px]">
          <thead>
            <tr className="border-b-2 border-neutral-900 text-left text-[10px] uppercase tracking-[0.16em] text-neutral-500">
              <th className="pb-2 font-semibold">Item</th>
              <th className="pb-2 text-right font-semibold">Qty</th>
              <th className="pb-2 text-right font-semibold">Unit price</th>
              <th className="pb-2 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {d.lines.map((l, i) => (
              <tr key={i} className="border-b border-neutral-200 align-middle" style={{ breakInside: "avoid" }}>
                <td className="py-3 pr-4">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md border border-neutral-200 bg-neutral-50">
                      {l.imageUrl && (
                        <img
                          src={l.imageUrl}
                          alt=""
                          className="h-full w-full object-contain"
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                          }}
                        />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium">{l.title}</div>
                      {(l.color || l.size || l.notes) && (
                        <div className="text-[11px] text-neutral-500">{[l.color, l.size, l.notes].filter(Boolean).join(" · ")}</div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="py-3 text-right">{l.quantity}</td>
                <td className="py-3 text-right">{usd(l.unitPrice)}</td>
                <td className="py-3 text-right font-medium">{usd(l.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-6 flex justify-end">
          <div className="w-72 space-y-1.5 text-[12.5px]">
            <div className="flex justify-between text-neutral-600">
              <span>Subtotal · {d.units} pieces</span>
              <span>{usd(d.subtotal)}</span>
            </div>
            {d.creditApplied > 0 && (
              <div className="flex justify-between text-neutral-600">
                <span>AX credit applied</span>
                <span>−{usd(d.creditApplied)}</span>
              </div>
            )}
            <div className="flex items-baseline justify-between border-t-2 border-neutral-900 pt-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em]">{paid ? "Paid" : "Amount due"}</span>
              <span className="text-[22px] font-bold">{usd(paid ? 0 : d.amountDue)}</span>
            </div>
          </div>
        </div>

        <div className="mt-10 grid grid-cols-2 gap-6" style={{ breakInside: "avoid" }}>
          <div className="rounded-lg border border-neutral-200 p-4 text-[12px]">
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#027a0e]">How to pay</div>
            <p className="text-neutral-800">{d.paymentInstructions ?? "Zelle, or pay through the emailed invoice."}</p>
            <p className="mt-1.5 text-neutral-500">Please put {d.orderNumber} in the payment note.</p>
          </div>
          {d.notes && (
            <div className="rounded-lg border border-neutral-200 p-4 text-[12px]">
              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Notes</div>
              <p className="whitespace-pre-wrap text-neutral-800">{d.notes}</p>
            </div>
          )}
        </div>

        <footer className="mt-12 border-t border-neutral-200 pt-4 text-center text-[11px] text-neutral-500">
          Thank you. Production starts as soon as this invoice is paid. · {FROM.name} · {FROM.site}
        </footer>
      </article>
    </div>
  );
}
