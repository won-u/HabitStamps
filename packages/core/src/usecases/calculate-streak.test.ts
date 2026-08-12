import { describe, expect, it } from "vitest";
import { calculateStreak } from "./calculate-streak";

describe("calculateStreak — daily", () => {
  it("returns all zeros/nulls when there are no check-ins", () => {
    expect(calculateStreak([], "2026-08-12")).toEqual({
      current: 0,
      longest: 0,
      currentRange: null,
      longestRange: null,
    });
  });

  it("counts a single check-in on today as a streak of 1", () => {
    const result = calculateStreak(["2026-08-12"], "2026-08-12", "daily");
    expect(result.current).toBe(1);
    expect(result.longest).toBe(1);
    expect(result.currentRange).toEqual({ start: "2026-08-12", end: "2026-08-12" });
  });

  it("tolerates today not yet being checked in (grace), counting through yesterday", () => {
    const dates = ["2026-08-09", "2026-08-10", "2026-08-11"];
    const result = calculateStreak(dates, "2026-08-12", "daily");
    expect(result.current).toBe(3);
    expect(result.currentRange).toEqual({ start: "2026-08-09", end: "2026-08-11" });
  });

  it("resets current to 0 when neither today nor yesterday is checked in", () => {
    const dates = ["2026-08-05", "2026-08-06"];
    const result = calculateStreak(dates, "2026-08-12", "daily");
    expect(result.current).toBe(0);
    expect(result.currentRange).toBeNull();
  });

  it("breaks the streak on a calendar-day gap", () => {
    const dates = ["2026-08-01", "2026-08-02", "2026-08-04", "2026-08-05"];
    const result = calculateStreak(dates, "2026-08-05", "daily");
    expect(result.current).toBe(2);
    expect(result.currentRange).toEqual({ start: "2026-08-04", end: "2026-08-05" });
  });

  it("tracks the longest run separately from the trailing current run", () => {
    // 5-day run (08-01..08-05), gap, then a 2-day trailing run ending today.
    const dates = ["2026-08-01", "2026-08-02", "2026-08-03", "2026-08-04", "2026-08-05", "2026-08-09", "2026-08-10"];
    const result = calculateStreak(dates, "2026-08-10", "daily");
    expect(result.current).toBe(2);
    expect(result.longest).toBe(5);
    expect(result.longestRange).toEqual({ start: "2026-08-01", end: "2026-08-05" });
  });

  it("dedupes repeated dates instead of inflating the streak", () => {
    const result = calculateStreak(["2026-08-12", "2026-08-12", "2026-08-11"], "2026-08-12", "daily");
    expect(result.current).toBe(2);
  });

  it("reflects a live streak that is now the record in `longest` too", () => {
    const dates = ["2026-08-01", "2026-08-10", "2026-08-11", "2026-08-12"];
    const result = calculateStreak(dates, "2026-08-12", "daily");
    expect(result.current).toBe(3);
    expect(result.longest).toBe(3);
    expect(result.longestRange).toEqual({ start: "2026-08-10", end: "2026-08-12" });
  });

  it("defaults to daily semantics when frequencyType/frequencyConfig are omitted", () => {
    const result = calculateStreak(["2026-08-11", "2026-08-12"], "2026-08-12");
    expect(result.current).toBe(2);
  });
});

describe("calculateStreak — weekdays (Mon/Wed/Fri)", () => {
  const weekdays = [1, 3, 5]; // Mon, Wed, Fri
  const config = { weekdays };

  it("does not break the streak on unscheduled days (Tue/Thu/Sat/Sun)", () => {
    // Mon 07-27, Wed 07-29, Fri 07-31, Mon 08-03, Wed 08-05, Fri 08-07, Mon 08-10, Wed 08-12 (today).
    const dates = ["2026-07-27", "2026-07-29", "2026-07-31", "2026-08-03", "2026-08-05", "2026-08-07", "2026-08-10", "2026-08-12"];
    const result = calculateStreak(dates, "2026-08-12", "weekdays", config);
    expect(result.current).toBe(17); // day-span 07-27..08-12, gaps included
    expect(result.currentRange).toEqual({ start: "2026-07-27", end: "2026-08-12" });
  });

  it("breaks the streak when a scheduled day is missed", () => {
    // Same as above but 08-05 (Wed) was missed — the run resumes at 08-06
    // (Thu, unscheduled) since only 08-05 itself was a required-and-missed day.
    const dates = ["2026-07-27", "2026-07-29", "2026-07-31", "2026-08-03", "2026-08-07", "2026-08-10", "2026-08-12"];
    const result = calculateStreak(dates, "2026-08-12", "weekdays", config);
    expect(result.current).toBe(7); // 08-06..08-12
    expect(result.currentRange).toEqual({ start: "2026-08-06", end: "2026-08-12" });
  });

  it("extends the streak through an unscheduled today without requiring a check-in", () => {
    // today = Tue 2026-08-11 (not scheduled); Mon 08-10 was checked.
    const result = calculateStreak(["2026-08-10"], "2026-08-11", "weekdays", config);
    expect(result.current).toBe(2); // 08-10, 08-11
    expect(result.currentRange).toEqual({ start: "2026-08-10", end: "2026-08-11" });
  });

  it("tolerates a scheduled-but-not-yet-checked today (grace), but does not extend past the earliest check-in ever recorded", () => {
    // today = Wed 2026-08-12 (scheduled, not checked yet); Mon 08-10 was checked
    // and is the *only* check-in this habit has — there's no data before it to
    // justify counting further back through 08-09/08-08.
    const result = calculateStreak(["2026-08-10"], "2026-08-12", "weekdays", config);
    expect(result.current).toBe(2); // 08-10(Mon, checked)..08-11(Tue, unscheduled)
    expect(result.currentRange).toEqual({ start: "2026-08-10", end: "2026-08-11" });
  });

  it("breaks immediately when a scheduled today is missed and no earlier scheduled day was met either", () => {
    const result = calculateStreak([], "2026-08-12", "weekdays", config);
    expect(result.current).toBe(0);
    expect(result.currentRange).toBeNull();
  });

  it("falls back to treating every day as scheduled when weekdays is empty (malformed config)", () => {
    const dates = ["2026-08-11", "2026-08-12"];
    const result = calculateStreak(dates, "2026-08-12", "weekdays", { weekdays: [] });
    expect(result.current).toBe(2);
  });
});

