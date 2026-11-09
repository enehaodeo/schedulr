import { DndContext, DragOverlay, type DragEndEvent, type DragMoveEvent, type DragOverEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useLiveQuery } from 'dexie-react-hooks';
import { useRef, useState } from 'react';
import { Modal } from '../components/Modal';
import { SortableRow } from '../components/SortableRow';
import { Tags } from '../components/Tags';
import { toast } from '../components/toast';
import { db } from '../db/dexie';
import { reorder, updateLongTask } from '../db/repo';
import type { LongTask } from '../db/types';
import { canStartOn, endDate, fitsDeadline, latestStart } from '../features/longTasks/gantt';
import { COL, GanttChart } from '../features/longTasks/GanttChart';
import { LongTaskForm } from '../features/longTasks/LongTaskForm';
import { PublishDialog } from '../features/public/PublishDialog';
import { addDaysStr, diffDays, todayStr } from '../lib/dates';
import { useDropPointer, useTaskSensors } from '../lib/taskDrag';
import { useNow } from '../lib/useNow';
import { orderPatches, useOptimisticRows } from '../lib/useOptimisticRows';

const DAYS = 63;

export default function GanttPage() {
  const stored = useLiveQuery(() => db.long_tasks.filter((t) => !t.deleted).toArray(), []) ?? [];
  const [tasks, applyOptimistic] = useOptimisticRows(stored);
  const pool = tasks.filter((t) => t.status === 'pool').sort((a, b) => a.sort_order - b.sort_order);
  const scheduled = tasks
    .filter((t) => t.status === 'scheduled')
    .sort((a, b) => a.start_date!.localeCompare(b.start_date!) || a.sort_order - b.sort_order);

  const now = useNow(60_000);
  const today = todayStr(now);
  const [viewStart, setViewStart] = useState(() => addDaysStr(todayStr(), -7));
  const bodyRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState<LongTask | 'new' | null>(null);
  const [publishing, setPublishing] = useState<LongTask | null>(null);
  const [placing, setPlacing] = useState<LongTask | null>(null);
  const [detail, setDetail] = useState<LongTask | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dropStart, setDropStart] = useState<string | null>(null);

  const sensors = useTaskSensors();
  const { pointer, collisionDetection } = useDropPointer('gantt', bodyRef);

  async function place(task: LongTask, start: string): Promise<boolean> {
    if (diffDays(start, today) < 0) {
      toast('开始日期不能早于今天', 'error');
      return false;
    }
    if (!fitsDeadline(start, task.duration_days, task.deadline)) {
      toast(`结束时间不能晚于 deadline（最晚 ${latestStart(task.duration_days, task.deadline)} 开始）`, 'error');
      return false;
    }
    const patch = { status: 'scheduled' as const, start_date: start };
    await applyOptimistic({ [task.id]: patch }, () => updateLongTask(task.id, patch));
    return true;
  }

  /** 指针所在的日期 */
  function dayAtPointer(): string | null {
    if (!pointer.current || !bodyRef.current) return null;
    const rect = bodyRef.current.getBoundingClientRect();
    return addDaysStr(viewStart, Math.floor((pointer.current.x - rect.left) / COL));
  }

  function trackDrop({ over }: DragMoveEvent | DragOverEvent) {
    setDropStart(over?.id === 'gantt' ? dayAtPointer() : null);
  }

  function endDrag() {
    setActiveId(null);
    setDropStart(null);
  }

  async function onDragEnd({ active, over }: DragEndEvent) {
    endDrag();
    if (!over) return;
    const task = pool.find((t) => t.id === active.id);
    if (!task) return;
    if (over.id === 'gantt') {
      const start = dayAtPointer();
      if (start) await place(task, start);
      else setPlacing(task);
      return;
    }
    if (active.id !== over.id) {
      const ids = pool.map((t) => t.id);
      const ordered = arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id)));
      await applyOptimistic(orderPatches(ordered), () => reorder('long_tasks', ordered));
    }
  }

  const activeTask = pool.find((t) => t.id === activeId);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={(e) => setActiveId(String(e.active.id))}
      onDragMove={trackDrop}
      onDragOver={trackDrop}
      onDragCancel={endDrag}
      onDragEnd={onDragEnd}
    >
      <div className="flex flex-col gap-4 lg:flex-row">
        <section className="lg:w-80 lg:shrink-0">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold">长期任务池</h2>
            <button className="btn-primary" onClick={() => setEditing('new')}>
              + 新建
            </button>
          </div>
          <p className="mb-2 text-xs text-slate-500">拖动卡片调整顺序，或拖到右侧甘特图排期（手机上长按后拖动）</p>
          <SortableContext items={pool.map((t) => t.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {pool.map((t) => (
                <SortableRow key={t.id} id={t.id}>
                  <PoolCard
                    task={t}
                    today={today}
                    onEdit={() => setEditing(t)}
                    onPlace={() => setPlacing(t)}
                    onPublish={() => setPublishing(t)}
                  />
                </SortableRow>
              ))}
              {pool.length === 0 && <p className="py-6 text-center text-sm text-slate-400">任务池是空的</p>}
            </div>
          </SortableContext>
        </section>

        <section className="min-w-0 flex-1">
          <div className="mb-2 flex items-center gap-2">
            <h2 className="mr-auto font-semibold">个人甘特图</h2>
            <button className="btn" onClick={() => setViewStart(addDaysStr(viewStart, -28))}>
              ← 前四周
            </button>
            <button className="btn" onClick={() => setViewStart(addDaysStr(today, -7))}>
              今天
            </button>
            <button className="btn" onClick={() => setViewStart(addDaysStr(viewStart, 28))}>
              后四周 →
            </button>
          </div>
          <GanttChart
            tasks={scheduled}
            viewStart={viewStart}
            days={DAYS}
            today={today}
            now={now}
            bodyRef={bodyRef}
            preview={activeTask ? { task: activeTask, start: dropStart } : null}
            onOpen={setDetail}
          />
          {activeTask ? (
            <DropHint task={activeTask} today={today} />
          ) : (
            <p className="mt-2 text-xs text-slate-500">
              拖动色条可改开始日期，拖右边缘可改耗时；红色 DDL 标记为截止日；红色竖线为当前时间。
            </p>
          )}
        </section>
      </div>

      {/* 不要落下动画：它播放时会把原卡片隐藏，松手后卡片就消失一下 */}
      <DragOverlay dropAnimation={null}>
        {activeTask && !dropStart && (
          <div className="rounded-md bg-indigo-500 px-3 py-2 text-sm text-white shadow-lg">{activeTask.title}</div>
        )}
      </DragOverlay>

      {editing && <LongTaskForm task={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
      {publishing && <PublishDialog kind="long" task={publishing} onClose={() => setPublishing(null)} />}
      {placing && (
        <PlaceDialog
          task={placing}
          today={today}
          onPlace={async (start) => (await place(placing, start)) && setPlacing(null)}
          onClose={() => setPlacing(null)}
        />
      )}
      {detail && (
        <DetailDialog
          task={tasks.find((t) => t.id === detail.id) ?? detail}
          onClose={() => setDetail(null)}
          onEdit={() => {
            setEditing(detail);
            setDetail(null);
          }}
          onPublish={() => {
            setPublishing(detail);
            setDetail(null);
          }}
        />
      )}
    </DndContext>
  );
}

/** 范围可能超出当前视图，所以同时用文字说明 */
function DropHint({ task, today }: { task: LongTask; today: string }) {
  if (!canStartOn(today, task.duration_days, task.deadline, today)) {
    return (
      <p className="mt-2 text-xs text-rose-600">
        耗时 {task.duration_days} 天，今天开始也会晚于 deadline（{task.deadline}），请先编辑耗时或 deadline。
      </p>
    );
  }
  return (
    <p className="mt-2 text-xs text-emerald-700">
      绿色区域可放入：{today} 至 {task.deadline}，最晚 {latestStart(task.duration_days, task.deadline)} 开始；虚线条是松手后的位置。
    </p>
  );
}

function PoolCard({
  task,
  today,
  onEdit,
  onPlace,
  onPublish,
}: {
  task: LongTask;
  today: string;
  onEdit: () => void;
  onPlace: () => void;
  onPublish: () => void;
}) {
  const left = diffDays(task.deadline, today);
  return (
    <div className="card p-2.5">
      <div className="flex items-start gap-2">
        <span className="min-w-0 flex-1 font-medium">{task.title}</span>
        <span className={`shrink-0 text-xs ${left < 0 ? 'text-rose-600' : left <= 3 ? 'text-amber-600' : 'text-slate-500'}`}>
          {left < 0 ? `已过期 ${-left} 天` : left === 0 ? '今天截止' : `${left} 天后截止`}
        </span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span>耗时 {task.duration_days} 天</span>
        <span>DDL {task.deadline}</span>
        <Tags tags={task.tags} />
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1">
        <button className="btn-xs" onClick={onPlace}>
          排入
        </button>
        <button className="btn-xs" onClick={onEdit}>
          编辑
        </button>
        <button className="btn-xs" onClick={onPublish}>
          发布
        </button>
        <button className="btn-xs" onClick={() => updateLongTask(task.id, { status: 'trash' })}>
          删除
        </button>
      </div>
    </div>
  );
}

function PlaceDialog({
  task,
  today,
  onPlace,
  onClose,
}: {
  task: LongTask;
  today: string;
  onPlace: (start: string) => void;
  onClose: () => void;
}) {
  const latest = latestStart(task.duration_days, task.deadline);
  const [start, setStart] = useState(today);
  const impossible = diffDays(latest, today) < 0;
  return (
    <Modal title={`排入「${task.title}」`} onClose={onClose}>
      {impossible ? (
        <p className="text-sm text-rose-600">
          耗时 {task.duration_days} 天，今天开始也会晚于 deadline（{task.deadline}）。请先编辑耗时或 deadline。
        </p>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="label">开始日期（最晚 {latest}）</label>
            <input className="input" type="date" min={today} max={latest} value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <p className="text-xs text-slate-500">
            结束日期：{endDate(start, task.duration_days)}；Deadline：{task.deadline}
          </p>
          <div className="flex justify-end gap-2">
            <button className="btn" onClick={onClose}>
              取消
            </button>
            <button className="btn-primary" onClick={() => onPlace(start)}>
              确定
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function DetailDialog({
  task,
  onClose,
  onEdit,
  onPublish,
}: {
  task: LongTask;
  onClose: () => void;
  onEdit: () => void;
  onPublish: () => void;
}) {
  return (
    <Modal title={task.title} onClose={onClose}>
      <div className="space-y-1 text-sm">
        <p>
          {task.start_date} → {task.start_date && endDate(task.start_date, task.duration_days)}（{task.duration_days} 天）
        </p>
        <p>Deadline：{task.deadline}</p>
        <Tags tags={task.tags} />
      </div>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button className="btn" onClick={onEdit}>
          编辑
        </button>
        <button className="btn" onClick={onPublish}>
          发布
        </button>
        <button
          className="btn"
          onClick={async () => {
            await updateLongTask(task.id, { status: 'pool', start_date: null });
            onClose();
          }}
        >
          移回任务池
        </button>
        <button
          className="btn-primary"
          onClick={async () => {
            await updateLongTask(task.id, { status: 'trash' });
            toast('已完成，放入垃圾桶');
            onClose();
          }}
        >
          完成
        </button>
      </div>
    </Modal>
  );
}
