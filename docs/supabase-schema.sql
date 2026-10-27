-- Habit tracker sync schema for Supabase (Postgres + Auth + RLS).
-- Paste this whole file into the Supabase project's SQL editor and run it
-- once (Dashboard > SQL Editor > New query) — see docs/architecture.md §5.
-- Verified against a local Postgres with a stubbed auth schema:
-- apps/mobile/scripts/supabase-test/{00-stub-auth,01-schema,02-verify}.sql.

create table if not exists public.habits (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  icon text not null,
  color text not null,
  category_id uuid,
  frequency_type text not null,
  frequency_config jsonb not null default '{}'::jsonb,
  is_archived boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  version integer not null default 1,
  deleted_at timestamptz
);
create index if not exists habits_user_updated_idx on public.habits (user_id, updated_at);

create table if not exists public.check_ins (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  habit_id uuid not null,
  date date not null,
  completed_at timestamptz not null,
  note text,
  photo_uri text,
  value numeric,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  version integer not null default 1,
  deleted_at timestamptz
);
create index if not exists check_ins_user_updated_idx on public.check_ins (user_id, updated_at);

-- Same self-heal cleanup as the local SQLite migration
-- (apps/mobile/drizzle/0002_*.sql) — a device that hit the check-in
-- duplication race (docs/architecture.md §3-2) could already have pushed
-- more than one active row for the same (habit_id, date). Run once, before
-- the UNIQUE index below, so it doesn't fail to create against pre-existing
-- duplicates. Safe to re-run: once no duplicates remain, this affects 0 rows.
with duplicates as (
  select id, row_number() over (partition by habit_id, date order by created_at asc, id asc) as rn
  from public.check_ins
  where deleted_at is null
)
update public.check_ins
set deleted_at = now(), updated_at = now(), version = version + 1
where id in (select id from duplicates where rn > 1);

-- One active check-in per habit per day, mirroring the local SQLite schema
-- (apps/mobile/src/data/local/schema.ts). toggle()'s in-memory lock already
-- prevents this on a single device; this is the backstop for two devices
-- independently creating a check-in for the same day while offline, then
-- both pushing — sync_upsert_check_ins below treats the resulting conflict
-- as a normal per-row conflict instead of failing the whole batch, and the
-- losing device reconciles it via applyRemoteChanges on its next pull.
create unique index if not exists check_ins_habit_date_unique_idx on public.check_ins (habit_id, date) where deleted_at is null;

create table if not exists public.categories (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  version integer not null default 1,
  deleted_at timestamptz
);
create index if not exists categories_user_updated_idx on public.categories (user_id, updated_at);

-- Denim habits (2026-10): a habit's wear/wash details (packages/core
-- models/denim.ts) and whether a day's wear was washed. Older app versions
-- don't send these keys — the upserts below keep the stored value when a key
-- is missing, so an old install still in use never wipes them.
alter table public.habits add column if not exists denim jsonb;
alter table public.check_ins add column if not exists washed boolean not null default false;

-- When the server last saw a write, set by the trigger below. updated_at is
-- the writing device's clock, so a device that was offline can push a change
-- "from the past"; a reader that needs every change since some point (the
-- read-only export at the end of this file) uses this column instead.
alter table public.habits add column if not exists server_updated_at timestamptz not null default now();
alter table public.check_ins add column if not exists server_updated_at timestamptz not null default now();
alter table public.categories add column if not exists server_updated_at timestamptz not null default now();
create index if not exists habits_user_server_updated_idx on public.habits (user_id, server_updated_at);
create index if not exists check_ins_user_server_updated_idx on public.check_ins (user_id, server_updated_at);
create index if not exists categories_user_server_updated_idx on public.categories (user_id, server_updated_at);

create or replace function public.touch_server_updated_at() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.server_updated_at := clock_timestamp();
  return new;
end;
$$;

drop trigger if exists habits_touch_server_updated_at on public.habits;
create trigger habits_touch_server_updated_at before insert or update on public.habits
  for each row execute function public.touch_server_updated_at();
