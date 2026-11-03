import type { Session } from '@supabase/supabase-js';
import { db, getMeta, setMeta, syncTable } from '../db/dexie';
import { getProfile, onLocalChange } from '../db/repo';
import { SYNC_TABLES, type Profile, type SyncTable } from '../db/types';
import { createStore } from '../lib/store';
import { supabase } from '../supabase/client';
import { shouldTakeRemote } from './merge';

export type SyncStatus = 'offline' | 'idle' | 'syncing' | 'ok' | 'error';

export const sessionStore = createStore<Session | null>(null);
export const syncStatus = createStore<SyncStatus>('offline');

const PAGE = 1000;
const EPOCH = '1970-01-01T00:00:00Z';

async function pullTable(table: SyncTable) {
  const sb = supabase!;
  const t = syncTable(table);
  let cursor = (await getMeta<string>(`cursor:${table}`)) ?? EPOCH;
  for (;;) {
    const { data, error } = await sb
      .from(table)
      .select('*')
      .gt('synced_at', cursor)
      .order('synced_at')
      .limit(PAGE);
    if (error) throw error;
    if (!data.length) break;
    await db.transaction('rw', t, async () => {
      for (const { synced_at: _s, ...remote } of data) {
        const local = await t.get(remote.id);
        if (shouldTakeRemote(local, remote)) {
          await t.put({ ...remote, dirty: 0 } as never);
        }
      }
    });
    cursor = data[data.length - 1].synced_at;
    await setMeta(`cursor:${table}`, cursor);
    if (data.length < PAGE) break;
  }
}

async function pushTable(table: SyncTable, uid: string) {
  const t = syncTable(table);
  const dirty = await t.where('dirty').equals(1).toArray();
  if (!dirty.length) return;
  const rows = dirty.map(({ dirty: _d, ...r }) => ({ ...r, user_id: uid }));
  for (let i = 0; i < rows.length; i += PAGE) {
    const { error } = await supabase!.from(table).upsert(rows.slice(i, i + PAGE));
    if (error) throw error;
  }
  // 上传期间又被改过的行保持 dirty
  await db.transaction('rw', t, async () => {
    for (const r of dirty) {
      const cur = await t.get(r.id);
      if (cur && cur.updated_at === r.updated_at) await t.update(r.id, { dirty: 0 });
    }
  });
}

async function syncProfile(uid: string) {
  const sb = supabase!;
  const local = await getProfile();
  const { data: remote, error } = await sb.from('profiles').select('*').eq('id', uid).maybeSingle();
  if (error) throw error;
  if (remote && shouldTakeRemote(local, remote)) {
    const p: Profile = {
      display_name: remote.display_name ?? '',
      courses: remote.courses ?? [],
      onboarded: remote.onboarded,
      updated_at: remote.updated_at,
      dirty: 0,
    };
    await setMeta('profile', p);
    return;
  }
  if (!remote || local.dirty) {
    const { dirty: _d, ...p } = local;
    const { error: upErr } = await sb.from('profiles').upsert({ id: uid, ...p });
    if (upErr) throw upErr;
    const cur = await getProfile();
    if (cur.updated_at === local.updated_at) await setMeta('profile', { ...cur, dirty: 0 });
  }
}

let running = false;
let again = false;

export async function syncNow(): Promise<void> {
  const session = sessionStore.get();
  if (!supabase || !session) return;
  if (running) {
    again = true;
    return;
  }
  running = true;
  syncStatus.set('syncing');
  try {
    await syncProfile(session.user.id);
    for (const t of SYNC_TABLES) {
      await pullTable(t);
      await pushTable(t, session.user.id);
    }
    syncStatus.set('ok');
  } catch (e) {
    console.error('sync failed', e);
    syncStatus.set('error');
  } finally {
    running = false;
    if (again) {
      again = false;
      void syncNow();
    }
  }
}

async function clearLocal() {
  await db.transaction('rw', [db.long_tasks, db.short_tasks, db.availability, db.meta], async () => {
    await Promise.all([db.long_tasks.clear(), db.short_tasks.clear(), db.availability.clear(), db.meta.clear()]);
  });
}

/** 登录后：游客数据归入该账号；如果浏览器里是另一个账号的数据则先清空 */
async function adoptUser(uid: string) {
  const prev = await getMeta<string>('user_id');
  if (prev && prev !== uid) await clearLocal();
  if (!prev) {
    for (const t of SYNC_TABLES) {
      await syncTable(t).toCollection().modify((r) => {
        if (!r.user_id) {
          r.user_id = uid;
          r.dirty = 1;
        }
      });
    }
  }
  await setMeta('user_id', uid);
}

export async function signOut() {
  await supabase?.auth.signOut();
  await clearLocal();
  sessionStore.set(null);
  syncStatus.set('offline');
}

let timer: ReturnType<typeof setTimeout> | undefined;
function scheduleSync() {
  clearTimeout(timer);
  timer = setTimeout(() => void syncNow(), 2000);
}

export function initCloud() {
  if (!supabase) return;
  supabase.auth.onAuthStateChange((_event, session) => {
    const prevUid = sessionStore.get()?.user.id;
    sessionStore.set(session);
    if (!session) {
      syncStatus.set('offline');
      return;
    }
    if (session.user.id !== prevUid) {
      // 回调里不能直接 await supabase 调用，否则会死锁
      setTimeout(async () => {
        await adoptUser(session.user.id);
        await syncNow();
      }, 0);
    }
  });
  onLocalChange(scheduleSync);
  window.addEventListener('focus', () => void syncNow());
  window.addEventListener('online', () => void syncNow());
}
