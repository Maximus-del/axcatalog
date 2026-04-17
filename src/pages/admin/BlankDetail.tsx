import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Construction } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function BlankDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate("/admin/blanks")} className="gap-2">
        <ArrowLeft className="h-4 w-4" /> Back to Blanks
      </Button>
      <div className="ax-card p-12 text-center space-y-3">
        <Construction className="h-10 w-10 mx-auto text-muted-foreground" />
        <h2 className="text-xl font-semibold">Blank Detail — coming in Pass 2</h2>
        <p className="text-muted-foreground text-sm">
          Specs, colors, sizes, products using this blank, and reference files will live here.
        </p>
        <p className="text-xs text-muted-foreground tabular-nums">id: {id}</p>
      </div>
    </div>
  );
}
