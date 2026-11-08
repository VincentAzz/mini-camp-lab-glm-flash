// docs/01-整体架构.md §3.2 core/transition.ts —— TransitionController：四维切换过渡（T17 落点）。
//
// 时长定值集中本文件（docs/06 §6.6「时间线总表（D5 定值，常量集中 core/transition.ts）」逐字）：
//   时间 1500ms（参数插值，无重装配）/ 天气 1500ms / 场景 600ms FadeSwap / 车型 600ms FadeSwap /
//   离散装饰状态：blend≥0.5 中点一次性切换 + 0.2s 透明度短淡入。
//
// 分工（docs/06 §6.8「TransitionController 只按维度路由四条路径（禁止改 DOM）」+ docs/05 §4.3.5 示意）：
//   - 本文件持有「插值状态机 + 数学」：时间维 retarget 插值（颜色线性空间/方向 slerp 兜底/skyExtra
//     离散中点翻转）、天气 lightMod 插值、FadeSwap 时间线（材质克隆 FadeSet + 分帧 ≤3 构建委托）；
//   - 插值结果的「系统下发」由 Director 以 host 回调实现（TimeLightSystem/WeatherMaterialSystem/
//     WindSystem/ParticleSystem 等，§3.5.3 四条路径）；
//   - 风力与天气材质七分量/粒子交叉淡化各自有系统内平滑（wind.ts τ=0.6s 指数趋近 /
//     weatherMaterial.setWeather 1500ms smoothstep / particles.setWeatherSet 0.5s 交叉），
//     本文件不二次插值这三者——只插值尚无系统内平滑的 weather.lightMod 三标量。
//
// 纪律：相机全程不触碰（docs/06 §6.6「相机连续性」——本文件不 import controls，无任何相机 API）；
//   无 setTimeout/setInterval，全部相位由 update(dt) 帧步长推进。
import * as THREE from 'three';
import { clamp } from '@/shared/math';
import type { GlobalLightParams, RGB, SkyExtra } from '@/systems/handles';
import type { TimeChannels } from '@/systems/timeLight';
import type { TimePreset } from '@/content/times/types';
import type { WeatherPreset } from '@/content/weathers/types';

// ---------------------------------------------------------------------------
// 时长定值（docs/06 §6.6 总表；D5）
// ---------------------------------------------------------------------------

/** 时间切换总时长（四-5「1~2 秒」取定 1500ms）。 */
export const TIME_TRANSITION_MS = 1500;
/** 天气切换总时长（五-6 与时间同标准）。 */
export const WEATHER_TRANSITION_MS = 1500;
/** 场景/车型 FadeSwap 总时长（六.5-①「短暂淡入淡出」）。 */
export const FADE_SWAP_MS = 600;
/** FadeSwap 淡出段（前半）：t=0–300 旧组 opacity 1→0。 */
export const FADE_OUT_MS = 300;
/** 分帧构建起始（t=150 起分帧构建新场景，docs/06 §6.6「t=150 起分帧构建」）。 */
export const FADE_OUT_BUILD_DELAY_MS = 150;
/** 分帧构建上限帧数（§3.7 #10「分帧构建 ≤3 帧，避免掉帧尖峰」）。 */
export const FADESWAP_MAX_BUILD_FRAMES = 3;
/** 新组淡入起始缩放（「换展品」落定感，docs/06 §6.6 scale 0.96→1.0）。 */
export const FADESWAP_IN_SCALE_FROM = 0.96;
/** 新组淡入起始抬升（y +0.35→0，同上）。 */
export const FADESWAP_IN_LIFT_Y = 0.35;
/** 离散量切换中点（blend≥0.5 一次性翻转，docs/01 §3.5.3）。 */
export const DISCRETE_SWITCH_BLEND = 0.5;
/** 离散量切换后新增物的透明度短淡入时长（0.2s）。 */
export const DISCRETE_FADE_IN_MS = 200;

// ---------------------------------------------------------------------------
// 缓动与插值基元
// ---------------------------------------------------------------------------

