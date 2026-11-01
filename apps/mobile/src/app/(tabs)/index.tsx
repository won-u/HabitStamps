import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { differenceInCalendarDays, format, subDays } from 'date-fns';
import { ko } from 'date-fns/locale';
import type { Category } from '@habit-tracker/core';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { HabitCard } from '@/components/habit-card';
import { DatePickerModal } from '@/components/date-picker-modal';
import { ReorderableList, wasDragJustEnded } from '@/components/reorderable-list';
import { Celebration } from '@/components/celebration';
import { PressableScale } from '@/components/ui/pressable-scale';
import { ProgressBar } from '@/components/ui/progress-bar';
import { useTabBarSpace } from '@/hooks/use-bottom-inset';
import { haptic } from '@/lib/haptics';
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
  const insets = useSafeAreaInsets();
  const { today, viewedDate, setViewedDate, items, toggleCheckIn } = useToday();
  const [categories, setCategories] = useState<readonly Category[]>([]);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [celebration, setCelebration] = useState(0);
  const tabBarSpace = useTabBarSpace();
  const stripRef = useRef<ScrollView>(null);
  const defaultGroupSortOrder = useSettingsStore((state) => state.defaultGroupSortOrder);
  const setDefaultGroupSortOrder = useSettingsStore((state) => state.setDefaultGroupSortOrder);

  useEffect(() => categoryRepository.observe().subscribe(setCategories), []);

  // The strip ends on `today`, so a fresh mount otherwise leaves the
  // ScrollView at its default (leftmost) offset — showing only past days with
  // today itself scrolled off the right edge. A mount-time effect isn't
  // reliable for this: it can fire before the ScrollView has actually
  // measured its (font-dependent) content width, computing scrollToEnd
  // against a too-small width and landing short of the real end — reported
  // on a real device (web) as the strip showing several days *before* the
  // current week instead of ending on today. `onContentSizeChange` fires
  // whenever the actual content size is known, which is the correct signal
  // to scroll on.
  function handleStripContentSizeChange() {
    stripRef.current?.scrollToEnd({ animated: false });
  }

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
      // Categories are their own sync entity (pushed/pulled independently
      // of habits), so a habit synced from another device can arrive before
      // its category row does, or reference one this device never pulls —
      // fall back to the default group instead of silently dropping the
      // habit from the list.
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
   * items within one group.
   *
   * Only writes habits whose sortOrder actually changed (most drags move one
   * item — rewriting all of them bumps updatedAt/version on rows nothing
   * happened to, for no reason), and awaits every write via `Promise.all`
   * before returning instead of firing them and moving on — a burst of
   * unawaited writes racing the debounced auto-sync could let a push go out
   * with only some of them applied, reported as the reordered list
   * occasionally reverting a moment after the drop. */
  async function persistFlatHabitOrder(groupsInOrder: Group[]) {
    const updates: Promise<unknown>[] = [];
    let index = 0;
    for (const group of groupsInOrder) {
      for (const item of group.items) {
        if (item.habit.sortOrder !== index) updates.push(habitRepository.update(item.habit.id, { sortOrder: index }));
        index++;
      }
    }
    await Promise.all(updates);
  }

  function handleReorderGroups(newGroups: Group[]) {
    newGroups.forEach((group, index) => {
      if (group.key === DEFAULT_GROUP_KEY) setDefaultGroupSortOrder(index);
      else void categoryRepository.update(group.key, { sortOrder: index });
    });
    void persistFlatHabitOrder(newGroups);
  }

  function handleReorderItemsInGroup(groupKey: string, newItems: TodayHabit[]) {
    void persistFlatHabitOrder(groups.map((group) => (group.key === groupKey ? { ...group, items: newItems } : group)));
  }

  const viewedDateObj = new Date(viewedDate);
  const completedCount = items.filter((item) => item.isCheckedForViewedDate).length;
  const progress = items.length > 0 ? completedCount / items.length : 0;
  const dayDiff = differenceInCalendarDays(new Date(today), viewedDateObj);
  const title = dayDiff === 0 ? '오늘' : dayDiff === 1 ? '어제' : format(viewedDateObj, 'M월 d일', { locale: ko });

  async function handleToggle(item: TodayHabit) {
    const completesDay = !item.isCheckedForViewedDate && completedCount + 1 === items.length;
    await toggleCheckIn(item.habit);
    if (completesDay) {
      haptic('success');
      setCelebration((n) => n + 1);
    }
  }

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top + 12 }]}>
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <Pressable style={styles.headerDate} onPress={() => setDatePickerVisible(true)} hitSlop={8}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              {format(viewedDateObj, 'M월 d일 EEEE', { locale: ko })}
            </ThemedText>
            <Ionicons name="chevron-down" size={14} color={theme.textSecondary} />
          </Pressable>
          <ThemedText type="title" style={styles.headerTitle}>
            {title}
          </ThemedText>
        </View>
        <PressableScale
          hapticKind="selection"
          accessibilityLabel="날짜 선택"
          onPress={() => setDatePickerVisible(true)}
          style={[styles.headerIconButton, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
          <Ionicons name="calendar-clear-outline" size={20} color={theme.text} />
        </PressableScale>
      </View>

      <ScrollView
        ref={stripRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        onContentSizeChange={handleStripContentSizeChange}
        contentContainerStyle={styles.stripContent}
        style={styles.strip}>
        {strip.map((day) => {
          const isSelected = day.dateStr === viewedDate;
          const isToday = day.dateStr === today;
          return (
            <PressableScale
              key={day.dateStr}
              activeScale={0.92}
              hapticKind={isSelected ? false : 'selection'}
              onPress={() => setViewedDate(day.dateStr)}
              style={[
                styles.stripDay,
                isSelected
                  ? { backgroundColor: theme.text, borderColor: theme.text }
                  : { backgroundColor: theme.backgroundElement, borderColor: theme.border },
              ]}>
              <ThemedText type="small" style={[styles.stripWeekday, { color: isSelected ? theme.background : theme.textSecondary }]}>
                {day.weekdayLabel}
              </ThemedText>
              <ThemedText style={[styles.stripNumber, { color: isSelected ? theme.background : theme.text }]}>
                {day.dayNumber}
              </ThemedText>
              <View style={[styles.todayDot, { backgroundColor: isToday ? (isSelected ? theme.background : theme.accent) : 'transparent' }]} />
            </PressableScale>
          );
        })}
      </ScrollView>

      {items.length === 0 ? (
        <Animated.View entering={FadeInDown.springify().damping(18)} style={styles.empty}>
          <View style={[styles.emptyBadge, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <ThemedText style={styles.emptyEmoji}>🌱</ThemedText>
          </View>
          <ThemedText type="subtitle" style={styles.emptyTitle}>
            아직 만든 습관이 없어요
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.emptySubtitle}>
            작은 습관 하나부터 시작해볼까요?
          </ThemedText>
          <PressableScale
            hapticKind="light"
            onPress={() => router.push('/habit/new')}
            style={[styles.cta, { backgroundColor: theme.text }]}>
            <Ionicons name="add" size={18} color={theme.background} />
            <ThemedText type="smallBold" style={{ color: theme.background }}>
              습관 만들기
            </ThemedText>
          </PressableScale>
        </Animated.View>
      ) : (
        <ScrollView
          style={styles.listScroll}
          contentContainerStyle={[styles.list, { paddingBottom: tabBarSpace }]}
          showsVerticalScrollIndicator={false}>
          <Animated.View
            entering={FadeInDown.springify().damping(18)}
            style={[styles.progressCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <View style={styles.progressTop}>
              <View style={styles.progressText}>
                <ThemedText type="small" themeColor="textSecondary">
                  {dayDiff === 0 ? '오늘의 진행' : `${title}의 기록`}
                </ThemedText>
                <ThemedText style={styles.progressMessage}>{progressMessage(completedCount, items.length)}</ThemedText>
              </View>
              <View style={styles.progressCount}>
                <ThemedText style={styles.progressBig}>{completedCount}</ThemedText>
                <ThemedText themeColor="textSecondary" style={styles.progressTotal}>
                  /{items.length}
                </ThemedText>
              </View>
            </View>
            <ProgressBar progress={progress} color={progress >= 1 ? theme.text : theme.accent} height={8} />
          </Animated.View>

          <ReorderableList
            data={groups}
            keyExtractor={(group) => group.key}
            onReorder={handleReorderGroups}
            renderItem={(group, dragHandle) => {
              const isCollapsed = collapsedGroups.has(group.key);
              const groupCompleted = group.items.filter((item) => item.isCheckedForViewedDate).length;
              const groupIndex = groups.indexOf(group);
              // 웹은 헤더 전체가 아니라 전용 손잡이 아이콘만 드래그 영역으로 쓴다
              // — components/reorderable-list.tsx의 DragHandle 문서 참고
              // (react-native-gesture-handler의 웹 구현이 스크롤 가능한
              // ScrollView 안에서 Pan+activateAfterLongPress를 지원 못 하는
              // 알려진 미해결 이슈라, 헤더 전체를 감싸는 한 근본적으로
              // 못 고친다). 네이티브는 기존처럼 헤더 전체 롱프레스로 동작.
              const headerContent = (
                <>
                  <ThemedText type="smallBold" style={styles.groupTitle}>
                    {group.name}
                  </ThemedText>
                  <View
                    style={[
                      styles.groupCount,
                      { backgroundColor: groupCompleted === group.items.length ? theme.text : theme.backgroundSelected },
                    ]}>
                    <ThemedText
                      style={[
                        styles.groupCountText,
                        { color: groupCompleted === group.items.length ? theme.background : theme.textSecondary },
                      ]}>
                      {groupCompleted}/{group.items.length}
                    </ThemedText>
                  </View>
                  <View style={styles.groupSpacer} />
                  {Platform.OS === 'web' ? (
                    <GestureDetector gesture={dragHandle.gesture}>
                      <View hitSlop={8} style={styles.groupDragHandle}>
                        <Ionicons name="reorder-three" size={20} color={theme.textSecondary} />
                      </View>
                    </GestureDetector>
                  ) : null}
                  <Ionicons name={isCollapsed ? 'chevron-forward' : 'chevron-down'} size={16} color={theme.textSecondary} />
                </>
              );
              const header = (
                <Pressable
                  style={[styles.groupHeader, dragHandle.isDragging ? { opacity: 0.6 } : null]}
                  onPress={() => {
                    if (wasDragJustEnded()) return;
                    haptic('selection');
                    toggleGroupCollapsed(group.key);
                  }}>
                  {headerContent}
                </Pressable>
              );
              return (
                <Animated.View
                  entering={FadeInDown.delay(80 + Math.max(0, groupIndex) * 70).springify().damping(18)}
                  style={styles.groupSection}>
                  {Platform.OS === 'web' ? header : <GestureDetector gesture={dragHandle.gesture}>{header}</GestureDetector>}
                  {isCollapsed ? null : (
                    <Animated.View entering={FadeIn.duration(220)}>
                      <ReorderableList
                        data={group.items}
                        keyExtractor={(item) => item.habit.id}
                        onReorder={(newItems) => handleReorderItemsInGroup(group.key, newItems)}
                        renderItem={(item, itemHandle) =>
                          Platform.OS === 'web' ? (
                            <HabitCard item={item} onToggle={() => void handleToggle(item)} dragHandle={itemHandle} />
                          ) : (
                            <GestureDetector gesture={itemHandle.gesture}>
                              <View style={itemHandle.isDragging ? styles.draggingItem : null}>
                                <HabitCard item={item} onToggle={() => void handleToggle(item)} />
                              </View>
                            </GestureDetector>
                          )
                        }
                      />
                    </Animated.View>
                  )}
                </Animated.View>
              );
            }}
          />
        </ScrollView>
      )}

      <Celebration
        trigger={celebration}
        colors={items.map((item) => item.habit.color)}
        message={dayDiff === 0 ? '오늘 습관 모두 완료! 🎉' : `${title} 습관 모두 완료! 🎉`}
      />

      <DatePickerModal
        visible={datePickerVisible}
        initialDate={viewedDate}
        onClose={() => setDatePickerVisible(false)}
        onSelect={setViewedDate}
      />
    </ThemedView>
  );
}

function progressMessage(done: number, total: number): string {
  if (total === 0) return '';
  if (done === total) return '모두 완료했어요 🎉';
  if (done === 0) return '첫 도장을 찍어볼까요?';
  if (done / total >= 0.5) return `거의 다 왔어요 · ${total - done}개 남음`;
  return `좋은 출발이에요 · ${total - done}개 남음`;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: 20,
    flexShrink: 0,
  },
  headerText: { gap: 2 },
  headerDate: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerTitle: { fontSize: 34, lineHeight: 42, letterSpacing: -0.8 },
  headerIconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  strip: { marginTop: 14, flexGrow: 0, flexShrink: 0 },
  stripContent: { paddingHorizontal: 20, gap: 8, paddingVertical: 2 },
  stripDay: {
    width: 48,
    height: 66,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stripWeekday: { fontSize: 12, lineHeight: 16 },
  stripNumber: { fontSize: 17, lineHeight: 22, fontFamily: 'NotoSansKR_700Bold' },
  todayDot: { width: 5, height: 5, borderRadius: 2.5, marginTop: 3 },
  listScroll: { flex: 1 },
  list: { paddingHorizontal: 20, paddingTop: 16 },
  progressCard: { borderRadius: 22, borderWidth: 1, padding: 16, gap: 12 },
  progressTop: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 },
  progressText: { flex: 1, gap: 2 },
  progressMessage: { fontSize: 15, lineHeight: 21, fontFamily: 'NotoSansKR_700Bold' },
  progressCount: { flexDirection: 'row', alignItems: 'flex-end' },
  progressBig: { fontSize: 30, lineHeight: 34, fontFamily: 'NotoSansKR_700Bold', letterSpacing: -0.6 },
  progressTotal: { fontSize: 16, lineHeight: 26, fontFamily: 'NotoSansKR_600SemiBold' },
  groupSection: { marginTop: 20 },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, paddingHorizontal: 2 },
  draggingItem: { opacity: 0.85 },
  groupTitle: { fontSize: 15 },
  groupCount: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 1 },
  groupCountText: { fontSize: 11.5, lineHeight: 16, fontFamily: 'NotoSansKR_700Bold' },
  groupSpacer: { flex: 1 },
  groupDragHandle: { padding: 2 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingBottom: 80 },
  emptyBadge: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  emptyEmoji: { fontSize: 38, lineHeight: 46 },
  emptyTitle: { fontSize: 22, lineHeight: 30, textAlign: 'center' },
  emptySubtitle: { marginTop: 6, marginBottom: 22, textAlign: 'center' },
  cta: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 22, paddingVertical: 13, borderRadius: 24 },
});
