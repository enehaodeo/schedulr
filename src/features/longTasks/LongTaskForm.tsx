import { useState, type FormEvent } from 'react';
import { Modal } from '../../components/Modal';
import { NumberInput } from '../../components/NumberInput';
import { TagInput } from '../../components/TagInput';
import { parseTags } from '../../components/Tags';
import { toast } from '../../components/toast';
import { addLongTask, updateLongTask } from '../../db/repo';
import type { LongTask } from '../../db/types';
import { addDaysStr, todayStr } from '../../lib/dates';
import { fitsDeadline } from './gantt';

export function LongTaskForm({ task, onClose }: { task?: LongTask; onClose: () => void }) {
  const [title, setTitle] = useState(task?.title ?? '');
  const [days, setDays] = useState(String(task?.duration_days ?? 1));
  const [deadline, setDeadline] = useState(task?.deadline ?? addDaysStr(todayStr(), 7));
  const [tags, setTags] = useState(task?.tags.join(', ') ?? '');

  async function submit(e: FormEvent) {
    e.preventDefault();
    const duration = Number(days);
    const data = { title: title.trim(), duration_days: duration, deadline, tags: parseTags(tags) };
    if (!data.title) return;
    if (duration < 1) {
      toast('耗时至少 1 天', 'error');
      return;
    }
    if (task?.status === 'scheduled' && task.start_date && !fitsDeadline(task.start_date, duration, deadline)) {
      toast('该任务已在甘特图中，修改后结束时间会晚于 deadline', 'error');
      return;
    }
    if (task) await updateLongTask(task.id, data);
    else await addLongTask(data);
    onClose();
  }

  return (
    <Modal title={task ? '编辑长期任务' : '新建长期任务'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="label">任务名称</label>
          <input className="input" required autoFocus value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">耗时（天）</label>
            <NumberInput required value={days} onChange={setDays} />
          </div>
          <div>
            <label className="label">Deadline</label>
            <input className="input" type="date" required value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label">标签（逗号或空格分隔）</label>
          <TagInput value={tags} onChange={setTags} placeholder="数学, IA" />
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
