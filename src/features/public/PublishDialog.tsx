import { useState } from 'react';
import { CoursePicker } from '../../components/CoursePicker';
import { Modal } from '../../components/Modal';
import { db } from '../../db/dexie';
import type { LongTask, PublicPayloadLong, PublicPayloadShort, ShortTask } from '../../db/types';
import { useStore } from '../../lib/store';
import { sessionStore } from '../../sync/syncEngine';
import { publishPublicTask } from './inbox';

type Props =
  | { kind: 'long'; task: LongTask; onClose: () => void }
  | { kind: 'short'; task: ShortTask; onClose: () => void };

export function PublishDialog(props: Props) {
  const session = useStore(sessionStore);
  const [scopes, setScopes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  async function publish() {
    setBusy(true);
    let payload: PublicPayloadLong | PublicPayloadShort;
    if (props.kind === 'long') {
      const t = props.task;
      payload = { title: t.title, duration_days: t.duration_days, deadline: t.deadline, tags: t.tags };
    } else {
      const t = props.task;
      const children = (await db.short_tasks.where('parent_id').equals(t.id).sortBy('sort_order')).filter(
        (c) => !c.deleted && c.status !== 'trash',
      );
      payload = {
        title: t.title,
        duration_min: t.duration_min,
        tags: t.tags,
        subtasks: children.map((c) => ({ title: c.title, duration_min: c.duration_min, tags: c.tags })),
      };
    }
    const ok = await publishPublicTask(props.kind, payload, scopes);
    setBusy(false);
    if (ok) props.onClose();
  }

  return (
    <Modal title={`发布「${props.task.title}」到白板`} onClose={props.onClose}>
      {!session ? (
        <p className="text-sm text-slate-500">发布到白板需要先登录。</p>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="label">可见范围（选课）</label>
            <CoursePicker value={scopes} onChange={setScopes} allowSelectAll />
          </div>
          <div className="flex justify-end gap-2">
            <button className="btn" onClick={props.onClose}>
              取消
            </button>
            <button className="btn-primary" disabled={busy} onClick={publish}>
              发布
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
