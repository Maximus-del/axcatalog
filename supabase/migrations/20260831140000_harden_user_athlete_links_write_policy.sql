-- SECURITY FIX — user_athlete_links was self-assignable.
-- Applied live to cuidofxidstqpgypxcop on 2026-08-31 as
-- `harden_user_athlete_links_write_policy`.
--
-- THE HOLE. The write policy checked that the USER row referenced by the link
-- was org-accessible, and never checked the ATHLETE:
--
--   "org write user athlete links"  FOR ALL TO public
--   USING (EXISTS (SELECT 1 FROM user_profiles up
--                  WHERE up.id = user_athlete_links.user_id
--                    AND is_org_accessible(up.organization_id)))
--   WITH CHECK (null -> falls back to the USING expression)
--
-- Any authenticated user with a user_profiles row therefore satisfied it for
-- (user_id = themselves, athlete_id = ANYTHING) — the only thing checked was
-- their own organisation, which is trivially their own organisation.
-- Demonstrated against this database before applying: an ordinary non-admin
-- session inserted a link between itself and an unrelated athlete. Blocked
-- afterwards with 42501.
--
-- WHY IT MATTERS BEYOND ONE TABLE. user_athlete_links is the permission source
-- for the live `design-previews client read` storage policy, for
-- portal_hidden_products, and for several portal views. A forged link is a
-- forged identity everywhere it is trusted.
--
-- THE FIX. Linking is an operator action, so only operators may write. Reads
-- are untouched — the portal's own identity resolution keeps working. The org
-- check is kept, so an admin still cannot create links for users outside their
-- organisation.
--
-- NO APPLICATION IMPACT. Nothing in the codebase writes this table; the app
-- only reads it (AuthProvider selects linked athlete ids). All three current
-- user_profiles rows are role='admin', so no existing operator lost access.
--
-- ROLLBACK:
--   alter policy "org write user athlete links" on public.user_athlete_links
--     using (exists (select 1 from public.user_profiles up
--                    where up.id = user_athlete_links.user_id
--                      and is_org_accessible(up.organization_id)));

alter policy "org write user athlete links" on public.user_athlete_links
  using (
    (current_user_is_admin() or current_user_is_platform_admin())
    and exists (
      select 1 from public.user_profiles up
      where up.id = user_athlete_links.user_id
        and is_org_accessible(up.organization_id)
    )
  )
  with check (
    (current_user_is_admin() or current_user_is_platform_admin())
    and exists (
      select 1 from public.user_profiles up
      where up.id = user_athlete_links.user_id
        and is_org_accessible(up.organization_id)
    )
  );
