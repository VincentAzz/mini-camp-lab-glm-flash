// docs/01-整体架构.md §3.2 core/director.ts —— ★ Director：模块装配/卸载、四维切换编排、句柄注册与反注册（T17 落点）。
//
// 职责（docs/01 §3.5.1/§3.5.3 逐条）：
//   启动装配：BaseAssembler.build(palette.baseStyle) → buildTerrain → buildProps → 句柄注册
//   （cloths→Wind / lamps→Breath / emitters→Particles / weatherSurfaces→WeatherMaterial）→
//   createAnimations → 预设应用（首帧 blend=1 直接呈现，不播过渡）；
//   卸载：句柄反注册 + assets 引用计数释放 + SceneAnimation.dispose + FadeSwap 克隆材质丢弃；
//   四维切换：时间 1500ms 插值+retarget / 天气 1500ms / 场景 600ms FadeSwap 分帧 ≤3 / 车型 600ms
//   FadeSwap（过渡机制本体在 core/transition.ts，本类以 FadeSwapDelegate 提供构建/卸载/激活）；
//   campAnchor 对位：root.y=camp.groundY、rotation.y=headingRad、footprint 外接半径越界只告警
//   （docs/03 §3.0：`[vehicle] footprint exceeds camp radius`，不阻断）。
//
// 依赖纪律：content 只以 type-only 进入本文件（与 systems/timeLight.ts 同先例——type 契约无运行时
// 耦合）；绝不 import core/controls（docs/06 §6.6 相机连续性：Director 无任何相机读写 API）。
import * as THREE from 'three';
import type { Engine } from '@/core/engine';
import { AppStateStore, type AppState, type AppStateChangeEvent } from '@/core/state';
import type { Registry, RegistryEntry } from '@/core/registry';
import { BaseAssembler, type BaseBuild } from '@/core/baseAssembler';
import {
  DISCRETE_SWITCH_BLEND,
  FadeSwapRunner,
  TimeBlendController,
  WeatherLightModBlend,
  WEATHER_TRANSITION_MS,
  type FadeSwapDelegate,
  type TimeLightSnapshot,
} from '@/core/transition';
import { RhythmClock } from '@/systems/clock';
import { WindSystem, windUniforms } from '@/systems/wind';
import { ParticleSystem, type WeatherEmitterInput } from '@/systems/particles';
import { LightBreathSystem } from '@/systems/lightBreath';
import { TimeLightSystem, ZERO_CHANNELS, type TimeChannels } from '@/systems/timeLight';
import { WeatherMaterialSystem } from '@/systems/weatherMaterial';
import { AtmosphereSystem } from '@/systems/atmosphere';
import { EventScheduler } from '@/systems/scheduler';
import { OutlineSystem } from '@/render/outline';
import { SkySystem, type SkyFrame } from '@/render/sky';
import { sharedUniforms } from '@/render/toonMaterial';
import type {
  ClothHandle,
  GlobalLightParams,
  LampHandle,
  ParticleEmitterHandle,
  SharedAssets,
  WeatherSurface,
} from '@/systems/handles';
import { Rng } from '@/shared/rng';
import type {
  SceneAnimation,
  SceneModule,
  SceneProps,
  SceneRuntime,
  SceneTerrain,
} from '@/content/scenes/types';
import type { CampAnchorSnapshot, VehicleModule } from '@/content/vehicles/types';
import type { TimePreset } from '@/content/times/types';
import type { WeatherPreset } from '@/content/weathers/types';

// ---------------------------------------------------------------------------
// SharedAssets 契约实现（§3.4-10：同 id geometry/texture 全局共享，获取即 +1，release 归零 dispose）
// ---------------------------------------------------------------------------

/**
 * 场景发射器语义调制绑定（T31⑥：§7.1.3 定值表逐 kind 公式——steam=2.2×smokePower+0.4、
 * spark=6×emberPower；B6 发电机蒸汽常转 base floor（authored rate<2 视为常转基值）；
 * dust 仅 beam>0.3（J5 白天探照灯熄→day 档置 0）；mist 按 §7.1.6 晨雾行逐档）。
 * drip 天气门控/leaf 常率维持 authored——归 T33 天气维。
 */
interface EmitterBinding {
  readonly handle: ParticleEmitterHandle;
  readonly kind: string;
  readonly baseRate: number;
  /** 当前生效 rate（指数趋近目标——离散档表免跳变） */
  rate: number;
}

/** 晨雾逐档 rate（§7.1.6 动效×时间联动矩阵「晨雾 mist」行：1.5/0.4/0.3/0.3；雾天 ×1.6 归 T33）。 */
const MIST_TIME_RATES: Record<string, number> = { dawn: 1.5, day: 0.4, dusk: 0.3, night: 0.3 };

/** P3 火光挂点发现（场景申报=name 以 `/fire-light-anchor` 结尾的首个对象；无则 null）。 */
function findFireLightAnchor(root: THREE.Object3D): THREE.Object3D | null {
  let found: THREE.Object3D | null = null;
  root.traverse((obj) => {
    if (!found && obj.name.endsWith('/fire-light-anchor')) found = obj;
  });
  return found;
}

type ScopeKind = 'geo' | 'tex';
interface ScopeRecordEntry {
  readonly kind: ScopeKind;
  readonly id: string;
}

/**
 * 一次装配会话的资源作用域：build 期间经 SharedAssets 取用的资源 id 记账；
 * close() 停止记账（构建完成），release() 按账逐条释放（卸载路径）。
 */
export interface AssetScope {
  close(): void;
  release(): void;
  readonly size: number;
}

class AssetScopeImpl implements AssetScope {
  private closed = false;

  constructor(
    private readonly owner: RefCountedAssets,
    private readonly records: ScopeRecordEntry[],
    private readonly stack: ScopeRecordEntry[][],
  ) {}

  close(): void {
    if (this.closed) return;
    this.closed = true;
    const at = this.stack.lastIndexOf(this.records);
    if (at >= 0) this.stack.splice(at, 1);
  }

  release(): void {
    this.close();
    for (let i = this.records.length - 1; i >= 0; i--) {
      const record = this.records[i]!;
      if (record.kind === 'geo') this.owner.releaseGeometry(record.id);
      else this.owner.releaseTexture(record.id);
    }
    this.records.length = 0;
  }

  get size(): number {
    return this.records.length;
  }
}

/**
 * 引用计数共享缓存（systems/handles.ts:181 SharedAssets 契约实现）：同 id geometry/texture
 * 全局共享、获取即 +1、release 归零即 dispose（§3.5.3 卸载路径）。
 * 注：贴图释放后工厂缓存中的旧材质仍引用已 dispose 贴图——材质缓存键含 map uuid，
 * 重建后命中新键生成新材质，不会误用旧键（ToonMaterialFactory.get 键结构保证）。
 */
export class RefCountedAssets implements SharedAssets {
  private readonly geometries = new Map<string, { geometry: THREE.BufferGeometry; refs: number }>();
  private readonly textures = new Map<string, { texture: THREE.Texture; refs: number }>();
  private readonly stack: ScopeRecordEntry[][] = [];

  /** 开启装配作用域（此后 geometry()/texture() 的取用记入该作用域；同步构建期使用）。 */
  openScope(): AssetScope {
    const records: ScopeRecordEntry[] = [];
    this.stack.push(records);
    return new AssetScopeImpl(this, records, this.stack);
  }

