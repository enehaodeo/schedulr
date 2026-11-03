import type { Availability } from '../../db/types';
import { dateMinToMs, fromDateStr } from '../../lib/dates';
import type { Interval } from '../scheduler/autoSchedule';

/** 某天生效的可用时间：有当天的指定日期设置就用它，否则用每周模板 */
export function slotsForDate(all: Availability[], date: string): Availability[] {
  const live = all.filter((a) => !a.deleted);
  const specific = live.filter((a) => a.kind === 'date' && a.date === date);
  if (specific.length) return specific;
  const weekday = fromDateStr(date).getDay();
  return live.filter((a) => a.kind === 'weekly' && a.weekday === weekday);
}

export function windowsForDate(all: Availability[], date: string): Interval[] {
  return slotsForDate(all, date).map((a) => ({
    start: dateMinToMs(date, a.start_min),
    end: dateMinToMs(date, a.end_min),
  }));
}