drop trigger if exists check_ins_touch_server_updated_at on public.check_ins;
create trigger check_ins_touch_server_updated_at before insert or update on public.check_ins
  for each row execute function public.touch_server_updated_at();
drop trigger if exists categories_touch_server_updated_at on public.categories;
create trigger categories_touch_server_updated_at before insert or update on public.categories
  for each row execute function public.touch_server_updated_at();

alter table public.habits enable row level security;
alter table public.check_ins enable row level security;
alter table public.categories enable row level security;

drop policy if exists habits_select_own on public.habits;
create policy habits_select_own on public.habits for select using (user_id = auth.uid());
drop policy if exists habits_insert_own on public.habits;
create policy habits_insert_own on public.habits for insert with check (user_id = auth.uid());
drop policy if exists habits_update_own on public.habits;
create policy habits_update_own on public.habits for update using (user_id = auth.uid());

drop policy if exists check_ins_select_own on public.check_ins;
create policy check_ins_select_own on public.check_ins for select using (user_id = auth.uid());
drop policy if exists check_ins_insert_own on public.check_ins;
create policy check_ins_insert_own on public.check_ins for insert with check (user_id = auth.uid());
drop policy if exists check_ins_update_own on public.check_ins;
create policy check_ins_update_own on public.check_ins for update using (user_id = auth.uid());

drop policy if exists categories_select_own on public.categories;
create policy categories_select_own on public.categories for select using (user_id = auth.uid());
drop policy if exists categories_insert_own on public.categories;
create policy categories_insert_own on public.categories for insert with check (user_id = auth.uid());
drop policy if exists categories_update_own on public.categories;
create policy categories_update_own on public.categories for update using (user_id = auth.uid());

-- Returns Postgres's own clock so the client can use it as the next pull's
-- watermark instead of its own (possibly skewed) clock — see the comment on
-- `pull()` in apps/mobile/src/data/sync/supabase-sync-gateway.ts for why a
-- client-clock watermark can permanently stop a device from receiving other
-- devices' changes.
create or replace function public.sync_server_time() returns timestamptz
language sql stable security definer
set search_path = public, pg_temp
as $$
  select now();
$$;

grant execute on function public.sync_server_time to authenticated;

-- Batch upsert with server-side LWW: a row only overwrites the existing one
-- if its updated_at is strictly newer (mirrors apps/backend/src/db/upsert.ts's
-- policy — see docs/architecture.md §4-3/§5). Returns the ids that were
-- actually accepted; the caller treats every other requested id as a
-- conflict (the next pull brings down the winning server version).
create or replace function public.sync_upsert_habits(rows jsonb) returns uuid[]
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
  accepted uuid[] := '{}';
  r jsonb;
  did uuid;
begin
  if uid is null then raise exception 'not authenticated'; end if;

  for r in select * from jsonb_array_elements(rows) loop
    did := null;
    -- Nested block: one malformed row (bad cast, corrupt frequency_config,
    -- etc.) must not abort every other row already queued in this batch —
    -- see docs/code-review-2026-08-12.md Major #5. The row is simply left
    -- unaccepted (the client treats it as a conflict and keeps retrying it
    -- until its data is fixed); everything else in the batch still commits.
    begin
      insert into public.habits (
        id, user_id, name, icon, color, category_id, frequency_type, frequency_config,
        is_archived, sort_order, denim, created_at, updated_at, version, deleted_at
      )
      values (
        (r->>'id')::uuid, uid, r->>'name', r->>'icon', r->>'color',
        nullif(r->>'categoryId', '')::uuid, r->>'frequencyType',
        coalesce(r->'frequencyConfig', '{}'::jsonb),
        (r->>'isArchived')::boolean, (r->>'sortOrder')::integer,
        nullif(r->'denim', 'null'::jsonb),
        (r->>'createdAt')::timestamptz, (r->>'updatedAt')::timestamptz,
        (r->>'version')::integer, nullif(r->>'deletedAt', '')::timestamptz
      )
      on conflict (id) do update set
        name = excluded.name, icon = excluded.icon, color = excluded.color,
        category_id = excluded.category_id, frequency_type = excluded.frequency_type,
        frequency_config = excluded.frequency_config, is_archived = excluded.is_archived,
        sort_order = excluded.sort_order, updated_at = excluded.updated_at,
        version = excluded.version, deleted_at = excluded.deleted_at,
        -- An older app version doesn't know `denim`: keep what is stored.
        denim = case when r ? 'denim' then excluded.denim else public.habits.denim end
      where public.habits.user_id = uid and public.habits.updated_at < excluded.updated_at
      returning id into did;
    exception when others then
      raise warning 'sync_upsert_habits: skipping row % (%): %', r->>'id', sqlstate, sqlerrm;
      did := null;
    end;

    if did is not null then
      accepted := array_append(accepted, did);
    end if;
  end loop;

  return accepted;
