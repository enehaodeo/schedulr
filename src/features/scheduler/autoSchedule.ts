export interface Interval {
  start: number;
  end: number;
}

export interface Schedulable {
  id: string;
  duration_min: number;
}

export interface Placement {
  id: string;
  start: number;
  end: number;
}

const MIN = 60 * 1000;

/** 从 windows 中扣除 busy，并裁掉 now 之前的部分 */
export function freeIntervals(windows: Interval[], busy: Interval[], now: number): Interval[] {
  let free: Interval[] = windows
    .map((w) => ({ start: Math.max(w.start, now), end: w.end }))
    .filter((w) => w.end > w.start)
    .sort((a, b) => a.start - b.start);

  for (const b of busy) {
    const next: Interval[] = [];
    for (const f of free) {
      if (b.end <= f.start || b.start >= f.end) {
        next.push(f);
        continue;
      }
      if (b.start > f.start) next.push({ start: f.start, end: b.start });
      if (b.end < f.end) next.push({ start: b.end, end: f.end });
    }
    free = next;
  }
  return free;
}

/**
 * 贪心自动排程：按任务池顺序，为每个任务找最早能放下的空闲区间；
 * 放不下就跳过，继续尝试后面的任务。
 */
export function autoSchedule(
  tasks: Schedulable[],
  windows: Interval[],
  busy: Interval[],
  now: number,
): Placement[] {
  const free = freeIntervals(windows, busy, now);
  const placed: Placement[] = [];
  for (const t of tasks) {
    const need = t.duration_min * MIN;
    const idx = free.findIndex((f) => f.end - f.start >= need);
    if (idx < 0) continue;
    const slot = free[idx];
    placed.push({ id: t.id, start: slot.start, end: slot.start + need });
    if (slot.end - slot.start === need) free.splice(idx, 1);
    else free[idx] = { start: slot.start + need, end: slot.end };
  }
  return placed;
}

/** 手动放置校验：必须完全落在某个可用区间内，且不与已排任务重叠 */
export function canPlace(target: Interval, windows: Interval[], busy: Interval[]): boolean {
  const inside = windows.some((w) => target.start >= w.start && target.end <= w.end);
  const clash = busy.some((b) => target.start < b.end && b.start < target.end);
  return inside && !clash;
}
