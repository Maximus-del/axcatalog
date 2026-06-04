import { PortalSection } from "@/components/portal/PortalSection";
import { EraComparison } from "@/components/portal/home/EraComparison";
import { usePortalData } from "@/components/portal/PortalDataContext";

export default function PortalEra() {
  const { athlete } = usePortalData();
  return (
    <main className="max-w-[1200px] mx-auto px-4 sm:px-6 py-4 sm:py-6 pb-bottom-nav md:pb-32">
      <PortalSection id="sec-era" title="AR / Era Comparison">
        <EraComparison athleteId={athlete.id} />
      </PortalSection>
    </main>
  );
}