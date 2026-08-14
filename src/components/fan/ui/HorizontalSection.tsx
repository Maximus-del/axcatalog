// Section header + horizontal scroller. Used across Discover/Home/Shop.
import { Link } from "react-router-dom";
import { ReactNode } from "react";

export function HorizontalSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: { label: string; to: string };
  children: ReactNode;
}) {
  return (
    <section>
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="ax-section-header">{title}</h2>
        {action && (
          <Link to={action.to} className="text-[12px] font-semibold text-accent shrink-0">
            {action.label}
          </Link>
        )}
      </div>
      <div className="flex gap-3 overflow-x-auto -mx-4 px-4 pb-1 scroll-touch snap-x">
        {children}
      </div>
    </section>
  );
}
