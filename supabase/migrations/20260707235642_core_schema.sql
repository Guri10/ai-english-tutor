-- Core app-owned schema for the AI English speaking-practice app.
-- Design spec §2: docs/superpowers/specs/2026-07-07-ai-speaking-practice-design.md

-- ============================================================
-- profiles
-- ============================================================
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  correction_mode text not null default 'inline'
    check (correction_mode in ('inline', 'summary')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles are viewable by their owner"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "profiles are insertable by their owner"
  on public.profiles for insert
  to authenticated
  with check ((select auth.uid()) = id);

create policy "profiles are updatable by their owner"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- ============================================================
-- student_state — one row per user, the rolling structured profile
-- ============================================================
create table public.student_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  level_score text not null default 'A1'
    check (level_score in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  streak_count integer not null default 0,
  longest_streak integer not null default 0,
  total_sessions integer not null default 0,
  last_session_at timestamptz
);

alter table public.student_state enable row level security;

create policy "student_state is viewable by its owner"
  on public.student_state for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "student_state is insertable by its owner"
  on public.student_state for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "student_state is updatable by its owner"
  on public.student_state for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ============================================================
-- level_history — append-only, one row per completed session
-- ============================================================
create table public.level_history (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  level_score text not null
    check (level_score in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  recorded_at timestamptz not null default now()
);

create index level_history_user_id_recorded_at_idx
  on public.level_history (user_id, recorded_at);

alter table public.level_history enable row level security;

create policy "level_history is viewable by its owner"
  on public.level_history for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "level_history is insertable by its owner"
  on public.level_history for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

-- No update/delete policy: append-only by design.

-- ============================================================
-- recurring_mistakes — upserted after each session
-- ============================================================
create table public.recurring_mistakes (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  mistake_type text not null,
  occurrence_count integer not null default 1,
  last_example text,
  last_seen_at timestamptz not null default now(),
  unique (user_id, mistake_type)
);

alter table public.recurring_mistakes enable row level security;

create policy "recurring_mistakes is viewable by its owner"
  on public.recurring_mistakes for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "recurring_mistakes is insertable by its owner"
  on public.recurring_mistakes for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "recurring_mistakes is updatable by its owner"
  on public.recurring_mistakes for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ============================================================
-- sessions
-- ============================================================
create table public.sessions (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references auth.users (id) on delete cascade,
  scenario_topic text,
  correction_mode_used text not null
    check (correction_mode_used in ('inline', 'summary')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  level_before text
    check (level_before is null or level_before in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  level_after text
    check (level_after is null or level_after in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  status text not null default 'pending_summary'
    check (status in ('completed', 'pending_summary'))
);

create index sessions_user_id_started_at_idx
  on public.sessions (user_id, started_at);

alter table public.sessions enable row level security;

create policy "sessions are viewable by their owner"
  on public.sessions for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "sessions are insertable by their owner"
  on public.sessions for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "sessions are updatable by their owner"
  on public.sessions for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ============================================================
-- session_transcripts — internal use only, never surfaced in the UI
-- ============================================================
create table public.session_transcripts (
  session_id uuid primary key references public.sessions (id) on delete cascade,
  raw_transcript jsonb not null default '[]'::jsonb
);

alter table public.session_transcripts enable row level security;

create policy "session_transcripts is viewable by its owning session's owner"
  on public.session_transcripts for select
  to authenticated
  using (
    (select auth.uid()) = (
      select user_id from public.sessions where id = session_id
    )
  );

create policy "session_transcripts is insertable by its owning session's owner"
  on public.session_transcripts for insert
  to authenticated
  with check (
    (select auth.uid()) = (
      select user_id from public.sessions where id = session_id
    )
  );

create policy "session_transcripts is updatable by its owning session's owner"
  on public.session_transcripts for update
  to authenticated
  using (
    (select auth.uid()) = (
      select user_id from public.sessions where id = session_id
    )
  )
  with check (
    (select auth.uid()) = (
      select user_id from public.sessions where id = session_id
    )
  );
