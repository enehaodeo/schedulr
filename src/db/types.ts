export type TaskStatus = 'pool' | 'scheduled' | 'trash';

/** 所有需要同步的行都带这些字段 */
export interface SyncMeta {
  id: string;
  user_id: string | null;
  /** 客户端修改时间（毫秒），用于后写胜出 */
  updated_at: number;
  deleted: boolean;
  /** 仅本地：1 = 有未上传的改动 */
  dirty: 0 | 1;
}

export interface LongTask extends SyncMeta {
  title: string;
  duration_days: number;
  /** yyyy-MM-dd */
  deadline: string;
  tags: string[];
  sort_order: number;
  status: TaskStatus;
  /** yyyy-MM-dd，放入甘特图后才有 */
  start_date: string | null;
  source_public_id: string | null;
}

export interface ShortTask extends SyncMeta {
  title: string;
  duration_min: number;
  tags: string[];
  parent_id: string | null;
  sort_order: number;
  status: TaskStatus;
  /** 毫秒时间戳，放入日程后才有 */
  start_at: number | null;
  end_at: number | null;
  source_public_id: string | null;
  /** 由周期任务生成时指向 recurring_tasks.id */
  recurring_id: string | null;
}

/** 周期短期任务：每周固定几天的固定时段，自动生成日程中的短期任务 */
export interface RecurringTask extends SyncMeta {
  title: string;
  tags: string[];
  /** 0 = 周日 … 6 = 周六 */
  weekdays: number[];
  /** 当天分钟数 */
  start_min: number;
  end_min: number;
  /** yyyy-MM-dd */
  start_date: string;
  /** yyyy-MM-dd，可选，含当天 */
  end_date: string | null;
}

export interface Availability extends SyncMeta {
  /** weekly = 每周模板；date = 指定日期（存在时覆盖当天的每周模板） */
  kind: 'weekly' | 'date';
  weekday: number | null;
  date: string | null;
  start_min: number;
  end_min: number;
}

export interface Profile {
  display_name: string;
  courses: string[];
  onboarded: boolean;
  updated_at: number;
  dirty: 0 | 1;
}

export type SyncTable = 'long_tasks' | 'short_tasks' | 'availability' | 'recurring_tasks';
export const SYNC_TABLES: SyncTable[] = ['long_tasks', 'short_tasks', 'availability', 'recurring_tasks'];

export interface PublicPayloadLong {
  title: string;
  duration_days: number;
  deadline: string;
  tags: string[];
}

export interface PublicPayloadShort {
  title: string;
  duration_min: number;
  tags: string[];
  subtasks: { title: string; duration_min: number; tags: string[] }[];
}

export interface PublicTask {
  id: string;
  author_id: string;
  author_name: string | null;
  kind: 'long' | 'short';
  payload: PublicPayloadLong | PublicPayloadShort;
  scopes: string[];
  created_at: string;
}
