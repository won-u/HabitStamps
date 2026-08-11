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

/**
 * Pure, framework-agnostic streak math shared by the Today screen (current
 * streak badge) and Stats screen (longest streak). Takes `today` as an
 * argument rather than reading the clock itself, so it stays reusable from a
 * Web client later and trivially testable.
 *
 * `current` counts consecutive covered days ending at `today`, but tolerates
 * today itself being not-yet-checked-in (so the badge doesn't drop to 0 the
 * moment midnight passes, before the user has had a chance to check in).
 * `currentRange`/`longestRange` are the inclusive date bounds of each streak,
 * for UI copy like "2026.08.09 ~ 2026.08.11" — null only when there are no
 * check-ins at all.
 */
export function calculateStreak(checkInDates: readonly string[], today: string): StreakResult {
  const sortedDates = Array.from(new Set(checkInDates)).sort();
  if (sortedDates.length === 0) return { current: 0, longest: 0, currentRange: null, longestRange: null };

  let longest = 1;
  let longestStart = sortedDates[0]!;
  let longestEnd = sortedDates[0]!;
  let runStart = sortedDates[0]!;
  let run = 1;
  for (let i = 1; i < sortedDates.length; i++) {
    const prev = sortedDates[i - 1]!;
    const curr = sortedDates[i]!;
    if (addDays(prev, 1) === curr) {
      run += 1;
    } else {
      run = 1;
      runStart = curr;
    }
    if (run > longest) {
      longest = run;
      longestStart = runStart;
      longestEnd = curr;
    }
  }

  const dateSet = new Set(sortedDates);
  let current = 0;
  const currentEnd = dateSet.has(today) ? today : addDays(today, -1);
  let cursor = currentEnd;
  while (dateSet.has(cursor)) {
    current += 1;
    cursor = addDays(cursor, -1);
  }

  return {
    current,
    longest,
    currentRange: current > 0 ? { start: addDays(currentEnd, -(current - 1)), end: currentEnd } : null,
    longestRange: { start: longestStart, end: longestEnd },
  };
}
