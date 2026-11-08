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
  FadeSwapRunner,
  TimeBlendController,
  WeatherLightModBlend,
  WEATHER_TRANSITION_MS,
  type FadeSwapDelegate,
  type TimeLightSnapshot,
} from '@/core/transition';
import { RhythmClock } from '@/systems/clock';
import { WindSystem, windUniforms } from '@/systems/wind';
import { ParticleSystem } from '@/systems/particles';
import { LightBreathSystem } from '@/systems/lightBreath';
import { TimeLightSystem, ZERO_CHANNELS, type TimeChannels } from '@/systems/timeLight';
import { WeatherMaterialSystem } from '@/systems/weatherMaterial';
import { AtmosphereSystem } from '@/systems/atmosphere';
import { EventScheduler } from '@/systems/scheduler';
import { OutlineSystem } from '@/render/outline';
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
  private readonly outline = new OutlineSystem();
  private readonly baseAssembler: BaseAssembler;
  private readonly assets = new RefCountedAssets();

  // —— 过渡状态机（机制在 core/transition.ts）——
  private readonly timeBlend = new TimeBlendController({
    applyTimeFrame: (params, channels, blend) => {
      this.applyLightingNow(params, channels, blend);
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
    );
    // ④ 场景帧驱动：lightHooks.update? + SceneAnimation[]
    this.engine.hooks.scene.push((dt, elapsed) => {
      const current = this.scene;
      if (!current) return;
      current.module.lightHooks.update?.(dt, elapsed);
      for (const animation of current.animations) animation.update(dt, elapsed);
    });

    // 全局灯架/雾挂载（跨场景常驻，§3.4-5/§3.4-8）
    this.timeLight.attach(this.engine.scene);
    this.atmosphere.attach(this.engine.scene);
    this.engine.scene.add(this.particles.root);
    this.weatherMaterial.setCamera(this.engine.camera);
    // 时间帧汇：天空端点/雾基准 → AtmosphereSystem（§3.4-5 输出面）
    this.timeLight.setFrameSink((frame) => {
      this.atmosphere.setSkyColors(frame.sky.zenith, frame.sky.horizon);
      this.atmosphere.setTimeFogBase(frame.fogBase);
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
          // retarget：以当前插值中间态为新起点（docs/05 §4.3.5「中途改档不跳变」）
          this.timeBlend.start(preset, this.lastSnapshot);
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
    this.particles.setWeatherSet(preset.particles); // 旧集合 0.5s 淡出+新集合淡入（§4.4.3）
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

    // 时间预设：先中性直呈（空注册表兜底），有预设即覆盖 —— 均为 blend=1，首帧不播过渡
    this.applyLightingNow(this.lastSnapshot.global, ZERO_CHANNELS, 1);
    const timePreset = this.tryGetTimePreset(next.time);
    if (timePreset) {
      this.appliedTimeId = timePreset.id;
      this.applyLightingNow(timePreset.lighting, timePreset.channels, 1);
    }

    // 天气预设：材质七分量即时、风力直取目标、粒子直挂、lightMod 直呈（晴朗=全中性直通）
    const weatherPreset = this.tryGetWeatherPreset(next.weather);
    if (weatherPreset) {
      this.appliedWeatherId = weatherPreset.id;
      this.weatherMaterial.setComponentsInstant(weatherPreset.material);
      this.atmosphere.setWeatherFogMul(weatherPreset.material.fogMul);
      this.atmosphere.setCloudiness(weatherPreset.material.cloudShadow);
      this.wind.setWind(WIND_BASE_POWER * weatherPreset.windMul, { immediate: true });
      this.particles.setWeatherSet(weatherPreset.particles);
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
      session.emitterHandles.push(
        this.particles.add(spec, { anchor: anchorPos.clone(), group: 'scene' }),
      );
    }
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
      cloths: session.props.cloths,
      lamps: session.props.lamps,
      scope: session.scope,
    };
    this.timeLight.setSceneHooks(session.module.lightHooks);
    this.atmosphere.setBaseFog(session.module.palette.baseFog);
    // 当前 time 立即下发（场景钩子 blend=1；天空/雾经帧汇随 apply 流出）
    this.applyLightingNow(this.lastSnapshot.global, this.lastSnapshot.channels, 1);
    if (this.vehicle) this.placeVehicle(this.vehicle); // 按新 campAnchor 重新对位（三·总则）
    if (this.vehicle && this.vehicle.surfaces.length > 0) {
      this.weatherMaterial.register(this.vehicle.surfaces); // 场景卸载 clearRegistrations 连带清空车型面——重注册
    }
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

  /** weather.lightMod 直写（glowBoost → LightBreath 光晕叠加，docs/05 §4.4.4）。 */
  private setLightModNow(mod: WeatherPreset['lightMod']): void {
    this.currentLightMod = {
      intensityMul: mod.intensityMul,
      ambientMul: mod.ambientMul,
      glowBoost: mod.glowBoost,
    };
    this.timeLight.setWeatherLightMod(this.currentLightMod);
    this.breath.setGlowBoost(this.currentLightMod.glowBoost);
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
