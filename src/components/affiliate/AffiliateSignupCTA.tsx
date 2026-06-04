import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function AffiliateSignupCTA() {
  return (
    <div className="ax-card p-8 text-center max-w-xl mx-auto">
      <h2 className="ax-section-header mb-2">You're not an affiliate yet</h2>
      <p className="text-muted-foreground mb-6">
        Apply to get your own discount code and earn commission on every sale.
      </p>
      <Button asChild>
        <Link to="/affiliate/signup">Apply now</Link>
      </Button>
    </div>
  );
}