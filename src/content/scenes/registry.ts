// docs/01-整体架构.md §3.2 content/scenes/registry.ts —— sceneRegistry：登记 4 场景（§3.3.2 尾）。
// 当前登记：海崖 seacliff（T18 正式模块，isDefault 默认场景）。
// ★ 注册行替换点：T19 pineforest / T20 wasteland / T21 servicearea 各自完成后，在下方追加对应
//   import 与 register 行（新增一行即被 UI 与切换逻辑识别，§3.1-④）。
// _stub.ts 保留不删（T17 桩场景，待 T48 收尾统一处置——九.4 只登记不删除）。
import { seacliffScene } from '@/content/scenes/seacliff';
import { Registry } from '@/core/registry';
import type { SceneModule } from '@/content/scenes/types';

export const sceneRegistry = new Registry<SceneModule>();
sceneRegistry.register(seacliffScene); // isDefault：默认场景槽位（T18 正式模块替换 T17 桩注册行）
