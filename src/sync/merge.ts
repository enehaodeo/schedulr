/**
 * 后写胜出：本地有未上传改动且更新时间更晚时保留本地，否则采用远端。
 */
export function shouldTakeRemote(
  local: { updated_at: number; dirty: 0 | 1 } | undefined,
  remote: { updated_at: number },
): boolean {
  if (!local) return true;
  if (!local.dirty) return true;
  return remote.updated_at >= local.updated_at;
}
