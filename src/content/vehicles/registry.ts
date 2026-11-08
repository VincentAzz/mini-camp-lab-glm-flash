// docs/01-整体架构.md §3.2 content/vehicles/registry.ts —— vehicleRegistry：登记 5 车型（§3.3.3 尾）。
// 当前登记：临时桩车型（T17 编排验证，id 占用 'classC' 槽位）。
// ★ 注册行替换点：T23 classC / T24 classA / T25 trailerRig（D4 单模块）/ T26 classB / T27
//   overlandTruck 各自完成后，把下方 import 与 register 行替换为对应正式模块（注册一行即被识别）。
import { stubVehicle } from '@/content/vehicles/_stub';
import { Registry } from '@/core/registry';
import type { VehicleModule } from '@/content/vehicles/types';

export const vehicleRegistry = new Registry<VehicleModule>();
vehicleRegistry.register(stubVehicle); // isDefault：默认车型槽位（正式模块完成后替换本行）
