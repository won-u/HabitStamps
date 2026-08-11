import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector, type PanGesture } from 'react-native-gesture-handler';
import Animated, {
  LinearTransition,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

const LONG_PRESS_DURATION_MS = 350;
const DEFAULT_ROW_HEIGHT = 60;

/** Passed to `renderItem` so the caller decides what portion of the row is the
 * drag handle — e.g. a group's header, not the habit cards inside it. Wrap
 * just that portion in `<GestureDetector gesture={dragHandle.gesture}>`. */
export interface DragHandle {
  gesture: PanGesture;
  isDragging: boolean;
}

interface ReorderableListProps<T> {
  data: readonly T[];
  keyExtractor: (item: T) => string;
  onReorder: (newOrder: T[]) => void;
  renderItem: (item: T, dragHandle: DragHandle) => React.ReactNode;
  /** Disables the drag gesture (e.g. while some other interaction owns the screen). */
  disabled?: boolean;
}

/**
 * Vertical long-press-to-drag reordering for a block of rows rendered inside
 * a parent ScrollView (not a FlatList — this app's screens are single
 * ScrollViews with a few sections, not virtualized lists, so a lighter
 * hand-rolled implementation is enough and avoids depending on a
 * drag-and-drop list library whose compatibility with this app's Reanimated/
 * New Architecture versions hasn't been verified).
 *
 * Rows can have different heights (measured via onLayout) — needed because
 * this is reused both for fixed-height habit cards and for whole
 * (header + habit cards) group blocks. `activateAfterLongPress` means a
 * normal tap always reaches the row's own Pressable/Link untouched; only
 * holding past the threshold starts a drag.
 */
export function ReorderableList<T>({ data, keyExtractor, onReorder, renderItem, disabled }: ReorderableListProps<T>) {
  const [order, setOrder] = useState<T[]>(() => [...data]);
  const [heights, setHeights] = useState<Record<string, number>>({});
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const orderRef = useRef(order);
  orderRef.current = order;

  // Re-sync from the parent's data when it changes — but never while a drag
  // is in flight. Keeps the current LOCAL sequence (so a just-committed
  // reorder isn't undone the moment the parent's data hasn't caught up yet),
  // while always refreshing each row's own object with the latest one from
  // `data` for its key. This second part matters even when no key was
  // added/removed/reordered: this list is reused for whole group blocks,
  // where the group's own key never changes but its nested `.items` does —
  // comparing only the key sequence would consider that "the same" and keep
  // rendering stale nested content forever.
  useEffect(() => {
    if (activeKey) return;
    const dataByKey = new Map(data.map((item) => [keyExtractor(item), item]));
    const currentKeys = orderRef.current.map(keyExtractor);
    const keysStillPresent = currentKeys.filter((k) => dataByKey.has(k));
    const newKeys = data.map(keyExtractor).filter((k) => !currentKeys.includes(k));
    const nextOrder = [...keysStillPresent, ...newKeys].map((k) => dataByKey.get(k) as T);

    const changed =
      nextOrder.length !== orderRef.current.length || nextOrder.some((item, i) => item !== orderRef.current[i]);
    if (changed) setOrder(nextOrder);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed comparison above is the real dependency
  }, [data, activeKey]);

  const offsets: number[] = [];
  let cumulative = 0;
  for (const item of order) {
    offsets.push(cumulative);
    cumulative += heights[keyExtractor(item)] ?? DEFAULT_ROW_HEIGHT;
  }

  function moveToIndex(key: string, toIndex: number) {
    setOrder((prev) => {
      const fromIndex = prev.findIndex((item) => keyExtractor(item) === key);
      if (fromIndex === -1 || fromIndex === toIndex) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }

  function commit() {
    setActiveKey(null);
    onReorder(orderRef.current);
  }

  return (
    <View>
      {order.map((item, index) => {
        const key = keyExtractor(item);
        return (
          <DraggableRow
            key={key}
            rowKey={key}
            startOffsetY={offsets[index]}
            heights={heights}
            order={order}
            keyExtractor={keyExtractor}
            disabled={disabled || (activeKey !== null && activeKey !== key)}
            isActive={activeKey === key}
            onLayoutHeight={(h) => setHeights((prev) => (prev[key] === h ? prev : { ...prev, [key]: h }))}
            onDragStart={() => setActiveKey(key)}
            onDragMove={(toIndex) => moveToIndex(key, toIndex)}
            onDragEnd={commit}
            renderContent={(handle) => renderItem(item, handle)}
          />
        );
      })}
    </View>
  );
}

interface DraggableRowProps<T> {
  rowKey: string;
  startOffsetY: number;
  heights: Record<string, number>;
  order: T[];
  keyExtractor: (item: T) => string;
  disabled: boolean;
  isActive: boolean;
  onLayoutHeight: (height: number) => void;
  onDragStart: () => void;
  onDragMove: (toIndex: number) => void;
  onDragEnd: () => void;
  renderContent: (handle: DragHandle) => React.ReactNode;
}

function DraggableRow<T>({
  rowKey,
  startOffsetY,
  heights,
  order,
  keyExtractor,
  disabled,
  isActive,
  onLayoutHeight,
  onDragStart,
  onDragMove,
  onDragEnd,
  renderContent,
}: DraggableRowProps<T>) {
  const translateY = useSharedValue(0);
  const dragStartOffsetY = useSharedValue(0);

  // Recomputed on every render from plain JS state (heights/order), not a
  // shared value — this only needs to update when React re-renders (a row
  // was inserted/removed above this one), not on every animation frame.
  const currentOffsetY = (() => {
    let cumulative = 0;
    for (const item of order) {
      if (keyExtractor(item) === rowKey) return cumulative;
      cumulative += heights[keyExtractor(item)] ?? DEFAULT_ROW_HEIGHT;
    }
    return startOffsetY;
  })();

  function handleStart() {
    dragStartOffsetY.value = startOffsetY;
    onDragStart();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  }

  function handleUpdate(translationY: number) {
    const absoluteY = dragStartOffsetY.value + translationY;
    let cumulative = 0;
    let toIndex = order.length - 1;
    for (let i = 0; i < order.length; i++) {
      const h = heights[keyExtractor(order[i])] ?? DEFAULT_ROW_HEIGHT;
      if (absoluteY < cumulative + h / 2) {
        toIndex = i;
        break;
      }
      cumulative += h;
    }
    onDragMove(toIndex);
  }

  const gesture = Gesture.Pan()
    .activateAfterLongPress(LONG_PRESS_DURATION_MS)
    .enabled(!disabled)
    .onStart(() => {
      runOnJS(handleStart)();
    })
    .onUpdate((event) => {
      translateY.value = event.translationY;
      runOnJS(handleUpdate)(event.translationY);
    })
    // onFinalize (not onEnd) so the row always unlocks even if the gesture is
    // cancelled/interrupted instead of ending normally (e.g. an odd event
    // sequence, the app backgrounding mid-drag) — otherwise a drag that never
    // reaches onEnd leaves activeKey stuck forever, which also blocks the
    // list from ever re-syncing with fresh data again.
    .onFinalize(() => {
      translateY.value = withSpring(0, { duration: 200 });
      runOnJS(onDragEnd)();
    });

  const animatedStyle = useAnimatedStyle(() => {
    if (!isActive) return { transform: [{ translateY: 0 }] };
    // Corrects for the row's own flex position having already jumped to its
    // new slot (via the LinearTransition below) by the time a splice lands —
    // keeps the row visually glued to the finger instead of double-moving.
    const correction = dragStartOffsetY.value - currentOffsetY;
    return { transform: [{ translateY: translateY.value + correction }] };
  }, [isActive, currentOffsetY]);

  return (
    <Animated.View
      layout={isActive ? undefined : LinearTransition}
      onLayout={(e) => onLayoutHeight(e.nativeEvent.layout.height)}
      style={[animatedStyle, isActive ? { zIndex: 10, elevation: 8, opacity: 0.95 } : null]}>
      {renderContent({ gesture, isDragging: isActive })}
    </Animated.View>
  );
}
