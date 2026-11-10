// src/content/layout/scenes/wasteland.ts —— ★ 末日避难所营地道具占位表（布局约束系统·场景侧单一来源）。
//
// 纯数据模块（零 three/DOM；仅 `import type` 引 core 契约——运行时零 import，node 可直接 import）。
// 数据流与规则见 core/layout.ts / layout/vehicles.ts 文件头。
//
// ★ 本轮重排（约束落地）：营位锚点 (0,0)（车头朝围墙开口 +z），车辆包络圆（最大 classA 4.46）
//   +0.25 → 道具环带 r ≥ 4.71+半径，同时不撞围墙/塔/集装箱（后缘结构带 z≤−7.3、左墙 x −8.5、
//   右墙 x 8.45、探照塔 (−7.35,−6.1)）。旧坐标→新坐标逐条见常量行内注记。
//   ◆ 净化器小群落（用户点名重排）：净化器 (−3.05,−3.45)→(−4.6,−3.8)（消除与 B型尾门/C型滑出
//     舱的 0.017/0.021 贴面，距 classA 包络 0.46）；太阳能阵列 (−4.7,−4.6) rot 0.12→(−7.0,−0.5)
//     rot π/2（阵列沿左墙内侧 N-S 纵列，避开探照塔/集装箱 A/铁丝网，距包络 0.11）；探照塔
//     原位不动（距包络富余）。三件互不相撞（净化器↔太阳能净距 1.03）。
//   ◆ 油桶烤炉 (2.45,3.15)→(4.65,3.55)（原与拖挂皮卡左前轮带 0.26 贴线，出包络带 0.64）。
//   ◆ 板条箱+餐具 (0.5,2.9)→(−3.3,−4.9)（原深居包络带内）。
//   ◆ 晾衣绳 (−5.9,0.35) rot 0.2→(−6.3,3.8) rot π/2（绳沿左墙内侧 N-S 张紧，距包络 0.90）。
//   ◆ 警示牌 (−5.7,3.35)→(−4.6,5.6)（随晾衣绳错位）。
// 残骸/轮胎堆/雷达原位保留（距包络富余，登记为 prop 全过）；沙袋工事/围墙/铁丝网/掩体/瞭望塔/
//   集装箱/城市窗带为地形一体构件只登记。
import type { LayoutItem } from '@/core/layout';

/** 场景 id。 */
export const WASTELAND_SCENE_ID = 'wasteland';

/** 营位锚点平面位（docs/02 §4.1.0 避难所行 x/z 逐字——原点）。 */
export const WASTELAND_CAMP_POS = { x: 0, z: 0 } as const;

/* ============================== 道具布置位置常量（场景文件逐字 import） ============================== */

/** ⑧ 净水装置+发电机（旧 (−3.05,−3.45)→新 (−4.4,−3.6)；滤瓶/管含突出件 → 半径 0.80；rot 0.5 原值保留）。
 *  （探针复测注记：发电机突出件朝 ESE——板条箱须保持其东南向 ≥2.0 圆距，见 CRATE_POS。） */
export const PURIFIER_POS = { x: -4.4, z: -3.6 } as const;

/** ⑨ 太阳能阵列（旧 (−4.7,−4.6) rot 0.12→新 rot π/2 纵列；4 板行 4.34×0.7 → 半径 2.20）。 */
export const SOLAR_POS = { x: -7.0, z: -0.5 } as const;
export const SOLAR_ROT_Y = Math.PI / 2;

/** ⑪ 油桶改造烧烤架（旧 (2.45,3.15)→新；桶径+架 → 半径 0.50；rot −0.35 原值保留）。 */
export const BARREL_GRILL_POS = { x: 4.65, z: 3.55 } as const;

/** +板条箱（旧 (0.5,2.9)→新；箱 0.72×0.72 → 半径 0.55；rot 0.35 原值保留）。
 *  （探针复测微调：(−3.3,−4.9)→(−3.0,−5.2)——发电机突出件（purifier/gen 朝 ESE）实测
 *  SAT 距 0.058，沿同方位外挪 0.43 拉开至圆距 0.77。） */
export const CRATE_POS = { x: -3.0, z: -5.2 } as const;

/** ⑫ 晾衣绳（旧 (−5.9,0.35) rot 0.2→新 rot π/2；绳长 3.4 → 半径 1.75）。 */
export const CLOTHESLINE_POS = { x: -6.3, z: 3.8 } as const;
export const CLOTHESLINE_ROT_Y = Math.PI / 2;

/** ⑦ 油桶+手写警示牌（旧 (−5.7,3.35)→新；立3倒1 散布 → 半径 0.60；rot 0.6 原值保留）。 */
export const BARREL_SIGN_POS = { x: -4.6, z: 5.6 } as const;