  geometry(id: string, build: () => THREE.BufferGeometry): THREE.BufferGeometry {
    const hit = this.geometries.get(id);
    if (hit) {
      hit.refs += 1;
      this.record('geo', id);
      return hit.geometry;
    }
    const geometry = build();
    geometry.name = id;
    this.geometries.set(id, { geometry, refs: 1 });
    this.record('geo', id);
    return geometry;
  }

  texture(id: string, build: () => THREE.Texture): THREE.Texture {
    const hit = this.textures.get(id);
    if (hit) {
      hit.refs += 1;
      this.record('tex', id);
      return hit.texture;
    }
    const texture = build();
    texture.name = id;
    this.textures.set(id, { texture, refs: 1 });
    this.record('tex', id);
    return texture;
  }

  releaseGeometry(id: string): void {
    const hit = this.geometries.get(id);
    if (!hit) {
      console.warn(`[assets] releaseGeometry 未登记 id=${id}`);
      return;
    }
    hit.refs -= 1;
    if (hit.refs <= 0) {
      hit.geometry.dispose();
      this.geometries.delete(id);
    }
  }

  releaseTexture(id: string): void {
    const hit = this.textures.get(id);
    if (!hit) {
      console.warn(`[assets] releaseTexture 未登记 id=${id}`);
      return;
    }
    hit.refs -= 1;
    if (hit.refs <= 0) {
      hit.texture.dispose();
      this.textures.delete(id);
    }
  }

  /** 泄漏自检（T17 泄漏测试用）：未闭合作用域数 / 几何项数 / 贴图项数。 */
  stats(): { openScopes: number; geometries: number; textures: number } {
    return {
      openScopes: this.stack.length,
      geometries: this.geometries.size,
      textures: this.textures.size,
    };
  }

  /** 整体收尾（Director.dispose；正常卸载路径走 AssetScope.release）。 */
  disposeAll(): void {
    for (const item of this.geometries.values()) item.geometry.dispose();
    this.geometries.clear();
    for (const item of this.textures.values()) item.texture.dispose();
    this.textures.clear();
    this.stack.length = 0;
  }

  private record(kind: ScopeKind, id: string): void {
    const scope = this.stack[this.stack.length - 1];
    if (scope) scope.push({ kind, id });
  }
}

// ---------------------------------------------------------------------------
// 装配会话类型
// ---------------------------------------------------------------------------

/** 装配完成的场景会话（当前或过渡中旧场；卸载所需全部信息）。 */
interface AssembledScene {
  readonly id: string;
  readonly module: SceneModule;
  readonly root: THREE.Group;
  readonly campAnchor: SceneTerrain['campAnchor'];
  readonly animations: readonly SceneAnimation[];
  readonly scheduler: EventScheduler;
  readonly emitterHandles: readonly ParticleEmitterHandle[];
  readonly emitterBindings: readonly EmitterBinding[];
  /** P3 火光点光挂点（场景申报：props 内 name 以 `/fire-light-anchor` 结尾的首个对象；无则 null） */
  readonly fireAnchor: THREE.Object3D | null;
  readonly cloths: readonly ClothHandle[];
  readonly lamps: readonly LampHandle[];
  readonly scope: AssetScope;
}

/** 装配完成的车型会话。 */
interface AssembledVehicle {
  readonly id: string;
  readonly module: VehicleModule;
  readonly root: THREE.Group;
  readonly cloths: readonly ClothHandle[];
  readonly surfaces: readonly WeatherSurface[];
  readonly lamps: readonly LampHandle[];
  readonly scope: AssetScope;
}

/** 场景分帧构建中间态（≤3 帧：0 底座+地形 / 1 道具 / 2 句柄注册+动效+描边）。 */
interface SceneBuildSession {
  readonly module: SceneModule;
  root: THREE.Group | null;
  scope: AssetScope | null;
  rng: Rng | null;
  base: BaseBuild | null;
  terrain: SceneTerrain | null;
  props: SceneProps | null;
  scheduler: EventScheduler | null;
  readonly emitterHandles: ParticleEmitterHandle[];
  readonly emitterBindings: EmitterBinding[];
  fireAnchor: THREE.Object3D | null;
  readonly animations: SceneAnimation[];
}

/** 车型分帧构建中间态（2 帧：0 外观+展开+对位 / 1 内饰+注册+描边）。 */
interface VehicleBuildSession {
  readonly module: VehicleModule;
  root: THREE.Group | null;
  scope: AssetScope | null;
  rng: Rng | null;
  readonly cloths: ClothHandle[];
  readonly surfaces: WeatherSurface[];
}

export interface DirectorOptions {
  readonly engine: Engine;
  /** 四套注册表由 main.ts（唯一组装点）注入；core 不 import content（§3.1 依赖纪律）。 */
  readonly sceneRegistry: Registry<SceneModule>;
  readonly vehicleRegistry: Registry<VehicleModule>;
  readonly timeRegistry: Registry<TimePreset>;
  readonly weatherRegistry: Registry<WeatherPreset>;
  /** 缺省自建（UI 可经 director.state 订阅/下发）。 */
  readonly state?: AppStateStore;
}

/** 风力基准幅（docs/05 §7.1.2「风力目标值=基准幅×weatherPreset.windMul」；wind.ts 初始 target 1.0 同口径）。 */
const WIND_BASE_POWER = 1.0;

/**
 * ★ Director（§3.5 总控）：内容装配/卸载编排 + 四维切换路径 + 每帧阶段接线。
 * applyState() 默认组合的四个 id 全部从注册表 isDefault 读取（不硬编码 id，§3.5.1）。
 */
export class Director {
  readonly state: AppStateStore;

  private readonly engine: Engine;
  private readonly sceneRegistry: Registry<SceneModule>;
  private readonly vehicleRegistry: Registry<VehicleModule>;
  private readonly timeRegistry: Registry<TimePreset>;
  private readonly weatherRegistry: Registry<WeatherPreset>;

  // —— 公共系统（§3.4；实例由本类持有并接入帧序）——
  private readonly clock = new RhythmClock();
  private readonly wind = new WindSystem(this.clock);
  private readonly particles = new ParticleSystem(this.clock);
  private readonly breath = new LightBreathSystem(this.clock);
  private readonly atmosphere = new AtmosphereSystem(this.clock);
  private readonly weatherMaterial = new WeatherMaterialSystem(this.clock);
  private readonly timeLight = new TimeLightSystem();
  private readonly sky = new SkySystem();
  private readonly outline = new OutlineSystem();
  private readonly baseAssembler: BaseAssembler;
  private readonly assets = new RefCountedAssets();
  /** 最近一次 TimeLightFrame 帧汇转接值（sky.update 输入；颜色为克隆，勿就地改写） */
  private lastSkyFrame: SkyFrame | null = null;
  /** P3 火光点光（timeLight.fireSlot 单例；场景申报挂点后领取——T31②，docs/01 §3.9） */
  private fireLight: THREE.PointLight | null = null;
  /**
   * 打磨轮次1：夜间自动静默（scheduler.ts:249 契约「Director 在时间切换/首装按
   * state.time==='night' 驱动（过渡中点切换）」）。armed=时间过渡中点待生效值（null=无挂起），
   * active=当前已生效值（场景首装/重入时直接下发新 scheduler）。
   */
  private nightSilenceArmed: boolean | null = null;
  private nightSilenceActive = false;

