// docs/01-整体架构.md §3.4-8 systems/atmosphere.ts —— AtmosphereSystem：雾/云单通道合成。T14 落点。
// 职责（§3.4-8 + docs/08 T14 逐字）：
//   ① D6 单通道合成：fog01 = clamp((scene.baseFog + time.fogBase) × weather.fogMul, 0, 1) —— 场景固有
//      云雾与天气雾同源、杜绝双重叠加（需求清单 01 存疑 6 / 决策 D6）；映射 FogExp2.density =
//      0.015 + fog01^1.6 × 0.075（docs/05 §4.4.2 浓雾行，实现期标定值）；
//   ② 剪影板逐层雾化 layerFade：layerAlpha = 1 − clamp(fog01×layerDepth×1.6, 0, 0.95)，远层先没入雾中
//      （五-4「远景逐层雾化」；支持 setSilhouetteHolder 自动派生层深，或 registerSilhouetteLayers 手动）；
//   ③ 天空向雾色压缩：zenith/horizon 向雾色 lerp 0.35×fog01（五-4「景深压缩」的天空侧）；
//   ④ 云影/云带驱动（P4 接口，§3.9）：P4 输入口 setBaseFog(palette.baseFog)；云带透明度
//      cloudBandOpacity = lerp(0.15, 0.55, cloudiness)（五-2 云条带 opacity 0.15→0.55）供 render/sky.ts
//      消费；fog01/fogDensity/fogColor 全部可被场景读取（P4「雾板 α 联动值可被场景读取」）。
// 雾色 = mix(时间天空 horizon, #8A94A8, 0.5×cloudiness)（§4.4.2 浓雾行；rain 的「sky 向灰 lerp 35%」
//   由 0.5×0.7 恰好复现——cloudiness 建议由 Director 以 weather.material.cloudShadow 同源值下发，
//   与五档预设表 0/1/0.7/0.5/0.6 对齐，见 openIssues）。
// 雾微动（§3.5.2 ③ AtmosphereSystem「云影移动、雾微动」）：密度附加 ±1.5% simplex 微动
//   （实现期标定；fog01 本身保持 D6 精确公式不动）。
// 节奏纪律：微动相位一律取 RhythmClock.elapsed（构造注入）；严禁 setTimeout/setInterval。
import * as THREE from 'three';
import { clamp } from '@/shared/math';
import { simplex1 } from '@/systems/clock';
import type { RhythmClock } from '@/systems/clock';
import type { RGB } from '@/systems/handles';

/** D6 映射定值（docs/05 §4.4.2 浓雾行逐字；实现期标定）。 */
const FOG_DENSITY_BASE = 0.015;
const FOG_DENSITY_GAIN = 0.075;
const FOG_EXP = 1.6;

/** 雾灰（docs/05 §4.4.2/五-3：#8A94A8；浓雾 mix 终点色）。 */
const FOG_GRAY_HEX = '#8a94a8';

/** 天空压缩幅度（五-4：zenith/horizon 向雾色 lerp 35%——以 0.35×fog01 随单通道连续生效）。 */
const SKY_COMPRESS_MAX = 0.35;

/** 剪影板逐层雾化（§4.4.2）：layerAlpha = 1 − clamp(fog01×layerDepth×1.6, 0, 0.95)。 */
const LAYER_GAIN = 1.6;
const LAYER_FADE_MAX = 0.95; // fog01=1 且 depth=1 时的保底 alpha=0.05
const LAYER_VISIBLE_MIN = 0.01;

/** 云条带透明度区间（五-2：0.15→0.55 随 cloudiness）。 */
const CLOUD_BAND_MIN = 0.15;
const CLOUD_BAND_MAX = 0.55;

/** 雾微动（§3.5.2 ③；实现期标定：±1.5% 密度扰动，周期 9s）。 */
const FOG_WOBBLE_AMP = 0.015;
const FOG_WOBBLE_PERIOD = 9;

