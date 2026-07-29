import type { CreateHabitInput, Habit, UpdateHabitInput } from "../models/habit";
import type { Observable, SyncableRepository } from "./common";

export interface HabitRepository
  extends SyncableRepository<Habit, CreateHabitInput, UpdateHabitInput> {
  list(filter?: { includeArchived?: boolean }): Promise<Habit[]>;
  observe(filter?: { includeArchived?: boolean }): Observable<readonly Habit[]>;
}