  // —— 过渡状态机（机制在 core/transition.ts）——
  private readonly timeBlend = new TimeBlendController({
    applyTimeFrame: (params, channels, blend) => {
      this.applyLightingNow(params, channels, blend);
      // 打磨轮次1：夜间静默随时间过渡中点切换（§3.5.3 离散量 blend≥0.5 一次性翻转；
      // 挂起值消费一次即清空，连续 retarget 由 onStateChanged 重挂最新目标）。
      if (this.nightSilenceArmed !== null && blend >= DISCRETE_SWITCH_BLEND) {
        this.setNightSilenceNow(this.nightSilenceArmed);
        this.nightSilenceArmed = null;
      }
    },
  });
  private readonly weatherLightModBlend = new WeatherLightModBlend({
    applyWeatherLightMod: (mod) => {
      this.setLightModNow(mod);
    },
  });
  private sceneSwap: FadeSwapRunner | null = null;
  private vehicleSwap: FadeSwapRunner | null = null;
  private pendingSceneId: string | null = null;
  private pendingVehicleId: string | null = null;
  /** 当前生效天气预设（天气粒子锚定用：T33 setWeatherSet 以营位锚点为中心 + 场景重入 reanchorWeather）。 */
  private activeWeatherPreset: WeatherPreset | null = null;

  // —— 当前会话与已应用维（同值守卫 / retarget 快照来源）——
  private scene: AssembledScene | null = null;
  private vehicle: AssembledVehicle | null = null;
  private assembled = false;
  private appliedTimeId: string | null = null;
  private appliedWeatherId: string | null = null;
  private warnedEmptyTimeRegistry = false;
  private warnedEmptyWeatherRegistry = false;
  private readonly unsubs: Array<() => void> = [];

  /** 最近一次应用的插值中间态（时间过渡 retarget 起点；初值=灯架构造中性态）。 */
  private lastSnapshot: TimeLightSnapshot = createNeutralSnapshot();
  /** 当前生效 weather.lightMod（天气过渡 from 起点；初值=晴朗中性）。 */
  private currentLightMod: WeatherPreset['lightMod'] = {
    intensityMul: 1,
    ambientMul: 1,
    glowBoost: 0,
  };

  constructor(options: DirectorOptions) {
    this.engine = options.engine;
    this.sceneRegistry = options.sceneRegistry;
    this.vehicleRegistry = options.vehicleRegistry;
    this.timeRegistry = options.timeRegistry;
    this.weatherRegistry = options.weatherRegistry;
    this.state = options.state ?? new AppStateStore();
    this.baseAssembler = new BaseAssembler(this.assets);
  }

  // =========================================================================
  // 启动接线（main.ts：new Director(...) → start() → applyState() → engine.start()）
  // =========================================================================

  /** 接入 Engine 帧序（docs/01 §3.5.2 顺序固定）+ 状态订阅 + 全局系统挂载。 */
  start(): void {
    // ① RhythmClock：全项目唯一时间源
    this.engine.hooks.clock = (dt) => this.clock.update(dt);
    // ② 过渡状态机（时间/天气插值 + 场景/车型 FadeSwap 时间线）
    this.engine.hooks.transition = (dt) => this.updateTransitions(dt);
    // ③ 公共系统（顺序：风→粒子→灯→天气材质→雾→偶发→描边对账）
    this.engine.hooks.systems.push(
      (dt) => this.wind.update(dt),
      (dt) => {
        // P2/粒子风漂转接：风向（世界 xz 单位）×风力（含 gust 包络）→ uWind（米制漂移）
        const dir = windUniforms.uWindDir.value;
        const strength = sharedUniforms.uWindStrength.value;
        this.particles.setWindDrift(dir.x * strength, 0, dir.y * strength);
        this.particles.update(dt);
      },
      (dt) => this.breath.update(dt),
      () => {
        // 天气材质帧（七分量→共享 uniform、云影滚动、反光条、雪壳）
        const dir = windUniforms.uWindDir.value;
        this.weatherMaterial.setWindDir(dir.x, dir.y);
        this.weatherMaterial.update();
        // D6 输入转接：fogMul/cloudiness 由天气材质系统插值结果供给（同源单通道）
        this.atmosphere.setWeatherFogMul(this.weatherMaterial.components.fogMul);
        this.atmosphere.setCloudiness(this.weatherMaterial.components.cloudShadow);
      },
      () => {
        this.atmosphere.update();
        this.timeLight.setFogDensity(this.atmosphere.fogDensity); // SceneLightState.fogDensity 回注
      },
      (dt) => this.scene?.scheduler.update(dt),
      () => this.outline.update(),
      (dt) => {
        // —— T31⑧ 天空（穹顶渐变/条带/星空月面 0.2s 淡变；帧值来自帧汇 lastSkyFrame）——
        // T45 修复④：天空端点经 AtmosphereSystem 天气压缩（§4.4.4「sky 向天气灰调 lerp(0.5×cloudiness)」
        // + 五-4 景深压缩）——此前压缩值无任何消费方，穹顶直用 timeLight 未压缩端点，晴/雨天空零变化。
        if (this.lastSkyFrame !== null) {
          this.sky.update(dt, {
            ...this.lastSkyFrame,
            zenith: this.atmosphere.skyZenithCompressed,
            horizon: this.atmosphere.skyHorizonCompressed,
          });
        }
        // —— T31② P3 火光点光（§4.3.3-② intensity=emberPower×0.6；§3.9 预算位唯一，场景申报领取）——
        const anchor = this.scene?.fireAnchor ?? null;
        if (anchor) {
          if (!this.fireLight) this.fireLight = this.timeLight.acquireFireLight();
          if (this.fireLight) {
            anchor.getWorldPosition(this.fireLight.position);
            this.fireLight.intensity = this.timeLight.channels.emberPower * 0.6;
            this.fireLight.visible = this.fireLight.intensity >= 0.02;
          }
        } else if (this.fireLight) {
          this.timeLight.releaseFireLight();
          this.fireLight = null;
        }
        // —— T31⑥ 场景发射器语义调制（§7.1.3 逐 kind 公式；指数趋近免离散跳变）——
        const channels = this.timeLight.channels;
        for (const binding of this.scene?.emitterBindings ?? []) {
          let target = binding.baseRate;
          if (binding.kind === 'steam') {
            // §7.1.3 steam 行 + B6：发电机蒸汽常转 base（authored rate<2 视为常转基值 floor）
            target = Math.max(2.2 * channels.smokePower + 0.4, binding.baseRate < 2 ? binding.baseRate : 0);
          } else if (binding.kind === 'spark') {
            target = 6 * channels.emberPower; // §7.1.3 spark 行（B8 白天火熄=ember 0）
          } else if (binding.kind === 'dust') {
            target = this.timeLight.timeId === 'day' ? 0 : binding.baseRate; // §7.1.3「仅 beam>0.3」（J5 day 熄）
          } else if (binding.kind === 'mist') {
            target = MIST_TIME_RATES[this.timeLight.timeId] ?? binding.baseRate; // §7.1.6 晨雾行
          }
          const next = binding.rate + (target - binding.rate) * (1 - Math.exp(-dt / 0.4));
          binding.handle.setRate(Math.max(0, next));
          binding.rate = next;
        }
      },
    );
    // ④ 场景帧驱动：lightHooks.update? + SceneAnimation[]
    this.engine.hooks.scene.push((dt, elapsed) => {
      const current = this.scene;
      if (!current) return;
      current.module.lightHooks.update?.(dt, elapsed);
      for (const animation of current.animations) animation.update(dt, elapsed);
    });

    // 全局灯架/雾/天空挂载（跨场景常驻，§3.4-5/§3.4-8；天空=render/sky.ts T31⑧）
    this.timeLight.attach(this.engine.scene);
    this.atmosphere.attach(this.engine.scene);
    this.sky.attach(this.engine.scene);
    this.engine.scene.add(this.particles.root);
    this.weatherMaterial.setCamera(this.engine.camera);
    // 时间帧汇：天空端点/雾基准 → AtmosphereSystem + SkySystem（§3.4-5 输出面；月向=主光方向）
    this.timeLight.setFrameSink((frame) => {
      this.atmosphere.setSkyColors(frame.sky.zenith, frame.sky.horizon);
      this.atmosphere.setTimeFogBase(frame.fogBase);
      this.lastSkyFrame = {
        zenith: frame.sky.zenith,
        horizon: frame.sky.horizon,
        skyExtra: frame.sky.skyExtra,
        lightDir: frame.params.lightDir.clone(),
      };
    });
    // 六通道附加消费方：LightBreath（呼吸功率）+ WeatherMaterial（反光条功率）
    this.timeLight.addChannelSink({
      applyChannels: (channels) => {
        this.breath.setChannelPower('lamp', channels.lampPower);
        this.breath.setChannelPower('ember', channels.emberPower);
        this.breath.setChannelPower('shop', channels.shopPower);
        this.breath.setChannelPower('interior', channels.interiorPower);
      },
    });
    this.timeLight.addChannelSink(this.weatherMaterial);

    this.unsubs.push(this.state.onChange((event) => this.onStateChanged(event)));
  }

