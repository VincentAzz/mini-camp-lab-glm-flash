// src/content/layout/scenes/seacliff.ts —— ★ 海崖营地道具占位表（布局约束系统·场景侧单一来源）。
//
// 纯数据模块（零 three/DOM；仅 `import type` 引 core 契约——运行时零 import，node 可直接 import）。
// 数据流：本表位置常量 → scenes/seacliff.ts import 布置（数值逐字同源）→ buildProps 末尾
//   LayoutGrid.register('seacliff', SEA_CLIFF_ITEMS)；scripts/check-layout.mjs 与 Director（DEV）
//   用同一 SEA_CLIFF_ITEMS × VEHICLE_ENVELOPES 校验（规则见 core/layout.ts 文件头）。
//
// ★ 本轮重排（布局约束系统落地，海崖天幕杆系穿车体根治）：车辆包络圆（最大 classA 4.46，
//   见 layout/vehicles.ts）+0.25 净距 → 营位锚点 (0,0.8) 四周留出包络空位，全部道具重排至
//   r ≥ 4.71+道具半径 环带。旧坐标→新坐标逐条见各常量行内注记。
//   ◆ 天幕杆系（最高优先）：旧根 (−1.7,1.35) 深入营位（杆顶/拉绳桩距包络 <0）→ 新根
//     (−6.6,5.4)（西南草坪），全部落地杆位与拉绳桩距 5 车型包络 ≥0.25（check:layout 实证）；
//     天幕布面不跨车顶（布面投影整片在西侧草坪，无「布横跨车顶」工况，杆系方案维持四杆+两拉绳）。
//   ◆ 串灯随天幕组合重挂：锚点 A/B/C=天幕三杆顶（按新根+rot 0.12 实算），D=营地灯挂臂端
//     （灯随迁天幕前缘，串灯↔天幕↔灯同 cluster 贴邻豁免）。
//   ◆ 其余贴面清零：门口垫 (0.35,2.75)→(1.6,6.2)（原与越野遮阳幕支臂 0.06 贴面）；自行车
//     (4.6,−1.0)→(6.4,−1.1)（原↔A型前杠 0.146、且原位落小海湾水线内）；水电桩/卷盘/管线
//     (3.3,0.35)群→(5.3,0.2)群（原被 A型/拖挂车身包络吞没）；观景椅随迁。
// 植被散布件（海草×20/礁石×12 沿崖缘与湾沙 rng 散布、露水 sparkle、暖窗光贴花）不入静态
//   占位表：礁石/海草属崖缘地形散布（车辆不驻崖缘海侧），sparkle/贴花为非实体层。
import type { LayoutItem } from '@/core/layout';

/** 场景 id（register 与 verify 的场景键）。 */
export const SEA_CLIFF_SCENE_ID = 'seacliff';

/** 营位锚点平面位（docs/02 §4.1.0 海崖行 x/z 逐字；车辆包络圆圆心=车型停驻位）。 */
export const SEA_CLIFF_CAMP_POS = { x: 0, z: 0.8 } as const;

/* ============================== 道具布置位置常量（场景文件逐字 import） ============================== */

/** ① 遮阳天幕组根（旧 (−1.7,1.35)→新；rot 0.12 不变）。天幕布 3.2×2.6 悬空 y+1.62、
 *  4 支撑杆局部 ±1.5/±1.2、拉绳桩局部 (−2.3,−2.0)/(1.35,−2.6) → 组合落地包络半径 3.05。 */
export const TARP_ROOT = { x: -6.6, z: 5.4 } as const;
/** ① 天幕朝向（原值逐字保留）。 */
export const TARP_ROT_Y = 0.12;

/** ⑤ 小营地灯（旧 (−3.2,2.3)→新；挂臂端灯罩 +x 0.45 → 包络半径 0.60；串灯 D 锚=挂臂端）。 */
export const CAMP_LAMP_POS = { x: -4.6, z: 5.9 } as const;

/** ① 折叠桌（旧 (−1.7,3.9)→新；桌面 1.15×0.7 → 半径 0.68；rot 0.12 与天幕同向）。
 *  （探针复测微调：(−5.6,6.5)→(−6.1,6.3)——天幕东北杆（世界 (−4.97,6.41)）实测掠桌东缘
 *  0.018，西/南微挪 0.54 拉开至 0.48（顶点级实测），仍居天幕圈内。） */
