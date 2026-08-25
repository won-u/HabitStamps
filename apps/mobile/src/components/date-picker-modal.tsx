import { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, startOfMonth, startOfWeek } from 'date-fns';
import { ko } from 'date-fns/locale';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { useMonthSlideCarousel } from '@/hooks/use-month-slide-carousel';
import { MonthSlideTrack } from '@/components/month-slide-track';

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];
// backdrop padding (24) + card padding (16), both sides — see styles below.
const MODAL_HORIZONTAL_INSET = (24 + 16) * 2;
const MAX_WEEK_ROWS = 6;

interface Props {
  visible: boolean;
  initialDate: string;
  /** Dates after this are disabled — defaults to today (no picking future dates). */
  maxDate?: string;
  onClose: () => void;
  onSelect: (dateStr: string) => void;
}

/** Full month date picker — opened from the Today screen's header date, since the 10-day strip can't reach further back. */
export function DatePickerModal({ visible, initialDate, maxDate, onClose, onSelect }: Props) {
  const theme = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const [month, setMonth] = useState(() => new Date(initialDate));
  const today = maxDate ?? format(new Date(), 'yyyy-MM-dd');

  const containerWidth = windowWidth - MODAL_HORIZONTAL_INSET;
  const cellSize = containerWidth / 7;
  const { prevMonth, nextMonth, viewportHeight, panGesture, carouselTrackStyle, goToMonth } = useMonthSlideCarousel({
    month,
    setMonth,
    containerWidth,
    rowHeight: cellSize,
    maxRows: MAX_WEEK_ROWS,
  });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.card, { backgroundColor: theme.background }]} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <Pressable onPress={() => goToMonth(-1)} hitSlop={8}>
              <Ionicons name="chevron-back" size={20} color={theme.text} />
            </Pressable>
            <ThemedText type="smallBold">{format(month, 'yyyy년 M월', { locale: ko })}</ThemedText>
            <Pressable onPress={() => goToMonth(1)} hitSlop={8}>
              <Ionicons name="chevron-forward" size={20} color={theme.text} />
            </Pressable>
          </View>

          <View style={styles.weekRow}>
            {WEEKDAY_LABELS.map((label, index) => (
              <View key={label} style={styles.dayCell}>
                <ThemedText type="small" style={index === 0 ? { color: '#E85D75' } : { color: theme.textSecondary }}>
                  {label}
                </ThemedText>
              </View>
            ))}
          </View>

          <MonthSlideTrack
            panes={[prevMonth, month, nextMonth]}
            containerWidth={containerWidth}
            viewportHeight={viewportHeight}
            panGesture={panGesture}
            trackStyle={carouselTrackStyle}
            renderMonth={(paneMonth) => (
              <MonthGrid month={paneMonth} today={today} initialDate={initialDate} onSelect={onSelect} onClose={onClose} />
            )}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

interface MonthGridProps {
  month: Date;
  today: string;
  initialDate: string;
  onSelect: (dateStr: string) => void;
  onClose: () => void;
}

function MonthGrid({ month, today, initialDate, onSelect, onClose }: MonthGridProps) {
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
      {weeks.map((week, weekIndex) => (
        <View key={weekIndex} style={styles.weekRow}>
          {week.map((day) => {
            const dateStr = format(day, 'yyyy-MM-dd');
            const inMonth = isSameMonth(day, month);
            const isFuture = dateStr > today;
            const isSelected = dateStr === initialDate;
            const isToday = dateStr === today;

            return (
              <View key={dateStr} style={styles.dayCell}>
                <Pressable
                  disabled={isFuture}
                  onPress={() => {
                    onSelect(dateStr);
                    onClose();
                  }}
                  style={[
                    styles.dayPill,
                    isSelected && { backgroundColor: theme.text },
                    !isSelected && isToday && { borderWidth: 1.5, borderColor: theme.textSecondary },
                  ]}>
                  <ThemedText
                    style={
                      isFuture
                        ? { color: theme.textSecondary, opacity: 0.3 }
                        : !inMonth
                          ? { color: theme.textSecondary, opacity: 0.4 }
                          : isSelected
                            ? { color: theme.background, fontWeight: '700' }
                            : undefined
                    }>
                    {format(day, 'd')}
                  </ThemedText>
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
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  card: { borderRadius: 20, padding: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  weekRow: { flexDirection: 'row' },
  dayCell: { flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  dayPill: { flex: 1, width: '100%', borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
});
