// docs/01-整体架构.md §3.2 systems/lightBreath.ts —— LightBreathSystem：灯光呼吸/闪烁/旋转统一执行器。T11 落点。
//
// 职责（docs/01 §3.4-4）：steady/breath/blink/rotate 四模式（docs/05 §7.1.4），叠加时间通道功率
//   （TimeLightSystem 下发，§4.3.2 六通道）与天气 glowBoost 光晕（§4.4.4）；M2 增补 params.pattern
//   'rev'|'sweep' 与功率下限 floor（§3.9）。
//
// 节奏纪律：一切相位取自 RhythmClock——breath 走 clock.breathPhase（只允许 1.5/3/6 三档，§7.1.1），
//   blink 走 clock.blinkPhase（lampIndex×0.4rad 交错），rotate 由 clock.elapsed 推导角度；
//   update(dt) 的 dt 不参与相位（严禁 setTimeout/setInterval，docs/05 §7.1.5 标题纪律）。
//
// 渲染管线（docs/05 §4.3.3-⑧）：所有灯 = emissive toon + additive halo sprite（真点光仅 2 个预算位，
//   归 render/lighting.ts，不在本系统）；halo opacity = 基础值 × 灯功率 × (1+0.5×glowBoost)、
//   scale = 基础值 × (1+0.8×glowBoost)（五-4「扩散光晕」）；op<0.02 自动隐藏（§4.3.3-⑤）。
import * as THREE from 'three';
import {
  BREATH_PERIODS,
  LAMP_PHASE_STEP_RAD,
  T_BASE_S,
  isBreathPeriod,
} from './clock';
import type { BreathPeriod, RhythmClock } from './clock';
import { clamp } from '../shared/math';
import type {
  LampHandle,
  LightBreathSystem as LightBreathSystemContract,
} from './handles';

/* ============================ 常量（定值出处逐条标注） ============================ */

/** 灯点功率通道（docs/05 §4.3.2 六语义通道中灯点消费的四个；场景只做解释映射）。 */
export type LampChannel = 'lamp' | 'ember' | 'shop' | 'interior';

/** op 隐藏阈值：op<0.02 → emissiveMat.visible/halo.visible=false（docs/05 §4.3.3-⑤）。 */
export const HIDE_OPACITY_THRESHOLD = 0.02;

/** halo scale 增益：scale ×(1+0.8×glow)（docs/05 五-4「halo scale ×(1+0.8×glow)」）。 */
export const GLOW_SCALE_GAIN = 0.8;

/** halo opacity 增益：op ×(1+0.5×glow)（docs/05 §4.3.3-⑧「op=0.35×lampPower×(1+0.5×glowBoost)」）。 */
export const GLOW_OPACITY_GAIN = 0.5;

/** rotate 缺省角速度 rad/s（灯塔顶灯 0.25 ≈25s/圈，docs/05 §7.1.4；警示红灯 0.4rev/s 由内容换算传入）。 */
export const DEFAULT_ROTATE_SPEED_RAD_S = 0.25;

/** sweep 缺省摆动周期 s（B2 清晨档 6s/55°，docs/05 §7.2.3-①；dusk 10s/45°、night 14s/40° 由场景 lightHooks 调制）。 */
export const DEFAULT_SWEEP_PERIOD_S = 6;

/** sweep 缺省摆幅 rad（B2 55°）。 */
export const DEFAULT_SWEEP_RAD = (55 * Math.PI) / 180;

/** breath 缺省深度（串灯 0.3 档，docs/05 §7.1.4；具体值按灯点注册总表逐灯给出）。 */
export const DEFAULT_BREATH_DEPTH = 0.3;

/** blink 缺省占空（天线指示灯 0.5，docs/05 §7.1.4）。 */
export const DEFAULT_BLINK_DUTY = 0.5;

/** blink 缺省周期 s（天线指示灯 1.2s；blink 周期不受呼吸三档限制，docs/05 §7.1.1）。 */
export const DEFAULT_BLINK_PERIOD_S = 1.2;

/** blink 缺省深度 1（方波触底全灭——campground 串灯用 depth 0.3「轻微不爆闪」覆盖，§7.2.1-①）。 */
export const DEFAULT_BLINK_DEPTH = 1;

const TWO_PI = Math.PI * 2;

/* ============================ 灯点记录 ============================ */

interface LampRecord {
  handle: LampHandle;
  /** 全局注册序号：blink 交错相位 = lampIndex × stagger（docs/05 §7.1.1「闪烁相位分配」） */
  index: number;
  channel: LampChannel;
  /** 通道功率倍率（服务区 shopPower×0.8 加油棚灯 / ×0.3 高速牌微光等场景映射，§7.1.4） */
  mul: number;
  /** 场景逐帧绝对覆盖（探照灯 lampPower 场景映射等；null=未覆盖） */
  override: number | null;
  /** 注册期快照：emissiveIntensity 基值（内容侧 authored） */
  baseEmissive: number;
  /** 注册期快照：halo 基础 scale / opacity */
  baseHaloScale: THREE.Vector3 | null;
  baseHaloOpacity: number;
  breathWarned: boolean;
  lastOutput: number;
  lastAngle: number;
}

