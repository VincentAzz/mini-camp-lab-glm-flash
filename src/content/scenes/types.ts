// docs/01-整体架构.md §3.2/§3.3.2 content/scenes/types.ts —— SceneModule 及配套接口（§2.5 五部分逐字段落实）。T04 落点。
// 依赖纪律（§3.3.6 独立性核对表）：只 import core（registry/state）+ shared（rng）+ systems/handles 契约面；
// 禁止 import 车型/时间/天气注册表——跨维度效应一律经 Director 与语义通道中转。
import type * as THREE from 'three';
import type { RegistryEntry } from '@/core/registry';
import type { TimeId, WeatherId } from '@/core/state';
import type { Rng } from '@/shared/rng';
import type {
  ClothHandle,
  EmitterSpec,
  EventScheduler,
  GlobalLightParams,
  LampHandle,
  LightBreathSystem,
  ParticleSystem,
  RGB,
  SharedAssets,
  WeatherSurface,
  WindSystem,
} from '@/systems/handles';

/**
 * 统一底座样式（J1 五字段：topTheme/edgeMatId/rimDecal/skirtLayers/silhouette）。
 * 定值见 docs/02 §4.1.0 差异表；T07 BaseAssembler 按 spec 只换材质/边缘/层数，形式全场景统一（一.3）。
 */
export interface BaseStyleSpec {
  /** 台面主题材质 id：'lawn'/'gravel'/'crackedConcrete'/'asphaltLot' */
  readonly topTheme: string;
  /** 台缘剖面材质 id（岩层三条沉积带/根系土层/混凝土毛面/路缘石） */
  readonly edgeMatId: string;
  /** 台缘装饰贴花 id（黄黑警示斜纹（四角）…；无则 null） */
  readonly rimDecal: string | null;
  /** 剖面阶梯层数（0/1；对应下沉量由场景地形自带，如海面下沉 −2.6） */
  readonly skirtLayers: number;
  /** 后缘剪影板 id（'coast'/'mountains'/'bridge+skyline'；无则 null） */
  readonly silhouette: string | null;
}

/** 场景模块（§3.3.2 五部分：terrain/props/animations/palette/lightHooks）。 */
export interface SceneModule extends RegistryEntry {
  /** ① 地形：底座之上的大地形（崖体/溪流/碎石地/公路/划线车位…）+ 中央营位锚点 */
  buildTerrain(ctx: SceneBuildContext): SceneTerrain;

  /** ② 道具布置：2.1–2.4 元素清单逐组建到这里，并交出四类句柄 */
  buildProps(ctx: SceneBuildContext): SceneProps;

  /** ③ 场景动效：7.1–7.4 逐项落在这里（布料/粒子/灯点只交句柄与配置，见决策 D3） */
  createAnimations(runtime: SceneRuntime): readonly SceneAnimation[];

  /** ④ 色彩基调：场景固有色彩通道（再被时间/天气调制）+ 底座样式 + 固有雾基底 */
  readonly palette: ScenePalette;

  /** ⑤ 光照钩子：把语义光照通道翻译成本场景灯点与装饰物状态的唯一入口 */
  readonly lightHooks: SceneLightHooks;
}

/** 场景构建上下文（§3.3.2）。 */
export interface SceneBuildContext {
  /** 本场景挂载点（core 创建，统一底座已由 BaseAssembler 就位） */
  readonly root: THREE.Group;
  /** 程序化几何/贴图缓存与部件库（引用计数，§3.7） */
  readonly assets: SharedAssets;
  /** 以场景 id 为种子（同组合视觉可复现） */
  readonly rng: Rng;
}

/** 场景地形产物（§3.3.2）。 */
export interface SceneTerrain {
  readonly group: THREE.Group;
  /** 中央营位锚点：任何车型停任何场景的唯一落位依据（三·总则）；定值见 docs/02 §4.1.0 */
  readonly campAnchor: {
    /** 底座视觉中心（2.1–2.4 均要求车辆居中） */
    readonly position: THREE.Vector3;
    /** 默认朝向（车型可轻微适配，三·总则；0=车头朝 −z） */
    readonly headingRad: number;
    /** 营位地面高度（车型接地高度适配） */
    readonly groundY: number;
    /** 营位可用半径（footprint 越界即告警，不阻断） */
    readonly radius: number;
  };
}

