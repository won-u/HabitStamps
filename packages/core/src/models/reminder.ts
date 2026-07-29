import { z } from "zod";
import { baseSyncFieldsSchema, localSyncFieldsSchema } from "./base";

export const reminderSchema = baseSyncFieldsSchema.extend({
  habitId: z.string().uuid(),
  /** "HH:mm", 24h local time */
  timeOfDay: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
  daysOfWeek: z.array(z.number().int().min(0).max(6)),
  isEnabled: z.boolean(),
});
export type Reminder = z.infer<typeof reminderSchema>;

/**
 * localNotificationId is the OS-scheduled notification id and is device-specific,
 * so it is never part of the synced entity — it lives only on the local row,
 * alongside syncStatus.
 */
export const localReminderSchema = reminderSchema.merge(localSyncFieldsSchema).extend({
  localNotificationId: z.string().nullable(),
});
export type LocalReminder = z.infer<typeof localReminderSchema>;

export const createReminderInputSchema = reminderSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  version: true,
  deletedAt: true,
});
export type CreateReminderInput = z.infer<typeof createReminderInputSchema>;

export const updateReminderInputSchema = createReminderInputSchema.partial();
export type UpdateReminderInput = z.infer<typeof updateReminderInputSchema>;