  // =========================================================================
  // applyState（§3.5.1：默认项从 registry 的 isDefault 读取，不硬编码 id）
  // =========================================================================

  /** 四注册表的默认档 id（isDefault 优先，否则注册顺序首项；空注册表返回 null）。 */
  defaultId<T extends RegistryEntry>(registry: Registry<T>): string | null {
    const list = registry.list();
    return list.find((entry) => entry.isDefault === true)?.id ?? list[0]?.id ?? null;
  }

  /**
   * 组合下发。patch 未给的维度取注册表 isDefault（空注册表沿用 store 当前值）。
   * 首次调用 = 启动装配：同步装配 + 预设 blend=1 直呈（不播过渡）；其后 = 事件驱动四条切换路径。
   */
  applyState(patch: Partial<AppState> = {}): void {
    const next: AppState = {
      scene: patch.scene ?? this.defaultId(this.sceneRegistry) ?? this.state.get('scene'),
      vehicle: patch.vehicle ?? this.defaultId(this.vehicleRegistry) ?? this.state.get('vehicle'),
      time: patch.time ?? this.defaultId(this.timeRegistry) ?? this.state.get('time'),
      weather: patch.weather ?? this.defaultId(this.weatherRegistry) ?? this.state.get('weather'),
    };
    if (!this.assembled) {
      this.assembleAll(next);
      this.assembled = true;
    }
    // 事件 → onStateChanged：初始路径被「同值守卫」吸收（appliedXxxId 已等于 next），
    // 运行期路径按维度路由四条切换路径（§3.5.3）。
    this.state.apply(next);
  }

  // =========================================================================
  // 状态变更 → 四条切换路径（§3.5.3）
  // =========================================================================

  private onStateChanged(event: AppStateChangeEvent): void {
    switch (event.key) {
      case 'scene':
        if (event.to !== this.scene?.id) this.startSceneSwap(event.to);
        break;
      case 'vehicle':
        if (event.to !== this.vehicle?.id) this.startVehicleSwap(event.to);
        break;
      case 'time': {
        if (event.to === this.appliedTimeId) break;
        const preset = this.tryGetTimePreset(event.to);
        if (preset) {
          this.appliedTimeId = preset.id;
          this.timeLight.setTimeId(preset.id); // T31：SceneLightState.time 随切换档更新（离散量门控依赖）
          // retarget：以当前插值中间态为新起点（docs/05 §4.3.5「中途改档不跳变」）
          this.timeBlend.start(preset, this.lastSnapshot);
          // 打磨轮次1：夜间静默挂起至过渡中点（scheduler.ts:249 契约；重挂覆盖旧挂起值）
          this.nightSilenceArmed = preset.id === 'night';
        }
        break;
      }
      case 'weather': {
        if (event.to === this.appliedWeatherId) break;
        const preset = this.tryGetWeatherPreset(event.to);
        if (preset) {
          this.appliedWeatherId = preset.id;
          this.startWeatherTransition(preset);
        }
        break;
      }
    }
  }

  /** 【天气切换】1500ms：粒子交叉/材质七分量/风力趋近由系统内平滑，lightMod 三标量本地插值。 */
  private startWeatherTransition(preset: WeatherPreset): void {
    this.activeWeatherPreset = preset;
    this.particles.setWeatherSet(this.liftedWeatherEntries(preset)); // 旧集合 0.5s 淡出+新集合淡入（§4.4.3）
    this.weatherMaterial.setWeather(preset.material, WEATHER_TRANSITION_MS); // 七分量 smoothstep 插值
    this.wind.setWind(WIND_BASE_POWER * preset.windMul); // 指数趋近 τ=0.6s（§4.4.3）
    this.weatherLightModBlend.start(preset.lightMod, this.currentLightMod);
  }

  /** 【场景切换】600ms FadeSwap：淡出 → 分帧构建（≤3 帧）→ 卸载 → 淡入；相机不动。 */
  private startSceneSwap(toId: string): void {
    if (this.sceneSwap?.running) {
      this.pendingSceneId = toId; // 队列深度 1，后到覆盖（docs/06 §6.6 U6）
      return;
    }
    if (!this.scene || toId === this.scene.id) return;
    const module = this.sceneRegistry.get(toId);
    const old = this.scene;
    const session: SceneBuildSession = {
      module,
      root: null,
      scope: null,
      rng: null,
      base: null,
      terrain: null,
      props: null,
      scheduler: null,
      emitterHandles: [],
      emitterBindings: [],
      fireAnchor: null,
      animations: [],
    };
    const delegate: FadeSwapDelegate = {
      buildStage: (stage) => this.buildSceneStage(session, stage),
      getNewRoot: () => session.root,
      unloadOld: (oldRoot) => {
        this.unloadScene(old, oldRoot);
        // ★T20 修补（系统性）：unloadScene→clearRegistrations() 会把新场景在 stage2 注册的
        // 天气面/雪壳一并清空（FadeSwap 顺序=stage2 注册→unload 清空），导致切换后湿润/积雪/
        // 雪壳驱动整体失效（海崖同样受累）。此处按新会话重注册；props 未建时（早卸载边角）由
        // stage2 的 register 兜底，二者先后必居其一。
        if (session.props) this.weatherMaterial.register(session.props.weatherSurfaces);
      },
      beforeFadeIn: (newRoot) => this.activateScene(session, newRoot),
      discardNewRoot: (newRoot) => this.discardSceneSession(session, newRoot),
    };
    const runner = new FadeSwapRunner(delegate);
    runner.start(old.root);
    this.sceneSwap = runner;
  }

