// src/content/layout/scenes/servicearea.ts —— ★ 高速服务区营地道具占位表（布局约束系统·场景侧单一来源）。
//
// 纯数据模块（零 three/DOM；仅 `import type` 引 core 契约——运行时零 import，node 可直接 import）。
// 数据流与规则见 core/layout.ts / layout/vehicles.ts 文件头。
//
// ★ 本轮重排（约束落地）：营位锚点 (0,3.4)（大车位 9×5.5 居中 x −4.5..4.5 / z 0.65..6.15），
//   车辆包络圆（最大 classA 4.46）+0.25 → 道具环带 r ≥ 4.71+半径。
//   ◆ 东长椅组东移：长椅 E (2.6,6.55)→(6.6,6.55)（原位距 classA 包络 −1.5 深入）、早餐餐具随
//     椅面；东分类垃圾桶 (3.6,6.55)→(8.1,6.7)；西组微调：西垃圾桶 (−5.6,6.55)→(−5.5,6.6)
//     （与西长椅净距 0.14）。行道树 (5.2,6.85) 冠下摆椅——树为植被散布件不入表（树冠悬高 ≥2m，
//     干径 0.36 与椅净距 0.35 由页内探针兜底）。
//   ◆ 其余原位保留（充电桩/售货机/洗手池/旗杆/送货小车距包络均富余）。
// 加油站/便利店/遮阳连廊/公路护栏/绿化带/灌木/行道树为地形一体构件只登记。
import type { LayoutItem } from '@/core/layout';

/** 场景 id。 */
export const SERVICEAREA_SCENE_ID = 'servicearea';

/** 营位锚点平面位（docs/02 §4.1.0 服务区行 x/z 逐字——大车位中心）。 */
export const SERVICEAREA_CAMP_POS = { x: 0, z: 3.4 } as const;

/* ============================== 道具布置位置常量（场景文件逐字 import） ============================== */

/** ⑩ 长椅 ×2（西 (−6.9,6.55) 原值保留；东 (2.6,6.55)→新；benchSlat 1.7×0.55 → 半径 0.90）。 */
export const BENCH_POS_W = { x: -6.9, z: 6.55 } as const;
export const BENCH_POS_E = { x: 6.6, z: 6.55 } as const;

/** ⑩ 分类垃圾桶 ×2（西 (−5.6,6.55)→(−5.5,6.6)；东 (3.6,6.55)→(8.1,6.7)；桶径 → 半径 0.35）。 */
export const BIN_POS_W = { x: -5.5, z: 6.6 } as const;
export const BIN_POS_E = { x: 8.1, z: 6.7 } as const;

/** +早餐餐具（随东长椅座面；rot −0.08 原值保留；dawn 档）。 */
export const BREAKFAST_POS = { x: 6.6, z: 6.55 } as const;

/** ③ 自动售货机 ×2（原值保留；机 0.9×0.8+灯带 → 半径 0.65）。 */
export const VENDING_POS_A = { x: -4.5, z: -5.42 } as const;
export const VENDING_POS_B = { x: 4.75, z: -5.42 } as const;

/** ④ 充电桩 ×2（原值保留；桩体 → 半径 0.40）。 */
export const CHARGING_POS = [
  { x: 5.9, z: 0.42 },
  { x: 8.4, z: 0.42 },
] as const;

/** ⑪ 洗手池（原值保留；台盆+镜背板 → 半径 0.55）。 */
export const WASH_BASIN_POS = { x: 4.2, z: -6.28 } as const;

/** ⑫ 旗杆（原值保留；杆座 → 半径 0.30）。 */
export const FLAG_POLE_POS = { x: -9.1, z: -4.35 } as const;

/** +送货小车（原值保留（便利店西墙外）；车 0.9×0.6 → 半径 0.55）。 */
export const DELIVERY_CART_POS = { x: -4.45, z: -7.3 } as const;

/* ============================== 占位表 ============================== */

/** 服务区占位表。cluster 贴邻豁免：bench-east=东长椅↔椅面早餐。 */
export const SERVICEAREA_ITEMS: readonly LayoutItem[] = [
  { id: 'servicearea/bench-w', x: BENCH_POS_W.x, z: BENCH_POS_W.z, radius: 0.9, kind: 'prop' },
  { id: 'servicearea/bench-e', x: BENCH_POS_E.x, z: BENCH_POS_E.z, radius: 0.9, kind: 'prop', cluster: 'servicearea/bench-east' },
  { id: 'servicearea/breakfast', x: BREAKFAST_POS.x, z: BREAKFAST_POS.z, radius: 0.35, kind: 'prop', cluster: 'servicearea/bench-east', note: '早餐餐具置于东长椅座面（dawn 档出现）' },
  { id: 'servicearea/bin-w', x: BIN_POS_W.x, z: BIN_POS_W.z, radius: 0.35, kind: 'prop' },
  { id: 'servicearea/bin-e', x: BIN_POS_E.x, z: BIN_POS_E.z, radius: 0.35, kind: 'prop' },
  { id: 'servicearea/vending-a', x: VENDING_POS_A.x, z: VENDING_POS_A.z, radius: 0.42, kind: 'prop', note: '机体 0.62×0.52 半对角 0.405+投币沿' },
  { id: 'servicearea/vending-b', x: VENDING_POS_B.x, z: VENDING_POS_B.z, radius: 0.42, kind: 'prop', note: '机体 0.62×0.52 半对角 0.405+投币沿' },
  { id: 'servicearea/charging-a', x: CHARGING_POS[0].x, z: CHARGING_POS[0].z, radius: 0.3, kind: 'prop' },
  { id: 'servicearea/charging-b', x: CHARGING_POS[1].x, z: CHARGING_POS[1].z, radius: 0.3, kind: 'prop' },
  { id: 'servicearea/wash-basin', x: WASH_BASIN_POS.x, z: WASH_BASIN_POS.z, radius: 0.46, kind: 'prop', note: '台盆 0.78×0.48 半对角 0.46' },
  { id: 'servicearea/flag-pole', x: FLAG_POLE_POS.x, z: FLAG_POLE_POS.z, radius: 0.45, kind: 'prop', note: '杆座+旗面展开 0.42 投影' },
  { id: 'servicearea/delivery-cart', x: DELIVERY_CART_POS.x, z: DELIVERY_CART_POS.z, radius: 0.55, kind: 'prop', note: 'dawn 档出现（四-1 清晨专属）' },

  /* —— 地形一体构件（只登记不校验）—— */
  { id: 'servicearea/gas-station', x: -6.3, z: -1.5, radius: 3.2, kind: 'terrain', note: '加油站雨棚 5.1×3.8+加油机 ×2（建筑）' },
  { id: 'servicearea/store', x: 0, z: -7.6, radius: 4.0, kind: 'terrain', note: '便利店 7.6×2.4（建筑）' },
  { id: 'servicearea/corridor', x: 0, z: -4.85, radius: 2.3, kind: 'terrain', note: '遮阳连廊 3.4×2.9（店↔车位连接体）' },
  { id: 'servicearea/guardrail', x: 0, z: 7.52, radius: 10.2, kind: 'terrain', note: '波形梁护栏沿公路带（线体，圆为粗近似）' },
];
