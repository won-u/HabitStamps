import { describe, expect, it } from "vitest";
import { getPeriodCounts } from "./period-counts";

describe("getPeriodCounts", () => {
  it("returns all zeros when there are no check-ins", () => {
    expect(getPeriodCounts([], "2026-08-12")).toEqual({ thisWeek: 0, thisMonth: 0, thisYear: 0, allTime: 0 });
  });

  it("counts a date on the week's Sunday boundary as part of this week", () => {
    // 2026-08-09 is the Sunday starting the week containing 2026-08-12 (Wed).
    const result = getPeriodCounts(["2026-08-09"], "2026-08-12");
    expect(result.thisWeek).toBe(1);
  });

  it("excludes a date from the previous week (Saturday, one day before the week start)", () => {
    const result = getPeriodCounts(["2026-08-08"], "2026-08-12");
    expect(result.thisWeek).toBe(0);
    expect(result.thisMonth).toBe(1);
  });

  it("counts thisMonth/thisYear/allTime independently across the same date set", () => {
    const dates = ["2026-01-01", "2026-08-01", "2026-08-09", "2026-08-12", "2025-12-31"];
    const result = getPeriodCounts(dates, "2026-08-12");
    expect(result.thisWeek).toBe(2); // 08-09, 08-12
    expect(result.thisMonth).toBe(3); // 08-01, 08-09, 08-12
    expect(result.thisYear).toBe(4); // everything except 2025-12-31
    expect(result.allTime).toBe(5);
  });

  it("does not dedupe repeated dates (counts every check-in row passed in)", () => {
    const result = getPeriodCounts(["2026-08-12", "2026-08-12"], "2026-08-12");
    expect(result.thisWeek).toBe(2);
    expect(result.allTime).toBe(2);
  });
});