  /** 【车型切换】600ms FadeSwap（次重路径）：淡出→反注册→dispose→对位→立即按当前时间档呈现。 */
  private startVehicleSwap(toId: string): void {
    if (this.vehicleSwap?.running) {
      this.pendingVehicleId = toId;
      return;
    }
    if (!this.vehicle || toId === this.vehicle.id) return;
    const module = this.vehicleRegistry.get(toId);
    const old = this.vehicle;
    const session: VehicleBuildSession = { module, root: null, scope: null, rng: null, cloths: [], surfaces: [] };
    const delegate: FadeSwapDelegate = {
      buildStage: (stage) => this.buildVehicleStage(session, stage),
      getNewRoot: () => session.root,
      unloadOld: (oldRoot) => this.unloadVehicle(old, oldRoot),
      beforeFadeIn: (newRoot) => this.activateVehicle(session, newRoot),
      discardNewRoot: (newRoot) => this.discardVehicleSession(session, newRoot),
    };
    const runner = new FadeSwapRunner(delegate, { maxBuildStages: 2 });
    runner.start(old.root);
    this.vehicleSwap = runner;
  }

  private updateTransitions(dt: number): void {
    this.timeBlend.update(dt);
    this.weatherLightModBlend.update(dt);
    if (this.sceneSwap?.update(dt)) {
      this.sceneSwap = null;
      this.dequeueSceneSwap();
    }
    if (this.vehicleSwap?.update(dt)) {
      this.vehicleSwap = null;
      if (this.vehicle) this.placeVehicle(this.vehicle); // FadeSwap 淡入收尾写 root.y=0——车型按 campAnchor 复位
      this.dequeueVehicleSwap();                         // （groundY≠0 场景实测偏离；T23 修复，见 T23 记录）
    }
  }

  private dequeueSceneSwap(): void {
    const pending = this.pendingSceneId;
    this.pendingSceneId = null;
    if (pending !== null && pending !== this.scene?.id) this.startSceneSwap(pending);
  }

  private dequeueVehicleSwap(): void {
    const pending = this.pendingVehicleId;
    this.pendingVehicleId = null;
    if (pending !== null && pending !== this.vehicle?.id) this.startVehicleSwap(pending);
  }

  // =========================================================================
  // 启动装配（一次性；§3.5.1——顺序：底座→地形→道具→句柄→动效→预设应用）
  // =========================================================================

  private assembleAll(next: AppState): void {
    const sceneModule = this.sceneRegistry.get(next.scene);
    const vehicleModule = this.vehicleRegistry.get(next.vehicle);

    // 场景 + 车型同步装配（三阶段同步跑完 = FadeSwap 分帧路径的同一产物结构）
    this.scene = this.assembleSceneNow(sceneModule);
    this.vehicle = this.assembleVehicleNow(vehicleModule);
    // T31 接线修复：同步装配路径此前漏登记场景/车型光照钩子与场景雾基底（仅 FadeSwap 的
    // activateScene/activateVehicle 路径登记）——默认组合首载后 SceneLightState 不达场景钩子、
    // 内饰灯钩子不被驱动、baseFog 停留在系统默认。三行与 activateScene:843-844/activateVehicle:866 同源。
    this.timeLight.setSceneHooks(sceneModule.lightHooks);
    this.timeLight.setInteriorHooks(vehicleModule.interiorLightHooks);
    this.atmosphere.setBaseFog(sceneModule.palette.baseFog);

    // 时间预设：先中性直呈（空注册表兜底），有预设即覆盖 —— 均为 blend=1，首帧不播过渡
    this.applyLightingNow(this.lastSnapshot.global, ZERO_CHANNELS, 1);
    const timePreset = this.tryGetTimePreset(next.time);
    if (timePreset) {
      this.appliedTimeId = timePreset.id;
      this.timeLight.setTimeId(timePreset.id); // T31：同上（装配路径同步登记时间维 id）
      this.applyLightingNow(timePreset.lighting, timePreset.channels, 1);
    }
    // 打磨轮次1：首装按装配时间档直接生效（无过渡可走中点；scheduler.ts:249 契约「首装」分支）
    this.setNightSilenceNow(next.time === 'night');

    // 天气预设：材质七分量即时、风力直取目标、粒子直挂、lightMod 直呈（晴朗=全中性直通）
    const weatherPreset = this.tryGetWeatherPreset(next.weather);
    if (weatherPreset) {
      this.appliedWeatherId = weatherPreset.id;
      this.activeWeatherPreset = weatherPreset;
      this.weatherMaterial.setComponentsInstant(weatherPreset.material);
      this.atmosphere.setWeatherFogMul(weatherPreset.material.fogMul);
      this.atmosphere.setCloudiness(weatherPreset.material.cloudShadow);
      this.wind.setWind(WIND_BASE_POWER * weatherPreset.windMul, { immediate: true });
      this.particles.setWeatherSet(this.liftedWeatherEntries(weatherPreset)); // T33：同 startWeatherTransition
      this.setLightModNow(weatherPreset.lightMod);
    }
  }

  /** 同步版场景装配（启动路径；与 FadeSwap 分帧路径共用 buildSceneStage，产物结构一致）。 */
  private assembleSceneNow(module: SceneModule): AssembledScene {
    const session: SceneBuildSession = {
      module,
      root: null,
      scope: null,
      rng: null,
      base: null,
      terrain: null,
      props: null,
      scheduler: null,
      emitterHandles: [],
      emitterBindings: [],
      fireAnchor: null,
      animations: [],
    };
    for (let stage = 0; stage < 3; stage++) this.buildSceneStage(session, stage);
    const root = session.root;
    if (!root || !session.terrain || !session.props || !session.scheduler || !session.scope) {
      throw new Error(`[director] 场景装配未完成：${module.id}`);
    }
    root.visible = true;
    return {
      id: module.id,
      module,
      root,
      campAnchor: session.terrain.campAnchor,
      animations: session.animations,
      scheduler: session.scheduler,
      emitterHandles: session.emitterHandles,
      emitterBindings: session.emitterBindings,
      fireAnchor: session.fireAnchor,
      cloths: session.props.cloths,
      lamps: session.props.lamps,
      scope: session.scope,
    };
  }

