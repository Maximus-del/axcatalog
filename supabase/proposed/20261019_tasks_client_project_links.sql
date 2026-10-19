-- PROPOSED — NOT APPLIED. AX Studio OS, Projects & Tasks gap.
--
-- `tasks` is organisation-scoped only: a task cannot say which client or
-- which client project it is for, and there is no "in review" status. The
-- Studio OS board works without this (tags stand in for the client), but
-- client spaces cannot list their own tasks until it exists.
--
-- Smallest additive change. No existing column changes, no data rewritten,
-- no RLS change: the existing "tasks_org_access" policy (is_org_accessible on
-- organization_id) keeps governing every row. Both new columns are nullable
-- and every existing task stays exactly as it is.
--
-- Reversible:
--   alter table public.tasks drop column portal_thread_id, drop column athlete_id;
--   (an enum value cannot be dropped; 'in_review' would simply go unused)

begin;

alter table public.tasks
  add column if not exists athlete_id uuid references public.athletes(id) on delete set null,
  add column if not exists portal_thread_id uuid references public.portal_threads(id) on delete set null;

create index if not exists tasks_athlete_idx on public.tasks(athlete_id) where athlete_id is not null;
create index if not exists tasks_portal_thread_idx on public.tasks(portal_thread_id) where portal_thread_id is not null;

commit;

-- Enum values cannot be added inside a transaction block that then uses them;
-- run on its own. Placed after in_progress so ordering follows the workflow.
alter type public.task_status add value if not exists 'in_review' after 'in_progress';

-- After applying: regenerate src/integrations/supabase/types.ts, then
--   - src/lib/v2/work.ts: add `in_review` to BOARD_COLUMNS (tone amber),
--     STATUS_LABEL/STATUS_TONE, and select athlete_id / portal_thread_id;
--   - TaskEditor: a Client picker (useEntities) and an optional Project picker
--     (useDeskThreads filtered to that client's projects);
--   - V2EntityOverview: a "Client tasks" card filtered by athlete_id.
