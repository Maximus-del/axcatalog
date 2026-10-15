// Client access — whether an entity can actually sign in, and giving them a way to.
//
// The portal has existed for months and nobody outside AX could reach it. The
// only account-creation path in the app (`admin-manage-users`, action 'create')
// hard-codes role 'admin', files the user into the caller's organisation and
// writes no athlete link — so the single account you could make for Darnell
// Mooney was an administrator of every org's everything.
//
// What RequirePortal and useCurrentAthlete actually read is `user_athlete_links`.
// This module answers "does a login exist for this entity", and makes one.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { t, type Row } from "./db";

export interface ClientLogin {
  userId: string;
  email: string | null;
  fullName: string | null;
  /** From user_profiles.role. 'admin' here means an AX account, not a client. */
  role: string | null;
}

export interface ClientAccess {
  /** Everyone linked to this entity, operators included. */
  links: ClientLogin[];
  /** Links that are genuinely the client — the ones that mean "they can sign in". */
  clients: ClientLogin[];
  /** AX accounts linked for testing or impersonation. Not client access. */
  operators: ClientLogin[];
}

export const EMPTY_ACCESS: ClientAccess = { links: [], clients: [], operators: [] };

/**
 * An admin account linked to an athlete is NOT client access.
 *
 * Both of the existing `user_athlete_links` rows point at Darnell Mooney and
 * both belong to AX's own admin accounts — used for impersonation while the
 * portal was being built. Counting those as "Darnell can log in" would report
 * the job done when no athlete has ever had a password.
 */
export function splitAccess(links: ClientLogin[]): ClientAccess {
  const operators = links.filter((l) => l.role === "admin" || l.role === "owner");
  const clients = links.filter((l) => !(l.role === "admin" || l.role === "owner"));
  return { links, clients, operators };
}

export function hasClientLogin(access: ClientAccess | undefined | null): boolean {
  return (access?.clients.length ?? 0) > 0;
}

export const clientAccessKey = (entityId: string) => ["v2", "client-access", entityId];

async function fetchClientAccess(entityId: string): Promise<ClientAccess> {
  const { data: linkRows, error } = await t("user_athlete_links")
    .select("user_id")
    .eq("athlete_id", entityId);
  if (error) throw new Error(error.message);

  const userIds = ((linkRows ?? []) as Row[])
    .map((r) => r.user_id)
    .filter((v): v is string => typeof v === "string");
  if (userIds.length === 0) return EMPTY_ACCESS;

  const { data: profiles, error: pErr } = await t("user_profiles")
    .select("id, email, full_name, role")
    .in("id", userIds);
  if (pErr) throw new Error(pErr.message);

  const byId = new Map<string, Row>();
  for (const p of (profiles ?? []) as Row[]) {
    if (typeof p.id === "string") byId.set(p.id, p);
  }

  const links: ClientLogin[] = userIds.map((id) => {
    const p = byId.get(id);
    return {
      userId: id,
      email: typeof p?.email === "string" ? p.email : null,
      fullName: typeof p?.full_name === "string" ? p.full_name : null,
      role: typeof p?.role === "string" ? p.role : null,
    };
  });

  return splitAccess(links);
}

export function useClientAccess(entityId: string | undefined) {
  return useQuery<ClientAccess>({
    queryKey: clientAccessKey(entityId ?? "none"),
    enabled: !!entityId,
    queryFn: () => fetchClientAccess(entityId!),
  });
}

export interface CreatedLogin {
  email: string;
  /** Shown once. Never stored, never fetched again — a reset issues a new one. */
  tempPassword: string;
  userId: string;
}

export interface CreateClientLoginInput {
  entityId: string;
  email: string;
  fullName: string;
}

export function useCreateClientLogin() {
  const qc = useQueryClient();
  return useMutation<CreatedLogin, Error, CreateClientLoginInput>({
    mutationFn: async ({ entityId, email, fullName }) => {
      const { data, error } = await supabase.functions.invoke("admin-manage-users", {
        body: {
          action: "create_client",
          athlete_id: entityId,
          email: email.trim(),
          full_name: fullName.trim(),
        },
      });
      // A non-2xx from an edge function arrives as FunctionsHttpError with the
      // body unread, so the useful message — "already exists", "cannot access"
      // — is inside the response rather than in error.message.
      if (error) {
        const ctx = (error as { context?: Response }).context;
        if (ctx && typeof ctx.json === "function") {
          const body = await ctx.json().catch(() => null);
          const msg = (body as { error?: string } | null)?.error;
          if (msg) throw new Error(msg);
        }
        throw new Error(error.message);
      }
      const res = data as { error?: string; email?: string; tempPassword?: string; user_id?: string };
      if (res?.error) throw new Error(res.error);
      if (!res?.tempPassword || !res?.email || !res?.user_id) {
        throw new Error("The login was not created.");
      }
      return { email: res.email, tempPassword: res.tempPassword, userId: res.user_id };
    },
    onSuccess: (_res, { entityId }) => {
      void qc.invalidateQueries({ queryKey: clientAccessKey(entityId) });
    },
  });
}

/**
 * What to hand the client.
 *
 * Deliberately not a template with a greeting and a sign-off: this gets pasted
 * into a text message, and anything longer gets trimmed by whoever sends it.
 * The password is included because it is one-time and `must_change_password`
 * forces them to replace it on first sign-in.
 */
export function handoffText(name: string, email: string, tempPassword: string, origin: string): string {
  const first = (name ?? "").trim().split(/\s+/)[0] || "there";
  return [
    `${first} — your AX portal is ready.`,
    "",
    `Sign in: ${origin}/login`,
    `Email: ${email}`,
    `Temporary password: ${tempPassword}`,
    "",
    "It'll ask you to set your own password the first time.",
  ].join("\n");
}