end;
$$;

grant select, insert, update on public.habits, public.check_ins, public.categories to authenticated;

create or replace function public.sync_upsert_check_ins(rows jsonb) returns uuid[]
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
  accepted uuid[] := '{}';
  r jsonb;
  did uuid;
begin
  if uid is null then raise exception 'not authenticated'; end if;

  for r in select * from jsonb_array_elements(rows) loop
    did := null;
    -- Nested block: a unique_violation here means another (already-accepted)
    -- row occupies this (habit_id, date) — most likely two devices created a
    -- check-in for the same day while both offline. Catching it keeps this
    -- one row as an ordinary conflict (the pushing device's next pull will
    -- reconcile it, see apps/mobile/.../check-in-repository.ts's
    -- applyRemoteChanges) instead of aborting every other row in this batch.
    -- `others` is caught too for the same reason as sync_upsert_habits
    -- (docs/code-review-2026-08-12.md Major #5) — any other malformed row
    -- (bad cast, etc.) shouldn't abort the rest of the batch either.
    begin
      insert into public.check_ins (
        id, user_id, habit_id, date, completed_at, note, photo_uri, value, washed,
        created_at, updated_at, version, deleted_at
      )
      values (
        (r->>'id')::uuid, uid, (r->>'habitId')::uuid, (r->>'date')::date,
        (r->>'completedAt')::timestamptz, r->>'note', r->>'photoUri',
        nullif(r->>'value', '')::numeric, coalesce((r->>'washed')::boolean, false),
        (r->>'createdAt')::timestamptz, (r->>'updatedAt')::timestamptz,
        (r->>'version')::integer, nullif(r->>'deletedAt', '')::timestamptz
      )
      on conflict (id) do update set
        habit_id = excluded.habit_id, date = excluded.date, completed_at = excluded.completed_at,
        note = excluded.note, photo_uri = excluded.photo_uri, value = excluded.value,
        updated_at = excluded.updated_at, version = excluded.version, deleted_at = excluded.deleted_at,
        -- An older app version doesn't know `washed`: keep what is stored.
        washed = case when r ? 'washed' then excluded.washed else public.check_ins.washed end
      where public.check_ins.user_id = uid and public.check_ins.updated_at < excluded.updated_at
      returning id into did;
    exception
      when unique_violation then
        did := null;
      when others then
        raise warning 'sync_upsert_check_ins: skipping row % (%): %', r->>'id', sqlstate, sqlerrm;
        did := null;
    end;

    if did is not null then
      accepted := array_append(accepted, did);
    end if;
  end loop;

  return accepted;
end;
$$;

create or replace function public.sync_upsert_categories(rows jsonb) returns uuid[]
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
  accepted uuid[] := '{}';
  r jsonb;
  did uuid;
begin
  if uid is null then raise exception 'not authenticated'; end if;

  for r in select * from jsonb_array_elements(rows) loop
    did := null;
    -- Same per-row isolation as sync_upsert_habits/sync_upsert_check_ins —
    -- see docs/code-review-2026-08-12.md Major #5.
    begin
      insert into public.categories (
        id, user_id, name, color, sort_order, created_at, updated_at, version, deleted_at
      )
      values (
        (r->>'id')::uuid, uid, r->>'name', r->>'color', (r->>'sortOrder')::integer,
        (r->>'createdAt')::timestamptz, (r->>'updatedAt')::timestamptz,
        (r->>'version')::integer, nullif(r->>'deletedAt', '')::timestamptz
      )
      on conflict (id) do update set
        name = excluded.name, color = excluded.color, sort_order = excluded.sort_order,
        updated_at = excluded.updated_at, version = excluded.version, deleted_at = excluded.deleted_at
      where public.categories.user_id = uid and public.categories.updated_at < excluded.updated_at
      returning id into did;
    exception when others then
      raise warning 'sync_upsert_categories: skipping row % (%): %', r->>'id', sqlstate, sqlerrm;
      did := null;
    end;

    if did is not null then
      accepted := array_append(accepted, did);
    end if;
  end loop;

  return accepted;
end;
$$;

grant execute on function public.sync_upsert_habits, public.sync_upsert_check_ins, public.sync_upsert_categories to authenticated;

-- === Read-only export (2026-10) ===========================================
-- Lets another app of the same user (Personal Hermes, a self-hosted assistant)
-- keep a copy of their habits without their Google session or the service
-- key. The user makes a token in Settings; only its sha256 is stored. The
-- export function returns that user's rows only, read-only, and nothing
-- else in this project. Making a new token replaces the old one; revoking
-- deletes it.
create table if not exists public.export_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now()
);
-- No policies: clients never read this table, only the functions below do.
alter table public.export_tokens enable row level security;

