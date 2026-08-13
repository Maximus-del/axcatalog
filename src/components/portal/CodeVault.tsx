// Mobile-first. Code Vault — share codes for fans (section 17).
import { useState } from "react";
import { Ticket, Copy, Share2, Check } from "lucide-react";
import { toast } from "sonner";
import { weeklyCodes, codeShareText } from "@/lib/portal-codes";
import { copyText } from "@/lib/portal-content";
import { usePortalData } from "@/components/portal/PortalDataContext";

export function CodeVault() {
  const { athlete } = usePortalData();
  const codes = weeklyCodes({
    athleteId: athlete.id,
    firstName: athlete.first_name,
    lastName: athlete.last_name,
  });
  const [copied, setCopied] = useState<string | null>(null);

  async function copy(code: string) {
    if (await copyText(code)) {
      setCopied(code);
      toast.success("Code copied");
      setTimeout(() => setCopied((c) => (c === code ? null : c)), 1500);
    }
  }
  async function share(code: string) {
    const text = codeShareText(code, athlete.first_name);
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    if (nav.share) {
      try {
        await nav.share({ text });
        return;
      } catch {
        /* fall through */
      }
    }
    if (await copyText(text)) toast.success("Share text copied");
  }

  return (
    <section id="codes">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold uppercase tracking-[0.06em] flex items-center gap-2">
          <Ticket className="h-4 w-4 text-accent" /> Your Weekly Codes
        </h2>
        <span className="text-[11px] text-muted-foreground">{codes.length} available</span>
      </div>
      <div className="space-y-2.5">
        {codes.map((c) => (
          <div key={c.code} className="rounded-2xl border border-border bg-card p-4 flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="font-bold tracking-wide tabular-nums">{c.code}</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                {c.benefit} · <span className="capitalize">{c.status}</span>
              </div>
            </div>
            <button onClick={() => copy(c.code)} className="pressable h-9 w-9 rounded-lg border border-border flex items-center justify-center" aria-label="Copy code">
              {copied === c.code ? <Check className="h-4 w-4 text-accent" /> : <Copy className="h-4 w-4" />}
            </button>
            <button onClick={() => share(c.code)} className="pressable h-9 w-9 rounded-lg bg-accent text-accent-foreground flex items-center justify-center" aria-label="Share code">
              <Share2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground mt-3">
        Share codes with your fans. Redemption tracking &amp; weekly refresh are coming soon.
      </p>
    </section>
  );
}
