// docs/01-整体架构.md §3.2 shared/rng.ts —— 可复现随机（以内容 id 为种子，保证同组合视觉稳定）。T04 落点。
// 纯函数实现：零依赖、零网络（八.2 红线）；种子确定 → 同 id 每次构建产生完全一致的序列
// （§3.3.2 SceneBuildContext.rng「以场景 id 为种子（同组合视觉可复现）」、§3.5.3 分帧构建的前提）。

/** FNV-1a 32 位字符串散列：把内容 id（'seacliff' / 'classC' / 'dusk' / 'rain'…）折叠成 PRNG 种子。 */
export function hashString(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32：确定性 32 位 PRNG，返回抽值函数，值域 [0,1)。 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 可复现随机源：构造时以内容 id（或任意数值）为种子。
 * 同一 id 的序列与调用次数一一对应——同组合视觉可复现；fork 出的子序列同样确定。
 */
export class Rng {
  private readonly draw: () => number;

  constructor(seed: string | number) {
    this.draw = mulberry32(typeof seed === 'string' ? hashString(seed) : seed >>> 0);
  }

  /** 下一个 [0,1) 随机数。 */
  next(): number {
    return this.draw();
  }

  /** [min,max) 浮点。 */
  range(min: number, max: number): number {
    return min + (max - min) * this.draw();
  }

  /** [min,max] 闭区间整数。 */
  int(min: number, max: number): number {
    if (max < min) throw new RangeError(`[rng] int(${min},${max}) 区间非法`);
    return min + Math.floor(this.draw() * (max - min + 1));
  }

  /** 均匀抽取一项；空数组抛错（尽早暴露）。 */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new RangeError('[rng] pick() 空数组');
    const picked = items[this.int(0, items.length - 1)];
    if (picked === undefined) throw new RangeError('[rng] pick() 越界');
    return picked;
  }

  /** ±1（随机朝向/符号）。 */
  sign(): 1 | -1 {
    return this.draw() < 0.5 ? -1 : 1;
  }

  /** 以 probability 概率为真（默认 0.5）。 */
  bool(probability = 0.5): boolean {
    return this.draw() < probability;
  }

  /** 派生独立子序列：同 id 下不同部件互不干扰，整体仍可复现。 */
  fork(tag: string): Rng {
    const derived = ((this.draw() * 0xffffffff) >>> 0) ^ hashString(tag);
    return new Rng(derived);
  }
}
