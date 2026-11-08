// docs/01-整体架构.md §3.2 content/times/registry.ts —— timeRegistry：登记 dawn/day/dusk/night；T29 正式数据落地。
// 注册顺序 = UI 分段按钮渲染顺序（core/registry.ts list() 注记；docs/06 §六.1 枚举通路）；
// isDefault：黄昏（默认组合「海崖·C型·黄昏·晴朗」，原文 L3/L151；Director.applyState 经 isDefault 取档）。
import { Registry } from '@/core/registry';
import { dawnPreset, dayPreset, duskPreset, nightPreset } from '@/content/times/presets';
import type { TimePreset } from '@/content/times/types';

export const timeRegistry = new Registry<TimePreset>();
timeRegistry.register(dawnPreset);
timeRegistry.register(dayPreset);
timeRegistry.register(duskPreset); // isDefault：默认时间档
timeRegistry.register(nightPreset);
