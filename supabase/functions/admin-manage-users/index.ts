import { createClient } from 'jsr:@supabase/supabase-js@2';

const ADMIN_ROLE = 'admin';
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