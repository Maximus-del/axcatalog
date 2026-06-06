import { DollarSign, Image as ImageIcon, Package, ShoppingCart, LucideIcon } from "lucide-react";

export type HubCardKey = "sales" | "products" | "content" | "order";

interface HubCardDef {
  key: HubCardKey;
  label: string;
  icon: LucideIcon;
  gradient: string;
  iconColor: string;
}

const CARDS: HubCardDef[] = [
  {
    key: "sales",
    label: "Sales",
    icon: DollarSign,
    gradient: "linear-gradient(135deg, #0d3320 0%, #1a5c3a 100%)",
    iconColor: "#2ecc71",
  },
  {
    key: "products",
    label: "Products",
    icon: Package,
    gradient: "linear-gradient(135deg, #1a1a3a 0%, #2a2a5a 100%)",
    iconColor: "#7c8aff",
  },
  {
    key: "content",
    label: "Content",
    icon: ImageIcon,
    gradient: "linear-gradient(135deg, #2d1a3a 0%, #4a2a5a 100%)",
    iconColor: "#c77dff",
  },
  {
    key: "order",
    label: "Order",
    icon: ShoppingCart,
    gradient: "linear-gradient(135deg, #1a2a1a 0%, #2a4a2a 100%)",
    iconColor: "#2ecc71",
  },
];

interface Props {
  onSelect: (key: HubCardKey) => void;
}

export function HubCardsRow({ onSelect }: Props) {
  return (
    <div className="-mx-4 px-4 sm:mx-0 sm:px-0">
      <div className="flex sm:grid sm:grid-cols-4 gap-3 overflow-x-auto sm:overflow-visible snap-x snap-mandatory pb-2 sm:pb-0">
        {CARDS.map((c) => {
          const Icon = c.icon;
          return (
            <button
              key={c.key}
              onClick={() => onSelect(c.key)}
              className="group flex-shrink-0 sm:flex-shrink w-[130px] sm:w-auto snap-start ax-card hover:border-accent hover:-translate-y-0.5 active:translate-y-0 flex flex-col items-center justify-center gap-3 py-5 text-center"
              type="button"
            >
              <div
                className="h-12 w-12 rounded-xl flex items-center justify-center"
                style={{ background: c.gradient }}
              >
                <Icon className="h-6 w-6" style={{ color: c.iconColor }} strokeWidth={2} />
              </div>
              <div className="ax-label">{c.label}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
