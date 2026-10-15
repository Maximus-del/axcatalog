// Money and errors at the adapter boundary.
//
// The database stores money as numeric dollars (credit wallets, line totals,
// order requests). The contract speaks integer minor units. Converting through
// floating point (Number("19.99") * 100 = 1998.9999…) drops cents, so the
// conversion parses the decimal string instead.

import type { ApiError, Money } from "./contract";
import { PortalApiError } from "./contract";

/** "1,234.5" | 1234.5 | "-90.00" → minor units. null/""/garbage → null. */
export function toMinor(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const s = (typeof value === "number" ? value.toFixed(6) : String(value)).replace(/,/g, "").trim();
  const m = /^(-)?(\d*)(?:\.(\d*))?$/.exec(s);
  if (!m || (m[2] === "" && (m[3] ?? "") === "")) return null;
  const sign = m[1] ? -1 : 1;
  const whole = Number(m[2] || "0");
  const frac = (m[3] ?? "").padEnd(3, "0");
  // Round half away from zero on the third decimal, as numeric(10,2) does.
  let cents = Number(frac.slice(0, 2));
  if (Number(frac[2]) >= 5) cents += 1;
  return sign * (whole * 100 + cents);
}

export function money(value: unknown, currency: string | null | undefined = "USD"): Money | null {
  const amountMinor = toMinor(value);
  if (amountMinor === null || !currency) return null;
  return { amountMinor, currency };
}

/** Sum only like currencies. Mixed input → null (the contract forbids summing them). */
export function sumMoney(values: (Money | null)[]): Money | null {
  const present = values.filter((v): v is Money => v !== null);
  if (present.length === 0) return null;
  const currency = present[0].currency;
  if (present.some((v) => v.currency !== currency)) return null;
  return { amountMinor: present.reduce((a, v) => a + v.amountMinor, 0), currency };
}

export function formatMoney(m: Money | null, opts: { cents?: boolean } = {}): string {
  if (!m) return "—";
  const digits = opts.cents ?? m.amountMinor % 100 !== 0 ? 2 : 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: m.currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(m.amountMinor / 100);
}

let seq = 0;
/** A request id for correlating a UI error with logs. Not a security token. */
export function requestId(): string {
  seq = (seq + 1) % 1_000_000;
  return `pr_${Date.now().toString(36)}_${seq.toString(36)}`;
}

interface PgLikeError {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
}

/**
 * PostgREST/Postgres error → the contract's ApiError + HTTP-equivalent status.
 * 'not found' and 'not yours' are deliberately the same 404.
 */
export function toApiError(e: PgLikeError | null | undefined, fallback = "Something went wrong."): PortalApiError {
  const code = e?.code ?? "unknown";
  const statusByCode: Record<string, number> = {
    "28000": 401, // not authenticated
    "42501": 403, // insufficient privilege
    P0002: 404, // not found / not visible
    PGRST116: 404,
    "40001": 409, // serialization / concurrent change
    "23505": 409, // unique violation (idempotency replay handled before this)
    P0409: 409, // stale version (raised by portal functions)
    "22023": 422, // invalid parameter
    "23514": 422, // check violation
    P0422: 422, // validation (raised by portal functions)
  };
  const status = statusByCode[code] ?? 500;
  const message =
    status === 404 ? "Not found." : status === 401 ? "Please sign in again." : e?.message || fallback;
  const error: ApiError = { code, message, requestId: requestId() };
  if (e?.details && status === 422) {
    try {
      const parsed = JSON.parse(e.details) as unknown;
      if (parsed && typeof parsed === "object") error.fieldErrors = parsed as Record<string, string>;
    } catch {
      /* details was plain text */
    }
  }
  return new PortalApiError(error, status);
}

/** True when a server function the adapter calls is not deployed yet. */
export function isMissingFunction(e: PgLikeError | null | undefined): boolean {
  return e?.code === "PGRST202" || e?.code === "42883";
}
