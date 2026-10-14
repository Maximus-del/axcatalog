// AX OS V2 — one behaviour for "a folder of artwork was dropped here".
//
// Three surfaces take a drop now — the athlete overview's two shelves, the
// library shelf, and each person in the People directory — and they must agree
// about what is accepted, what is refused, how it is named and what the
// operator is told. Three copies of that would have drifted the first time one
// of them was touched.

import { toast } from "sonner";
import { useUploadDesigns } from "./data";
import { planDrop, titleFromFilename } from "./drop-files";

export interface DesignDrop {
  /** Hand it the dropped files and whether they are production artwork. */
  accept: (files: File[], productionReady: boolean) => void;
  busy: boolean;
}

export function useDesignDrop(entityId: string, organizationId: string, entityName?: string): DesignDrop {
  const upload = useUploadDesigns(entityId, organizationId);

  const accept = (files: File[], productionReady: boolean) => {
    if (!entityId || !organizationId) {
      toast.error("That entity is still loading — try again in a moment");
      return;
    }

    const plan = planDrop(files);
    if (plan.accepted.length === 0) {
      toast.error("Nothing there AX can store", {
        // Named, not counted: "3 files were skipped" sends somebody hunting.
        description: plan.rejected.length > 0 ? plan.rejected.map((r) => r.name).join(", ") : "Images only.",
      });
      return;
    }

    upload.mutate(
      {
        files: plan.accepted,
        productionReady,
        titleFor: (file) => titleFromFilename(file.name) || "Untitled design",
      },
      {
        onSuccess: ({ uploaded, failed }) => {
          const where = productionReady ? "Designs" : "Design concepts";
          const who = entityName ? ` for ${entityName}` : "";
          if (failed.length > 0) {
            toast.warning(`${uploaded.length} added to ${where}${who}, ${failed.length} could not be`, {
              description: failed[0].name,
            });
          } else {
            toast.success(
              `${uploaded.length} added to ${where}${who}`,
              plan.rejected.length > 0
                ? { description: `Skipped: ${plan.rejected.map((r) => r.name).join(", ")}` }
                : undefined,
            );
          }
          if (plan.trimmed) {
            toast.info("Only the first 40 were taken", { description: "Drop the rest separately." });
          }
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : "Could not upload those"),
      },
    );
  };

  return { accept, busy: upload.isPending };
}
