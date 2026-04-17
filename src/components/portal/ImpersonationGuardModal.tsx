import { AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Shown when an impersonating admin tries to perform a write action
 * (e.g. submit a bulk order) from the portal.
 */
export function ImpersonationGuardModal({ open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 text-warning">
            <AlertTriangle className="h-5 w-5" />
            <DialogTitle>Action blocked while impersonating</DialogTitle>
          </div>
          <DialogDescription className="pt-2">
            You're viewing this portal as an admin. To submit orders on behalf
            of the athlete, use the admin Orders page instead.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Keep exploring
          </Button>
          <Button asChild>
            <Link to="/admin/orders">Go to Admin Orders</Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
