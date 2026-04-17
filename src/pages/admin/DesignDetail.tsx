import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Construction } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function DesignDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate("/admin/designs")} className="gap-2">
        <ArrowLeft className="h-4 w-4" /> Back to Designs
      </Button>
      <div className="ax-card p-12 text-center space-y-3">
        <Construction className="h-10 w-10 mx-auto text-muted-foreground" />
        <h2 className="text-xl font-semibold">Design Detail — coming in Pass 2</h2>
        <p className="text-muted-foreground text-sm">
          File uploads, mockups, links, and product references will live here.
        </p>
        <p className="text-xs text-muted-foreground tabular-nums">id: {id}</p>
      </div>
    </div>
  );
}
