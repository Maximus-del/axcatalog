import { Menu } from "lucide-react";
import { avatarColorFor, initialsFor } from "@/lib/avatar-color";
import { Button } from "@/components/ui/button";

interface Props {
  firstName: string;
  lastName: string;
  onMenuClick: () => void;
}

export function PortalHero({ firstName, lastName, onMenuClick }: Props) {
  const fullName = `${firstName} ${lastName}`.trim();
  const color = avatarColorFor(fullName);
  const initials = initialsFor(fullName);

  return (
    <header
      id="sec-home"
      className="relative bg-[hsl(var(--dark))] border-b border-border"
    >
      {/* Hamburger */}
      <Button
        variant="ghost"
        size="icon"
        onClick={onMenuClick}
        aria-label="Open navigation menu"
        className="absolute top-4 left-4 text-foreground hover:bg-accent/10 hover:text-accent"
      >
        <Menu className="h-5 w-5" />
      </Button>

      <div className="max-w-[1200px] mx-auto px-6 py-12 sm:py-16 flex flex-col items-center text-center">
        {/* Avatar */}
        <div
          className="h-12 w-12 rounded-full flex items-center justify-center text-base font-bold text-white shadow-lg mb-6"
          style={{ backgroundColor: color }}
          aria-hidden
        >
          {initials}
        </div>

        {/* Name */}
        <h1
          className="font-bold uppercase leading-tight text-3xl sm:text-5xl"
          style={{ letterSpacing: "0.1em" }}
        >
          <span className="text-foreground">{firstName}</span>{" "}
          <span className="text-accent">{lastName}</span>
        </h1>

        {/* Subtitle */}
        <p className="mt-3 text-xs sm:text-sm uppercase tracking-[0.18em] text-muted-foreground">
          Athlete Xclusive Portal
        </p>
      </div>
    </header>
  );
}
