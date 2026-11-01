import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

const MONTH_LABELS = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];

interface Props {
  visible: boolean;
  initialYear: number;
  initialMonth: number; // 0-indexed, matches Date#getMonth()
  onClose: () => void;
  onSelect: (year: number, month: number) => void;
}

/** Year/month picker for calendar-style screens — jumps directly to a distant year/month instead of paging one month at a time. */
export function YearMonthPickerModal({ visible, initialYear, initialMonth, onClose, onSelect }: Props) {
  const theme = useTheme();
  const [year, setYear] = useState(initialYear);
  // The modal stays mounted between openings: start each opening on the
  // year being viewed, not the one browsed to last time.
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setYear(initialYear);
  }
  const now = new Date();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Animated.View entering={FadeInDown.springify().damping(17)}>
        <Pressable style={[styles.card, { backgroundColor: theme.backgroundElement }]} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <Pressable onPress={() => setYear((y) => y - 1)} hitSlop={8} accessibilityLabel="이전 해">
              <Ionicons name="chevron-back" size={20} color={theme.text} />
            </Pressable>
            <ThemedText type="smallBold">{year}년</ThemedText>
            <Pressable onPress={() => setYear((y) => y + 1)} hitSlop={8} accessibilityLabel="다음 해">
              <Ionicons name="chevron-forward" size={20} color={theme.text} />
            </Pressable>
          </View>

          <View style={styles.grid}>
            {MONTH_LABELS.map((label, month) => {
              const isSelected = year === initialYear && month === initialMonth;
              const isThisMonth = year === now.getFullYear() && month === now.getMonth();
              return (
                <Pressable
                  key={label}
                  onPress={() => {
                    onSelect(year, month);
                    onClose();
                  }}
                  accessibilityLabel={`${year}년 ${label}`}
                  style={[
                    styles.monthCell,
                    { backgroundColor: isSelected ? theme.text : theme.backgroundSelected },
                    isThisMonth && !isSelected ? { borderColor: theme.accent } : null,
                  ]}>
                  <ThemedText style={{ color: isSelected ? theme.background : theme.text }}>{label}</ThemedText>
                </Pressable>
              );
            })}
          </View>
        </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(8,9,14,0.45)', justifyContent: 'center', padding: 24 },
  card: { borderRadius: 26, padding: 16, boxShadow: '0px 20px 50px rgba(0,0,0,0.25)' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  monthCell: {
    width: '30%',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
});
