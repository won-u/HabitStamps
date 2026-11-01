import { useEffect, useRef, useState } from 'react';

const DURATION_MS = 700;

/**
 * Animates a displayed integer from its previous value to `target` (ease-out),
 * so stat numbers "roll" into place instead of just appearing. JS-driven
 * (requestAnimationFrame) because it updates Text content, not a style.
 */
export function useCountUp(target: number): number {
  const [display, setDisplay] = useState(0);
  const fromRef = useRef(0);

  useEffect(() => {
    const from = fromRef.current;
    if (from === target) return;
    let frame = 0;
    const start = Date.now();
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / DURATION_MS);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = Math.round(from + (target - from) * eased);
      setDisplay(next);
      fromRef.current = next;
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target]);

  return display;
}
