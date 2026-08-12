import type {
  Category,
  CheckIn,
  EntityChangeSet,
  Habit,
  SyncChangeSet,
  SyncGateway,
  SyncPullResult,
  SyncPushResult,
} from "@habit-tracker/core";
import { emptyEntityChangeSet } from "@habit-tracker/core";
import type { SupabaseClient } from "@supabase/supabase-js";

interface HabitRow {
  id: string;
  name: string;
  icon: string;
  color: string;
  category_id: string | null;
  frequency_type: string;
  frequency_config: Record<string, unknown>;
  is_archived: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  version: number;
  deleted_at: string | null;
}

interface CheckInRow {
  id: string;
  habit_id: string;
  date: string;
  completed_at: string;
  note: string | null;
  photo_uri: string | null;
  value: number | null;
  created_at: string;
  updated_at: string;
  version: number;
  deleted_at: string | null;
}

interface CategoryRow {
  id: string;
  name: string;
  color: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
  version: number;
  deleted_at: string | null;
}

function rowToHabit(row: HabitRow): Habit {
  return {
    id: row.id,
    name: row.name,
    icon: row.icon,
    color: row.color,
    categoryId: row.category_id,
    frequencyType: row.frequency_type as Habit["frequencyType"],
    frequencyConfig: row.frequency_config as Habit["frequencyConfig"],
    isArchived: row.is_archived,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    version: row.version,
    deletedAt: row.deleted_at,
  };
}

function rowToCheckIn(row: CheckInRow): CheckIn {
  return {
    id: row.id,
    habitId: row.habit_id,
    date: row.date,
    completedAt: row.completed_at,
    note: row.note,
    photoUri: row.photo_uri,
    value: row.value,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    version: row.version,
    deletedAt: row.deleted_at,
  };
}

function rowToCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    version: row.version,
    deletedAt: row.deleted_at,
  };
}

/**
 * Syncs via this app's one fixed Supabase project (Postgres + Auth + RLS) —
 * see docs/architecture.md §5. Works identically on iOS/Android/web (pure JS
 * client, no native module), unlike the CloudKit path this replaced which was
 * iOS-only.
 *
 * The RLS policies in docs/supabase-schema.sql scope every row to
 * `auth.uid()`, so `pull()`'s plain `.select()` only ever returns the signed-in
 * user's own rows without this gateway needing to filter by user id itself.
 *
 * `push()` calls the `sync_upsert_habits`/`sync_upsert_check_ins`/
 * `sync_upsert_categories` Postgres RPCs (docs/supabase-schema.sql) rather
 * than a plain `.upsert()` — a plain
 * upsert has no way to express "only overwrite if the incoming row is
 * newer", so the LWW comparison (matching the REST backend's policy,
 * architecture.md §4-3) is done server-side, atomically, in SQL. Each RPC
 * returns the ids it actually accepted; every other requested id is reported
 * as a conflict (the next pull() brings down the winning server version).
 */
export class SupabaseSyncGateway implements SyncGateway {
  constructor(private readonly client: SupabaseClient) {}

  async push(changes: SyncChangeSet): Promise<SyncPushResult> {
    const dirtyHabits = [...changes.habits.created, ...changes.habits.updated];
    const dirtyCheckIns = [...changes.checkIns.created, ...changes.checkIns.updated];
    const dirtyCategories = [...changes.categories.created, ...changes.categories.updated];
    const conflicts: string[] = [];
    const failedIds: string[] = [];

    // Each entity type's RPC call is independent — one failing (network drop,
    // transient error) must not stop the others from being pushed, and must
    // not prevent already-succeeded entity types from being marked synced by
    // SyncEngine. Previously a single `throw` here aborted the whole push(),
    // so an entity type that had already succeeded server-side never got
    // markSynced'd; the next push resent it unchanged, which the server's
    // strict `updated_at <` comparison then rejected as a permanent, never-
    // resolving "conflict" (see docs/code-review-2026-08-12.md Major #4).
    if (dirtyHabits.length > 0) {
      const { data, error } = await this.client.rpc("sync_upsert_habits", { rows: dirtyHabits });
      if (error) {
        failedIds.push(...dirtyHabits.map((habit) => habit.id));
      } else {
        const accepted = new Set((data ?? []) as string[]);
        for (const habit of dirtyHabits) if (!accepted.has(habit.id)) conflicts.push(habit.id);
      }
    }

    if (dirtyCheckIns.length > 0) {
      const { data, error } = await this.client.rpc("sync_upsert_check_ins", { rows: dirtyCheckIns });
      if (error) {
        failedIds.push(...dirtyCheckIns.map((checkIn) => checkIn.id));
      } else {
        const accepted = new Set((data ?? []) as string[]);
        for (const checkIn of dirtyCheckIns) if (!accepted.has(checkIn.id)) conflicts.push(checkIn.id);
      }
    }

    if (dirtyCategories.length > 0) {
      const { data, error } = await this.client.rpc("sync_upsert_categories", { rows: dirtyCategories });
      if (error) {
        failedIds.push(...dirtyCategories.map((category) => category.id));
      } else {
        const accepted = new Set((data ?? []) as string[]);
        for (const category of dirtyCategories) if (!accepted.has(category.id)) conflicts.push(category.id);
      }
    }

    return { acceptedAt: new Date().toISOString(), conflicts, failedIds };
  }

  async pull(sinceIso: string): Promise<SyncPullResult> {
    // The next pull's `since` is this call's returned serverTime, so it must
    // come from Postgres's clock (`sync_server_time()` RPC), not
    // `new Date()` (this device's clock). If this device's clock runs ahead
    // of real time, a client-clock watermark gets persisted into the future
    // (`composition/container.ts`'s `runSync` stores it verbatim) — every
    // subsequent `updated_at > since` pull query then permanently excludes
    // rows other devices push at the real time, with no error surfaced
    // (device clock drift causing a stuck "future" JWT `iat` has already
    // been observed on this project's emulator, docs/architecture.md §5-4).
    const [serverTimeResult, habitsResult, checkInsResult, categoriesResult] = await Promise.all([
      this.client.rpc("sync_server_time"),
      this.client.from("habits").select("*").gt("updated_at", sinceIso).order("updated_at"),
      this.client.from("check_ins").select("*").gt("updated_at", sinceIso).order("updated_at"),
      this.client.from("categories").select("*").gt("updated_at", sinceIso).order("updated_at"),
    ]);
    if (serverTimeResult.error) throw serverTimeResult.error;
    if (habitsResult.error) throw habitsResult.error;
    if (checkInsResult.error) throw checkInsResult.error;
    if (categoriesResult.error) throw categoriesResult.error;

    const habits = toEntityChangeSet(habitsResult.data as HabitRow[], rowToHabit);
    const checkIns = toEntityChangeSet(checkInsResult.data as CheckInRow[], rowToCheckIn);
    const categories = toEntityChangeSet(categoriesResult.data as CategoryRow[], rowToCategory);

    return { serverTime: serverTimeResult.data as string, changes: { habits, checkIns, categories } };
  }
}

function toEntityChangeSet<TRow, T extends { id: string; deletedAt: string | null }>(
  rows: TRow[],
  fromRow: (row: TRow) => T,
): EntityChangeSet<T> {
  const result = emptyEntityChangeSet<T>();
  for (const row of rows) {
    const entity = fromRow(row);
    // Soft-delete tombstones (deletedAt set), mirroring the REST backend
    // (architecture.md §4-3) — rows are never physically deleted.
    if (entity.deletedAt) result.deletedIds.push(entity.id);
    else result.updated.push(entity);
  }
  return result;
}
