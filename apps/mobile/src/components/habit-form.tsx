import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Category, FrequencyConfig, FrequencyType } from '@habit-tracker/core';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useTheme } from '@/hooks/use-theme';
import { HabitPalette } from '@/constants/theme';
import { categoryRepository } from '@/composition/container';

const ICON_PRESETS = ['💧', '🏃', '📚', '🧘', '🥗', '😴', '✍️', '💊', '🚭', '🎯', '🧥', '👖'];
const FREQUENCY_OPTIONS: { value: FrequencyType; label: string }[] = [
  { value: 'daily', label: '매일' },
  { value: 'weekdays', label: '특정 요일' },
  { value: 'timesPerWeek', label: '주 n회' },
  { value: 'timesPerMonth', label: '월 n회' },
];
const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

export interface HabitFormValue {
  name: string;
  icon: string;
  color: string;
  categoryId: string | null;
  frequencyType: FrequencyType;
  weekdays: number[];
  timesPerWeek: number;
  timesPerMonth: number;
}

interface Props {
  initial?: Partial<HabitFormValue>;
  submitLabel: string;
  onSubmit: (value: HabitFormValue) => Promise<void>;
  onArchive?: () => Promise<void>;
  onDelete?: () => Promise<void>;
}

export function toFrequencyConfig(
  value: Pick<HabitFormValue, 'frequencyType' | 'weekdays' | 'timesPerWeek' | 'timesPerMonth'>,
): FrequencyConfig {
  if (value.frequencyType === 'weekdays') return { weekdays: value.weekdays };
  if (value.frequencyType === 'timesPerWeek') return { timesPerWeek: value.timesPerWeek };
  if (value.frequencyType === 'timesPerMonth') return { timesPerMonth: value.timesPerMonth };
  return {};
}

