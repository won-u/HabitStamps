import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { eachDayOfInterval, endOfMonth, format, getDay, getDaysInMonth, isSameMonth, startOfMonth } from 'date-fns';
import { ko } from 'date-fns/locale';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import type { CheckIn, Habit } from '@habit-tracker/core';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useTheme } from '@/hooks/use-theme';
import { useMonthSlideCarousel } from '@/hooks/use-month-slide-carousel';
import { MonthSlideTrack } from '@/components/month-slide-track';
import { YearMonthPickerModal } from '@/components/year-month-picker-modal';
import { habitRepository, checkInRepository } from '@/composition/container';
import { PressableScale } from '@/components/ui/pressable-scale';
import { ProgressBar } from '@/components/ui/progress-bar';
import { JumpToTodayButton } from '@/components/ui/jump-to-today-button';
import { useTabBarSpace } from '@/hooks/use-bottom-inset';
import { haptic } from '@/lib/haptics';

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];
const GRID_GAP = 6;
const CONTAINER_PADDING = 20;
// A month grid can span 5 or 6 weeks depending on where the 1st falls; fixing
// the swipe viewport to the max keeps its height constant so adjacent months
// never get clipped and the grid doesn't jump as you slide between them.
const MAX_WEEK_ROWS = 6;

export default function CalendarScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const [month, setMonth] = useState(new Date());
  const [habits, setHabits] = useState<readonly Habit[]>([]);
  const [allCheckIns, setAllCheckIns] = useState<readonly CheckIn[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);
  const tabBarSpace = useTabBarSpace();

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
  const isCurrentMonth = isSameMonth(month, new Date());

  const containerWidth = windowWidth - CONTAINER_PADDING * 2;
  const { prevMonth, nextMonth, viewportHeight, panGesture, carouselTrackStyle, goToMonth, resetToMonth } =
    useMonthSlideCarousel({ month, setMonth, containerWidth, rowHeight: cellSize, rowGap: GRID_GAP, maxRows: MAX_WEEK_ROWS });

  const daysInMonth = getDaysInMonth(month);

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top + 12 }]}>
      <View style={styles.monthHeader}>
        <Pressable onPress={() => setPickerVisible(true)} hitSlop={8} style={styles.monthTitle}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            {format(month, 'yyyy년')}
          </ThemedText>
          <View style={styles.monthTitleRow}>
            <ThemedText type="title" style={styles.monthTitleText}>
              {format(month, 'M월')}
            </ThemedText>
            <Ionicons name="chevron-down" size={18} color={theme.textSecondary} />
          </View>
        </Pressable>
        <View style={styles.monthNav}>
          <PressableScale
            hapticKind="selection"
            accessibilityLabel="이전 달"
            onPress={() => goToMonth(-1)}
            style={[styles.navButton, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <Ionicons name="chevron-back" size={18} color={theme.text} />
          </PressableScale>
          <PressableScale
            hapticKind="selection"
            accessibilityLabel="다음 달"
            onPress={() => goToMonth(1)}
            style={[styles.navButton, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <Ionicons name="chevron-forward" size={18} color={theme.text} />
          </PressableScale>
        </View>
      </View>

      <YearMonthPickerModal
        visible={pickerVisible}
        initialYear={month.getFullYear()}
        initialMonth={month.getMonth()}
        onClose={() => setPickerVisible(false)}
        onSelect={(year, monthIndex) => resetToMonth(new Date(year, monthIndex, 1))}
      />

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: tabBarSpace }]}
        showsVerticalScrollIndicator={false}>
        <View style={styles.weekdayRow}>
          {WEEKDAY_LABELS.map((label, index) => (
            <ThemedText
              key={label}
              type="small"
              style={[
                styles.weekdayLabel,
                { width: cellSize, color: index === 0 ? theme.danger : theme.textSecondary },
              ]}>
              {label}
            </ThemedText>
          ))}
        </View>
        <MonthSlideTrack
          panes={[prevMonth, month, nextMonth]}
          containerWidth={containerWidth}
          viewportHeight={viewportHeight}
          panGesture={panGesture}
          trackStyle={carouselTrackStyle}
          renderMonth={(paneMonth) => (
            <MonthGrid
              month={paneMonth}
              cellSize={cellSize}
              habitById={habitById}
              allCheckIns={allCheckIns}
              selectedDate={selectedDate}
              onSelectDate={(date) => {
                haptic('selection');
                setSelectedDate((prev) => (prev === date ? null : date));
              }}
              theme={theme}
            />
          )}
        />

        {selectedDate ? (
          <Animated.View
            key={selectedDate}
            entering={FadeInDown.springify().damping(18)}
            style={[styles.detail, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <View style={styles.detailHeader}>
              <ThemedText type="smallBold">{format(new Date(selectedDate), 'M월 d일 EEEE', { locale: ko })}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {selectedCheckIns.length}개 완료
              </ThemedText>
            </View>
            {selectedCheckIns.length === 0 ? (
              <ThemedText type="small" themeColor="textSecondary">
                기록 없음
              </ThemedText>
            ) : (
              selectedCheckIns.map((checkIn) => {
                const habit = habitById.get(checkIn.habitId);
                return (
                  <View key={checkIn.id} style={styles.detailRow}>
                    <View style={[styles.detailIcon, { backgroundColor: habit?.color ?? theme.backgroundSelected }]}>
                      <ThemedText style={styles.detailEmoji}>{habit?.icon}</ThemedText>
                    </View>
                    <View style={styles.detailInfo}>
                      <ThemedText numberOfLines={1}>{habit?.name}</ThemedText>
                      {checkIn.note ? (
                        <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
                          {checkIn.note}
                        </ThemedText>
                      ) : null}
                    </View>
                  </View>
                );
              })
            )}
          </Animated.View>
        ) : null}

        {habits.length > 0 ? (
          <View style={styles.monthlyCounts}>
            <ThemedText type="smallBold" themeColor="textSecondary" style={styles.monthlyCountsTitle}>
              {format(month, 'M월')} 습관별 기록
            </ThemedText>
            <View style={[styles.countCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
              {habits.map((habit, index) => {
                const count = monthlyCountByHabit.get(habit.id) ?? 0;
                return (
                  <View
                    key={habit.id}
                    style={[styles.countRow, index > 0 ? { borderTopColor: theme.border, borderTopWidth: 1 } : null]}>
                    <View style={styles.countTop}>
                      <ThemedText style={styles.countName} numberOfLines={1}>
                        {habit.icon} {habit.name}
                      </ThemedText>
                      <ThemedText type="smallBold">
                        {count}
                        <ThemedText type="small" themeColor="textSecondary">
                          회
                        </ThemedText>
                      </ThemedText>
                    </View>
                    <ProgressBar progress={count / daysInMonth} color={habit.color} delay={index * 40} />
                  </View>
                );
              })}
            </View>
          </View>
        ) : null}
      </ScrollView>

      <JumpToTodayButton
        visible={!isCurrentMonth}
        onPress={() => {
          resetToMonth(new Date());
          setSelectedDate(null);
        }}
      />
    </ThemedView>
  );
}

// One pane of the swipe carousel — renders a single month's day grid. Kept as
// its own component (rather than inlined) so each of the three panes (prev/
// current/next) computes its own days/check-ins independently via useMemo.
function MonthGrid({
  month,
  cellSize,
  habitById,
  allCheckIns,
  selectedDate,
  onSelectDate,
  theme,
}: {
  month: Date;
  cellSize: number;
  habitById: Map<string, Habit>;
  allCheckIns: readonly CheckIn[];
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
  theme: ReturnType<typeof useTheme>;
}) {
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
  const todayStr = format(new Date(), 'yyyy-MM-dd');

  return (
    <View style={styles.grid}>
      {leadingBlanks.map((key) => (
        <View key={key} style={{ width: cellSize, height: cellSize }} />
      ))}
      {days.map((day) => {
        const dateStr = format(day, 'yyyy-MM-dd');
        const dayCheckIns = checkInsByDate[dateStr] ?? [];
        const dotColors = dayCheckIns
          .map((checkIn) => habitById.get(checkIn.habitId)?.color)
          .filter((color): color is string => Boolean(color));

        const isSelected = selectedDate === dateStr;
        const isToday = dateStr === todayStr;
        return (
          <PressableScale
            key={dateStr}
            activeScale={0.9}
            onPress={() => onSelectDate(dateStr)}
            style={[
              styles.dayCell,
              {
                width: cellSize,
                height: cellSize,
                backgroundColor: isSelected ? theme.text : theme.backgroundElement,
                borderColor: isToday && !isSelected ? theme.accent : isSelected ? theme.text : theme.border,
                borderWidth: isToday && !isSelected ? 1.5 : 1,
              },
            ]}>
            <ThemedText
              type="small"
              style={[
                styles.dayNumber,
                { color: isSelected ? theme.background : isToday ? theme.accent : theme.text },
              ]}>
              {format(day, 'd')}
            </ThemedText>
            <View style={styles.dotsRow}>
              {dotColors.slice(0, 4).map((color, index) => (
                <View
                  key={index}
                  style={[styles.dot, { backgroundColor: color }, isSelected ? { borderWidth: 1, borderColor: theme.background } : null]}
                />
              ))}
            </View>
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: CONTAINER_PADDING },
  monthHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 18 },
  monthTitle: { gap: 2 },
  monthTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  monthTitleText: { fontSize: 34, lineHeight: 42, letterSpacing: -0.8 },
  monthNav: { flexDirection: 'row', gap: 8, marginBottom: 2 },
  navButton: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: {},
  weekdayRow: { flexDirection: 'row', gap: GRID_GAP, marginBottom: 8 },
  weekdayLabel: { textAlign: 'center', fontSize: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP, alignContent: 'flex-start' },
  dayCell: {
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  dayNumber: { fontFamily: 'NotoSansKR_700Bold', fontSize: 13.5 },
  // Fixed height (not auto) so the day number sits at the same vertical spot
  // whether or not this day has check-in dots — an empty row would otherwise
  // collapse to 0 height and shift the number down relative to days with dots.
  dotsRow: { flexDirection: 'row', gap: 2, height: 6 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  detail: { marginTop: 16, borderRadius: 20, borderWidth: 1, padding: 16, gap: 10 },
  detailHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  detailIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  detailEmoji: { fontSize: 16, lineHeight: 22 },
  detailInfo: { flex: 1 },
  monthlyCounts: { marginTop: 24 },
  monthlyCountsTitle: { marginBottom: 8, marginLeft: 4 },
  countCard: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 16 },
  countRow: { paddingVertical: 12, gap: 8 },
  countTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  countName: { flex: 1 },
});
