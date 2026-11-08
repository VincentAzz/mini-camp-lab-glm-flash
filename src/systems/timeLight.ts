// docs/01-整体架构.md §3.4-5 systems/timeLight.ts —— TimeLightSystem：时间光照预设应用器。T12 落点。
// 职责（§3.4-5 逐字）：把 TimePreset 写入全局灯光 rig、天空渐变、雾通道，并生成 SceneLightState
// 下发场景/车型钩子。本文件落：
//   ① GlobalLightParams 应用器：方向光（日/月共用）+ hemisphere 写入 + 阴影 radius/bias（map 固定 2048
//      不随过渡重建，docs/05 §4.3.2/§4.3.5）+ 天空渐变端点/额外元素快照 + 雾基准 fogBase 下发；
//   ② 六语义通道下发：lampPower/emberPower/smokePower/shopPower/interiorPower/interiorEmphasis ——
//      场景走 applyLighting(state, blend)、车型走 applyInteriorLight(power, emphasis, blend)（决策 D2）、
//      其余消费方（LightBreathSystem 等）经 addChannelSink 订阅；
//   ③ SceneLightState 构建（含派生 interiorGlow=interiorPower，docs/05 §4.3.2 派生量行；fogDensity 由
//      AtmosphereSystem 合成后经 setFogDensity 注入，§3.4-8）；
//   ④ 线性空间转换：契约 RGB '#rrggbb'（sRGB）→ THREE.Color 线性工作空间。three r152+ 默认
//      ColorManagement.enabled=true（实测 r187：new Color('#FFB35C').g=0.4508，即 convertSRGBToLinear
//      的结果；再手动转换会二次变暗至 0.1713），故 here 用 Color(hex) 一步到位——与契约「载入时
//      convertSRGBToLinear()」等价，过渡插值因此全程在线性空间进行（docs/05 §4.3.5）。
// 天气×时间综合合成（docs/05 §4.4.4「TimeLightSystem 每帧执行，先时间后天气」）：Director/过渡器把
//   插值中的 weather.lightMod 经 setWeatherLightMod 注入，applyParams 内部先乘后用——主光颜色/方向
//   不乘天气（雨雾天太阳变暗不变色），intensity/ambient 乘修正系数。
// 纪律：本系统无自有时钟、无 setTimeout——只在被 apply 时写入；blend 相位由上层 TransitionController
//   （T17）按 RhythmClock 推进（docs/05 §4.3.5 示意接口 TimeLight.apply(g) 的落点即本类 applyParams）。
import * as THREE from 'three';
import { clamp } from '@/shared/math';
import { DEFAULT_STATE, type TimeId, type WeatherId } from '@/core/state';
import type { GlobalLightParams, RGB, SkyExtra } from '@/systems/handles';
import type { TimePreset } from '@/content/times/types';
import type { WeatherPreset } from '@/content/weathers/types';
import type { SceneLightState } from '@/content/scenes/types';

/** 六语义通道（字段名与 TimePreset.channels 逐字一致，docs/01 §3.3.4 / docs/05 §4.3.2 定值表）。 */
export type TimeChannels = TimePreset['channels'];

/** 全零通道（首帧 apply 尚未带通道时的中性初值：白天态——灯具全熄/无余烬，docs/05 §7.1.6）。 */
export const ZERO_CHANNELS: TimeChannels = {
  lampPower: 0,
  emberPower: 0,
  smokePower: 0,
  shopPower: 0,
  interiorPower: 0,
  interiorEmphasis: 0,
};

/**
 * 契约 RGB（'#rrggbb' sRGB）→ 线性工作空间 Color（新建实例；载入期用）。
 * ColorManagement.enabled（r152+ 默认 true）下 Color(hex) 即完成 sRGB→线性转换——与契约所述
 * 「载入时经 convertSRGBToLinear()」等价，且不会二次变暗（本轮已实测验证，见文件头注④）。
 */
