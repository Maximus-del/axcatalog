-- Enum for question types
create type public.questionnaire_question_type as enum ('short_text','long_text','single_choice','multi_choice','image_choice');

-- Questionnaires
create table public.questionnaires (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  slug text not null unique,
  intro_text text,
  thank_you_text text,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.questionnaires to anon, authenticated;
grant insert, update, delete on public.questionnaires to authenticated;
grant all on public.questionnaires to service_role;
alter table public.questionnaires enable row level security;
create policy "Public can view active questionnaires"
  on public.questionnaires for select
  using (is_active = true or public.current_user_is_admin());
create policy "Admins manage questionnaires"
  on public.questionnaires for all
  to authenticated
  using (public.current_user_is_admin())
  with check (public.current_user_is_admin());
create trigger questionnaires_updated_at before update on public.questionnaires
  for each row execute function public.set_updated_at();

-- Questions
create table public.questionnaire_questions (
  id uuid primary key default gen_random_uuid(),
  questionnaire_id uuid not null references public.questionnaires(id) on delete cascade,
  position integer not null default 0,
  type public.questionnaire_question_type not null,
  prompt text not null,
  help_text text,
  required boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.questionnaire_questions(questionnaire_id, position);
grant select on public.questionnaire_questions to anon, authenticated;
grant insert, update, delete on public.questionnaire_questions to authenticated;
grant all on public.questionnaire_questions to service_role;
alter table public.questionnaire_questions enable row level security;
create policy "Public can view questions of active questionnaires"
  on public.questionnaire_questions for select
  using (
    exists (
      select 1 from public.questionnaires q
      where q.id = questionnaire_id and (q.is_active = true or public.current_user_is_admin())
    )
  );
create policy "Admins manage questions"
  on public.questionnaire_questions for all
  to authenticated
  using (public.current_user_is_admin())
  with check (public.current_user_is_admin());

-- Options (for choice / image_choice questions)
create table public.questionnaire_question_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questionnaire_questions(id) on delete cascade,
  position integer not null default 0,
  label text,
  design_id uuid references public.designs(id) on delete set null,
  image_url text,
  created_at timestamptz not null default now()
);
create index on public.questionnaire_question_options(question_id, position);
grant select on public.questionnaire_question_options to anon, authenticated;
grant insert, update, delete on public.questionnaire_question_options to authenticated;
grant all on public.questionnaire_question_options to service_role;
alter table public.questionnaire_question_options enable row level security;
create policy "Public can view options of active questionnaires"
  on public.questionnaire_question_options for select
  using (
    exists (
      select 1
      from public.questionnaire_questions qq
      join public.questionnaires q on q.id = qq.questionnaire_id
      where qq.id = question_id and (q.is_active = true or public.current_user_is_admin())
    )
  );
create policy "Admins manage options"
  on public.questionnaire_question_options for all
  to authenticated
  using (public.current_user_is_admin())
  with check (public.current_user_is_admin());

-- Responses
create table public.questionnaire_responses (
  id uuid primary key default gen_random_uuid(),
  questionnaire_id uuid not null references public.questionnaires(id) on delete cascade,
  respondent_name text,
  respondent_email text,
  athlete_id uuid references public.athletes(id) on delete set null,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index on public.questionnaire_responses(questionnaire_id, submitted_at desc);
grant insert on public.questionnaire_responses to anon, authenticated;
grant select, update, delete on public.questionnaire_responses to authenticated;
grant all on public.questionnaire_responses to service_role;
alter table public.questionnaire_responses enable row level security;
create policy "Public can submit responses to active questionnaires"
  on public.questionnaire_responses for insert
  with check (
    exists (
      select 1 from public.questionnaires q
      where q.id = questionnaire_id and q.is_active = true
    )
  );
create policy "Admins view responses"
  on public.questionnaire_responses for select
  to authenticated
  using (public.current_user_is_admin());
create policy "Admins manage responses"
  on public.questionnaire_responses for all
  to authenticated
  using (public.current_user_is_admin())
  with check (public.current_user_is_admin());

-- Answers
create table public.questionnaire_answers (
  id uuid primary key default gen_random_uuid(),
  response_id uuid not null references public.questionnaire_responses(id) on delete cascade,
  question_id uuid not null references public.questionnaire_questions(id) on delete cascade,
  text_value text,
  selected_option_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);
create index on public.questionnaire_answers(response_id);
create index on public.questionnaire_answers(question_id);
grant insert on public.questionnaire_answers to anon, authenticated;
grant select, update, delete on public.questionnaire_answers to authenticated;
grant all on public.questionnaire_answers to service_role;
alter table public.questionnaire_answers enable row level security;
create policy "Public can submit answers to active questionnaires"
  on public.questionnaire_answers for insert
  with check (
    exists (
      select 1
      from public.questionnaire_responses r
      join public.questionnaires q on q.id = r.questionnaire_id
      where r.id = response_id and q.is_active = true
    )
  );
create policy "Admins view answers"
  on public.questionnaire_answers for select
  to authenticated
  using (public.current_user_is_admin());
create policy "Admins manage answers"
  on public.questionnaire_answers for all
  to authenticated
  using (public.current_user_is_admin())
  with check (public.current_user_is_admin());