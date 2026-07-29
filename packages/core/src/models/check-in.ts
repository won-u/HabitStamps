import { z } from "zod";
import { baseSyncFieldsSchema, localSyncFieldsSchema } from "./base";

/**
 * date is a local calendar day ("YYYY-MM-DD"), deliberately separate from the
 * completedAt instant. Streak/calendar math keys off "which day was this for",
 * and an instant-only timestamp breaks at timezone/DST boundaries.
 */
export const checkInSchema = baseSyncFieldsSchema.extend({
  habitId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  completedAt: z.string(), // see base.ts for why this isn't z.string().datetime()
  note: z.string().max(2000).nullable(),
  photoUri: z.string().nullable(),
  /** quantitative habits (e.g. "8 glasses of water"); null for plain check/uncheck habits */
  value: z.number().nullable(),
});
export type CheckIn = z.infer<typeof checkInSchema>;

export const localCheckInSchema = checkInSchema.merge(localSyncFieldsSchema);
export type LocalCheckIn = z.infer<typeof localCheckInSchema>;

export const createCheckInInputSchema = checkInSchema
  .omit({ id: true, createdAt: true, updatedAt: true, version: true, deletedAt: true })
  .partial({ note: true, photoUri: true, value: true });
export type CreateCheckInInput = z.infer<typeof createCheckInInputSchema>;

export const updateCheckInInputSchema = createCheckInInputSchema.partial();
export type UpdateCheckInInput = z.infer<typeof updateCheckInInputSchema>;
