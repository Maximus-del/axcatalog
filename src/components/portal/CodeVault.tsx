// Mobile-first. Test at 375px before merging.
//
// This module used to generate discount codes — "MOONEY15", "15% off" — from an
// FNV hash of the athlete's id, show a "Share" button beside each one, and
// invite the athlete to send them to their fans. Nothing honoured them. No
// discount record was created, no redemption was tracked, and the status was
// the literal string "unused" on every code forever.
//
// The failure mode was not cosmetic: an athlete shares a code, a fan types it
// at checkout, it does not exist. The athlete looks careless to their own
// audience because of a placeholder in our portal.
//
// The generator is still in src/lib/portal-codes.ts. When codes are real —
// created, redeemable and tracked — this component renders them again.
import { Ticket } from "lucide-react";
import { PendingPanel } from "@/components/portal/PendingPanel";

export function CodeVault() {
  return (
    <section id="codes">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold uppercase tracking-[0.06em] flex items-center gap-2">
          <Ticket className="h-4 w-4 text-accent" /> Your Codes
        </h2>
      </div>
      <PendingPanel
        icon={<Ticket className="h-5 w-5" />}
        title="Fan codes are on the way"
        body="Discount codes you can hand to your fans, with a running count of who used them."
        waitingOn="Needs redemption tracking at checkout"
      />
    </section>
  );
}
