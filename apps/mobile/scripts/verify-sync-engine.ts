/**
 * Standalone verification for SyncEngine + RestSyncGateway against a live
 * apps/backend instance, WITHOUT needing a simulator/device (expo-sqlite only
 * runs inside the Expo runtime, so this uses plain in-memory fake
 * repositories that satisfy the same @habit-tracker/core interfaces the real
 * LocalHabitRepository/LocalCheckInRepository implement).
 *
 * This exercises the exact same SyncEngine/RestSyncGateway classes the app
 * uses — it substitutes only the storage layer. It complements, but does not
 * replace, actually running the app on a device per docs/architecture.md §4-5.
 *
 * Usage: BACKEND_URL=http://localhost:4000 DEVICE_TOKEN=local-dev-token npx tsx scripts/verify-sync-engine.ts
 */
import { randomUUID } from "crypto";
import type {
  CheckIn,
  CheckInRepository,
  CreateCheckInInput,
  CreateHabitInput,
  Habit,
  HabitRepository,
  Observable,
  UpdateCheckInInput,
  UpdateHabitInput,
} from "@habit-tracker/core";
import { RestSyncGateway } from "../src/data/sync/rest-sync-gateway";
import { SyncEngine } from "../src/data/sync/sync-engine";

type Row<T> = T & { syncStatus: "synced" | "pending" | "conflict" };

class InMemoryRepo<T extends { id: string; updatedAt: string }, TCreate, TUpdate> {
  rows = new Map<string, Row<T>>();

  constructor(private readonly buildNew: (id: string, now: string, input: TCreate) => T) {}

  async getById(id: string): Promise<T | null> {
    const row = this.rows.get(id);
    if (!row) return null;
    const { syncStatus: _syncStatus, ...rest } = row;
    return rest as unknown as T;
  }

  async create(input: TCreate): Promise<T> {
    const now = new Date().toISOString();
    const entity = this.buildNew(randomUUID(), now, input);
    this.rows.set(entity.id, { ...entity, syncStatus: "pending" });
    return entity;
  }

  async update(id: string, patch: TUpdate): Promise<T> {
    const existing = this.rows.get(id);
    if (!existing) throw new Error(`${id} not found`);
    const updated: Row<T> = { ...existing, ...(patch as object), updatedAt: new Date().toISOString(), syncStatus: "pending" } as Row<T>;
    this.rows.set(id, updated);
    const { syncStatus: _syncStatus, ...rest } = updated;
    return rest as unknown as T;
  }

  async softDelete(id: string): Promise<void> {
    const existing = this.rows.get(id);
    if (!existing) return;
    this.rows.set(id, { ...existing, deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), syncStatus: "pending" } as Row<T>);
  }

  async findPendingSync(): Promise<T[]> {
    return [...this.rows.values()]
      .filter((row) => row.syncStatus === "pending")
      .map(({ syncStatus: _syncStatus, ...rest }) => rest as unknown as T);
  }

  async markSynced(ids: readonly string[], _syncedAt: string): Promise<void> {
    for (const id of ids) {
      const row = this.rows.get(id);
      if (row) this.rows.set(id, { ...row, syncStatus: "synced" });
    }
  }

  async applyRemoteChanges(rows: readonly T[]): Promise<void> {
    for (const incoming of rows) {
      const existing = this.rows.get(incoming.id);
      if (!existing || new Date(incoming.updatedAt).getTime() >= new Date(existing.updatedAt).getTime()) {
        this.rows.set(incoming.id, { ...incoming, syncStatus: "synced" });
      }
    }
  }

  async applyRemoteDeletes(ids: readonly string[]): Promise<void> {
    for (const id of ids) {
      const existing = this.rows.get(id);
      if (existing) this.rows.set(id, { ...existing, deletedAt: new Date().toISOString(), syncStatus: "synced" });
    }
  }
}

function noopObservable<T>(getSnapshot: () => T): Observable<T> {
  return { subscribe: (cb) => { cb(getSnapshot()); return () => {}; } };
}

function makeHabitRepository(): HabitRepository {
  const repo = new InMemoryRepo<Habit, CreateHabitInput, UpdateHabitInput>((id, now, input) => ({
    id,
    name: input.name,
    icon: input.icon,
    color: input.color,
    categoryId: input.categoryId ?? null,
    frequencyType: input.frequencyType,
    frequencyConfig: input.frequencyConfig,
    isArchived: input.isArchived ?? false,
    sortOrder: input.sortOrder ?? 0,
    createdAt: now,
    updatedAt: now,
    version: 1,
    deletedAt: null,
  }));
  return {
    getById: (id) => repo.getById(id),
    create: (input) => repo.create(input),
    update: (id, patch) => repo.update(id, patch),
    softDelete: (id) => repo.softDelete(id),
    findPendingSync: () => repo.findPendingSync(),
    markSynced: (ids, syncedAt) => repo.markSynced(ids, syncedAt),
    applyRemoteChanges: (rows) => repo.applyRemoteChanges(rows),
    applyRemoteDeletes: (ids) => repo.applyRemoteDeletes(ids),
    list: async () => [...repo.rows.values()].filter((r) => !r.deletedAt).map(({ syncStatus: _s, ...rest }) => rest as Habit),
    observe: () => noopObservable(() => [...repo.rows.values()].map(({ syncStatus: _s, ...rest }) => rest as Habit)),
  };
}

