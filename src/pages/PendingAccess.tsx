import { useAuth } from "@/auth/AuthProvider";
import { Wordmark } from "@/components/brand/Wordmark";
import { Button } from "@/components/ui/button";

export default function PendingAccess() {
  const { signOut, user } = useAuth();
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6">
      <div className="w-full max-w-md text-center">
        <div className="flex justify-center mb-8">
          <Wordmark size="lg" />
        </div>
        <div className="ax-card p-8">
          <div className="ax-section-header mb-3">Account pending</div>
          <h1 className="text-2xl font-bold mb-3">You're almost in.</h1>
          <p className="text-muted-foreground text-sm mb-6">
            Your account isn't linked to an athlete profile yet. Reach out to your
            Athlete Xclusive rep to get connected.
          </p>
          {user?.email && (
            <p className="ax-label mb-6">Signed in as {user.email}</p>
          )}
          <Button
            variant="outline"
            onClick={signOut}
            className="w-full border-border text-muted-foreground hover:text-accent hover:border-accent"
          >
            Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}
