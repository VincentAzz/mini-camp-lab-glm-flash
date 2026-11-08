// ★ 组装点（docs/01-整体架构.md §3.2/§3.5.1 逐字）：import 四套注册表 → new Engine → Director.applyState(默认组合)。
// 全项目唯一 content←core 运行时组装点（§3.1-②「组装点唯一」）。
//
// 默认组合的四个 id 不在本文件硬编码——applyState() 内部从各注册表 isDefault 读取
// （§3.5.1「Director.applyState 默认组合」+ docs/06 §6.1 状态通路）。
import { devStats, Engine } from '@/core/engine';
import { Director } from '@/core/director';
import type { AppState } from '@/core/state';
import { sceneRegistry } from '@/content/scenes/registry';
import { vehicleRegistry } from '@/content/vehicles/registry';
import { timeRegistry } from '@/content/times/registry';
import { weatherRegistry } from '@/content/weathers/registry';
import { mountControlPanel } from '@/ui/ControlPanel';
import { mountHiddenMode } from '@/ui/hiddenMode';
import '@/ui/uiStyle.css';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) {
  throw new Error('index.html 缺少 #app 挂载点');
}

// 背景交给 render/sky.ts 渐变穹顶（T31⑧：纯色 #0e1520 占位背景移除——穹顶 BackSide 全向覆盖）。
const engine = new Engine(app, {});

// 时间/天气注册表：T29/T30 正式预设 import 接入（原 T01 占位 Registry 注入行按本文件原注记替换）——
// applyState 经 isDefault 自动取档（dusk/晴朗为默认），四档时间/五档天气全链路生效。
const director = new Director({
  engine,
  sceneRegistry,
  vehicleRegistry,
  timeRegistry,
  weatherRegistry,
});
director.start();
// 默认组合：海崖 · C型 · 黄昏 · 晴朗——id 由各注册表 isDefault 条目给出（首帧不播过渡，§3.5.1）。
director.applyState();
engine.start();

// —— UI 层（docs/06 §6.1：#ui-root 固定四件——标题条/控制面板/隐藏钮/ghost；指针分层见 uiStyle.css）——
// ControlPanel 向下只依赖 core（state/events/registry/transition 常量）+ ui 自身；registry.list() 驱动按钮。
const uiRoot = document.createElement('div');
uiRoot.id = 'ui-root';
document.body.appendChild(uiRoot);

const panel = mountControlPanel(uiRoot, {
  state: director.state,
  sceneRegistry,
  vehicleRegistry,
  timeRegistry,
  weatherRegistry,
});
// 隐藏钮/ghost 由 hiddenMode 自建；标题条+面板为被隐藏目标（三件动画，§6.5）。
mountHiddenMode(uiRoot, { targets: [panel.titleBar, panel.panel] });

// DEV 专属：控制台可直接检查 engine/渲染计数/编排器（import.meta.env.DEV 保证不进产物）
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__MINI_CAMP_DEV__ = {
    engine,
    stats: devStats,
    director,
  };

  // DEV 专属脚本化巡游钩子（T40/400 组合核验用；与 __MINI_CAMP_DEV__ 同不进产物）：
  // __camp.setState(scene, vehicle, time, weather) —— 位置实参，传 null/undefined 跳过该维；
  //   id 先经注册表 get 校验（未登记抛错并列可用 id，core/registry.ts:29-36），再逐维 state.set
  //   （同值 no-op；成功即触发 EventBus → Director 四条切换路径）。
  // __camp.getState() —— 当前四维快照拷贝。
  // __camp.ready —— 首帧渲染完成（两帧 rAF 后兑现）的 Promise。
  let readyResolve!: (value: boolean) => void;
  const ready = new Promise<boolean>((resolve) => {
    readyResolve = resolve;
  });
  requestAnimationFrame(() => requestAnimationFrame(() => readyResolve(true)));

  (window as unknown as Record<string, unknown>).__camp = {
    setState(
      scene?: string | null,
      vehicle?: string | null,
      time?: string | null,
      weather?: string | null,
    ): AppState {
      // 传 null/undefined 跳过该维；id 先经注册表 get 校验（未登记抛错并列可用 id，
      // core/registry.ts:29-36），再逐维 state.set（同值 no-op；变更即触发
      // EventBus 'state:changed' → Director 四条切换路径，docs/06 §6.1）。
      if (scene != null) {
        sceneRegistry.get(scene);
        director.state.set('scene', scene);
      }
      if (vehicle != null) {
        vehicleRegistry.get(vehicle);
        director.state.set('vehicle', vehicle);
      }
      if (time != null) {
        timeRegistry.get(time);
        director.state.set('time', time);
      }
      if (weather != null) {
        weatherRegistry.get(weather);
        director.state.set('weather', weather);
      }
      return { ...director.state.state };
    },
    getState(): AppState {
      return { ...director.state.state };
    },
    ready,
  };
}
