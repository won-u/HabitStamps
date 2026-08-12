import type {
  CheckIn,
  CheckInRepository,
  CreateCheckInInput,
  Observable,
  UpdateCheckInInput,
} from "@habit-tracker/core";
import { getWebDb, type LocalCheckInRow } from "./web-db";
import { ObservableSet } from "./observable-set";

function toCheckIn({ syncStatus: _syncStatus, ...rest }: LocalCheckInRow): CheckIn {
  return rest;
}

export class LocalCheckInRepository implements CheckInRepository {
  private readonly changes = new ObservableSet<readonly CheckIn[]>();
  private readonly toggleLocks = new Map<string, Promise<unknown>>();

  async getById(id: string): Promise<CheckIn | null> {
    const db = await getWebDb();
    const row = await db.get("check_ins", id);
    return row ? toCheckIn(row) : null;
  }

  async create(input: CreateCheckInInput): Promise<CheckIn> {
    const db = await getWebDb();
    const now = new Date().toISOString();
    const row: LocalCheckInRow = {
      id: crypto.randomUUID(),
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
      syncStatus: "pending",
    };
    await db.put("check_ins", row);
    this.changes.notify();
    return toCheckIn(row);
  }

  async update(id: string, patch: UpdateCheckInInput): Promise<CheckIn> {
    const db = await getWebDb();
    const existing = await db.get("check_ins", id);
    if (!existing) throw new Error(`CheckIn ${id} not found`);
    const now = new Date().toISOString();
    const updatedRow: LocalCheckInRow = {
      ...existing,
      ...patch,
      updatedAt: now,
      version: existing.version + 1,
      syncStatus: "pending",
    };
    await db.put("check_ins", updatedRow);
    this.changes.notify();
    return toCheckIn(updatedRow);
  }

  async softDelete(id: string): Promise<void> {
    const db = await getWebDb();
    const existing = await db.get("check_ins", id);
    if (!existing) return;
    const now = new Date().toISOString();
    await db.put("check_ins", {
      ...existing,
      deletedAt: now,
      updatedAt: now,
      version: existing.version + 1,
      syncStatus: "pending",
    });
    this.changes.notify();
  }

  /**
   * Mirrors the native (SQLite) LocalCheckInRepository.toggle() — same
   * per-(habitId, date) in-memory lock and "clear every active row for the
   * day" self-healing, for the same reason (see the interface doc comment):
   * a naive read-then-write races under rapid repeated calls.
   */
  async toggle(habitId: string, date: string): Promise<CheckIn | null> {
    const key = `${habitId}:${date}`;
    const prior = this.toggleLocks.get(key) ?? Promise.resolve();
    const run = prior.then(
      () => this.toggleOnce(habitId, date),
      () => this.toggleOnce(habitId, date),
    );
    this.toggleLocks.set(
      key,
      run.catch(() => undefined),
    );
    return run;
  }

  private async toggleOnce(habitId: string, date: string): Promise<CheckIn | null> {
    const db = await getWebDb();
    const rowsForHabit = await db.getAllFromIndex("check_ins", "habitId", habitId);
    const active = rowsForHabit.filter((row) => row.date === date && !row.deletedAt);
    if (active.length === 0) {
      return this.create({ habitId, date, completedAt: new Date().toISOString() });
    }
    const now = new Date().toISOString();
    for (const row of active) {
      await db.put("check_ins", { ...row, deletedAt: now, updatedAt: now, version: row.version + 1, syncStatus: "pending" });
    }
    this.changes.notify();
    return null;
  }

  async listByHabitAndRange(habitId: string, from: string, to: string): Promise<CheckIn[]> {
    const db = await getWebDb();
    const rows = await db.getAllFromIndex("check_ins", "habitId", habitId);
    return rows.filter((row) => !row.deletedAt && row.date >= from && row.date <= to).map(toCheckIn);
  }

  async listByDate(date: string): Promise<CheckIn[]> {
    const db = await getWebDb();
    const rows = await db.getAllFromIndex("check_ins", "date", date);
    return rows.filter((row) => !row.deletedAt).map(toCheckIn);
  }

  async listAll(): Promise<CheckIn[]> {
    const db = await getWebDb();
    const rows = await db.getAll("check_ins");
    return rows.filter((row) => !row.deletedAt).map(toCheckIn);
  }

  observeByDate(date: string): Observable<readonly CheckIn[]> {
    return this.changes.observe(() => this.listByDate(date));
  }

  observeAll(): Observable<readonly CheckIn[]> {
    return this.changes.observe(() => this.listAll());
  }

  async listWithNotes(): Promise<CheckIn[]> {
    const db = await getWebDb();
    const rows = await db.getAll("check_ins");
    return rows
      .filter((row) => !row.deletedAt && (row.note || row.photoUri))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
      .map(toCheckIn);
  }

  observeByHabit(habitId: string): Observable<readonly CheckIn[]> {
    return this.changes.observe(async () => {
      const db = await getWebDb();
      const rows = await db.getAllFromIndex("check_ins", "habitId", habitId);
      return rows.filter((row) => !row.deletedAt).map(toCheckIn);
    });
  }

  async findPendingSync(): Promise<CheckIn[]> {
    const db = await getWebDb();
    const rows = await db.getAllFromIndex("check_ins", "syncStatus", "pending");
    return rows.map(toCheckIn);
  }

  async markSynced(ids: readonly string[], _syncedAt: string): Promise<void> {
    const db = await getWebDb();
    for (const id of ids) {
      const existing = await db.get("check_ins", id);
      if (existing) await db.put("check_ins", { ...existing, syncStatus: "synced" });
    }
  }

  async applyRemoteDeletes(ids: readonly string[]): Promise<void> {
    const db = await getWebDb();
    const now = new Date().toISOString();
    for (const id of ids) {
      const existing = await db.get("check_ins", id);
      if (existing) await db.put("check_ins", { ...existing, deletedAt: now, updatedAt: now, syncStatus: "synced" });
    }
    if (ids.length > 0) this.changes.notify();
  }

  async applyRemoteChanges(rows: readonly CheckIn[]): Promise<void> {
    const db = await getWebDb();
    for (const checkIn of rows) {
      const existing = await db.get("check_ins", checkIn.id);
      const incomingRow: LocalCheckInRow = { ...checkIn, syncStatus: "synced" };
      if (!existing || new Date(checkIn.updatedAt).getTime() >= new Date(existing.updatedAt).getTime()) {
        await db.put("check_ins", incomingRow);
      }
    }
    this.changes.notify();
  }
}
