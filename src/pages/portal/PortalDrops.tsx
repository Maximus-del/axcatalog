import { Navigate, useLocation } from "react-router-dom";
import { PortalSection } from "@/components/portal/PortalSection";
import { usePortalLayoutKind } from "@/components/portal/PortalLayoutKind";
import { portalLink } from "@/components/portal/mooney/navigation";
import { UpcomingDrops } from "@/components/portal/home/UpcomingDrops";
import { RecommendationsCarousel } from "@/components/portal/home/RecommendationsCarousel";

export default function PortalDrops() {
  const { search } = useLocation();
  // The world shell plans drops inside Content & Drops (the real drop planner);
  // the classic Upcoming Drops panel never read the client's drops.
  if (usePortalLayoutKind() === "world") return <Navigate to={portalLink("/portal/content?panel=drops", search)} replace />;
  return (
    <main className="max-w-[1200px] mx-auto px-4 sm:px-6 py-4 sm:py-6 space-y-8 pb-bottom-nav md:pb-32">
      <PortalSection id="sec-drops" title="Upcoming Drops">
        <UpcomingDrops />
      </PortalSection>
      <PortalSection id="sec-recs" title="This Week's Recommendations">
        <RecommendationsCarousel />
      </PortalSection>
    </main>
  );
}