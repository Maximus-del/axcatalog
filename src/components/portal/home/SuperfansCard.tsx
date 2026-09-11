// Mobile-first. Test at 375px before merging.
//
// This used to render five invented people — "Anonymous Fan #4821, 12 orders" —
// as though they were this athlete's actual best customers, under a disabled
// "coming soon" button. The names, the ranks and the order counts were all a
// literal array in this file.
//
// Repeat-customer data is derivable the moment orders carry a customer
// identity. Until it does, an empty slot is worth more than a fake leaderboard.
import { Crown } from "lucide-react";
import { PendingPanel } from "@/components/portal/PendingPanel";

export function SuperfansCard() {
  return (
    <PendingPanel
      icon={<Crown className="h-5 w-5" />}
      title="Your repeat buyers"
      body="The fans who come back — how many times they've ordered and what they've spent, so you know who to look after."
      waitingOn="Needs customer identity on synced orders"
    />
  );
}