/** 统一缓动 smoothstep t·t·(3−2t)（docs/06 §6.6；时间/天气过渡与离散淡入共用）。 */
export function smoothstep01(t: number): number {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

/** FadeSwap 淡出缓动 easeInQuad（docs/06 §6.6「出/入分别 easeInQuad/easeOutCubic」）。 */
export function easeInQuad(t: number): number {
  const x = clamp(t, 0, 1);
  return x * x;
}

/** FadeSwap 淡入缓动 easeOutCubic（同上）。 */
export function easeOutCubic(t: number): number {
  const x = clamp(t, 0, 1);
  return 1 - (1 - x) ** 3;
}

/** 线性插值。 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/* —— 颜色：'#rrggbb'（sRGB）入，线性空间插值，'#rrggbb' 出（docs/05 §4.3.5「颜色在线性空间」）—— */

const colorA = new THREE.Color();
const colorB = new THREE.Color();

/**
 * 颜色插值（线性工作空间）：Color('#hex') 经 ColorManagement 完成 sRGB→线性（docs/05 §4.3.5-④
 * 同口径），lerp 在线性空间进行后 getHexString()（默认 SRGB 输出）转回 '#rrggbb'。
 */
export function lerpColorHex(from: RGB, to: RGB, t: number): RGB {
  colorA.set(from);
  colorB.set(to);
  colorA.lerp(colorB, clamp(t, 0, 1));
  return `#${colorA.getHexString()}`;
}

/* —— 方向：向量 lerp；夹角 ≥120° 四元数 slerp 兜底（docs/05 §4.3.5 逐字）—— */

const dirFrom = new THREE.Vector3();
const dirTo = new THREE.Vector3();
const quatStep = new THREE.Quaternion();
const quatFrom = new THREE.Quaternion();
const QUAT_FALLBACK_ANGLE_RAD = (120 * Math.PI) / 180;

export function lerpDirection(
  from: THREE.Vector3,
  to: THREE.Vector3,
  t: number,
  target: THREE.Vector3 = new THREE.Vector3(),
): THREE.Vector3 {
  dirFrom.copy(from).normalize();
  dirTo.copy(to).normalize();
  const angle = dirFrom.angleTo(dirTo);
  if (angle >= QUAT_FALLBACK_ANGLE_RAD) {
    quatFrom.identity();
    quatStep.setFromUnitVectors(dirFrom, dirTo);
    quatFrom.slerp(quatStep, clamp(t, 0, 1));
    return target.copy(dirFrom).applyQuaternion(quatFrom).normalize();
  }
  return target.copy(dirFrom).lerp(dirTo, clamp(t, 0, 1)).normalize();
}

// ---------------------------------------------------------------------------
// 结构插值（GlobalLightParams / TimeChannels / weather.lightMod）
// ---------------------------------------------------------------------------

/**
 * GlobalLightParams 逐字段插值（docs/05 §4.3.5：颜色线性空间、方向向量 lerp+slerp 兜底、
 * 阴影只 lerp radius/bias；skyExtra 为离散量——由调用方经 MidpointGate 决定当前值后传入）。
 * 每次返回新对象（lightDir 新 Vector3），不就地改写预设引用（GlobalLightParams 契约纪律）。
 */
export function lerpGlobalLightParams(
  from: GlobalLightParams,
  to: GlobalLightParams,
  t: number,
  skyExtra: SkyExtra,
): GlobalLightParams {
  return {
    lightDir: lerpDirection(from.lightDir, to.lightDir, t),
    lightColor: lerpColorHex(from.lightColor, to.lightColor, t),
    lightIntensity: lerp(from.lightIntensity, to.lightIntensity, t),
    ambientSky: lerpColorHex(from.ambientSky, to.ambientSky, t),
    ambientGround: lerpColorHex(from.ambientGround, to.ambientGround, t),
    ambientIntensity: lerp(from.ambientIntensity, to.ambientIntensity, t),
    zenith: lerpColorHex(from.zenith, to.zenith, t),
    horizon: lerpColorHex(from.horizon, to.horizon, t),
    skyExtra,
    fogBase: lerp(from.fogBase, to.fogBase, t),
    shadowRadius: lerp(from.shadowRadius, to.shadowRadius, t),
    shadowBias: lerp(from.shadowBias, to.shadowBias, t),
  };
}

/** 六语义通道标量插值（全部连续量，docs/05 §4.3.5「语义通道标量 lerp」）。 */
export function lerpTimeChannels(from: TimeChannels, to: TimeChannels, t: number): TimeChannels {
  return {
    lampPower: lerp(from.lampPower, to.lampPower, t),
    emberPower: lerp(from.emberPower, to.emberPower, t),
    smokePower: lerp(from.smokePower, to.smokePower, t),
    shopPower: lerp(from.shopPower, to.shopPower, t),
    interiorPower: lerp(from.interiorPower, to.interiorPower, t),
    interiorEmphasis: lerp(from.interiorEmphasis, to.interiorEmphasis, t),
  };
}

/** 天气光照修正三标量插值（intensityMul/ambientMul/glowBoost；本文件唯一负责插值的天气分量）。 */
export function lerpLightMod(
  from: WeatherPreset['lightMod'],
  to: WeatherPreset['lightMod'],
  t: number,
): WeatherPreset['lightMod'] {
  return {
    intensityMul: lerp(from.intensityMul, to.intensityMul, t),
    ambientMul: lerp(from.ambientMul, to.ambientMul, t),
    glowBoost: lerp(from.glowBoost, to.glowBoost, t),
  };
}

// ---------------------------------------------------------------------------
// 离散量：中点一次性翻转 + 0.2s 短淡入（docs/01 §3.5.3 / docs/06 §6.6）
// ---------------------------------------------------------------------------

/**
 * 中点门：per-transition 布尔，blend 首次 ≥0.5 时翻转并恰好一次触发回调（连续快点 retarget
 * 时由 start() 重置——若新旧离散值相同则调用方不再消费门）。
 */
export class MidpointGate {
  private latched = false;

  constructor(private readonly onSwitch?: () => void) {}

  /** 返回 true=已过中点（应取新值）/ false=未过中点（保留旧值）。 */
  update(blend: number): boolean {
    if (!this.latched && blend >= DISCRETE_SWITCH_BLEND) {
      this.latched = true;
      this.onSwitch?.();
    }
    return this.latched;
  }

  reset(): void {
    this.latched = false;
  }
}

/**
 * 0.2s 透明度短淡入（离散装饰状态切换后新增物；docs/06 §6.6「中点切换+200ms 淡入」）。
 * apply(opacity) 由持有方实现（对新增 Object3D 的材质透明度或自定义呈现）；update 由场景
 * lightHooks.update / SceneAnimation 帧驱动调用（本文件不起任何定时器）。
 */
export class FadeInHelper {
  private elapsedMs = -1; // <0 = 未启动

  constructor(
    private readonly apply: (opacity: number) => void,
    private readonly durationMs: number = DISCRETE_FADE_IN_MS,
  ) {}

  /** 启动一次 0.2s 淡入（重复调用重置进度）。 */
  start(): void {
    this.elapsedMs = 0;
    this.apply(0);
  }

  /** 帧推进（dt 秒）；结束后自动停走。 */
  update(dt: number): void {
    if (this.elapsedMs < 0) return;
    this.elapsedMs += dt * 1000;
    const p = clamp(this.elapsedMs / Math.max(this.durationMs, 1e-4), 0, 1);
    this.apply(smoothstep01(p));
    if (p >= 1) this.elapsedMs = -1;
  }
}

// ---------------------------------------------------------------------------
// 时间维过渡（1500ms，可 retarget——docs/05 §4.3.5「中途改档不跳变」）
// ---------------------------------------------------------------------------

/** 当前插值中间态快照（retarget 的新起点；global.skyExtra 恒为「当前视觉生效值」）。 */
export interface TimeLightSnapshot {
  readonly global: GlobalLightParams;
  readonly channels: TimeChannels;
}

/** 时间帧下发口（Director 实现：TimeLightSystem.applyParams + 快照记录）。 */
export interface TimeBlendHost {
  applyTimeFrame(params: GlobalLightParams, channels: TimeChannels, blend: number): void;
}

/**
 * 时间过渡状态机：start(to, current) 即 retarget——current 为当前插值中间态（无过渡时为
 * 最近应用的预设快照），新点击以它为新 from，连续快点四档也是连续渐变（docs/05 §4.3.5）。
 * 离散量 skyExtra 经 MidpointGate 在 blend≥0.5 恰好翻转一次。
 */
export class TimeBlendController {
  private from: TimeLightSnapshot | null = null;
  private to: TimePreset | null = null;
  private elapsedMs = 0;
  private readonly gate = new MidpointGate();
  private flipPending = false;

  constructor(private readonly host: TimeBlendHost) {}

  get active(): boolean {
    return this.to !== null;
  }

  /** 启动/重定向：以 current（当前视觉状态快照）为 from。 */
  start(to: TimePreset, current: TimeLightSnapshot): void {
    this.from = current;
    this.to = to;
    this.elapsedMs = 0;
    this.gate.reset();
    this.flipPending = current.global.skyExtra !== to.lighting.skyExtra;
  }

  /** 立即收敛到目标（场景切换重装配等需要「直接呈现」的路径用）。 */
  finish(): void {
    this.from = null;
    this.to = null;
    this.flipPending = false;
  }

  update(dt: number): void {
    const from = this.from;
    const to = this.to;
    if (!from || !to) return;
    this.elapsedMs = Math.min(this.elapsedMs + Math.max(dt, 0) * 1000, TIME_TRANSITION_MS);
    const b = smoothstep01(this.elapsedMs / TIME_TRANSITION_MS);
    const skyExtra = this.flipPending
      ? this.gate.update(b)
        ? to.lighting.skyExtra
        : from.global.skyExtra
      : from.global.skyExtra;
    this.host.applyTimeFrame(
      lerpGlobalLightParams(from.global, to.lighting, b, skyExtra),
      lerpTimeChannels(from.channels, to.channels, b),
      b,
    );
    if (this.elapsedMs >= TIME_TRANSITION_MS) this.finish();
  }
}

// ---------------------------------------------------------------------------
// 天气维过渡：lightMod 三标量（材质七分量/粒子/风力由各系统内部平滑，见文件头分工）
// ---------------------------------------------------------------------------

/** weather.lightMod 帧下发口（Director 实现：TimeLightSystem.setWeatherLightMod + glowBoost）。 */
export interface WeatherLightModBlendHost {
  applyWeatherLightMod(mod: WeatherPreset['lightMod'], blend: number): void;
}

/** 天气 lightMod 过渡（1500ms smoothstep，可 retarget——以当前中间态为新起点）。 */
export class WeatherLightModBlend {
  private from: WeatherPreset['lightMod'] | null = null;
  private to: WeatherPreset['lightMod'] | null = null;
  private elapsedMs = 0;

  constructor(private readonly host: WeatherLightModBlendHost) {}

  get active(): boolean {
    return this.to !== null;
  }

  start(to: WeatherPreset['lightMod'], from: WeatherPreset['lightMod']): void {
    this.from = { ...from };
    this.to = { ...to };
    this.elapsedMs = 0;
  }

  finish(): void {
    this.from = null;
    this.to = null;
  }

  update(dt: number): void {
    const from = this.from;
    const to = this.to;
    if (!from || !to) return;
    this.elapsedMs = Math.min(this.elapsedMs + Math.max(dt, 0) * 1000, WEATHER_TRANSITION_MS);
    const b = smoothstep01(this.elapsedMs / WEATHER_TRANSITION_MS);
    this.host.applyWeatherLightMod(lerpLightMod(from, to, b), b);
    if (this.elapsedMs >= WEATHER_TRANSITION_MS) this.finish();
  }
}

// ---------------------------------------------------------------------------
// FadeSwap：材质克隆透明度机制（docs/06 §6.6 U2 逐字）+ 分帧 ≤3 构建委托
// ---------------------------------------------------------------------------

/* —— FadeSet：一次「整组材质克隆→opacity 驱动→还原/丢弃」的会话 —— */

interface FadeBinding {
  readonly clone: THREE.Material;
  readonly supportsOpacity: boolean;
}

interface FadeMeshEntry {
  readonly mesh: THREE.Mesh;
  readonly original: THREE.Material | readonly THREE.Material[];
  readonly originalCastShadow: boolean;
  readonly unsupported: boolean;
}

export interface FadeSet {
  /** 整组克隆材质 opacity 驱动（uFade/opacity；不支持 opacity 的 ShaderMaterial 走可见性兜底）。 */
  setOpacity(opacity: number): void;
  /** 还原原生材质与 castShadow（淡入结束时调用；支持可见性兜底的网格恢复可见）。 */
  restore(): void;
  /** dispose 全部克隆材质（不触碰共享贴图，docs/06 §6.6「Material.dispose 不释放共享贴图，安全」）。 */
  dispose(): void;
  readonly cloneCount: number;
}

/** 拷贝实例级编译钩子（three Material.copy 不复制 onBeforeCompile/customProgramCacheKey——
 * wind.ts r187 实证同款纪律）：克隆体必须继承工厂补丁/布料补丁/天气 uniform 按引用注入。 */
function copyOwnCompileHooks(target: THREE.Material, source: THREE.Material): void {
  const hasOwn = Object.prototype.hasOwnProperty;
  if (hasOwn.call(source, 'onBeforeCompile')) target.onBeforeCompile = source.onBeforeCompile;
  if (hasOwn.call(source, 'customProgramCacheKey')) {
    target.customProgramCacheKey = source.customProgramCacheKey;
  }
}

/** 单材质克隆：transparent=true、depthWrite 保持原值（防「透明壳」穿帮）；ShaderMaterial
 * 以 uFade 乘 alpha（反壳/云影等自定 shader 无内建 opacity 通道）。 */
function cloneForFade(source: THREE.Material): FadeBinding {
  const clone = source.clone();
  copyOwnCompileHooks(clone, source);
  let supportsOpacity = true;
  if (clone instanceof THREE.ShaderMaterial) {
    const anchor = '#include <colorspace_fragment>';
    if (clone.fragmentShader.includes(anchor)) {
      clone.uniforms.uFade = { value: 1 };
      clone.fragmentShader = clone.fragmentShader.replace(
        anchor,
        'gl_FragColor.a *= uFade;\n#include <colorspace_fragment>',
      );
      clone.needsUpdate = true;
    } else {
      supportsOpacity = false; // 锚点失配：走 mesh.visible 兜底（降级不穿帮）
    }
  }
  clone.transparent = true;
  return { clone, supportsOpacity };
}

/**
 * 收集 root 子树 unique 材质（含反壳壳材质）逐个克隆并替换、castShadow=false（防淡出期投影
 * 鬼影，docs/06 §6.6）。restore() 把原生材质/castShadow 放回——克隆件与原生件共享 uniform
 * 引用（onBeforeCompile 闭包捕获），淡入淡出期间布料/天气/描边表现一致。
 */
export function createFadeSet(root: THREE.Object3D): FadeSet {
  const bindings = new Map<THREE.Material, FadeBinding>();
  const cloneList: THREE.Material[] = [];
  const entries: FadeMeshEntry[] = [];

  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || mesh.material === undefined || mesh.material === null) return;
    const sources = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    if (sources.length === 0) return;
    const mapped = sources.map((source) => {
      let binding = bindings.get(source);
      if (!binding) {
        binding = cloneForFade(source);
        bindings.set(source, binding);
        cloneList.push(binding.clone);
      }
      return binding;
    });
    entries.push({
      mesh,
      original: mesh.material,
      originalCastShadow: mesh.castShadow,
      unsupported: mapped.some((binding) => !binding.supportsOpacity),
    });
    mesh.material = Array.isArray(mesh.material)
      ? mapped.map((binding) => binding.clone)
      : mapped[0]!.clone;
    mesh.castShadow = false;
  });

  return {
    get cloneCount(): number {
      return cloneList.length;
    },
    setOpacity(opacity: number): void {
      const o = clamp(opacity, 0, 1);
      for (const clone of cloneList) {
        if (clone instanceof THREE.ShaderMaterial && clone.uniforms.uFade !== undefined) {
          clone.uniforms.uFade.value = o;
        } else {
          clone.opacity = o;
        }
      }
      for (const entry of entries) {
        if (entry.unsupported) entry.mesh.visible = o > 0.999;
      }
    },
    restore(): void {
      for (const entry of entries) {
        entry.mesh.material = entry.original as THREE.Material | THREE.Material[];
        entry.mesh.castShadow = entry.originalCastShadow;
        entry.mesh.visible = true;
      }
    },
    dispose(): void {
      for (const clone of cloneList) clone.dispose();
      cloneList.length = 0;
      entries.length = 0;
      bindings.clear();
    },
  };
}

