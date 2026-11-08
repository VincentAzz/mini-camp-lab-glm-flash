// docs/01-整体架构.md §3.2 content/scenes/registry.ts —— sceneRegistry：登记 4 场景（§3.3.2 尾）。
// 当前登记：海崖 seacliff（T18 正式模块，isDefault 默认场景）+ 服务区 servicearea（T21 正式模块）
//   + 末日避难所 wasteland（T20 正式模块）+ 山间松林 pineforest（T19 正式模块）。
// ★ 注册行替换点：四场景已全部登记。
// _stub.ts 保留不删（T17 桩场景，待 T48 收尾统一处置——九.4 只登记不删除）。
import { seacliffScene } from '@/content/scenes/seacliff';
import { serviceareaScene } from '@/content/scenes/servicearea';
import { wastelandScene } from '@/content/scenes/wasteland';
import { pineforestScene } from '@/content/scenes/pineforest';
import { Registry } from '@/core/registry';
import type { SceneModule } from '@/content/scenes/types';

export const sceneRegistry = new Registry<SceneModule>();
sceneRegistry.register(seacliffScene); // isDefault：默认场景槽位（T18 正式模块替换 T17 桩注册行）
sceneRegistry.register(serviceareaScene); // T21：高速路服务区（shopPower 通道 + 车流）
sceneRegistry.register(wastelandScene); // T20：末日避难所（§4.1.3「sceneRegistry.register(wasteland)」）
sceneRegistry.register(pineforestScene); // T19：山间松林（§4.1.2「sceneRegistry.register(pineforest)」）
