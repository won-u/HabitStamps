import type { DenimInfo } from "../models/denim";

export interface DenimWashEntry {
  atWear: number;
  date: string | null;
  memo: string;
  /** true: a stamp marked as washed (change it on that day); false: written down by wear number */
  fromStamp: boolean;
  /** position in DenimInfo.washes for a written-down wash (to remove it); null for a stamp */
  writtenIndex: number | null;
}

export interface DenimStats {
  wears: number;
  washes: number;
  /** wears after the last wash (all of them when never washed) */
  sinceWash: number;
  log: DenimWashEntry[];
}

export interface DenimStamp {
  date: string;
  washed: boolean;
}

/**
 * Wears = the wears before the stamps + the stamps. Washes = the stamps
 * marked as washed (the n-th stamp is wear priorWears + n) + the ones
 * written down by wear number. Same rules as Personal Hermes' closet.stats,
 * so both apps show the same numbers.
 */
export function getDenimStats(denim: DenimInfo, stamps: readonly DenimStamp[]): DenimStats {
  const days = [...stamps].sort((a, b) => a.date.localeCompare(b.date));
  const fromStamps: DenimWashEntry[] = [];
  days.forEach((stamp, index) => {
    if (stamp.washed) {
      fromStamps.push({
        atWear: denim.priorWears + index + 1,
        date: stamp.date,
        memo: "",
        fromStamp: true,
        writtenIndex: null,
      });
    }
  });
  const written: DenimWashEntry[] = denim.washes.map((wash, index) => ({
    ...wash,
    fromStamp: false,
    writtenIndex: index,
  }));
  const log = [...written, ...fromStamps].sort(
    (a, b) => a.atWear - b.atWear || (a.date ?? "").localeCompare(b.date ?? ""),
  );
  const wears = denim.priorWears + days.length;
  const last = log.reduce<number | null>((max, wash) => (max === null || wash.atWear > max ? wash.atWear : max), null);
  return { wears, washes: log.length, sinceWash: last === null ? wears : Math.max(wears - last, 0), log };
}

/** "200회착 · 2026-03-01부터", or "" when 다세탁 has not begun. */
export function frequentWashLabel(denim: DenimInfo): string {
  const parts = [denim.frequentWashAt === null ? "" : `${denim.frequentWashAt}회착`, denim.frequentWashOn ?? ""].filter(
    (part) => part !== "",
  );
  return parts.length === 0 ? "" : `${parts.join(" · ")}부터`;
}
