// Icon lookup for the shared nav list. nav.ts stays free of JSX so it can be
// unit-tested without a DOM.
import {
  BarChart3, Home, Image, Layers, MessageSquare, Palette, Shirt, Sparkles, User, Wand2,
  type LucideIcon,
} from "lucide-react";

export const NAV_ICONS: Record<string, LucideIcon> = {
  Home, Shirt, Palette, Wand2, Image, MessageSquare, BarChart3, Sparkles, Layers, User,
};