/* ============================ LightBreathSystem ============================ */

/**
 * 灯光呼吸统一执行器（docs/01 §3.4-4 契约实现；Director 以类实例注入并接入帧序 ③）。
 * 场景/车型 lamps 经 register() 登记（§3.5.1）；TimeLightSystem 每过渡步经 setChannelPower 下发
 * 六通道值（§3.5.2-②），WeatherMaterialSystem/Director 经 setGlowBoost 下发天气光晕。
 */
export class LightBreathSystem implements LightBreathSystemContract {
  private readonly clock: RhythmClock;
  private readonly byLamp = new Map<LampHandle, LampRecord>();
  private readonly order: LampRecord[] = [];
  private readonly channels: Record<LampChannel, number> = { lamp: 0, ember: 0, shop: 0, interior: 0 };
  private glow = 0;
  private nextIndex = 0;

  constructor(clock: RhythmClock) {
    this.clock = clock;
  }

  /* —— 契约（§3.4：Director 把场景/车型 lamps 注册进来）—— */

  register(lamps: readonly LampHandle[]): void {
    for (const lamp of lamps) {
      if (this.byLamp.has(lamp)) continue; // 重复注册幂等
      const rec: LampRecord = {
        handle: lamp,
        index: this.nextIndex++,
        channel: 'lamp',
        mul: 1,
        override: null,
        baseEmissive: lamp.emissiveMat?.emissiveIntensity ?? 1,
        baseHaloScale: lamp.halo ? lamp.halo.scale.clone() : null,
        baseHaloOpacity: lamp.halo ? (lamp.halo.material as THREE.SpriteMaterial).opacity : 0,
        breathWarned: false,
        lastOutput: 0,
        lastAngle: 0,
      };
      this.byLamp.set(lamp, rec);
      this.order.push(rec);
    }
  }

  /** 反注册灯点（场景/车型卸载 §3.5.3；材质归属内容侧，此处不 dispose）。 */
  unregister(lamps: readonly LampHandle[]): void {
    for (const lamp of lamps) {
      const rec = this.byLamp.get(lamp);
      if (!rec) continue;
      this.byLamp.delete(lamp);
      const at = this.order.indexOf(rec);
      if (at >= 0) this.order.splice(at, 1);
    }
  }

  /* —— 通道与天气下发（TimeLightSystem/T12、WeatherMaterialSystem/T13、场景 lightHooks）—— */

  /** 灯点→通道绑定与倍率（缺省通道 'lamp'、倍率 1；如售货机 bindChannel(lamp,'shop') + floor=0.7）。 */
  bindChannel(lamp: LampHandle, channel: LampChannel, mul = 1): void {
    const rec = this.byLamp.get(lamp);
    if (!rec) {
      console.warn('[lightBreath] bindChannel：未注册的灯点（先 register）');
      return;
    }
    rec.channel = channel;
    rec.mul = mul;
  }

  /** 时间语义通道功率下发（docs/05 §4.3.2 六通道表；TimeLightSystem 每过渡步调用）。 */
  setChannelPower(channel: LampChannel, power: number): void {
    this.channels[channel] = Math.max(0, power);
  }

  /** 场景逐帧绝对功率覆盖（lampPower 场景映射；clearLampPower 恢复通道值）。 */
  setLampPower(lamp: LampHandle, power: number): void {
    const rec = this.byLamp.get(lamp);
    if (!rec) return;
    rec.override = Math.max(0, power);
  }

  clearLampPower(lamp: LampHandle): void {
    const rec = this.byLamp.get(lamp);
    if (!rec) return;
    rec.override = null;
  }

  /** 天气 glowBoost 下发（clear 0 / cloudy 0.15 / rain 0.35 / fog 0.80 / snow 0.25，docs/05 §4.4.1）。 */
  setGlowBoost(glow: number): void {
    this.glow = clamp(glow, 0, 1);
  }

  /* —— 查询（场景云台同步/测试用）—— */

  /** 当前输出功率（通道×倍率/覆盖 × floor × 模式波形；探照灯地面光斑等场景可读）。 */
  getLampOutput(lamp: LampHandle): number {
    return this.byLamp.get(lamp)?.lastOutput ?? 0;
  }

  /** rotate 模式当前角 rad（'rev' 连续旋转 / 'sweep' 摆动；场景云台/地面光斑沿轨迹同步用，§7.2.3-①）。 */
  getLampAngle(lamp: LampHandle): number {
    return this.byLamp.get(lamp)?.lastAngle ?? 0;
  }

  get lampCount(): number {
    return this.order.length;
  }

  /* —— 帧驱动（docs/01 §3.5.2-③）—— */

