// Hash-based avatar color picker. Stable per name.
const PALETTE = [
  "hsl(145 50% 38%)", // green
  "hsl(210 55% 45%)", // blue
  "hsl(280 40% 48%)", // purple
  "hsl(20 65% 48%)",  // orange
  "hsl(340 50% 48%)", // pink
  "hsl(180 40% 38%)", // teal
  "hsl(50 55% 45%)",  // gold
  "hsl(0 50% 48%)",   // red
];

export function avatarColorFor(name: string): string {
  if (!name) return PALETTE[0];
  const code = name.trim().toUpperCase().charCodeAt(0) || 0;
  return PALETTE[code % PALETTE.length];
}

export function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
