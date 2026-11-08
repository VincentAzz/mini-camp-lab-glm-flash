// docs/01-整体架构.md §3.2/§3.3.4 content/times/types.ts —— TimePreset（光照预设 + 装饰物语义通道，四-5）。T04 落点。
// 时间档是数据而非逻辑（§3.3.4 注记）：四档预设只写参数，「怎么变」由 TimeLightSystem + 过渡器执行。
// 依赖纪律（§3.3.6）：不 import 任何内容模块；GlobalLightParams 契约取自 systems/handles。
import type { RegistryEntry } from '@/core/registry';
import type { GlobalLightParams } from '@/systems/handles';

/** 时间注册表条目（§3.3.4 逐字）。 */
export interface TimePreset extends RegistryEntry {
  /** 全局光照：日/月方向与色温、强度、环境光、天空渐变端点、阴影参数（长投影/短投影）、雾基准（§4.3.2 定值表） */
  readonly lighting: GlobalLightParams;
  /** 语义通道：场景 lightHooks 与车型 interiorLightHooks 的统一下发值（0..1） */
  readonly channels: {
    /** 营地/装饰灯具（白天=0「灯具全部熄灭」→仅指此类，见决策 D8） */
    readonly lampPower: number;
    /** 篝火余烬（清晨 0.5，其余档 0/1 按场景解释） */
    readonly emberPower: number;
    /** 炊烟/蒸汽（白天=1） */
    readonly smokePower: number;
    /** 商业照明（清晨刚开灯/白天营业亮/黄昏初亮/夜间主角） */
    readonly shopPower: number;
    /** 车内灯功率（黄昏点亮，夜间 1） */
    readonly interiorPower: number;
    /** 车内暖光强调（夜间更高，四-4） */
    readonly interiorEmphasis: number;
  };
  /** 统一 1500（四-5「1~2 秒」区间取定值，决策 D5；常量集中 core/transition.ts，docs/00 J-D5） */
  readonly transitionMs: number;
}
