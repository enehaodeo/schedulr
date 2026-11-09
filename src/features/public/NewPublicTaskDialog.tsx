import { useState, type FormEvent } from 'react';
import { CoursePicker } from '../../components/CoursePicker';
import { Modal } from '../../components/Modal';
import { NumberInput } from '../../components/NumberInput';
import { TagInput } from '../../components/TagInput';
import { parseTags } from '../../components/Tags';
import { toast } from '../../components/toast';
import type { PublicTask } from '../../db/types';
import { addDaysStr, todayStr } from '../../lib/dates';
import { canStartOn } from '../longTasks/gantt';
import { publishPublicTask } from './inbox';

/** 在白板上直接写一条任务并发布，不经过自己的任务池 */
export function NewPublicTaskDialog({ onClose }: { onClose: () => void }) {
  const [kind, setKind] = useState<PublicTask['kind']>('short');
  const [title, setTitle] = useState('');
  const [days, setDays] = useState('1');
  const [deadline, setDeadline] = useState(() => addDaysStr(todayStr(), 7));
  const [hours, setHours] = useState('0');
  const [mins, setMins] = useState('30');
  const [tags, setTags] = useState('');
  const [scopes, setScopes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const base = { title: title.trim(), tags: parseTags(tags) };
    if (!base.title) return;
    const durationDays = Number(days);
    const durationMin = Number(hours) * 60 + Number(mins);
    if (kind === 'long') {
      if (durationDays < 1) {
        toast('耗时至少 1 天', 'error');
        return;
      }
      const today = todayStr();
      if (!canStartOn(today, durationDays, deadline, today)) {
        toast('今天开始也会晚于 deadline，同学来不及完成，请修改耗时或 deadline', 'error');
        return;
      }
    } else if (durationMin < 1) {
      toast('耗时至少 1 分钟', 'error');
      return;
    }
    setBusy(true);
    const ok =
      kind === 'long'
        ? await publishPublicTask('long', { ...base, duration_days: durationDays, deadline }, scopes)
        : await publishPublicTask('short', { ...base, duration_min: durationMin, subtasks: [] }, scopes);
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <Modal title="发布任务到白板" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div className="flex gap-2">
          <button type="button" className={kind === 'short' ? 'btn-primary' : 'btn'} onClick={() => setKind('short')}>
            短期任务
          </button>
          <button type="button" className={kind === 'long' ? 'btn-primary' : 'btn'} onClick={() => setKind('long')}>
            长期任务
          </button>
        </div>
        <div>
          <label className="label">任务名称</label>
          <input className="input" required autoFocus value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        {kind === 'long' ? (
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
        <div>
          <label className="label">可见范围（选课）</label>
          <CoursePicker value={scopes} onChange={setScopes} allowSelectAll />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn" onClick={onClose}>
            取消
          </button>
          <button className="btn-primary" disabled={busy}>
            发布
          </button>
        </div>
      </form>
    </Modal>
  );
}
