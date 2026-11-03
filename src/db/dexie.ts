import Dexie, { type EntityTable, type Table } from 'dexie';
import type { Availability, LongTask, ShortTask, SyncMeta, SyncTable } from './types';

export interface MetaRow {
  key: string;
  value: unknown;
}

class SchedulrDB extends Dexie {
  long_tasks!: EntityTable<LongTask, 'id'>;
  short_tasks!: EntityTable<ShortTask, 'id'>;
  availability!: EntityTable<Availability, 'id'>;
  meta!: EntityTable<MetaRow, 'key'>;

  constructor() {
    super('schedulr');
    this.version(1).stores({
      long_tasks: 'id, status, dirty, sort_order',
      short_tasks: 'id, status, dirty, parent_id, sort_order, start_at',
      availability: 'id, kind, weekday, date, dirty',
      meta: 'key',
    });
  }
}

export const db = new SchedulrDB();

export async function getMeta<T>(key: string): Promise<T | undefined> {
  const row = await db.meta.get(key);
  return row?.value as T | undefined;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value });
}

/** 以公共字段视角访问同步表，避免联合类型无法调用 */
export function syncTable<T extends SyncMeta = SyncMeta>(name: SyncTable): Table<T, string> {
  return db[name] as unknown as Table<T, string>;
}
