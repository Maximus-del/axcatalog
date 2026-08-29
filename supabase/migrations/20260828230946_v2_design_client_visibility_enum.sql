-- AX OS V2 — client visibility for designs.
--
-- Two states only. 'hidden' is the safe default and every existing row gets it,
-- so nothing that is private today becomes visible because this shipped.
--
-- Deliberately NOT a boolean: a third state (e.g. 'full') is a plausible future
-- for a client who has actually bought the artwork outright, and widening an
-- enum is additive where widening a boolean is a migration.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'design_client_visibility') then
    create type public.design_client_visibility as enum ('hidden', 'preview');
  end if;
end $$;

-- A client-safe rendition of a design. Lives in its own bucket (see the next
-- migration) so that bucket-scoped storage policies can grant a client access to
-- previews without ever granting access to `design-files`.
alter type public.design_file_type add value if not exists 'preview';
