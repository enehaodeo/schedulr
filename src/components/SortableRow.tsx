import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { ReactNode } from 'react';

/** 可排序、可拖出的列表项；只有左侧手柄触发拖动，保证手机上列表仍可滚动 */
export function SortableRow({
  id,
  data,
  disabled,
  children,
}: {
  id: string;
  data?: Record<string, unknown>;
  disabled?: boolean;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    data,
    disabled,
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-stretch gap-1 ${isDragging ? 'opacity-40' : ''}`}
    >
      <button
        {...attributes}
        {...listeners}
        disabled={disabled}
        className="w-5 shrink-0 cursor-grab touch-none rounded text-slate-400 hover:bg-slate-100 disabled:cursor-default disabled:opacity-30"
        aria-label="拖动"
      >
        ⋮⋮
      </button>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
