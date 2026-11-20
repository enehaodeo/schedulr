import type { RecurringTask, ShortTask } from '../../db/types';
import { addDaysStr, dateMinToMs, fromDateStr, todayStr } from '../../lib/dates';

/** 只提前生成这么多天（含今天）的实例 */
export const HORIZON_DAYS = 14;

export type RuleInput = Pick<RecurringTask, 'title' | 'weekdays' | 'start_min' | 'end_min' | 'start_date' | 'end_date'>;

/** 与数据库 recurring_tasks 的检查约束一致，否则上传会失败并卡住整轮同步 */
export function ruleError(r: RuleInput): string | null {
  if (!r.title.trim()) return '请填写任务名称';
  if (!r.weekdays.length || r.weekdays.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) return '至少选择一天';
  if (r.start_min < 0 || r.end_min > 24 * 60 || r.start_min >= r.end_min) return '结束时间必须晚于开始时间';
  if (!r.start_date) return '请选择起始日期';
  if (r.end_date && r.end_date < r.start_date) return '结束日期不能早于起始日期';
  return null;
}

/** [from, to] 内落在规则星期上的日期（yyyy-MM-dd 可直接按字符串比较） */
export function occurrenceDates(rule: RuleInput, from: string, to: string): string[] {
  const first = rule.start_date > from ? rule.start_date : from;
  const last = rule.end_date && rule.end_date < to ? rule.end_date : to;
  const out: string[] = [];
  for (let d = first; d <= last; d = addDaysStr(d, 1)) {
    if (rule.weekdays.includes(fromDateStr(d).getDay())) out.push(d);
  }
  return out;
}

/** 32 位混合哈希，四路不同种子拼成 128 位 */
function hash32(s: string, seed: number): number {
  let h = seed ^ s.length;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 0x5bd1e995);
    h ^= h >>> 15;
  }
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * 实例 id 由规则、规则版本（updated_at）和日期决定：
 * 多台设备各自生成同一天的实例时得到同一行，不会重复；被删除或移走后 id 仍在，不会再生成。
 * 修改规则会换一批 id，按新设置重新生成。
 */
export function occurrenceId(ruleId: string, version: number, date: string): string {
  const key = `${ruleId}|${version}|${date}`;
  const hex = [0x9e3779b9, 0x85ebca6b, 0xc2b2ae35, 0x27d4eb2f]
    .map((seed) => hash32(key, seed).toString(16).padStart(8, '0'))
    .join('');
  // 设置版本位与变体位，保证是合法 UUID
  const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export interface Occurrence {
  id: string;
  rule: RecurringTask;
  date: string;
  start: number;
  end: number;
}

export interface Conflict {
  occ: Occurrence;
  /** 时间重叠的已排任务 id */
  clashes: string[];
}

export interface RecurringPlan {
  /** 不冲突，可直接排入 */
  add: Occurrence[];
  /** 规则已修改或删除，未来还没开始的旧实例要移除 */
  remove: string[];
  /** 与现有日程冲突，需要用户选择 */
  conflicts: Conflict[];
}

/**
 * 计算周期任务要做的改动（纯函数）。
 * tasks 需包含已删除的行，用来判断某个实例是否生成过。
 */
export function planRecurring(rules: RecurringTask[], tasks: ShortTask[], now: number): RecurringPlan {
  const ruleById = new Map(rules.map((r) => [r.id, r]));

  // 旧版本生成的实例 updated_at 早于规则当前版本；之后被用户改过的会更晚，保留
  const remove = tasks
    .filter((t) => {
      if (!t.recurring_id || t.deleted || t.status !== 'scheduled' || t.start_at === null || t.start_at <= now) return false;
      const rule = ruleById.get(t.recurring_id);
      return !!rule && t.updated_at < rule.updated_at;
    })
    .map((t) => t.id);
  const removed = new Set(remove);

  const known = new Set(tasks.map((t) => t.id));
  const busy = tasks
    .filter((t) => !t.deleted && t.status === 'scheduled' && t.start_at !== null && t.end_at !== null && !removed.has(t.id))
    .map((t) => ({ id: t.id, start: t.start_at!, end: t.end_at! }));

  const today = todayStr(now);
  const horizonEnd = addDaysStr(today, HORIZON_DAYS - 1);
  const pending: Occurrence[] = [];
  for (const rule of rules) {
    if (rule.deleted) continue;
    for (const date of occurrenceDates(rule, today, horizonEnd)) {
      const id = occurrenceId(rule.id, rule.updated_at, date);
      if (known.has(id)) continue;
      const start = dateMinToMs(date, rule.start_min);
      if (start <= now) continue;
      pending.push({ id, rule, date, start, end: dateMinToMs(date, rule.end_min) });
    }
  }
  pending.sort((a, b) => a.start - b.start);

  const add: Occurrence[] = [];
  const conflicts: Conflict[] = [];
  for (const occ of pending) {
    const clashes = busy.filter((b) => occ.start < b.end && b.start < occ.end).map((b) => b.id);
    if (clashes.length) {
      conflicts.push({ occ, clashes });
    } else {
      add.push(occ);
      busy.push({ id: occ.id, start: occ.start, end: occ.end });
    }
  }
  return { add, remove, conflicts };
}
