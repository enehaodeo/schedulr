import { useLiveQuery } from 'dexie-react-hooks';
import { Tags } from '../components/Tags';
import { db } from '../db/dexie';
import { addFromPublic, purge, updateLongTask, updateShortTask } from '../db/repo';
import type { ShortTask } from '../db/types';
import { inboxStore, setAction } from '../features/public/inbox';
import { fmtDuration } from '../lib/dates';
import { useStore } from '../lib/store';
import { PublicTaskSummary } from './PublicPage';

export default function TrashPage() {
  const long = useLiveQuery(() => db.long_tasks.where('status').equals('trash').filter((t) => !t.deleted).toArray(), []) ?? [];
  const short = useLiveQuery(() => db.short_tasks.filter((t) => !t.deleted).toArray(), []) ?? [];
  const inbox = useStore(inboxStore);
  const trashedShort = short.filter((t) => t.status === 'trash');
  const trashedPublic = inbox.tasks.filter((t) => inbox.actions[t.id] === 'trashed');
  const titleOf = (id: string | null) => short.find((t) => t.id === id)?.title;

  async function restoreShort(t: ShortTask) {
    await updateShortTask(t.id, { status: 'pool', start_at: null, end_at: null });
    const parent = short.find((p) => p.id === t.parent_id);
    if (parent?.status === 'trash') await updateShortTask(parent.id, { status: 'pool' });
  }

  async function emptyTrash() {
    if (!confirm('彻底删除垃圾桶里的所有个人任务？')) return;
    for (const t of long) await purge('long_tasks', t.id);
    for (const t of trashedShort) await purge('short_tasks', t.id);
  }

  const empty = !long.length && !trashedShort.length && !trashedPublic.length;

  return (
    <div className="space-y-6">
      <div className="flex items-center">
        <h2 className="mr-auto font-semibold">垃圾桶</h2>
        {(long.length > 0 || trashedShort.length > 0) && (
          <button className="btn-danger" onClick={emptyTrash}>
            清空
          </button>
        )}
      </div>
      {empty && <p className="py-10 text-center text-sm text-slate-400">垃圾桶是空的</p>}

      {long.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-medium text-slate-600">长期任务</h3>
          <div className="space-y-2">
            {long.map((t) => (
              <div key={t.id} className="card flex flex-wrap items-center gap-2 p-2.5 text-sm">
                <span className="font-medium">{t.title}</span>
                <span className="text-xs text-slate-500">
                  {t.duration_days} 天 · DDL {t.deadline}
                </span>
                <Tags tags={t.tags} />
                <span className="ml-auto flex gap-1">
                  <button className="btn-xs" onClick={() => updateLongTask(t.id, { status: 'pool', start_date: null })}>
                    恢复到任务池
                  </button>
                  <button className="btn-xs text-rose-600" onClick={() => purge('long_tasks', t.id)}>
                    彻底删除
                  </button>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {trashedShort.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-medium text-slate-600">短期任务</h3>
          <div className="space-y-2">
            {trashedShort.map((t) => (
              <div key={t.id} className="card flex flex-wrap items-center gap-2 p-2.5 text-sm">
                <span className="font-medium">{t.title}</span>
                {t.parent_id && <span className="text-xs text-slate-400">（{titleOf(t.parent_id)} 的子任务）</span>}
                <span className="text-xs text-slate-500">{fmtDuration(t.duration_min)}</span>
                <Tags tags={t.tags} />
                <span className="ml-auto flex gap-1">
                  <button className="btn-xs" onClick={() => restoreShort(t)}>
                    恢复到任务池
                  </button>
                  <button className="btn-xs text-rose-600" onClick={() => purge('short_tasks', t.id)}>
                    彻底删除
                  </button>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {trashedPublic.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-medium text-slate-600">丢弃的白板任务</h3>
          <div className="space-y-2">
            {trashedPublic.map((t) => (
              <div key={t.id} className="card p-2.5">
                <PublicTaskSummary task={t} />
                <div className="mt-1 flex gap-1">
                  <button
                    className="btn-xs"
                    onClick={async () => {
                      await addFromPublic(t.id, t.kind, t.payload);
                      await setAction(t.id, 'added');
                    }}
                  >
                    加入任务池
                  </button>
                  <button className="btn-xs" onClick={() => setAction(t.id, null)}>
                    放回收件箱
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
