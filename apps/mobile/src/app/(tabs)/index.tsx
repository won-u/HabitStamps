import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { format, subDays } from 'date-fns';
import { ko } from 'date-fns/locale';
import type { Category } from '@habit-tracker/core';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { HabitCard } from '@/components/habit-card';
import { DatePickerModal } from '@/components/date-picker-modal';
import { useTheme } from '@/hooks/use-theme';
import { useToday, type TodayHabit } from '@/features/today/use-today';
import { categoryRepository } from '@/composition/container';

const DATE_STRIP_DAYS = 10;
const DEFAULT_GROUP_KEY = '__default__';

interface Group {
  key: string;
  name: string;
  items: TodayHabit[];
}

export default function TodayScreen() {
  const theme = useTheme();
  const { today, viewedDate, setViewedDate, items, toggleCheckIn } = useToday();
  const [categories, setCategories] = useState<readonly Category[]>([]);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [datePickerVisible, setDatePickerVisible] = useState(false);

  useEffect(() => categoryRepository.observe().subscribe(setCategories), []);

  const strip = useMemo(() => {
    const base = new Date(today);
    return Array.from({ length: DATE_STRIP_DAYS }, (_, index) => {
      const date = subDays(base, DATE_STRIP_DAYS - 1 - index);
      return {
        dateStr: format(date, 'yyyy-MM-dd'),
        weekdayLabel: format(date, 'EEEEE', { locale: ko }),
        dayNumber: format(date, 'd'),
      };
    });
  }, [today]);

  const groups = useMemo<Group[]>(() => {
    const byCategory = new Map<string, TodayHabit[]>();
    for (const item of items) {
      const key = item.habit.categoryId ?? DEFAULT_GROUP_KEY;
      const bucket = byCategory.get(key);
      if (bucket) bucket.push(item);
      else byCategory.set(key, [item]);
    }

    const result: Group[] = [];
    const defaultItems = byCategory.get(DEFAULT_GROUP_KEY);
    if (defaultItems) result.push({ key: DEFAULT_GROUP_KEY, name: '기본', items: defaultItems });
    for (const category of categories) {
      const bucket = byCategory.get(category.id);
      if (bucket) result.push({ key: category.id, name: category.name, items: bucket });
    }
    return result;
  }, [items, categories]);

  function toggleGroupCollapsed(key: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const viewedDateObj = new Date(viewedDate);
  const completedCount = items.filter((item) => item.isCheckedForViewedDate).length;

  return (
    <ThemedView style={styles.container}>
      <View style={styles.headerRow}>
        <Pressable style={styles.headerDate} onPress={() => setDatePickerVisible(true)} hitSlop={8}>
          <ThemedText type="title" style={styles.headerDateText}>
            {format(viewedDateObj, 'M월 d일', { locale: ko })}
          </ThemedText>
          <View style={[styles.weekdayBadge, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText type="smallBold">{format(viewedDateObj, 'EEE').toUpperCase()}</ThemedText>
          </View>
        </Pressable>

        <View style={styles.headerActions}>
          <Link href="/report" asChild>
            <Pressable hitSlop={8} style={styles.headerIconButton}>
              <Ionicons name="stats-chart-outline" size={22} color={theme.text} />
            </Pressable>
          </Link>
          <Link href="/habit/new" asChild>
            <Pressable hitSlop={8} style={styles.headerIconButton}>
              <Ionicons name="add" size={24} color={theme.text} />
            </Pressable>
          </Link>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.stripContent}
        style={styles.strip}>
        {strip.map((day) => {
          const isSelected = day.dateStr === viewedDate;
          const isToday = day.dateStr === today;
          return (
            <Pressable
              key={day.dateStr}
              onPress={() => setViewedDate(day.dateStr)}
              style={[
                styles.stripDay,
                {
                  backgroundColor: theme.backgroundElement,
                  borderColor: isSelected ? theme.text : 'transparent',
                },
              ]}>
              <ThemedText type="small" themeColor="textSecondary">
                {day.weekdayLabel}
              </ThemedText>
              <ThemedText type={isToday ? 'smallBold' : 'default'}>{day.dayNumber}</ThemedText>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.listHeader}>
        <ThemedText type="subtitle">오늘</ThemedText>
        {items.length > 0 ? (
          <ThemedText themeColor="textSecondary">
            {completedCount}/{items.length}
          </ThemedText>
        ) : null}
      </View>

      {items.length === 0 ? (
        <View style={styles.empty}>
          <ThemedText type="subtitle">아직 만든 습관이 없어요</ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.emptySubtitle}>
            작은 습관 하나부터 시작해볼까요?
          </ThemedText>
          <Link href="/habit/new" asChild>
            <Pressable style={StyleSheet.flatten([styles.cta, { backgroundColor: theme.text }])}>
              <ThemedText style={{ color: theme.background }}>습관 만들기</ThemedText>
            </Pressable>
          </Link>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {groups.map((group) => {
            const isCollapsed = collapsedGroups.has(group.key);
            const groupCompleted = group.items.filter((item) => item.isCheckedForViewedDate).length;
            return (
              <View key={group.key} style={styles.groupSection}>
                <Pressable style={styles.groupHeader} onPress={() => toggleGroupCollapsed(group.key)}>
                  <Ionicons name={isCollapsed ? 'chevron-forward' : 'chevron-down'} size={16} color={theme.textSecondary} />
                  <ThemedText type="smallBold" style={styles.groupTitle}>
                    {group.name}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {groupCompleted}/{group.items.length}
                  </ThemedText>
                </Pressable>
                {isCollapsed
                  ? null
                  : group.items.map((item) => (
                      <HabitCard key={item.habit.id} item={item} onToggle={() => toggleCheckIn(item.habit)} />
                    ))}
              </View>
            );
          })}
        </ScrollView>
      )}

      <Link href="/habit/new" asChild>
        <Pressable style={StyleSheet.flatten([styles.fab, { backgroundColor: theme.text }])}>
          <Ionicons name="add" size={28} color={theme.background} />
        </Pressable>
      </Link>

      <DatePickerModal
        visible={datePickerVisible}
        initialDate={viewedDate}
        onClose={() => setDatePickerVisible(false)}
        onSelect={setViewedDate}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 20 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  headerDate: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerDateText: { fontSize: 30, lineHeight: 34 },
  weekdayBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  headerActions: { flexDirection: 'row', gap: 4 },
  headerIconButton: { padding: 6 },
  strip: { marginTop: 16, flexGrow: 0 },
  stripContent: { paddingHorizontal: 20, gap: 8 },
  stripDay: {
    width: 52,
    height: 64,
    borderRadius: 16,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: 20,
    marginBottom: 4,
    paddingHorizontal: 20,
  },
  list: { paddingHorizontal: 20, paddingBottom: 100 },
  groupSection: { marginTop: 16 },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  groupTitle: { flex: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptySubtitle: { marginTop: 8, marginBottom: 20, textAlign: 'center' },
  cta: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24 },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
});
