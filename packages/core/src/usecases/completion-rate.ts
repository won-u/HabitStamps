import type { FrequencyConfig, FrequencyType } from "../models/habit";

function toUtcDay(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d) / 86_400_000;
}

function fromUtcDay(day: number): string {
  return new Date(day * 86_400_000).toISOString().slice(0, 10);
}

/**
 * How much of what the habit asked for was done over the last `lookbackDays`
 * (today included), as 0–100. "Asked for" follows the frequency: every day,
 * the chosen weekdays, or n per week / month spread over the window — so a
 * 3-a-week habit kept every week reads 100%, not 3/7 of the days.
 *
 * The window starts no earlier than `startedOn` (when the habit began: its
 * first check-in or creation day, whichever is earlier), so a habit started
 * last week isn't judged against 90 days it didn't exist for.
 */
export function getCompletionRate(
  checkInDates: readonly string[],
  today: string,
  lookbackDays: number,
  frequencyType: FrequencyType,
  frequencyConfig: FrequencyConfig,
  startedOn: string,
): number {
  const end = toUtcDay(today);
  const start = Math.max(end - lookbackDays + 1, toUtcDay(startedOn));
  if (start > end) return 0;
  const days = end - start + 1;

  let expected: number;
  switch (frequencyType) {
    case "weekdays": {
      const weekdays = frequencyConfig.weekdays;
      if (!weekdays || weekdays.length === 0) {
        expected = days;
        break;
      }
      expected = 0;
      for (let day = start; day <= end; day += 1) {
        if (weekdays.includes(new Date(day * 86_400_000).getUTCDay())) expected += 1;
      }
      break;
    }
    case "timesPerWeek":
      expected = ((frequencyConfig.timesPerWeek ?? 7) * days) / 7;
      break;
    case "timesPerMonth":
      expected = ((frequencyConfig.timesPerMonth ?? 31) * days) / 30.44;
      break;
    case "daily":
    default:
      expected = days;
  }

  const from = fromUtcDay(start);
  const done = new Set(checkInDates.filter((date) => date >= from && date <= today)).size;
  if (expected <= 0) return done > 0 ? 100 : 0;
  return Math.min(100, Math.round((done / expected) * 100));
}
