// docs/01-整体架构.md §3.2 ui/icons.ts —— 内联 SVG 图标程序化生成（零第三方图标依赖，决策 D7）；T35 落点。
// docs/06 §6.2「图标（ui/icons.ts，D7）」逐条：零图标包零字体零图片资产；统一 viewBox="0 0 24 24"、
// stroke 1.6、round；旋转对称图形用循环生成（iconSun 光芒循环 / iconSnowflake 六臂分叉循环）；
// 21 枚清单：场景 4 + 车型 5 + 时间 4 + 天气 5 + UI 3；全部不含人物/人形（一.6 对 UI 同样适用）。
// 纯字符串工厂：本文件零 import / 零 DOM / 零 fetch（六.1 红线「运行时不联网」），可无头导入核验。
//
// 未登记 id 的回退：dot()（中性六角点）不在 21 枚清单内——只为「注册表新增一行按钮自动出现」
// （§3.1-④ 登记即被识别）提供占位图形，ControlPanel 经 iconFor() 取用。

/** 21 枚图标名（与 docs/06 §6.2 清单一一对应）。 */
export type IconName =
  // 场景 4：崖体波浪 / 三层树冠 / 瞭望塔 / 加油机
  | 'seacliff'
  | 'pineforest'
  | 'watchtower'
  | 'fuelPump'
  // 车型 5：C 凸头侧影 / 长方大巴 / 皮卡+拖挂胶囊 / 面包车+冲浪板 / 皮卡+车顶帐篷
  | 'classC'
  | 'classA'
  | 'trailerRig'
  | 'classB'
  | 'overlandTruck'
  // 时间 4：半轮太阳+薄雾 / 太阳 / 半轮夕阳+波浪 / 月牙+星
  | 'dawn'
  | 'day'
  | 'dusk'
  | 'night'
  // 天气 5：太阳(r 3.6 与 day 区分) / 云朵 / 云+雨丝 / 三条错位横线 / 雪花
  | 'clear'
  | 'cloudy'
  | 'rain'
  | 'fog'
  | 'snow'
  // UI 3：眼睛 / 眼睛加斜杠 / 收起折角
  | 'eye'
  | 'eyeOff'
  | 'fold';

/** 统一 SVG 外壳（§6.2：viewBox 0 0 24 24 / stroke 1.6 / round；fill none，颜色走 currentColor）。 */
function svg(inner: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" ` +
    `stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" ` +
    `aria-hidden="true" focusable="false">${inner}</svg>`
  );
}

/** 坐标数字统一两位小数（去掉拖尾 0），保证产物稳定可快照。 */
function n(v: number): string {
  return Number(v.toFixed(2)).toString();
}

/**
 * 太阳光芒循环生成（§6.2「iconSun(r,rays) 8 道光芒循环」）：
 * 圆盘半径 r + rays 道由内半径 r+1.7 到外半径 r+3.6 的放射线。
 */
function sunInner(r: number, rays: number): string {
  const parts: string[] = [`<circle cx="12" cy="12" r="${n(r)}"/>`];
  for (let i = 0; i < rays; i += 1) {
    const a = (i * 2 * Math.PI) / rays - Math.PI / 2;
    parts.push(
      `<line x1="${n(12 + Math.cos(a) * (r + 1.7))}" y1="${n(12 + Math.sin(a) * (r + 1.7))}" ` +
        `x2="${n(12 + Math.cos(a) * (r + 3.6))}" y2="${n(12 + Math.sin(a) * (r + 3.6))}"/>`,
    );
  }
  return parts.join('');
}

/**
 * 雪花六臂分叉循环生成（§6.2「iconSnowflake(arms) 6 臂分叉循环」）：
 * 每臂主线 + 在 r=5.6 处两枚 ±0.75rad 分叉。
 */
