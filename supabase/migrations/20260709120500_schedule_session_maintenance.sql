-- Issue #6: schedule the abandoned-session sweep / pending_summary retry
-- job via Supabase pg_cron + pg_net rather than Vercel Cron — this project
-- is on Vercel's free Hobby plan, where Cron Jobs only run once/day, too
-- coarse for spec §4's 15-minute sweep (decided with the user).
--
-- The actual CRON_SECRET value is deliberately NOT set here (this file is
-- committed to git) — it's stored once, out of band, via:
--   select vault.create_secret('<the same value as the CRON_SECRET env var>', 'cron_secret');
-- run directly against the project (Supabase SQL editor or the `execute_sql`
-- MCP tool), never as a migration. This file only wires the schedule to
-- look that secret up at call time.

create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

create extension if not exists pg_net;

select cron.schedule(
  'session-maintenance-sweep',
  '*/10 * * * *', -- every 10 minutes — comfortably under spec §4's 15-minute inactivity threshold
  $$
  select net.http_post(
    url := 'https://ai-english-tutor-beta.vercel.app/api/cron/session-maintenance',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'
      )
    ),
    body := '{}'::jsonb,
    -- net.http_post's own default (2s) is only how long pg_net waits to
    -- record a response, not a limit on the route's own execution — but a
    -- summarization retry pass can take a while, so this is generous
    -- rather than risking a premature disconnect.
    timeout_milliseconds := 60000
  ) as request_id;
  $$
);
