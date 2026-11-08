// docs/01-整体架构.md §3.2 content/vehicles/registry.ts —— vehicleRegistry：登记 5 车型（§3.3.3 尾）。
// 当前登记：classC 正式模块（T23，isDefault 默认车型槽位）。
// ★ 注册行替换点：T24 classA / T25 trailerRig（D4 单模块）/ T26 classB / T27 overlandTruck 各自
//   完成后，在此追加 register 行（注册一行即被识别）；_stub.ts 保留不删，待 T48 收尾统一处置
//   （九.4：只登记不删除；stubVehicle 已不在注册表中，仅作为 T17 编排验证的历史文件留存）。
import { classC } from '@/content/vehicles/classC';
import { classA } from '@/content/vehicles/classA';
import { overlandTruck } from '@/content/vehicles/overlandTruck';
import { trailerRig } from '@/content/vehicles/trailerRig';
import { classB } from '@/content/vehicles/classB';
import { Registry } from '@/core/registry';
import type { VehicleModule } from '@/content/vehicles/types';

export const vehicleRegistry = new Registry<VehicleModule>();
vehicleRegistry.register(classC); // isDefault：默认车型（docs/03 §4.2.1「C型房车（默认车型）」）
vehicleRegistry.register(classA); // T24（docs/03 §4.2.2；label「A型大巴」）
vehicleRegistry.register(trailerRig); // T25（决策 D4：皮卡+拖挂注册为单一模块；label「拖挂房车」★docs/00 一.12 ★-label 统一）
vehicleRegistry.register(classB); // T26（docs/03 §4.2.4；label「B型面包车」）
vehicleRegistry.register(overlandTruck); // T27 越野皮卡（docs/03 §4.2.5；label「越野皮卡」）
