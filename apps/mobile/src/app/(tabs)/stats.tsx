import { useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { format, startOfMonth, startOfWeek, startOfYear, subDays } from 'date-fns';
import type { CheckIn, Habit } from '@habit-tracker/core';
import { calculateStreak } from '@habit-tracker/core';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useTheme } from '@/hooks/use-theme';
import { habitRepository, checkInRepository } from '@/composition/container';

const LOOKBACK_DAYS = 90;

interface HabitStat {
  habit: Habit;
  currentStreak: number;
  longestStreak: number;
  completionRate: number;
}

function useSummaryTiles(allCheckIns: readonly CheckIn[]) {
  return useMemo(() => {
    const now = new Date();
    const weekStart = format(startOfWeek(now, { weekStartsOn: 0 }), 'yyyy-MM-dd');
    const monthStart = format(startOfMonth(now), 'yyyy-MM-dd');
    const yearStart = format(startOfYear(now), 'yyyy-MM-dd');
    return {
      thisWeek: allCheckIns.filter((c) => c.date >= weekStart).length,
      thisMonth: allCheckIns.filter((c) => c.date >= monthStart).length,
      thisYear: allCheckIns.filter((c) => c.date >= yearStart).length,
      allTime: allCheckIns.length,
    };
  }, [allCheckIns]);
}

export default function StatsScreen() {
  const theme = useTheme();
  const [habits, setHabits] = useState<readonly Habit[]>([]);
  const [allCheckIns, setAllCheckIns] = useState<readonly CheckIn[]>([]);

  // observeAll (not a one-shot listAll) so this screen re-renders the moment
  // any check-in changes, even from another screen — see docs/architecture.md.
  useEffect(() => habitRepository.observe().subscribe(setHabits), []);
  useEffect(() => checkInRepository.observeAll().subscribe(setAllCheckIns), []);

  const tiles = useSummaryTiles(allCheckIns);

  const stats: HabitStat[] = useMemo(() => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const rangeStart = format(subDays(new Date(), LOOKBACK_DAYS), 'yyyy-MM-dd');

    return habits.map((habit) => {
      const dates = allCheckIns
        .filter((checkIn) => checkIn.habitId === habit.id && checkIn.date >= rangeStart)
        .map((checkIn) => checkIn.date);
      const { current, longest } = calculateStreak(dates, today);
      const completionRate = Math.round((dates.length / LOOKBACK_DAYS) * 100);
      return { habit, currentStreak: current, longestStreak: longest, completionRate };
    });
  }, [habits, allCheckIns]);

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title">통계</ThemedText>

      <View style={styles.tileRow}>
        {[
          { label: '이번주', value: tiles.thisWeek },
          { label: '이번달', value: tiles.thisMonth },
          { label: '올해', value: tiles.thisYear },
          { label: '전체', value: tiles.allTime },
        ].map((tile) => (
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
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  empty: { marginTop: 24 },
  tileRow: { flexDirection: 'row', gap: 10, marginTop: 16, marginBottom: 20 },
  tile: { flex: 1, borderRadius: 16, paddingVertical: 14, alignItems: 'center', gap: 2 },
  tileValue: { fontSize: 24, lineHeight: 28 },
  list: { paddingBottom: 40, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, padding: 14 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  rowInfo: { flex: 1, gap: 2 },
  rowName: { fontWeight: '600' },
});
