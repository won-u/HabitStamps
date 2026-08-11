import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { addMonths, eachDayOfInterval, endOfMonth, format, getDay, isSameMonth, startOfMonth, subMonths } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';
import type { CheckIn, Habit } from '@habit-tracker/core';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useTheme } from '@/hooks/use-theme';
import { useSwipeNavigation } from '@/hooks/use-swipe-navigation';
import { YearMonthPickerModal } from '@/components/year-month-picker-modal';
import { habitRepository, checkInRepository } from '@/composition/container';

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];
const GRID_GAP = 6;
const CONTAINER_PADDING = 20;

export default function CalendarScreen() {
  const theme = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const [month, setMonth] = useState(new Date());
  const [habits, setHabits] = useState<readonly Habit[]>([]);
  const [allCheckIns, setAllCheckIns] = useState<readonly CheckIn[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);

  useEffect(() => habitRepository.observe().subscribe(setHabits), []);
  // observeAll (not per-day listByDate calls) so a check-in made from any other
  // screen shows up here immediately instead of only on the next month change.
  useEffect(() => checkInRepository.observeAll().subscribe(setAllCheckIns), []);

  // Exact pixel size (not aspectRatio, which doesn't reliably resolve against a
  // percentage width in a flex-wrap row) so cells are genuinely square and the
  // 7-day week fills the row edge-to-edge instead of leaving a gap on the right.
  // Floored so 7 cells + 6 gaps stay strictly under the available width — an
  // exact (unfloored) division leaves zero rounding margin, and Yoga rounding
  // the fractional width up on each cell then pushes the 7th cell to the next
  // row instead of filling the Saturday column.
  const cellSize = Math.floor((windowWidth - CONTAINER_PADDING * 2 - GRID_GAP * 6) / 7);
  const days = useMemo(() => eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) }), [month]);
  // Leading blanks so the 1st falls under its actual weekday column instead of
  // always starting at the grid's top-left cell regardless of day-of-week.
  const leadingBlanks = useMemo(
    () => Array.from({ length: getDay(startOfMonth(month)) }, (_, index) => `blank-${index}`),
    [month],
  );

  const checkInsByDate = useMemo(() => {
    const map: Record<string, CheckIn[]> = {};
    for (const day of days) {
      const dateStr = format(day, 'yyyy-MM-dd');
      map[dateStr] = allCheckIns.filter((checkIn) => checkIn.date === dateStr);
    }
    return map;
  }, [days, allCheckIns]);

  const monthlyCountByHabit = useMemo(() => {
    const monthPrefix = format(month, 'yyyy-MM');
    const counts = new Map<string, number>();
    for (const checkIn of allCheckIns) {
      if (!checkIn.date.startsWith(monthPrefix)) continue;
      counts.set(checkIn.habitId, (counts.get(checkIn.habitId) ?? 0) + 1);
    }
    return counts;
  }, [allCheckIns, month]);

  const habitById = new Map(habits.map((habit) => [habit.id, habit]));
  const selectedCheckIns = selectedDate ? (checkInsByDate[selectedDate] ?? []) : [];
  const swipeHandlers = useSwipeNavigation(
    () => setMonth((m) => addMonths(m, 1)),
    () => setMonth((m) => subMonths(m, 1)),
  );
  const isCurrentMonth = isSameMonth(month, new Date());

  return (
    <ThemedView style={styles.container}>
      <View style={styles.monthHeader}>
        <Pressable onPress={() => setMonth((m) => subMonths(m, 1))} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={theme.text} />
        </Pressable>
        <Pressable onPress={() => setPickerVisible(true)} hitSlop={8}>
          <ThemedText type="subtitle">{format(month, 'yyyy년 M월')}</ThemedText>
        </Pressable>
        <Pressable onPress={() => setMonth((m) => addMonths(m, 1))} hitSlop={8}>
          <Ionicons name="chevron-forward" size={22} color={theme.text} />
        </Pressable>
      </View>

      <YearMonthPickerModal
        visible={pickerVisible}
        initialYear={month.getFullYear()}
        initialMonth={month.getMonth()}
        onClose={() => setPickerVisible(false)}
        onSelect={(year, monthIndex) => setMonth(new Date(year, monthIndex, 1))}
      />

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.weekdayRow}>
          {WEEKDAY_LABELS.map((label) => (
            <ThemedText
              key={label}
              type="small"
              themeColor="textSecondary"
              style={[styles.weekdayLabel, { width: cellSize }]}>
              {label}
            </ThemedText>
          ))}
        </View>
        <View style={styles.grid} {...swipeHandlers}>
          {leadingBlanks.map((key) => (
            <View key={key} style={{ width: cellSize, height: cellSize }} />
          ))}
          {days.map((day) => {
            const dateStr = format(day, 'yyyy-MM-dd');
            const dayCheckIns = checkInsByDate[dateStr] ?? [];
            const dotColors = dayCheckIns
              .map((checkIn) => habitById.get(checkIn.habitId)?.color)
              .filter((color): color is string => Boolean(color));

            return (
              <Pressable
                key={dateStr}
                onPress={() => setSelectedDate(dateStr)}
                style={[
                  styles.dayCell,
                  {
                    width: cellSize,
                    height: cellSize,
                    backgroundColor: theme.backgroundElement,
                    borderColor: selectedDate === dateStr ? theme.text : 'transparent',
                  },
                ]}>
                <ThemedText type="small">{format(day, 'd')}</ThemedText>
                <View style={styles.dotsRow}>
                  {dotColors.slice(0, 4).map((color, index) => (
                    <View key={index} style={[styles.dot, { backgroundColor: color }]} />
                  ))}
                </View>
              </Pressable>
            );
          })}
        </View>

        {selectedDate ? (
          <View style={[styles.detail, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText type="smallBold">{selectedDate}</ThemedText>
            {selectedCheckIns.length === 0 ? (
              <ThemedText themeColor="textSecondary">기록 없음</ThemedText>
            ) : (
              selectedCheckIns.map((checkIn) => {
                const habit = habitById.get(checkIn.habitId);
                return (
                  <ThemedText key={checkIn.id}>
                    {habit?.icon} {habit?.name}
                    {checkIn.note ? ` — ${checkIn.note}` : ''}
                  </ThemedText>
                );
              })
            )}
          </View>
        ) : null}

        {habits.length > 0 ? (
          <View style={styles.monthlyCounts}>
            <ThemedText type="smallBold" themeColor="textSecondary" style={styles.monthlyCountsTitle}>
              {format(month, 'M월')} 습관별 카운트
            </ThemedText>
            {habits.map((habit) => (
              <View key={habit.id} style={[styles.countRow, { backgroundColor: theme.backgroundElement }]}>
                <View style={[styles.countDot, { backgroundColor: habit.color }]} />
                <ThemedText style={styles.countName} numberOfLines={1}>
                  {habit.icon} {habit.name}
                </ThemedText>
                <ThemedText themeColor="textSecondary">{monthlyCountByHabit.get(habit.id) ?? 0}회</ThemedText>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>

      {isCurrentMonth ? null : (
        <Pressable
          style={[styles.todayFab, { backgroundColor: theme.text }]}
          onPress={() => {
            setMonth(new Date());
            setSelectedDate(null);
          }}>
          <Ionicons name="today-outline" size={22} color={theme.background} />
        </Pressable>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  monthHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  scroll: { paddingBottom: 40 },
  weekdayRow: { flexDirection: 'row', gap: GRID_GAP, marginBottom: 8 },
  weekdayLabel: { textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP },
  dayCell: {
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  // Fixed height (not auto) so the day number sits at the same vertical spot
  // whether or not this day has check-in dots — an empty row would otherwise
  // collapse to 0 height and shift the number down relative to days with dots.
  dotsRow: { flexDirection: 'row', gap: 2, height: 6 },
  dot: { width: 5, height: 5, borderRadius: 2.5 },
  detail: { marginTop: 16, borderRadius: 14, padding: 16, gap: 4 },
  monthlyCounts: { marginTop: 20, gap: 8 },
  monthlyCountsTitle: { marginBottom: 4 },
  countRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12 },
  countDot: { width: 8, height: 8, borderRadius: 4 },
  countName: { flex: 1 },
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