export function toLinearColor(hex: RGB): THREE.Color {
  return new THREE.Color(hex);
}

/** 天空快照（线性 Color 克隆；接收方不得就地改写——GlobalLightParams 契约同款纪律）。 */
export interface TimeSkySnapshot {
  readonly zenith: THREE.Color;
  readonly horizon: THREE.Color;
  readonly skyExtra: SkyExtra;
}

/**
 * 每次应用广播给唯一帧汇（Director 接线：把 fogBase/sky 转入 AtmosphereSystem，天空端点转入
 * render/sky.ts——§3.4-5「天空渐变、雾通道」的输出面）。
 */
export interface TimeLightFrame {
  /** 本次应用的有效光照参数（已合成 weather.lightMod 时为合成副本；否则为原引用） */
  readonly params: GlobalLightParams;
  readonly channels: TimeChannels;
  readonly sky: TimeSkySnapshot;
  /** D6 输入（docs/05 §4.4.4 fog01 = clamp((scene.baseFog + fogBase) × fogMul, 0, 1)） */
  readonly fogBase: number;
  readonly state: SceneLightState;
  readonly blend: number;
}

export type TimeFrameSink = (frame: TimeLightFrame) => void;

/** 结构化钩子面（与 content/scenes SceneLightHooks / content/vehicles InteriorLightHooks 逐字同形；type-only 契约，避免 systems→content 运行时耦合）。 */
export interface SceneLightHooksLike {
  applyLighting(state: SceneLightState, blend: number): void;
}

export interface InteriorLightHooksLike {
  applyInteriorLight(power: number, emphasis: number, blend: number): void;
}

/** 其余六通道消费方（如 LightBreathSystem 取 lampPower、ParticleSystem 取 smokePower，§3.5.2 ③）。 */
export interface TimeChannelSink {
  applyChannels(channels: TimeChannels, blend: number): void;
}

/**
 * SceneLightState 构建（docs/05 §4.3.5 示意接口 `buildSceneLightState(g, ch)` 的落点）。
 * 派生量逐字：interiorGlow = interiorPower（docs/05 §4.3.2「派生量」行）；
 * fogDensity = AtmosphereSystem 已合成的雾密度（§3.4-8 / content/scenes types 注）。
 */
export function buildSceneLightState(
  global: GlobalLightParams,
  channels: TimeChannels,
  opts: { timeId?: TimeId; weatherId?: WeatherId; fogDensity?: number } = {},
): SceneLightState {
  return {
    time: opts.timeId ?? DEFAULT_STATE.time,
    weather: opts.weatherId ?? DEFAULT_STATE.weather,
    lampPower: channels.lampPower,
    emberPower: channels.emberPower,
    smokePower: channels.smokePower,
    shopPower: channels.shopPower,
    interiorGlow: channels.interiorPower,
    fogDensity: opts.fogDensity ?? 0,
    global,
  };
}

/**
 * 天气×时间综合合成第一步（docs/05 §4.4.4 公式行）：intensity = time × intensityMul、
 * ambient = time × ambientMul；主光颜色/方向/天空端点不乘天气。glowBoost 不入全局 rig，
 * 由 Director 转供 LightBreathSystem 光晕叠加（§4.4.4「叠加给所有 halo/光束」，T11/T17 接线）。
 */
export function composeWeatherLightMod(
  params: GlobalLightParams,
  mod: WeatherPreset['lightMod'],
): GlobalLightParams {
  return {
    ...params,
    lightIntensity: params.lightIntensity * mod.intensityMul,
    ambientIntensity: params.ambientIntensity * mod.ambientMul,
  };
}

/** 灯架常量：方向光距离/阴影包围按统一底座 20×20（baseAssembler）取定。 */
const RIG_DISTANCE = 30;
const SHADOW_EXTENT = 14; // 底座对角 ≈14.1 → 阴影正交包围 ±14 全覆盖
const SHADOW_MAP_SIZE = 2048; // docs/05 §4.3.2 注：map 固定 2048，不随过渡重建
const FIRE_LIGHT_DISTANCE = 5; // P3 火光点光位（§3.9：预算 ≤2 点光中的火光位）

