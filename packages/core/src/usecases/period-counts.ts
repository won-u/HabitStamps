export interface PeriodCounts {
  thisWeek: number;
  thisMonth: number;
  thisYear: number;
  allTime: number;
}

function startOfWeekSunday(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() - date.getUTCDay());
  return date.toISOString().slice(0, 10);
}

/**
 * Pure, framework-agnostic check-in counting shared by the Stats screen
 * (app-wide tiles) and the habit detail screen (per-habit tiles) — same
 * `calculateStreak`-style contract (string dates in, plain counts out) so it
 * stays trivially testable and reusable from a Web client later.
 */
export function getPeriodCounts(checkInDates: readonly string[], today: string): PeriodCounts {
  const weekStart = startOfWeekSunday(today);
  const monthPrefix = today.slice(0, 7);
  const yearPrefix = today.slice(0, 4);

  let thisWeek = 0;
  let thisMonth = 0;
  let thisYear = 0;
  for (const date of checkInDates) {
    if (date >= weekStart) thisWeek += 1;
    if (date.startsWith(monthPrefix)) thisMonth += 1;
    if (date.startsWith(yearPrefix)) thisYear += 1;
  }

  return { thisWeek, thisMonth, thisYear, allTime: checkInDates.length };
}
