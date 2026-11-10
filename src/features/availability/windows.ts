import type { Availability } from '../../db/types';
import { dateMinToMs, fromDateStr } from '../../lib/dates';
import type { Interval } from '../scheduler/autoSchedule';

/** 以当天零点起的分钟数表示的时段 */
export interface MinRange {
  start_min: number;
  end_min: number;
}

/** 合并重叠或首尾相接的时段，去掉长度为 0 的（如“仅此日期”的空标记），按开始时间排序 */
export function mergeRanges(list: MinRange[]): MinRange[] {
  const sorted = list
    .filter((r) => r.end_min > r.start_min)
    .map((r) => ({ start_min: r.start_min, end_min: r.end_min }))
    .sort((a, b) => a.start_min - b.start_min);
  const out: MinRange[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.start_min <= last.end_min) last.end_min = Math.max(last.end_min, r.end_min);
    else out.push(r);
  }
  return out;
}

/** 某天生效的可用时间：有当天的指定日期设置就用它，否则用每周模板 */
export function slotsForDate(all: Availability[], date: string): Availability[] {
  const live = all.filter((a) => !a.deleted);
  const specific = live.filter((a) => a.kind === 'date' && a.date === date);
  if (specific.length) return specific;
  const weekday = fromDateStr(date).getDay();
  return live.filter((a) => a.kind === 'weekly' && a.weekday === weekday);
}

export function windowsForDate(all: Availability[], date: string): Interval[] {
  return mergeRanges(slotsForDate(all, date)).map((a) => ({
    start: dateMinToMs(date, a.start_min),
    end: dateMinToMs(date, a.end_min),
  }));
}
