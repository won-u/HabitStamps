import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { Category, Habit } from '@habit-tracker/core';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useTheme } from '@/hooks/use-theme';
import { habitRepository, categoryRepository } from '@/composition/container';

export default function ArchiveScreen() {
  const theme = useTheme();
  const [habits, setHabits] = useState<readonly Habit[]>([]);
  const [categories, setCategories] = useState<readonly Category[]>([]);

  useEffect(() => habitRepository.observe({ includeArchived: true }).subscribe(setHabits), []);
  useEffect(() => categoryRepository.observe().subscribe(setCategories), []);

  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const archivedHabits = habits.filter((habit) => habit.isArchived);

  async function handleRestore(habit: Habit) {
    await habitRepository.update(habit.id, { isArchived: false });
  }

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: '보관된 습관' }} />
      <ScrollView contentContainerStyle={styles.scroll}>
        {archivedHabits.length === 0 ? (
          <ThemedText themeColor="textSecondary">보관된 습관이 없어요</ThemedText>
        ) : (
          archivedHabits.map((habit) => (
            <View key={habit.id} style={[styles.row, { backgroundColor: theme.backgroundElement }]}>
              <View style={styles.info}>
                <ThemedText numberOfLines={1}>
                  {habit.icon} {habit.name}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {habit.categoryId ? (categoryById.get(habit.categoryId)?.name ?? '기본') : '기본'}
                </ThemedText>
              </View>
              <Pressable onPress={() => handleRestore(habit)} style={[styles.restoreButton, { borderColor: theme.text }]}>
                <Ionicons name="arrow-undo-outline" size={16} color={theme.text} />
                <ThemedText>복구</ThemedText>
              </Pressable>
            </View>
          ))
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 20, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', borderRadius: 16, padding: 14, gap: 12 },
  info: { flex: 1, gap: 2 },
  restoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
});
