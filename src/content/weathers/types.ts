// docs/01-整体架构.md §3.2/§3.3.5 content/weathers/types.ts —— WeatherPreset（光照修正 + 粒子 + 材质状态，五·总则）。T04 落点。
// 五档预设纯数据（§3.3.6）：不 import 任何内容模块；粒子契约 ParticleSpec 取自 systems/handles。
import type { RegistryEntry } from '@/core/registry';
import type { ParticleSpec } from '@/systems/handles';

/** 天气注册表条目（§3.3.5 逐字；定值总表 docs/05 §4.4.1）。 */
export interface WeatherPreset extends RegistryEntry {
  /** 要素① 光照强度修正：乘到时间光照预设上（夜间浓雾 = 更暗 + glowBoost 更强光晕，五-6） */
  readonly lightMod: {
    /** 主光强度系数 */
    readonly intensityMul: number;
    /** 环境光系数 */
    readonly ambientMul: number;
    /** 光晕增强（浓雾最高） */
    readonly glowBoost: number;
  };
  /** 要素② 粒子：雨丝/雪花/雾霭配置；空数组 = 晴朗基准（五-1） */
  readonly particles: readonly ParticleSpec[];
  /** 要素③ 材质状态：全部经过渡器插值后写入共享 uniform（WeatherMaterialSystem 消费） */
  readonly material: {
    /** 地面湿润反光（夜间灯光拉出彩色反光，五-3） */
    readonly wetness: number;
    /** 水洼涟漪强度 */
    readonly puddle: number;
    /** 天幕/遮阳棚积水微微下凹（五-3） */
    readonly clothSag: number;
    /** 屋顶/天幕/树枝/护栏/桌椅顶部/地面薄雪（五-5） */
    readonly snowCover: number;
    /** 服务区车位划线若隐若现（五-5 特例，作用于地面划线贴图） */
    readonly lineFade: number;
    /** 雾系数（与场景基底/时间基准单通道合成，决策 D6） */
    readonly fogMul: number;
    /** 云影在地面缓慢移动（五-2） */
    readonly cloudShadow: number;
  };
  /** 风力系数（多云略增 → WindSystem，七.5） */
  readonly windMul: number;
  /** 1500（五-6 与四-5 同标准，决策 D5；常量集中 core/transition.ts） */
  readonly transitionMs: number;
}
