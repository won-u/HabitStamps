import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
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

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.card, { backgroundColor: theme.background }]} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <Pressable onPress={() => setYear((y) => y - 1)} hitSlop={8}>
              <Ionicons name="chevron-back" size={20} color={theme.text} />
            </Pressable>
            <ThemedText type="smallBold">{year}년</ThemedText>
            <Pressable onPress={() => setYear((y) => y + 1)} hitSlop={8}>
              <Ionicons name="chevron-forward" size={20} color={theme.text} />
            </Pressable>
          </View>

          <View style={styles.grid}>
            {MONTH_LABELS.map((label, month) => {
              const isSelected = year === initialYear && month === initialMonth;
              return (
                <Pressable
                  key={label}
                  onPress={() => {
                    onSelect(year, month);
                    onClose();
                  }}
                  style={[
                    styles.monthCell,
                    { backgroundColor: isSelected ? theme.text : theme.backgroundElement },
                  ]}>
                  <ThemedText style={{ color: isSelected ? theme.background : theme.text }}>{label}</ThemedText>
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  card: { borderRadius: 20, padding: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  monthCell: { width: '30%', paddingVertical: 16, borderRadius: 14, alignItems: 'center' },
});