function makeCheckInRepository(): CheckInRepository {
  const repo = new InMemoryRepo<CheckIn, CreateCheckInInput, UpdateCheckInInput>((id, now, input) => ({
    id,
    habitId: input.habitId,
    date: input.date,
    completedAt: input.completedAt,
    note: input.note ?? null,
    photoUri: input.photoUri ?? null,
    value: input.value ?? null,
    createdAt: now,
    updatedAt: now,
    version: 1,
    deletedAt: null,
  }));
  return {
    getById: (id) => repo.getById(id),
    create: (input) => repo.create(input),
    update: (id, patch) => repo.update(id, patch),
    softDelete: (id) => repo.softDelete(id),
    findPendingSync: () => repo.findPendingSync(),
    markSynced: (ids, syncedAt) => repo.markSynced(ids, syncedAt),
    applyRemoteChanges: (rows) => repo.applyRemoteChanges(rows),
    applyRemoteDeletes: (ids) => repo.applyRemoteDeletes(ids),
    getByHabitAndDate: async (habitId, date) => {
      const found = [...repo.rows.values()].find((r) => r.habitId === habitId && r.date === date && !r.deletedAt);
      if (!found) return null;
      const { syncStatus: _syncStatus, ...rest } = found;
      return rest;
    },
    listByHabitAndRange: async (habitId, from, to) =>
      [...repo.rows.values()].filter((r) => r.habitId === habitId && r.date >= from && r.date <= to && !r.deletedAt),
    listByDate: async (date) => [...repo.rows.values()].filter((r) => r.date === date && !r.deletedAt),
    listAll: async () => [...repo.rows.values()].filter((r) => !r.deletedAt),
    listWithNotes: async () => [...repo.rows.values()].filter((r) => (r.note || r.photoUri) && !r.deletedAt),
    observeByHabit: (habitId) => noopObservable(() => [...repo.rows.values()].filter((r) => r.habitId === habitId)),
    observeByDate: (date) => noopObservable(() => [...repo.rows.values()].filter((r) => r.date === date)),
    observeAll: () => noopObservable(() => [...repo.rows.values()].filter((r) => !r.deletedAt)),
  };
}

async function main() {
  const baseUrl = process.env.BACKEND_URL ?? "http://localhost:4000";
  const deviceToken = process.env.DEVICE_TOKEN ?? "local-dev-token";
  const epoch = new Date(0).toISOString();

  console.log(`\n=== Device A: create habit + check-in locally, then sync ===`);
  const deviceA = { habits: makeHabitRepository(), checkIns: makeCheckInRepository() };
  const habit = await deviceA.habits.create({
    name: "검증용 스트레칭",
    icon: "🧘",
    color: "#2FBFA0",
    categoryId: null,
    frequencyType: "daily",
    frequencyConfig: {},
    isArchived: false,
    sortOrder: 0,
  });
  const today = new Date().toISOString().slice(0, 10);
  await deviceA.checkIns.create({
    habitId: habit.id,
    date: today,
    completedAt: new Date().toISOString(),
    note: "sync-engine 검증 스크립트가 생성함",
  });

  const engineA = new SyncEngine(deviceA.habits, deviceA.checkIns, new RestSyncGateway(baseUrl, deviceToken));
  const pushResult = await engineA.syncNow(epoch);
  console.log("Device A syncNow() result:", pushResult);
  if (pushResult.pushedHabits !== 1 || pushResult.pushedCheckIns !== 1) {
    throw new Error(`expected to push 1 habit + 1 check-in, got ${JSON.stringify(pushResult)}`);
  }
  if (pushResult.conflicts.length > 0) {
    throw new Error(`unexpected conflicts: ${pushResult.conflicts.join(", ")}`);
  }

  console.log(`\n=== Device B: fresh local state, pull from the same backend ===`);
  const deviceB = { habits: makeHabitRepository(), checkIns: makeCheckInRepository() };
  const engineB = new SyncEngine(deviceB.habits, deviceB.checkIns, new RestSyncGateway(baseUrl, deviceToken));
  const pullResult = await engineB.syncNow(epoch);
  console.log("Device B syncNow() result:", pullResult);

  const pulledHabit = await deviceB.habits.getById(habit.id);
  if (!pulledHabit || pulledHabit.name !== "검증용 스트레칭") {
    throw new Error("Device B did not receive Device A's habit via pull");
  }
  const pulledCheckIns = await deviceB.checkIns.listByHabitAndRange(habit.id, today, today);
  if (pulledCheckIns.length !== 1) {
    throw new Error("Device B did not receive Device A's check-in via pull");
  }
  console.log("✓ Device B correctly received Device A's habit + check-in via pull");

  console.log(`\n=== Device A: soft-delete the check-in, sync, then Device B pulls the tombstone ===`);
  const [checkIn] = pulledCheckIns;
  await deviceA.checkIns.softDelete((await deviceA.checkIns.listByHabitAndRange(habit.id, today, today))[0]!.id);
  const deleteAckAt = (await engineA.syncNow(pushResult.serverTime)).serverTime;
  const pullAfterDelete = await engineB.syncNow(pullResult.serverTime);
  console.log("Device B pull-after-delete result:", pullAfterDelete);
  const stillThere = await deviceB.checkIns.listByHabitAndRange(habit.id, today, today);
  if (stillThere.length !== 0) {
    throw new Error("Device B still sees the check-in after Device A soft-deleted it");
  }
  console.log("✓ Device B correctly soft-deleted the check-in after pulling the tombstone");
  void checkIn;
  void deleteAckAt;

  console.log("\n✅ All sync-engine verifications passed against", baseUrl);
}

main().catch((err) => {
  console.error("\n❌ Verification failed:", err);
  process.exit(1);
});