export const FOLD_TABLE_POS = { x: -6.1, z: 6.3 } as const;
/** ① 折叠椅 ×2（旧 (−2.85,3.7)/(−1.3,3.7)→新；rot −0.55/+0.5 原值逐字保留）。
 *  （探针复测微调：W (−6.7,7.3)→(−6.9,7.6)——桌随天幕杆微挪后椅 W 前缘掠桌沿 0.026，
 *  沿椅背向拉至 0.25（顶点级实测），仍环桌构图。） */
export const FOLD_CHAIR_POS_W = { x: -6.9, z: 7.6 } as const;
export const FOLD_CHAIR_POS_E = { x: -4.6, z: 7.2 } as const;

/** ④ 野餐垫（旧 (−1.7,3.15)→新；垫 2.0×1.5 → 半径 1.25；rot 0.12）。 */
export const PICNIC_MAT_POS = { x: -3.4, z: 8.8 } as const;
/** ④ 纸巾（旧 (−2.5,3.0)→新；置垫面）。 */
export const TOWEL_POS = { x: -4.0, z: 8.5 } as const;
/** ④ 早餐餐具（旧 (−1.7,y+0.665,1.35) 滞留天幕中心→桌面逐字归位，随 FOLD_TABLE_POS；dawn 档）。 */
export const BREAKFAST_POS = { x: -6.1, z: 6.3 } as const;

/** ③ 烧烤炉（旧 (1.35,4.45)→新；烤碗口径 0.5 → 半径 0.55；rot −0.4 原值保留）。 */
export const GRILL_POS = { x: -2.9, z: 6.9 } as const;

/** ⑥ 防水地垫（旧 (0.35,2.75)→新；垫 1.1×0.62 → 半径 0.64；rot 0.15 原值保留）。 */
export const DOORMAT_POS = { x: 1.6, z: 6.2 } as const;

/** ⑦ 水电桩（旧 (3.3,0.35)→新；桩体 0.2×0.16 → 半径 0.18；rot −0.2 原值保留）。 */
export const UTILITY_POST_POS = { x: 5.3, z: 0.2 } as const;
/** ⑦ 水管卷盘（旧 (3.06,0.62)→新；卷盘半径 0.25）。 */
export const HOSE_REEL_POS = { x: 5.1, z: 0.7 } as const;
/** ⑦ 管线走线点（旧 (2.98,0.4)…(2.52,−0.42)→新；y 抬升剖面原值保留，走线包络圆 r 0.59）。 */
export const HOSE_POINTS: readonly { x: number; z: number }[] = [
  { x: 5.35, z: 0.5 },
  { x: 5.5, z: 0.1 },
  { x: 5.38, z: -0.3 },
  { x: 5.22, z: -0.65 },
];

/** ⑧ 折叠自行车（旧 (4.6,−1.0)→新；整车 ±0.7 → 半径 0.75；rot 1.15 原值保留）。 */
export const BICYCLE_POS = { x: 6.4, z: -1.1 } as const;

/** ⑪ 观景长椅（旧 (−2.4,−3.15)→新（崖缘西段，面海朝向不变）；椅 1.7×0.55 → 半径 0.90）。 */
export const VIEW_BENCH_POS = { x: -3.6, z: -3.9 } as const;

/** ⑫ 路牌（旧 (3.0,−2.95)→新；板宽 0.6 双板 → 半径 0.50；rot −0.45 原值保留）。 */
export const SIGN_POS = { x: 7.0, z: 0.2 } as const;

/* ============================== 占位表（check:layout 与 Director DEV verify 数据源） ============================== */

/**
 * 海崖占位表。cluster 贴邻豁免（note 说明设计贴邻依据）：
 *   canopy=天幕遮蔽圈（天幕/串灯/营地灯/桌/椅/早餐——桌椅餐具在天幕下为构图意图）；
 *   picnic=野餐垫面（垫↔纸巾）；utility=水电桩群（桩↔卷盘↔引出管线）。
 */
