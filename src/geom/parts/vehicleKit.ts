// docs/01-整体架构.md §3.2 geom/parts/ —— 可复用部件库 vehicleKit（车身/窗/轮/帐篷/车灯等车型共用件，
// named≥16 契约）。★ 禁止人形/人物几何（一.6，由各子工厂继续把关）。T23–T28 落点。
//
// 首批（T23，docs/03 §4.2.0 vehicleKit 部件库表）按「一部件一文件」落 geom/parts/vehicleKit/：
//   wheel（车轮：胎/毂分几何，'at' 18 凸块）/ pleatedBand（风琴褶带：升顶帐帘/滑出风琴套）/
//   rollBundle（收拢布卷）/ gaugeCluster（仪表+方向盘）/ screenPanel（屏幕面板）/
//   booksStack（书册堆，InstancedGroup）。
// 本文件为部件库入口 barrel：后续批次（awningAssembly/jackLeg/ladder/roofRack/jerryCan/toolbox/
//   sleepingBag/ledString/bikeFolding/surfboard/plantPot/coffeeKit/netPanel/mapOpen，T24–T28）在
//   vehicleKit/ 下各增一文件并在此补一行 re-export 即被五车识别（docs/01 §3.3.6「新文件 + 一行」）。
export { createWheelGeometries } from './vehicleKit/wheel';
export type { WheelParams, WheelGeometries } from './vehicleKit/wheel';
export { createPleatedBandGeometry } from './vehicleKit/pleatedBand';
export type { PleatedBandParams } from './vehicleKit/pleatedBand';
export { createRollBundleGeometry } from './vehicleKit/rollBundle';
export type { RollBundleParams } from './vehicleKit/rollBundle';
export { createGaugeCluster } from './vehicleKit/gaugeCluster';
export type { GaugeClusterParams, GaugeClusterResult } from './vehicleKit/gaugeCluster';
export { createScreenPanel } from './vehicleKit/screenPanel';
export type { ScreenPanelParams, ScreenPanelResult } from './vehicleKit/screenPanel';
export { createBooksStack } from './vehicleKit/booksStack';
export type { BooksStackParams } from './vehicleKit/booksStack';
