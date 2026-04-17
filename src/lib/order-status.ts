import type { Database } from "@/integrations/supabase/types";

export type BulkOrderStatus = Database["public"]["Enums"]["bulk_order_status"];

export const ORDER_STATUSES: BulkOrderStatus[] = [
  "submitted",
  "acknowledged",
  "in_production",
  "ready",
  "shipped",
  "completed",
  "cancelled",
];

export const OPEN_STATUSES: BulkOrderStatus[] = [
  "submitted",
  "acknowledged",
  "in_production",
];

export const STATUS_LABEL: Record<BulkOrderStatus, string> = {
  submitted: "Submitted",
  acknowledged: "Acknowledged",
  in_production: "In Production",
  ready: "Ready",
  shipped: "Shipped",
  completed: "Completed",
  cancelled: "Cancelled",
};

/** Tailwind classes for colored status pills. */
export const STATUS_BADGE_CLASS: Record<BulkOrderStatus, string> = {
  submitted: "bg-accent/15 text-accent border-accent/30",
  acknowledged: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  in_production: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  ready: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  shipped: "bg-teal-500/15 text-teal-400 border-teal-500/30",
  completed: "bg-muted text-muted-foreground border-border",
  cancelled: "bg-muted/50 text-muted-foreground/70 border-border",
};

/** Possible next statuses an admin can move an order into. */
export function nextStatuses(current: BulkOrderStatus): BulkOrderStatus[] {
  switch (current) {
    case "submitted":
      return ["acknowledged", "cancelled"];
    case "acknowledged":
      return ["in_production", "cancelled"];
    case "in_production":
      return ["ready", "cancelled"];
    case "ready":
      return ["shipped", "cancelled"];
    case "shipped":
      return ["completed", "cancelled"];
    case "completed":
      return [];
    case "cancelled":
      return [];
  }
}

export type Carrier = "USPS" | "UPS" | "FedEx" | "DHL" | "Other";
export const CARRIERS: Carrier[] = ["USPS", "UPS", "FedEx", "DHL", "Other"];

export function trackingUrl(carrier: string | null, num: string | null): string | null {
  if (!carrier || !num) return null;
  const n = encodeURIComponent(num);
  switch (carrier) {
    case "USPS":
      return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${n}`;
    case "UPS":
      return `https://www.ups.com/track?tracknum=${n}`;
    case "FedEx":
      return `https://www.fedex.com/apps/fedextrack/?tracknumbers=${n}`;
    case "DHL":
      return `https://www.dhl.com/en/express/tracking.html?AWB=${n}`;
    default:
      return null;
  }
}
