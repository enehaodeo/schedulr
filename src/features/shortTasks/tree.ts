import type { ShortTask } from '../../db/types';

const bySort = (a: ShortTask, b: ShortTask) => a.sort_order - b.sort_order;

export function childrenOf(all: ShortTask[], parentId: string): ShortTask[] {
  return all.filter((t) => t.parent_id === parentId && t.status !== 'trash' && !t.deleted).sort(bySort);
}

/** 任务池顶层（父任务在全部子任务完成前一直留在池中） */
export function poolTops(all: ShortTask[]): ShortTask[] {
  return all.filter((t) => t.parent_id === null && t.status === 'pool' && !t.deleted).sort(bySort);
}

/** 按任务池显示顺序展开得到的待排叶子任务，决定自动排程的优先级 */
export function leafQueue(all: ShortTask[]): ShortTask[] {
  const out: ShortTask[] = [];
  for (const top of poolTops(all)) {
    const kids = childrenOf(all, top.id);
    if (kids.length) out.push(...kids.filter((k) => k.status === 'pool'));
    else out.push(top);
  }
  return out;
}

export function totalDuration(all: ShortTask[], task: ShortTask): number {
  const kids = childrenOf(all, task.id);
  return kids.length ? kids.reduce((s, k) => s + k.duration_min, 0) : task.duration_min;
}
