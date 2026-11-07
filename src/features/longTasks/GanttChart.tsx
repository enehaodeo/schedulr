import { useDroppable } from '@dnd-kit/core';
import { startOfDay } from 'date-fns';
import { useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { toast } from '../../components/toast';
import { updateLongTask } from '../../db/repo';
import type { LongTask } from '../../db/types';
import { addDaysStr, DAY_MS, diffDays, fromDateStr, WEEKDAYS } from '../../lib/dates';
import { fitsDeadline, latestStart } from './gantt';

export const COL = 36;
const ROW = 44;
/** 顶部留白，放“现在”标签，避免盖住第一行任务名 */
const NOW_STRIP = 18;

export function GanttChart({
  tasks,
  viewStart,
  days,
  today,
  now,
  bodyRef,
  onOpen,
}: {
  tasks: LongTask[];
  viewStart: string;
  days: number;
  today: string;
  now: number;
  bodyRef: RefObject<HTMLDivElement>;
  onOpen: (t: LongTask) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: 'gantt' });
  const dates = Array.from({ length: days }, (_, i) => addDaysStr(viewStart, i));
  const todayIdx = diffDays(today, viewStart);
  const nowLeft = (todayIdx + (now - startOfDay(now).getTime()) / DAY_MS) * COL;
  const height = NOW_STRIP + Math.max(tasks.length + 1, 6) * ROW;

  return (
    <div className="card overflow-x-auto">
      <div style={{ width: days * COL }} className="relative select-none">
        <div className="sticky top-0 flex border-b border-slate-200 bg-white">
          {dates.map((d) => {
            const date = fromDateStr(d);
            const first = date.getDate() === 1 || d === viewStart;
            return (
              <div
                key={d}
                style={{ width: COL }}
                className={`shrink-0 py-1 text-center text-[10px] leading-tight ${
                  d === today ? 'bg-indigo-600 text-white' : 'text-slate-500'
                }`}
              >
                <div className="h-3 font-medium">{first ? `${date.getMonth() + 1}月` : ''}</div>
                <div className="text-xs">{date.getDate()}</div>
                <div>{WEEKDAYS[date.getDay()].slice(1)}</div>
              </div>
            );
          })}
        </div>
        <div
          ref={(el) => {
            setNodeRef(el);
            (bodyRef as { current: HTMLDivElement | null }).current = el;
          }}
          className={`relative ${isOver ? 'bg-indigo-50/60' : ''}`}
          style={{ height }}
        >
          {dates.map((d, i) => {
            const wd = fromDateStr(d).getDay();
            return (
              <div
                key={d}
                className={`absolute top-0 h-full border-r border-slate-100 ${
                  wd === 0 || wd === 6 ? 'bg-slate-50' : ''
                }`}
                style={{ left: i * COL, width: COL }}
              />
            );
          })}
          {tasks.map((t, row) => (
            <GanttRow key={t.id} task={t} row={row} viewStart={viewStart} onOpen={() => onOpen(t)} />
          ))}
          {tasks.length === 0 && (
            <div className="absolute inset-x-0 top-6 text-center text-sm text-slate-400">
              把左侧任务拖到这里，落点就是开始日期
            </div>
          )}
          {todayIdx >= 0 && todayIdx < days && (
            <div className="pointer-events-none absolute top-0 z-[5] h-full w-0.5 bg-rose-500" style={{ left: nowLeft }}>
              <span className="absolute left-px top-0.5 -translate-x-1/2 whitespace-nowrap rounded bg-rose-500 px-1 text-[10px] leading-[14px] text-white">
                现在
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function GanttRow({
  task,
  row,
  viewStart,
  onOpen,
}: {
  task: LongTask;
  row: number;
  viewStart: string;
  onOpen: () => void;
}) {
  const [drag, setDrag] = useState<{ mode: 'move' | 'resize'; x0: number; d: number } | null>(null);
  const start = diffDays(task.start_date!, viewStart) + (drag?.mode === 'move' ? drag.d : 0);
  const dur = Math.max(1, task.duration_days + (drag?.mode === 'resize' ? drag.d : 0));
  const ddl = diffDays(task.deadline, viewStart);
  const rowTop = NOW_STRIP + row * ROW;

  function down(e: ReactPointerEvent, mode: 'move' | 'resize') {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ mode, x0: e.clientX, d: 0 });
  }

  function move(e: ReactPointerEvent) {
    if (drag) setDrag({ ...drag, d: Math.round((e.clientX - drag.x0) / COL) });
  }

  async function up(e: ReactPointerEvent) {
    const d = drag;
    setDrag(null);
    if (!d) return;
    if (d.mode === 'move' && Math.abs(e.clientX - d.x0) < 4) {
      onOpen();
      return;
    }
    if (d.d === 0) return;
    const newStart = d.mode === 'move' ? addDaysStr(task.start_date!, d.d) : task.start_date!;
    const newDur = d.mode === 'resize' ? Math.max(1, task.duration_days + d.d) : task.duration_days;
    if (!fitsDeadline(newStart, newDur, task.deadline)) {
      toast(`结束时间不能晚于 deadline（最晚 ${latestStart(newDur, task.deadline)} 开始）`, 'error');
      return;
    }
    await updateLongTask(task.id, { start_date: newStart, duration_days: newDur });
  }

  return (
    <>
      <div
        className="absolute z-10 flex cursor-grab touch-none items-center gap-1 overflow-hidden rounded-md bg-indigo-500 px-2 text-xs text-white shadow-sm hover:bg-indigo-600"
        style={{ left: start * COL + 1, width: dur * COL - 2, top: rowTop + 6, height: ROW - 12 }}
        onPointerDown={(e) => down(e, 'move')}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={() => setDrag(null)}
        title={`${task.title}（${task.duration_days} 天，DDL ${task.deadline}）`}
      >
        <span className="truncate font-medium">{task.title}</span>
        <span
          className="absolute right-0 top-0 h-full w-2 cursor-ew-resize bg-indigo-800/30"
          onPointerDown={(e) => down(e, 'resize')}
        />
      </div>
      <div
        className="pointer-events-none absolute z-[15] flex items-end"
        style={{ left: (ddl + 1) * COL - 3, top: rowTop + 2, height: ROW - 4 }}
        title={`Deadline ${task.deadline}`}
      >
        <div className="h-full w-[3px] rounded bg-rose-500" />
        <span className="ml-0.5 rounded bg-rose-100 px-0.5 text-[9px] font-bold text-rose-600">DDL</span>
      </div>
    </>
  );
}
