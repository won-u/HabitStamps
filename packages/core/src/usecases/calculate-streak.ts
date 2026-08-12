import type { FrequencyConfig, FrequencyType } from "../models/habit";

export interface StreakRange {
  start: string;
  end: string;
}

export interface StreakResult {
  current: number;
  longest: number;
  currentRange: StreakRange | null;
  longestRange: StreakRange | null;
}

function addDays(dateStr: string, days: number): string {
  const parts = dateStr.split("-").map(Number);
  const year = parts[0]!;
  const month = parts[1]!;
  const day = parts[2]!;
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dayOfWeek(dateStr: string): number {
  const parts = dateStr.split("-").map(Number);
  return new Date(Date.UTC(parts[0]!, parts[1]! - 1, parts[2]!)).getUTCDay();
}

function daysBetweenInclusive(startStr: string, endStr: string): number {
  const s = startStr.split("-").map(Number);
  const e = endStr.split("-").map(Number);
  const start = Date.UTC(s[0]!, s[1]! - 1, s[2]!);
  const end = Date.UTC(e[0]!, e[1]! - 1, e[2]!);
  return Math.round((end - start) / 86_400_000) + 1;
}

/** 0 = Sunday ... 6 = Saturday, matching `FrequencyConfig.weekdays`. Empty/missing config degrades to "every day required" rather than "no day ever required" — the latter would never break a streak and could walk backward without bound. */
function isScheduledDay(dateStr: string, weekdays: readonly number[] | undefined): boolean {
  if (!weekdays || weekdays.length === 0) return true;
  return weekdays.includes(dayOfWeek(dateStr));
}

const EMPTY_RESULT: StreakResult = { current: 0, longest: 0, currentRange: null, longestRange: null };

/**
 * Streak for "daily" and "weekdays" habits: continuity is measured day by
 * day, but a day that isn't on the habit's schedule (e.g. Tuesday for a
 * Mon/Wed/Fri habit) is skipped rather than required — it neither breaks nor
 * requires a check-in. `current`/`longest` count the calendar day-span of the
 * streak (schedule gaps included), so a Mon/Wed/Fri habit kept for three
 * weeks reads as "17 days", not "9 check-ins".
 */
function calculateScheduleStreak(checkInDates: readonly string[], today: string, weekdays: readonly number[] | undefined): StreakResult {
  const dateSet = new Set(checkInDates);
  if (dateSet.size === 0) return EMPTY_RESULT;
  const sortedDates = Array.from(dateSet).sort();
  const earliest = sortedDates[0]!;
  const scheduled = (d: string) => isScheduledDay(d, weekdays);

  // `current`: walk backward from today. A scheduled-but-unchecked *today*
  // doesn't break the streak yet (the day isn't over) — start from yesterday
  // instead, same tolerance as the original daily-only algorithm.
  const currentEnd = !dateSet.has(today) && scheduled(today) ? addDays(today, -1) : today;
  let current = 0;
  let cursor = currentEnd;
  while (cursor >= earliest) {
    if (scheduled(cursor) && !dateSet.has(cursor)) break;
    current += 1;
    cursor = addDays(cursor, -1);
  }
  const currentRange: StreakRange | null = current > 0 ? { start: addDays(currentEnd, -(current - 1)), end: currentEnd } : null;

  // `longest`: single forward pass over the recorded history (never past the
  // last actual check-in — "today" is deliberately excluded here so an
  // unchecked, still-open today can't inflate a past run; the reconciliation
  // below folds `current` back in for the case where the live streak is the
  // record).
  const lastCheckIn = sortedDates[sortedDates.length - 1]!;
  let longest = 0;
  let longestRange: StreakRange | null = null;
  let run = 0;
  let runStart: string | null = null;
  for (let cursor2 = earliest; cursor2 <= lastCheckIn; cursor2 = addDays(cursor2, 1)) {
    if (scheduled(cursor2) && !dateSet.has(cursor2)) {
      run = 0;
      runStart = null;
      continue;
    }
    if (run === 0) runStart = cursor2;
    run += 1;
    if (run > longest) {
      longest = run;
      longestRange = { start: runStart!, end: cursor2 };
    }
  }

  if (current > longest) {
    longest = current;
    longestRange = currentRange;
  }

  return { current, longest, currentRange, longestRange };
}

interface PeriodBounds {
  start: string;
  end: string;
}

function weekBounds(dateStr: string): PeriodBounds {
  const start = addDays(dateStr, -dayOfWeek(dateStr));
  return { start, end: addDays(start, 6) };
}

function monthBounds(dateStr: string): PeriodBounds {
  const [year, month] = dateStr.split("-").map(Number) as [number, number];
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  return { start, end };
}

/**
 * Streak for "timesPerWeek"/"timesPerMonth" habits, which have no fixed
 * days — a single missed day is meaningless, only the period total matters.
 * Continuity is judged one period (week/month) at a time: a fully-elapsed
 * period breaks the streak if it didn't reach `target` check-ins, but the
 * period containing `today` is never judged as failing (it isn't over yet),
 * mirroring the schedule algorithm's "don't fail today" tolerance. As with
 * `calculateScheduleStreak`, the displayed `current`/`longest` are the day-span
 * of the qualifying periods, not a count of periods.
 */
function calculatePeriodStreak(checkInDates: readonly string[], today: string, periodBounds: (date: string) => PeriodBounds, target: number): StreakResult {
  const dateSet = new Set(checkInDates);
  if (dateSet.size === 0) return EMPTY_RESULT;
  const sortedDates = Array.from(dateSet).sort();
  const earliest = sortedDates[0]!;

  function countInRange(start: string, end: string): number {
    let count = 0;
    for (const date of sortedDates) if (date >= start && date <= end) count += 1;
    return count;
  }

  const todayPeriod = periodBounds(today);
  const currentPeriodProgress = countInRange(todayPeriod.start, today);

  let chainStart = todayPeriod.start;
  let cursorEnd = addDays(todayPeriod.start, -1);
  while (cursorEnd >= earliest) {
    const period = periodBounds(cursorEnd);
    if (countInRange(period.start, period.end) < target) break;
    chainStart = period.start;
    cursorEnd = addDays(period.start, -1);
  }

  const hasProgress = chainStart < todayPeriod.start || currentPeriodProgress > 0;
  const current = hasProgress ? daysBetweenInclusive(chainStart, today) : 0;
  const currentRange: StreakRange | null = hasProgress ? { start: chainStart, end: today } : null;

  // `longest`: forward scan over fully-elapsed periods only (through the
  // period containing the last real check-in) — "today" is excluded from
  // this strict scan for the same reason as calculateScheduleStreak, and
  // folded back in via the reconciliation below.
  const lastCheckIn = sortedDates[sortedDates.length - 1]!;
  let longest = 0;
  let longestRange: StreakRange | null = null;
  let runStart: string | null = null;
  let period = periodBounds(earliest);
  while (period.start <= lastCheckIn) {
    if (countInRange(period.start, period.end) >= target) {
      if (!runStart) runStart = period.start;
      const span = daysBetweenInclusive(runStart, period.end);
      if (span > longest) {
        longest = span;
        longestRange = { start: runStart, end: period.end };
      }
    } else {
      runStart = null;
    }
    period = periodBounds(addDays(period.end, 1));
  }

  if (current > longest) {
    longest = current;
    longestRange = currentRange;
  }

  return { current, longest, currentRange, longestRange };
}

/**
 * Pure, framework-agnostic streak math shared by the Today screen (current
 * streak badge) and Stats screen (longest streak). Takes `today` as an
 * argument rather than reading the clock itself, so it stays reusable from a
 * Web client later and trivially testable.
 *
 * The definition of "streak" depends on the habit's `frequencyType`:
 * - `daily`: every calendar day requires a check-in (equivalent to
 *   `weekdays` with all 7 days scheduled).
 * - `weekdays`: only the configured days of week require a check-in; other
 *   days are skipped without breaking the streak — see
 *   `calculateScheduleStreak`.
 * - `timesPerWeek`/`timesPerMonth`: no specific day is required, only a
 *   per-period total — see `calculatePeriodStreak`.
 *
 * In every case, `current`/`longest` are a day-span (matching the habit's
 * own `currentRange`/`longestRange`), not a count of check-ins or periods,
 * so the numbers stay comparable across frequency types.
 */
export function calculateStreak(
  checkInDates: readonly string[],
  today: string,
  frequencyType: FrequencyType = "daily",
  frequencyConfig: FrequencyConfig = {},
): StreakResult {
  switch (frequencyType) {
    case "weekdays":
      return calculateScheduleStreak(checkInDates, today, frequencyConfig.weekdays);
    case "timesPerWeek":
      return calculatePeriodStreak(checkInDates, today, weekBounds, frequencyConfig.timesPerWeek ?? 7);
    case "timesPerMonth":
      return calculatePeriodStreak(checkInDates, today, monthBounds, frequencyConfig.timesPerMonth ?? 31);
    case "daily":
    default:
      return calculateScheduleStreak(checkInDates, today, undefined);
  }
}
