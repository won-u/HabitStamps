-- Habit tracker sync schema for Supabase (Postgres + Auth + RLS).
-- This file is the canonical source; docs/supabase-schema.sql mirrors it for
-- users to paste into the Supabase SQL editor (see docs/architecture.md §5).

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

alter table public.habits enable row level security;
alter table public.check_ins enable row level security;

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

-- Batch upsert with server-side LWW: a row only overwrites the existing one
-- if its updated_at is strictly newer (mirrors apps/backend/src/db/upsert.ts's
-- policy — see docs/architecture.md §4-3/§5). Returns the ids that were
-- actually accepted; the caller treats every other requested id as a
-- conflict (the next pull brings down the winning server version).
create or replace function public.sync_upsert_habits(rows jsonb) returns uuid[]
language plpgsql security definer as $$
declare
  uid uuid := auth.uid();
  accepted uuid[] := '{}';
  r jsonb;
  did uuid;
begin
  if uid is null then raise exception 'not authenticated'; end if;

  for r in select * from jsonb_array_elements(rows) loop
    did := null;
    insert into public.habits (
      id, user_id, name, icon, color, category_id, frequency_type, frequency_config,
      is_archived, sort_order, created_at, updated_at, version, deleted_at
    )
    values (
      (r->>'id')::uuid, uid, r->>'name', r->>'icon', r->>'color',
      nullif(r->>'categoryId', '')::uuid, r->>'frequencyType',
      coalesce(r->'frequencyConfig', '{}'::jsonb),
      (r->>'isArchived')::boolean, (r->>'sortOrder')::integer,
      (r->>'createdAt')::timestamptz, (r->>'updatedAt')::timestamptz,
      (r->>'version')::integer, nullif(r->>'deletedAt', '')::timestamptz
    )
    on conflict (id) do update set
      name = excluded.name, icon = excluded.icon, color = excluded.color,
      category_id = excluded.category_id, frequency_type = excluded.frequency_type,
      frequency_config = excluded.frequency_config, is_archived = excluded.is_archived,
      sort_order = excluded.sort_order, updated_at = excluded.updated_at,
      version = excluded.version, deleted_at = excluded.deleted_at
    where public.habits.user_id = uid and public.habits.updated_at < excluded.updated_at
    returning id into did;

    if did is not null then
      accepted := array_append(accepted, did);
    end if;
  end loop;

  return accepted;
end;
$$;

grant select, insert, update on public.habits, public.check_ins to authenticated;

create or replace function public.sync_upsert_check_ins(rows jsonb) returns uuid[]
language plpgsql security definer as $$
declare
  uid uuid := auth.uid();
  accepted uuid[] := '{}';
  r jsonb;
  did uuid;
begin
  if uid is null then raise exception 'not authenticated'; end if;

  for r in select * from jsonb_array_elements(rows) loop
    did := null;
    insert into public.check_ins (
      id, user_id, habit_id, date, completed_at, note, photo_uri, value,
      created_at, updated_at, version, deleted_at
    )
    values (
      (r->>'id')::uuid, uid, (r->>'habitId')::uuid, (r->>'date')::date,
      (r->>'completedAt')::timestamptz, r->>'note', r->>'photoUri',
      nullif(r->>'value', '')::numeric,
      (r->>'createdAt')::timestamptz, (r->>'updatedAt')::timestamptz,
      (r->>'version')::integer, nullif(r->>'deletedAt', '')::timestamptz
    )
    on conflict (id) do update set
      habit_id = excluded.habit_id, date = excluded.date, completed_at = excluded.completed_at,
      note = excluded.note, photo_uri = excluded.photo_uri, value = excluded.value,
      updated_at = excluded.updated_at, version = excluded.version, deleted_at = excluded.deleted_at
    where public.check_ins.user_id = uid and public.check_ins.updated_at < excluded.updated_at
    returning id into did;

    if did is not null then
      accepted := array_append(accepted, did);
    end if;
  end loop;

  return accepted;
end;
$$;

grant execute on function public.sync_upsert_habits, public.sync_upsert_check_ins to authenticated;
