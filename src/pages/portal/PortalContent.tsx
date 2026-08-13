// Mobile-first. Content Library (Phase 4).
import { PortalSection } from "@/components/portal/PortalSection";
import { ContentLibrary } from "@/components/portal/content/ContentLibrary";

export default function PortalContent() {
  return (
    <main className="max-w-[1200px] mx-auto px-4 sm:px-6 py-5 pb-bottom-nav md:pb-32">
      <PortalSection
        id="sec-content"
        title="Content"
        description="Photos, graphics, and post kits — save, share, and copy your product links."
      >
        <ContentLibrary />
      </PortalSection>
    </main>
  );
}
