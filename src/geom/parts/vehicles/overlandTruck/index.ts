// docs/01-整体架构.md §3.2 geom/parts/vehicles/overlandTruck/ —— T27 越野皮卡专用部件库 barrel。
// draft 12-车型模块 §2.7 中 T27 所需而 vehicleKit 首批未含的部件（ladder/roofRack/jerryCan/toolbox/
//   sleepingBag/ledString/netPanel/mapOpen）+ T27 专属组装件（roofTent/shadeSail），一部件一文件；
//   同 id geometry 经 SharedAssets 缓存跨车复用（§5.6/八.3）。铁律：禁止任何人物几何（一.6）。
export { createLadderGeometry } from './ladder';
export type { LadderParams } from './ladder';
export { createRoofRackParts } from './roofRack';
export type { RoofRackParams, RoofRackParts } from './roofRack';
export { createJerryCanGeometry } from './jerryCan';
export type { JerryCanParams } from './jerryCan';
export { createToolboxGeometry } from './toolbox';
export type { ToolboxParams } from './toolbox';
export { createSleepingBagGeometry } from './sleepingBag';
export type { SleepingBagParams, SleepingBagState } from './sleepingBag';
export { createLedStringParts } from './ledString';
export type { LedStringParams, LedStringParts } from './ledString';
export { createCargoNetParts } from './netPanel';
export type { CargoNetParams, CargoNetParts } from './netPanel';
export { createMapOpenGeometry, createMapRollGeometry } from './mapOpen';
export type { MapOpenParams } from './mapOpen';
export { createRoofTent } from './roofTent';
export type { RoofTentParams, RoofTentResult } from './roofTent';
export { createShadeSail } from './shadeSail';
export type { ShadeSailParams, ShadeSailResult } from './shadeSail';
