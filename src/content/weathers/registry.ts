// docs/01-整体架构.md §3.2 content/weathers/registry.ts —— weatherRegistry：登记 clear/cloudy/rain/fog/snow；T30 正式数据落地。
// 注册顺序 = UI 分段按钮渲染顺序（core/registry.ts list() 注记；docs/06 §六.1 枚举通路）；
// isDefault：晴朗（默认组合「海崖·C型·黄昏·晴朗」，原文 L3/L151；Director.applyState 经 isDefault 取档）。
import { Registry } from '@/core/registry';
import { clearPreset, cloudyPreset, rainPreset, fogPreset, snowPreset } from '@/content/weathers/presets';
import type { WeatherPreset } from '@/content/weathers/types';

export const weatherRegistry = new Registry<WeatherPreset>();
weatherRegistry.register(clearPreset); // isDefault：默认天气档（全中性基准，五-1）
weatherRegistry.register(cloudyPreset);
weatherRegistry.register(rainPreset);
weatherRegistry.register(fogPreset);
weatherRegistry.register(snowPreset);