  /**
   * 分帧构建（stage 0 底座+地形 / 1 道具 / 2 句柄注册+动效+描边；FadeSwap t≥150ms 起每帧一帧，
   * ≤3 帧摊开——§3.7 #10「Director 分帧构建（≤3 帧）」）。
   */
  private buildSceneStage(session: SceneBuildSession, stage: number): void {
    const module = session.module;
    if (stage === 0) {
      session.scope = this.assets.openScope();
      session.root = new THREE.Group();
      session.root.name = `scene/${module.id}`;
      session.root.visible = false; // FadeSwap 淡入前不渲染
      this.engine.scene.add(session.root);
      this.weatherMaterial.attach(session.root); // 云影 quad + 反光条容器随场景根走
      session.rng = new Rng(`scene:${module.id}`);
      // BaseAssembler：统一正方形底座（形式全场景统一，仅材质/边缘按场景换，一.3）
      session.base = this.baseAssembler.build(module.palette.baseStyle);
      session.root.add(session.base.group);
      // ① 地形 + 中央营位锚点
      session.terrain = module.buildTerrain({
        root: session.root,
        assets: this.assets,
        rng: session.rng,
      });
      session.root.add(session.terrain.group);
      this.atmosphere.setSilhouetteHolder(session.base.silhouetteHolder);
      return;
    }
    if (stage === 1) {
      // ② 道具布置 + 四类句柄收集
      session.props = module.buildProps({
        root: session.root!,
        assets: this.assets,
        rng: session.rng!,
      });
      session.root!.add(session.props.group);
      return;
    }
    // stage 2：句柄注册（§3.5.1「把 cloths/lamps/emitters/weatherSurfaces 注册进公共系统」）
    const props = session.props!;
    this.weatherMaterial.register(props.weatherSurfaces);
    this.wind.register(props.cloths);
    this.breath.register(props.lamps);
    const anchorPos = session.terrain!.campAnchor.position;
    for (const spec of props.emitters) {
      // 场景发射器以营位锚点为中心（EmitterSpec 契约只带 area 尺寸，锚点由编排侧下发）
      const handle = this.particles.add(spec, { anchor: anchorPos.clone(), group: 'scene' });
      session.emitterHandles.push(handle);
      // T31⑥：spec↔handle 同序配对（调制公式按 kind 查 §7.1.3，见帧序 systems 段）
      session.emitterBindings.push({ handle, kind: spec.kind, baseRate: spec.rate, rate: spec.rate });
    }
    // T31②：P3 火光挂点发现（场景申报=name 以 `/fire-light-anchor` 结尾；docs/01 §3.9
    // 「松林篝火/避难所火堆/海崖烧烤炉」——无申报场景不占用预算位）
    session.fireAnchor = findFireLightAnchor(props.group);
    this.weatherMaterial.registerReflectionLamps(props.lamps, { groundY: anchorPos.y });
    // ③ 场景动效（EventScheduler 以场景 id 为种子——同组合可复现）
    session.scheduler = new EventScheduler(`scene:${module.id}`);
    const runtime: SceneRuntime = {
      root: session.root!,
      assets: this.assets,
      rng: session.rng!,
      wind: this.wind,
      particles: this.particles,
      breath: this.breath,
      scheduler: session.scheduler,
      camera: this.engine.camera,
    };
    session.animations.push(...module.createAnimations(runtime));
    this.outline.applyTo(session.root!, { defaultTier: 'prop' });
    session.scope?.close(); // 构建完成：停止记账（资源保持存活至卸载 release）
  }

  // =========================================================================
  // 卸载（§3.5.3：反注册 + assets 释放 + dispose；不留泄漏通路）
  // =========================================================================

  private unloadScene(scene: AssembledScene, oldRoot: THREE.Object3D): void {
    for (const animation of scene.animations) animation.dispose();
    this.wind.unregister(scene.cloths);
    this.breath.unregister(scene.lamps);
    for (const handle of scene.emitterHandles) handle.dispose();
    this.weatherMaterial.detach(); // 云影 quad/反光条容器随旧根摘除
    this.weatherMaterial.clearRegistrations(); // 天气面/反光条/雪壳全清（车型面由 activateScene 按新会话重注册）
    this.outline.removeFrom(oldRoot);
    oldRoot.removeFromParent();
    this.timeLight.releaseFireLight();
    this.fireLight = null; // T31②：挂点随场景卸载——引用复位（新场景申报后由帧序重新领取）
    scene.scope.release();
  }

  private unloadVehicle(vehicle: AssembledVehicle, oldRoot: THREE.Object3D): void {
    this.wind.unregister(vehicle.cloths);
    this.breath.unregister(vehicle.lamps);
    if (vehicle.surfaces.length > 0) this.weatherMaterial.unregister(vehicle.surfaces);
    this.outline.removeFrom(oldRoot);
    oldRoot.removeFromParent();
    vehicle.scope.release();
  }

  // =========================================================================
  // 崩溃兜底（FadeSwap 激活 throw 后孤儿根回收）：旧根此时已卸载（或卸载中途崩溃），
  // 半成品新根仍挂 scene 图且 visible=false——按构建进度幂等回收全部资源并摘出场景图，
  // 防「隐藏场景根」滞留泄漏（内存/几何/材质不释放）。错误由 FadeSwapRunner 上抛，此处不吞。
  // =========================================================================

  /** 场景会话回收（unloadScene 的半成品版：逐项按构建进度守卫，stage 未跑到的项自然为空）。 */
  private discardSceneSession(session: SceneBuildSession, root: THREE.Object3D): void {
    for (const animation of session.animations) animation.dispose();
    if (session.props) {
      this.wind.unregister(session.props.cloths);
      this.breath.unregister(session.props.lamps);
    }
    // 打磨轮次1：本会话可能已把天气面/反光条注册进系统（stage2 + activateScene 补挂路径），
    // 且反光条 mesh 为系统自建——整表清空（含 mesh 摘除释放）而非只摘 surfaces，防下次 attach
    // 后旧灯位鬼影；崩溃场景下不存在需保留的注册（车型面由下次 activateScene 重注册）。
    this.weatherMaterial.clearRegistrations();
    for (const handle of session.emitterHandles) handle.dispose();
    this.outline.removeFrom(root);
    this.weatherMaterial.detach(); // 云影 quad/反光条容器随半成品根摘除（stage0 attach 的归宿）
    root.removeFromParent();
    if (this.scene && this.scene.root === root) this.scene = null; // 激活中途崩溃：不指向已丢弃会话
    session.scope?.release(); // scope 在 stage0 即开启，可能存在则释放（引用计数归零 dispose）
  }

  /** 车型会话回收（unloadVehicle 的半成品版；车型会话无天气 attach/scheduler）。 */
  private discardVehicleSession(session: VehicleBuildSession, root: THREE.Object3D): void {
    this.wind.unregister(session.cloths);
    this.breath.unregister(session.module.interiorLightHooks.lamps);
    if (session.surfaces.length > 0) this.weatherMaterial.unregister(session.surfaces);
    this.outline.removeFrom(root);
    root.removeFromParent();
    if (this.vehicle && this.vehicle.root === root) this.vehicle = null; // 激活中途崩溃同上
    session.scope?.release();
  }

  // =========================================================================
  // 激活（FadeSwap 淡入前：立即按当前 time/weather 呈现 blend=1；§3.5.3「直接呈现完整状态」）
  // =========================================================================

