import { Link } from "react-router-dom";
import { Eye, X } from "lucide-react";

interface Props {
  athleteName: string;
}

export function ImpersonationBanner({ athleteName }: Props) {
  return (
    <div className="sticky top-0 z-50 bg-warning/95 text-[hsl(var(--dark))] backdrop-blur supports-[backdrop-filter]:bg-warning/85">
      <div className="max-w-[1200px] mx-auto flex items-center justify-between gap-3 px-4 py-2 text-xs sm:text-sm">
        <div className="flex items-center gap-2 font-semibold uppercase tracking-wider">
          <Eye className="h-4 w-4" />
          <span>Viewing as {athleteName}</span>
        </div>
        <Link
          to="/admin"
          className="inline-flex items-center gap-1 font-bold uppercase tracking-wider hover:underline"
        >
          <X className="h-4 w-4" />
          Exit
        </Link>
      </div>
    </div>
  );
}