create or replace function public.create_export_token() returns text
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
  token text;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  -- gen_random_uuid() draws from pg_strong_random: two of them = 244 random bits.
  token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.export_tokens (user_id, token_hash)
  values (uid, encode(sha256(convert_to(token, 'UTF8')), 'hex'))
  on conflict (user_id) do update set token_hash = excluded.token_hash, created_at = now();
  return token;
end;
$$;

create or replace function public.revoke_export_token() returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  delete from public.export_tokens where user_id = auth.uid();
end;
$$;

create or replace function public.export_token_created_at() returns timestamptz
language sql stable security definer
set search_path = public, pg_temp
as $$
  select created_at from public.export_tokens where user_id = auth.uid();
$$;

-- Every row of the token's user changed after `since` (server_updated_at, so
-- late pushes from offline devices are not missed), or all of them when
-- `since` is null. `server_time` is the next call's `since`; a reader should
-- step back a few minutes from it, since a write still in flight when this
-- ran can commit with an earlier server_updated_at.
create or replace function public.export_since(token text, since timestamptz default null) returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid;
  started timestamptz := clock_timestamp();
begin
  select user_id into uid from public.export_tokens
  where token_hash = encode(sha256(convert_to(coalesce(token, ''), 'UTF8')), 'hex');
  if uid is null then raise exception 'invalid export token' using errcode = '28000'; end if;

  return jsonb_build_object(
    'server_time', started,
    'habits', coalesce((
      select jsonb_agg(to_jsonb(h) - 'user_id') from public.habits h
      where h.user_id = uid and (since is null or h.server_updated_at > since)
    ), '[]'::jsonb),
    'check_ins', coalesce((
      select jsonb_agg(to_jsonb(c) - 'user_id') from public.check_ins c
      where c.user_id = uid and (since is null or c.server_updated_at > since)
    ), '[]'::jsonb),
    'categories', coalesce((
      select jsonb_agg(to_jsonb(g) - 'user_id') from public.categories g
      where g.user_id = uid and (since is null or g.server_updated_at > since)
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.create_export_token, public.revoke_export_token,
  public.export_token_created_at, public.export_since from public;
-- Supabase grants anon execute on new public functions by default: take it back.
revoke execute on function public.create_export_token, public.revoke_export_token,
  public.export_token_created_at from anon;
grant execute on function public.create_export_token, public.revoke_export_token,
  public.export_token_created_at to authenticated;
-- The other app calls with the public anon key plus the token.
grant execute on function public.export_since to anon, authenticated;
