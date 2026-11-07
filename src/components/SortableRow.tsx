import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useCallback, type ReactNode } from 'react';

/** 可排序、可拖出的列表项；整张卡片都能拖动（手机上长按，见 useTaskSensors） */
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
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id,
    data,
    disabled,
    attributes: { role: 'group' },
  });
  // 键盘拖动只在卡片本身获得焦点时触发，卡片里的按钮不受影响
  const ref = useCallback(
    (el: HTMLDivElement | null) => {
      setNodeRef(el);
      setActivatorNodeRef(el);
    },
    [setNodeRef, setActivatorNodeRef],
  );
  return (
    <div
      ref={ref}
      {...attributes}
      {...listeners}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`touch-manipulation select-none rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
        disabled ? '' : 'cursor-grab'
      } ${isDragging ? 'opacity-40' : ''}`}
    >
      {children}
    </div>
  );
}
