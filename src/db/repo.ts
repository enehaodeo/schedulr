import { mergeRanges, type MinRange } from '../features/availability/windows';
import { fromDateStr } from '../lib/dates';
import { db, getMeta, setMeta, syncTable } from './dexie';
import type {
  LongTask,
  Profile,
  PublicPayloadLong,
  PublicPayloadShort,
  ShortTask,
  SyncMeta,
} from './types';

type Change = () => void;
const listeners = new Set<Change>();

/** 同步引擎订阅本地改动 */
export function onLocalChange(fn: Change): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function changed() {
  listeners.forEach((fn) => fn());
}

async function currentUserId(): Promise<string | null> {
  return (await getMeta<string>('user_id')) ?? null;
}

function stamp<T extends object>(patch: T): T & Pick<SyncMeta, 'updated_at' | 'dirty'> {
  return { ...patch, updated_at: Date.now(), dirty: 1 as const };
}

async function newMeta(): Promise<SyncMeta> {
  return {
    id: crypto.randomUUID(),
    user_id: await currentUserId(),
    updated_at: Date.now(),
    deleted: false,
    dirty: 1,
  };
}

async function nextSortOrder(table: 'long_tasks' | 'short_tasks'): Promise<number> {
  const last = await db[table].orderBy('sort_order').last();
  return (last?.sort_order ?? 0) + 1;
}

// ---------- 个人信息 ----------

const DEFAULT_PROFILE: Profile = {
  display_name: '',
  courses: [],
  onboarded: false,
  updated_at: 0,
  dirty: 0,
};

/** 直接链式调用 Dexie，便于 useLiveQuery 跟踪读取 */
export function getProfile(): Promise<Profile> {
  return db.meta.get('profile').then((r) => (r?.value as Profile | undefined) ?? DEFAULT_PROFILE);
}

export async function saveProfile(patch: Partial<Omit<Profile, 'updated_at' | 'dirty'>>) {
  const p = await getProfile();
  await setMeta('profile', { ...p, ...stamp(patch) });
  changed();
}

// ---------- 长期任务 ----------

export type LongTaskInput = Pick<LongTask, 'title' | 'duration_days' | 'deadline' | 'tags'> & {
  source_public_id?: string | null;
};

export async function addLongTask(input: LongTaskInput): Promise<string> {
  const row: LongTask = {
    ...(await newMeta()),
    title: input.title,
    duration_days: input.duration_days,
    deadline: input.deadline,
    tags: input.tags,
    source_public_id: input.source_public_id ?? null,
    sort_order: await nextSortOrder('long_tasks'),
    status: 'pool',
    start_date: null,
  };
  await db.long_tasks.add(row);
  changed();
  return row.id;
}

export async function updateLongTask(id: string, patch: Partial<LongTask>) {
  await db.long_tasks.update(id, stamp(patch));
  changed();
}

// ---------- 短期任务 ----------

export type ShortTaskInput = Pick<ShortTask, 'title' | 'duration_min' | 'tags'> & {
  parent_id?: string | null;
  source_public_id?: string | null;
};

export async function addShortTask(input: ShortTaskInput): Promise<string> {
  const row: ShortTask = {
    ...(await newMeta()),
    title: input.title,
    duration_min: input.duration_min,
    tags: input.tags,
    parent_id: input.parent_id ?? null,
    source_public_id: input.source_public_id ?? null,
    sort_order: await nextSortOrder('short_tasks'),
    status: 'pool',
    start_at: null,
    end_at: null,
  };
  await db.short_tasks.add(row);
  changed();
  return row.id;
}

export async function updateShortTask(id: string, patch: Partial<ShortTask>) {
  await db.short_tasks.update(id, stamp(patch));
  changed();
}

/** 子任务全部进入垃圾桶后，父任务也一起进入 */
export async function settleParent(parentId: string | null) {
  if (!parentId) return;
  const children = (await db.short_tasks.where('parent_id').equals(parentId).toArray()).filter(
    (c) => !c.deleted,
  );
  if (children.length && children.every((c) => c.status === 'trash')) {
    await updateShortTask(parentId, { status: 'trash' });
  }
}

