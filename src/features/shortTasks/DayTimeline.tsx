import { useDroppable } from '@dnd-kit/core';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { toast } from '../../components/toast';
import { editAvailability, updateShortTask, type AvailTarget } from '../../db/repo';
import type { Availability, ShortTask } from '../../db/types';
import { dateMinToMs, fmtMin, fromDateStr, MIN_MS, msToDayMin, todayStr } from '../../lib/dates';
import { mergeRanges, type MinRange } from '../availability/windows';
import { canPlace, type Interval } from '../scheduler/autoSchedule';

export const HOUR = 48;
const pxToMin = (px: number) => (px / HOUR) * 60;
const minToPx = (m: number) => (m * HOUR) / 60;
const snap = (m: number, step: number) => Math.round(m / step) * step;
const clampDay = (m: number) => Math.min(24 * 60, Math.max(0, m));

export type AvailScope = 'date' | 'weekly';

export function DayTimeline({
  date,
  now,
  slots,
  windows,
  busy,
  tasks,
  editMode,
  scope,
  bodyRef,
  ghost,
  onOpen,
}: {
  date: string;
  now: number;
  /** 当天生效的可用时间行 */
  slots: Availability[];
  windows: Interval[];
  /** 所有已排任务的时间段 */
  busy: { id: string; start: number; end: number }[];
  /** 当天的已排任务 */
  tasks: ShortTask[];
  editMode: boolean;
  scope: AvailScope;
  bodyRef: RefObject<HTMLDivElement>;
  /** 从任务池拖入时，松手后任务的位置；ok 表示这里可以放下 */
  ghost: { title: string; startMin: number; duration: number; ok: boolean } | null;
  onOpen: (t: ShortTask) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: 'timeline' });
  const scrollRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<{ from: number; to: number } | null>(null);
  const isToday = date === todayStr(now);

  useEffect(() => {
    const target = isToday ? msToDayMin(Date.now()) - 60 : 7 * 60;
    scrollRef.current?.scrollTo({ top: minToPx(Math.max(0, target)) });
  }, [date, isToday]);

  function minuteAt(clientY: number) {
    const rect = bodyRef.current!.getBoundingClientRect();
    return clampDay(pxToMin(clientY - rect.top));
  }

  const target: AvailTarget =
    scope === 'date' ? { kind: 'date', date } : { kind: 'weekly', weekday: fromDateStr(date).getDay() };
  // 当天显示的时段都来自同一种设置（指定日期或每周模板），合并后显示
  const shownKind = slots[0]?.kind ?? scope;
  const ranges = mergeRanges(slots);

  // 编辑可用时间：在空白处按下拖动框选
  function down(e: ReactPointerEvent) {
    if (!editMode) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const m = snap(minuteAt(e.clientY), 15);
    setDraft({ from: m, to: m });
  }
  function move(e: ReactPointerEvent) {
    if (draft) setDraft({ ...draft, to: snap(minuteAt(e.clientY), 15) });
  }
  async function up() {
    const d = draft;
    setDraft(null);
    if (!d) return;
    const start = Math.min(d.from, d.to);
    const end = Math.max(d.from, d.to);
    if (end - start < 15) return;
    await editAvailability(target, (cur) => [...cur, { start_min: start, end_min: end }]);
  }

  /** 每周模板下不能改“仅此日期”的设置 */
  function editable(): boolean {
    if (scope === 'weekly' && shownKind === 'date') {
      toast('这是“仅此日期”的设置，请切换到“仅此日期”后修改', 'error');
      return false;
    }
    return true;
  }

  const same = (a: MinRange, b: MinRange) => a.start_min === b.start_min && a.end_min === b.end_min;

  async function removeSlot(r: MinRange) {
    if (!editable()) return;
    await editAvailability(target, (cur) => cur.filter((c) => !same(c, r)));
  }

  async function resizeSlot(from: MinRange, to: MinRange) {
    if (same(from, to) || !editable()) return;
    await editAvailability(target, (cur) => [...cur.filter((c) => !same(c, from)), to]);
  }

  return (
    <div ref={scrollRef} data-drop-area className="card relative h-[70vh] overflow-y-auto">
      <div
        ref={(el) => {
          setNodeRef(el);
          (bodyRef as { current: HTMLDivElement | null }).current = el;
        }}
        className={`relative ml-12 select-none ${isOver ? 'bg-indigo-50/60' : ''} ${editMode ? 'cursor-crosshair' : ''}`}
        style={{ height: minToPx(24 * 60) }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={() => setDraft(null)}
      >
        {Array.from({ length: 24 }, (_, h) => (
          <div key={h} className="absolute inset-x-0 border-t border-slate-100" style={{ top: h * HOUR }}>
            <span className="absolute -left-11 -top-2 w-10 text-right text-[11px] text-slate-400">{fmtMin(h * 60)}</span>
          </div>
        ))}

        {ranges.map((r) => (
          <Slot
            key={`${r.start_min}-${r.end_min}`}
            range={r}
            weekly={shownKind === 'weekly'}
            editMode={editMode}
            minuteAt={minuteAt}
            onResize={(to) => resizeSlot(r, to)}
            onRemove={() => removeSlot(r)}
          />
        ))}

        {draft && (
          <div
            className="absolute inset-x-0 border-2 border-dashed border-emerald-500 bg-emerald-100/60"
            style={{ top: minToPx(Math.min(draft.from, draft.to)), height: minToPx(Math.abs(draft.to - draft.from)) }}
          />
        )}

        {tasks.map((t) => (
          <Block key={t.id} task={t} date={date} now={now} windows={windows} busy={busy} disabled={editMode} onOpen={() => onOpen(t)} />
        ))}

        {ghost && (
          <div
            className={`pointer-events-none absolute left-1 right-24 z-10 overflow-hidden rounded-md border-2 border-dashed px-2 text-xs font-medium ${
              ghost.ok ? 'border-emerald-500 bg-emerald-200/80 text-emerald-800' : 'border-rose-400 bg-rose-100/90 text-rose-700'
            }`}
            style={{ top: minToPx(ghost.startMin), height: Math.max(minToPx(ghost.duration), 18) }}
          >
            {ghost.title} {fmtMin(ghost.startMin)}-{fmtMin(ghost.startMin + ghost.duration)}
          </div>
        )}

        {isToday && (
          <div className="pointer-events-none absolute -left-2 right-0 z-20 h-0.5 bg-rose-500" style={{ top: minToPx(msToDayMin(now)) }}>
            <span className="absolute -top-2 left-0 h-2 w-2 translate-y-[3px] rounded-full bg-rose-500" />
          </div>
        )}
      </div>
    </div>
  );
}

