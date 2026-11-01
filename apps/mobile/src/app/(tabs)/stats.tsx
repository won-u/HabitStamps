import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { GestureDetector } from 'react-native-gesture-handler';
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
import { useSlideTransition } from '@/hooks/use-slide-transition';
import { withAlpha } from '@/constants/theme';
import { habitRepository, checkInRepository, categoryRepository } from '@/composition/container';
import { groupByCategory } from '@/features/reports/group-by-category';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { PressableScale } from '@/components/ui/pressable-scale';
import { ProgressBar } from '@/components/ui/progress-bar';
import { JumpToTodayButton } from '@/components/ui/jump-to-today-button';
import { useTabBarSpace } from '@/hooks/use-bottom-inset';
import { useCountUp } from '@/hooks/use-count-up';

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];
const LOOKBACK_DAYS = 90;

type StatsMode = 'summary' | 'weekly' | 'monthly' | 'yearly';
const MODE_OPTIONS: { value: StatsMode; label: string }[] = [
  { value: 'summary', label: '요약' },
  { value: 'weekly', label: '주간' },
  { value: 'monthly', label: '월간' },
  { value: 'yearly', label: '연간' },
];
type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

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
  const tabBarSpace = useTabBarSpace();

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

  const weekTransition = useSlideTransition(
    weekAnchor,
    () => setWeekAnchor((d) => addWeeks(d, 1)),
    () => setWeekAnchor((d) => subWeeks(d, 1)),
  );
  const monthTransition = useSlideTransition(
    monthAnchor,
    () => setMonthAnchor((d) => addMonths(d, 1)),
    () => setMonthAnchor((d) => subMonths(d, 1)),
  );
  const yearTransition = useSlideTransition(
    yearAnchor,
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

  const rangeLabel =
    mode === 'weekly'
      ? `${format(weekDays[0]!, 'M월 d일', { locale: ko })} – ${format(weekDays[6]!, 'M월 d일', { locale: ko })}`
      : mode === 'monthly'
        ? format(monthAnchor, 'yyyy년 M월', { locale: ko })
        : format(yearAnchor, 'yyyy년', { locale: ko });
  const activeTransition = mode === 'weekly' ? weekTransition : mode === 'monthly' ? monthTransition : yearTransition;

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top + 12 }]}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        나의 기록
      </ThemedText>
      <ThemedText type="title" style={styles.title}>
        통계
      </ThemedText>

      <SegmentedControl options={MODE_OPTIONS} value={mode} onChange={setMode} style={styles.segmentRow} />

      {mode !== 'summary' ? (
        <View style={styles.rangeHeader}>
          <PressableScale
            hapticKind="selection"
            accessibilityLabel="이전"
            onPress={() => activeTransition.slide(-1)}
            style={[styles.navButton, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <Ionicons name="chevron-back" size={18} color={theme.text} />
          </PressableScale>
          <ThemedText type="smallBold">{rangeLabel}</ThemedText>
          <PressableScale
            hapticKind="selection"
            accessibilityLabel="다음"
            onPress={() => activeTransition.slide(1)}
            style={[styles.navButton, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <Ionicons name="chevron-forward" size={18} color={theme.text} />
          </PressableScale>
        </View>
      ) : null}

      {mode === 'summary' ? (
        <ScrollView contentContainerStyle={{ paddingBottom: tabBarSpace }} showsVerticalScrollIndicator={false}>
          <View style={styles.tileGrid}>
            {(
              [
                { label: '이번주', value: periodCounts.thisWeek, icon: 'today-outline', highlight: true },
                { label: '이번달', value: periodCounts.thisMonth, icon: 'calendar-outline', highlight: false },
                { label: '올해', value: periodCounts.thisYear, icon: 'sparkles-outline', highlight: false },
                { label: '전체', value: periodCounts.allTime, icon: 'trophy-outline', highlight: false },
              ] as const
            ).map((tile, index) => (
              <StatTile key={tile.label} {...tile} index={index} />
            ))}
          </View>

          {stats.length === 0 ? (
            <ThemedText themeColor="textSecondary" style={styles.empty}>
              습관을 만들면 통계가 여기 표시돼요
            </ThemedText>
          ) : (
            <>
              <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionTitle}>
                최근 {LOOKBACK_DAYS}일
              </ThemedText>
              <View style={[styles.listCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
                {stats.map((item, index) => (
                  <Animated.View
                    key={item.habit.id}
                    entering={FadeInDown.delay(index * 50).springify().damping(18)}
                    style={[styles.row, index > 0 ? { borderTopWidth: 1, borderTopColor: theme.border } : null]}>
                    <View style={[styles.rowIcon, { backgroundColor: item.habit.color }]}>
                      <ThemedText style={styles.rowEmoji}>{item.habit.icon}</ThemedText>
                    </View>
                    <View style={styles.rowInfo}>
                      <View style={styles.rowTop}>
                        <ThemedText style={styles.rowName} numberOfLines={1}>
                          {item.habit.name}
                        </ThemedText>
                        <ThemedText type="smallBold">{item.completionRate}%</ThemedText>
                      </View>
                      <ProgressBar progress={item.completionRate / 100} color={item.habit.color} delay={index * 50} />
                      <ThemedText themeColor="textSecondary" type="small" style={styles.rowMeta}>
                        🔥 현재 {item.currentStreak}회 · 최장 {item.longestStreak}회
                      </ThemedText>
                    </View>
                  </Animated.View>
                ))}
              </View>
            </>
          )}
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: tabBarSpace }} showsVerticalScrollIndicator={false}>
          {groups.length === 0 ? (
            <ThemedText themeColor="textSecondary">습관을 만들면 리포트가 여기 표시돼요</ThemedText>
          ) : mode === 'weekly' ? (
            <GestureDetector gesture={weekTransition.panGesture} touchAction="pan-y">
              <Animated.View style={weekTransition.animatedStyle}>
                {groups.map((group) => (
                  <View key={group.key} style={styles.groupSection}>
                    <ThemedText type="smallBold" themeColor="textSecondary" style={styles.groupTitle}>
                      {group.name}
                    </ThemedText>
                    <View style={[styles.tableCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
                      <View style={styles.weekRow}>
                        <View style={styles.habitNameCol} />
                        {weekDays.map((day, index) => {
                          const isToday = format(day, 'yyyy-MM-dd') === today;
                          return (
                            <View key={WEEKDAY_LABELS[index]} style={styles.dayCol}>
                              <ThemedText
                                type="small"
                                style={[
                                  styles.weekdayHead,
                                  { color: isToday ? theme.accent : theme.textSecondary },
                                  isToday ? styles.weekdayHeadToday : null,
                                ]}>
                                {WEEKDAY_LABELS[index]}
                              </ThemedText>
                            </View>
                          );
                        })}
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
                                      checked
                                        ? { backgroundColor: habit.color, boxShadow: `0px 2px 6px ${withAlpha(habit.color, 0.4)}` }
                                        : { backgroundColor: theme.backgroundSelected },
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
              </Animated.View>
            </GestureDetector>
          ) : mode === 'monthly' ? (
            <GestureDetector gesture={monthTransition.panGesture} touchAction="pan-y">
              <Animated.View style={monthTransition.animatedStyle}>
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
              </Animated.View>
            </GestureDetector>
          ) : (
            <GestureDetector gesture={yearTransition.panGesture} touchAction="pan-y">
              <Animated.View style={yearTransition.animatedStyle}>
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
              </Animated.View>
            </GestureDetector>
          )}
        </ScrollView>
      )}

      <JumpToTodayButton visible={mode !== 'summary' && showJumpToToday} onPress={jumpToToday} />
    </ThemedView>
  );
}

function StatTile({
  label,
  value,
  icon,
  highlight,
  index,
}: {
  label: string;
  value: number;
  icon: IoniconName;
  highlight: boolean;
  index: number;
}) {
  const theme = useTheme();
  const display = useCountUp(value);
  const fg = highlight ? theme.background : theme.text;
  const fgMuted = highlight ? theme.background : theme.textSecondary;
  return (
    <Animated.View
      entering={FadeInDown.delay(index * 60).springify().damping(18)}
      style={[
        styles.tile,
        highlight
          ? { backgroundColor: theme.text, borderColor: theme.text }
          : { backgroundColor: theme.backgroundElement, borderColor: theme.border },
      ]}>
      <View style={styles.tileTop}>
        <Ionicons name={icon} size={16} color={fgMuted} />
        <ThemedText type="small" style={{ color: fgMuted, opacity: highlight ? 0.8 : 1 }}>
          {label}
        </ThemedText>
      </View>
      <ThemedText style={[styles.tileValue, { color: fg }]}>
        {display}
        <ThemedText style={[styles.tileUnit, { color: fgMuted, opacity: highlight ? 0.7 : 1 }]}> 회</ThemedText>
      </ThemedText>
    </Animated.View>
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
  const { width: windowWidth } = useWindowDimensions();
  // Two cards per row inside 20pt screen padding + 10pt gap, 12pt card padding, 3pt cell gap.
  const cardInner = (windowWidth - 40 - 10) / 2 - 24 - 2;
  const cell = Math.max(8, Math.floor((cardInner - 3 * 6) / 7));
  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(month), { weekStartsOn: 0 });
    return eachDayOfInterval({ start, end });
  }, [month]);

  return (
    <View style={[styles.miniCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
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
                { width: cell, height: cell },
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
    <View style={[styles.yearCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
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
  container: { flex: 1, paddingHorizontal: 20 },
  title: { fontSize: 34, lineHeight: 42, letterSpacing: -0.8 },
  empty: { marginTop: 24 },
  segmentRow: { marginTop: 14, marginBottom: 16 },
  rangeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  navButton: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  tileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 22 },
  tile: { width: '48.5%', flexGrow: 1, borderRadius: 20, borderWidth: 1, padding: 14, gap: 8 },
  tileTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tileValue: { fontSize: 28, lineHeight: 34, fontFamily: 'NotoSansKR_700Bold', letterSpacing: -0.6 },
  tileUnit: { fontSize: 14, fontFamily: 'NotoSansKR_500Medium' },
  sectionTitle: { marginBottom: 8, marginLeft: 4 },
  listCard: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  rowIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  rowEmoji: { fontSize: 19, lineHeight: 25 },
  rowInfo: { flex: 1, gap: 6 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowName: { flex: 1, fontFamily: 'NotoSansKR_700Bold' },
  rowMeta: { fontSize: 12, lineHeight: 16 },
  groupSection: { marginBottom: 20 },
  groupTitle: { marginBottom: 8, marginLeft: 4 },
  tableCard: { borderRadius: 20, borderWidth: 1, padding: 14, gap: 12 },
  weekRow: { flexDirection: 'row', alignItems: 'center' },
  habitNameCol: { width: 90 },
  dayCol: { flex: 1, alignItems: 'center' },
  weekdayHead: { fontSize: 12 },
  weekdayHeadToday: { fontFamily: 'NotoSansKR_700Bold' },
  weeklyDot: { width: 20, height: 20, borderRadius: 7 },
  mosaicGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  miniCard: { width: '48%', flexGrow: 1, borderRadius: 18, borderWidth: 1, padding: 12 },
  miniCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 6 },
  miniCardTitle: { flex: 1 },
  miniGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 3 },
  miniDay: { borderRadius: 4 },
  yearCard: { borderRadius: 18, borderWidth: 1, padding: 12, marginBottom: 10 },
  heatmapRow: { flexDirection: 'row', gap: 3 },
  heatmapColumn: { gap: 3 },
  heatCell: { width: 9, height: 9, borderRadius: 2.5 },
});
