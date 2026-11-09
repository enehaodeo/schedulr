import { format } from 'date-fns';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Tags } from '../components/Tags';
import { toast } from '../components/toast';
import type { PublicPayloadLong, PublicPayloadShort, PublicTask } from '../db/types';
import { acceptPublicTask, pendingTasks, inboxStore, setAction } from '../features/public/inbox';
import { NewPublicTaskDialog } from '../features/public/NewPublicTaskDialog';
import { courseName } from '../lib/courses';
import { fmtDuration } from '../lib/dates';
import { useStore } from '../lib/store';
import { supabase } from '../supabase/client';
import { sessionStore } from '../sync/syncEngine';

export function PublicTaskSummary({ task }: { task: PublicTask }) {
  if (task.kind === 'long') {
    const p = task.payload as PublicPayloadLong;
    return (
      <div className="text-sm">
        <div className="font-medium">{p.title}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span className="rounded bg-amber-100 px-1 text-amber-800">长期</span>
          <span>耗时 {p.duration_days} 天</span>
          <span>DDL {p.deadline}</span>
          <Tags tags={p.tags} />
        </div>
      </div>
    );
  }
  const p = task.payload as PublicPayloadShort;
  const total = p.subtasks.length ? p.subtasks.reduce((s, x) => s + x.duration_min, 0) : p.duration_min;
  return (
    <div className="text-sm">
      <div className="font-medium">{p.title}</div>
      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span className="rounded bg-sky-100 px-1 text-sky-800">短期</span>
        <span>{fmtDuration(total)}</span>
        <Tags tags={p.tags} />
      </div>
      {p.subtasks.length > 0 && (
        <ul className="mt-1 list-inside list-disc text-xs text-slate-500">
          {p.subtasks.map((s, i) => (
            <li key={i}>
              {s.title} · {fmtDuration(s.duration_min)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** 收到的任务卡片，白板和主页共用 */
export function PendingTaskCard({ task }: { task: PublicTask }) {
  // 接受要等网络返回，防止连点加入两次
  const [busy, setBusy] = useState(false);

  async function accept() {
    setBusy(true);
    try {
      await acceptPublicTask(task);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-3">
      <PublicTaskSummary task={task} />
      <div className="mt-1 text-xs text-slate-400">
        {task.author_name || '匿名'} · {format(new Date(task.created_at), 'M月d日 HH:mm')}
      </div>
      <div className="mt-2 flex gap-2">
        <button className="btn-primary" disabled={busy} onClick={accept}>
          接受
        </button>
        <button className="btn" disabled={busy} onClick={() => setAction(task.id, 'trashed')}>
          放入垃圾桶
        </button>
      </div>
    </div>
  );
}

export function LoginHint() {
  return (
    <div className="card p-6 text-center text-sm text-slate-500">
      白板需要登录后使用。<Link to="/account" className="text-indigo-600 hover:underline">去登录</Link>
    </div>
  );
}

export default function PublicPage() {
  const session = useStore(sessionStore);
  const state = useStore(inboxStore);
  const uid = session?.user.id;
  const [creating, setCreating] = useState(false);

  if (!supabase || !session) return <LoginHint />;

  const pending = pendingTasks(state, uid);
  const mine = state.tasks.filter((t) => t.author_id === uid);

  async function removeMine(t: PublicTask) {
    if (!confirm('撤回这条任务？已加入的同学不受影响。')) return;
    const { error } = await supabase!.from('public_tasks').delete().eq('id', t.id);
    if (error) toast(error.message, 'error');
    else inboxStore.set({ ...state, tasks: state.tasks.filter((x) => x.id !== t.id) });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section>
        {/* 与右栏带按钮的标题行同高 */}
        <h2 className="mb-2 flex h-[34px] items-center font-semibold">收到的任务</h2>
        <div className="space-y-2">
          {pending.map((t) => (
            <PendingTaskCard key={t.id} task={t} />
          ))}
          {state.loaded && pending.length === 0 && (
            <p className="py-6 text-center text-sm text-slate-400">白板上暂时没有新任务</p>
          )}
        </div>
      </section>
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold">我发布的</h2>
          <button className="btn-primary" onClick={() => setCreating(true)}>
            + 发布任务
          </button>
        </div>
        <p className="mb-2 text-xs text-slate-500">
          已有的任务可以在甘特图或日程表的任务池中点「发布」，拆分过的任务会带上子任务。
        </p>
        <div className="space-y-2">
          {mine.map((t) => (
            <div key={t.id} className="card p-3">
              <PublicTaskSummary task={t} />
              <div className="mt-1 text-xs text-slate-400">
                可见范围：{t.scopes.map(courseName).join('、')}
              </div>
              <button className="btn-xs mt-1 text-rose-600" onClick={() => removeMine(t)}>
                撤回
              </button>
            </div>
          ))}
          {mine.length === 0 && <p className="py-6 text-center text-sm text-slate-400">还没有发布过</p>}
        </div>
      </section>
      {creating && <NewPublicTaskDialog onClose={() => setCreating(false)} />}
    </div>
  );
}
