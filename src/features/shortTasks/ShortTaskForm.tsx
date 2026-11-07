import { useState, type FormEvent } from 'react';
import { Modal } from '../../components/Modal';
import { NumberInput } from '../../components/NumberInput';
import { TagInput } from '../../components/TagInput';
import { parseTags } from '../../components/Tags';
import { toast } from '../../components/toast';
import { addShortTask, updateShortTask } from '../../db/repo';
import type { ShortTask } from '../../db/types';

export function ShortTaskForm({
  task,
  parent,
  hasChildren,
  onClose,
}: {
  task?: ShortTask;
  /** 新建子任务时的父任务 */
  parent?: ShortTask;
  hasChildren?: boolean;
  onClose: () => void;
}) {
  const initial = task?.duration_min ?? 30;
  const [title, setTitle] = useState(task?.title ?? '');
  const [hours, setHours] = useState(String(Math.floor(initial / 60)));
  const [mins, setMins] = useState(String(initial % 60));
  const [tags, setTags] = useState((task?.tags ?? parent?.tags ?? []).join(', '));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const duration = Number(hours) * 60 + Number(mins);
    if (!title.trim()) return;
    if (!hasChildren && duration < 1) {
      toast('耗时至少 1 分钟', 'error');
      return;
    }
    const data = { title: title.trim(), duration_min: duration, tags: parseTags(tags) };
    if (task) {
      if (task.status === 'scheduled' && duration !== task.duration_min) {
        await updateShortTask(task.id, { ...data, status: 'pool', start_at: null, end_at: null });
        toast('耗时已修改，任务已放回任务池，请重新排入');
      } else {
        await updateShortTask(task.id, data);
      }
    } else {
      await addShortTask({ ...data, parent_id: parent?.id ?? null });
    }
    onClose();
  }

  const heading = task ? '编辑短期任务' : parent ? `拆分「${parent.title}」：新建子任务` : '新建短期任务';

  return (
    <Modal title={heading} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="label">任务名称</label>
          <input className="input" required autoFocus value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        {hasChildren ? (
          <p className="text-xs text-slate-500">该任务已拆分，耗时为子任务之和。</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">小时</label>
              <NumberInput placeholder="0" value={hours} onChange={setHours} />
            </div>
            <div>
              <label className="label">分钟</label>
              <NumberInput placeholder="0" max={59} value={mins} onChange={setMins} />
            </div>
          </div>
        )}
        <div>
          <label className="label">标签（逗号或空格分隔）</label>
          <TagInput value={tags} onChange={setTags} placeholder="物理, 作业" />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn" onClick={onClose}>
            取消
          </button>
          <button className="btn-primary">保存</button>
        </div>
      </form>
    </Modal>
  );
}