/**
 * TimeLightSystem：时间光照预设应用器（§3.4-5）。
 * 全局灯光 rig 本类自持（1 方向光日/月共用 + 1 hemisphere + P3 预留火光点光位，§3.9/架构 §4-5
 * 「实时灯光上限」）；render/lighting.ts 为 T01 占位文件，后续接线任务可把 rig 迁入或登记排除。
 */
export class TimeLightSystem {
  /** 日/月共用方向光（阴影主光；color/intensity/position/shadow.radius/bias 随 apply 逐帧写入） */
  readonly sun: THREE.DirectionalLight;
  /** hemisphere 环境光（ambientSky/ambientGround/ambientIntensity） */
  readonly hemi: THREE.HemisphereLight;

  private readonly fireSlot: THREE.PointLight;
  private fireAcquired = false;
  private attachedScene: THREE.Scene | null = null;

  private currentTimeId: TimeId = DEFAULT_STATE.time;
  private currentWeatherId: WeatherId = DEFAULT_STATE.weather;
  private lastChannels: TimeChannels = ZERO_CHANNELS;
  private lastParams: GlobalLightParams | null = null;
  private weatherLightMod: WeatherPreset['lightMod'] | null = null;
  private fogDensity = 0;
  private sky: TimeSkySnapshot = {
    zenith: toLinearColor('#3c4e96'),
    horizon: toLinearColor('#ff8e4f'),
    skyExtra: 'duskBands',
  };
  private currentFogBase = 0.06;

  private sceneHooks: SceneLightHooksLike | null = null;
  private interiorHooks: InteriorLightHooksLike | null = null;
  private readonly channelSinks = new Set<TimeChannelSink>();
  private frameSink: TimeFrameSink | null = null;

  // 逐帧复用的暂存（应用路径零对象分配；颜色经 Color.set(hex) 就地线性化）
  private readonly tmpDir = new THREE.Vector3();

  constructor() {
    this.sun = new THREE.DirectionalLight('#ffffff', 1);
    this.sun.name = 'rig/sun';
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE); // 固定 2048，过渡只 lerp radius/bias
    const cam = this.sun.shadow.camera;
    cam.left = -SHADOW_EXTENT;
    cam.right = SHADOW_EXTENT;
    cam.top = SHADOW_EXTENT;
    cam.bottom = -SHADOW_EXTENT;
    cam.near = 0.5;
    cam.far = RIG_DISTANCE * 2;
    cam.updateProjectionMatrix();
    // renderer.shadowMap.type=PCFSoftShadowMap 的启用电在 T02/T17（radius 只在 PCFSoft 下生效）

    this.hemi = new THREE.HemisphereLight('#ffffff', '#444444', 1);
    this.hemi.name = 'rig/hemi';