  private activateScene(session: SceneBuildSession, _newRoot: THREE.Object3D): void {
    if (!session.terrain || !session.props || !session.scheduler || !session.scope || !session.root) {
      throw new Error(`[director] 场景激活时装配未完成：${session.module.id}`);
    }
    this.scene = {
      id: session.module.id,
      module: session.module,
      root: session.root,
      campAnchor: session.terrain.campAnchor,
      animations: session.animations,
      scheduler: session.scheduler,
      emitterHandles: session.emitterHandles,
      emitterBindings: session.emitterBindings,
      fireAnchor: session.fireAnchor,
      cloths: session.props.cloths,
      lamps: session.props.lamps,
      scope: session.scope,
    };
    this.timeLight.setSceneHooks(session.module.lightHooks);
    this.atmosphere.setBaseFog(session.module.palette.baseFog);
    // 打磨轮次1：新场景 scheduler 为全新实例（默认不静默）——按当前生效静默态立即接管，
    // 防夜间换场景/破晓重入时 nightSilent 事件（海鸟/松鼠）即刻出鸟；时间过渡挂起值
    // （nightSilenceArmed）不受影响，到中点后照常落在本场景 scheduler 上。
    this.setNightSilenceNow(this.nightSilenceActive);
    // 打磨轮次1修复：天气面贴花跨场景持久化。stage0 attach 已把 weatherMaterial.root 重指新根并把
    // 云影 quad/反光条容器移入新根（weatherMaterial.ts:400-407），随后 unloadScene 的 detach()
    // （director.ts:823）按重指后的 this.root 把两容器从新根摘下（weatherMaterial.ts:409-414）——
    // 贴花从此丢失；且 clearRegistrations 连带清空反光条注册（registeredLamps/strips），★T20 补偿
    // 只重注册 weatherSurfaces。此处统一补挂：attach 幂等归位两容器 + 按新场景灯位重建反光条
    // （registerReflectionLamps 对已注册灯幂等跳过，同 stage2:794 同参调用）。
    this.weatherMaterial.attach(session.root); // 云影 quad + 反光条容器归位新根（若仍在则 no-op）
    this.weatherMaterial.registerReflectionLamps(session.props.lamps, {
      groundY: session.terrain.campAnchor.position.y,
    });
    // 当前 time 立即下发（场景钩子 blend=1；天空/雾经帧汇随 apply 流出）
    this.applyLightingNow(this.lastSnapshot.global, this.lastSnapshot.channels, 1);
    if (this.vehicle) this.placeVehicle(this.vehicle); // 按新 campAnchor 重新对位（三·总则）
    if (this.vehicle && this.vehicle.surfaces.length > 0) {
      this.weatherMaterial.register(this.vehicle.surfaces); // 场景卸载 clearRegistrations 连带清空车型面——重注册
    }
    // T33 修复：天气粒子跨场景持续（FadeSwap 不重挂天气集合），锚点仍指旧场景营位——
    // 按新场景 campAnchor 重算「悬空发射锚点」（同 liftedWeatherEntries 口径）并原地重锚
    // （发射期取值、存量粒子不跟随——与 Object3D 锚点同一语义）。
    if (this.activeWeatherPreset && this.activeWeatherPreset.particles.length > 0) {
      this.particles.reanchorWeather(this.weatherAnchorBase(this.activeWeatherPreset));
    }
  }

  /**
   * 天气粒子「悬空发射锚点」基点（T45 修复②）：营位锚点 + 抬升量。
   * 抬升 = max(area.y/2 + |vel0.y|×lifetime)（各粒子 spec 取最大）——出生盒底 = 营位地面、
   * 存活末端恰触地（发射区高≈落差，docs/05 五-3 注记②自洽式）。原样锚定营位地面高度时：
   * 半数出生点在台面之下 + 雨柱与车体/构筑物同高同位（默认机位实测 91% 深度剔除 → 屏幕零雨丝）。
   */
  private weatherAnchorBase(preset: WeatherPreset): THREE.Vector3 {
    const anchor = this.scene?.campAnchor.position;
    const base = new THREE.Vector3(anchor?.x ?? 0, anchor?.y ?? 0, anchor?.z ?? 0);
    let lift = 0;
    for (const spec of preset.particles) {
      lift = Math.max(lift, spec.area.y / 2 + Math.abs(spec.vel0.y) * spec.lifetime);
    }
    base.y += lift;
    return base;
  }

  /** 天气集合条目（T45 修复②）：spec + 该 spec 的悬空锚点（多 spec 预设逐 spec 精确抬升）。 */
  private liftedWeatherEntries(preset: WeatherPreset): WeatherEmitterInput[] {
    const anchor = this.scene?.campAnchor.position;
    return preset.particles.map((spec) => {
      const fall = Math.abs(spec.vel0.y) * spec.lifetime;
      return {
        spec,
        anchor: anchor
          ? new THREE.Vector3(anchor.x, anchor.y + spec.area.y / 2 + fall, anchor.z)
          : undefined,
      };
    });
  }

  private activateVehicle(session: VehicleBuildSession, _newRoot: THREE.Object3D): void {
    if (!session.scope || !session.root) {
      throw new Error(`[director] 车型激活时装配未完成：${session.module.id}`);
    }
    this.vehicle = {
      id: session.module.id,
      module: session.module,
      root: session.root,
      cloths: session.cloths,
      surfaces: session.surfaces,
      lamps: session.module.interiorLightHooks.lamps,
      scope: session.scope,
    };
    this.timeLight.setInteriorHooks(session.module.interiorLightHooks);
    // interiorLightHooks 立即按当前时间档应用（§3.5.3 车型切换路径逐字）
    this.applyLightingNow(this.lastSnapshot.global, this.lastSnapshot.channels, 1);
  }

  // =========================================================================
  // 车型分帧构建（2 帧：0 外观+展开+对位 / 1 内饰+注册+描边）
  // =========================================================================

  private buildVehicleStage(session: VehicleBuildSession, stage: number): void {
    const module = session.module;
    if (stage === 0) {
      session.scope = this.assets.openScope();
      session.root = new THREE.Group();
      session.root.name = `vehicle/${module.id}`;
      session.root.visible = false; // FadeSwap 淡入前不渲染
      this.engine.scene.add(session.root);
      session.rng = new Rng(`vehicle:${module.id}`);
      const camp = this.currentCampSnapshot();
      const ctx = { root: session.root, camp, assets: this.assets, rng: session.rng };
      // ① 外部模型（footprint 对位依据）+ ② 展开机构（默认「已展开」交付）
      const exterior = module.buildExterior(ctx);
      session.root.add(exterior.group);
      for (const part of module.buildDeployment(ctx)) {
        if (!part.node.parent) session.root.add(part.node); // 模块已挂入 exterior 组的不重复接管
      }
      session.cloths.push(...exterior.cloths);
      session.surfaces.push(...(exterior.weatherSurfaces ?? [])); // 车顶/布顶天气挂点（T23 对齐，T17 遗留②）
      this.applyCampPlacement(session.root, camp, exterior.footprint);
      return;
    }
    // stage 1：③ 透视内饰 + 注册（cloths→Wind / interior lamps→Breath 'interior' 通道 / weatherSurfaces→WeatherMaterial）+ 描边
    const ctx = {
      root: session.root!,
      camp: this.currentCampSnapshot(),
      assets: this.assets,
      rng: session.rng!,
    };
    const interior = module.buildInterior(ctx);
    session.root!.add(interior.group);
    this.wind.register(session.cloths);
    this.breath.register(module.interiorLightHooks.lamps);
    for (const lamp of module.interiorLightHooks.lamps) this.breath.bindChannel(lamp, 'interior');
    if (session.surfaces.length > 0) this.weatherMaterial.register(session.surfaces);
    this.outline.applyTo(session.root!, { defaultTier: 'vehicle' });
    session.scope?.close(); // 构建完成：停止记账
  }

  private assembleVehicleNow(module: VehicleModule): AssembledVehicle {
    const session: VehicleBuildSession = { module, root: null, scope: null, rng: null, cloths: [], surfaces: [] };
    this.buildVehicleStage(session, 0);
    this.buildVehicleStage(session, 1);
    const root = session.root;
    if (!root || !session.scope) throw new Error(`[director] 车型装配未完成：${module.id}`);
    root.visible = true;
    return {
      id: module.id,
      module,
      root,
      cloths: session.cloths,
      surfaces: session.surfaces,
      lamps: module.interiorLightHooks.lamps,
      scope: session.scope,
    };
  }

