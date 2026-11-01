import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Category, FrequencyConfig, FrequencyType } from '@habit-tracker/core';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useTheme } from '@/hooks/use-theme';
import { HabitPalette, tintedShadow } from '@/constants/theme';
import { PressableScale } from '@/components/ui/pressable-scale';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { useBottomInset } from '@/hooks/use-bottom-inset';
import { haptic } from '@/lib/haptics';
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
  /** denim habit: wears and washes are kept too (see DenimCard) */
  isDenim: boolean;
}

interface Props {
  initial?: Partial<HabitFormValue>;
  /** editing a denim habit that already has wash records: turning denim off drops them */
  hasDenimRecords?: boolean;
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
export function HabitForm({ initial, hasDenimRecords, submitLabel, onSubmit, onArchive, onDelete }: Props) {
  const theme = useTheme();
  const [name, setName] = useState(initial?.name ?? '');
  const [icon, setIcon] = useState(initial?.icon ?? ICON_PRESETS[0]!);
  const [color, setColor] = useState(initial?.color ?? HabitPalette[0].hex);
  const [categoryId, setCategoryId] = useState<string | null>(initial?.categoryId ?? null);
  const [frequencyType, setFrequencyType] = useState<FrequencyType>(initial?.frequencyType ?? 'daily');
  const [weekdays, setWeekdays] = useState<number[]>(initial?.weekdays ?? [1, 2, 3, 4, 5]);
  const [timesPerWeek, setTimesPerWeek] = useState(initial?.timesPerWeek ?? 3);
  const [timesPerMonth, setTimesPerMonth] = useState(initial?.timesPerMonth ?? 10);
  const [isDenim, setIsDenim] = useState(initial?.isDenim ?? false);
  const [submitting, setSubmitting] = useState(false);

  const [categories, setCategories] = useState<readonly Category[]>([]);
  const [addingGroup, setAddingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const bottomInset = useBottomInset();

  useEffect(() => categoryRepository.observe().subscribe(setCategories), []);

  const canSubmit = name.trim().length > 0 && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    haptic('success');
    setSubmitting(true);
    try {
      await onSubmit({
        name: name.trim(),
        icon,
        color,
        categoryId,
        frequencyType,
        weekdays,
        timesPerWeek,
        timesPerMonth,
        isDenim,
      });
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
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={[styles.preview, { backgroundColor: color, boxShadow: tintedShadow(color, 0.35) }]}>
          <View style={styles.previewIcon}>
            <Text style={styles.previewEmoji}>{icon}</Text>
          </View>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="예: 물 마시기"
            placeholderTextColor="rgba(255,255,255,0.7)"
            maxLength={30}
            style={styles.nameInput}
          />
          <View style={styles.previewCheck} />
        </View>
        <ThemedText type="small" themeColor="textSecondary" style={styles.previewHint}>
          오늘 화면에 이렇게 보여요
        </ThemedText>

        <SectionLabel>아이콘</SectionLabel>
        <View style={styles.row}>
          {ICON_PRESETS.map((preset) => {
            const selected = icon === preset;
            return (
              <PressableScale
                key={preset}
                activeScale={0.88}
                hapticKind="selection"
                onPress={() => setIcon(preset)}
                style={[
                  styles.iconChip,
                  {
                    backgroundColor: selected ? theme.backgroundSelected : theme.backgroundElement,
                    borderColor: selected ? theme.text : theme.border,
                  },
                ]}>
                <Text style={styles.iconChipEmoji}>{preset}</Text>
              </PressableScale>
            );
          })}
        </View>

        <SectionLabel>컬러</SectionLabel>
        <View style={styles.row}>
          {HabitPalette.map((swatch) => {
            const selected = color === swatch.hex;
            return (
              <PressableScale
                key={swatch.hex}
                activeScale={0.85}
                hapticKind="selection"
                accessibilityLabel={swatch.name}
                onPress={() => setColor(swatch.hex)}
                style={[styles.swatchRing, { borderColor: selected ? swatch.hex : 'transparent' }]}>
                <View style={[styles.swatch, { backgroundColor: swatch.hex }]}>
                  {selected ? <Ionicons name="checkmark" size={16} color="#fff" /> : null}
                </View>
              </PressableScale>
            );
          })}
        </View>

        <SectionLabel>그룹</SectionLabel>
        <View style={styles.row}>
          <Chip label="기본" selected={categoryId === null} onPress={() => setCategoryId(null)} />
          {categories.map((category) => (
            <Chip
              key={category.id}
              label={category.name}
              selected={categoryId === category.id}
              onPress={() => setCategoryId(category.id)}
            />
          ))}
          {addingGroup ? (
            <View style={[styles.groupChip, styles.groupInputChip, { borderColor: theme.text, backgroundColor: theme.backgroundElement }]}>
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
            <PressableScale
              hapticKind="selection"
              onPress={() => setAddingGroup(true)}
              style={[styles.groupChip, styles.addGroupChip, { borderColor: theme.textSecondary }]}>
              <Ionicons name="add" size={16} color={theme.text} />
              <ThemedText type="small">새 그룹</ThemedText>
            </PressableScale>
          )}
        </View>

        <SectionLabel>반복 주기</SectionLabel>
        <SegmentedControl options={FREQUENCY_OPTIONS} value={frequencyType} onChange={setFrequencyType} />

        {frequencyType === 'weekdays' ? (
          <View style={[styles.weekdayRow, styles.subControl]}>
            {WEEKDAY_LABELS.map((label, day) => {
              const selected = weekdays.includes(day);
              return (
                <PressableScale
                  key={label}
                  activeScale={0.88}
                  hapticKind="selection"
                  onPress={() => toggleWeekday(day)}
                  style={[
                    styles.dayChip,
                    selected
                      ? { backgroundColor: color, borderColor: color }
                      : { backgroundColor: theme.backgroundElement, borderColor: theme.border },
                  ]}>
                  <ThemedText type="smallBold" style={{ color: selected ? '#FFFFFF' : theme.text }}>
                    {label}
                  </ThemedText>
                </PressableScale>
              );
            })}
          </View>
        ) : null}

        {frequencyType === 'timesPerWeek' ? (
          <Stepper label={`주 ${timesPerWeek}회`} onMinus={() => setTimesPerWeek((n) => Math.max(1, n - 1))} onPlus={() => setTimesPerWeek((n) => Math.min(7, n + 1))} />
        ) : null}

        {frequencyType === 'timesPerMonth' ? (
          <Stepper label={`월 ${timesPerMonth}회`} onMinus={() => setTimesPerMonth((n) => Math.max(1, n - 1))} onPlus={() => setTimesPerMonth((n) => Math.min(31, n + 1))} />
        ) : null}

        <View style={[styles.denimRow, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
          <View style={styles.denimText}>
            <ThemedText>👖 데님 기록</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {isDenim || !hasDenimRecords
                ? '도장마다 착용으로 세고, 세탁·다세탁 시점을 같이 기록해요.'
                : '끄고 저장하면 적어 둔 착용·세탁 기록이 지워져요.'}
            </ThemedText>
          </View>
          <Switch value={isDenim} onValueChange={setIsDenim} trackColor={{ true: color }} />
        </View>

        {onArchive ? (
          <PressableScale
            hapticKind="light"
            onPress={onArchive}
            style={[styles.secondaryButton, { borderColor: theme.border, backgroundColor: theme.backgroundElement, marginTop: 32 }]}>
            <Ionicons name="archive-outline" size={16} color={theme.text} />
            <ThemedText>보관하기</ThemedText>
          </PressableScale>
        ) : null}

        {onDelete ? (
          <PressableScale
            hapticKind="light"
            onPress={onDelete}
            style={[styles.secondaryButton, { borderColor: theme.border, backgroundColor: theme.backgroundElement, marginTop: onArchive ? 10 : 32 }]}>
            <Ionicons name="trash-outline" size={16} color={theme.danger} />
            <ThemedText style={{ color: theme.danger }}>습관 삭제</ThemedText>
          </PressableScale>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(16, bottomInset), borderTopColor: theme.border, backgroundColor: theme.background }]}>
        <PressableScale
          onPress={handleSubmit}
          disabled={!canSubmit}
          style={[styles.submit, { backgroundColor: canSubmit ? theme.text : theme.backgroundSelected }]}>
          <ThemedText type="smallBold" style={[styles.submitText, { color: canSubmit ? theme.background : theme.textSecondary }]}>
            {submitting ? '저장 중...' : submitLabel}
          </ThemedText>
        </PressableScale>
      </View>
    </ThemedView>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionLabel}>
      {children}
    </ThemedText>
  );
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <PressableScale
      hapticKind="selection"
      onPress={onPress}
      style={[
        styles.groupChip,
        selected
          ? { backgroundColor: theme.text, borderColor: theme.text }
          : { backgroundColor: theme.backgroundElement, borderColor: theme.border },
      ]}>
      <ThemedText type="small" style={{ color: selected ? theme.background : theme.text }}>
        {label}
      </ThemedText>
    </PressableScale>
  );
}

function Stepper({ label, onMinus, onPlus }: { label: string; onMinus: () => void; onPlus: () => void }) {
  const theme = useTheme();
  const buttonStyle = [styles.stepperButton, { backgroundColor: theme.backgroundElement, borderColor: theme.border }];
  return (
    <View style={[styles.stepper, styles.subControl]}>
      <PressableScale activeScale={0.88} hapticKind="selection" onPress={onMinus} style={buttonStyle} accessibilityLabel="줄이기">
        <Ionicons name="remove" size={20} color={theme.text} />
      </PressableScale>
      <ThemedText style={styles.stepperLabel}>{label}</ThemedText>
      <PressableScale activeScale={0.88} hapticKind="selection" onPress={onPlus} style={buttonStyle} accessibilityLabel="늘리기">
        <Ionicons name="add" size={20} color={theme.text} />
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 20, paddingBottom: 32 },
  sectionLabel: { marginTop: 24, marginBottom: 10, marginLeft: 2 },
  subControl: { marginTop: 12 },
  preview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 22,
    paddingVertical: 12,
    paddingLeft: 12,
    paddingRight: 14,
    marginTop: 4,
  },
  previewIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewEmoji: { fontSize: 22, lineHeight: 28 },
  previewCheck: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.9)',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  previewHint: { marginTop: 8, marginLeft: 4 },
  nameInput: { flex: 1, minWidth: 0, fontSize: 17, fontFamily: 'NotoSansKR_700Bold', color: '#FFFFFF', paddingVertical: 10 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  iconChip: { width: 48, height: 48, borderRadius: 15, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  iconChipEmoji: { fontSize: 22, lineHeight: 28 },
  swatchRing: { width: 42, height: 42, borderRadius: 21, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  swatch: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  groupChip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 18, borderWidth: 1, alignItems: 'center' },
  addGroupChip: { flexDirection: 'row', gap: 4, borderStyle: 'dashed' },
  groupInputChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6 },
  groupInput: { minWidth: 90, fontSize: 14, padding: 0 },
  weekdayRow: { flexDirection: 'row', justifyContent: 'space-between' },
  dayChip: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 24 },
  stepperButton: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  stepperLabel: { fontSize: 22, lineHeight: 30, fontFamily: 'NotoSansKR_700Bold', minWidth: 90, textAlign: 'center' },
  denimRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 24, borderRadius: 18, borderWidth: 1, padding: 14 },
  denimText: { flex: 1, gap: 2 },
  secondaryButton: {
    flexDirection: 'row',
    gap: 6,
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: { paddingHorizontal: 20, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  submit: { paddingVertical: 16, borderRadius: 18, alignItems: 'center' },
  submitText: { fontSize: 16 },
});
