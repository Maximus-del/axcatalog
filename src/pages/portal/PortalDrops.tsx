import { PortalSection } from "@/components/portal/PortalSection";
import { UpcomingDrops } from "@/components/portal/home/UpcomingDrops";
import { RecommendationsCarousel } from "@/components/portal/home/RecommendationsCarousel";

export default function PortalDrops() {
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