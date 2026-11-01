import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import { Link, Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subDays,
} from 'date-fns';
import { ko } from 'date-fns/locale';
import type { CheckIn, Habit, StreakRange } from '@habit-tracker/core';
import { calculateStreak, getPeriodCounts } from '@habit-tracker/core';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useTheme } from '@/hooks/use-theme';
import { useMonthSlideCarousel } from '@/hooks/use-month-slide-carousel';
import { MonthSlideTrack } from '@/components/month-slide-track';
import { DenimCard } from '@/components/denim-card';
import { habitRepository, checkInRepository } from '@/composition/container';
import { PressableScale } from '@/components/ui/pressable-scale';
import { JumpToTodayButton } from '@/components/ui/jump-to-today-button';
import { useBottomInset } from '@/hooks/use-bottom-inset';
import { useCountUp } from '@/hooks/use-count-up';
import { tintedShadow } from '@/constants/theme';
import { haptic } from '@/lib/haptics';

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];
const STREAK_LOOKBACK_DAYS = 400;
const SCREEN_PADDING = 20;
const CARD_HORIZONTAL_PADDING = 16;
const MAX_WEEK_ROWS = 6;

// Dates here are always 'yyyy-MM-dd' strings, so a plain character swap
// avoids re-parsing them through Date (and the TZ bugs that invites).
function frequencyLabel(habit: Habit): string {
  const config = habit.frequencyConfig;
  if (habit.frequencyType === 'weekdays') {
    const days = (config.weekdays ?? []).map((day) => WEEKDAY_LABELS[day]).join('·');
    return days ? `매주 ${days}` : '특정 요일';
  }
  if (habit.frequencyType === 'timesPerWeek') return `주 ${config.timesPerWeek ?? 1}회`;
  if (habit.frequencyType === 'timesPerMonth') return `월 ${config.timesPerMonth ?? 1}회`;
  return '매일';
}

function formatRange(range: StreakRange): string {
  const dot = (dateStr: string) => dateStr.replaceAll('-', '.');
  return range.start === range.end ? dot(range.start) : `${dot(range.start)} ~ ${dot(range.end)}`;
}

