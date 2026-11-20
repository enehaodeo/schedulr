import { useLiveQuery } from 'dexie-react-hooks';
import { useState, type FormEvent } from 'react';
import { Modal } from '../../components/Modal';
import { TagInput } from '../../components/TagInput';
import { parseTags, Tags } from '../../components/Tags';
import { toast } from '../../components/toast';
import { db } from '../../db/dexie';
import { addRecurring, removeRecurring, updateRecurring } from '../../db/repo';
import type { RecurringTask } from '../../db/types';
import { fmtMin, parseHHMM, todayStr, WEEKDAYS } from '../../lib/dates';
import { ruleError } from './plan';

/** 周一在前的显示顺序 */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function weekdaysText(days: number[]): string {
  return WEEK_ORDER.filter((d) => days.includes(d))
    .map((d) => WEEKDAYS[d])
    .join('、');
}

/** 周期任务列表 + 新建 / 编辑 */
export function RecurringDialog({ onClose }: { onClose: () => void }) {
  const rules =
    useLiveQuery(() => db.recurring_tasks.filter((r) => !r.deleted).toArray(), [])?.sort((a, b) =>
      a.start_date === b.start_date ? a.start_min - b.start_min : a.start_date.localeCompare(b.start_date),
    ) ?? [];
  const [editing, setEditing] = useState<RecurringTask | 'new' | null>(null);

  if (editing) {
    return (
      <RecurringForm
        rule={editing === 'new' ? undefined : editing}
        onDone={() => setEditing(null)}
      />
    );
  }

  async function remove(r: RecurringTask) {
    if (!confirm(`删除周期任务「${r.title}」？日程里还没开始的实例会一起移除。`)) return;
    await removeRecurring(r.id);
  }

  return (
    <Modal title="周期任务" onClose={onClose}>
      <p className="mb-3 text-xs text-slate-500">
        每周固定时间的任务会自动排入未来两周的日程；与已有日程冲突时会询问保留哪一个。
      </p>
      <div className="space-y-2">
        {rules.map((r) => (
          <div key={r.id} className="card p-2.5 text-sm">
            <div className="font-medium">{r.title}</div>
            <div className="text-xs text-slate-600">
              每{weekdaysText(r.weekdays)} {fmtMin(r.start_min)}-{fmtMin(r.end_min)}
            </div>
            <div className="text-xs text-slate-500">
              {r.start_date} 起{r.end_date ? `，到 ${r.end_date}` : ''}
            </div>
            <Tags tags={r.tags} />
            <div className="mt-1 flex gap-1">
              <button className="btn-xs" onClick={() => setEditing(r)}>
                编辑
              </button>
              <button className="btn-xs text-rose-600" onClick={() => remove(r)}>
                删除
              </button>
            </div>
          </div>
        ))}
        {rules.length === 0 && <p className="py-4 text-center text-sm text-slate-400">还没有周期任务</p>}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn" onClick={onClose}>
          关闭
        </button>
        <button className="btn-primary" onClick={() => setEditing('new')}>
          + 新建
        </button>
      </div>
    </Modal>
  );
}

function RecurringForm({ rule, onDone }: { rule?: RecurringTask; onDone: () => void }) {
  const [title, setTitle] = useState(rule?.title ?? '');
  const [tags, setTags] = useState((rule?.tags ?? []).join(', '));
  const [weekdays, setWeekdays] = useState<number[]>(rule?.weekdays ?? []);
  const [start, setStart] = useState(fmtMin(rule?.start_min ?? 8 * 60));
  const [end, setEnd] = useState(fmtMin(rule?.end_min ?? 9 * 60));
  const [startDate, setStartDate] = useState(rule?.start_date ?? todayStr());
  const [endDate, setEndDate] = useState(rule?.end_date ?? '');

  function toggleDay(d: number) {
    setWeekdays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort()));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const data = {
      title: title.trim(),
      tags: parseTags(tags),
      weekdays,
      start_min: start ? parseHHMM(start) : NaN,
      end_min: end ? parseHHMM(end) : NaN,
      start_date: startDate,
      end_date: endDate || null,
    };
    if (Number.isNaN(data.start_min) || Number.isNaN(data.end_min)) {
      toast('请填写时间段', 'error');
      return;
    }
    const error = ruleError(data);
    if (error) {
      toast(error, 'error');
      return;
    }
    if (rule) {
      await updateRecurring(rule.id, data);
      toast('已保存，未来的实例会按新设置重新排入');
    } else {
      await addRecurring(data);
      toast('已创建，正在排入日程');
    }
    onDone();
  }

  return (
    <Modal title={rule ? '编辑周期任务' : '新建周期任务'} onClose={onDone}>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="label">任务名称</label>
          <input className="input" required autoFocus value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label className="label">每周</label>
          <div className="flex flex-wrap gap-1">
            {WEEK_ORDER.map((d) => (
              <button
                key={d}
                type="button"
                className={weekdays.includes(d) ? 'btn-primary' : 'btn'}
                aria-pressed={weekdays.includes(d)}
                onClick={() => toggleDay(d)}
              >
                {WEEKDAYS[d]}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">开始时间</label>
            <input className="input" type="time" step={300} required value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div>
            <label className="label">结束时间</label>
            <input className="input" type="time" step={300} required value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">起始日期</label>
            <input className="input" type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <label className="label">结束日期（可选）</label>
            <input className="input" type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label">标签（逗号或空格分隔）</label>
          <TagInput value={tags} onChange={setTags} placeholder="物理, 课程" />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn" onClick={onDone}>
            取消
          </button>
          <button className="btn-primary">保存</button>
        </div>
      </form>
    </Modal>
  );
}
