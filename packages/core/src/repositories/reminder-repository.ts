import type { CreateReminderInput, Reminder, UpdateReminderInput } from "../models/reminder";
import type { SyncableRepository } from "./common";

export interface ReminderRepository
  extends SyncableRepository<Reminder, CreateReminderInput, UpdateReminderInput> {
  listByHabit(habitId: string): Promise<Reminder[]>;
  /** Device-local bookkeeping for the OS-scheduled notification id; never synced. */
  setLocalNotificationId(id: string, localNotificationId: string | null): Promise<void>;
}
