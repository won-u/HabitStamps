-- Verifies the fix for Major #1 (docs/code-review-2026-08-12.md): two check-ins
-- pushed in the same batch for the same (habit_id, date) but with different
-- ids (the "two devices, both offline, same day" scenario) must not abort
-- the whole sync_upsert_check_ins call — the second one should be reported
-- as an ordinary conflict, and an unrelated third row in the same batch must
-- still be accepted normally.
-- Run after 00-stub-auth.sql and docs/supabase-schema.sql.

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'user-a@test.local')
on conflict do nothing;

set role authenticated;
select set_config('test.uid', '11111111-1111-1111-1111-111111111111', false);

do $$
declare
  result uuid[];
begin
  select public.sync_upsert_check_ins(
    '[
      {"id":"aaaaaaaa-0000-0000-0000-000000000001","habitId":"bbbbbbbb-0000-0000-0000-000000000001","date":"2026-08-12","completedAt":"2026-08-12T09:00:00.000Z","note":null,"photoUri":null,"value":null,"createdAt":"2026-08-12T09:00:00.000Z","updatedAt":"2026-08-12T09:00:00.000Z","version":1,"deletedAt":null},
      {"id":"aaaaaaaa-0000-0000-0000-000000000002","habitId":"bbbbbbbb-0000-0000-0000-000000000001","date":"2026-08-12","completedAt":"2026-08-12T09:05:00.000Z","note":null,"photoUri":null,"value":null,"createdAt":"2026-08-12T09:05:00.000Z","updatedAt":"2026-08-12T09:05:00.000Z","version":1,"deletedAt":null},
      {"id":"aaaaaaaa-0000-0000-0000-000000000003","habitId":"cccccccc-0000-0000-0000-000000000002","date":"2026-08-12","completedAt":"2026-08-12T09:00:00.000Z","note":null,"photoUri":null,"value":null,"createdAt":"2026-08-12T09:00:00.000Z","updatedAt":"2026-08-12T09:00:00.000Z","version":1,"deletedAt":null}
    ]'::jsonb
  ) into result;

  if not (result @> array['aaaaaaaa-0000-0000-0000-000000000001'::uuid]) then
    raise exception 'CHECK 1 FAILED: expected the first of the two colliding rows to be accepted, got %', result;
  end if;
  if result @> array['aaaaaaaa-0000-0000-0000-000000000002'::uuid] then
    raise exception 'CHECK 1 FAILED: expected the second colliding row to be rejected as a conflict, got %', result;
  end if;
  if not (result @> array['aaaaaaaa-0000-0000-0000-000000000003'::uuid]) then
    raise exception 'CHECK 1 FAILED: expected the unrelated third row in the same batch to still be accepted (no batch-wide abort), got %', result;
  end if;
  raise notice 'CHECK 1 PASSED: colliding row rejected as a conflict, batch continued, unrelated row accepted (result=%)', result;
end $$;

do $$
declare
  active_count integer;
begin
  select count(*) into active_count
  from public.check_ins
  where habit_id = 'bbbbbbbb-0000-0000-0000-000000000001' and date = '2026-08-12' and deleted_at is null;
  if active_count <> 1 then
    raise exception 'CHECK 2 FAILED: expected exactly 1 active check-in for the contested (habit_id, date), got %', active_count;
  end if;
  raise notice 'CHECK 2 PASSED: exactly one active row survives for the contested (habit_id, date)';
end $$;

reset role;

\echo 'ALL CHECKS PASSED'
