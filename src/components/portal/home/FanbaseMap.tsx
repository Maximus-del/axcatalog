// Mobile-first. Test at 375px before merging.
//
// Placeholder fanbase map — a stylized US silhouette with concentration dots.
// Replace with real geo data once Shopify customer locations sync.

const DOTS = [
  { cx: 285, cy: 142, r: 11, label: "Atlanta" },     // largest
  { cx: 168, cy: 90, r: 7, label: "Chicago" },
  { cx: 360, cy: 75, r: 5, label: "NYC" },
  { cx: 80, cy: 130, r: 5, label: "LA" },
  { cx: 230, cy: 165, r: 4, label: "Houston" },
  { cx: 320, cy: 105, r: 4, label: "DC" },
];

export function FanbaseMap() {
  return (
    <div className="ax-card p-4 space-y-3">
      <div className="relative w-full">
        <svg
          viewBox="0 0 400 220"
          className="w-full h-auto"
          role="img"
          aria-label="Fanbase concentration map"
        >
          {/* Stylized US silhouette — abstract blob, not geographically accurate */}
          <path
            d="M 40 90 Q 60 60 110 55 Q 170 45 220 55 Q 290 45 360 65 Q 385 80 380 110 Q 380 145 360 165 Q 320 185 250 185 Q 180 190 130 175 Q 80 165 55 145 Q 30 125 40 90 Z"
            fill="hsl(var(--muted))"
            opacity="0.4"
          />
          {DOTS.map((d, i) => (
            <g key={i}>
              <circle
                cx={d.cx}
                cy={d.cy}
                r={d.r + 4}
                fill="hsl(var(--accent))"
                opacity="0.18"
              />
              <circle cx={d.cx} cy={d.cy} r={d.r} fill="hsl(var(--accent))" />
            </g>
          ))}
        </svg>
      </div>
      <p className="text-sm text-muted-foreground leading-relaxed">
        Your fans are concentrated in:{" "}
        <span className="text-foreground font-medium">
          Atlanta, Chicago, New York, Los Angeles
        </span>
        .
      </p>
      <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
        Live geo data coming after Shopify sync
      </p>
    </div>
  );
}