/* —— FadeSwap 时间线（旧组淡出 → 分帧构建 → 旧组移除 → 新组淡入） —— */

/** FadeSwap 委托：构建/卸载/激活由 Director 实现（本文件只管时间线与克隆材质机制）。 */
export interface FadeSwapDelegate {
  /** 分帧构建：stage 0..FADESWAP_MAX_BUILD_FRAMES-1，每帧至多推进一个（docs/06 §6.6）。 */
  buildStage(stage: number): void;
  /** 新内容根组（stage 0 完成前为 null——时间线等待构建产出）。 */
  getNewRoot(): THREE.Object3D | null;
  /** t≥300ms 一次：旧组移除 + 句柄反注册 + assets 释放 + dispose（§3.5.3 卸载路径）。 */
  unloadOld(oldRoot: THREE.Object3D): void;
  /** 淡入开始前（旧组已移除、新组材质已克隆 opacity=0）：立即按当前 time/weather 呈现 blend=1。 */
  beforeFadeIn(newRoot: THREE.Object3D): void;
}

/**
 * 600ms FadeSwap 状态机（场景与车型共用）：
 *   t=0–300 旧组克隆材质 opacity 1→0（easeInQuad），t≥150 起分帧构建（每帧 1 stage，≤3）；
 *   t≥300（且新根就绪）旧组移除+卸载+克隆 dispose；新组克隆材质 opacity 0→1（easeOutCubic）
 *   + scale 0.96→1.0 + y +0.35→0（「换展品」落定感）；t=600 还原原生材质恢复 castShadow。
 * 相机全程不触碰（docs/06 §6.6「相机连续性」）。
 */
