import { useDroppable } from '@dnd-kit/core';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { toast } from '../../components/toast';
import { addAvailability, removeAvailability, updateShortTask } from '../../db/repo';
import type { Availability, ShortTask } from '../../db/types';
import { dateMinToMs, fmtMin, fromDateStr, MIN_MS, msToDayMin, todayStr } from '../../lib/dates';
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
    await materializeDate();
    await addAvailability(
      scope === 'date'
        ? { kind: 'date', date, weekday: null, start_min: start, end_min: end }
        : { kind: 'weekly', weekday: fromDateStr(date).getDay(), date: null, start_min: start, end_min: end },
    );
  }

  /** 改“仅此日期”时，先把当天沿用的每周模板复制成指定日期的设置 */
  async function materializeDate(except?: string) {
    if (scope !== 'date' || slots.some((s) => s.kind === 'date')) return;
    for (const s of slots) {
      if (s.id === except) continue;
      await addAvailability({ kind: 'date', date, weekday: null, start_min: s.start_min, end_min: s.end_min });
    }
    // 空标记：保证当天确实覆盖每周模板
    await addAvailability({ kind: 'date', date, weekday: null, start_min: 0, end_min: 0 });
  }

  async function removeSlot(s: Availability) {
    if (scope === 'date' && s.kind === 'weekly') {
      await materializeDate(s.id);
      return;
    }
    if (scope === 'weekly' && s.kind === 'date') {
      toast('这是“仅此日期”的设置，请切换到“仅此日期”后删除', 'error');
      return;
    }
    await removeAvailability(s.id);
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

        {slots
          .filter((s) => s.end_min > s.start_min)
          .map((s) => (
            <div
              key={s.id}
              className="absolute inset-x-0 border-y border-emerald-200 bg-emerald-50"
              style={{ top: minToPx(s.start_min), height: minToPx(s.end_min - s.start_min) }}
            >
              <span className="absolute right-1 top-0.5 text-[10px] text-emerald-700">
                可用 {fmtMin(s.start_min)}-{fmtMin(s.end_min)}
                {s.kind === 'weekly' ? '（每周）' : ''}
              </span>
              {editMode && (
                <button
                  className="absolute bottom-0.5 right-1 rounded bg-white px-1 text-[10px] text-rose-600 shadow"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => removeSlot(s)}
                >
                  删除
                </button>
              )}
            </div>
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
