import { createClient } from 'jsr:@supabase/supabase-js@2';

const ADMIN_ROLE = 'admin';
// A portal user. `app_role` has carried 'client' all along; nothing created one.
const CLIENT_ROLE = 'client';
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const jsonHeaders = { ...cors, 'Content-Type': 'application/json' };

// Cryptographic, and free of look-alike characters (0/O, 1/l/I) because it
// gets read off a phone and typed by hand. ~52 bits: one-time, and the
// account forces a change on first sign-in.
const PW_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
function tempPassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  const chars = Array.from(bytes, (b) => PW_ALPHABET[b % PW_ALPHABET.length]).join('');
  return `AX-${chars.slice(0, 5)}-${chars.slice(5)}`;
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: jsonHeaders });
}

/** Users linked to this athlete whose profile role is 'client'. Operators linked for testing are excluded. */
// deno-lint-ignore no-explicit-any
async function linkedClientIds(admin: any, athleteId: string): Promise<string[]> {
  const { data: links } = await admin.from('user_athlete_links').select('user_id').eq('athlete_id', athleteId);
  const ids = (links ?? []).map((l: { user_id: string }) => l.user_id);
  if (ids.length === 0) return [];
  const { data: profiles } = await admin.from('user_profiles').select('id, role').in('id', ids);
  return (profiles ?? [])
    .filter((p: { role: string }) => p.role === CLIENT_ROLE)
    .map((p: { id: string }) => p.id);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.toLowerCase().startsWith('bearer ')) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const url = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const asCaller = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: isAdmin, error: adminErr } = await asCaller.rpc('current_user_is_admin');
    if (adminErr) return json({ error: adminErr.message }, 400);
    if (isAdmin !== true) return json({ error: 'Not authorized' }, 403);

    const { data: orgId } = await asCaller.rpc('current_user_org_id');

    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let body: any;
    try {
      body = await req.json();
    } catch {
      return json({ error: 'Invalid JSON' }, 400);
    }
    const action = body?.action;

    if (action === 'create') {
      const email = String(body.email ?? '').trim().toLowerCase();
      const full_name = String(body.full_name ?? '').trim();
      if (!email) return json({ error: 'Email is required' }, 400);

      const password = tempPassword();
      const { data: created, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name, must_change_password: true },
      });
      if (error) {
        const msg = (error.message || '').toLowerCase();
        if (
          msg.includes('already') ||
          msg.includes('registered') ||
          msg.includes('exists') ||
          (error as any).status === 422
        ) {
          return json({ error: `A user with email ${email} already exists.` }, 409);
        }
        return json({ error: error.message }, 400);
      }

      const { error: pErr } = await admin.from('user_profiles').insert({
        id: created.user!.id,
        organization_id: orgId,
        full_name,
        email,
        role: ADMIN_ROLE,
      });
      if (pErr) {
        // Roll back the auth user if profile insert fails so the email is reusable.
        await admin.auth.admin.deleteUser(created.user!.id).catch(() => {});
        return json({ error: pErr.message }, 400);
      }

      return json({ email, tempPassword: password });
    }

    // ── A LOGIN FOR A CLIENT, NOT ANOTHER OPERATOR ──────────────────────
    //
    // The 'create' action above hard-codes role 'admin' and files the new user
    // into the CALLER's org with no athlete link. That is the only account this
    // function could make, so there was no way to give an athlete access to
    // their own portal except by making them an administrator of everything.
    //
    // Three differences, all of them the point:
    //   role            'client', not 'admin'
    //   organization_id the ATHLETE's org, not the caller's
    //   link            a user_athlete_links row, which is what RequirePortal
    //                   and useCurrentAthlete actually read
    //
    // The athlete is looked up through the CALLER's client, not the service
    // client, so row-level security decides whether this operator may see that
    // athlete at all. An admin of one org cannot mint a login into another's.
    if (action === 'create_client') {
      const email = String(body.email ?? '').trim().toLowerCase();
      const full_name = String(body.full_name ?? '').trim();
      const athleteId = String(body.athlete_id ?? '').trim();
      if (!email) return json({ error: 'Email is required' }, 400);
      if (!athleteId) return json({ error: 'athlete_id is required' }, 400);

      const { data: athlete, error: aErr } = await asCaller
        .from('athletes')
        .select('id, organization_id, display_name, full_name')
        .eq('id', athleteId)
        .maybeSingle();
      if (aErr) return json({ error: aErr.message }, 400);
      if (!athlete) return json({ error: 'That entity does not exist, or you cannot access it.' }, 404);

      const password = tempPassword();
      const { data: created, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name, must_change_password: true },
      });
      if (error) {
        const msg = (error.message || '').toLowerCase();
        if (
          msg.includes('already') ||
          msg.includes('registered') ||
          msg.includes('exists') ||
          (error as any).status === 422
        ) {
          return json({ error: `A user with email ${email} already exists.` }, 409);
        }
        return json({ error: error.message }, 400);
      }

      const userId = created.user!.id;
      // Roll the auth user back on any failure below, so the email stays usable
      // and we never leave an account that can sign in but reaches nothing.
      const { error: pErr } = await admin.from('user_profiles').insert({
        id: userId,
        organization_id: athlete.organization_id,
        full_name: full_name || athlete.display_name || athlete.full_name || email,
        email,
        role: CLIENT_ROLE,
      });
      if (pErr) {
        await admin.auth.admin.deleteUser(userId).catch(() => {});
        return json({ error: pErr.message }, 400);
      }

      const { error: lErr } = await admin
        .from('user_athlete_links')
        .insert({ user_id: userId, athlete_id: athleteId });
      if (lErr) {
        // Note: a PostgREST builder is a thenable, not a Promise — it has no
        // .catch(). It also never throws; a failure arrives in .error. So this
        // is awaited plainly, and its result ignored on purpose: we are already
        // in a failure path and the auth user is about to go regardless.
        await admin.from('user_profiles').delete().eq('id', userId);
        await admin.auth.admin.deleteUser(userId).catch(() => {});
        return json({ error: lErr.message }, 400);
      }

      return json({ email, tempPassword: password, user_id: userId, athlete_id: athleteId });
    }

    // ── CLIENT LOGINS FOR ONE ENTITY: WHO, AND HOW FAR THEY GOT ──────────
    //
    // The portal card needs to say "waiting for first sign-in" vs "password
    // set", and both facts live in auth.users, which no browser session can
    // read. Same gate as create_client: the athlete must be visible to the
    // CALLER, so an operator only ever sees logins for entities they could see
    // anyway. Returns no password — none is stored to return.
    if (action === 'client_logins') {
      const athleteId = String(body.athlete_id ?? '').trim();
      if (!athleteId) return json({ error: 'athlete_id is required' }, 400);
      const { data: athlete, error: aErr } = await asCaller
        .from('athletes').select('id').eq('id', athleteId).maybeSingle();
      if (aErr) return json({ error: aErr.message }, 400);
      if (!athlete) return json({ error: 'That entity does not exist, or you cannot access it.' }, 404);

      const clients = await linkedClientIds(admin, athleteId);
      const logins = [];
      for (const id of clients) {
        const { data: u } = await admin.auth.admin.getUserById(id);
        if (!u?.user) continue;
        logins.push({
          user_id: id,
          email: u.user.email ?? null,
          last_sign_in_at: u.user.last_sign_in_at ?? null,
          must_change_password: u.user.user_metadata?.must_change_password === true,
        });
      }
      return json({ logins });
    }

    // ── A NEW ONE-TIME PASSWORD FOR A CLIENT ────────────────────────────
    //
    // Unlike 'reset_password' below, this cannot be pointed at an operator or
    // at someone in another org: the athlete must be visible to the caller,
    // and the target must be a role-'client' user linked to that athlete.
    // The old password stops working immediately.
    if (action === 'reset_client_password') {
      const athleteId = String(body.athlete_id ?? '').trim();
      const userId = String(body.user_id ?? '').trim();
      if (!athleteId || !userId) return json({ error: 'athlete_id and user_id are required' }, 400);
      const { data: athlete, error: aErr } = await asCaller
        .from('athletes').select('id').eq('id', athleteId).maybeSingle();
      if (aErr) return json({ error: aErr.message }, 400);
      if (!athlete) return json({ error: 'That entity does not exist, or you cannot access it.' }, 404);

      const clients = await linkedClientIds(admin, athleteId);
      if (!clients.includes(userId)) {
        return json({ error: 'That login is not a client of this entity.' }, 403);
      }

      const { data: existing } = await admin.auth.admin.getUserById(userId);
      const password = tempPassword();
      const { error } = await admin.auth.admin.updateUserById(userId, {
        password,
        user_metadata: { ...(existing?.user?.user_metadata ?? {}), must_change_password: true },
      });
      if (error) return json({ error: error.message }, 400);
      return json({ email: existing?.user?.email ?? null, tempPassword: password, user_id: userId });
    }

    if (action === 'reset_password') {
      if (!body.user_id) return json({ error: 'user_id is required' }, 400);
      const password = tempPassword();
      const { error } = await admin.auth.admin.updateUserById(body.user_id, {
        password,
        user_metadata: { must_change_password: true },
      });
      if (error) return json({ error: error.message }, 400);
      return json({ tempPassword: password });
    }

    if (action === 'delete') {
      if (!body.user_id) return json({ error: 'user_id is required' }, 400);
      await admin
        .from('user_profiles')
        .delete()
        .eq('id', body.user_id)
        .eq('organization_id', orgId);
      const { error } = await admin.auth.admin.deleteUser(body.user_id);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (e: any) {
    return json({ error: String(e?.message ?? e) }, 400);
  }
});