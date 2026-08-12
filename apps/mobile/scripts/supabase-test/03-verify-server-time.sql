-- Verifies the sync_server_time() RPC added to fix the pull() watermark bug
-- (docs/code-review-2026-08-12.md, Critical #2): the client used to stamp
-- lastSyncedAt with its own Date.now(), so a fast device clock could poison
-- the watermark into the future and permanently stop pulling other devices'
-- changes. This RPC must (1) exist and be callable by the low-privilege
-- `authenticated` role exactly like the other sync RPCs, (2) return
-- Postgres's own clock regardless of anything the client claims its clock
-- is, and (3) have search_path pinned (it's security definer).
-- Run after 00-stub-auth.sql and docs/supabase-schema.sql.
-- "no ERROR output, ends with ALL CHECKS PASSED" = all checks passed.

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'user-a@test.local')
on conflict do nothing;

-- === Check 1: function exists, is security definer, with search_path pinned ===
do $$
declare
  is_definer boolean;
  cfg text[];
begin
  select prosecdef, proconfig into is_definer, cfg
  from pg_proc where proname = 'sync_server_time';

  if is_definer is null then
    raise exception 'CHECK 1 FAILED: public.sync_server_time() does not exist';
  end if;
  if not is_definer then
    raise exception 'CHECK 1 FAILED: expected security definer';
  end if;
  if cfg is null or not (cfg @> array['search_path=public, pg_temp']) then
    raise exception 'CHECK 1 FAILED: expected search_path pinned, got %', cfg;
  end if;
  raise notice 'CHECK 1 PASSED: function exists, security definer, search_path pinned (%)', cfg;
end $$;

set role authenticated;
select set_config('test.uid', '11111111-1111-1111-1111-111111111111', false);

-- === Check 2: callable by the authenticated role and returns a real timestamp ===
do $$
declare
  server_now timestamptz;
  drift interval;
begin
  select public.sync_server_time() into server_now;
  drift := abs(extract(epoch from (clock_timestamp() - server_now))) * interval '1 second';
  if server_now is null then
    raise exception 'CHECK 2 FAILED: sync_server_time() returned null';
  end if;
  if drift > interval '5 seconds' then
    raise exception 'CHECK 2 FAILED: returned time % is % away from wall clock, expected < 5s', server_now, drift;
  end if;
  raise notice 'CHECK 2 PASSED: returned % (within 5s of wall clock)', server_now;
end $$;

-- === Check 3: the RPC ignores the caller entirely — it cannot be skewed by
-- anything the client sends (there is no parameter to send). This is the
-- actual fix: pull() now asks Postgres for the time instead of trusting
-- `new Date()` on a device whose clock might be wrong. ===
do $$
begin
  if pg_get_function_identity_arguments('public.sync_server_time'::regproc) <> '' then
    raise exception 'CHECK 3 FAILED: sync_server_time() must take no arguments (a client-suppliable arg would reopen the same class of bug)';
  end if;
  raise notice 'CHECK 3 PASSED: takes no client-suppliable input, so no client-side clock value can influence it';
end $$;

reset role;

\echo 'ALL CHECKS PASSED'
