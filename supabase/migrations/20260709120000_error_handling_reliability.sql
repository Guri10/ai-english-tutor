-- Issue #6 (error handling & reliability, spec §4).
--
-- `sessions` rows are now created at connect time (status 'active'), not
-- only at session end — a server-side abandoned-session sweep needs
-- something to find. `last_activity_at` is bumped by the client's periodic
-- heartbeat and beforeunload/visibility beacon; a session with no activity
-- for 15+ minutes is finalized by a pg_cron-scheduled sweep using whatever
-- transcript was last synced.
--
-- 'finalizing' is a transient claim state (lib/realtime/finalize-session.ts)
-- — finalization atomically flips a row to 'finalizing' before doing any
-- work, so the sweep and a normal endPracticeSession call (or two
-- overlapping sweep runs) can't both finalize the same session and double
-- -write level_history/student_state.

alter table public.sessions
  drop constraint if exists sessions_status_check;
alter table public.sessions
  alter column status drop default;
alter table public.sessions
  add constraint sessions_status_check
    check (status in ('active', 'finalizing', 'completed', 'pending_summary'));
alter table public.sessions
  alter column status set default 'active';

alter table public.sessions
  add column last_activity_at timestamptz not null default now();

-- Sweep query: WHERE status = 'active' AND last_activity_at < <cutoff>.
-- Retry query: WHERE status = 'pending_summary'. Both filter on status
-- first, so one partial index covers both maintenance-route queries.
create index sessions_status_last_activity_at_idx
  on public.sessions (status, last_activity_at)
  where status in ('active', 'pending_summary');