/** Shared by habit/new.tsx and habit/[id]/edit.tsx — see docs/ux-design.md §2-2. */
export function HabitForm({ initial, submitLabel, onSubmit, onArchive, onDelete }: Props) {
  const theme = useTheme();
  const [name, setName] = useState(initial?.name ?? '');
  const [icon, setIcon] = useState(initial?.icon ?? ICON_PRESETS[0]!);
  const [color, setColor] = useState(initial?.color ?? HabitPalette[0].hex);
  const [categoryId, setCategoryId] = useState<string | null>(initial?.categoryId ?? null);
  const [frequencyType, setFrequencyType] = useState<FrequencyType>(initial?.frequencyType ?? 'daily');
  const [weekdays, setWeekdays] = useState<number[]>(initial?.weekdays ?? [1, 2, 3, 4, 5]);
  const [timesPerWeek, setTimesPerWeek] = useState(initial?.timesPerWeek ?? 3);
  const [timesPerMonth, setTimesPerMonth] = useState(initial?.timesPerMonth ?? 10);
  const [submitting, setSubmitting] = useState(false);

  const [categories, setCategories] = useState<readonly Category[]>([]);
  const [addingGroup, setAddingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');

  useEffect(() => categoryRepository.observe().subscribe(setCategories), []);

  const canSubmit = name.trim().length > 0 && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await onSubmit({ name: name.trim(), icon, color, categoryId, frequencyType, weekdays, timesPerWeek, timesPerMonth });
    } finally {
      setSubmitting(false);
    }
  }

  function toggleWeekday(day: number) {
    setWeekdays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()));
  }

  async function handleCreateGroup() {
    const trimmed = newGroupName.trim();
    if (!trimmed) {
      setAddingGroup(false);
      return;
    }
    const created = await categoryRepository.create({ name: trimmed, color, sortOrder: categories.length });
    setCategoryId(created.id);
    setNewGroupName('');
    setAddingGroup(false);
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <ThemedText type="small" themeColor="textSecondary">
          이름
        </ThemedText>
        <View style={[styles.nameBox, { backgroundColor: color }]}>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="예: 물 마시기"
            placeholderTextColor="rgba(255,255,255,0.7)"
            maxLength={30}
            style={styles.nameInput}
          />
        </View>

        <ThemedText type="small" themeColor="textSecondary" style={styles.sectionLabel}>
          아이콘
        </ThemedText>
        <View style={styles.row}>
          {ICON_PRESETS.map((preset) => (
            <Pressable
              key={preset}
              onPress={() => setIcon(preset)}
              style={[
                styles.iconChip,
                { backgroundColor: icon === preset ? theme.backgroundSelected : theme.backgroundElement },
              ]}>
              <ThemedText>{preset}</ThemedText>
            </Pressable>
          ))}
        </View>

        <ThemedText type="small" themeColor="textSecondary" style={styles.sectionLabel}>
          컬러
        </ThemedText>
        <View style={styles.row}>
          {HabitPalette.map((swatch) => (
            <Pressable key={swatch.hex} onPress={() => setColor(swatch.hex)} style={[styles.swatch, { backgroundColor: swatch.hex }]}>
              {color === swatch.hex ? <Ionicons name="checkmark" size={16} color="#fff" /> : null}
            </Pressable>
          ))}
        </View>

        <ThemedText type="small" themeColor="textSecondary" style={styles.sectionLabel}>
          그룹
        </ThemedText>
        <View style={styles.row}>
          <Pressable
            onPress={() => setCategoryId(null)}
            style={[styles.groupChip, { backgroundColor: categoryId === null ? theme.text : theme.backgroundElement }]}>
            <ThemedText style={{ color: categoryId === null ? theme.background : theme.text }}>기본</ThemedText>
          </Pressable>
          {categories.map((category) => (
            <Pressable
              key={category.id}
              onPress={() => setCategoryId(category.id)}
              style={[
                styles.groupChip,
                { backgroundColor: categoryId === category.id ? theme.text : theme.backgroundElement },
              ]}>
              <ThemedText style={{ color: categoryId === category.id ? theme.background : theme.text }}>
                {category.name}
              </ThemedText>
            </Pressable>
          ))}
          {addingGroup ? (
            <View style={[styles.groupChip, styles.groupInputChip, { borderColor: theme.backgroundSelected }]}>
              <TextInput
                value={newGroupName}
                onChangeText={setNewGroupName}
                placeholder="새 그룹 이름"
                placeholderTextColor={theme.textSecondary}
                autoFocus
                maxLength={20}
                onSubmitEditing={handleCreateGroup}
                style={[styles.groupInput, { color: theme.text }]}
              />
              <Pressable onPress={handleCreateGroup} hitSlop={8}>
                <Ionicons name="checkmark" size={18} color={theme.text} />
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={() => setAddingGroup(true)}
              style={[styles.groupChip, { backgroundColor: theme.backgroundElement, flexDirection: 'row', gap: 4 }]}>
              <Ionicons name="add" size={16} color={theme.text} />
              <ThemedText>새 그룹</ThemedText>
            </Pressable>
          )}
        </View>

        <ThemedText type="small" themeColor="textSecondary" style={styles.sectionLabel}>
          반복 주기
        </ThemedText>
        <View style={styles.row}>
          {FREQUENCY_OPTIONS.map((option) => (
            <Pressable
              key={option.value}
              onPress={() => setFrequencyType(option.value)}
              style={[
                styles.segment,
                { backgroundColor: frequencyType === option.value ? theme.text : theme.backgroundElement },
              ]}>
              <ThemedText style={{ color: frequencyType === option.value ? theme.background : theme.text }}>
                {option.label}
              </ThemedText>
            </Pressable>
          ))}
        </View>

        {frequencyType === 'weekdays' ? (
          <View style={[styles.row, styles.sectionLabel]}>
            {WEEKDAY_LABELS.map((label, day) => (
              <Pressable
                key={label}
                onPress={() => toggleWeekday(day)}
                style={[styles.dayChip, { backgroundColor: weekdays.includes(day) ? theme.text : theme.backgroundElement }]}>
                <ThemedText style={{ color: weekdays.includes(day) ? theme.background : theme.text }}>{label}</ThemedText>
              </Pressable>
            ))}
          </View>
        ) : null}

        {frequencyType === 'timesPerWeek' ? (
          <View style={[styles.stepper, styles.sectionLabel]}>
            <Pressable onPress={() => setTimesPerWeek((n) => Math.max(1, n - 1))} style={styles.stepperButton}>
              <ThemedText type="subtitle">-</ThemedText>
            </Pressable>
            <ThemedText type="subtitle">주 {timesPerWeek}회</ThemedText>
            <Pressable onPress={() => setTimesPerWeek((n) => Math.min(7, n + 1))} style={styles.stepperButton}>
              <ThemedText type="subtitle">+</ThemedText>
            </Pressable>
          </View>
        ) : null}

        {frequencyType === 'timesPerMonth' ? (
          <View style={[styles.stepper, styles.sectionLabel]}>
            <Pressable onPress={() => setTimesPerMonth((n) => Math.max(1, n - 1))} style={styles.stepperButton}>
              <ThemedText type="subtitle">-</ThemedText>
            </Pressable>
            <ThemedText type="subtitle">월 {timesPerMonth}회</ThemedText>
            <Pressable onPress={() => setTimesPerMonth((n) => Math.min(31, n + 1))} style={styles.stepperButton}>
              <ThemedText type="subtitle">+</ThemedText>
            </Pressable>
          </View>
        ) : null}

        {onArchive ? (
          <Pressable onPress={onArchive} style={[styles.deleteButton, { borderColor: theme.textSecondary, marginTop: 32 }]}>
            <ThemedText themeColor="textSecondary">보관하기</ThemedText>
          </Pressable>
        ) : null}

        {onDelete ? (
          <Pressable onPress={onDelete} style={[styles.deleteButton, { borderColor: '#E85D75', marginTop: onArchive ? 12 : 32 }]}>
            <ThemedText style={{ color: '#E85D75' }}>습관 삭제</ThemedText>
          </Pressable>
        ) : null}
      </ScrollView>

      <Pressable
        onPress={handleSubmit}
        disabled={!canSubmit}
        style={[styles.submit, { backgroundColor: canSubmit ? theme.text : theme.backgroundSelected }]}>
        <ThemedText style={{ color: theme.background }}>{submitLabel}</ThemedText>
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 20 },
  sectionLabel: { marginTop: 20, marginBottom: 8 },
  nameBox: { borderRadius: 16, paddingHorizontal: 16, marginTop: 8 },
  nameInput: { fontSize: 17, fontWeight: '700', color: '#FFFFFF', paddingVertical: 16 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  iconChip: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  swatch: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  groupChip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 18, alignItems: 'center' },
  groupInputChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, paddingVertical: 6 },
  groupInput: { minWidth: 90, fontSize: 14, padding: 0 },
  segment: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20 },
  dayChip: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  stepperButton: { paddingHorizontal: 16, paddingVertical: 8 },
  deleteButton: { marginTop: 32, borderWidth: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  submit: { margin: 20, paddingVertical: 16, borderRadius: 16, alignItems: 'center' },
});
