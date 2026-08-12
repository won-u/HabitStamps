import { useEffect, useMemo, useState } from 'react';
import { differenceInCalendarDays, format, startOfMonth, startOfWeek, subDays } from 'date-fns';
import * as Haptics from 'expo-haptics';
import type { CheckIn, FrequencyConfig, FrequencyType, Habit } from '@habit-tracker/core';
import { calculateStreak } from '@habit-tracker/core';
import { habitRepository, checkInRepository } from '@/composition/container';

const STREAK_LOOKBACK_DAYS = 120;

export function todayDateString(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

/** A "월 n회" habit tracks against the calendar month; every other frequency tracks against the calendar week. */
function isMonthlyFrequency(frequencyType: FrequencyType): boolean {
  return frequencyType === 'timesPerMonth';
}

function periodTarget(frequencyType: FrequencyType, frequencyConfig: FrequencyConfig): number {
  if (frequencyType === 'timesPerWeek') return frequencyConfig.timesPerWeek ?? 7;
  if (frequencyType === 'weekdays') return frequencyConfig.weekdays?.length ?? 7;
  if (frequencyType === 'timesPerMonth') return frequencyConfig.timesPerMonth ?? 30;
  return 7;
}

function buildSubtitle(today: string, lastCheckInDate: string | null): string {
  if (!lastCheckInDate) return '체크인 없음';
  if (lastCheckInDate === today) return '최근 오늘';
  const daysAgo = differenceInCalendarDays(new Date(today), new Date(lastCheckInDate));
  if (daysAgo === 1) return '최근 어제';
  if (daysAgo < 30) return `최근 ${daysAgo}일 전`;
  if (daysAgo < 365) return `최근 ${Math.floor(daysAgo / 30)}개월 전`;
  return `최근 ${Math.floor(daysAgo / 365)}년 전`;
}

export interface TodayHabit {
  habit: Habit;
  isCheckedForViewedDate: boolean;
  currentStreak: number;
  subtitle: string;
  /** Count/target for the habit's own period — the current week, or the current month for "월 n회" habits. */
  periodProgress: { count: number; target: number };
}

/**
 * Powers the Today screen: the habit list, the viewed date's check state, and
 * the check-in toggle. `viewedDate` defaults to today but can be moved via
 * the date strip / date picker — streaks/subtitles always stay anchored to
 * the real "today" regardless of which day is being viewed/toggled.
 *
 * Subscribes to `checkInRepository.observeAll()` once and derives everything
 * else with useMemo, instead of doing a one-shot fetch per habit — the
 * one-shot version silently went stale after a check-in from *outside* this
 * hook (e.g. from the Calendar or habit detail screen).
 */
export function useToday() {
  const today = useMemo(() => todayDateString(), []);
  const [viewedDate, setViewedDate] = useState(today);
  const [habits, setHabits] = useState<readonly Habit[]>([]);
  const [allCheckIns, setAllCheckIns] = useState<readonly CheckIn[]>([]);

  useEffect(() => habitRepository.observe().subscribe(setHabits), []);
  useEffect(() => checkInRepository.observeAll().subscribe(setAllCheckIns), []);

  const checkInsByHabit = useMemo(() => {
    const map = new Map<string, CheckIn[]>();
    for (const checkIn of allCheckIns) {
      const bucket = map.get(checkIn.habitId);
      if (bucket) bucket.push(checkIn);
      else map.set(checkIn.habitId, [checkIn]);
    }
    return map;
  }, [allCheckIns]);

  const items: TodayHabit[] = useMemo(() => {
    const rangeStart = format(subDays(new Date(today), STREAK_LOOKBACK_DAYS), 'yyyy-MM-dd');
    const weekStart = format(startOfWeek(new Date(today), { weekStartsOn: 0 }), 'yyyy-MM-dd');
    const monthStart = format(startOfMonth(new Date(today)), 'yyyy-MM-dd');

    return habits.map((habit) => {
      const habitCheckIns = checkInsByHabit.get(habit.id) ?? [];
      const isCheckedForViewedDate = habitCheckIns.some((checkIn) => checkIn.date === viewedDate);
      const datesInRange = habitCheckIns
        .map((checkIn) => checkIn.date)
        .filter((date) => date >= rangeStart)
        .sort();
      const { current } = calculateStreak(datesInRange, today, habit.frequencyType, habit.frequencyConfig);
      const lastDate = datesInRange.length > 0 ? datesInRange[datesInRange.length - 1]! : null;
      const periodStart = isMonthlyFrequency(habit.frequencyType) ? monthStart : weekStart;
      const periodCount = datesInRange.filter((date) => date >= periodStart).length;

      return {
        habit,
        isCheckedForViewedDate,
        currentStreak: current,
        subtitle: buildSubtitle(today, lastDate),
        periodProgress: { count: periodCount, target: periodTarget(habit.frequencyType, habit.frequencyConfig) },
      };
    });
  }, [habits, checkInsByHabit, viewedDate, today]);

  async function toggleCheckIn(habit: Habit) {
    const result = await checkInRepository.toggle(habit.id, viewedDate);
    if (result) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }

  return { today, viewedDate, setViewedDate, items, toggleCheckIn };
}
