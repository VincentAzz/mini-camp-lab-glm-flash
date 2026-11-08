// docs/01-整体架构.md §3.2/§3.4 systems/handles.ts —— 内容模块 × 公共系统的唯一交汇面。T04 落点。
// 三段内容：
//   ① 四类句柄：ClothHandle / LampHandle / EmitterSpec / WeatherSurface（§3.4 逐字；M1–M4 增补字段齐备）
//   ② 跨层数据契约：RGB / GlobalLightParams（TimePreset 与 SceneLightState 共用；四套注册表彼此不
//      import，共用契约统一落本文件）
//   ③ 公共系统结构契约：SharedAssets / WindSystem / ParticleSystem / LightBreathSystem / EventScheduler
//      ——T05/T09/T10/T11/T15 的实现类必须满足同名接口；Director 以类实例注入 SceneRuntime（§3.3.2），
//      内容模块只 import 本文件，禁止 import 系统实现文件（§3.4「唯一交汇面」）。
// 禁红线：任何句柄/契约不携带网络资源引用；几何/贴图全部程序化（八.2）。
import type * as THREE from 'three';

/* ============================== ① 四类句柄（§3.4 + M1–M4） ============================== */

/**
 * 跨层颜色原语：'#rrggbb' 十六进制 sRGB（docs/02 通道定值、docs/05 各档色值均按此书写）。
 * 载入时经 convertSRGBToLinear() 转线性空间（docs/05 §4.3.5：过渡插值在线性空间进行）。
 */
export type RGB = string;

/**
 * 布料句柄 → WindSystem 统一驱动（七-5「布料统一受风力」；M1 增补字段齐备）。
 * 参数定值见 docs/05 §7.1.2 布料总表（stiffness/windFactor/sagAmp 逐布料给出）。
 */
export interface ClothHandle {
  /** 布料网格：PlaneGeometry(12×8 分段)（docs/05 §7.1.2；顶点位移在 shader，CPU 零逐顶点） */
  readonly mesh: THREE.Mesh;
  /** 允许摆动的局部轴（固定边→自由边加权的摆动轴集合） */
  readonly swayAxes: readonly ('x' | 'y' | 'z')[];
  /** 挺度 0..1，越小越易摆（天幕 0.35 / 纸巾 0.85 / 车内微风件 0.9 等，§7.1.2） */
  readonly stiffness: number;
  /** M1：风力系数，默认 1（车内布料 0.12 微风） */
  readonly windFactor?: number;
  /** M1：积水下凹幅度（m），默认 0（天幕 0.06 / A·B 棚 0.05 等，五-3） */
  readonly sagAmp?: number;
  /** M1：布檐滴水锚点（局部坐标；drip 粒子发射点，五-3「布檐最低点」） */
  readonly dripAnchors?: readonly THREE.Vector3[];
}

/** 灯点模式参数（模式专属字段均可选；定值见 docs/05 §7.1.4 灯点注册总表）。 */
export interface LampParams {
  /** 周期 s（breath 只允许 1.5/3/6 三档——RhythmClock.BREATH_PERIODS；blink 可为 1.2/2.4 等） */
  readonly period?: number;
  /** breath 呼吸深度 0..1（串灯 0.3 / 营地灯 0.55 / 车内灯 0.18） */
  readonly depth?: number;
  /** blink 占空 0..1（天线指示灯 0.5） */
  readonly duty?: number;
  /** blink 交错相位 rad（串灯 0.4 = RhythmClock.LAMP_PHASE_STEP_RAD） */
  readonly stagger?: number;
  /** rotate 角速度 rad/s（灯塔顶灯 0.25 ≈25s/圈） */
  readonly speed?: number;
  /** M2：rotate 花样（警示红灯 'rev' 双叶 / 探照灯 'sweep' 扫动） */
  readonly pattern?: 'rev' | 'sweep';
  /** sweep 摆幅 rad（探照灯 55°/45°/40° 按时间档由 lightHooks 调制） */
  readonly sweepRad?: number;
  /** M2：功率下限（售货机灯带常亮 max(shopPower, 0.7)，docs/05 §7.1.4） */
  readonly floor?: number;
}

/**
 * 灯点句柄 → LightBreathSystem + 时间编排（§3.4；M2/M4 增补齐备）。
 * 所有灯渲染 = emissive toon + additive halo sprite；真点光仅 2 个预算位（docs/05 §7.1.4）。
 */
export interface LampHandle {
  /** 灯体自发光材质（emissive×通道功率；op<0.02 时实现侧 visible=false，§4.3.3-⑤） */
  readonly emissiveMat?: THREE.MeshToonMaterial | THREE.MeshStandardMaterial;
  /** additive 光晕精灵（scale=灯径×1.6~2.2、op=0.35×lampPower×(1+0.5×glowBoost)，§4.3.3-⑧） */
  readonly halo?: THREE.Sprite;
  /** 四模式（docs/05 §7.1.4：steady/breath/blink/rotate） */
  readonly mode: 'steady' | 'breath' | 'blink' | 'rotate';
  /** 模式参数（见 LampParams） */
  readonly params: LampParams;
  /** M4：注册雨天镜面反光条（每场景 ≤6 盏近地强灯，五-3） */
  readonly castReflection?: boolean;
}

