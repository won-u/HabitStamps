import { z } from "zod";
import { baseSyncFieldsSchema, localSyncFieldsSchema } from "./base";

export const categorySchema = baseSyncFieldsSchema.extend({
  name: z.string().min(1).max(30),
  color: z.string(),
  sortOrder: z.number().int(),
});
export type Category = z.infer<typeof categorySchema>;

export const localCategorySchema = categorySchema.merge(localSyncFieldsSchema);
export type LocalCategory = z.infer<typeof localCategorySchema>;

export const createCategoryInputSchema = categorySchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  version: true,
  deletedAt: true,
});
export type CreateCategoryInput = z.infer<typeof createCategoryInputSchema>;

export const updateCategoryInputSchema = createCategoryInputSchema.partial();
export type UpdateCategoryInput = z.infer<typeof updateCategoryInputSchema>;
