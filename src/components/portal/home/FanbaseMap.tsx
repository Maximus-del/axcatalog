// Mobile-first. Test at 375px before merging.
//
// This component used to render six hard-coded dots on an abstract blob and
// tell every athlete, as a statement of fact, that their fans were concentrated
// in Atlanta, Chicago, New York and Los Angeles. The dots were a constant in
// this file. No athlete's actual customers were ever consulted, because
// customer locations do not sync from Shopify yet.
//
// Geo data lands with the Shopify customer sync. Until then this says so.
import { MapPin } from "lucide-react";
import { PendingPanel } from "@/components/portal/PendingPanel";

export function FanbaseMap() {
  return (
    <PendingPanel
      icon={<MapPin className="h-5 w-5" />}
      title="Where your fans are"
      body="A map of the cities your orders ship to, so you know where a pop-up, a camp or a regional drop would land."
      waitingOn="Needs customer location data from Shopify"
    />
  );
}