export default function HabitDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const [habit, setHabit] = useState<Habit | null>(null);
  const [checkIns, setCheckIns] = useState<readonly CheckIn[]>([]);
  const [month, setMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  // The day whose stamp was just toggled on — only that cell plays the
  // "stamp" pop-in, so opening the screen doesn't animate every past stamp.
  const [justStamped, setJustStamped] = useState<string | null>(null);
  const bottomInset = useBottomInset();

  useEffect(() => {
    habitRepository.getById(id).then(setHabit);
  }, [id]);

  useEffect(() => checkInRepository.observeByHabit(id).subscribe(setCheckIns), [id]);

  const today = format(new Date(), 'yyyy-MM-dd');
  const checkedDates = useMemo(() => new Set(checkIns.map((checkIn) => checkIn.date)), [checkIns]);
  const washedDates = useMemo(
    () => new Set(checkIns.filter((checkIn) => checkIn.washed).map((checkIn) => checkIn.date)),
    [checkIns],
  );
  // Denim: the selected day's stamp, so it can be marked as washed.
  const selectedStamp = habit?.denim ? checkIns.find((checkIn) => checkIn.date === selectedDate) ?? null : null;

  const { current, longest, currentRange, longestRange } = useMemo(() => {
    if (!habit) return { current: 0, longest: 0, currentRange: null, longestRange: null };
    const rangeStart = format(subDays(new Date(today), STREAK_LOOKBACK_DAYS), 'yyyy-MM-dd');
    const dates = [...checkedDates].filter((date) => date >= rangeStart);
    return calculateStreak(dates, today, habit.frequencyType, habit.frequencyConfig);
  }, [checkedDates, today, habit]);

  const isCurrentStreakRecord = current > 0 && current === longest;

  const monthlyCheckedCount = useMemo(() => {
    const monthPrefix = format(month, 'yyyy-MM');
    return [...checkedDates].filter((date) => date.startsWith(monthPrefix)).length;
  }, [checkedDates, month]);

  // Unlike the streak calc above, "전체" (all-time) must not be capped by
  // STREAK_LOOKBACK_DAYS — it counts every check-in this habit has ever had.
  const periodCounts = useMemo(() => getPeriodCounts([...checkedDates], today), [checkedDates, today]);

  const containerWidth = windowWidth - SCREEN_PADDING * 2 - CARD_HORIZONTAL_PADDING * 2;
  const cellSize = containerWidth / 7;
  const { prevMonth, nextMonth, viewportHeight, panGesture, carouselTrackStyle, goToMonth, resetToMonth } =
    useMonthSlideCarousel({ month, setMonth, containerWidth, rowHeight: cellSize, maxRows: MAX_WEEK_ROWS });
  const isCurrentMonth = isSameMonth(month, new Date());

  /**
   * First tap on a day just selects/focuses it (matches how the date strip on
   * the Today screen works). A second tap on the *already selected* day
   * toggles that day's check-in — this two-step gesture prevents an
   * accidental tap while browsing the calendar from silently checking a habit
   * off for the wrong day.
   */
  async function handleDayPress(dateStr: string) {
    if (!habit || dateStr > today) return;
    if (selectedDate !== dateStr) {
      haptic('selection');
      setSelectedDate(dateStr);
      return;
    }
    const willCheck = !checkedDates.has(dateStr);
    haptic(willCheck ? 'medium' : 'light');
    setJustStamped(willCheck ? dateStr : null);
    await checkInRepository.toggle(habit.id, dateStr);
  }

  if (!habit) return null;

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{
          // The hero block below already shows the name large — keep the bar itself quiet.
          title: '',
          headerRight: () => (
            <Link href={{ pathname: '/habit/[id]/edit', params: { id: habit.id } }} asChild>
              <Pressable
                hitSlop={8}
                // Link asChild throws on an array style — flatten (docs/ux-design.md §5).
                style={StyleSheet.flatten([styles.editButton, { backgroundColor: theme.backgroundElement, borderColor: theme.border }])}>
                <Ionicons name="create-outline" size={16} color={theme.text} />
                <ThemedText type="smallBold">수정</ThemedText>
              </Pressable>
            </Link>
          ),
        }}
      />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: bottomInset + 80 }]}
        showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeInDown.springify().damping(18)} style={styles.hero}>
          <View style={[styles.heroIcon, { backgroundColor: habit.color, boxShadow: tintedShadow(habit.color, 0.4) }]}>
            <Text style={styles.heroEmoji}>{habit.icon}</Text>
          </View>
          <View style={styles.heroText}>
            <ThemedText style={styles.heroName} numberOfLines={2}>
              {habit.name}
            </ThemedText>
            <View style={styles.heroMeta}>
              <View style={[styles.heroChip, { backgroundColor: theme.backgroundSelected }]}>
                <Ionicons name="repeat" size={12} color={theme.textSecondary} />
                <ThemedText type="small" themeColor="textSecondary" style={styles.heroChipText}>
                  {frequencyLabel(habit)}
                </ThemedText>
              </View>
              {current > 0 ? (
                <View style={[styles.heroChip, { backgroundColor: theme.backgroundSelected }]}>
                  <ThemedText type="small" style={styles.heroChipText}>
                    🔥 {current}
                  </ThemedText>
                </View>
              ) : null}
            </View>
          </View>
        </Animated.View>

        <Animated.View
          entering={FadeInDown.delay(60).springify().damping(18)}
          style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
          <View style={styles.monthHeader}>
            <PressableScale
              hapticKind="selection"
              accessibilityLabel="이전 달"
              onPress={() => goToMonth(-1)}
              style={[styles.navButton, { backgroundColor: theme.backgroundSelected }]}>
              <Ionicons name="chevron-back" size={16} color={theme.text} />
            </PressableScale>
            <ThemedText type="smallBold">{format(month, 'yyyy년 M월', { locale: ko })}</ThemedText>
            <PressableScale
              hapticKind="selection"
              accessibilityLabel="다음 달"
              onPress={() => goToMonth(1)}
              style={[styles.navButton, { backgroundColor: theme.backgroundSelected }]}>
              <Ionicons name="chevron-forward" size={16} color={theme.text} />
            </PressableScale>
          </View>

          <View style={styles.weekRow}>
            {WEEKDAY_LABELS.map((label, index) => (
              <View key={label} style={styles.dayCell}>
                <ThemedText type="small" style={index === 0 ? { color: theme.danger } : { color: theme.textSecondary }}>
                  {label}
                </ThemedText>
              </View>
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
                checkedDates={checkedDates}
                washedDates={washedDates}
                color={habit.color}
                todayStr={today}
                selectedDate={selectedDate}
                justStamped={justStamped}
                onDayPress={handleDayPress}
              />
            )}
          />

          <ThemedText type="small" themeColor="textSecondary" style={styles.monthCount}>
            {format(month, 'M월')} {monthlyCheckedCount}회 · 날짜를 두 번 탭하면 도장
          </ThemedText>

          {selectedStamp ? (
            <View style={styles.washRow}>
              <ThemedText type="small">{selectedStamp.date.replaceAll('-', '.')} 착용</ThemedText>
              <Pressable
                onPress={() => checkInRepository.update(selectedStamp.id, { washed: !selectedStamp.washed })}
                style={[
                  styles.washChip,
                  { backgroundColor: selectedStamp.washed ? habit.color : theme.background },
                ]}>
                <Ionicons name="water" size={14} color={selectedStamp.washed ? '#FFFFFF' : theme.textSecondary} />
                <ThemedText type="small" style={selectedStamp.washed ? styles.checkedDayText : undefined}>
                  {selectedStamp.washed ? '세탁함' : '세탁 안 함'}
                </ThemedText>
              </Pressable>
            </View>
          ) : null}
        </Animated.View>

        {habit.denim ? (
          <DenimCard
            denim={habit.denim}
            stamps={checkIns}
            color={habit.color}
            onChange={async (denim) => setHabit(await habitRepository.update(habit.id, { denim }))}
          />
        ) : null}

        <View style={styles.statisticSection}>
          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.statisticTitle}>
            기록
          </ThemedText>
          <View style={styles.tileRow}>
            {(
              [
                { label: '이번주', value: periodCounts.thisWeek },
                { label: '이번달', value: periodCounts.thisMonth },
                { label: '올해', value: periodCounts.thisYear },
                { label: '전체', value: periodCounts.allTime },
              ] as const
            ).map((tile) => (
              <CountTile key={tile.label} label={tile.label} value={tile.value} />
            ))}
          </View>
        </View>

        <View style={styles.streakRow}>
          <View style={[styles.streakCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <View style={styles.streakLabelRow}>
              <Ionicons name="flame" size={14} color={habit.color} />
              <ThemedText type="small" themeColor="textSecondary">
                현재 스트릭
              </ThemedText>
            </View>
            <View style={styles.streakNumberRow}>
              <ThemedText type="title" style={[styles.streakNumber, { color: habit.color }]}>
                {current}
                <ThemedText type="smallBold" themeColor="textSecondary">
                  {' '}회
                </ThemedText>
              </ThemedText>
              {isCurrentStreakRecord ? (
                <View style={[styles.recordBadge, { backgroundColor: theme.danger }]}>
                  <ThemedText type="small" style={styles.recordBadgeText}>
                    RECORD
                  </ThemedText>
                </View>
              ) : null}
            </View>
            {currentRange ? (
              <ThemedText type="small" themeColor="textSecondary">
                {formatRange(currentRange)}
              </ThemedText>
            ) : null}
          </View>
          <View style={[styles.streakCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <View style={styles.streakLabelRow}>
              <Ionicons name="trophy" size={14} color={theme.textSecondary} />
              <ThemedText type="small" themeColor="textSecondary">
                최장 스트릭
              </ThemedText>
            </View>
            <ThemedText type="title" style={styles.streakNumber}>
              {longest}
              <ThemedText type="smallBold" themeColor="textSecondary">
                {' '}회
              </ThemedText>
            </ThemedText>
            {longestRange ? (
              <ThemedText type="small" themeColor="textSecondary">
                {formatRange(longestRange)}
              </ThemedText>
            ) : null}
          </View>
        </View>
      </ScrollView>

      <JumpToTodayButton
        visible={!isCurrentMonth}
        aboveTabBar={false}
        onPress={() => {
          resetToMonth(new Date());
          setSelectedDate(null);
        }}
      />
    </ThemedView>
  );
}

function CountTile({ label, value }: { label: string; value: number }) {
  const theme = useTheme();
  const display = useCountUp(value);
  return (
    <View style={[styles.tile, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <ThemedText style={styles.tileValue}>{display}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </View>
  );
}

interface MonthGridProps {
  month: Date;
  checkedDates: Set<string>;
  /** denim habits: stamped days that were washed get a drop */
  washedDates: Set<string>;
  color: string;
  todayStr: string;
  selectedDate: string | null;
  justStamped: string | null;
  onDayPress: (dateStr: string) => void;
}

/** The DayStamps signature visual: consecutive checked days in the same week merge into one connected pill. */
function MonthGrid({ month, checkedDates, washedDates, color, todayStr, selectedDate, justStamped, onDayPress }: MonthGridProps) {
  const theme = useTheme();
  const weeks = useMemo(() => {
    const gridStart = startOfWeek(startOfMonth(month), { weekStartsOn: 0 });
    const gridEnd = endOfWeek(endOfMonth(month), { weekStartsOn: 0 });
    const days = eachDayOfInterval({ start: gridStart, end: gridEnd });
    const result: Date[][] = [];
    for (let i = 0; i < days.length; i += 7) result.push(days.slice(i, i + 7));
    return result;
  }, [month]);

  return (
    <View>
      {weeks.map((week, weekIndex) => (
        <View key={weekIndex} style={styles.weekRow}>
          {week.map((day, dayIndex) => {
            const dateStr = format(day, 'yyyy-MM-dd');
            const inMonth = isSameMonth(day, month);
            const isChecked = checkedDates.has(dateStr);
            const prevChecked = dayIndex > 0 && checkedDates.has(format(week[dayIndex - 1]!, 'yyyy-MM-dd'));
            const nextChecked = dayIndex < 6 && checkedDates.has(format(week[dayIndex + 1]!, 'yyyy-MM-dd'));
            const isToday = dateStr === todayStr;
            const isSelected = dateStr === selectedDate;
            const isFuture = dateStr > todayStr;

            return (
              <View key={dateStr} style={styles.dayCell}>
                <Pressable disabled={isFuture} onPress={() => onDayPress(dateStr)} style={styles.dayCellPressable}>
                  <Animated.View
                    key={isChecked && justStamped === dateStr ? 'stamped' : 'idle'}
                    entering={isChecked && justStamped === dateStr ? ZoomIn.springify().damping(11).stiffness(260) : undefined}
                    style={[
                      styles.dayPill,
                      isChecked && {
                        backgroundColor: color,
                        marginLeft: prevChecked ? 0 : 3,
                        marginRight: nextChecked ? 0 : 3,
                        borderTopLeftRadius: prevChecked ? 0 : 999,
                        borderBottomLeftRadius: prevChecked ? 0 : 999,
                        borderTopRightRadius: nextChecked ? 0 : 999,
                        borderBottomRightRadius: nextChecked ? 0 : 999,
                      },
                      !isChecked && isToday && { borderWidth: 1.5, borderColor: color, borderRadius: 999 },
                      isSelected && { borderWidth: 2, borderColor: theme.text, borderRadius: 999 },
                    ]}>
                    <ThemedText
                      style={
                        isFuture
                          ? { color: theme.textSecondary, opacity: 0.3 }
                          : !inMonth
                            ? { color: theme.textSecondary, opacity: 0.4 }
                            : isChecked
                              ? styles.checkedDayText
                              : undefined
                      }>
                      {format(day, 'd')}
                    </ThemedText>
                    {isChecked && washedDates.has(dateStr) ? (
                      <Ionicons name="water" size={9} color="#FFFFFF" style={styles.washDrop} />
                    ) : null}
                  </Animated.View>
                </Pressable>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  editButton: {
    marginRight: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  scroll: { padding: SCREEN_PADDING, paddingTop: 8, gap: 16 },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 4 },
  heroIcon: { width: 64, height: 64, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  heroEmoji: { fontSize: 32, lineHeight: 40 },
  heroText: { flex: 1, gap: 6 },
  heroName: { fontSize: 24, lineHeight: 30, fontFamily: 'NotoSansKR_700Bold', letterSpacing: -0.5 },
  heroMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  heroChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  heroChipText: { fontSize: 12, lineHeight: 16 },
  card: { borderRadius: 24, borderWidth: 1, padding: CARD_HORIZONTAL_PADDING },
  monthHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  navButton: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  monthCount: { textAlign: 'center', marginTop: 10 },
  weekRow: { flexDirection: 'row' },
  dayCell: { flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  dayCellPressable: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center' },
  dayPill: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center', borderRadius: 999 },
  checkedDayText: { color: '#FFFFFF', fontFamily: 'NotoSansKR_700Bold' },
  washDrop: { position: 'absolute', top: 4, right: 8 },
  washRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 10 },
  washChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14 },
  streakRow: { flexDirection: 'row', gap: 10 },
  streakCard: { flex: 1, borderRadius: 22, borderWidth: 1, padding: 16, gap: 6 },
  streakLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  streakNumberRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  recordBadge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  recordBadgeText: { color: '#FFFFFF', fontSize: 10.5, lineHeight: 15, fontFamily: 'NotoSansKR_700Bold' },
  streakNumber: { fontSize: 36, lineHeight: 42, letterSpacing: -0.8 },
  statisticSection: { gap: 8 },
  statisticTitle: { marginLeft: 4 },
  tileRow: { flexDirection: 'row', gap: 8 },
  tile: { flex: 1, borderRadius: 18, borderWidth: 1, paddingVertical: 14, alignItems: 'center', gap: 2 },
  tileValue: { fontSize: 22, lineHeight: 28, fontFamily: 'NotoSansKR_700Bold', letterSpacing: -0.4 },
});