/** 粒子种类（docs/05 §7.1.3 总表 8 种）。 */
export type EmitterKind = 'rain' | 'snow' | 'steam' | 'spark' | 'mist' | 'dust' | 'leaf' | 'drip';

/**
 * 粒子发射器配置（§3.4 逐字；M3 字段明细化齐备；参数定值见 docs/05 §7.1.3 总表）。
 * WeatherPreset.particles（ParticleSpec）与场景 emitters 共用同一参数表。
 */
export interface EmitterSpec {
  /** 种类（8 种，docs/05 §7.1.3） */
  readonly kind: EmitterKind;
  /** 发射区尺寸（m，x/y/z 三向；如雨 3.4×3.4×2.4） */
  readonly area: THREE.Vector3;
  /** 平均发射速率 /s（发射相位经 RhythmClock.particleJitter ±20% 抖动，§7.1.1） */
  readonly rate: number;
  /** 单粒子存活时长 s */
  readonly lifetime: number;
  /** 初尺寸 m（→size1 渐变） */
  readonly size0: number;
  /** 终尺寸 m */
  readonly size1: number;
  /** 初速度 m/s（含方向；风漂/摆动由实现按 §7.1.3「运动」列叠加） */
  readonly vel0: THREE.Vector3;
  /** 粒子色（'#rrggbb'，如雨丝 #A8C8E8） */
  readonly color: RGB;
  /** 基础不透明度 0..1 */
  readonly opacity: number;
  /** additive 混合（雨丝/火星/光晕类 true） */
  readonly additive: boolean;
}

/** 天气预设粒子条目：与 EmitterSpec 同一参数表（docs/05 §7.1.3 单表共用）。 */
export type ParticleSpec = EmitterSpec;

/** P1：ParticleSystem 每注册一路 EmitterSpec 返回的实例句柄（§3.9；TASKS T10）。 */
export interface ParticleEmitterHandle {
  /** 炊烟/蒸汽/火星/微尘强度随语义通道逐帧调制（rate=2.2×smokePower+0.4 等，§4.3.3-⑥） */
  setRate(ratePerSecond: number): void;
  /** 注销并回收该发射器（T17 卸载编排用） */
  dispose(): void;
}

/** 天气材质作用面种类（docs/05 §4.4.2 四种做法 + 划线特例）。 */
export type WeatherSurfaceKind = 'ground' | 'roofTop' | 'clothTop' | 'linePaint';

/**
 * 天气材质挂点 → WeatherMaterialSystem（§3.4；M4 增补 snowShell 齐备）。
 * wetness/puddle/clothSag/snowCover/lineFade/cloudShadow 七分量经共享 uniform 注入。
 */
export interface WeatherSurface {
  /** 接收天气共享 uniform 的材质（WeatherMaterialSystem 按 kind 注入对应补丁） */
  readonly material: THREE.Material;
  /** 作用面种类（ground 湿润积雪 / roofTop 顶面雪壳 / clothTop 布顶雪壳 / linePaint 划线淡出） */
  readonly kind: WeatherSurfaceKind;
  /** M4：预建顶面克隆雪壳（法线外推 0.012×snowCover，visible=snowCover>0.01，五-5；
   * clothTop 的雪壳挂 ClothHandle 之下以继承布料风摆与 sag） */
  readonly snowShell?: THREE.Mesh;
}

/* ====================== ② 跨层数据契约（时间 × 场景共用，注册表零互 import） ====================== */

/** 额外天空元素包（docs/05 §4.3.2「额外天空元素」行；离散量，过渡中点切换）。 */
export type SkyExtra =
  | 'dawnBands' // 朝霞条带 ×3
  | 'dayClouds' // 少量白云条带 op 0.25
  | 'duskBands' // 晚霞条带 + horizon 之上 15%~40% 插 #5A6AA8 蓝调带
  | 'nightStarsMoon'; // 星空 900 点 + 银河带 300 暗点 + 月面 + 月晕

/**
 * 全局光照参数（docs/05 §4.3.2 四档定值表；TimePreset.lighting 与 SceneLightState.global 共用）。
 * 过渡器（core/transition.ts，T17）对其逐帧插值：颜色线性空间、方向向量 lerp、阴影只 lerp
 * radius/bias（docs/05 §4.3.5）——实现侧不得就地改写预设引用的 Vector3。
 */
