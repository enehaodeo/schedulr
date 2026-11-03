import { useEffect } from 'react';
import { toast } from '../../components/toast';
import type { PublicTask } from '../../db/types';
import { createStore, useStore } from '../../lib/store';
import { supabase } from '../../supabase/client';
import { sessionStore } from '../../sync/syncEngine';

export interface InboxState {
  tasks: PublicTask[];
  /** public_task_id -> 'added' | 'trashed' */
  actions: Record<string, 'added' | 'trashed'>;
  loaded: boolean;
}

export const inboxStore = createStore<InboxState>({ tasks: [], actions: {}, loaded: false });

export async function loadInbox() {
  const session = sessionStore.get();
  if (!supabase || !session) {
    inboxStore.set({ tasks: [], actions: {}, loaded: true });
    return;
  }
  // RLS 只返回可见范围内或自己发布的任务
  const [{ data: tasks, error }, { data: acts, error: actErr }] = await Promise.all([
    supabase.from('public_tasks').select('*').order('created_at', { ascending: false }).limit(200),
    supabase.from('public_task_actions').select('public_task_id, action'),
  ]);
  if (error || actErr) {
    toast(`加载公共任务失败：${(error ?? actErr)!.message}`, 'error');
    return;
  }
  const actions: InboxState['actions'] = {};
  for (const a of acts ?? []) actions[a.public_task_id] = a.action;
  inboxStore.set({ tasks: (tasks ?? []) as PublicTask[], actions, loaded: true });
}

export async function setAction(publicTaskId: string, action: 'added' | 'trashed' | null) {
  const session = sessionStore.get();
  if (!supabase || !session) return;
  const { error } =
    action === null
      ? await supabase.from('public_task_actions').delete().eq('public_task_id', publicTaskId)
      : await supabase
          .from('public_task_actions')
          .upsert({ user_id: session.user.id, public_task_id: publicTaskId, action });
  if (error) {
    toast(error.message, 'error');
    return;
  }
  const s = inboxStore.get();
  const actions = { ...s.actions };
  if (action === null) delete actions[publicTaskId];
  else actions[publicTaskId] = action;
  inboxStore.set({ ...s, actions });
}

/** 收件箱：不是自己发布、也还没处理过的公共任务 */
export function pendingTasks(s: InboxState, uid: string | undefined): PublicTask[] {
  return s.tasks.filter((t) => t.author_id !== uid && !s.actions[t.id]);
}

/** 登录后加载并订阅新公共任务；在 App 顶层调用一次 */
export function useInboxCount(): number {
  const session = useStore(sessionStore);
  const state = useStore(inboxStore);
  const uid = session?.user.id;

  useEffect(() => {
    void loadInbox();
    if (!supabase || !uid) return;
    const channel = supabase
      .channel('public_tasks_inserts')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'public_tasks' }, (msg) => {
        const t = msg.new as PublicTask;
        if (t.author_id !== uid) toast(`新的公共任务：${(t.payload as { title: string }).title}`);
        void loadInbox();
      })
      .subscribe();
    return () => {
      void supabase!.removeChannel(channel);
    };
  }, [uid]);

  return pendingTasks(state, uid).length;
}