describe("calculateStreak — timesPerWeek", () => {
  const config = { timesPerWeek: 3 };

  it("keeps the streak alive through an in-progress current week that hasn't hit target yet", () => {
    // Last full week (Sun 08-02..Sat 08-08): 3 check-ins (meets target).
    // This week (Sun 08-09..Sat 08-15, today = Wed 08-12): 1 check-in so far.
    const dates = ["2026-08-03", "2026-08-05", "2026-08-07", "2026-08-11"];
    const result = calculateStreak(dates, "2026-08-12", "timesPerWeek", config);
    expect(result.current).toBe(11); // 08-02..08-12
    expect(result.currentRange).toEqual({ start: "2026-08-02", end: "2026-08-12" });
  });

  it("breaks the streak when a fully-elapsed week misses the target", () => {
    // Last week only has 2 check-ins (target 3) — streak resets to this week's progress only.
    const dates = ["2026-08-03", "2026-08-05", "2026-08-11"];
    const result = calculateStreak(dates, "2026-08-12", "timesPerWeek", config);
    expect(result.current).toBe(4); // this week's start (08-09) .. today (08-12)
    expect(result.currentRange).toEqual({ start: "2026-08-09", end: "2026-08-12" });
  });

  it("current is 0 when the current week has no check-ins and the prior week failed", () => {
    const dates = ["2026-08-03", "2026-08-05"]; // last week, only 2 (misses target 3)
    const result = calculateStreak(dates, "2026-08-12", "timesPerWeek", config);
    expect(result.current).toBe(0);
    expect(result.currentRange).toBeNull();
  });

  it("keeps a fully in-progress current week from breaking a streak that would otherwise still be alive", () => {
    // Three consecutive qualifying weeks (07-19..08-08); today (08-12) falls in
    // the following week, which has no check-ins yet — but since that week
    // isn't over, it doesn't break the chain, so current stays alive through today.
    const dates = ["2026-07-19", "2026-07-21", "2026-07-23", "2026-07-26", "2026-07-28", "2026-07-30", "2026-08-02", "2026-08-04", "2026-08-06"];
    const result = calculateStreak(dates, "2026-08-12", "timesPerWeek", config);
    expect(result.current).toBe(25); // 07-19..08-12
    expect(result.longest).toBe(25); // the live streak is now the record too
    expect(result.longestRange).toEqual({ start: "2026-07-19", end: "2026-08-12" });
  });

  it("tracks the longest run of qualifying weeks after a fully-elapsed week actually breaks the streak", () => {
    // Same three qualifying weeks (07-19..08-08), then week 08-09..08-15 misses
    // target (only 1 check-in) and is now fully in the past — today (08-19) is
    // in the *next* week, which has no check-ins yet.
    const dates = [
      "2026-07-19",
      "2026-07-21",
      "2026-07-23",
      "2026-07-26",
      "2026-07-28",
      "2026-07-30",
      "2026-08-02",
      "2026-08-04",
      "2026-08-06",
      "2026-08-10",
    ];
    const result = calculateStreak(dates, "2026-08-19", "timesPerWeek", config);
    expect(result.current).toBe(0);
    expect(result.longest).toBe(21); // 07-19..08-08
    expect(result.longestRange).toEqual({ start: "2026-07-19", end: "2026-08-08" });
  });
});

describe("calculateStreak — timesPerMonth", () => {
  const config = { timesPerMonth: 2 };

  it("keeps the streak alive across a month boundary when both months meet target", () => {
    // July: 2 check-ins (meets target). August so far (today = 08-12): 1 check-in.
    // The range is anchored to the month boundary (07-01), not the first
    // actual check-in (07-10) — a qualifying month counts in full once its
    // target is met, the same way a qualifying week does.
    const dates = ["2026-07-10", "2026-07-20", "2026-08-05"];
    const result = calculateStreak(dates, "2026-08-12", "timesPerMonth", config);
    expect(result.current).toBe(daysBetween("2026-07-01", "2026-08-12"));
    expect(result.currentRange).toEqual({ start: "2026-07-01", end: "2026-08-12" });
  });

  it("breaks the streak when the prior month misses target", () => {
    const dates = ["2026-07-10", "2026-08-05"]; // July only has 1 (target 2)
    const result = calculateStreak(dates, "2026-08-12", "timesPerMonth", config);
    expect(result.currentRange).toEqual({ start: "2026-08-01", end: "2026-08-12" });
  });
});

function daysBetween(startStr: string, endStr: string): number {
  const s = startStr.split("-").map(Number) as [number, number, number];
  const e = endStr.split("-").map(Number) as [number, number, number];
  const start = Date.UTC(s[0], s[1] - 1, s[2]);
  const end = Date.UTC(e[0], e[1] - 1, e[2]);
  return Math.round((end - start) / 86_400_000) + 1;
}
