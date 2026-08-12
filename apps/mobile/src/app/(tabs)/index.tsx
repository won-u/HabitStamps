import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import { Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { format, subDays } from 'date-fns';
import { ko } from 'date-fns/locale';
import type { Category } from '@habit-tracker/core';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { HabitCard } from '@/components/habit-card';
import { DatePickerModal } from '@/components/date-picker-modal';
import { ReorderableList } from '@/components/reorderable-list';
import { useTheme } from '@/hooks/use-theme';
import { useToday, type TodayHabit } from '@/features/today/use-today';
import { categoryRepository, habitRepository } from '@/composition/container';
import { useSettingsStore } from '@/state/settings-store';

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
  const stripRef = useRef<ScrollView>(null);
  const defaultGroupSortOrder = useSettingsStore((state) => state.defaultGroupSortOrder);
  const setDefaultGroupSortOrder = useSettingsStore((state) => state.setDefaultGroupSortOrder);

  useEffect(() => categoryRepository.observe().subscribe(setCategories), []);

  // The strip ends on `today`, so a fresh mount otherwise leaves the
  // ScrollView at its default (leftmost) offset — showing only past days with
  // today itself scrolled off the right edge.
  useEffect(() => {
    stripRef.current?.scrollToEnd({ animated: false });
  }, []);

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
    const knownCategoryIds = new Set(categories.map((category) => category.id));
    const byCategory = new Map<string, TodayHabit[]>();
    for (const item of items) {
      const categoryId = item.habit.categoryId;
      // Categories are local-only (never part of SyncGateway), so a habit
      // synced from another device can reference a category id this device
      // has never heard of — fall back to the default group instead of
      // silently dropping the habit from the list.
      const key = categoryId && knownCategoryIds.has(categoryId) ? categoryId : DEFAULT_GROUP_KEY;
      const bucket = byCategory.get(key);
      if (bucket) bucket.push(item);
      else byCategory.set(key, [item]);
    }

    // "기본" isn't a Category row (no synced sortOrder of its own), so its
    // position among the real categories is tracked as a local preference
    // and merged into the same numeric ordering space here.
    const entries: { sortOrder: number; group: Group }[] = [];
    const defaultItems = byCategory.get(DEFAULT_GROUP_KEY);
    if (defaultItems) {
      entries.push({ sortOrder: defaultGroupSortOrder, group: { key: DEFAULT_GROUP_KEY, name: '기본', items: defaultItems } });
    }
    for (const category of categories) {
      const bucket = byCategory.get(category.id);
      if (bucket) entries.push({ sortOrder: category.sortOrder, group: { key: category.id, name: category.name, items: bucket } });
    }
    entries.sort((a, b) => a.sortOrder - b.sortOrder);
    return entries.map((entry) => entry.group);
  }, [items, categories, defaultGroupSortOrder]);

  function toggleGroupCollapsed(key: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  /** Reassigns every habit's sortOrder from its position in the given group
   * sequence, flattened top-to-bottom — keeps flat views (e.g. the archive
   * screen) consistent with whatever order is shown here, regardless of
   * whether the drag that triggered this reordered groups or reordered
   * items within one group. */
  function persistFlatHabitOrder(groupsInOrder: Group[]) {
    let index = 0;
    for (const group of groupsInOrder) {
      for (const item of group.items) {
        void habitRepository.update(item.habit.id, { sortOrder: index });
        index++;
      }
    }
  }

  function handleReorderGroups(newGroups: Group[]) {
    newGroups.forEach((group, index) => {
      if (group.key === DEFAULT_GROUP_KEY) setDefaultGroupSortOrder(index);
      else void categoryRepository.update(group.key, { sortOrder: index });
    });
    persistFlatHabitOrder(newGroups);
  }

  function handleReorderItemsInGroup(groupKey: string, newItems: TodayHabit[]) {
    persistFlatHabitOrder(groups.map((group) => (group.key === groupKey ? { ...group, items: newItems } : group)));
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
          <Link href="/stats" asChild>
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
        ref={stripRef}
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
        <ScrollView style={styles.listScroll} contentContainerStyle={styles.list}>
          <ReorderableList
            data={groups}
            keyExtractor={(group) => group.key}
            onReorder={handleReorderGroups}
            renderItem={(group, dragHandle) => {
              const isCollapsed = collapsedGroups.has(group.key);
              const groupCompleted = group.items.filter((item) => item.isCheckedForViewedDate).length;
              // 웹은 헤더 전체가 아니라 전용 손잡이 아이콘만 드래그 영역으로 쓴다
              // — components/reorderable-list.tsx의 DragHandle 문서 참고
              // (react-native-gesture-handler의 웹 구현이 스크롤 가능한
              // ScrollView 안에서 Pan+activateAfterLongPress를 지원 못 하는
              // 알려진 미해결 이슈라, 헤더 전체를 감싸는 한 근본적으로
              // 못 고친다). 네이티브는 기존처럼 헤더 전체 롱프레스로 동작.
              const headerContent = (
                <>
                  <Ionicons name={isCollapsed ? 'chevron-forward' : 'chevron-down'} size={16} color={theme.textSecondary} />
                  <ThemedText type="smallBold" style={styles.groupTitle}>
                    {group.name}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {groupCompleted}/{group.items.length}
                  </ThemedText>
                  {Platform.OS === 'web' ? (
                    <GestureDetector gesture={dragHandle.gesture}>
                      <View hitSlop={8} style={styles.groupDragHandle}>
                        <Ionicons name="reorder-three" size={20} color={theme.textSecondary} />
                      </View>
                    </GestureDetector>
                  ) : null}
                </>
              );
              const header = (
                <Pressable
                  style={[styles.groupHeader, dragHandle.isDragging ? { opacity: 0.6 } : null]}
                  onPress={() => toggleGroupCollapsed(group.key)}>
                  {headerContent}
                </Pressable>
              );
              return (
                <View style={styles.groupSection}>
                  {Platform.OS === 'web' ? header : <GestureDetector gesture={dragHandle.gesture}>{header}</GestureDetector>}
                  {isCollapsed ? null : (
                    <ReorderableList
                      data={group.items}
                      keyExtractor={(item) => item.habit.id}
                      onReorder={(newItems) => handleReorderItemsInGroup(group.key, newItems)}
                      renderItem={(item, itemHandle) =>
                        Platform.OS === 'web' ? (
                          <HabitCard item={item} onToggle={() => toggleCheckIn(item.habit)} dragHandle={itemHandle} />
                        ) : (
                          <GestureDetector gesture={itemHandle.gesture}>
                            <View style={itemHandle.isDragging ? styles.draggingItem : null}>
                              <HabitCard item={item} onToggle={() => toggleCheckIn(item.habit)} />
                            </View>
                          </GestureDetector>
                        )
                      }
                    />
                  )}
                </View>
              );
            }}
          />
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
    flexShrink: 0,
  },
  headerDate: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerDateText: { fontSize: 30, lineHeight: 34 },
  weekdayBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  headerActions: { flexDirection: 'row', gap: 4 },
  headerIconButton: { padding: 6 },
  strip: { marginTop: 16, flexGrow: 0, flexShrink: 0 },
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
    flexShrink: 0,
  },
  listScroll: { flex: 1 },
  list: { paddingHorizontal: 20, paddingBottom: 100 },
  groupSection: { marginTop: 16 },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  draggingItem: { opacity: 0.85 },
  groupTitle: { flex: 1 },
  groupDragHandle: { padding: 2 },
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
