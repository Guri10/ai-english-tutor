-- Follow-up hardening from a fresh-context code review of issue #2's
-- schema migration (20260707235642_core_schema.sql).

-- ============================================================
-- 1. Single shared enum for the CEFR level vocabulary, replacing four
--    hand-duplicated inline CHECK constraints across three tables.
-- ============================================================
create type public.cefr_level as enum ('A1', 'A2', 'B1', 'B2', 'C1', 'C2');

alter table public.student_state
  drop constraint if exists student_state_level_score_check;
alter table public.student_state
  alter column level_score drop default;
alter table public.student_state
  alter column level_score type public.cefr_level using level_score::public.cefr_level;
alter table public.student_state
  alter column level_score set default 'A1'::public.cefr_level;

alter table public.level_history
  drop constraint if exists level_history_level_score_check;
alter table public.level_history
  alter column level_score type public.cefr_level using level_score::public.cefr_level;

alter table public.sessions
  drop constraint if exists sessions_level_before_check;
alter table public.sessions
  alter column level_before type public.cefr_level using level_before::public.cefr_level;

alter table public.sessions
  drop constraint if exists sessions_level_after_check;
alter table public.sessions
  alter column level_after type public.cefr_level using level_after::public.cefr_level;

-- ============================================================
-- 2. Non-negative guards on counters that should never go below zero
--    (or below one, for a row that only exists once it's occurred).
-- ============================================================
alter table public.student_state
  add constraint student_state_streak_count_non_negative check (streak_count >= 0);
alter table public.student_state
  add constraint student_state_longest_streak_non_negative check (longest_streak >= 0);
alter table public.student_state
  add constraint student_state_total_sessions_non_negative check (total_sessions >= 0);

alter table public.recurring_mistakes
  add constraint recurring_mistakes_occurrence_count_positive check (occurrence_count >= 1);

-- ============================================================
-- 3. Index matching the dashboard's actual recurring_mistakes query
--    pattern (WHERE user_id ORDER BY last_seen_at) — the implicit
--    unique(user_id, mistake_type) index doesn't cover the ORDER BY.
-- ============================================================
create index recurring_mistakes_user_id_last_seen_at_idx
  on public.recurring_mistakes (user_id, last_seen_at desc);

-- ============================================================
-- 4. Shared ownership-resolution function for session_transcripts,
--    replacing the same correlated subquery duplicated verbatim across
--    its select/insert/update RLS policies. security invoker (the
--    default, made explicit) means this function is still subject to
--    `sessions`' own RLS when it runs — identical access behavior to
--    the inline subquery it replaces, not a privilege escalation.
-- ============================================================
create function public.session_owner(p_session_id uuid)
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select user_id from public.sessions where id = p_session_id;
$$;

drop policy "session_transcripts is viewable by its owning session's owner"
  on public.session_transcripts;
drop policy "session_transcripts is insertable by its owning session's owner"
  on public.session_transcripts;
drop policy "session_transcripts is updatable by its owning session's owner"
  on public.session_transcripts;

create policy "session_transcripts is viewable by its owning session's owner"
  on public.session_transcripts for select
  to authenticated
  using ((select auth.uid()) = public.session_owner(session_id));

create policy "session_transcripts is insertable by its owning session's owner"
  on public.session_transcripts for insert
  to authenticated
  with check ((select auth.uid()) = public.session_owner(session_id));

create policy "session_transcripts is updatable by its owning session's owner"
  on public.session_transcripts for update
  to authenticated
  using ((select auth.uid()) = public.session_owner(session_id))
  with check ((select auth.uid()) = public.session_owner(session_id));

-- ============================================================
-- 5. No DELETE policies exist yet on profiles, student_state, sessions,
--    or recurring_mistakes. This is intentional, not an oversight: no
--    delete/account-removal feature exists yet. RLS default-denies
--    without an explicit policy, so a delete call today returns success
--    with zero rows removed rather than erroring — add explicit DELETE
--    policies (scoped to auth.uid() ownership, matching every other
--    policy in this file) if/when a delete feature is actually built.
-- ============================================================