export class FadeSwapRunner {
  private oldRoot: THREE.Object3D | null = null;
  private oldFade: FadeSet | null = null;
  private newFade: FadeSet | null = null;
  private newRoot: THREE.Object3D | null = null;
  private elapsedMs = 0;
  private builtStages = 0;
  private readonly maxStages: number;

  constructor(
    private readonly delegate: FadeSwapDelegate,
    opts: { maxBuildStages?: number } = {},
  ) {
    this.maxStages = clamp(
      opts.maxBuildStages ?? FADESWAP_MAX_BUILD_FRAMES,
      1,
      FADESWAP_MAX_BUILD_FRAMES,
    );
  }

  get running(): boolean {
    return this.oldRoot !== null || this.newFade !== null;
  }

  /** 启动（oldRoot 当前已在场景中；重复 start 抛错——排队策略由 Director 负责）。 */
  start(oldRoot: THREE.Object3D): void {
    if (this.running) throw new Error('[transition] FadeSwapRunner.start：已有进行中的过渡');
    this.oldRoot = oldRoot;
    this.newRoot = null;
    this.newFade = null;
    this.elapsedMs = 0;
    this.builtStages = 0;
    this.oldFade = createFadeSet(oldRoot);
    this.oldFade.setOpacity(1);
  }