/** 剪影层描述（材质或材质数组；layerDepth 0=最近 1=最远，远层先没入雾中）。 */
export interface SilhouetteLayerSpec {
  readonly material: THREE.Material | readonly THREE.Material[];
  readonly layerDepth: number;
  /** 基础不透明度（缺省取注册时材质 opacity；剪影板厂值 0.999） */
  readonly baseOpacity?: number;
  /** 可见性切换对象（可选；alpha≤0.01 时隐藏） */
  readonly target?: THREE.Object3D;
}

interface SilhouetteLayer {
  readonly materials: readonly THREE.Material[];
  readonly layerDepth: number;
  readonly baseOpacity: number;
  readonly target: THREE.Object3D | null;
}

/**
 * AtmosphereSystem：雾/云单通道合成系统（§3.4-8）。
 * attach(scene) 自持 scene.fog（FogExp2）；三路输入（time.fogBase / weather.fogMul / scene.baseFog）
 * 由 Director/过渡器逐帧喂入（P4 输入口），输出经 getters 供场景与 render/sky.ts 读取。
 */
export class AtmosphereSystem {
  private readonly clock: RhythmClock;
  private readonly fog: THREE.FogExp2;
  private readonly fogGray: THREE.Color;
  private readonly layers: SilhouetteLayer[] = [];

  // —— 三路输入（P4：baseFog；time.fogBase；weather.fogMul）——
  private baseFog = 0; // palette.baseFog（场景固有云雾基底，§3.3.2）
  private timeFogBase = 0; // time.lighting.fogBase（D6 入参：0.18/0.02/0.06/0.05）
  private weatherFogMul = 1; // weather.material.fogMul（五档：1.0/1.15/1.35/2.60/1.40）
  private cloudiness = 0; // 0..1（多云/雨并入的天空灰度量；建议与 material.cloudShadow 同源下发）
  private zenith = new THREE.Color('#3c4e96'); // 时间天空 zenith（线性）
  private horizon = new THREE.Color('#ff8e4f'); // 时间天空 horizon（线性；雾色 mix 基色）

  // —— 输出缓存（update() 刷新）——
  private fog01 = 0;
  private density = FOG_DENSITY_BASE;
  private readonly fogColor = new THREE.Color(FOG_GRAY_HEX);
  private readonly compressedZenith = new THREE.Color('#3c4e96');
  private readonly compressedHorizon = new THREE.Color('#ff8e4f');

  private scene: THREE.Scene | null = null;

  constructor(clock: RhythmClock, opts: { fogGrayTint?: RGB } = {}) {
    this.clock = clock;
    this.fogGray = new THREE.Color(opts.fogGrayTint ?? FOG_GRAY_HEX);
    this.fog = new THREE.FogExp2(FOG_GRAY_HEX, FOG_DENSITY_BASE);
  }

  /** 把 FogExp2 挂入场景（幂等；重复 attach 复用同一 FogExp2 实例，不重建）。 */
  attach(scene: THREE.Scene): void {
    this.scene = scene;
    if (scene.fog !== this.fog) scene.fog = this.fog;
  }

  /** 场景卸载（§3.5.3）：摘除 fog 引用（FogExp2 实例保留复用）。 */
  detach(): void {
    if (this.scene && this.scene.fog === this.fog) this.scene.fog = null;
    this.scene = null;
  }

  /* ============================ P4 输入口（§3.9） ============================ */

  /** P4：场景固有雾基底 palette.baseFog（0..1，§3.3.2；场景切换时装入）。 */
  setBaseFog(value: number): void {
    this.baseFog = clamp(value, 0, 1);
  }

  /** time.lighting.fogBase（D6 入参；Director 经 TimeLightSystem 帧汇/取值口转接）。 */
  setTimeFogBase(value: number): void {
    this.timeFogBase = clamp(value, 0, 1);
  }

  /** weather.material.fogMul（≥0；WeatherMaterialSystem.get fogMul 经 Director 转接）。 */
  setWeatherFogMul(value: number): void {
    this.weatherFogMul = Math.max(0, value);
  }

