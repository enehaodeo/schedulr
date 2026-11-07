import { useState } from 'react';
import { CoursePicker } from '../../components/CoursePicker';
import { Modal } from '../../components/Modal';
import { toast } from '../../components/toast';
import { db } from '../../db/dexie';
import { getProfile } from '../../db/repo';
import type { LongTask, PublicPayloadLong, PublicPayloadShort, ShortTask } from '../../db/types';
import { useStore } from '../../lib/store';
import { supabase } from '../../supabase/client';
import { sessionStore } from '../../sync/syncEngine';

type Props =
  | { kind: 'long'; task: LongTask; onClose: () => void }
  | { kind: 'short'; task: ShortTask; onClose: () => void };

export function PublishDialog(props: Props) {
  const session = useStore(sessionStore);
  const [scopes, setScopes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  async function publish() {
    if (!supabase || !session) return;
    if (!scopes.length) {
      toast('请至少选择一门课程作为可见范围', 'error');
      return;
    }
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
    const profile = await getProfile();
    const { error } = await supabase.from('public_tasks').insert({
      author_id: session.user.id,
      author_name: profile.display_name || null,
      kind: props.kind,
      payload,
      scopes,
    });
    setBusy(false);
    if (error) {
      toast(`发布失败：${error.message}`, 'error');
      return;
    }
    toast('已发布到白板');
    props.onClose();
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
