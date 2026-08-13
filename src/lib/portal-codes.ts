// Code Vault — share codes for fans. Deterministic per athlete for now so
// they're stable; BACKEND: real code rules (discount %, dollar credit, free
// item, single/multi-use), issuance, and redemption tracking live server-side
// later. This file just derives display codes + the share text.

export type CodeStatus = "unused" | "used";

export interface AthleteCode {
  code: string;
  status: CodeStatus;
  /** Human label of what the code does (config/mock for now). */
  benefit: string;
}

const CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function seededSuffix(seed: string, salt: number, len = 4): string {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let out = "";
  for (let i = 0; i < len; i++) {
    h = Math.imul(h ^ (h >>> 13), 16777619);
    out += CHARSET[Math.abs(h) % CHARSET.length];
  }
  return out;
}

/** Prefix from the athlete's last name (fallback to first). */
function codePrefix(lastName: string, firstName: string): string {
  const base = (lastName || firstName || "AX").replace(/[^a-zA-Z]/g, "").toUpperCase();
  return base.slice(0, 6) || "AX";
}

// BACKEND: benefits should be configured per campaign. Placeholder set.
const BENEFITS = ["15% off", "$10 credit", "Free sticker pack"];

export function weeklyCodes(opts: {
  athleteId: string;
  firstName: string;
  lastName: string;
  count?: number;
}): AthleteCode[] {
  const count = opts.count ?? 3;
  const prefix = codePrefix(opts.lastName, opts.firstName);
  return Array.from({ length: count }, (_, i) => ({
    code: `${prefix}-${seededSuffix(opts.athleteId, i)}`,
    status: "unused" as CodeStatus,
    benefit: BENEFITS[i % BENEFITS.length],
  }));
}

export function codeShareText(code: string, firstName: string): string {
  return `Use my code ${code} for a deal on ${firstName}'s AthleteXclusive gear 🔥`;
}