  /** 云量 0..1（多云 1 / 雨 0.7 / 浓雾 0.5 / 雪 0.6 / 晴朗 0；建议与 material.cloudShadow 同源）。 */
  setCloudiness(value: number): void {
    this.cloudiness = clamp(value, 0, 1);
  }

  /** 时间天空两端点（线性 Color；内部克隆存储——接收方改写不影响外部）。 */
  setSkyColors(zenith: THREE.Color, horizon: THREE.Color): void {
    this.zenith.copy(zenith);
    this.horizon.copy(horizon);
  }

  /* ============================ 剪影板逐层雾化 ============================ */

  /**
   * 手动登记剪影层（场景自建雾板/远山板；layerDepth 0=最近 1=最远）。
   * baseOpacity 缺省取注册时材质 opacity（剪影板厂值 0.999）；材质数组逐个应用。
   */
  registerSilhouetteLayers(specs: readonly SilhouetteLayerSpec[]): void {
    for (const spec of specs) {
      const materials = Array.isArray(spec.material) ? spec.material : [spec.material];
      const base =
        spec.baseOpacity ??
        (typeof materials[0]?.opacity === 'number' ? (materials[0]!.opacity as number) : 1);
      this.layers.push({
        materials,
        layerDepth: clamp(spec.layerDepth, 0, 1),
        baseOpacity: clamp(base, 0, 1),
        target: spec.target ?? null,
      });
      // 逐层透明化的前提：transparent 开启（注册期一次重编译，运行期零改动）
      for (const material of materials) {
        if (!material.transparent) {
          material.transparent = true;
          material.needsUpdate = true;
        }
      }
    }
  }

  /**
   * 后缘剪影板挂点（D1，baseAssembler.silhouetteHolder）：按子板 position.z 升序（最远在前）
   * 自动派生 layerDepth = (n−i)/n —— 最远层 1.0、最近层 1/n，单片场景 depth=1。
   */
  setSilhouetteHolder(holder: THREE.Group | null): void {
    if (!holder) {
      this.clearSilhouetteLayers();
      return;
    }
    const meshes = holder.children.filter((child): child is THREE.Mesh => child instanceof THREE.Mesh);
    meshes.sort((a, b) => a.position.z - b.position.z); // z 越小越靠后缘（越远）
    const n = Math.max(meshes.length, 1);
    this.clearSilhouetteLayers();
    this.registerSilhouetteLayers(
      meshes.map((mesh, i) => ({
        material: mesh.material,
        layerDepth: (n - i) / n,
        target: mesh,
      })),
    );
  }

  /** 清空剪影层（场景卸载 §3.5.3；不 dispose 内容侧材质）。 */
  clearSilhouetteLayers(): void {
    this.layers.length = 0;
  }

  /* ============================ 每帧更新 ============================ */

