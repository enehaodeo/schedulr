import { format } from 'date-fns';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState } from 'react';
import { Modal } from '../../components/Modal';
import { db } from '../../db/dexie';
import { applyRecurring, resolveRecurringConflict } from '../../db/repo';
import { fmtMin, msToDayMin, WEEKDAYS } from '../../lib/dates';
import { useStore } from '../../lib/store';
import { useNow } from '../../lib/useNow';
import { syncStatus } from '../../sync/syncEngine';
import { planRecurring, type Conflict } from './plan';

/** 先写入不冲突的改动，再取下一个冲突 */
async function nextConflict(): Promise<Conflict | undefined> {
  for (;;) {
    const [rules, tasks] = await Promise.all([db.recurring_tasks.toArray(), db.short_tasks.toArray()]);
    const plan = planRecurring(rules, tasks, Date.now());
    if (!plan.add.length && !plan.remove.length) return plan.conflicts[0];
    await applyRecurring(plan.add, plan.remove);
  }
}

const fmtRange = (start: number, end: number) =>
  `${format(start, 'M月d日')} ${WEEKDAYS[new Date(start).getDay()]} ${fmtMin(msToDayMin(start))}-${fmtMin(msToDayMin(end))}`;

/** 按周期任务自动排入未来两周的实例；与现有日程冲突时逐个询问 */
export function RecurringWatcher() {
  const now = useNow(60_000);
  const status = useStore(syncStatus);
  const rules = useLiveQuery(() => db.recurring_tasks.toArray(), []);
  // 含已删除的行：用来判断某个实例是否生成过
  const tasks = useLiveQuery(() => db.short_tasks.toArray(), []);
  const busy = useRef(false);
  const [batch, setBatch] = useState(false);

  // 同步途中可能只拉到了一部分数据，等同步结束再生成，避免把别的设备已处理过的实例重新排入
  const ready = rules && tasks && status !== 'syncing';
  const plan = ready ? planRecurring(rules, tasks, now) : null;
  const pendingWrites = !!plan && (plan.add.length > 0 || plan.remove.length > 0);
  const conflict = plan && !pendingWrites ? plan.conflicts[0] : undefined;

  useEffect(() => {
    if (!plan || !pendingWrites || busy.current) return;
    busy.current = true;
    applyRecurring(plan.add, plan.remove).finally(() => {
      busy.current = false;
    });
  });

  if (!conflict) return null;

  const remaining = plan!.conflicts.length;
  const clashTasks = conflict.clashes
    .map((id) => tasks!.find((t) => t.id === id))
    .filter((t) => t !== undefined);

  async function resolve(take: boolean) {
    if (busy.current) return;
    busy.current = true;
    try {
      // 勾选“其余同样处理”时逐个处理：每处理一个都重新计算冲突，前面的选择会影响后面的冲突
      let current: Conflict | undefined = conflict;
      while (current) {
        await resolveRecurringConflict(current.occ, current.clashes, take);
        current = batch ? await nextConflict() : undefined;
      }
    } finally {
      busy.current = false;
      setBatch(false);
    }
  }

  return (
    <Modal title="周期任务与日程冲突">
      <div className="space-y-3 text-sm">
        <div className="rounded-md border border-indigo-200 bg-indigo-50 p-2">
          <div className="text-xs text-indigo-600">周期任务</div>
          <div className="font-medium">{conflict.occ.rule.title}</div>
          <div className="text-xs text-slate-600">{fmtRange(conflict.occ.start, conflict.occ.end)}</div>
        </div>
        <div className="rounded-md border border-slate-200 p-2">
          <div className="text-xs text-slate-500">已有日程</div>
          {clashTasks.map((t) => (
            <div key={t.id}>
              <span className="font-medium">{t.title}</span>{' '}
              <span className="text-xs text-slate-600">{fmtRange(t.start_at!, t.end_at!)}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-500">选择保留在日程里的一方，另一方会移回任务池。</p>
        {remaining > 1 && (
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" checked={batch} onChange={(e) => setBatch(e.target.checked)} />
            其余 {remaining - 1} 个冲突也这样处理
          </label>
        )}
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button className="btn" onClick={() => resolve(false)}>
            保留已有日程
          </button>
          <button className="btn-primary" onClick={() => resolve(true)}>
            放入周期任务
          </button>
        </div>
      </div>
    </Modal>
  );
}
