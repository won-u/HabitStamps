import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import type { CheckIn, DenimInfo } from '@habit-tracker/core';
import { frequentWashLabel, getDenimStats } from '@habit-tracker/core';

import { ThemedText } from '@/components/themed-text';
import { DatePickerModal } from '@/components/date-picker-modal';
import { useTheme } from '@/hooks/use-theme';

interface Props {
  denim: DenimInfo;
  stamps: readonly CheckIn[];
  color: string;
  onChange: (denim: DenimInfo) => Promise<void>;
}

type Editing = 'none' | 'count' | 'wash' | 'frequent';

function toInt(text: string): number | null {
  const value = Number(text.trim());
  return text.trim() !== '' && Number.isInteger(value) && value >= 0 ? value : null;
}

/**
 * Denim habits only: wears (the stamps plus the ones before them), washes
 * (by wear number, or a stamped day marked as washed) and when 다세탁 began.
 * Same numbers as Personal Hermes' closet — see @habit-tracker/core denim-stats.
 */
export function DenimCard({ denim, stamps, color, onChange }: Props) {
  const theme = useTheme();
  const stats = getDenimStats(
    denim,
    stamps.map((stamp) => ({ date: stamp.date, washed: stamp.washed })),
  );
  const since = frequentWashLabel(denim);
  const [editing, setEditing] = useState<Editing>('none');
  const [number, setNumber] = useState('');
  const [date, setDate] = useState<string | null>(null);
  const [memo, setMemo] = useState('');
  const [picking, setPicking] = useState(false);
  const [problem, setProblem] = useState('');

  function open(next: Editing) {
    setEditing(next);
    setProblem('');
    setMemo('');
    if (next === 'count') {
      setNumber(String(stats.wears));
    } else if (next === 'wash') {
      setNumber(String(Math.max(stats.wears, 1)));
      setDate(null);
    } else if (next === 'frequent') {
      setNumber(denim.frequentWashAt === null ? String(stats.wears) : String(denim.frequentWashAt));
      setDate(denim.frequentWashOn);
    }
  }

  async function save() {
    const value = toInt(number);
    if (editing === 'count') {
      if (value === null || value < stamps.length) {
        setProblem(`도장이 ${stamps.length}개라 그보다 적게 할 수 없어요`);
        return;
      }
      await onChange({ ...denim, priorWears: value - stamps.length });
    } else if (editing === 'wash') {
      if (value === null || value < 1) {
        setProblem('몇 번째 착용 뒤에 빨았는지 적어 주세요');
        return;
      }
      await onChange({ ...denim, washes: [...denim.washes, { atWear: value, date, memo: memo.trim().slice(0, 200) }] });
    } else if (editing === 'frequent') {
      if (number.trim() !== '' && value === null) {
        setProblem('회차는 숫자로 적어 주세요');
        return;
      }
      if (value === null && date === null) {
        setProblem('회차나 날짜 중 하나는 있어야 해요');
        return;
      }
      await onChange({ ...denim, frequentWashAt: value, frequentWashOn: date });
    }
    setEditing('none');
  }

  const field = [styles.input, { color: theme.text, backgroundColor: theme.background }];
  const tiles = [
    { label: '총 착용', value: stats.wears },
    { label: '세탁', value: stats.washes },
    { label: '세탁 후', value: since === '' ? stats.sinceWash : '다세탁' },
  ];

  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
      <View style={styles.header}>
        <ThemedText type="smallBold">👖 데님</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {since === '' ? '생지·원워시 단계' : `다세탁 ${since}`}
        </ThemedText>
      </View>

      <View style={styles.tileRow}>
        {tiles.map((tile) => (
          <View key={tile.label} style={[styles.tile, { backgroundColor: theme.background }]}>
            <ThemedText type="subtitle" style={tile.label === '총 착용' ? { color } : undefined}>
              {tile.value}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {tile.label}
            </ThemedText>
          </View>
        ))}
      </View>

      {stats.log.length > 0 ? (
        <View style={styles.log}>
          {stats.log.map((wash) => (
            <View key={wash.fromStamp ? `stamp-${wash.date}` : `written-${wash.writtenIndex}`} style={styles.logRow}>
              <Ionicons name="water" size={14} color={color} />
              <ThemedText type="smallBold">{wash.atWear}회착</ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.logText}>
                {[wash.date?.replaceAll('-', '.'), wash.memo, wash.fromStamp ? '달력 도장' : ''].filter(Boolean).join(' · ')}
              </ThemedText>
              {wash.writtenIndex !== null ? (
                <Pressable
                  hitSlop={8}
                  onPress={() => onChange({ ...denim, washes: denim.washes.filter((_, i) => i !== wash.writtenIndex) })}>
                  <Ionicons name="close" size={16} color={theme.textSecondary} />
                </Pressable>
              ) : null}
            </View>
          ))}
        </View>
      ) : (
        <ThemedText type="small" themeColor="textSecondary">
          아직 세탁 기록이 없어요. 달력에서 도장 찍은 날을 골라 &lsquo;세탁함&rsquo;을 누르거나 아래에서 적어요.
        </ThemedText>
      )}

      {editing === 'none' ? (
        <View style={styles.actions}>
          <Chip label="세탁 기록" onPress={() => open('wash')} />
          <Chip label="착용 횟수 고치기" onPress={() => open('count')} />
          <Chip label={since === '' ? '다세탁 시작' : '다세탁 고치기'} onPress={() => open('frequent')} />
          {since !== '' ? (
            <Chip label="다세탁 해제" onPress={() => onChange({ ...denim, frequentWashAt: null, frequentWashOn: null })} />
          ) : null}
        </View>
      ) : (
        <View style={styles.form}>
          <View style={styles.formRow}>
            {editing === 'count' ? <ThemedText>총 착용</ThemedText> : null}
            <TextInput value={number} onChangeText={setNumber} inputMode="numeric" style={[field, styles.number]} />
            <ThemedText>
              {editing === 'count' ? '회' : editing === 'wash' ? '회착에 세탁' : '회착부터 다세탁'}
            </ThemedText>
          </View>
          {editing === 'count' ? (
            <ThemedText type="small" themeColor="textSecondary">
              달력 도장 {stamps.length}개가 포함돼요. 앞으로는 도장을 찍을 때마다 1씩 늘어요.
            </ThemedText>
          ) : (
            <View style={styles.formRow}>
              <Pressable onPress={() => setPicking(true)} style={[styles.dateButton, { backgroundColor: theme.background }]}>
                <Ionicons name="calendar-outline" size={16} color={theme.text} />
                <ThemedText>{date ? date.replaceAll('-', '.') : '날짜 (모르면 비워 두기)'}</ThemedText>
              </Pressable>
              {date ? (
                <Pressable hitSlop={8} onPress={() => setDate(null)}>
                  <Ionicons name="close-circle" size={18} color={theme.textSecondary} />
                </Pressable>
              ) : null}
            </View>
          )}
          {editing === 'wash' ? (
            <TextInput
              value={memo}
              onChangeText={setMemo}
              placeholder="메모 (예: 온수 소킹)"
              placeholderTextColor={theme.textSecondary}
              maxLength={200}
              style={field}
            />
          ) : null}
          {problem ? <ThemedText style={styles.problem}>{problem}</ThemedText> : null}
          <View style={styles.actions}>
            <Pressable onPress={save} style={[styles.save, { backgroundColor: theme.text }]}>
              <ThemedText style={{ color: theme.background }}>저장</ThemedText>
            </Pressable>
            <Chip label="취소" onPress={() => setEditing('none')} />
          </View>
        </View>
      )}

      <DatePickerModal
        visible={picking}
        initialDate={date ?? format(new Date(), 'yyyy-MM-dd')}
        onClose={() => setPicking(false)}
        onSelect={(picked) => {
          setDate(picked);
          setPicking(false);
        }}
      />
    </View>
  );
}

function Chip({ label, onPress }: { label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable onPress={onPress} style={[styles.chip, { backgroundColor: theme.background }]}>
      <ThemedText type="small">{label}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, padding: 16, gap: 12 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tileRow: { flexDirection: 'row', gap: 10 },
  tile: { flex: 1, borderRadius: 14, paddingVertical: 10, alignItems: 'center', gap: 2 },
  log: { gap: 6 },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  logText: { flex: 1 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16 },
  form: { gap: 10 },
  formRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 15 },
  number: { width: 80, textAlign: 'right' },
  dateButton: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  problem: { color: '#E85D75' },
  save: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 16 },
});