  // =========================================================================
  // campAnchor 对位 + footprint 越界告警（docs/03 §3.0；「轻微适配」参数经 ctx.camp 下发）
  // =========================================================================

  private currentCampSnapshot(): CampAnchorSnapshot {
    const anchor = this.scene?.campAnchor;
    if (!anchor) {
      // 场景未装配（异常序）：中性营位兜底，车型构建不崩溃
      return { groundY: 0, headingRad: 0, radius: 4.0 };
    }
    return { groundY: anchor.groundY, headingRad: anchor.headingRad, radius: anchor.radius };
  }

  /** root.y=camp.groundY、rotation.y=headingRad、营位居中；footprint 外接半径>camp.radius 只告警。 */
  private applyCampPlacement(
    root: THREE.Object3D,
    camp: CampAnchorSnapshot,
    footprint: { readonly length: number; readonly width: number },
  ): void {
    const anchorPos = this.scene?.campAnchor.position;
    root.position.set(anchorPos?.x ?? 0, camp.groundY, anchorPos?.z ?? 0);
    root.rotation.y = camp.headingRad;
    const outerRadius = Math.hypot(footprint.length / 2, footprint.width / 2);
    if (outerRadius > camp.radius) {
      console.warn(
        `[vehicle] footprint exceeds camp radius：外接半径 ${outerRadius.toFixed(2)}u > ` +
          `营位半径 ${camp.radius.toFixed(2)}u（docs/03 §3.0：只告警不阻断）`,
      );
    }
  }

  /** 车型重对位（场景切换后按新 campAnchor；位置/朝向更新，footprint 告警已在构建期完成）。 */
  private placeVehicle(vehicle: AssembledVehicle): void {
    const anchor = this.scene?.campAnchor;
    if (!anchor) return;
    vehicle.root.position.set(anchor.position.x, anchor.groundY, anchor.position.z);
    vehicle.root.rotation.y = anchor.headingRad;
  }

  // =========================================================================
  // 预设取用（空注册表降级：一次性警告 + 维度跳过；注册表非空但 id 缺失照常抛错尽早暴露）
  // =========================================================================

  private tryGetTimePreset(id: string): TimePreset | null {
    if (this.timeRegistry.list().length === 0) {
      if (!this.warnedEmptyTimeRegistry) {
        this.warnedEmptyTimeRegistry = true;
        console.warn(
          '[director] timeRegistry 为空（T29 预设未落地）：时间维暂以灯架中性值运行；' +
            '预设注册后 applyState 自动经 isDefault 应用，无需改 Director/main.ts',
        );
      }
      return null;
    }
    return this.timeRegistry.get(id);
  }

  private tryGetWeatherPreset(id: string): WeatherPreset | null {
    if (this.weatherRegistry.list().length === 0) {
      if (!this.warnedEmptyWeatherRegistry) {
        this.warnedEmptyWeatherRegistry = true;
        console.warn(
          '[director] weatherRegistry 为空（T30 预设未落地）：天气维暂以晴朗中性值运行；' +
            '预设注册后 applyState 自动经 isDefault 应用，无需改 Director/main.ts',
        );
      }
      return null;
    }
    return this.weatherRegistry.get(id);
  }

  // =========================================================================
  // 应用与收尾
  // =========================================================================

  /** 时间帧应用（时间过渡/激活路径共用；快照记录供 retarget——docs/05 §4.3.5）。 */
  private applyLightingNow(params: GlobalLightParams, channels: TimeChannels, blend: number): void {
    this.timeLight.applyParams(params, channels, blend);
    this.lastSnapshot = { global: params, channels };
  }

  /**
   * 夜间自动静默直写（打磨轮次1）：nightSilent 事件（海鸟/松鼠，docs/05 §7.1.5-1/2「夜间归巢」）
   * 倒计时冻结，纸巾/光斑/双闪不受影响——scheduler.setNightSilence 契约面。首装/场景重入路径
   * 直取当前生效值；时间切换路径经 armed 于过渡中点调用（timeBlend 回调）。
   */
  private setNightSilenceNow(active: boolean): void {
    this.nightSilenceActive = active;
    this.scene?.scheduler.setNightSilence(active);
  }

  /**
   * weather.lightMod 直写（glowBoost → LightBreath 光晕叠加，docs/05 §4.4.4）。
   * T45 修复③：lightMod 只在 TimeLightSystem.applyParams 内合成生效（composeWeatherLightMod），
   * 而 applyParams 仅由时间过渡/装配/激活路径调用——天气唯一切换路径此前只存不算，
   * intensityMul/ambientMul 永不到达 rig 与天空（晴/雨 rig 强度实测逐位相等）。
   * 以当前快照立即重应用：1500ms 过渡期本口每帧被 weatherLightModBlend 调用 → 每帧合成流入，平滑无跳变。
   */
  private setLightModNow(mod: WeatherPreset['lightMod']): void {
    this.currentLightMod = {
      intensityMul: mod.intensityMul,
      ambientMul: mod.ambientMul,
      glowBoost: mod.glowBoost,
    };
    this.timeLight.setWeatherLightMod(this.currentLightMod);
    this.breath.setGlowBoost(this.currentLightMod.glowBoost);
    this.applyLightingNow(this.lastSnapshot.global, this.lastSnapshot.channels, 1);
  }

  /** 全量收尾（Engine 销毁路径）：反注册 + assets 释放 + 系统 dispose + 钩子摘除。 */
  dispose(): void {
    for (const unsub of this.unsubs) unsub();
    this.unsubs.length = 0;
    if (this.vehicle) this.unloadVehicle(this.vehicle, this.vehicle.root);
    if (this.scene) this.unloadScene(this.scene, this.scene.root);
    this.vehicle = null;
    this.scene = null;
    this.sceneSwap = null;
    this.vehicleSwap = null;
    this.timeBlend.finish();
    this.weatherLightModBlend.finish();
    this.timeLight.dispose();
    this.wind.dispose();
    this.particles.dispose();
    this.engine.scene.remove(this.particles.root);
    this.breath.dispose();
    this.atmosphere.dispose();
    this.sky.dispose();
    this.weatherMaterial.dispose();
    this.assets.disposeAll();
    this.engine.hooks.clock = null;
    this.engine.hooks.transition = null;
    this.engine.hooks.systems.length = 0;
    this.engine.hooks.scene.length = 0;
  }
}

// ---------------------------------------------------------------------------
// 局部帮手
// ---------------------------------------------------------------------------

/** 中性光照快照（与 TimeLightSystem 构造初值同口径——rig 白光强度 1 / hemi 1；空注册表兜底）。 */
function createNeutralSnapshot(): TimeLightSnapshot {
  return {
    global: {
      lightDir: new THREE.Vector3(0, 1, 0),
      lightColor: '#ffffff',
      lightIntensity: 1,
      ambientSky: '#ffffff',
      ambientGround: '#444444',
      ambientIntensity: 1,
      zenith: '#3c4e96',
      horizon: '#ff8e4f',
      skyExtra: 'duskBands',
      fogBase: 0.06,
      shadowRadius: 1,
      shadowBias: 0,
    },
    channels: ZERO_CHANNELS,
  };
}
