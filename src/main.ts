// ★ 组装点（docs/01-整体架构.md §3.2/§3.5.1 逐字）：import 四套注册表 → new Engine → Director.applyState(默认组合)。
// 全项目唯一 content←core 运行时组装点（§3.1-②「组装点唯一」）。
//
// 默认组合的四个 id 不在本文件硬编码——applyState() 内部从各注册表 isDefault 读取
// （§3.5.1「Director.applyState 默认组合」+ docs/06 §6.1 状态通路）。
import { devStats, Engine } from '@/core/engine';
import { Director } from '@/core/director';
import { Registry } from '@/core/registry';
import type { TimePreset } from '@/content/times/types';
import type { WeatherPreset } from '@/content/weathers/types';
import { sceneRegistry } from '@/content/scenes/registry';
import { vehicleRegistry } from '@/content/vehicles/registry';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) {
  throw new Error('index.html 缺少 #app 挂载点');
}

const engine = new Engine(app, { background: '#0e1520' });

// 时间/天气注册表：文件本体与四档/五档正式预设数据由 T29/T30 落地 export（content/times/registry.ts
// 与 content/weathers/registry.ts 现为 T01 占位注释、无 export）。此处先注入空注册表——Director 对
// 空表一次性告警并以中性光照/晴朗基准运行；T29/T30 完成后把下面两行换成
// `import { timeRegistry } from '@/content/times/registry'` / `import { weatherRegistry } from '@/content/weathers/registry'`
// 即接入全链路（applyState 经 isDefault 自动取档，Director/main 无其它改动）。
const timeRegistry = new Registry<TimePreset>(); // ← T29：替换为注册表 import
const weatherRegistry = new Registry<WeatherPreset>(); // ← T30：替换为注册表 import

const director = new Director({
  engine,
  sceneRegistry,
  vehicleRegistry,
  timeRegistry,
  weatherRegistry,
});
director.start();
// 默认组合：海崖 · C型 · 黄昏 · 晴朗——id 由 sceneRegistry/vehicleRegistry 的 isDefault 桩条目给出；
// time/weather 两维待 T29/T30 注册后自动生效（空表 → Director 一次性告警 + 中性值直呈，首帧不播过渡）。
director.applyState();
engine.start();

// DEV 专属：控制台可直接检查 engine/渲染计数/编排器（import.meta.env.DEV 保证不进产物）
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__MINI_CAMP_DEV__ = {
    engine,
    stats: devStats,
    director,
  };
}
