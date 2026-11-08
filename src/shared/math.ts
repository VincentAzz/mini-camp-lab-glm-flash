// docs/01-整体架构.md §3.2 shared/math.ts —— 常用数学小工具。
// T01 先落 clamp（兼作构建期 '@' alias 验证路径）；T03 增补帧率无关指数阻尼 damp（docs/06 §6.7）。

/** 区间夹取 */
export function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}

/**
 * 帧率无关的指数趋近：当前值向 target 以速率 lambda（1/s）衰减，等效每帧系数 k=1−e^(−λ·dt)。
 * docs/06 §6.7 相机阻尼（λ=9：拖拽跟手、松手 ~0.35s 缓停，无过冲无回弹）；后续公共系统可复用。
 */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return target + (current - target) * Math.exp(-lambda * dt);
}
