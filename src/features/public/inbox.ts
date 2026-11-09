import { useEffect } from 'react';
import { toast } from '../../components/toast';
import { addFromPublic, getProfile } from '../../db/repo';
import type { PublicPayloadLong, PublicPayloadShort, PublicTask } from '../../db/types';
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
    toast(`加载白板任务失败：${(error ?? actErr)!.message}`, 'error');
    return;
  }
  const actions: InboxState['actions'] = {};
  for (const a of acts ?? []) actions[a.public_task_id] = a.action;
  inboxStore.set({ tasks: (tasks ?? []) as PublicTask[], actions, loaded: true });
}

/** 发布到白板，返回是否成功；成功后刷新，「我发布的」马上能看到 */
export async function publishPublicTask(
  kind: PublicTask['kind'],
  payload: PublicPayloadLong | PublicPayloadShort,
  scopes: string[],
): Promise<boolean> {
  const session = sessionStore.get();
  if (!supabase || !session) return false;
  if (!scopes.length) {
    toast('请至少选择一门课程作为可见范围', 'error');
    return false;
  }
  const profile = await getProfile();
  const { error } = await supabase.from('public_tasks').insert({
    author_id: session.user.id,
    author_name: profile.display_name || null,
    kind,
    payload,
    scopes,
  });
  if (error) {
    toast(`发布失败：${error.message}`, 'error');
    return false;
  }
  toast('已发布到白板');
  void loadInbox();
  return true;
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

/** 接受：复制到自己的任务池并标记为已加入 */
export async function acceptPublicTask(t: PublicTask) {
  await addFromPublic(t.id, t.kind, t.payload);
  await setAction(t.id, 'added');
  toast(`已加入${t.kind === 'long' ? '长期' : '短期'}任务池`);
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
        if (t.author_id !== uid) toast(`白板有新任务：${(t.payload as { title: string }).title}`);
        void loadInbox();
      })
      .subscribe();
    return () => {
      void supabase!.removeChannel(channel);
    };
  }, [uid]);

  return pendingTasks(state, uid).length;
}