/** 一段可用时间；编辑时可拖动上下边缘调整开始和结束时间 */
function Slot({
  range,
  weekly,
  editMode,
  minuteAt,
  onResize,
  onRemove,
}: {
  range: MinRange;
  weekly: boolean;
  editMode: boolean;
  minuteAt: (clientY: number) => number;
  onResize: (to: MinRange) => void;
  onRemove: () => void;
}) {
  const [edge, setEdge] = useState<'start' | 'end' | null>(null);
  const [preview, setPreview] = useState<MinRange | null>(null);
  const r = preview ?? range;

  function down(which: 'start' | 'end') {
    return (e: ReactPointerEvent) => {
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      setEdge(which);
      setPreview(range);
    };
  }
  function move(e: ReactPointerEvent) {
    if (!edge) return;
    const m = snap(minuteAt(e.clientY), 15);
    setPreview(
      edge === 'start'
        ? { start_min: Math.min(m, range.end_min - 15), end_min: range.end_min }
        : { start_min: range.start_min, end_min: Math.max(m, range.start_min + 15) },
    );
  }
  function up(e: ReactPointerEvent) {
    e.stopPropagation();
    const p = preview;
    setEdge(null);
    setPreview(null);
    if (p) onResize(p);
  }
  function cancel() {
    setEdge(null);
    setPreview(null);
  }

  const handle = (which: 'start' | 'end') => (
    <div
      className={`absolute inset-x-0 z-20 flex h-3 cursor-ns-resize touch-none justify-center ${
        which === 'start' ? '-top-1.5' : '-bottom-1.5'
      }`}
      title={which === 'start' ? '拖动调整开始时间' : '拖动调整结束时间'}
      onPointerDown={down(which)}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={cancel}
    >
      <span className="mt-[5px] h-[3px] w-10 rounded-full bg-emerald-500" />
    </div>
  );

  return (
    <div
      className={`absolute inset-x-0 border-y bg-emerald-50 ${edge ? 'z-20 border-emerald-500' : 'border-emerald-200'}`}
      style={{ top: minToPx(r.start_min), height: minToPx(r.end_min - r.start_min) }}
    >
      <span className="absolute right-1 top-0.5 text-[10px] text-emerald-700">
        可用 {fmtMin(r.start_min)}-{fmtMin(r.end_min)}
        {weekly ? '（每周）' : ''}
      </span>
      {editMode && (
        <>
          {handle('start')}
          {handle('end')}
          {!edge && (
            <button
              className="absolute bottom-2 right-1 z-20 rounded bg-white px-1 text-[10px] text-rose-600 shadow"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={onRemove}
            >
              删除
            </button>
          )}
        </>
      )}
    </div>
  );
}

function Block({
  task,
  date,
  now,
  windows,
  busy,
  disabled,
  onOpen,
}: {
  task: ShortTask;
  date: string;
  now: number;
  windows: Interval[];
  busy: { id: string; start: number; end: number }[];
  disabled: boolean;
  onOpen: () => void;
}) {
  const [drag, setDrag] = useState<{ y0: number; d: number } | null>(null);
  const startMin = msToDayMin(task.start_at!) + (drag?.d ?? 0);

  function down(e: ReactPointerEvent) {
    if (disabled) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ y0: e.clientY, d: 0 });
  }
  function move(e: ReactPointerEvent) {
    if (drag) setDrag({ ...drag, d: snap(pxToMin(e.clientY - drag.y0), 5) });
  }
  async function up(e: ReactPointerEvent) {
    const d = drag;
    setDrag(null);
    if (!d) return;
    if (Math.abs(e.clientY - d.y0) < 4) {
      onOpen();
      return;
    }
    if (d.d === 0) return;
    const start = dateMinToMs(date, msToDayMin(task.start_at!) + d.d);
    const end = start + task.duration_min * MIN_MS;
    if (start < now) {
      toast('开始时间不能早于现在', 'error');
      return;
    }
    if (!canPlace({ start, end }, windows, busy.filter((b) => b.id !== task.id))) {
      toast('必须放在可用时间内，且不能与其他任务重叠', 'error');
      return;
    }
    await updateShortTask(task.id, { start_at: start, end_at: end });
  }

  return (
    <div
      className="absolute left-1 right-24 z-10 cursor-grab touch-none overflow-hidden rounded-md border-l-4 border-indigo-700 bg-indigo-500/90 px-2 text-xs text-white shadow"
      style={{ top: minToPx(startMin), height: Math.max(minToPx(task.duration_min), 16) }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={() => setDrag(null)}
    >
      <span className="font-medium">{task.title}</span>{' '}
      <span className="opacity-80">
        {fmtMin(startMin)}-{fmtMin(startMin + task.duration_min)}
      </span>
    </div>
  );
}
