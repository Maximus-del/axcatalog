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

function tempPassword() {
  const n = Math.floor(1000 + Math.random() * 9000);
  const s = Math.random().toString(36).slice(2, 6);
  return `AX-${n}-${s}`;
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: jsonHeaders });
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
        await admin.from('user_profiles').delete().eq('id', userId).catch(() => {});
        await admin.auth.admin.deleteUser(userId).catch(() => {});
        return json({ error: lErr.message }, 400);
      }

      return json({ email, tempPassword: password, user_id: userId, athlete_id: athleteId });
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