export const SEA_CLIFF_ITEMS: readonly LayoutItem[] = [
  { id: 'seacliff/tarp', x: TARP_ROOT.x, z: TARP_ROOT.z, radius: 3.05, kind: 'prop', cluster: 'seacliff/canopy', note: '天幕组合锚：布 3.2×2.6 悬空 y≥2.82 + 4 杆 ±1.92 + 拉绳桩 3.05' },
  { id: 'seacliff/string-lights', x: TARP_ROOT.x, z: TARP_ROOT.z, radius: 3.05, kind: 'prop', cluster: 'seacliff/canopy', note: '串灯悬线于天幕杆顶↔营地灯挂臂（投影在天幕圈内）' },
  { id: 'seacliff/camp-lamp', x: CAMP_LAMP_POS.x, z: CAMP_LAMP_POS.z, radius: 0.6, kind: 'prop', cluster: 'seacliff/canopy', note: '营地灯挂天幕前缘（设计挂点，随组合避让）' },
  { id: 'seacliff/fold-table', x: FOLD_TABLE_POS.x, z: FOLD_TABLE_POS.z, radius: 0.68, kind: 'prop', cluster: 'seacliff/canopy', note: '折叠桌在天幕遮蔽下（构图意图）' },
  { id: 'seacliff/fold-chair-w', x: FOLD_CHAIR_POS_W.x, z: FOLD_CHAIR_POS_W.z, radius: 0.3, kind: 'prop', cluster: 'seacliff/canopy' },
  { id: 'seacliff/fold-chair-e', x: FOLD_CHAIR_POS_E.x, z: FOLD_CHAIR_POS_E.z, radius: 0.3, kind: 'prop', cluster: 'seacliff/canopy' },
  { id: 'seacliff/breakfast', x: BREAKFAST_POS.x, z: BREAKFAST_POS.z, radius: 0.35, kind: 'prop', cluster: 'seacliff/canopy', note: '早餐餐具置于桌面（dawn 档出现）' },
  { id: 'seacliff/picnic-mat', x: PICNIC_MAT_POS.x, z: PICNIC_MAT_POS.z, radius: 1.25, kind: 'prop', cluster: 'seacliff/picnic' },
  { id: 'seacliff/towel', x: TOWEL_POS.x, z: TOWEL_POS.z, radius: 0.22, kind: 'prop', cluster: 'seacliff/picnic', note: '纸巾置野餐垫面' },
  { id: 'seacliff/grill', x: GRILL_POS.x, z: GRILL_POS.z, radius: 0.55, kind: 'prop' },
  { id: 'seacliff/doormat', x: DOORMAT_POS.x, z: DOORMAT_POS.z, radius: 0.64, kind: 'prop' },
  { id: 'seacliff/utility-post', x: UTILITY_POST_POS.x, z: UTILITY_POST_POS.z, radius: 0.18, kind: 'prop', cluster: 'seacliff/utility' },
  { id: 'seacliff/hose-reel', x: HOSE_REEL_POS.x, z: HOSE_REEL_POS.z, radius: 0.25, kind: 'prop', cluster: 'seacliff/utility', note: '卷盘贴桩布置' },
  { id: 'seacliff/hose-run', x: 5.36, z: -0.09, radius: 0.59, kind: 'prop', cluster: 'seacliff/utility', note: '管线自桩引出贴地盘卷（HOSE_POINTS 路径包络）' },
  { id: 'seacliff/bicycle', x: BICYCLE_POS.x, z: BICYCLE_POS.z, radius: 0.75, kind: 'prop' },
  { id: 'seacliff/bench', x: VIEW_BENCH_POS.x, z: VIEW_BENCH_POS.z, radius: 0.9, kind: 'prop' },
  { id: 'seacliff/sign', x: SIGN_POS.x, z: SIGN_POS.z, radius: 0.5, kind: 'prop' },

  /* —— 地形一体构件（只登记不校验：曲线/组合体包络圆为粗近似，真实相交由页内探针兜底）—— */
  { id: 'seacliff/deck-path', x: 1.7, z: -2.0, radius: 1.9, kind: 'terrain', note: '木栈道沿曲线 (0.2,−1.35)→(3.25,−2.62)，36 板实例化' },
  { id: 'seacliff/guardrail', x: -0.95, z: -4.2, radius: 3.3, kind: 'terrain', note: '崖缘护栏沿 cliffEdgeZ 曲线 x −4.2..2.3' },
  { id: 'seacliff/steps', x: 3.75, z: -2.5, radius: 1.3, kind: 'terrain', note: '通往小海湾之字石阶 ×22' },
  { id: 'seacliff/cove-sand', x: 4.7, z: -2.6, radius: 1.9, kind: 'terrain', note: '小海湾湾沙台+湾水（ellipse 1.85×1.45）' },
  { id: 'seacliff/sailboat', x: 2.5, z: -8.6, radius: 0.8, kind: 'terrain', note: '帆船（海面 y=SEA_Y，四档位置表驱动）' },
  { id: 'seacliff/breakwater', x: -5.8, z: -7.55, radius: 1.6, kind: 'terrain', note: '防波堤两段' },
  { id: 'seacliff/lighthouse', x: -7.55, z: -9.15, radius: 0.55, kind: 'terrain', note: '防波堤灯塔' },
];
