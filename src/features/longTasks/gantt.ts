import { addDaysStr, diffDays } from '../../lib/dates';
import type { LongTask } from '../../db/types';

export function endDate(start: string, durationDays: number): string {
  return addDaysStr(start, durationDays - 1);
}

/** 结束日不能晚于 deadline */
export function fitsDeadline(start: string, durationDays: number, deadline: string): boolean {
  return diffDays(endDate(start, durationDays), deadline) <= 0;
}

/** 最晚可开始日期 */
export function latestStart(durationDays: number, deadline: string): string {
  return addDaysStr(deadline, -(durationDays - 1));
}

/** 已排入甘特图且结束日已过的任务 */
export function isLongExpired(t: LongTask, today: string): boolean {
  return (
    t.status === 'scheduled' &&
    !!t.start_date &&
    diffDays(endDate(t.start_date, t.duration_days), today) < 0
  );
}
