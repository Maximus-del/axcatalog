// Deterministic premium gradients for athletes/content that have no photo yet.
// Keeps the UI feeling alive without fabricated imagery.
import type { FeedType } from "./content-types";

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Dark, brand-adjacent gradient pairs (charcoal → accent-tinted).
const GRADIENTS = [
  "linear-gradient(135deg, #0f1a14 0%, #1c3b2b 100%)",
  "linear-gradient(135deg, #14140f 0%, #2b2b1c 100%)",
  "linear-gradient(135deg, #0d1418 0%, #16323b 100%)",
  "linear-gradient(135deg, #16110f 0%, #34231c 100%)",
  "linear-gradient(135deg, #0f0f14 0%, #1f1c2b 100%)",
  "linear-gradient(135deg, #101010 0%, #2b2b2b 100%)",
];

export function gradientFor(seedStr: string): string {
  return GRADIENTS[hash(seedStr) % GRADIENTS.length];
}

// A subtle accent tint per feed type so cards read at a glance.
export const TYPE_ACCENT: Record<FeedType, string> = {
  drop: "text-accent",
  exclusive: "text-[hsl(280_60%_70%)]",
  camp: "text-[hsl(200_70%_60%)]",
  update: "text-muted-foreground",
  photoshoot: "text-[hsl(330_60%_68%)]",
  event: "text-[hsl(40_90%_60%)]",
  article: "text-foreground",
};
