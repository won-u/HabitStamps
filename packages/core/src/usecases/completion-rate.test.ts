import { describe, expect, it } from "vitest";
import { getCompletionRate } from "./completion-rate";

function everyNthDay(from: string, count: number, step: number): string[] {
  const [y, m, d] = from.split("-").map(Number) as [number, number, number];
  return Array.from({ length: count }, (_, i) => new Date(Date.UTC(y, m - 1, d + i * step)).toISOString().slice(0, 10));
}

describe("getCompletionRate", () => {
  it("daily: done days over the window", () => {
    const dates = everyNthDay("2026-08-03", 14, 1); // 08-03..08-16
    expect(getCompletionRate(dates, "2026-08-16", 28, "daily", {}, "2026-01-01")).toBe(50);
  });

  it("3 a week kept every week reads 100%, not 3/7 of the days", () => {
    // 4 weeks (Sun 07-19 .. Sat 08-15), Mon/Wed/Fri each week = 12.
    const dates = ["07-20", "07-22", "07-24", "07-27", "07-29", "07-31", "08-03", "08-05", "08-07", "08-10", "08-12", "08-14"].map(
      (md) => `2026-${md}`,
    );
    expect(getCompletionRate(dates, "2026-08-15", 28, "timesPerWeek", { timesPerWeek: 3 }, "2026-01-01")).toBe(100);
  });

  it("caps at 100 when more was done than asked for", () => {
    const dates = everyNthDay("2026-08-01", 14, 1);
    expect(getCompletionRate(dates, "2026-08-14", 14, "timesPerWeek", { timesPerWeek: 2 }, "2026-01-01")).toBe(100);
  });

  it("weekdays: only the scheduled days are asked for", () => {
    // Mon/Wed/Fri over Sun 08-02 .. Sat 08-15 = 6 scheduled days; 3 done.
    const dates = ["2026-08-03", "2026-08-05", "2026-08-07"];
    expect(getCompletionRate(dates, "2026-08-15", 14, "weekdays", { weekdays: [1, 3, 5] }, "2026-01-01")).toBe(50);
  });

  it("does not judge a new habit against days before it started", () => {
    // Started 08-10, daily, done every day since: 100%, not 6/90.
    const dates = everyNthDay("2026-08-10", 6, 1);
    expect(getCompletionRate(dates, "2026-08-15", 90, "daily", {}, "2026-08-10")).toBe(100);
  });

  it("ignores check-ins outside the window", () => {
    expect(getCompletionRate(["2026-01-01"], "2026-08-15", 30, "daily", {}, "2025-01-01")).toBe(0);
  });
});