function snowflakeInner(arms: number): string {
  const parts: string[] = [];
  for (let i = 0; i < arms; i += 1) {
    const a = (i * 2 * Math.PI) / arms - Math.PI / 2;
    parts.push(
      `<line x1="${n(12 + Math.cos(a) * 2.1)}" y1="${n(12 + Math.sin(a) * 2.1)}" ` +
        `x2="${n(12 + Math.cos(a) * 9.4)}" y2="${n(12 + Math.sin(a) * 9.4)}"/>`,
    );
    for (const side of [-1, 1] as const) {
      const b = a + side * 0.75;
      const bx = 12 + Math.cos(a) * 5.6;
      const by = 12 + Math.sin(a) * 5.6;
      parts.push(
        `<line x1="${n(bx)}" y1="${n(by)}" ` +
          `x2="${n(bx + Math.cos(b) * 2.9)}" y2="${n(by + Math.sin(b) * 2.9)}"/>`,
      );
    }
  }
  return parts.join('');
}

/** 半轮太阳（上半圆弧 + 地平线；dawn/dusk 共用形体，配饰不同）。 */
function halfSunInner(cy: number): string {
  return `<path d="M8.4 ${n(cy)}a3.6 3.6 0 0 1 7.2 0"/><line x1="4.2" y1="${n(cy)}" x2="19.8" y2="${n(cy)}"/>`;
}

/** 波浪线（dusk 配饰；两条错位）。 */
function wavesInner(y1: number, y2: number): string {
  const wave = (y: number) =>
    `<path d="M5.2 ${n(y)}c1.2-1.15 2.45-1.15 3.65 0 1.2 1.15 2.45 1.15 3.65 0 1.2-1.15 2.45-1.15 3.65 0"/>`;
  return wave(y1) + wave(y2);
}

/** 薄雾线（dawn 配饰；两条水平直线与 dusk 波浪区分）。 */
function mistInner(): string {
  return '<line x1="5.2" y1="16.6" x2="18.8" y2="16.6"/><line x1="7.4" y1="19.6" x2="16.6" y2="19.6"/>';
}

/** 云朵（cloudy/rain 共用云体；rain 抬高让位雨丝）。 */
function cloudInner(lift: number): string {
  const y = (v: number) => n(v - lift);
  return (
    `<path d="M7.1 ${y(17.6)}h9.7a3.25 3.25 0 0 0 .55-6.45 4.9 4.9 0 0 0-9.45-1.2 3.7 3.7 0 0 0-.8 7.65z"/>`
  );
}

/** 车轮（车型侧影通用；r 为半径）。 */
function wheel(cx: number, cy: number, r: number): string {
  return `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}"/>`;
}

/* —— 21 枚本体（键名 = IconName）—— */