    // P3（§3.9）：全局灯架预留 1 个「火光点光」挂点——预算 ≤2 点光中的火光位（车内暖光位归车型侧）
    this.fireSlot = new THREE.PointLight('#ff8a4a', 0, FIRE_LIGHT_DISTANCE, 2);
    this.fireSlot.name = 'rig/fireSlot';
    this.fireSlot.visible = false;
    this.fireSlot.castShadow = false;
  }

  /** 把 rig 挂入场景（幂等；重复调用先摘后挂，防场景切换泄漏）。 */
  attach(scene: THREE.Scene): void {
    this.detach();
    scene.add(this.sun);
    scene.add(this.sun.target); // DirectionalLight.target 必须入场景才会更新矩阵
    scene.add(this.hemi);
    scene.add(this.fireSlot);
    this.attachedScene = scene;
  }

  /** 摘除 rig（场景卸载路径，§3.5.3）。 */
  detach(): void {
    if (!this.attachedScene) return;
    this.attachedScene.remove(this.sun);
    this.attachedScene.remove(this.sun.target);
    this.attachedScene.remove(this.hemi);
    this.attachedScene.remove(this.fireSlot);
    this.attachedScene = null;
  }

  /** P3：领取火光点光位（先到先得；已被领取返回 null——预算位唯一，§3.9）。 */
  acquireFireLight(): THREE.PointLight | null {
    if (this.fireAcquired) return null;
    this.fireAcquired = true;
    this.fireSlot.visible = true;
    return this.fireSlot;
  }

  /** 归还火光点光位（场景卸载时调用；强度清零+隐身）。 */
  releaseFireLight(): void {
    this.fireAcquired = false;
    this.fireSlot.intensity = 0;
    this.fireSlot.visible = false;
  }

  /**
   * 天气 lightMod 注入口（docs/05 §4.4.4「先时间后天气」）：Director/过渡器把插值中的
   * weather.lightMod 每帧喂入；传 null 恢复直通（晴朗基准，五-1）。本系统内每帧执行合成。
   */
  setWeatherLightMod(mod: WeatherPreset['lightMod'] | null): void {
    this.weatherLightMod = mod;
  }

  /** AtmosphereSystem 合成结果回注（SceneLightState.fogDensity，§3.4-8；Director 每帧转接）。 */
  setFogDensity(density: number): void {
    this.fogDensity = Math.max(0, density);
  }

  /** 天气维 id 回注（SceneLightState.weather；时间维由 applyPreset 自带）。 */
  setWeatherId(id: WeatherId): void {
    this.currentWeatherId = id;
  }

  /** 场景光照钩子注册（§3.5.3：插值后的 SceneLightState → scene.lightHooks.applyLighting(state, blend)）。 */
  setSceneHooks(hooks: SceneLightHooksLike | null): void {
    this.sceneHooks = hooks;
  }

  /** 车型内饰灯钩子注册（决策 D2 唯一驱动链：applyInteriorLight(power, emphasis, blend)）。 */
  setInteriorHooks(hooks: InteriorLightHooksLike | null): void {
    this.interiorHooks = hooks;
  }

  /** 六通道附加消费方登记/反注册（LightBreathSystem 等，§3.5.2 ③）。 */
  addChannelSink(sink: TimeChannelSink): void {
    this.channelSinks.add(sink);
  }

  removeChannelSink(sink: TimeChannelSink): void {
    this.channelSinks.delete(sink);
  }

  /** 帧汇注册（sky/fogBase → AtmosphereSystem、render/sky.ts 的唯一转接面；传 null 注销）。 */
  setFrameSink(sink: TimeFrameSink | null): void {
    this.frameSink = sink;
  }

  /**
   * GlobalLightParams 应用器（docs/05 §4.3.5 示意 `TimeLight.apply(g)` 的落点）。
   * 写入顺序固定：合成 lightMod → 线性化 → rig/阴影/天空快照 → 构建状态 →（带通道时）下发。
   * channels 缺省 = 仅 rig 应用（不重发钩子；fogBase/sky 仍经帧汇流出）。返回构建的 SceneLightState。
   */
  applyParams(params: GlobalLightParams, channels?: TimeChannels, blend = 1): SceneLightState {
    const b = clamp(blend, 0, 1);
    const effective =
      this.weatherLightMod !== null ? composeWeatherLightMod(params, this.weatherLightMod) : params;

    // —— 主光（颜色就地线性化；方向 = 指向日/月的单位向量，位置=方向×距离，target 原点）——
    this.sun.color.set(effective.lightColor);
    this.sun.intensity = effective.lightIntensity;
    this.tmpDir.copy(effective.lightDir);
    if (this.tmpDir.lengthSq() < 1e-8) this.tmpDir.set(0.4, 0.8, 0.45); // 零向量兜底，防灯位坍缩
    this.sun.position.copy(this.tmpDir.normalize()).multiplyScalar(RIG_DISTANCE);
    this.sun.shadow.radius = effective.shadowRadius; // 过渡只 lerp radius/bias（docs/05 §4.3.5）
    this.sun.shadow.bias = effective.shadowBias;

    // —— hemisphere 环境光 ——
    this.hemi.color.set(effective.ambientSky);
    this.hemi.groundColor.set(effective.ambientGround);
    this.hemi.intensity = effective.ambientIntensity;

    // —— 天空渐变端点 + 雾基准快照（render/sky.ts 与 AtmosphereSystem 经帧汇/取值口消费）——
    this.sky = {
      zenith: toLinearColor(effective.zenith),
      horizon: toLinearColor(effective.horizon),
      skyExtra: effective.skyExtra,
    };
    this.currentFogBase = effective.fogBase;
    this.lastParams = effective;

    if (channels !== undefined) this.lastChannels = channels;
    const state = buildSceneLightState(effective, this.lastChannels, {
      timeId: this.currentTimeId,
      weatherId: this.currentWeatherId,
      fogDensity: this.fogDensity,
    });

    if (channels !== undefined) this.dispatch(state, b);

    this.frameSink?.({
      params: effective,
      channels: this.lastChannels,
      sky: { zenith: this.sky.zenith.clone(), horizon: this.sky.horizon.clone(), skyExtra: this.sky.skyExtra },
      fogBase: this.currentFogBase,
      state,
      blend: b,
    });
    return state;
  }

  /** 整预设应用（初始装配 blend=1 直呈，§3.5.1「首帧不播过渡」；时间维 id 随之登记）。 */
  applyPreset(preset: TimePreset, blend = 1): SceneLightState {
    this.currentTimeId = preset.id;
    return this.applyParams(preset.lighting, preset.channels, blend);
  }

  /** 六通道下发（§3.5.3 路径逐字：场景钩子 + 车型钩子 + 附加消费方）。 */
  dispatch(state: SceneLightState, blend: number): void {
    const b = clamp(blend, 0, 1);
    this.sceneHooks?.applyLighting(state, b);
    this.interiorHooks?.applyInteriorLight(
      this.lastChannels.interiorPower,
      this.lastChannels.interiorEmphasis,
      b,
    );
    for (const sink of this.channelSinks) sink.applyChannels(this.lastChannels, b);
  }

  /** 当前时间维 id（SceneLightState.time 的来源）。 */
  get timeId(): TimeId {
    return this.currentTimeId;
  }

  /** 当前天气维 id。 */
  get weatherId(): WeatherId {
    return this.currentWeatherId;
  }

  /** D6 雾基准（最近一次 apply 的 time.lighting.fogBase；AtmosphereSystem 单通道合成入参）。 */
  get fogBase(): number {
    return this.currentFogBase;
  }

  /** 天空快照（线性 Color 克隆；render/sky.ts 渐变/星空/月面消费）。 */
  get skySnapshot(): TimeSkySnapshot {
    return {
      zenith: this.sky.zenith.clone(),
      horizon: this.sky.horizon.clone(),
      skyExtra: this.sky.skyExtra,
    };
  }

  /** 最近一次应用的有效光照参数（已含 lightMod 合成；未应用过为 null）。 */
  get lighting(): GlobalLightParams | null {
    return this.lastParams;
  }

  /** 最近下发的六通道。 */
  get channels(): TimeChannels {
    return this.lastChannels;
  }

  /** 释放 rig（含 shadow map；场景切换/关停路径调用）。 */
  dispose(): void {
    this.detach();
    this.sun.dispose();
    this.hemi.dispose();
    this.fireSlot.dispose();
    this.sceneHooks = null;
    this.interiorHooks = null;
    this.channelSinks.clear();
    this.frameSink = null;
    this.lastParams = null;
  }
}