  /** 帧推进（dt 秒）；返回 true=过渡完成。 */
  update(dt: number): boolean {
    if (!this.running) return true;
    this.elapsedMs += Math.max(dt, 0) * 1000;

    if (this.oldRoot !== null) {
      // —— 淡出段：分帧构建（每帧至多 1 stage，与 newRoot 是否产出无关——root 由 stage 0 创建）——
      if (this.elapsedMs >= FADE_OUT_BUILD_DELAY_MS && this.builtStages < this.maxStages) {
        this.delegate.buildStage(this.builtStages);
        this.builtStages += 1;
      }
      const newRoot = this.delegate.getNewRoot();
      if (newRoot !== null) this.newRoot = newRoot;

      const outP = clamp(this.elapsedMs / FADE_OUT_MS, 0, 1);
      this.oldFade?.setOpacity(1 - easeInQuad(outP));

      // t≥300 且新根已产出才卸载（极端卡顿下宁可延长等待，也不卸载后无内容可切）
      if (this.elapsedMs >= FADE_OUT_MS && this.newRoot !== null) {
        this.delegate.unloadOld(this.oldRoot);
        this.oldFade?.dispose();
        this.oldFade = null;
        this.oldRoot = null;

        const target = this.newRoot;
        this.newFade = createFadeSet(target);
        this.newFade.setOpacity(0);
        this.delegate.beforeFadeIn(target);
        target.visible = true;
        target.scale.setScalar(FADESWAP_IN_SCALE_FROM);
        target.position.y = FADESWAP_IN_LIFT_Y;
      }
      return false;
    }

    // —— 淡入段：opacity 0→1（easeOutCubic）+ scale 0.96→1.0 + y +0.35→0 ——
    const inP = clamp((this.elapsedMs - FADE_OUT_MS) / (FADE_SWAP_MS - FADE_OUT_MS), 0, 1);
    const e = easeOutCubic(inP);
    this.newFade?.setOpacity(e);
    const target = this.newRoot;
    if (target !== null) {
      target.scale.setScalar(lerp(FADESWAP_IN_SCALE_FROM, 1, e));
      target.position.y = lerp(FADESWAP_IN_LIFT_Y, 0, e);
    }
    if (this.elapsedMs >= FADE_SWAP_MS) {
      this.newFade?.restore();
      this.newFade?.dispose();
      this.newFade = null;
      if (target !== null) {
        target.scale.setScalar(1);
        target.position.y = 0;
      }
      this.newRoot = null;
      return true;
    }
    return false;
  }
}
