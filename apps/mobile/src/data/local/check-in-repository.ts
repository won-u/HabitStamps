import { and, between, desc, eq, isNotNull, isNull, or } from "drizzle-orm";
import { randomUUID } from "expo-crypto";
import type {
  CheckIn,
  CheckInRepository,
  CreateCheckInInput,
  Observable,
  UpdateCheckInInput,
} from "@habit-tracker/core";
import { db } from "./client";
import { checkIns } from "./schema";
import { ObservableSet } from "./observable-set";

type CheckInRow = typeof checkIns.$inferSelect;

function toCheckIn({ syncStatus: _syncStatus, ...rest }: CheckInRow): CheckIn {
  return rest;
}

export class LocalCheckInRepository implements CheckInRepository {
  private readonly changes = new ObservableSet<readonly CheckIn[]>();
  private readonly toggleLocks = new Map<string, Promise<unknown>>();

  async getById(id: string): Promise<CheckIn | null> {
    const [row] = await db.select().from(checkIns).where(eq(checkIns.id, id)).limit(1);
    return row ? toCheckIn(row) : null;
  }

  /**
   * Serializes toggles for the same (habitId, date) so a rapid repeat call
   * (double tap, animation re-fire) waits for the prior one to finish instead
   * of racing it — see the interface doc comment for why the naive
   * read-then-write sequence corrupts data.
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
    const rows = await db
      .select()
      .from(checkIns)
      .where(and(eq(checkIns.habitId, habitId), eq(checkIns.date, date)));
    const active = rows.filter((row) => !row.deletedAt);
    if (active.length === 0) {
      return this.create({ habitId, date, completedAt: new Date().toISOString() });
    }
    // Soft-delete every active row for the day, not just one — self-heals any
    // duplicate rows a past race already created instead of leaving the
    // "extra" ones stuck looking checked forever.
    const now = new Date().toISOString();
    for (const row of active) {
      await db
        .update(checkIns)
        .set({ deletedAt: now, updatedAt: now, version: row.version + 1, syncStatus: "pending" })
        .where(eq(checkIns.id, row.id));
    }
    this.changes.notify();
    return null;
  }

  async create(input: CreateCheckInInput): Promise<CheckIn> {
    const now = new Date().toISOString();
    const row: CheckInRow = {
      id: randomUUID(),
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
    await db.insert(checkIns).values(row);
    this.changes.notify();
    return toCheckIn(row);
  }

  async update(id: string, patch: UpdateCheckInInput): Promise<CheckIn> {
    const [existing] = await db.select().from(checkIns).where(eq(checkIns.id, id)).limit(1);
    if (!existing) throw new Error(`CheckIn ${id} not found`);
    const now = new Date().toISOString();
    const updatedRow: CheckInRow = {
      ...existing,
      ...patch,
      updatedAt: now,
      version: existing.version + 1,
      syncStatus: "pending",
    };
    await db.update(checkIns).set(updatedRow).where(eq(checkIns.id, id));
    this.changes.notify();
    return toCheckIn(updatedRow);
  }

  async softDelete(id: string): Promise<void> {
    const [existing] = await db.select().from(checkIns).where(eq(checkIns.id, id)).limit(1);
    if (!existing) return;
    const now = new Date().toISOString();
    await db
      .update(checkIns)
      .set({ deletedAt: now, updatedAt: now, version: existing.version + 1, syncStatus: "pending" })
      .where(eq(checkIns.id, id));
    this.changes.notify();
  }

  async listByHabitAndRange(habitId: string, from: string, to: string): Promise<CheckIn[]> {
    const rows = await db
      .select()
      .from(checkIns)
      .where(and(eq(checkIns.habitId, habitId), between(checkIns.date, from, to)));
    return rows.filter((row) => !row.deletedAt).map(toCheckIn);
  }

  async listByDate(date: string): Promise<CheckIn[]> {
    const rows = await db.select().from(checkIns).where(eq(checkIns.date, date));
    return rows.filter((row) => !row.deletedAt).map(toCheckIn);
  }

  async listAll(): Promise<CheckIn[]> {
    const rows = await db.select().from(checkIns);
    return rows.filter((row) => !row.deletedAt).map(toCheckIn);
  }

  observeByDate(date: string): Observable<readonly CheckIn[]> {
    return this.changes.observe(() => this.listByDate(date));
  }

  observeAll(): Observable<readonly CheckIn[]> {
    return this.changes.observe(() => this.listAll());
  }

  async listWithNotes(): Promise<CheckIn[]> {
    const rows = await db
      .select()
      .from(checkIns)
      .where(or(isNotNull(checkIns.note), isNotNull(checkIns.photoUri)))
      .orderBy(desc(checkIns.date));
    return rows.filter((row) => !row.deletedAt).map(toCheckIn);
  }

  observeByHabit(habitId: string): Observable<readonly CheckIn[]> {
    return this.changes.observe(async () => {
      const rows = await db.select().from(checkIns).where(eq(checkIns.habitId, habitId));
      return rows.filter((row) => !row.deletedAt).map(toCheckIn);
    });
  }

  async findPendingSync(): Promise<CheckIn[]> {
    const rows = await db.select().from(checkIns).where(eq(checkIns.syncStatus, "pending"));
    return rows.map(toCheckIn);
  }

  async markSynced(ids: readonly string[], _syncedAt: string): Promise<void> {
    for (const id of ids) {
      await db.update(checkIns).set({ syncStatus: "synced" }).where(eq(checkIns.id, id));
    }
  }

  async applyRemoteDeletes(ids: readonly string[]): Promise<void> {
    const now = new Date().toISOString();
    for (const id of ids) {
      await db.update(checkIns).set({ deletedAt: now, updatedAt: now, syncStatus: "synced" }).where(eq(checkIns.id, id));
    }
    if (ids.length > 0) this.changes.notify();
  }

  async applyRemoteChanges(rows: readonly CheckIn[]): Promise<void> {
    for (const checkIn of rows) {
      const [existing] = await db.select().from(checkIns).where(eq(checkIns.id, checkIn.id)).limit(1);
      if (!existing) {
        await this.insertRemoteCheckIn(checkIn);
      } else if (new Date(checkIn.updatedAt).getTime() >= new Date(existing.updatedAt).getTime()) {
        await db.update(checkIns).set({ ...checkIn, syncStatus: "synced" }).where(eq(checkIns.id, checkIn.id));
      }
    }
    this.changes.notify();
  }

  /**
   * Inserts a check-in `pull()` brought down for the first time. If this
   * device independently created its own active check-in for the same
   * (habitId, date) — e.g. two devices offline on the same day — the
   * incoming row already won server-side (docs/supabase-schema.sql's
   * sync_upsert_check_ins rejects the loser as a UNIQUE-constraint conflict),
   * so this device's row is retired: any note/photo/value it has that the
   * incoming row lacks is carried over, the local row is soft-deleted, and
   * the merged row is marked `pending` (only when the merge actually changed
   * something) so that content reaches the server too on the next push.
   */
  private async insertRemoteCheckIn(checkIn: CheckIn): Promise<void> {
    const conflicting = await db
      .select()
      .from(checkIns)
      .where(and(eq(checkIns.habitId, checkIn.habitId), eq(checkIns.date, checkIn.date), isNull(checkIns.deletedAt)));

    if (conflicting.length === 0) {
      await db.insert(checkIns).values({ ...checkIn, syncStatus: "synced" });
      return;
    }

    const now = new Date().toISOString();
    for (const row of conflicting) {
      await db
        .update(checkIns)
        .set({ deletedAt: now, updatedAt: now, version: row.version + 1, syncStatus: "pending" })
        .where(eq(checkIns.id, row.id));
    }

    const loser = conflicting[0]!;
    const note = checkIn.note ?? loser.note;
    const photoUri = checkIn.photoUri ?? loser.photoUri;
    const value = checkIn.value ?? loser.value;
    const needsPush = note !== checkIn.note || photoUri !== checkIn.photoUri || value !== checkIn.value;

    const row: CheckInRow = {
      ...checkIn,
      note,
      photoUri,
      value,
      updatedAt: needsPush ? now : checkIn.updatedAt,
      version: needsPush ? checkIn.version + 1 : checkIn.version,
      syncStatus: needsPush ? "pending" : "synced",
    };
    await db.insert(checkIns).values(row);
  }
}
