import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Link, Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
} from 'date-fns';
import { ko } from 'date-fns/locale';
import type { CheckIn, Habit } from '@habit-tracker/core';
import { calculateStreak } from '@habit-tracker/core';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useTheme } from '@/hooks/use-theme';
import { useSwipeNavigation } from '@/hooks/use-swipe-navigation';
import { habitRepository, checkInRepository } from '@/composition/container';

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];
const STREAK_LOOKBACK_DAYS = 400;

export default function HabitDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const [habit, setHabit] = useState<Habit | null>(null);
  const [checkIns, setCheckIns] = useState<readonly CheckIn[]>([]);
  const [month, setMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  useEffect(() => {
    habitRepository.getById(id).then(setHabit);
  }, [id]);

  useEffect(() => checkInRepository.observeByHabit(id).subscribe(setCheckIns), [id]);

  const today = format(new Date(), 'yyyy-MM-dd');
  const checkedDates = useMemo(() => new Set(checkIns.map((checkIn) => checkIn.date)), [checkIns]);

  const { current, longest } = useMemo(() => {
    const rangeStart = format(subDays(new Date(today), STREAK_LOOKBACK_DAYS), 'yyyy-MM-dd');
    const dates = [...checkedDates].filter((date) => date >= rangeStart);
    return calculateStreak(dates, today);
  }, [checkedDates, today]);

  const monthlyCheckedCount = useMemo(() => {
    const monthPrefix = format(month, 'yyyy-MM');
    return [...checkedDates].filter((date) => date.startsWith(monthPrefix)).length;
  }, [checkedDates, month]);

  const swipeHandlers = useSwipeNavigation(
    () => setMonth((m) => addMonths(m, 1)),
    () => setMonth((m) => subMonths(m, 1)),
  );
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
      setSelectedDate(dateStr);
      return;
    }
    const existing = await checkInRepository.getByHabitAndDate(habit.id, dateStr);
    if (existing) {
      await checkInRepository.softDelete(existing.id);
    } else {
      await checkInRepository.create({ habitId: habit.id, date: dateStr, completedAt: new Date().toISOString() });
    }
  }

  if (!habit) return null;

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{
          title: habit.name,
          headerRight: () => (
            <Link href={{ pathname: '/habit/[id]/edit', params: { id: habit.id } }} asChild>
              <Pressable hitSlop={8}>
                <Ionicons name="create-outline" size={22} color={theme.text} />
              </Pressable>
            </Link>
          ),
        }}
      />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
          <View style={styles.monthHeader}>
            <Pressable onPress={() => setMonth((m) => subMonths(m, 1))} hitSlop={8}>
              <Ionicons name="chevron-back" size={20} color={theme.text} />
            </Pressable>
            <ThemedText type="smallBold">{format(month, 'yyyy년 M월', { locale: ko })}</ThemedText>
            <Pressable onPress={() => setMonth((m) => addMonths(m, 1))} hitSlop={8}>
              <Ionicons name="chevron-forward" size={20} color={theme.text} />
            </Pressable>
          </View>

          <View {...swipeHandlers}>
            <MonthGrid
              month={month}
              checkedDates={checkedDates}
              color={habit.color}
              todayStr={today}
              selectedDate={selectedDate}
              onDayPress={handleDayPress}
            />
          </View>

          <ThemedText themeColor="textSecondary" style={styles.monthCount}>
            이번 달 {monthlyCheckedCount}회 체크인
          </ThemedText>
        </View>

        <View style={styles.streakRow}>
          <View style={[styles.streakCard, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText type="small" themeColor="textSecondary">
              현재 스트릭
            </ThemedText>
            <ThemedText type="title" style={[styles.streakNumber, { color: habit.color }]}>
              {current}
            </ThemedText>
          </View>
          <View style={[styles.streakCard, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText type="small" themeColor="textSecondary">
              최장 스트릭
            </ThemedText>
            <ThemedText type="title" style={styles.streakNumber}>
              {longest}
            </ThemedText>
          </View>
        </View>
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

interface MonthGridProps {
  month: Date;
  checkedDates: Set<string>;
  color: string;
  todayStr: string;
  selectedDate: string | null;
  onDayPress: (dateStr: string) => void;
}

/** The DayStamps signature visual: consecutive checked days in the same week merge into one connected pill. */
function MonthGrid({ month, checkedDates, color, todayStr, selectedDate, onDayPress }: MonthGridProps) {
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
      <View style={styles.weekRow}>
        {WEEKDAY_LABELS.map((label, index) => (
          <View key={label} style={styles.dayCell}>
            <ThemedText type="small" style={index === 0 ? { color: '#E85D75' } : { color: theme.textSecondary }}>
              {label}
            </ThemedText>
          </View>
        ))}
      </View>

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
                  <View
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
                      !isChecked && isToday && { borderWidth: 1.5, borderColor: theme.textSecondary, borderRadius: 999 },
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
                  </View>
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
  scroll: { padding: 20, gap: 16 },
  card: { borderRadius: 20, padding: 16 },
  monthHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  monthCount: { textAlign: 'center', marginTop: 8 },
  weekRow: { flexDirection: 'row' },
  dayCell: { flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  dayCellPressable: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center' },
  dayPill: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center', borderRadius: 999 },
  checkedDayText: { color: '#FFFFFF', fontWeight: '700' },
  streakRow: { flexDirection: 'row', gap: 12 },
  streakCard: { flex: 1, borderRadius: 20, padding: 16, gap: 6 },
  streakNumber: { fontSize: 36, lineHeight: 40 },
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
