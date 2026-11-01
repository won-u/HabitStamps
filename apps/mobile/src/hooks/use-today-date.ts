import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { format } from 'date-fns';

export function todayDateString(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

function msUntilNextMidnight(): number {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return next.getTime() - now.getTime() + 500;
}

/**
 * Today's local date ("YYYY-MM-DD") that actually moves on. A home-screen
 * PWA stays suspended in memory for days, and every screen used to compute
 * "today" once (at mount or on its last render), so the next morning the
 * Today screen still called yesterday "오늘" and a tap stamped yesterday.
 * Re-reads the clock when the app comes back to the foreground and at the
 * next midnight while it stays open.
 */
export function useTodayDate(): string {
  const [today, setToday] = useState(todayDateString);

  useEffect(() => {
    const refresh = () => setToday(todayDateString());
    let timer = setTimeout(function tick() {
      refresh();
      timer = setTimeout(tick, msUntilNextMidnight());
    }, msUntilNextMidnight());
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, []);

  return today;
}