/** 场景道具产物：具名道具 + 四类句柄（§3.3.2）。 */
export interface SceneProps {
  readonly group: THREE.Group;
  /** 具名道具：装饰物状态切换的取用点（野餐垫/桌椅/帆船/送货小车/早餐餐具…） */
  readonly named: Readonly<Record<string, THREE.Object3D>>;
  /** 布料句柄 → WindSystem 统一驱动（天幕/晾晒毛巾/小旗…，七-5） */
  readonly cloths: readonly ClothHandle[];
  /** 灯点句柄 → LightBreathSystem + 时间编排（串灯/营地灯/灯塔/灯箱/售货机灯带/探照灯/警示红灯） */
  readonly lamps: readonly LampHandle[];
  /** 粒子发射器配置 → ParticleSystem（蒸汽/火星/晨雾/微尘/落叶/屋檐滴水） */
  readonly emitters: readonly EmitterSpec[];
  /** 天气材质挂点 → WeatherMaterialSystem（地面湿润/积雪/顶面积雪/布料下凹的作用面） */
  readonly weatherSurfaces: readonly WeatherSurface[];
}

/** 场景动效条目（§3.3.2）：偶发型动效内部用 EventScheduler，不自行 setTimeout。 */
export interface SceneAnimation {
  update(dt: number, elapsed: number): void;
  dispose(): void;
}

/** 场景色彩基调（§3.3.2）。 */
export interface ScenePalette {
  /** 场景固有具名色彩通道（如 sea/foliage/concrete/asphalt）：时间与天气只调制通道，不触碰具体材质 */
  readonly colorChannels: Readonly<Record<string, RGB>>;
  /** 底座样式：仅材质与边缘处理差异，形式由 BaseAssembler 统一（一.3） */
  readonly baseStyle: BaseStyleSpec;
  /** 场景固有雾/云基底（松林晨雾偏高）：与天气雾系数单通道合成（决策 D6），0..1 */
  readonly baseFog: number;
}

/** 语义光照状态（时间预设给出 → 天气修正 → 过渡器插值后下发，§3.3.2/§3.5.3）。 */
export interface SceneLightState {
  readonly time: TimeId;
  readonly weather: WeatherId;
  /** 语义灯效通道（0..1）：营地/装饰灯具总功率（清晨≈0.15「将熄未熄」，白天=0，黄昏/夜间=1） */
  readonly lampPower: number;
  /** 篝火余烬（清晨 0.5 → 白天 0） */
  readonly emberPower: number;
  /** 炊烟/蒸汽等「白天活动」细节（四-2） */
  readonly smokePower: number;
  /** 商业照明通道：灯箱/售货机灯带（决策 D8，四-1「刚开灯」与四-2「灯具全熄」分流） */
  readonly shopPower: number;
  /** 车内暖光对车外环境的衬光（不驱动车内灯本体，见决策 D2；=interiorPower 派生，§4.3.2） */
  readonly interiorGlow: number;
  /** 合成雾密度（AtmosphereSystem 已合成） */
  readonly fogDensity: number;
  /** 日/月方向与色、环境光、天空渐变参数、阴影参数 */
  readonly global: GlobalLightParams;
}

/** 场景光照钩子（§3.3.2）。 */
export interface SceneLightHooks {
  /** 唯一入口：灯点开关/明暗、装饰物状态（帆船位置/早餐餐具/探照灯扫动）随时间与天气变化；blend∈[0,1] */
  applyLighting(state: SceneLightState, blend: number): void;
  /** 可选：句柄表达不了的每帧细粒度驱动（如帆船「刚刚出海」的位移插值） */
  update?(dt: number, elapsed: number): void;
}

/** 场景运行时（§3.3.2）：构建上下文 + 公共系统实例与相机（系统实例由 Director 注入，§3.5.1）。 */
export interface SceneRuntime extends SceneBuildContext {
  readonly wind: WindSystem;
  readonly particles: ParticleSystem;
  readonly breath: LightBreathSystem;
  readonly scheduler: EventScheduler;
  /** 仅云带等 billboard 需要 */
  readonly camera: THREE.PerspectiveCamera;
}