// ---------- 排序 ----------

export async function reorder(table: 'long_tasks' | 'short_tasks', orderedIds: string[]) {
  const t = syncTable<SyncMeta & { sort_order: number }>(table);
  await db.transaction('rw', t, async () => {
    for (let i = 0; i < orderedIds.length; i++) {
      await t.update(orderedIds[i], stamp({ sort_order: i + 1 }));
    }
  });
  changed();
}

// ---------- 可用时间 ----------

export async function removeAvailability(id: string) {
  await db.availability.update(id, stamp({ deleted: true }));
  changed();
}

export type AvailTarget = { kind: 'date'; date: string } | { kind: 'weekly'; weekday: number };

/**
 * 修改某个“指定日期”或“每周某天”的全部可用时间：edit 拿到当前时段（已合并），返回新的时段，
 * 结果会自动合并首尾相接的时段，再尽量复用原有行写回。
 * 指定日期还没有单独设置时，以当天的每周模板为起点，并写入空标记保证覆盖模板。
 */
export async function editAvailability(target: AvailTarget, edit: (current: MinRange[]) => MinRange[]) {
  await db.transaction('rw', db.availability, db.meta, async () => {
    const live = (await db.availability.toArray()).filter((a) => !a.deleted);
    const group =
      target.kind === 'date'
        ? live.filter((a) => a.kind === 'date' && a.date === target.date)
        : live.filter((a) => a.kind === 'weekly' && a.weekday === target.weekday);
    const base =
      target.kind === 'date' && !group.length
        ? live.filter((a) => a.kind === 'weekly' && a.weekday === fromDateStr(target.date).getDay())
        : group;
    const next = mergeRanges(edit(mergeRanges(base)));

    const rows = group.filter((a) => a.end_min > a.start_min).sort((a, b) => a.start_min - b.start_min);
    for (let i = 0; i < Math.max(rows.length, next.length); i++) {
      const row = rows[i];
      const r = next[i];
      if (row && r) {
        if (row.start_min !== r.start_min || row.end_min !== r.end_min) {
          await db.availability.update(row.id, stamp({ start_min: r.start_min, end_min: r.end_min }));
        }
      } else if (row) {
        await db.availability.update(row.id, stamp({ deleted: true }));
      } else {
        await db.availability.add({
          ...(await newMeta()),
          ...(target.kind === 'date'
            ? { kind: 'date', date: target.date, weekday: null }
            : { kind: 'weekly', weekday: target.weekday, date: null }),
          ...r,
        });
      }
    }
    // 空标记：即使当天一个时段都不剩，也照样覆盖每周模板
    if (target.kind === 'date' && !group.some((a) => a.end_min <= a.start_min)) {
      await db.availability.add({
        ...(await newMeta()),
        kind: 'date',
        date: target.date,
        weekday: null,
        start_min: 0,
        end_min: 0,
      });
    }
  });
  changed();
}

// ---------- 软删除 ----------

export async function purge(table: 'long_tasks' | 'short_tasks', id: string) {
  await syncTable(table).update(id, stamp({ deleted: true }));
  if (table === 'short_tasks') {
    const children = await db.short_tasks.where('parent_id').equals(id).toArray();
    for (const c of children) await db.short_tasks.update(c.id, stamp({ deleted: true }));
  }
  changed();
}

// ---------- 从公共任务加入 ----------

export async function addFromPublic(
  publicId: string,
  kind: 'long' | 'short',
  payload: PublicPayloadLong | PublicPayloadShort,
) {
  if (kind === 'long') {
    const p = payload as PublicPayloadLong;
    await addLongTask({ ...p, source_public_id: publicId });
    return;
  }
  const p = payload as PublicPayloadShort;
  const parentId = await addShortTask({
    title: p.title,
    duration_min: p.duration_min,
    tags: p.tags,
    source_public_id: publicId,
  });
  for (const s of p.subtasks) {
    await addShortTask({ ...s, parent_id: parentId });
  }
}
