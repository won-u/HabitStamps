-- Verifies the fix for Major #5 (docs/code-review-2026-08-12.md): a single
-- malformed row in a sync_upsert_* batch (bad cast, corrupt data) must not
-- abort every other row in the same call. Run after 00-stub-auth.sql and
-- docs/supabase-schema.sql.

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'user-a@test.local')
on conflict do nothing;

set role authenticated;
select set_config('test.uid', '11111111-1111-1111-1111-111111111111', false);

do $$
declare
  result uuid[];
begin
  select public.sync_upsert_habits(
    '[
      {"id":"aaaaaaaa-0000-0000-0000-000000000001","name":"Good A","icon":"a","color":"#fff","categoryId":null,"frequencyType":"daily","frequencyConfig":{},"isArchived":false,"sortOrder":0,"createdAt":"2026-08-12T00:00:00.000Z","updatedAt":"2026-08-12T00:00:00.000Z","version":1,"deletedAt":null},
      {"id":"aaaaaaaa-0000-0000-0000-000000000002","name":"Malformed","icon":"b","color":"#fff","categoryId":null,"frequencyType":"daily","frequencyConfig":{},"isArchived":false,"sortOrder":"not-a-number","createdAt":"2026-08-12T00:00:00.000Z","updatedAt":"2026-08-12T00:00:00.000Z","version":1,"deletedAt":null},
      {"id":"aaaaaaaa-0000-0000-0000-000000000003","name":"Good C","icon":"c","color":"#fff","categoryId":null,"frequencyType":"daily","frequencyConfig":{},"isArchived":false,"sortOrder":0,"createdAt":"2026-08-12T00:00:00.000Z","updatedAt":"2026-08-12T00:00:00.000Z","version":1,"deletedAt":null}
    ]'::jsonb
  ) into result;

  if not (result @> array['aaaaaaaa-0000-0000-0000-000000000001'::uuid]) then
    raise exception 'CHECK 1 FAILED: expected the good row before the malformed one to be accepted, got %', result;
  end if;
  if result @> array['aaaaaaaa-0000-0000-0000-000000000002'::uuid] then
    raise exception 'CHECK 1 FAILED: the malformed row should never be accepted, got %', result;
  end if;
  if not (result @> array['aaaaaaaa-0000-0000-0000-000000000003'::uuid]) then
    raise exception 'CHECK 1 FAILED: expected the good row AFTER the malformed one to still be accepted (no batch-wide abort), got %', result;
  end if;
  raise notice 'CHECK 1 PASSED: malformed row skipped, both good rows accepted (result=%) — a WARNING for the malformed row should appear above', result;
end $$;

reset role;

\echo 'ALL CHECKS PASSED'
