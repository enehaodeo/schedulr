import { DndContext, DragOverlay, type DragEndEvent, type DragMoveEvent, type DragOverEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { format } from 'date-fns';
import { useLiveQuery } from 'dexie-react-hooks';
import { useRef, useState } from 'react';
import { Modal } from '../components/Modal';
import { SortableRow } from '../components/SortableRow';
import { Tags } from '../components/Tags';
import { toast } from '../components/toast';
import { db } from '../db/dexie';
import { reorder, settleParent, updateShortTask } from '../db/repo';
import type { ShortTask } from '../db/types';
import { slotsForDate, windowsForDate } from '../features/availability/windows';
import { PublishDialog } from '../features/public/PublishDialog';
import { autoSchedule, canPlace, type Interval } from '../features/scheduler/autoSchedule';
import { DayTimeline, HOUR, type AvailScope } from '../features/shortTasks/DayTimeline';
import { ShortTaskForm } from '../features/shortTasks/ShortTaskForm';
import { childrenOf, leafQueue, poolTops, totalDuration } from '../features/shortTasks/tree';
import {
  addDaysStr,
  dateMinToMs,
  fmtDuration,
  fmtMin,
  fromDateStr,
  MIN_MS,
  parseHHMM,
  todayStr,
  toDateStr,
  WEEKDAYS,
} from '../lib/dates';
import { useDropPointer, useTaskSensors } from '../lib/taskDrag';
import { useNow } from '../lib/useNow';

type FormState = { task?: ShortTask; parent?: ShortTask; hasChildren?: boolean } | null;

export default function SchedulePage() {
  const all = useLiveQuery(() => db.short_tasks.filter((t) => !t.deleted).toArray(), []) ?? [];
  const avail = useLiveQuery(() => db.availability.toArray(), []) ?? [];
  const now = useNow(30_000);
  const [date, setDate] = useState(() => todayStr());
  const [editMode, setEditMode] = useState(false);
  const [scope, setScope] = useState<AvailScope>('date');
  const [form, setForm] = useState<FormState>(null);
  const [publishing, setPublishing] = useState<ShortTask | null>(null);
  const [placing, setPlacing] = useState<ShortTask | null>(null);
  const [detail, setDetail] = useState<ShortTask | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dropMin, setDropMin] = useState<number | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const sensors = useTaskSensors();
  const { pointer, collisionDetection } = useDropPointer('timeline', bodyRef);

  const tops = poolTops(all);
  const scheduled = all.filter((t) => t.status === 'scheduled' && t.start_at !== null);
  const busy = scheduled.map((t) => ({ id: t.id, start: t.start_at!, end: t.end_at! }));
  const dayStart = dateMinToMs(date, 0);
  const dayEnd = dateMinToMs(addDaysStr(date, 1), 0);
  const dayTasks = scheduled.filter((t) => t.start_at! >= dayStart && t.start_at! < dayEnd);
  const slots = slotsForDate(avail, date);
  const windows = windowsForDate(avail, date);

  function placeError(task: ShortTask, startMin: number): string | null {
    const start = dateMinToMs(date, startMin);
    const end = start + task.duration_min * MIN_MS;
    if (start < now) return '开始时间不能早于现在';
    if (!canPlace({ start, end }, windows, busy)) return '必须放在可用时间内，且不能与其他任务重叠';
    return null;
  }

  async function place(task: ShortTask, startMin: number): Promise<boolean> {
    const error = placeError(task, startMin);
    if (error) {
      toast(error, 'error');
      return false;
    }
    const start = dateMinToMs(date, startMin);
    const end = start + task.duration_min * MIN_MS;
    await updateShortTask(task.id, { status: 'scheduled', start_at: start, end_at: end });
    return true;
  }

  /** 指针所在的时刻，按 5 分钟取整 */
  function minuteAtPointer(): number | null {
    if (!pointer.current || !bodyRef.current) return null;
    const rect = bodyRef.current.getBoundingClientRect();
    return Math.round(((pointer.current.y - rect.top) / HOUR) * 12) * 5;
  }

  function trackDrop({ over }: DragMoveEvent | DragOverEvent) {
    setDropMin(over?.id === 'timeline' ? minuteAtPointer() : null);
  }

  function endDrag() {
    setActiveId(null);
    setDropMin(null);
  }

  async function onDragEnd({ active, over }: DragEndEvent) {
    endDrag();
    if (!over) return;
    const task = all.find((t) => t.id === active.id);
    if (!task) return;
    if (over.id === 'timeline') {
      if (childrenOf(all, task.id).length) {
        toast('该任务已拆分，请拖动它的子任务', 'error');
        return;
      }
      if (task.status !== 'pool') return;
      const minute = minuteAtPointer();
      if (minute === null) setPlacing(task);
      else await place(task, minute);
      return;
    }
    const overTask = all.find((t) => t.id === over.id);
    if (!overTask || overTask.parent_id !== task.parent_id || active.id === over.id) return;
    const siblings = task.parent_id ? childrenOf(all, task.parent_id) : tops;
    const ids = siblings.map((t) => t.id);
    await reorder('short_tasks', arrayMove(ids, ids.indexOf(task.id), ids.indexOf(overTask.id)));
  }

  async function runAuto() {
    const queue = leafQueue(all);
    if (!queue.length) {
      toast('任务池里没有待排的任务');
      return;
    }
    if (!windows.length) {
      toast('这一天还没有设置可用时间', 'error');
      return;
    }
    const placed = autoSchedule(queue, windows, busy, now);
    for (const p of placed) {
      await updateShortTask(p.id, { status: 'scheduled', start_at: p.start, end_at: p.end });
    }
    const skipped = queue.length - placed.length;
    toast(`已自动排入 ${placed.length} 个任务${skipped ? `，${skipped} 个放不下` : ''}`);
  }

  async function trashTask(t: ShortTask) {
    await updateShortTask(t.id, { status: 'trash' });
    for (const c of childrenOf(all, t.id)) await updateShortTask(c.id, { status: 'trash' });
    await settleParent(t.parent_id);
  }

  const activeTask = all.find((t) => t.id === activeId);
  const canDrop = !!activeTask && activeTask.status === 'pool' && childrenOf(all, activeTask.id).length === 0;
  const d = fromDateStr(date);

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
        <section className="lg:w-96 lg:shrink-0">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold">短期任务池</h2>
            <button className="btn-primary" onClick={() => setForm({})}>
              + 新建
            </button>
          </div>
          <p className="mb-2 text-xs text-slate-500">
            顺序决定自动排程的优先级；拖动卡片调整顺序或拖到右侧日程（手机上长按后拖动）
          </p>
          <SortableContext items={tops.map((t) => t.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {tops.map((t) => {
                const kids = childrenOf(all, t.id);
                return (
                  <SortableRow key={t.id} id={t.id}>
                    <div className="card p-2.5">
                      <TaskLine
                        task={t}
                        duration={totalDuration(all, t)}
                        isParent={kids.length > 0}
                        onPlace={() => setPlacing(t)}
                        onSplit={() => setForm({ parent: t })}
                        onEdit={() => setForm({ task: t, hasChildren: kids.length > 0 })}
                        onPublish={() => setPublishing(t)}
                        onTrash={() => trashTask(t)}
                      />
                      {kids.length > 0 && (
                        <SortableContext items={kids.map((k) => k.id)} strategy={verticalListSortingStrategy}>
                          <div className="mt-2 space-y-1 border-l-2 border-indigo-100 pl-2">
                            {kids.map((k) => (
                              <SortableRow key={k.id} id={k.id} disabled={k.status !== 'pool'}>
                                <div className={`rounded bg-slate-50 p-1.5 ${k.status !== 'pool' ? 'opacity-60' : ''}`}>
                                  <TaskLine
                                    task={k}
                                    duration={k.duration_min}
                                    onPlace={k.status === 'pool' ? () => setPlacing(k) : undefined}
                                    onEdit={() => setForm({ task: k })}
                                    onTrash={() => trashTask(k)}
                                  />
                                </div>
                              </SortableRow>
                            ))}
                          </div>
                        </SortableContext>
                      )}
                    </div>
                  </SortableRow>
                );
              })}
              {tops.length === 0 && <p className="py-6 text-center text-sm text-slate-400">任务池是空的</p>}
            </div>
          </SortableContext>
        </section>

        <section className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h2 className="mr-auto font-semibold">
              {format(d, 'M月d日')} {WEEKDAYS[d.getDay()]}
              {date === todayStr(now) && <span className="ml-1 text-sm text-indigo-600">今天 {format(now, 'HH:mm')}</span>}
            </h2>
            <button className="btn" onClick={() => setDate(addDaysStr(date, -1))}>
              ←
            </button>
            <button className="btn" onClick={() => setDate(todayStr())}>
              今天
            </button>
            <button className="btn" onClick={() => setDate(addDaysStr(date, 1))}>
              →
            </button>
            <input className="input w-auto" type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
          </div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <button className="btn-primary" onClick={runAuto} disabled={editMode}>
              自动排程
            </button>
            <button className={editMode ? 'btn-primary' : 'btn'} onClick={() => setEditMode(!editMode)}>
              {editMode ? '完成编辑' : '选取可用时间'}
            </button>
            {editMode && (
              <>
                <select className="input w-auto" value={scope} onChange={(e) => setScope(e.target.value as AvailScope)}>
                  <option value="date">仅此日期</option>
                  <option value="weekly">每{WEEKDAYS[d.getDay()]}</option>
                </select>
                <span className="text-xs text-slate-500">在时间轴上按住拖动框选可用时段</span>
              </>
            )}
          </div>
          <DayTimeline
            date={date}
            now={now}
            slots={slots}
            windows={windows}
            busy={busy}
            tasks={dayTasks}
            editMode={editMode}
            scope={scope}
            bodyRef={bodyRef}
            ghost={
              canDrop && dropMin !== null
                ? {
                    title: activeTask.title,
                    startMin: dropMin,
                    duration: activeTask.duration_min,
                    ok: !placeError(activeTask, dropMin),
                  }
                : null
            }
            onOpen={setDetail}
          />
        </section>
      </div>

      <DragOverlay>
        {activeTask && !(canDrop && dropMin !== null) && (
          <div className="rounded-md bg-indigo-500 px-3 py-2 text-sm text-white shadow-lg">
            {activeTask.title} · {fmtDuration(totalDuration(all, activeTask))}
          </div>
        )}
      </DragOverlay>

      {form && <ShortTaskForm {...form} onClose={() => setForm(null)} />}
      {publishing && <PublishDialog kind="short" task={publishing} onClose={() => setPublishing(null)} />}
      {placing && (
        <PlaceDialog
          task={placing}
          date={date}
          windows={windows}
          onPlace={async (m) => (await place(placing, m)) && setPlacing(null)}
          onClose={() => setPlacing(null)}
        />
      )}
      {detail && (
        <Modal title={detail.title} onClose={() => setDetail(null)}>
          <p className="text-sm">
            {format(detail.start_at!, 'M月d日 HH:mm')} - {format(detail.end_at!, 'HH:mm')}（{fmtDuration(detail.duration_min)}）
          </p>
          <div className="mt-1">
            <Tags tags={detail.tags} />
          </div>
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <button
              className="btn"
              onClick={async () => {
                await updateShortTask(detail.id, { status: 'pool', start_at: null, end_at: null });
                setDetail(null);
              }}
            >
              移回任务池
            </button>
            <button
              className="btn-primary"
              onClick={async () => {
                await updateShortTask(detail.id, { status: 'trash' });
                await settleParent(detail.parent_id);
                toast('已完成，放入垃圾桶');
                setDetail(null);
              }}
            >
              完成
            </button>
          </div>
        </Modal>
      )}
    </DndContext>
  );
}

function TaskLine({
  task,
  duration,
  isParent,
  onPlace,
  onSplit,
  onEdit,
  onPublish,
  onTrash,
}: {
  task: ShortTask;
  duration: number;
  isParent?: boolean;
  onPlace?: () => void;
  onSplit?: () => void;
  onEdit: () => void;
  onPublish?: () => void;
  onTrash: () => void;
}) {
  return (
    <div>
      <div className="flex items-start gap-2">
        <span className="min-w-0 flex-1 text-sm font-medium">{task.title}</span>
        <span className="shrink-0 text-xs text-slate-500">{fmtDuration(duration)}</span>
      </div>
      <div className="mt-0.5 flex flex-wrap items-center gap-1">
        <Tags tags={task.tags} />
        {task.status === 'scheduled' && task.start_at && (
          <span className="text-xs text-indigo-600">已排 {format(task.start_at, 'M/d HH:mm')}</span>
        )}
      </div>
      <div className="mt-1 flex flex-wrap gap-1">
        {onPlace && !isParent && (
          <button className="btn-xs" onClick={onPlace}>
            排入
          </button>
        )}
        {onSplit && task.parent_id === null && (
          <button className="btn-xs" onClick={onSplit}>
            拆分
          </button>
        )}
        <button className="btn-xs" onClick={onEdit}>
          编辑
        </button>
        {onPublish && (
          <button className="btn-xs" onClick={onPublish}>
            发布
          </button>
        )}
        <button className="btn-xs" onClick={onTrash}>
          删除
        </button>
      </div>
    </div>
  );
}

function PlaceDialog({
  task,
  date,
  windows,
  onPlace,
  onClose,
}: {
  task: ShortTask;
  date: string;
  windows: Interval[];
  onPlace: (startMin: number) => void;
  onClose: () => void;
}) {
  const first = windows[0] ? Math.round((windows[0].start - dateMinToMs(date, 0)) / MIN_MS) : 9 * 60;
  const [time, setTime] = useState(fmtMin(first));
  return (
    <Modal title={`排入「${task.title}」`} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          {toDateStr(fromDateStr(date))}，耗时 {fmtDuration(task.duration_min)}
        </p>
        <div>
          <label className="label">开始时间</label>
          <input className="input" type="time" step={300} value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2">
          <button className="btn" onClick={onClose}>
            取消
          </button>
          <button className="btn-primary" onClick={() => onPlace(parseHHMM(time))}>
            确定
          </button>
        </div>
      </div>
    </Modal>
  );
}
