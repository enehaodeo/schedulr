import { addDays, differenceInCalendarDays, format, parseISO, startOfDay } from 'date-fns';

export const DAY_MS = 24 * 60 * 60 * 1000;
export const MIN_MS = 60 * 1000;

/** yyyy-MM-dd in local time */
export function toDateStr(d: Date | number): string {
  return format(d, 'yyyy-MM-dd');
}

export function fromDateStr(s: string): Date {
  return parseISO(s);
}

export function todayStr(now: Date | number = Date.now()): string {
  return toDateStr(startOfDay(now));
}

export function addDaysStr(s: string, n: number): string {
  return toDateStr(addDays(fromDateStr(s), n));
}

export function diffDays(a: string, b: string): number {
  return differenceInCalendarDays(fromDateStr(a), fromDateStr(b));
}

/** 本地日期 + 当天分钟数 → 时间戳 */
export function dateMinToMs(date: string, minutes: number): number {
  return fromDateStr(date).getTime() + minutes * MIN_MS;
}

export function msToDayMin(ms: number): number {
  const d = new Date(ms);
  return d.getHours() * 60 + d.getMinutes();
}

export function fmtMin(m: number): string {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export function parseHHMM(s: string): number {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
}

export function fmtDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h}小时${m}分钟`;
  if (h) return `${h}小时`;
  return `${m}分钟`;
}

export const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
