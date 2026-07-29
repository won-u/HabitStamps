import { z } from "zod";
import { baseSyncFieldsSchema, localSyncFieldsSchema } from "./base";

export const frequencyTypeSchema = z.enum(["daily", "weekdays", "timesPerWeek", "timesPerMonth"]);
export type FrequencyType = z.infer<typeof frequencyTypeSchema>;

export const frequencyConfigSchema = z.object({
  /** 0 = Sunday ... 6 = Saturday, only meaningful when frequencyType === "weekdays" */
  weekdays: z.array(z.number().int().min(0).max(6)).optional(),
  /** only meaningful when frequencyType === "timesPerWeek" */
  timesPerWeek: z.number().int().min(1).max(7).optional(),
  /** only meaningful when frequencyType === "timesPerMonth" */
  timesPerMonth: z.number().int().min(1).max(31).optional(),
});
export type FrequencyConfig = z.infer<typeof frequencyConfigSchema>;

export const habitSchema = baseSyncFieldsSchema.extend({
  name: z.string().min(1).max(30),
  icon: z.string(),
  color: z.string(),
  categoryId: z.string().uuid().nullable(),
  frequencyType: frequencyTypeSchema,
  frequencyConfig: frequencyConfigSchema,
  isArchived: z.boolean(),
  sortOrder: z.number().int(),
});
export type Habit = z.infer<typeof habitSchema>;

/** Row shape as persisted locally: adds the local-only syncStatus bookkeeping field. */
export const localHabitSchema = habitSchema.merge(localSyncFieldsSchema);
export type LocalHabit = z.infer<typeof localHabitSchema>;

export const createHabitInputSchema = habitSchema
  .omit({ id: true, createdAt: true, updatedAt: true, version: true, deletedAt: true })
  .partial({ isArchived: true, sortOrder: true, categoryId: true });
export type CreateHabitInput = z.infer<typeof createHabitInputSchema>;

export const updateHabitInputSchema = createHabitInputSchema.partial();
export type UpdateHabitInput = z.infer<typeof updateHabitInputSchema>;
