// docs/01-整体架构.md §3.2 geom/parts/vehicles/trailerRig/index.ts —— T25 拖挂组合部件 barrel。
// docs/03-车型模块.md §4.2.3 专有部件（分瓣厢体/遮阳棚/支撑腿/A 字牵引杆/货斗载物/前鼻挂件/睡袋）；
//   通用件（wheel/pleatedBand/screenPanel/gaugeCluster/rollBundle）仍走 vehicleKit barrel（§4.2.0）。
export { createTrailerShellGeometries } from './trailerBody';
export type { TrailerShellParams, TrailerShellGeometries } from './trailerBody';
export { createAwningAssembly } from './awningAssembly';
export type { AwningAssemblyParams, AwningAssemblyResult } from './awningAssembly';
export { createJackLeg } from './jackLeg';
export type { JackLegParams } from './jackLeg';
export { createAFrameHitch } from './aFrameHitch';
export type { AFrameHitchParams } from './aFrameHitch';
export { createLuggageBox, createJerryCan, createFirewoodStack } from './cargoBedLoad';
export { createGasBottle, createSpareTire } from './noseAccessories';
export { createSleepingBag } from './sleepingBag';
export type { SleepingBagParams } from './sleepingBag';
