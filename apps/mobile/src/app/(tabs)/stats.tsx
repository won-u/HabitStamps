import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  addMonths,
  addWeeks,
  addYears,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  isSameMonth,
  isSameWeek,
  isSameYear,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subDays,
  subMonths,
  subWeeks,
  subYears,
} from 'date-fns';
import { ko } from 'date-fns/locale';
import type { Category, CheckIn, Habit } from '@habit-tracker/core';
import { calculateStreak, getPeriodCounts } from '@habit-tracker/core';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useTheme } from '@/hooks/use-theme';
import { useSwipeNavigation } from '@/hooks/use-swipe-navigation';
import { habitRepository, checkInRepository, categoryRepository } from '@/composition/container';
import { groupByCategory } from '@/features/reports/group-by-category';

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];
const LOOKBACK_DAYS = 90;

type StatsMode = 'summary' | 'weekly' | 'monthly' | 'yearly';
const MODE_LABELS: Record<StatsMode, string> = { summary: '요약', weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly' };

interface HabitStat {
  habit: Habit;
  currentStreak: number;
  longestStreak: number;
  completionRate: number;
}

export default function StatsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<StatsMode>('summary');
  const [habits, setHabits] = useState<readonly Habit[]>([]);
  const [categories, setCategories] = useState<readonly Category[]>([]);
  const [allCheckIns, setAllCheckIns] = useState<readonly CheckIn[]>([]);
  const [weekAnchor, setWeekAnchor] = useState(new Date());
  const [monthAnchor, setMonthAnchor] = useState(new Date());
  const [yearAnchor, setYearAnchor] = useState(new Date());

  // observeAll (not a one-shot listAll) so this screen re-renders the moment
  // any check-in changes, even from another screen — see docs/architecture.md.
  useEffect(() => habitRepository.observe().subscribe(setHabits), []);
  useEffect(() => categoryRepository.observe().subscribe(setCategories), []);
  useEffect(() => checkInRepository.observeAll().subscribe(setAllCheckIns), []);

  const today = format(new Date(), 'yyyy-MM-dd');

  const checkedByHabit = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const checkIn of allCheckIns) {
      const bucket = map.get(checkIn.habitId);
      if (bucket) bucket.add(checkIn.date);
      else map.set(checkIn.habitId, new Set([checkIn.date]));
    }
    return map;
  }, [allCheckIns]);

  const groups = useMemo(() => groupByCategory(habits, categories, (habit) => habit.categoryId), [habits, categories]);

  const periodCounts = useMemo(
    () => getPeriodCounts(allCheckIns.map((checkIn) => checkIn.date), today),
    [allCheckIns, today],
  );

  const stats: HabitStat[] = useMemo(() => {
    const rangeStart = format(subDays(new Date(), LOOKBACK_DAYS), 'yyyy-MM-dd');
    return habits.map((habit) => {
      const dates = allCheckIns
        .filter((checkIn) => checkIn.habitId === habit.id && checkIn.date >= rangeStart)
        .map((checkIn) => checkIn.date);
      const { current, longest } = calculateStreak(dates, today, habit.frequencyType, habit.frequencyConfig);
      const completionRate = Math.round((dates.length / LOOKBACK_DAYS) * 100);
      return { habit, currentStreak: current, longestStreak: longest, completionRate };
    });
  }, [habits, allCheckIns, today]);

  const weekDays = useMemo(() => {
    const start = startOfWeek(weekAnchor, { weekStartsOn: 0 });
    const end = endOfWeek(weekAnchor, { weekStartsOn: 0 });
    return eachDayOfInterval({ start, end });
  }, [weekAnchor]);

  const yearWeeks = useMemo(() => {
    // Aligned to full weeks so the heatmap grid is rectangular, matching GitHub's contribution graph.
    const start = startOfWeek(startOfYear(yearAnchor), { weekStartsOn: 0 });
    const end = endOfWeek(endOfYear(yearAnchor), { weekStartsOn: 0 });
    const days = eachDayOfInterval({ start, end });
    const result: Date[][] = [];
    for (let i = 0; i < days.length; i += 7) result.push(days.slice(i, i + 7));
    return result;
  }, [yearAnchor]);

  const weekSwipe = useSwipeNavigation(
    () => setWeekAnchor((d) => addWeeks(d, 1)),
    () => setWeekAnchor((d) => subWeeks(d, 1)),
  );
  const monthSwipe = useSwipeNavigation(
    () => setMonthAnchor((d) => addMonths(d, 1)),
    () => setMonthAnchor((d) => subMonths(d, 1)),
  );
  const yearSwipe = useSwipeNavigation(
    () => setYearAnchor((d) => addYears(d, 1)),
    () => setYearAnchor((d) => subYears(d, 1)),
  );

  const now = new Date();
  const isCurrentWeek = isSameWeek(weekAnchor, now, { weekStartsOn: 0 });
  const isCurrentMonth = isSameMonth(monthAnchor, now);
  const isCurrentYear = isSameYear(yearAnchor, now);
  const showJumpToToday =
    (mode === 'weekly' && !isCurrentWeek) || (mode === 'monthly' && !isCurrentMonth) || (mode === 'yearly' && !isCurrentYear);

  function jumpToToday() {
    if (mode === 'weekly') setWeekAnchor(new Date());
    else if (mode === 'monthly') setMonthAnchor(new Date());
    else setYearAnchor(new Date());
  }

  function countInMonth(habitId: string, month: Date): number {
    const monthPrefix = format(month, 'yyyy-MM');
    const dates = checkedByHabit.get(habitId);
    if (!dates) return 0;
    let count = 0;
    for (const date of dates) if (date.startsWith(monthPrefix)) count += 1;
    return count;
  }

  function countInYear(habitId: string, year: Date): number {
    const yearPrefix = format(year, 'yyyy');
    const dates = checkedByHabit.get(habitId);
    if (!dates) return 0;
    let count = 0;
    for (const date of dates) if (date.startsWith(yearPrefix)) count += 1;
    return count;
  }

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top + 20 }]}>
      <ThemedText type="title">통계</ThemedText>

      <View style={styles.segmentRow}>
        {(['summary', 'weekly', 'monthly', 'yearly'] as StatsMode[]).map((m) => (
          <Pressable
            key={m}
            onPress={() => setMode(m)}
            style={[styles.segment, { backgroundColor: mode === m ? theme.text : theme.backgroundElement }]}>
            <ThemedText style={{ color: mode === m ? theme.background : theme.text }}>{MODE_LABELS[m]}</ThemedText>
          </Pressable>
        ))}
      </View>

      {mode === 'weekly' ? (
        <View style={styles.rangeHeader}>
          <Pressable onPress={() => setWeekAnchor((d) => subWeeks(d, 1))} hitSlop={8}>
            <Ionicons name="chevron-back" size={20} color={theme.text} />
          </Pressable>
          <ThemedText type="smallBold">
            {format(weekDays[0]!, 'M월 d일', { locale: ko })} - {format(weekDays[6]!, 'M월 d일', { locale: ko })}
          </ThemedText>
          <Pressable onPress={() => setWeekAnchor((d) => addWeeks(d, 1))} hitSlop={8}>
            <Ionicons name="chevron-forward" size={20} color={theme.text} />
          </Pressable>
        </View>
      ) : mode === 'monthly' ? (
        <View style={styles.rangeHeader}>
          <Pressable onPress={() => setMonthAnchor((d) => subMonths(d, 1))} hitSlop={8}>
            <Ionicons name="chevron-back" size={20} color={theme.text} />
          </Pressable>
          <ThemedText type="smallBold">{format(monthAnchor, 'yyyy년 M월', { locale: ko })}</ThemedText>
          <Pressable onPress={() => setMonthAnchor((d) => addMonths(d, 1))} hitSlop={8}>
            <Ionicons name="chevron-forward" size={20} color={theme.text} />
          </Pressable>
        </View>
      ) : mode === 'yearly' ? (
        <View style={styles.rangeHeader}>
          <Pressable onPress={() => setYearAnchor((d) => subYears(d, 1))} hitSlop={8}>
            <Ionicons name="chevron-back" size={20} color={theme.text} />
          </Pressable>
          <ThemedText type="smallBold">{format(yearAnchor, 'yyyy년', { locale: ko })}</ThemedText>
          <Pressable onPress={() => setYearAnchor((d) => addYears(d, 1))} hitSlop={8}>
            <Ionicons name="chevron-forward" size={20} color={theme.text} />
          </Pressable>
        </View>
      ) : null}

      {mode === 'summary' ? (
        <>
          <View style={styles.tileRow}>
            {(
              [
                { label: '이번주', value: periodCounts.thisWeek },
                { label: '이번달', value: periodCounts.thisMonth },
                { label: '올해', value: periodCounts.thisYear },
                { label: '전체', value: periodCounts.allTime },
              ] as const
            ).map((tile) => (
              <View key={tile.label} style={[styles.tile, { backgroundColor: theme.backgroundElement }]}>
                <ThemedText type="title" style={styles.tileValue}>
                  {tile.value}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {tile.label}
                </ThemedText>
              </View>
            ))}
          </View>

          {stats.length === 0 ? (
            <ThemedText themeColor="textSecondary" style={styles.empty}>
              습관을 만들면 통계가 여기 표시돼요
            </ThemedText>
          ) : (
            <FlatList
              data={stats}
              keyExtractor={(item) => item.habit.id}
              contentContainerStyle={styles.list}
              renderItem={({ item }) => (
                <View style={[styles.row, { backgroundColor: theme.backgroundElement }]}>
                  <View style={[styles.dot, { backgroundColor: item.habit.color }]} />
                  <View style={styles.rowInfo}>
                    <ThemedText style={styles.rowName}>
                      {item.habit.icon} {item.habit.name}
                    </ThemedText>
                    <ThemedText themeColor="textSecondary" type="small">
                      완료율 {item.completionRate}% · 🔥 {item.currentStreak} (최장 {item.longestStreak})
                    </ThemedText>
                  </View>
                </View>
              )}
            />
          )}
        </>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {groups.length === 0 ? (
            <ThemedText themeColor="textSecondary">습관을 만들면 리포트가 여기 표시돼요</ThemedText>
          ) : mode === 'weekly' ? (
            <View {...weekSwipe}>
              {groups.map((group) => (
                <View key={group.key} style={styles.groupSection}>
                  <ThemedText type="smallBold" themeColor="textSecondary" style={styles.groupTitle}>
                    {group.name}
                  </ThemedText>
                  <View style={[styles.tableCard, { backgroundColor: theme.backgroundElement }]}>
                    <View style={styles.weekRow}>
                      <View style={styles.habitNameCol} />
                      {WEEKDAY_LABELS.map((label) => (
                        <View key={label} style={styles.dayCol}>
                          <ThemedText type="small" themeColor="textSecondary">
                            {label}
                          </ThemedText>
                        </View>
                      ))}
                    </View>
                    {group.items.map((habit) => {
                      const dates = checkedByHabit.get(habit.id) ?? new Set<string>();
                      return (
                        <View key={habit.id} style={styles.weekRow}>
                          <View style={styles.habitNameCol}>
                            <ThemedText numberOfLines={1} type="small">
                              {habit.icon} {habit.name}
                            </ThemedText>
                          </View>
                          {weekDays.map((day) => {
                            const dateStr = format(day, 'yyyy-MM-dd');
                            const checked = dates.has(dateStr);
                            return (
                              <View key={dateStr} style={styles.dayCol}>
                                <View
                                  style={[
                                    styles.weeklyDot,
                                    { backgroundColor: checked ? habit.color : theme.backgroundSelected },
                                  ]}
                                />
                              </View>
                            );
                          })}
                        </View>
                      );
                    })}
                  </View>
                </View>
              ))}
            </View>
          ) : mode === 'monthly' ? (
            <View {...monthSwipe}>
              {groups.map((group) => (
                <View key={group.key} style={styles.groupSection}>
                  <ThemedText type="smallBold" themeColor="textSecondary" style={styles.groupTitle}>
                    {group.name}
                  </ThemedText>
                  <View style={styles.mosaicGrid}>
                    {group.items.map((habit) => (
                      <MiniMonthCard
                        key={habit.id}
                        habit={habit}
                        month={monthAnchor}
                        checkedDates={checkedByHabit.get(habit.id) ?? new Set<string>()}
                        count={countInMonth(habit.id, monthAnchor)}
                      />
                    ))}
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <View {...yearSwipe}>
              {groups.map((group) => (
                <View key={group.key} style={styles.groupSection}>
                  <ThemedText type="smallBold" themeColor="textSecondary" style={styles.groupTitle}>
                    {group.name}
                  </ThemedText>
                  {group.items.map((habit) => (
                    <YearlyHeatmap
                      key={habit.id}
                      habit={habit}
                      year={yearAnchor}
                      weeks={yearWeeks}
                      checkedDates={checkedByHabit.get(habit.id) ?? new Set<string>()}
                      count={countInYear(habit.id, yearAnchor)}
                    />
                  ))}
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}

      {mode !== 'summary' && showJumpToToday ? (
        <Pressable style={[styles.todayFab, { backgroundColor: theme.text }]} onPress={jumpToToday}>
          <Ionicons name="today-outline" size={22} color={theme.background} />
        </Pressable>
      ) : null}
    </ThemedView>
  );
}

interface MiniMonthCardProps {
  habit: Habit;
  month: Date;
  checkedDates: Set<string>;
  count: number;
}

function MiniMonthCard({ habit, month, checkedDates, count }: MiniMonthCardProps) {
  const theme = useTheme();
  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(month), { weekStartsOn: 0 });
    return eachDayOfInterval({ start, end });
  }, [month]);

  return (
    <View style={[styles.miniCard, { backgroundColor: theme.backgroundElement }]}>
      <View style={styles.miniCardHeader}>
        <ThemedText numberOfLines={1} type="small" style={styles.miniCardTitle}>
          {habit.icon} {habit.name}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {count}회
        </ThemedText>
      </View>
      <View style={styles.miniGrid}>
        {days.map((day) => {
          const dateStr = format(day, 'yyyy-MM-dd');
          const inMonth = isSameMonth(day, month);
          const checked = checkedDates.has(dateStr);
          return (
            <View
              key={dateStr}
              style={[
                styles.miniDay,
                { backgroundColor: checked ? habit.color : theme.backgroundSelected, opacity: inMonth ? 1 : 0.3 },
              ]}
            />
          );
        })}
      </View>
    </View>
  );
}

interface YearlyHeatmapProps {
  habit: Habit;
  year: Date;
  weeks: Date[][];
  checkedDates: Set<string>;
  count: number;
}

/** GitHub-contribution-graph-style yearly overview — one column per week, one row per weekday. */
function YearlyHeatmap({ habit, year, weeks, checkedDates, count }: YearlyHeatmapProps) {
  const theme = useTheme();
  const targetYear = year.getFullYear();

  return (
    <View style={[styles.yearCard, { backgroundColor: theme.backgroundElement }]}>
      <View style={styles.miniCardHeader}>
        <ThemedText numberOfLines={1} type="small" style={styles.miniCardTitle}>
          {habit.icon} {habit.name}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {count}회
        </ThemedText>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.heatmapRow}>
          {weeks.map((week, weekIndex) => (
            <View key={weekIndex} style={styles.heatmapColumn}>
              {week.map((day) => {
                const dateStr = format(day, 'yyyy-MM-dd');
                const inYear = day.getFullYear() === targetYear;
                const checked = checkedDates.has(dateStr);
                return (
                  <View
                    key={dateStr}
                    style={[
                      styles.heatCell,
                      { backgroundColor: checked ? habit.color : theme.backgroundSelected, opacity: inYear ? 1 : 0.15 },
                    ]}
                  />
                );
              })}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  empty: { marginTop: 24 },
  segmentRow: { flexDirection: 'row', gap: 8, marginTop: 16, marginBottom: 16 },
  segment: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18 },
  rangeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  tileRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  tile: { flex: 1, borderRadius: 16, paddingVertical: 14, alignItems: 'center', gap: 2 },
  tileValue: { fontSize: 24, lineHeight: 28 },
  list: { paddingBottom: 40, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, padding: 14 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  rowInfo: { flex: 1, gap: 2 },
  rowName: { fontWeight: '600' },
  scroll: { paddingBottom: 40 },
  groupSection: { marginBottom: 20 },
  groupTitle: { marginBottom: 8 },
  tableCard: { borderRadius: 16, padding: 12, gap: 10 },
  weekRow: { flexDirection: 'row', alignItems: 'center' },
  habitNameCol: { width: 90 },
  dayCol: { flex: 1, alignItems: 'center' },
  weeklyDot: { width: 16, height: 16, borderRadius: 8 },
  mosaicGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  miniCard: { width: '47%', borderRadius: 14, padding: 10 },
  miniCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 6 },
  miniCardTitle: { flex: 1 },
  miniGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 3 },
  miniDay: { width: 10, height: 10, borderRadius: 3 },
  yearCard: { borderRadius: 14, padding: 10, marginBottom: 10 },
  heatmapRow: { flexDirection: 'row', gap: 3 },
  heatmapColumn: { gap: 3 },
  heatCell: { width: 9, height: 9, borderRadius: 2 },
  todayFab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
});