  /**
   * 每帧更新（Engine 帧序 §3.5.2 ③）：D6 单通道重算 → FogExp2 写入 → 剪影层 alpha → 天空压缩缓存。
   * 雾微动只作用于最终 density（fog01 保持 D6 精确公式），相位取 RhythmClock.elapsed。
   */
  update(): void {
    // ① D6 单通道（需求清单 01 存疑 6：场景雾与天气雾同一个数，绝不叠加两次）
    const fog01 = clamp((this.baseFog + this.timeFogBase) * this.weatherFogMul, 0, 1);
    this.fog01 = fog01;
    // ② FogExp2 密度映射 + 雾微动（±1.5% simplex；fog01 不动）
    const wobble = 1 + FOG_WOBBLE_AMP * simplex1(this.clock.elapsed / FOG_WOBBLE_PERIOD);
    this.density = (FOG_DENSITY_BASE + Math.pow(fog01, FOG_EXP) * FOG_DENSITY_GAIN) * wobble;
    // ③ 雾色 = mix(时间天空 horizon, #8A94A8, 0.5×cloudiness)（§4.4.2 浓雾行逐字）
    this.fogColor.copy(this.horizon).lerp(this.fogGray, 0.5 * this.cloudiness);
    // ④ 天空端点压缩（T45 修复⑤，两规格行先后生效）：
    //   a) 五-4 浓雾景深压缩：zenith/horizon 向雾色 lerp 0.35×fog01（fog01≈1 时恰为 35%）；
    //   b) §4.4.4 公式行 sky = time.sky 向天气灰调 lerp(0.5×cloudiness)——雨 0.5×0.7=35% 逐字。
    //   原实现只有 a) 且无消费方：雨 fog01≈0.2 → 灰移≈2.7%，晴/雨天空实测零变化。
    //   注：多云档 §4.4.4 公式给 0.5×cloudiness=50%，与五-2 行「lerp 25%」存在文档内口径冲突，
    //   此处按「公式块=合成规则权威」取 §4.4.4；五-2 的 25% 如需回调改本行系数即可。
    const compressFog = SKY_COMPRESS_MAX * fog01;
    const compressGray = 0.5 * this.cloudiness;
    this.compressedZenith.copy(this.zenith).lerp(this.fogColor, compressFog).lerp(this.fogGray, compressGray);
    this.compressedHorizon.copy(this.horizon).lerp(this.fogColor, compressFog).lerp(this.fogGray, compressGray);

    // ⑤ 写入场景雾（未 attach 时仅更新缓存，getters 依旧可用）
    if (this.scene) {
      this.fog.color.copy(this.fogColor);
      this.fog.density = this.density;
    }

    // ⑥ 剪影板逐层雾化：layerAlpha = 1 − clamp(fog01×layerDepth×1.6, 0, 0.95)（远层先没入雾中）
    for (const layer of this.layers) {
      const layerAlpha = 1 - clamp(fog01 * layer.layerDepth * LAYER_GAIN, 0, LAYER_FADE_MAX);
      const opacity = layer.baseOpacity * layerAlpha;
      const visible = layerAlpha > LAYER_VISIBLE_MIN;
      for (const material of layer.materials) material.opacity = opacity;
      if (layer.target) layer.target.visible = visible;
    }
  }

  /* ============================ 输出（P4：可被场景读取） ============================ */

  /** D6 单通道合成结果 0..1（归一雾量；场景雾板 α 联动值，§3.9 P4）。 */
  get fog01Value(): number {
    return this.fog01;
  }

  /** FogExp2 密度（SceneLightState.fogDensity 来源；经 Director 回注 TimeLightSystem.setFogDensity）。 */
  get fogDensity(): number {
    return this.density;
  }

  /** 当前雾色（线性 Color 克隆；雾板/远景件自取用色）。 */
  get fogColorValue(): THREE.Color {
    return this.fogColor.clone();
  }

  /** 云量（回读）。 */
  get cloudinessValue(): number {
    return this.cloudiness;
  }

  /** 云条带透明度（五-2：0.15→0.55 随 cloudiness；render/sky.ts 云带消费）。 */
  get cloudBandOpacity(): number {
    return CLOUD_BAND_MIN + (CLOUD_BAND_MAX - CLOUD_BAND_MIN) * this.cloudiness;
  }

  /** 压缩后天空 zenith（线性 Color 克隆；render/sky.ts 渐变端点消费，五-4 景深压缩）。 */
  get skyZenithCompressed(): THREE.Color {
    return this.compressedZenith.clone();
  }

  /** 压缩后天空 horizon（线性 Color 克隆）。 */
  get skyHorizonCompressed(): THREE.Color {
    return this.compressedHorizon.clone();
  }

  /** 场景雾基底回读（P4 输入口对账）。 */
  get baseFogValue(): number {
    return this.baseFog;
  }

  /** 内部 FogExp2 实例（attach 已把其挂到 scene.fog；Director/调试直读用）。 */
  get expFog(): THREE.FogExp2 {
    return this.fog;
  }

  /** 释放（detach + 清层；FogExp2 无 dispose 通道，随系统实例一并弃置）。 */
  dispose(): void {
    this.detach();
    this.clearSilhouetteLayers();
  }
}
