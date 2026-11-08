// docs/01-整体架构.md §3.2 content/scenes/registry.ts —— sceneRegistry：登记 4 场景（§3.3.2 尾）。
// 当前登记：临时桩场景（T17 编排验证，id 占用 'seacliff' 槽位）。
// ★ 注册行替换点：T18 seacliff / T19 pineforest / T20 wasteland / T21 servicearea 各自完成后，
//   把下方 import 与 register 行替换为对应正式模块（新增一行即被 UI 与切换逻辑识别，§3.1-④）。
import { stubScene } from '@/content/scenes/_stub';
import { Registry } from '@/core/registry';
import type { SceneModule } from '@/content/scenes/types';

export const sceneRegistry = new Registry<SceneModule>();
sceneRegistry.register(stubScene); // isDefault：默认场景槽位（正式模块完成后替换本行）
