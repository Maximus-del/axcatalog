// DEMO LINK → SIGNED-IN, READ-ONLY PORTAL SESSION.
//
// POST { token } with no login. If the token is an active, unexpired row in
// portal_demo_links, this makes sure a dedicated demo account exists for it
// (a 'client' profile in the entity's org, linked with the link's role,
// user_metadata.ax_demo = true so the portal renders read-only), then returns
// a one-time magic-link hash the browser exchanges for a session.
//
// Kill switch: delete the demo user (or set active=false and delete it).
// Deleting the user ends every session made from the link.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  try {
    const { token } = await req.json().catch(() => ({ token: null }));
    if (typeof token !== 'string' || !/^[a-f0-9]{32}$/.test(token)) return json({ error: 'This demo link is not valid.' }, 404);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: link } = await admin
      .from('portal_demo_links')
      .select('token, athlete_id, role, user_id, active, expires_at')
      .eq('token', token)
      .maybeSingle();
    if (!link || !link.active || new Date(link.expires_at) <= new Date()) {
      return json({ error: 'This demo link has ended.' }, 404);
    }

    const email = `demo-${token.slice(0, 10)}@demo.athletexclusive.com`;
    let userId: string | null = link.user_id;

    if (userId) {
      const { data: existing } = await admin.auth.admin.getUserById(userId);
      if (!existing?.user) userId = null;
    }

    if (!userId) {
      const { data: athlete } = await admin
        .from('athletes')
        .select('organization_id, display_name, full_name')
        .eq('id', link.athlete_id)
        .maybeSingle();
      if (!athlete) return json({ error: 'This demo link has ended.' }, 404);

      const { data: created, error: cErr } = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { ax_demo: true, full_name: `${athlete.display_name || athlete.full_name} (demo)` },
      });
      if (cErr || !created?.user) return json({ error: cErr?.message ?? 'Could not start the demo.' }, 500);
      userId = created.user.id;

      const { error: pErr } = await admin.from('user_profiles').insert({
        id: userId,
        organization_id: athlete.organization_id,
        full_name: `${athlete.display_name || athlete.full_name} (demo)`,
        email,
        role: 'client',
      });
      const { error: lErr } = pErr
        ? { error: pErr }
        : await admin.from('user_athlete_links').insert({ user_id: userId, athlete_id: link.athlete_id, portal_role: link.role });
      if (pErr || lErr) {
        await admin.from('user_profiles').delete().eq('id', userId);
        await admin.auth.admin.deleteUser(userId).catch(() => {});
        return json({ error: (pErr ?? lErr)!.message }, 500);
      }
      await admin.from('portal_demo_links').update({ user_id: userId }).eq('token', token);
    }

    const { data: gen, error: gErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
    if (gErr || !gen?.properties?.hashed_token) return json({ error: gErr?.message ?? 'Could not start the demo.' }, 500);

    return json({ token_hash: gen.properties.hashed_token, email });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Could not start the demo.' }, 500);
  }
});
