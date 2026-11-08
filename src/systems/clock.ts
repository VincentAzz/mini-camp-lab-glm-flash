// docs/01-整体架构.md §3.2/§3.4-1 systems/clock.ts —— RhythmClock：全局节奏源。T08 落点。
// docs/05 §7.1.1 参数表（逐字落地）：
//   呼吸基准周期 T_base = 3.0s；灯光呼吸只允许 T_base 的 ÷2（1.5s）/÷1（3s）/×2（6s）三档，全场景灯效同族同步；
//   闪烁相位分配 = lampIndex × 0.4 rad（串灯等成组灯交错相位）；
//   gust(t) = 0.3 + 1.4×(0.5+0.5×simplex1(t/6.5)) + 0.3×simplex1(t/17)，范围 ≈0.3~1.7（WindSystem 幅度包络）；
//   粒子节奏 = 各 EmitterSpec.rate，发射相位 jitter ±20%（防机械感）。
// 纪律：全项目 elapsed 单一发源——Director 每帧 update(dt) 驱动（§3.5.2 ①），Wind/Breath/Particles 取值；
// 严禁 setTimeout/setInterval：一切相位由 elapsed 推导（docs/05 §7.1.5「禁 setTimeout」同类纪律）。
import { hashString, mulberry32 } from '@/shared/rng';

/** 呼吸基准周期 T_base（docs/05 §7.1.1 定值 3.0s）。 */
export const T_BASE_S = 3.0;

/** 呼吸档位类型（1.5s / 3s / 6s）。 */
export type BreathPeriod = 1.5 | 3 | 6;

/** 灯光呼吸只允许的三档周期 = T_base ÷2（1.5）/ ÷1（3）/ ×2（6）（docs/05 §7.1.1；blink 周期不受此限，见 phase01）。 */
export const BREATH_PERIODS: readonly BreathPeriod[] = [1.5, 3, 6];

/** 闪烁相位步长：串灯等成组灯按 lampIndex × 0.4rad 交错（docs/05 §7.1.1）。 */
export const LAMP_PHASE_STEP_RAD = 0.4;

/** 粒子发射相位抖动幅度 ±20%（docs/05 §7.1.1「防机械感」）。 */
export const PARTICLE_JITTER = 0.2;

/** 运行期护栏：呼吸档只允许三档（blink 等任意周期请走 phase01）。 */
export function isBreathPeriod(value: number): value is BreathPeriod {
  return (BREATH_PERIODS as readonly number[]).includes(value);
}

/* —— 一维 simplex（单纯形/梯度）噪声：固定置换表 + quintic fade，输出约 [-1,1]，进程内确定可复现 —— */

// quintic fade + ±1 梯度的 1D 梯度噪声理论极值 = 0.5（反号梯度对在格点中点取得），归一到 [-1,1]。
const NOISE_NORM = 2.0;

const PERM: readonly number[] = (() => {
  const next = mulberry32(0x5eed1917); // 固定种子：gust 序列跨会话一致
  const table: number[] = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    const tmp = table[i]!;
    table[i] = table[j]!;
    table[j] = tmp;
  }
  return table;
})();

function grad1(i: number): number {
  return (PERM[((i % 256) + 256) & 0xff]! & 1) === 0 ? 1 : -1;
}

/** 一维 simplex 噪声（≈[-1,1]；纯函数）。gust 的噪声源（docs/05 §7.1.1 simplex1）。 */
export function simplex1(x: number): number {
  const i = Math.floor(x);
  const f0 = x - i;
  const f1 = f0 - 1;
  const u = f0 * f0 * f0 * (f0 * (f0 * 6 - 15) + 10); // quintic fade
  const n0 = grad1(i) * f0;
  const n1 = grad1(i + 1) * f1;
  return (n0 + u * (n1 - n0)) * NOISE_NORM;
}

/** gust(t) 包络（docs/05 §7.1.1「范围 ≈0.3~1.7」）：公式双噪声极端同相对可能瞬时越界，按表定包络钳制。 */
const GUST_MIN = 0.3;
const GUST_MAX = 1.7;

/** gust(t)：连续阵风包络（docs/05 §7.1.1 公式逐字；范围钳制在 ≈0.3~1.7）。「风事件」叠加其上。 */
export function gustAt(t: number): number {
  const g = 0.3 + 1.4 * (0.5 + 0.5 * simplex1(t / 6.5)) + 0.3 * simplex1(t / 17);
  return g < GUST_MIN ? GUST_MIN : g > GUST_MAX ? GUST_MAX : g;
}

/**
 * RhythmClock：全局节奏源（§3.4-1「Director 每帧驱动；Wind/Breath/Particles 取值」）。
 * elapsed 是全项目唯一时间源（秒）：本类不读全局时钟、不起任何定时器；呼吸相位、闪烁相位、
 * 阵风、粒子抖动全部由 elapsed 推导——同帧序下结果确定，回放/暂停语义自然成立。
 */
export class RhythmClock {
  private elapsedS = 0;

  /** 每帧步进（§3.5.2 ①）：Engine 传帧步长（秒，如 THREE.Clock.getDelta()）。非正数忽略：节奏源只前进。 */
  update(dt: number): void {
    if (dt > 0) this.elapsedS += dt;
  }

  /** 全局唯一时间源（秒，自启动累计）。 */
  get elapsed(): number {
    return this.elapsedS;
  }

  /** 通用相位 0..1（elapsed/period 的小数部分；blink 1.2s/2.4s 等任意周期用）。 */
  phase01(periodSeconds: number): number {
    if (!(periodSeconds > 0)) throw new RangeError(`[clock] 周期必须为正：${periodSeconds}`);
    return (this.elapsedS / periodSeconds) % 1;
  }

  /** 呼吸相位 0..1（类型层锁定三档 1.5/3/6；运行期外来值用 isBreathPeriod 守卫）。 */
  breathPhase(period: BreathPeriod): number {
    return this.phase01(period);
  }

  /** 闪烁相位（弧度）= 相位×2π − lampIndex×0.4rad 交错；LightBreathSystem 直接取 sin/方波。 */
  blinkPhase(lampIndex: number, periodSeconds: number): number {
    return this.phase01(periodSeconds) * Math.PI * 2 - lampIndex * LAMP_PHASE_STEP_RAD;
  }

  /** 当前阵风系数 gust(elapsed)（≈0.3~1.7 连续）。WindSystem 幅度包络的单一取值口。 */
  gust(): number {
    return gustAt(this.elapsedS);
  }

  /**
   * 粒子发射相位抖动系数：[1−amount, 1+amount]（默认 ±20%），按发射器序号确定不变——
   * 各发射器相位错开，防全场机械同步（docs/05 §7.1.1「发射相位 jitter ±20%」）。
   */
  particleJitter(emitterIndex: number, amount: number = PARTICLE_JITTER): number {
    const r = mulberry32(hashString(`emitter-jitter:${emitterIndex}`))();
    return 1 + (r * 2 - 1) * amount;
  }
}