/** ⑥ 残骸（(6.75,2.1) 原值保留；车体 3.4×1.6 rot 0.55 → 半径 1.88）。 */
export const WRECK_POS = { x: 6.75, z: 2.1 } as const;
/** ⑥ 轮胎堆（(7.3,0.4) 原值保留；金字塔底径 → 半径 0.60）。 */
export const TIRE_PYRAMID_POS = { x: 7.3, z: 0.4 } as const;
/** ⑩ 旋转雷达（(6.9,−5.7) 原值保留；抛物面口径 → 半径 1.00）。 */
export const RADAR_POS = { x: 6.9, z: -5.7 } as const;

/* ============================== 占位表 ============================== */

/**
 * 避难所占位表。cluster 贴邻豁免（note 说明）：crate=板条箱↔餐具（餐具置箱面 dawn 档）；
 * junk=残骸↔轮胎堆（轮胎堆倚残骸——设计相邻）。
 */
export const WASTELAND_ITEMS: readonly LayoutItem[] = [
  { id: 'wasteland/purifier', x: PURIFIER_POS.x, z: PURIFIER_POS.z, radius: 0.8, kind: 'prop' },
  { id: 'wasteland/solar', x: SOLAR_POS.x, z: SOLAR_POS.z, radius: 2.2, kind: 'prop', note: '太阳能阵列 ×4 N-S 纵列（rot π/2 避塔/箱/网）' },
  { id: 'wasteland/barrel-grill', x: BARREL_GRILL_POS.x, z: BARREL_GRILL_POS.z, radius: 0.5, kind: 'prop' },
  { id: 'wasteland/crate', x: CRATE_POS.x, z: CRATE_POS.z, radius: 0.55, kind: 'prop', cluster: 'wasteland/crate' },
  { id: 'wasteland/tableware', x: CRATE_POS.x, z: CRATE_POS.z, radius: 0.35, kind: 'prop', cluster: 'wasteland/crate', note: '早餐餐具置于箱面（dawn 档出现）' },
  { id: 'wasteland/clothesline', x: CLOTHESLINE_POS.x, z: CLOTHESLINE_POS.z, radius: 1.75, kind: 'prop', note: '晾衣绳工装 ×3 N-S 张紧' },
  { id: 'wasteland/barrel-sign', x: BARREL_SIGN_POS.x, z: BARREL_SIGN_POS.z, radius: 0.6, kind: 'prop' },
  { id: 'wasteland/wreck', x: WRECK_POS.x, z: WRECK_POS.z, radius: 1.88, kind: 'prop', cluster: 'wasteland/junk' },
  { id: 'wasteland/tire-pyramid', x: TIRE_PYRAMID_POS.x, z: TIRE_PYRAMID_POS.z, radius: 0.6, kind: 'prop', cluster: 'wasteland/junk', note: '轮胎金字塔倚残骸堆放（设计相邻豁免）' },
  { id: 'wasteland/radar', x: RADAR_POS.x, z: RADAR_POS.z, radius: 1.0, kind: 'prop' },

  /* —— 地形一体构件（只登记不校验）—— */
  { id: 'wasteland/bunker', x: 0.35, z: -8.3, radius: 2.6, kind: 'terrain', note: '混凝土掩体+防爆门（后缘中央）' },
  { id: 'wasteland/watchtower', x: -7.35, z: -6.1, radius: 1.6, kind: 'terrain', note: '铁架瞭望塔+探照灯（后左角）' },
  { id: 'wasteland/container-a', x: -4.55, z: -8.45, radius: 2.8, kind: 'terrain', note: '锈蚀集装箱 ×5.3×2.25' },
  { id: 'wasteland/container-b', x: 5.35, z: -8.55, radius: 2.8, kind: 'terrain', note: '锈蚀集装箱 ×5.3×2.25' },
  { id: 'wasteland/wall-left', x: -8.5, z: -1.2, radius: 4.3, kind: 'terrain', note: '波纹铁皮围墙左段 z −5.4..+3.0' },
  { id: 'wasteland/wall-right', x: 8.45, z: -1.85, radius: 3.2, kind: 'terrain', note: '波纹铁皮围墙右段 z −5.0..+1.3' },
  { id: 'wasteland/net-left', x: -7.85, z: -4.7, radius: 3.4, kind: 'terrain', note: '缠绕铁丝网左段 6.6' },
  { id: 'wasteland/net-right', x: 7.75, z: -3.4, radius: 2.3, kind: 'terrain', note: '缠绕铁丝网右段 4.4' },
  { id: 'wasteland/net-back', x: -6.3, z: -6.9, radius: 1.7, kind: 'terrain', note: '缠绕铁丝网后段 3.2' },
  { id: 'wasteland/sandbag-west', x: -2.9, z: 4.55, radius: 1.4, kind: 'terrain', note: '沙袋工事门口西翼' },
  { id: 'wasteland/sandbag-east', x: 3.1, z: 4.75, radius: 1.4, kind: 'terrain', note: '沙袋工事门口东翼' },
  { id: 'wasteland/city-band', x: 0, z: -9.16, radius: 4.6, kind: 'terrain', note: '城市窗灯带（剪影板前带）' },
];
