// docs/01-整体架构.md §3.2 shared/math.ts —— 常用数学小工具。
// T01 先落 clamp（兼作构建期 '@' alias 验证路径），后续任务按需扩充。
export function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}
