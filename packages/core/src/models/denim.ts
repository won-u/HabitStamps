import { z } from "zod";

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** A wash written down by wear number ("100회착에 세탁"), mostly from before the stamps. */
export const denimWashSchema = z.object({
  /** washed after this many wears */
  atWear: z.number().int().min(1).max(10000),
  date: ymd.nullable(),
  memo: z.string().max(200),
});
export type DenimWash = z.infer<typeof denimWashSchema>;

/**
 * What makes a habit a pair of jeans (or any denim): wears that happened
 * before the habit's stamps, washes written down by wear number, and when
 * 다세탁 (washing freely, after the raw/one-wash stage) began. A day's own
 * wash is the check-in's `washed` flag. Personal Hermes reads the same
 * shape (its closet's prior_wears / closet_washes / frequent_wash_*).
 */
export const denimInfoSchema = z.object({
  priorWears: z.number().int().min(0).max(10000),
  washes: z.array(denimWashSchema).max(500),
  frequentWashAt: z.number().int().min(0).max(10000).nullable(),
  frequentWashOn: ymd.nullable(),
});
export type DenimInfo = z.infer<typeof denimInfoSchema>;

export const EMPTY_DENIM: DenimInfo = { priorWears: 0, washes: [], frequentWashAt: null, frequentWashOn: null };
