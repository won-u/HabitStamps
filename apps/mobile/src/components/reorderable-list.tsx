import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
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
const JUST_DRAGGED_SUPPRESS_MS = 400;

// Releasing a drag usually lands the finger over a *different* row's card
// (the whole point of dragging is to move over other rows). `Pressable`'s
// own touch/press handling isn't aware the GestureDetector just consumed
// this touch sequence, so the row now under the finger can fire its own
// onPress right after — reported as "dropping the drag often opens that
// item's detail screen or toggles its check-in", on both web and Android.
// There's no per-row relationship between the dragged row and whatever row
// ends up under the finger, so this needs to be a flag every row's onPress
// can check, not something threaded through props.
let lastDragEndedAt = 0;
export function markDragJustEnded(): void {
  lastDragEndedAt = Date.now();
}
export function wasDragJustEnded(): boolean {
  return Date.now() - lastDragEndedAt < JUST_DRAGGED_SUPPRESS_MS;
}

/**
 * Passed to `renderItem` so the caller decides what portion of the row is the
 * drag handle. On native, wrap the whole row (e.g. a group's header, or the
 * whole habit card) in `<GestureDetector gesture={dragHandle.gesture}>` —
 * long-pressing anywhere on it starts the drag.
 *
 * On web this must instead wrap a small, dedicated handle icon, not the
 * whole row — see docs/architecture.md §3-5 for the full story, but in
 * short: `Gesture.Pan().activateAfterLongPress(...)` inside a scrollable
 * `ScrollView` is a confirmed, still-open upstream limitation of
 * react-native-gesture-handler on web (github.com/software-mansion/
 * react-native-gesture-handler issue #2622, labeled Platform: Web) — RNGH's
 * web implementation locks a wrapped element's `touch-action` to `"none"` as
 * soon as it mounts, which blocks the browser from ever treating a touch
 * starting on that element as a scroll, long-press or not. No amount of
 * timing/CSS/ref trickery in application code changes that; it needs to not
 * be the *whole row* in the first place. A small dedicated handle sidesteps
 * the ambiguity entirely: grabbing it always means "drag" (nothing to
 * scroll from there), grabbing anywhere else on the row always means
 * "scroll" (that element was never wrapped by this gesture at all).
 */
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
  const hasActivated = useSharedValue(false);

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

  // `gesture` below is built once via `useMemo` and must stay referentially
  // stable across re-renders — react-native-gesture-handler's web
  // implementation doesn't hot-swap the gesture attached to a view mid-touch,
  // so rebuilding it on every render (e.g. every time a drag moves an item
  // to a new slot, which re-renders this row with fresh `order`/`heights`
  // props) tears down and reattaches the in-progress gesture, visibly
  // interrupting the drag — it looked like the row "shaking" instead of
  // following the finger.
  //
  // The stable gesture's `runOnJS`-called handlers still need *fresh*
  // `order`/`heights`/callback props on every call, though — and plain
  // `useRef`s reassigned during render turned out to be the wrong tool for
  // that: Reanimated's worklet plugin treats a ref that's reachable from a
  // `runOnJS`-invoked function as having been "passed to a worklet", and
  // warns (and silently keeps serving a stale snapshot) on every later
  // `ref.current = x` write — seen as a flood of "[Worklets] Tried to modify
  // key `current` of an object which has been already passed to a worklet"
  // in logcat, and as the visible bug: the row would start following the
  // finger, then snap back the instant a reorder recomputed `order`/
  // `heights`, because `handleUpdate` was still reading the pre-drag
  // snapshot. `useSharedValue` is the mechanism Reanimated actually intends
  // for this — plain assignment to `.value` (not `.current`) from the JS
  // thread, read back from JS-thread code, no cross-thread serialization
  // trap.
  // Same staleness trap applies to `startOffsetY`/`currentOffsetY` — they're
  // plain render-time values too, and `handleStart` (frozen inside the
  // memoized gesture) would otherwise keep reading whatever this row's
  // position was back when the gesture was last rebuilt. That rebuild only
  // happens when `disabled` toggles (some *other* row starting/ending a
  // drag), so dragging the *same* row twice in a row with nothing else
  // dragged in between fed the second drag's math a stale starting
  // position from before the first drag ever moved it — reported as a
  // second drag on a just-reordered item behaving as if snapping back
  // toward its old spot.
  const currentOffsetYShared = useSharedValue(currentOffsetY);
  useEffect(() => {
    currentOffsetYShared.value = currentOffsetY;
  }, [currentOffsetY, currentOffsetYShared]);
  const orderShared = useSharedValue(order);
  useEffect(() => {
    orderShared.value = order;
  }, [order, orderShared]);
  const heightsShared = useSharedValue(heights);
  useEffect(() => {
    heightsShared.value = heights;
  }, [heights, heightsShared]);
  // Reanimated's generic inference for `useSharedValue` doesn't cope with a
  // bare function value (infers `void`) — wrapping each callback in a
  // one-property object sidesteps that.
  const onDragStartShared = useSharedValue({ fn: onDragStart });
  useEffect(() => {
    onDragStartShared.value = { fn: onDragStart };
  }, [onDragStart, onDragStartShared]);
  const onDragMoveShared = useSharedValue({ fn: onDragMove });
  useEffect(() => {
    onDragMoveShared.value = { fn: onDragMove };
  }, [onDragMove, onDragMoveShared]);
  const onDragEndShared = useSharedValue({ fn: onDragEnd });
  useEffect(() => {
    onDragEndShared.value = { fn: onDragEnd };
  }, [onDragEnd, onDragEndShared]);

  function handleStart() {
    dragStartOffsetY.value = currentOffsetYShared.value;
    onDragStartShared.value.fn();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  }

  function handleUpdate(translationY: number) {
    const currentOrder = orderShared.value;
    const currentHeights = heightsShared.value;
    const absoluteY = dragStartOffsetY.value + translationY;
    let cumulative = 0;
    let toIndex = currentOrder.length - 1;
    for (let i = 0; i < currentOrder.length; i++) {
      const h = currentHeights[keyExtractor(currentOrder[i])] ?? DEFAULT_ROW_HEIGHT;
      if (absoluteY < cumulative + h / 2) {
        toIndex = i;
        break;
      }
      cumulative += h;
    }
    onDragMoveShared.value.fn(toIndex);
  }

  function handleEnd() {
    // Not web-only after all — reported on Android too (an emulator running
    // with mouse-simulated touch, at least): dropping a drag over a
    // different card sometimes fired that card's own onPress right after,
    // opening its detail screen or toggling its check-in. Same fix either
    // way: ignore presses for a brief window after any drag ends.
    markDragJustEnded();
    onDragEndShared.value.fn();
  }

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .activateAfterLongPress(LONG_PRESS_DURATION_MS)
        .enabled(!disabled)
        .onStart(() => {
          hasActivated.value = true;
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
        // list from ever re-syncing with fresh data again. But onFinalize fires
        // for EVERY gesture attempt, including a plain quick tap that never
        // activated (activateAfterLongPress just means it never got past the
        // long-press wait) — without the hasActivated guard, committing
        // unconditionally here reassigned every habit's sortOrder on every
        // checkbox tap (found via a web IndexedDB dump showing the habit's own
        // updatedAt bumping on a check-in toggle that never touched the habit).
        .onFinalize(() => {
          translateY.value = withSpring(0, { duration: 200 });
          if (hasActivated.value) {
            hasActivated.value = false;
            runOnJS(handleEnd)();
          }
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally stable; live values read via the shared values above
    [disabled],
  );

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
      // 웹에서는 다른 행들이 새 자리로 밀리는 것도 LinearTransition으로
      // 애니메이션하지 않는다 — Reanimated의 레이아웃 애니메이션이 웹에서
      // 불안정해서(공식적으로 네이티브만큼 지원되지 않음), 드래그 중인
      // 행이 재정렬 순간 원래 자리로 튕겨 돌아가는 원인이 됐다. 웹은 그냥
      // 즉시 자리를 바꾼다(애니메이션만 없어짐, 기능은 그대로).
      layout={isActive || Platform.OS === 'web' ? undefined : LinearTransition}
      onLayout={(e) => onLayoutHeight(e.nativeEvent.layout.height)}
      style={[animatedStyle, isActive ? { zIndex: 10, elevation: 8, opacity: 0.95 } : null]}>
      {renderContent({ gesture, isDragging: isActive })}
    </Animated.View>
  );
}
