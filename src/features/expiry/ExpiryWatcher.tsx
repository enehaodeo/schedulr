import { useLiveQuery } from 'dexie-react-hooks';
import { format } from 'date-fns';
import { Modal } from '../../components/Modal';
import { db } from '../../db/dexie';
import { settleParent, updateLongTask, updateShortTask } from '../../db/repo';
import { todayStr } from '../../lib/dates';
import { useNow } from '../../lib/useNow';
import { endDate, isLongExpired } from '../longTasks/gantt';

/** 到期后逐个询问完成 / 未完成 */
export function ExpiryWatcher() {
  const now = useNow(30_000);
  const today = todayStr(now);

  const long = useLiveQuery(
    () => db.long_tasks.where('status').equals('scheduled').filter((t) => !t.deleted && isLongExpired(t, today)).first(),
    [today],
  );
  const short = useLiveQuery(
    () =>
      db.short_tasks
        .where('status')
        .equals('scheduled')
        .filter((t) => !t.deleted && t.end_at !== null && t.end_at <= now)
        .first(),
    [now],
  );

  if (long) {
    return (
      <Modal title="长期任务已到期">
        <p className="text-sm">
          「{long.title}」原定 {long.start_date} → {endDate(long.start_date!, long.duration_days)}，完成了吗？
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn" onClick={() => updateLongTask(long.id, { status: 'pool', start_date: null })}>
            未完成，放回任务池
          </button>
          <button className="btn-primary" onClick={() => updateLongTask(long.id, { status: 'trash' })}>
            已完成
          </button>
        </div>
      </Modal>
    );
  }

  if (short) {
    return (
      <Modal title="日程任务已到期">
        <p className="text-sm">
          「{short.title}」{format(short.start_at!, 'M月d日 HH:mm')} - {format(short.end_at!, 'HH:mm')}，完成了吗？
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn" onClick={() => updateShortTask(short.id, { status: 'pool', start_at: null, end_at: null })}>
            未完成，放回任务池
          </button>
          <button
            className="btn-primary"
            onClick={async () => {
              await updateShortTask(short.id, { status: 'trash' });
              await settleParent(short.parent_id);
            }}
          >
            已完成
          </button>
        </div>
      </Modal>
    );
  }

  return null;
}
