-- Denim columns survive older clients, and the read-only export returns only
-- the token owner's rows. Run after 00-stub-auth.sql and docs/supabase-schema.sql
-- (twice: the schema must be safe to re-run). Same convention as 02-verify.sql:
-- any failed check raises; success ends with ALL CHECKS PASSED.

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'user-a@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'user-b@test.local')
on conflict do nothing;

set role authenticated;
select set_config('test.uid', '11111111-1111-1111-1111-111111111111', false);

do $$
declare
  stored jsonb;
begin
  perform public.sync_upsert_habits(
    '[{"id":"dddddddd-0000-0000-0000-000000000001","name":"제라도 301EXX","icon":"👖","color":"#3B5BDB","categoryId":null,"frequencyType":"daily","frequencyConfig":{},"isArchived":false,"sortOrder":0,"denim":{"priorWears":100,"washes":[{"atWear":50,"date":null,"memo":"첫 소킹"}],"frequentWashAt":null,"frequentWashOn":null},"createdAt":"2026-10-01T00:00:00Z","updatedAt":"2026-10-01T00:00:00Z","version":1,"deletedAt":null}]'::jsonb);
  -- An older app renames it without knowing `denim`.
  perform public.sync_upsert_habits(
    '[{"id":"dddddddd-0000-0000-0000-000000000001","name":"제라도 301","icon":"👖","color":"#3B5BDB","categoryId":null,"frequencyType":"daily","frequencyConfig":{},"isArchived":false,"sortOrder":0,"createdAt":"2026-10-01T00:00:00Z","updatedAt":"2026-10-02T00:00:00Z","version":2,"deletedAt":null}]'::jsonb);
  select denim into stored from public.habits where id = 'dddddddd-0000-0000-0000-000000000001';
  if stored->>'priorWears' <> '100' then
    raise exception 'CHECK 1 FAILED: an old client wiped denim: %', stored;
  end if;
  -- A new app turns denim off on purpose.
  perform public.sync_upsert_habits(
    '[{"id":"dddddddd-0000-0000-0000-000000000001","name":"제라도 301","icon":"👖","color":"#3B5BDB","categoryId":null,"frequencyType":"daily","frequencyConfig":{},"isArchived":false,"sortOrder":0,"denim":null,"createdAt":"2026-10-01T00:00:00Z","updatedAt":"2026-10-03T00:00:00Z","version":3,"deletedAt":null}]'::jsonb);
  select denim into stored from public.habits where id = 'dddddddd-0000-0000-0000-000000000001';
  if stored is not null then
    raise exception 'CHECK 1 FAILED: an explicit null did not clear denim: %', stored;
  end if;
  raise notice 'CHECK 1 PASSED: denim kept from old clients, cleared on purpose';
end $$;

do $$
declare
  was boolean;
begin
  perform public.sync_upsert_check_ins(
    '[{"id":"eeeeeeee-0000-0000-0000-000000000001","habitId":"dddddddd-0000-0000-0000-000000000001","date":"2026-10-20","completedAt":"2026-10-20T09:00:00Z","note":null,"photoUri":null,"value":null,"washed":true,"createdAt":"2026-10-20T09:00:00Z","updatedAt":"2026-10-20T09:00:00Z","version":1,"deletedAt":null}]'::jsonb);
  perform public.sync_upsert_check_ins(
    '[{"id":"eeeeeeee-0000-0000-0000-000000000001","habitId":"dddddddd-0000-0000-0000-000000000001","date":"2026-10-20","completedAt":"2026-10-20T09:00:00Z","note":"좋았음","photoUri":null,"value":null,"createdAt":"2026-10-20T09:00:00Z","updatedAt":"2026-10-21T09:00:00Z","version":2,"deletedAt":null}]'::jsonb);
  select washed into was from public.check_ins where id = 'eeeeeeee-0000-0000-0000-000000000001';
  if not was then raise exception 'CHECK 2 FAILED: an old client wiped washed'; end if;
  raise notice 'CHECK 2 PASSED: washed kept from old clients';
end $$;

-- User B has a habit of their own.
select set_config('test.uid', '22222222-2222-2222-2222-222222222222', false);
select public.sync_upsert_habits(
  '[{"id":"dddddddd-0000-0000-0000-0000000000b0","name":"수영","icon":"🏊","color":"#000","categoryId":null,"frequencyType":"daily","frequencyConfig":{},"isArchived":false,"sortOrder":0,"createdAt":"2026-10-01T00:00:00Z","updatedAt":"2026-10-01T00:00:00Z","version":1,"deletedAt":null}]'::jsonb);

select set_config('test.uid', '11111111-1111-1111-1111-111111111111', false);
select set_config('test.token', public.create_export_token(), false);

do $$
begin
  if public.export_token_created_at() is null then
    raise exception 'CHECK 3 FAILED: no token recorded';
  end if;
  begin
    perform count(*) from public.export_tokens;
    if (select count(*) from public.export_tokens) <> 0 then
      raise exception 'CHECK 3 FAILED: a client can read export_tokens';
    end if;
  exception when insufficient_privilege then
    null; -- also fine: not readable at all
  end;
  raise notice 'CHECK 3 PASSED: token made, its table not readable';
end $$;

reset role;
set role anon;
select set_config('test.uid', '', false);

do $$
declare
  first jsonb;
  later jsonb;
begin
  first := public.export_since(current_setting('test.token'), null);
  if jsonb_array_length(first->'habits') <> 1
     or first->'habits'->0->>'id' <> 'dddddddd-0000-0000-0000-000000000001'
     or first->'habits'->0 ? 'user_id'
     or jsonb_array_length(first->'check_ins') <> 1
     or (first->'check_ins'->0->>'washed')::boolean is not true then
    raise exception 'CHECK 4 FAILED: export is not exactly user A''s rows: %', first;
  end if;
  later := public.export_since(current_setting('test.token'), (first->>'server_time')::timestamptz);
  if jsonb_array_length(later->'habits') <> 0 or jsonb_array_length(later->'check_ins') <> 0 then
    raise exception 'CHECK 4 FAILED: nothing changed but the export returned rows: %', later;
  end if;
  raise notice 'CHECK 4 PASSED: export returns the owner''s rows, then only changes';
end $$;

do $$
begin
  begin
    perform public.export_since('not-a-token', null);
    raise exception 'CHECK 5 FAILED: a wrong token exported something';
  exception when invalid_authorization_specification then
    null;
  end;
  begin
    perform public.create_export_token();
    raise exception 'CHECK 5 FAILED: anon could make a token';
  exception when insufficient_privilege then
    null;
  end;
  raise notice 'CHECK 5 PASSED: wrong tokens and anon token-making are refused';
end $$;

reset role;
select set_config('test.uid', '11111111-1111-1111-1111-111111111111', false);
set role authenticated;
select public.revoke_export_token();
reset role;
set role anon;
do $$
begin
  begin
    perform public.export_since(current_setting('test.token'), null);
    raise exception 'CHECK 6 FAILED: a revoked token still exports';
  exception when invalid_authorization_specification then
    null;
  end;
  raise notice 'CHECK 6 PASSED: revoking stops the export';
end $$;

reset role;
do $$ begin raise notice 'ALL CHECKS PASSED'; end $$;
