import type { CheckIn, CreateCheckInInput, UpdateCheckInInput } from "../models/check-in";
import type { Observable, SyncableRepository } from "./common";

export interface CheckInRepository
  extends SyncableRepository<CheckIn, CreateCheckInInput, UpdateCheckInInput> {
  /**
   * Atomically flips a (habitId, date) between checked/unchecked: deletes it
   * if an active check-in exists for that day, creates one otherwise. Must be
   * used instead of a manual read-then-create/softDelete sequence — that
   * pattern race-conditions under rapid repeated calls (each call re-reads
   * before the prior write commits), producing duplicate rows for the same
   * day. See docs/roadmap.md's duplicate check-in bug note.
   * Returns the created CheckIn, or null if the day was unchecked.
   */
  toggle(habitId: string, date: string): Promise<CheckIn | null>;
  listByHabitAndRange(habitId: string, from: string, to: string): Promise<CheckIn[]>;
  /** All habits' check-ins for one calendar day — backs the Today screen. */
  listByDate(date: string): Promise<CheckIn[]>;
  /** Every non-deleted check-in across all habits — backs the Stats screen's week/month/year/all-time tiles. */
  listAll(): Promise<CheckIn[]>;
  /** Check-ins with a note or photo attached, newest first — backs the Journal screen. */
  listWithNotes(): Promise<CheckIn[]>;
  observeByHabit(habitId: string): Observable<readonly CheckIn[]>;
  observeByDate(date: string): Observable<readonly CheckIn[]>;
  /**
   * Reactive version of listAll() — fires whenever any check-in is created,
   * updated, or (soft-)deleted, anywhere in the app. Screens that derive
   * aggregates (Stats, Calendar, Report) should subscribe to this instead of
   * calling listAll() once, or they'll silently go stale after the first
   * render (see docs/architecture.md and the July 2026 "calendar/stats not
   * updating" fix).
   */
  observeAll(): Observable<readonly CheckIn[]>;
}
