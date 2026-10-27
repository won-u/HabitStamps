import { describe, expect, it } from "vitest";
import { EMPTY_DENIM } from "../models/denim";
import { frequentWashLabel, getDenimStats } from "./denim-stats";

describe("getDenimStats", () => {
  it("counts the wears before the stamps and numbers a stamped wash by its wear", () => {
    const denim = { ...EMPTY_DENIM, priorWears: 100, washes: [{ atWear: 50, date: null, memo: "첫 소킹" }] };
    const stats = getDenimStats(denim, [
      { date: "2026-10-21", washed: false },
      { date: "2026-10-20", washed: true },
    ]);

    expect(stats.wears).toBe(102);
    expect(stats.washes).toBe(2);
    // 10-20 is the 101st wear (stamps count in date order), washed after it.
    expect(stats.log.map((w) => [w.atWear, w.fromStamp, w.writtenIndex])).toEqual([
      [50, false, 0],
      [101, true, null],
    ]);
    expect(stats.sinceWash).toBe(1);
  });

  it("counts every wear as since-wash when it was never washed", () => {
    expect(getDenimStats(EMPTY_DENIM, [{ date: "2026-10-01", washed: false }])).toMatchObject({
      wears: 1,
      washes: 0,
      sinceWash: 1,
    });
  });
});

describe("frequentWashLabel", () => {
  it("says from which wear and day 다세탁 began", () => {
    expect(frequentWashLabel({ ...EMPTY_DENIM, frequentWashAt: 200, frequentWashOn: "2026-03-01" })).toBe(
      "200회착 · 2026-03-01부터",
    );
    expect(frequentWashLabel({ ...EMPTY_DENIM, frequentWashOn: "2026-03-01" })).toBe("2026-03-01부터");
    expect(frequentWashLabel(EMPTY_DENIM)).toBe("");
  });
});