  update(_dt: number): void {
    const elapsed = this.clock.elapsed; // 唯一时间源（§3.4-1）
    for (const rec of this.order) {
      const { mode, params } = rec.handle;

      // ① 功率：场景覆盖 ?? 通道×倍率；M2 floor 下限（售货机 max(shopPower,0.7)，§7.1.4）
      let power = rec.override ?? this.channels[rec.channel] * rec.mul;
      if (params.floor !== undefined && power < params.floor) power = params.floor;

      // ② 模式波形（全部相位自 clock 推导）
      let wave = 1;
      if (mode === 'breath') {
        // sin 呼吸：亮度 = power × (1+depth×sin)（营地灯将熄：0.15×(1±0.55)≈0.07~0.23，§4.3.3-①）
        const period = this.resolveBreathPeriod(rec, params.period);
        const phase = this.clock.breathPhase(period);
        wave = 1 + clamp(params.depth ?? DEFAULT_BREATH_DEPTH, 0, 1) * Math.sin(phase * TWO_PI);
      } else if (mode === 'blink') {
        // 占空方波 + 交错相位（串灯 blink 3s depth 0.3「轻微不爆闪」，§7.2.1-①）
        const period = params.period !== undefined && params.period > 0 ? params.period : DEFAULT_BLINK_PERIOD_S;
        const duty = clamp(params.duty ?? DEFAULT_BLINK_DUTY, 0.01, 1);
        const stagger = params.stagger ?? LAMP_PHASE_STEP_RAD;
        // blinkPhase 固定按 LAMP_PHASE_STEP_RAD 交错；stagger≠0.4rad 时以差值校正（仍全量自 clock 推导）
        const raw = this.clock.blinkPhase(rec.index, period) + rec.index * (LAMP_PHASE_STEP_RAD - stagger);
        const phase01 = (((raw % TWO_PI) + TWO_PI) % TWO_PI) / TWO_PI;
        wave = phase01 < duty ? 1 : 1 - clamp(params.depth ?? DEFAULT_BLINK_DEPTH, 0, 1);
      } else if (mode === 'rotate') {
        // 亮度恒定，旋转角另算（灯塔 0.25rad/s ≈25s/圈★；红灯 'rev' 双叶；探照灯 'sweep' B2）
        const pattern = params.pattern ?? 'rev';
        if (pattern === 'sweep') {
          const period = params.period !== undefined && params.period > 0 ? params.period : DEFAULT_SWEEP_PERIOD_S;
          const sweepRad = params.sweepRad ?? DEFAULT_SWEEP_RAD;
          rec.lastAngle = sweepRad * Math.sin((elapsed * TWO_PI) / period);
        } else {
          const speed = params.speed ?? DEFAULT_ROTATE_SPEED_RAD_S;
          rec.lastAngle = speed * elapsed;
        }
        wave = 1;
      }
      const out = power * wave;
      rec.lastOutput = out;

      // ③ emissive toon：emissiveIntensity = 基值 × 输出；op<0.02 → visible=false（§4.3.3-⑤）
      const mat = rec.handle.emissiveMat;
      if (mat) {
        mat.emissiveIntensity = rec.baseEmissive * out;
        mat.visible = out >= HIDE_OPACITY_THRESHOLD;
      }

      // ④ additive halo sprite：op = 基础×输出×(1+0.5×glow)、scale = 基础×(1+0.8×glow)（§4.3.3-⑧/五-4）
      const halo = rec.handle.halo;
      if (halo) {
        const haloMat = halo.material as THREE.SpriteMaterial;
        const opacity = rec.baseHaloOpacity * out * (1 + GLOW_OPACITY_GAIN * this.glow);
        haloMat.opacity = opacity;
        halo.visible = opacity >= HIDE_OPACITY_THRESHOLD;
        halo.scale.copy(rec.baseHaloScale!).multiplyScalar(1 + GLOW_SCALE_GAIN * this.glow);
        if (mode === 'rotate') haloMat.rotation = rec.lastAngle;
      }
    }
  }

  /* —— 内部 —— */

  /** breath 周期收敛到三档 1.5/3/6（RhythmClock.BREATH_PERIODS 纪律，§7.1.1；blink 不受限）。 */
  private resolveBreathPeriod(rec: LampRecord, period: number | undefined): BreathPeriod {
    if (period === undefined) return T_BASE_S;
    if (isBreathPeriod(period)) return period;
    if (!rec.breathWarned) {
      rec.breathWarned = true;
      console.warn(`[lightBreath] breath 周期 ${period}s 不在三档（1.5/3/6），已收敛到最近档`);
    }
    let best: BreathPeriod = BREATH_PERIODS[0]!;
    for (const candidate of BREATH_PERIODS) {
      if (Math.abs(candidate - period) < Math.abs(best - period)) best = candidate;
    }
    return best;
  }

  /** 系统收尾（Director 整体卸载时调用；不 dispose 内容侧材质）。 */
  dispose(): void {
    this.byLamp.clear();
    this.order.length = 0;
    this.nextIndex = 0;
    this.glow = 0;
    this.channels.lamp = 0;
    this.channels.ember = 0;
    this.channels.shop = 0;
    this.channels.interior = 0;
  }
}
