// docs/01-整体架构.md §3.2/§3.3.3 content/vehicles/types.ts —— VehicleModule 及配套接口（§3.6 四项逐字段落实）。T04 落点。
// 依赖纪律（§3.3.6 独立性核对表）：只 import core（registry）+ shared（rng）+ systems/handles 契约面；
// 禁止 import 场景/时间/天气注册表——落位参数经 VehicleBuildContext.camp 快照下发。
import type * as THREE from 'three';
import type { RegistryEntry } from '@/core/registry';
import type { Rng } from '@/shared/rng';
import type { ClothHandle, LampHandle, RGB, SharedAssets, WeatherSurface } from '@/systems/handles';

/** 玻璃三档静态基准档位（docs/03 §4.2.0：clear 大面积主窗 / tinted 前挡舷窗 / porthole 圆舷窗；
 * 全车窗 opacity 落 0.22–0.40 同一区间，与 docs/04 §5.5 口径一致）。 */
export const GLASS_OPACITY = { clear: 0.24, tinted: 0.4, porthole: 0.3 } as const;

/** 夜间可透视窗修正目标（applyInteriorLight 随 interiorPower 插值下限，docs/04 §5.5「降至 0.22」）。 */
export const GLASS_NIGHT_OPACITY = 0.22;

/** 场景营位锚点快照（§3.3.3「接地高度/朝向/半径」；Director 从 SceneTerrain.campAnchor 提取下发）。 */
export interface CampAnchorSnapshot {
  /** 接地高度（root.y = camp.groundY，docs/03 §3.0） */
  readonly groundY: number;
  /** 朝向（0=车头朝 −z；拖挂组合额外 +0.06rad 微调——「轻微适配」示例） */
  readonly headingRad: number;
  /** 营位可用半径（footprint 外接半径超出时 console.warn 只告警不阻断，docs/03 §3.0） */
  readonly radius: number;
}

/** 车辆接地尺寸（§3.3.3「接地长宽/轮距/车高」；营位对位与越界检查；外接半径由尺寸推导）。 */
export interface Footprint {
  /** 接地长（车头 +X 向，u≈m；如 C 型 6.4 / A 型 7.9（★半径仲裁回调）） */
  readonly length: number;
  /** 接地宽（如 C 型 2.6） */
  readonly width: number;
  /** 轮距 */
  readonly track: number;
  /** 车高 */
  readonly height: number;
}

/** 车身色带（PaintSpec.stripeSpec 项；C 型橙青双色带 / A 型藏青裙+金腰线，docs/03）。 */
export interface PaintStripe {
  /** 色带颜色 */
  readonly color: RGB;
  /** 车身 v 向区间起点 0..1 */
  readonly from: number;
  /** 车身 v 向区间终点 0..1 */
  readonly to: number;
}

/** 基础涂装 + 可选 weathering（docs/04 §3.4「PaintSpec {baseColor, stripeSpec?, textureKeys?, weathering?}」）。 */
export interface PaintSpec {
  /** 基础涂装色（奶油白 #f3ead8 / 银白 #e8ecf0+藏青裙 / 奶油×芥末 / 军绿等） */
  readonly baseColor: RGB;
  /** 色带规格（可选） */
  readonly stripeSpec?: readonly PaintStripe[];
  /** 车身贴图 key（texStripeC/texBodyA/texRetroTwoTone…，Canvas/SVG 程序化生成） */
  readonly textureKeys?: readonly string[];
  /** 末世蒙尘（默认关闭，遗留 Q2：任何组合保持干净观感） */
  readonly weathering?: boolean;
}

/** 可透视窗（内饰可见性随窗控制；玻璃卡通材质，docs/04 §3.4）。 */
export interface WindowSpec {
  /** 玻璃网格 */
  readonly mesh: THREE.Mesh;
  /** clear=主透视面（静态基准 0.24，夜间经 applyInteriorLight 随 interiorPower 降至 0.22）/tinted=前挡等弱透视 */
  readonly tint: 'clear' | 'tinted';
  /** 归属部位（front/side/rear…，调试与 TASKS 勾验用） */
  readonly label?: string;
}

