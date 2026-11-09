import { useCallback, useState } from 'react';

type Patches<T> = Record<string, Partial<T>>;

/** 写入完成后临时值再保留这么久，足够 useLiveQuery 返回新数据；写入失败时也会在此后恢复 */
const HOLD_MS = 1000;

/**
 * 松手时先显示结果，再写数据库。
 * 写入 IndexedDB 后 useLiveQuery 要过一会儿才返回新数据，而拖动的位移在松手时就清除了，
 * 不这样做的话任务会先跳回原位，再出现在新位置。
 */
export function useOptimisticRows<T extends { id: string }>(rows: T[]) {
  const [patches, setPatches] = useState<Patches<T> | null>(null);

  const applyOptimistic = useCallback(async (next: Patches<T>, write: () => Promise<unknown>) => {
    setPatches(next);
    try {
      await write();
    } finally {
      setTimeout(() => setPatches((cur) => (cur === next ? null : cur)), HOLD_MS);
    }
  }, []);

  const merged = patches ? rows.map((r) => (patches[r.id] ? { ...r, ...patches[r.id] } : r)) : rows;
  return [merged, applyOptimistic] as const;
}

/** 与 repo.reorder 写入的 sort_order 一致 */
export function orderPatches(orderedIds: string[]): Record<string, { sort_order: number }> {
  return Object.fromEntries(orderedIds.map((id, i) => [id, { sort_order: i + 1 }]));
}
