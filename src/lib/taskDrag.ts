import {
  closestCenter,
  KeyboardSensor,
  MouseSensor,
  pointerWithin,
  rectIntersection,
  TouchSensor,
  useSensor,
  useSensors,
  type CollisionDetection,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useCallback, useRef, type RefObject } from 'react';

/** 电脑上按住移动即可拖动；手机上长按才开始拖动，这样滑动卡片仍能滚动页面 */
export function useTaskSensors() {
  return useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
}

/**
 * 判定落点并记录指针位置（屏幕坐标）。
 * 不用 DragEndEvent.delta：指针进入可滚动区域后，它会把该区域的滚动距离也算进去，落点就错了。
 * body 比可见区域大，所以用带 data-drop-area 的外层容器判断指针是否真的在目标区内。
 */
export function useDropPointer(dropId: string, bodyRef: RefObject<HTMLElement>) {
  const pointer = useRef<{ x: number; y: number } | null>(null);

  const collisionDetection = useCallback<CollisionDetection>(
    (args) => {
      const p = args.pointerCoordinates;
      pointer.current = p;
      if (!p) return rectIntersection(args); // 键盘拖动没有指针

      const area = bodyRef.current?.closest('[data-drop-area]')?.getBoundingClientRect();
      if (area && p.x >= area.left && p.x <= area.right && p.y >= area.top && p.y <= area.bottom) {
        return pointerWithin(args).filter((c) => c.id === dropId);
      }
      // 不在目标区：只和同一层的任务比较，用于调整顺序
      const container = args.active.data.current?.sortable?.containerId;
      return closestCenter({
        ...args,
        droppableContainers: args.droppableContainers.filter(
          (c) => c.data.current?.sortable?.containerId === container,
        ),
      });
    },
    [dropId, bodyRef],
  );

  return { pointer, collisionDetection };
}
