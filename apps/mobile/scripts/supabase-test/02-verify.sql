-- Exercises the LWW upsert + RLS behavior end-to-end against the stubbed
-- auth schema, calling everything as the low-privilege `authenticated` role
-- (like a real Supabase client would via PostgREST) so RLS actually applies.
-- Every check raises an exception (visible as a psql ERROR) on failure, so
-- "no ERROR output, ends with ALL CHECKS PASSED" = all checks passed.

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'user-a@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'user-b@test.local')
on conflict do nothing;

set role authenticated;

-- === Check 1: fresh insert is accepted ===
select set_config('test.uid', '11111111-1111-1111-1111-111111111111', false);

do $$
declare
  result uuid[];
begin
  select public.sync_upsert_habits(
    '[{"id":"aaaaaaaa-0000-0000-0000-000000000001","name":"Stretching","icon":"💧","color":"#FF6B5E","categoryId":null,"frequencyType":"daily","frequencyConfig":{},"isArchived":false,"sortOrder":0,"createdAt":"2026-07-01T00:00:00.000Z","updatedAt":"2026-07-01T00:00:00.000Z","version":1,"deletedAt":null}]'::jsonb
  ) into result;

  if result <> array['aaaaaaaa-0000-0000-0000-000000000001'::uuid] then
    raise exception 'CHECK 1 FAILED: expected fresh insert to be accepted, got %', result;
  end if;
  raise notice 'CHECK 1 PASSED: fresh insert accepted';
end $$;

-- === Check 2: older updated_at is rejected (server wins, name stays unchanged) ===
do $$
declare
  result uuid[];
  stored_name text;
begin
  select public.sync_upsert_habits(
    '[{"id":"aaaaaaaa-0000-0000-0000-000000000001","name":"OLDER-SHOULD-NOT-APPLY","icon":"💧","color":"#FF6B5E","categoryId":null,"frequencyType":"daily","frequencyConfig":{},"isArchived":false,"sortOrder":0,"createdAt":"2026-07-01T00:00:00.000Z","updatedAt":"2026-06-30T00:00:00.000Z","version":1,"deletedAt":null}]'::jsonb
  ) into result;

  if array_length(result, 1) is not null then
    raise exception 'CHECK 2 FAILED: expected older write to be rejected, got %', result;
  end if;

  select name into stored_name from public.habits where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  if stored_name <> 'Stretching' then
    raise exception 'CHECK 2 FAILED: row was mutated by an older write, name=%', stored_name;
  end if;
  raise notice 'CHECK 2 PASSED: older write rejected, existing row untouched';
end $$;

-- === Check 3: newer updated_at is accepted (client wins) ===
do $$
declare
  result uuid[];
  stored_name text;
begin
  select public.sync_upsert_habits(
    '[{"id":"aaaaaaaa-0000-0000-0000-000000000001","name":"Stretching v2","icon":"💧","color":"#FF6B5E","categoryId":null,"frequencyType":"daily","frequencyConfig":{},"isArchived":false,"sortOrder":0,"createdAt":"2026-07-01T00:00:00.000Z","updatedAt":"2026-07-02T00:00:00.000Z","version":2,"deletedAt":null}]'::jsonb
  ) into result;

  if result <> array['aaaaaaaa-0000-0000-0000-000000000001'::uuid] then
    raise exception 'CHECK 3 FAILED: expected newer write to be accepted, got %', result;
  end if;

  select name into stored_name from public.habits where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  if stored_name <> 'Stretching v2' then
    raise exception 'CHECK 3 FAILED: row not updated, name=%', stored_name;
  end if;
  raise notice 'CHECK 3 PASSED: newer write accepted and applied';
end $$;

-- === Check 4: RLS blocks a different user from seeing user A's habit ===
select set_config('test.uid', '22222222-2222-2222-2222-222222222222', false);

do $$
declare
  visible_count integer;
begin
  select count(*) into visible_count from public.habits where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  if visible_count <> 0 then
    raise exception 'CHECK 4 FAILED: user B should not see user A''s habit, saw % rows', visible_count;
  end if;
  raise notice 'CHECK 4 PASSED: RLS isolates rows per user';
end $$;

-- === Check 5: user B cannot spoof user_id via the RPC (rows always land under auth.uid()) ===
do $$
declare
  owner uuid;
begin
  perform public.sync_upsert_habits(
    '[{"id":"bbbbbbbb-0000-0000-0000-000000000002","name":"User B habit","icon":"🏃","color":"#4FA8E8","categoryId":null,"frequencyType":"daily","frequencyConfig":{},"isArchived":false,"sortOrder":0,"createdAt":"2026-07-01T00:00:00.000Z","updatedAt":"2026-07-01T00:00:00.000Z","version":1,"deletedAt":null}]'::jsonb
  );
  select user_id into owner from public.habits where id = 'bbbbbbbb-0000-0000-0000-000000000002';
  if owner <> '22222222-2222-2222-2222-222222222222'::uuid then
    raise exception 'CHECK 5 FAILED: row owned by %, expected current auth.uid()', owner;
  end if;
  raise notice 'CHECK 5 PASSED: RPC always attributes rows to the caller''s auth.uid()';
end $$;

-- === Check 6: pull-style query (updated_at cursor) only returns the caller's rows ===
select set_config('test.uid', '11111111-1111-1111-1111-111111111111', false);

do $$
declare
  pulled_count integer;
begin
  select count(*) into pulled_count from public.habits
    where updated_at > '2026-01-01T00:00:00.000Z'::timestamptz;
  if pulled_count <> 1 then
    raise exception 'CHECK 6 FAILED: expected exactly 1 row (user A''s own habit) via RLS-scoped pull, got %', pulled_count;
  end if;
  raise notice 'CHECK 6 PASSED: pull query scoped correctly by RLS (1 row visible)';
end $$;

reset role;

\echo 'ALL CHECKS PASSED'