const INNER: Record<IconName, string> = {
  // 场景 4 ————————————————————————————————————————————————
  // 崖体波浪：左崖折面（两条沉积阶）+ 右侧两道波浪
  seacliff:
    '<path d="M6 20.4V5.2l3.6 2.6-1 3.4 2 2-.9 7.2"/>' +
    '<path d="M13.6 15.2c1.25-1.2 2.55-1.2 3.8 0 1.25 1.2 2.55 1.2 3.8 0"/>' +
    '<path d="M13.6 19.4c1.25-1.2 2.55-1.2 3.8 0 1.25 1.2 2.55 1.2 3.8 0"/>',
  // 三层树冠：三层递宽杉冠 + 短树干
  pineforest:
    '<path d="M7.6 10.4 12 5.2l4.4 5.2"/>' +
    '<path d="M6.2 14.6 12 8.9l5.8 5.7"/>' +
    '<path d="M4.8 19 12 12.3 19.2 19"/>' +
    '<line x1="12" y1="19" x2="12" y2="21.4"/>',
  // 瞭望塔：人字顶 + 塔台 + 收分双腿 + 斜撑（无人形）
  watchtower:
    '<path d="M7.2 7.4 12 4l4.8 3.4"/>' +
    '<line x1="8.1" y1="7.4" x2="8.1" y2="10.8"/><line x1="15.9" y1="7.4" x2="15.9" y2="10.8"/>' +
    '<line x1="5.6" y1="10.8" x2="18.4" y2="10.8"/>' +
    '<path d="M9.4 10.8 8.4 20.2M14.6 10.8l1 9.4"/>' +
    '<path d="M9.1 16.4l5.8-3.2"/>',
  // 加油机：机身 + 屏面 + 底座 + 输油管回头
  fuelPump:
    '<path d="M5.4 20.4V6.2a1.9 1.9 0 0 1 1.9-1.9h5.4a1.9 1.9 0 0 1 1.9 1.9v14.2"/>' +
    '<line x1="3.8" y1="20.4" x2="16.4" y2="20.4"/>' +
    '<path d="M7.6 7.4h5v4.2h-5z"/>' +
    '<path d="M14.6 9.2h1.7a2.3 2.3 0 0 1 2.3 2.3v5a1.55 1.55 0 0 1-3.1 0v-1.2"/>',

  // 车型 5 ————————————————————————————————————————————————
  // C 凸头侧影：前部凸头舱（左侧高箱）+ 低后厢 + 双轮
  classC:
    '<path d="M4.4 17V6.7a1.2 1.2 0 0 1 1.2-1.2h4.6a1.2 1.2 0 0 1 1.2 1.2V8.9h7.1a1.5 1.5 0 0 1 1.5 1.5V17"/>' +
    '<line x1="4.4" y1="17" x2="20.1" y2="17"/>' +
    '<line x1="4.4" y1="12.4" x2="11.4" y2="12.4"/>' +
    wheel(7.6, 17, 2) + wheel(16.6, 17, 2),
  // 长方大巴：贯通侧窗带长方体 + 双轮
  classA:
    '<path d="M3 15.6V8.1A1.6 1.6 0 0 1 4.6 6.5h14.8A1.6 1.6 0 0 1 21 8.1v7.5"/>' +
    '<line x1="3" y1="15.6" x2="21" y2="15.6"/>' +
    '<line x1="3" y1="10.9" x2="21" y2="10.9"/>' +
    wheel(7.3, 16.9, 1.8) + wheel(16.7, 16.9, 1.8),
  // 皮卡+拖挂胶囊：左胶囊拖挂 + 挂钩 + 右皮卡（D4 单模块双主体）
  trailerRig:
    '<rect x="2.4" y="9.2" width="10.2" height="6.4" rx="3.2"/>' +
    '<line x1="12.6" y1="12.4" x2="15" y2="12.4"/>' +
    '<path d="M15 15.6V9.7a1.2 1.2 0 0 1 1.2-1.2h2.1l2 3h.4a1.5 1.5 0 0 1 1.5 1.5v2.6"/>' +
    '<line x1="15" y1="15.6" x2="22.2" y2="15.6"/>' +
    wheel(5.4, 17.1, 1.8) + wheel(18.6, 17.1, 1.8),
  // 面包车+冲浪板：圆润车体 + 车顶斜置冲浪板（粗圆头线）
  classB:
    '<path d="M3.6 16.4v-4.6a2 2 0 0 1 2-2h12.8a2 2 0 0 1 2 2v4.6"/>' +
    '<line x1="3.6" y1="16.4" x2="20.4" y2="16.4"/>' +
    '<path d="M6.2 8.6 16.9 5.6" stroke-width="2.3"/>' +
    wheel(7.4, 17.9, 1.8) + wheel(16.6, 17.9, 1.8),
  // 皮卡+车顶帐篷：单排皮卡 + 驾驶室顶帐篷壳 + 爬梯
  overlandTruck:
    '<path d="M3.4 15.8v-3.6A1.3 1.3 0 0 1 4.7 10.9h3.6V7.9a1.2 1.2 0 0 1 1.2-1.2h3.2a1.2 1.2 0 0 1 1.2 1.2v3h6a1.5 1.5 0 0 1 1.5 1.5v3.4"/>' +
    '<line x1="3.4" y1="15.8" x2="21.4" y2="15.8"/>' +
    '<path d="M6 7.6V5.5a.95.95 0 0 1 .95-.95h5.3a.95.95 0 0 1 .95.95v2.1"/>' +
    '<line x1="11.6" y1="7.6" x2="12.7" y2="10.9"/>' +
    wheel(6.8, 17.2, 1.8) + wheel(17.8, 17.2, 1.8),

  // 时间 4 ————————————————————————————————————————————————
  // 半轮太阳 + 薄雾（清晨）
  dawn: halfSunInner(12.6) + mistInner(),
  // 太阳（白天）：8 道光芒循环
  day: sunInner(3.0, 8),
  // 半轮夕阳 + 波浪（黄昏）
  dusk: halfSunInner(12.6) + wavesInner(16.8, 20.1),
  // 月牙 + 星（夜间）
  night:
    '<path d="M19.2 13.9A7.3 7.3 0 1 1 10 4.4a6 6 0 0 0 9.2 9.5z"/>' +
    '<path d="M17.9 4.4l.62 1.5 1.5.62-1.5.62-.62 1.5-.62-1.5-1.5-.62 1.5-.62z"/>',

  // 天气 5 ————————————————————————————————————————————————
  // 太阳 r 3.6（无光芒，与 day 区分）
  clear: '<circle cx="12" cy="12" r="3.6"/>',
  // 云朵
  cloudy: cloudInner(0),
  // 云 + 雨丝（三道错位斜线）
  rain:
    cloudInner(2.4) +
    '<line x1="8.4" y1="18.2" x2="7.5" y2="21"/>' +
    '<line x1="12.4" y1="18.2" x2="11.5" y2="21"/>' +
    '<line x1="16.4" y1="18.2" x2="15.5" y2="21"/>',
  // 三条错位横线（浓雾）
  fog:
    '<line x1="4.4" y1="8.6" x2="15.4" y2="8.6"/>' +
    '<line x1="8.6" y1="12.6" x2="19.6" y2="12.6"/>' +
    '<line x1="5.6" y1="16.6" x2="14.6" y2="16.6"/>',
  // 雪花：六臂分叉循环
  snow: snowflakeInner(6),

  // UI 3 ———————————————————————————————————————————————————
  // 眼睛（隐藏钮：当前可见）
  eye:
    '<path d="M2.6 12S6.2 5.9 12 5.9 21.4 12 21.4 12 17.8 18.1 12 18.1 2.6 12 2.6 12z"/>' +
    '<circle cx="12" cy="12" r="2.8"/>',
  // 眼睛加斜杠（ghost 把手：当前隐藏）
  eyeOff:
    '<path d="M2.6 12S6.2 5.9 12 5.9 21.4 12 21.4 12 17.8 18.1 12 18.1 2.6 12 2.6 12z"/>' +
    '<circle cx="12" cy="12" r="2.8"/>' +
    '<line x1="4.6" y1="4.6" x2="19.4" y2="19.4"/>',
  // 收起折角：面板收起为页签条（chevron 落入底栏）
  fold: '<path d="M6.2 8.6 12 14.2l5.8-5.6"/><line x1="4.6" y1="18.6" x2="19.4" y2="18.6"/>',
};

/** 21 枚导出（键序稳定，供无头核验计数）。 */
export const ICONS: Readonly<Record<IconName, string>> = Object.fromEntries(
  (Object.keys(INNER) as IconName[]).map((name) => [name, svg(INNER[name])]),
) as Readonly<Record<IconName, string>>;

/** 21 枚名单（docs/06 §6.2 清单自检用）。 */
export const ICON_NAMES: readonly IconName[] = Object.keys(INNER) as IconName[];

/** 回退图形（中性六角点）：未配图标的登记条目仍能出按钮（§3.1-④ 登记即被识别）。 */
export const ICON_FALLBACK: string = svg('<path d="M12 4.2l6.7 3.9v7.8L12 19.8l-6.7-3.9V8.1z"/>');

/** 按图标名取 SVG；未知名回退六角点（不抛错——UI 枚举通路不允许因装饰件中断）。 */
export function icon(name: string): string {
  return (ICONS as Record<string, string>)[name] ?? ICON_FALLBACK;
}