export interface GlobalLightParams {
  /** 日/月主光方向（单位向量；由 §4.3.2 仰角/方位换算，如 dusk 仰角 11°/方位西 262°） */
  readonly lightDir: THREE.Vector3;
  /** 主光色（dawn #A9CFE0 青金 / day #FFF4E0 / dusk #FFB35C 金橙 / night #93A9DC 月青） */
  readonly lightColor: RGB;
  /** 主光强度（0.85 / 1.20 / 1.05 / 0.38） */
  readonly lightIntensity: number;
  /** hemisphere 天空色 */
  readonly ambientSky: RGB;
  /** hemisphere 地面色 */
  readonly ambientGround: RGB;
  /** hemisphere 强度（1.0 / 1.0 / 0.95 / 0.7） */
  readonly ambientIntensity: number;
  /** 天空渐变天顶端点（§4.3.2 zenith 行） */
  readonly zenith: RGB;
  /** 天空渐变地平端点（§4.3.2 horizon 行） */
  readonly horizon: RGB;
  /** 额外天空元素（朝霞/白云/晚霞+蓝调带/星空+月面） */
  readonly skyExtra: SkyExtra;
  /** 雾基准 fogBase（D6 入参：0.18/0.02/0.06/0.05） */
  readonly fogBase: number;
  /** 阴影软化 radius（长·软 4.0 / 短·锐 1.6 / 长·软 3.6 / 中·软 3.0；map 固定 2048，不随过渡重建） */
  readonly shadowRadius: number;
  /** 阴影 bias（与 radius 一同随过渡插值，docs/05 §4.3.5） */
  readonly shadowBias: number;
}

/* ============================ ③ 公共系统结构契约（T05/T09/T10/T11/T15 满足） ============================ */

/**
 * 程序化几何/贴图缓存与部件库契约（§3.4-10「SharedAssets」；T05 实现，引用计数）。
 * 同 id geometry/texture 全局共享；获取即 +1，release 归零即 dispose（§3.5.3 卸载路径）。
 */
export interface SharedAssets {
  /** 同 id 共享几何：首次以 build 构建，之后返回缓存；引用计数 +1 */
  geometry(id: string, build: () => THREE.BufferGeometry): THREE.BufferGeometry;
  /** 同 id 共享贴图（Canvas/SVG 程序化生成，八.2 红线）；引用计数 +1 */
  texture(id: string, build: () => THREE.Texture): THREE.Texture;
  /** 释放一次几何引用 */
  releaseGeometry(id: string): void;
  /** 释放一次贴图引用 */
  releaseTexture(id: string): void;
}

/** WindSystem 契约（§3.4-2；T09 实现：布料顶点位移/植被通道由实现侧承担）。 */
export interface WindSystem {
  /** 天气切换 setWind(windMul × 基准)（§3.5.3；指数趋近 τ=0.6s，docs/05 §7.1.2） */
  setWind(power: number): void;
  /** 当前风力目标值（场景读值用） */
  readonly power: number;
}

/** ParticleSystem 契约（§3.4-3；T10 实现：统一 GPU 发射器池，全场粒子 ≤8 draw call）。 */
export interface ParticleSystem {
  /** P1：每注册 EmitterSpec 返回实例句柄 setRate()（§3.9；天气粒子与场景发射器同入口） */
  add(spec: EmitterSpec): ParticleEmitterHandle;
}

/** LightBreathSystem 契约（§3.4-4；T11 实现：四模式执行器 + glowBoost 光晕叠加）。 */
export interface LightBreathSystem {
  /** 登记灯点（Director 把场景/车型 lamps 注册进来，§3.5.1） */
  register(lamps: readonly LampHandle[]): void;
  /** 反注册灯点（场景/车型卸载，§3.5.3） */
  unregister(lamps: readonly LampHandle[]): void;
}

/** 偶发事件描述（§3.4-9「平均间隔/概率/最短间隔，触发回调」；参数定值 docs/05 §7.1.5）。 */
export interface ScheduledEvent {
  /** 平均间隔 s（海鸟 16 / 松鼠 26 / 纸巾 11 / 光斑 9 / 双闪 20） */
  readonly meanIntervalS: number;
  /** 随机窗 ±s（海鸟 ±6 / 松鼠 ±10 / 纸巾 ±4 / 光斑 ±3 / 双闪 ±8） */
  readonly jitterS?: number;
  /** 最短间隔 s（下限保护） */
  readonly minIntervalS?: number;
  /** 触发概率 0..1（默认 1） */
  readonly probability?: number;
  /** 触发回调（海鸟掠过/松鼠窜过/纸巾轻掀/光斑鸟鸣/招牌双闪） */
  fire(): void;
}

/** 偶发事件登记句柄（T17 卸载时 cancel，防泄漏）。 */
export interface ScheduledEventHandle {
  cancel(): void;
}

/**
 * EventScheduler 契约（§3.4-9；T15 实现）。
 * 帧驱动排程，严禁 setTimeout/setInterval（docs/05 §7.1.5 标题纪律）。
 */
export interface EventScheduler {
  /** 场景动效模块注册触发项；返回可取消句柄 */
  add(event: ScheduledEvent): ScheduledEventHandle;
}