/** 车型模块（§3.3.3 四项：exterior/deployment/interior/interiorLightHooks）。 */
export interface VehicleModule extends RegistryEntry {
  /** ① 外部模型：车身外观程序化建模 + 涂装通道 + 可透视窗 + 车辆布料件 */
  buildExterior(ctx: VehicleBuildContext): VehicleExterior;

  /** ② 展开机构：外拓展机构拆成可动部件，默认「已展开」交付（三·总则两个核心特征之一） */
  buildDeployment(ctx: VehicleBuildContext): readonly DeploymentPart[];

  /** ③ 透视内饰：透过车窗/帐帘清楚看到的内部陈设（3.1–3.5 内部清单逐项落点） */
  buildInterior(ctx: VehicleBuildContext): VehicleInterior;

  /** ④ 内饰灯光钩子：车内灯点集合 + 全局编排的唯一下发入口 */
  readonly interiorLightHooks: InteriorLightHooks;
}

/** 车型构建上下文（§3.3.3）。 */
export interface VehicleBuildContext {
  /** 本车型挂载点（core 已按当前场景 campAnchor 对位） */
  readonly root: THREE.Group;
  /** 接地高度/朝向/半径 →「轻微适配」（三·总则，不强制） */
  readonly camp: CampAnchorSnapshot;
  readonly assets: SharedAssets;
  readonly rng: Rng;
}

/** 车型外部产物（§3.3.3）。 */
export interface VehicleExterior {
  readonly group: THREE.Group;
  /** 接地长宽/轮距/车高（营位对位与越界检查） */
  readonly footprint: Footprint;
  /** 基础涂装 + 可选 weathering（末世蒙尘，默认关闭，见遗留 Q2） */
  readonly paint: PaintSpec;
  /** 可透视窗（内饰可见性随窗控制；玻璃卡通材质） */
  readonly windows: readonly WindowSpec[];
  /** 车辆布料件（遮阳棚/纱帘/帐帘/遮阳幕）→ WindSystem + 雨天积水下凹 */
  readonly cloths: readonly ClothHandle[];
  /** 车顶/布顶天气挂点（docs/03 §4.2 各车 weatherSurfaces=roofTop/clothTop；可选——T23 起经本字段
   * 交 Director 注册 WeatherMaterialSystem；T17 遗留②对齐，缺省视为无挂点） */
  readonly weatherSurfaces?: readonly WeatherSurface[];
}

/** 展开机构部件（§3.3.3）。 */
export interface DeploymentPart {
  readonly node: THREE.Object3D;
  /** 升顶/滑舱/遮阳棚/踏步/支撑腿/车顶帐篷/掀门… */
  readonly kind:
    | 'popTop'
    | 'slideOut'
    | 'awning'
    | 'step'
    | 'jackLeg'
    | 'roofTent'
    | 'tailgate'
    | 'other';
  /** 1 = 已展开（默认交付状态；保留数值便于日后加展开动画） */
  readonly deployAmount: number;
}

/** 车型内饰产物（§3.3.3；「细节量不得少于 C 型」经 named 与 3.1–3.5 清单逐一对应落实）。 */
export interface VehicleInterior {
  /** 与 exterior 分组，便于按 windows 管理可见性 */
  readonly group: THREE.Group;
  /** 3.1–3.5 内部清单逐项（如 nightLamp/sofa/shelf…，每车 ≥16 项，TASKS T23–T27 勾验） */
  readonly named: Readonly<Record<string, THREE.Object3D>>;
}

/** 内饰灯光钩子（§3.3.3；决策 D2：车型模块不自行读取时间）。 */
export interface InteriorLightHooks {
  /** 车内灯点（小夜灯/暖色灯带/车内串灯/帐篷 LED 灯串）→ 统一交 LightBreathSystem（7.1「呼吸明暗」落点） */
  readonly lamps: readonly LampHandle[];
  /** 唯一驱动入口：全局灯光编排按时间档下发功率与强调值 */
  applyInteriorLight(power: number, emphasis: number, blend: number): void;
}
