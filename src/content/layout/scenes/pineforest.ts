// src/content/layout/scenes/pineforest.ts —— ★ 松林营地道具占位表（布局约束系统·场景侧单一来源）。
//
// 纯数据模块（零 three/DOM；仅 `import type` 引 core 契约——运行时零 import，node 可直接 import）。
// 数据流与规则见 core/layout.ts / layout/vehicles.ts 文件头。
//
// ★ 本轮重排（约束落地）：营位锚点 (0.4,0.2)，车辆包络圆（最大 classA 4.46）+0.25 → 道具环带
//   r ≥ 4.71+半径。旧坐标→新坐标逐条见常量行内注记。
//   ◆ 篝火圈+凳环（FIRE_POS 旧 (3.7,3.75)→(4.3,5.1)）：火圈石环 r0.7、凳环 r1.37 距包络 ≥0.18。
//   ◆ 锚树 ×2（东群东移）：ANCHOR_A (4.75,−0.55)→(6.5,1.4)、ANCHOR_B (4.45,2.45)→(6.2,4.4)
//     ——吊床/晾绳/鸟屋挂点随迁；吊床中点距包络 ≥0.50、晾绳整体出包络带。
//   ◆ 柴堆 ×3（旧 (5.65,−0.05)/(5.4,2.75)/(2.43,2.25)→新）：#0/#1 移出越野帆布杆带（旧↔杆
//     0.067），#2 随火圈东移。
//   ◆ 指示牌 (−4.45,1.75)→(−4.7,1.9)：距 classA 包络 0.17（原 0.729 为旧拖挂尾实测，圆口径
//     重新贴线）。
// 植被散布件不入静态占位表：松环 ×38（rng 散布，canPlaceTree 营位净空 4.35→4.9 同步收紧——
//   树干心距包络 ≥4.87）、蕨/苔/蘑菇 rng 散布、光斑（非实体层）。
import type { LayoutItem } from '@/core/layout';

/** 场景 id。 */
export const PINEFOREST_SCENE_ID = 'pineforest';

/** 营位锚点平面位（docs/02 §4.1.0 松林行 x/z 逐字）。 */
export const PINEFOREST_CAMP_POS = { x: 0.4, z: 0.2 } as const;

/* ============================== 道具布置位置常量（场景文件逐字 import） ============================== */

/** ② 篝火堆锚（旧 (3.7,3.75)→新；石圈 ringRadius 0.6+石径 → 半径 0.70）。 */
export const FIRE_POS = { x: 4.3, z: 5.1 } as const;

/** 锚树 ×2（承担吊床/晾绳/鸟屋挂点；旧 (4.75,−0.55)/(4.45,2.45)→新（东群东移出包络带））。 */
export const ANCHOR_A = { x: 6.5, z: 1.4 } as const;
export const ANCHOR_B = { x: 6.2, z: 4.4 } as const;

/** ⑨ 晾绳立柱（旧 (2.3,3.6)→新；绳自锚树 B 引出向东）。 */
export const TOWEL_POST = { x: 7.9, z: 5.6 } as const;

/** ⑤ 指路木牌（旧 (−4.45,1.75)→新；牌板 0.6 → 半径 0.50）。 */
export const SIGN_POS = { x: -4.7, z: 1.9 } as const;

/** ② 柴堆 ×3（旧 (5.65,−0.05)/(5.4,2.75)/(2.43,2.25)→新；金字塔堆径 0.45）。 */
export const FIREWOOD_POS = [
  { x: 5.9, z: -0.1, rotY: 0.5 },
  { x: 5.6, z: 1.05, rotY: -0.3 },
  { x: 2.7, z: 6.5, rotY: 0.9 },
] as const;

/** ⑩ 打水桶（(−6.7,−3.4) 原值逐字保留——溪岸位，距包络富余）；水瓢随行。 */
export const BUCKET_POS = { x: -6.7, z: -3.4 } as const;
export const LADLE_POS = { x: -6.42, z: -3.22 } as const;

/* ============================== 派生量（场景与占位表共用同一算式——非字面量但同源确定性） ============================== */

/** 凳环半径（凳心距火圈心 1.05 原值逐字）+ 凳径半 0.32 → 凳环包络 1.37。 */
export const BENCH_RING_RADIUS = 1.05;
export const BENCH_RING_ENVELOPE = 1.37;
/** 早餐餐具凳位（凳环 index 4：angle=(4/6)·2π+0.26 原式逐字）。 */
export const BENCH_RING_INDEX_BREAKFAST = 4;
/** 吊床包络：span=hypot(0.3,3.0)（锚树 A/B 新位）→ 布半长 1.51+宽半 0.28 → 1.55；中点=两树中点。 */
export const HAMMOCK_ENVELOPE = 1.55;
/** 晾绳包络：绳长 hypot(1.7,1.2) 半 1.04+毛巾投影 0.1 → 1.2；中点=锚树 B↔立柱中点。 */
export const TOWEL_LINE_ENVELOPE = 1.2;
/** 营位散布净空（canPlaceTree 树干心距营位锚点最小值；旧 4.35 → 收紧至包络+干半径+0.25）。 */
export const TREE_CAMP_CLEAR = 4.9;

/* ============================== 占位表 ============================== */

/**
 * 松林占位表。cluster 贴邻豁免（note 说明）：
 *   campfire=火圈↔凳环↔凳面早餐（环形贴邻）；anchor-east=同挂锚树 B 的吊床/晾绳/立柱/鸟屋；
 *   water-point=打水桶↔水瓢（瓢搁桶沿）。
 */
export const PINEFOREST_ITEMS: readonly LayoutItem[] = [
  { id: 'pineforest/campfire-pit', x: FIRE_POS.x, z: FIRE_POS.z, radius: 0.7, kind: 'prop', cluster: 'pineforest/campfire', note: '篝火石圈 ringRadius 0.6+石径' },
  { id: 'pineforest/log-bench-ring', x: FIRE_POS.x, z: FIRE_POS.z, radius: BENCH_RING_ENVELOPE, kind: 'prop', cluster: 'pineforest/campfire', note: '环形原木凳 ×6（凳心 r1.05 环火圈——「火圈↔凳环」贴邻豁免）' },
  { id: 'pineforest/breakfast', x: FIRE_POS.x - 0.272, z: FIRE_POS.z - 1.014, radius: 0.3, kind: 'prop', cluster: 'pineforest/campfire', note: '早餐餐具置于凳 4 凳面（dawn 档）' },
  { id: 'pineforest/firewood-0', x: FIREWOOD_POS[0].x, z: FIREWOOD_POS[0].z, radius: 0.45, kind: 'prop' },
  { id: 'pineforest/firewood-1', x: FIREWOOD_POS[1].x, z: FIREWOOD_POS[1].z, radius: 0.45, kind: 'prop' },
  { id: 'pineforest/firewood-2', x: FIREWOOD_POS[2].x, z: FIREWOOD_POS[2].z, radius: 0.45, kind: 'prop' },
  { id: 'pineforest/hammock', x: (ANCHOR_A.x + ANCHOR_B.x) / 2 + 0.25, z: (ANCHOR_A.z + ANCHOR_B.z) / 2, radius: HAMMOCK_ENVELOPE, kind: 'prop', cluster: 'pineforest/anchor-east', note: '吊床挂锚树 A/B（布沿 x 外挪 0.25 原修复保留）；同树晾绳贴邻豁免' },
  { id: 'pineforest/towel-line', x: (ANCHOR_B.x + TOWEL_POST.x) / 2, z: (ANCHOR_B.z + TOWEL_POST.z) / 2, radius: TOWEL_LINE_ENVELOPE, kind: 'prop', cluster: 'pineforest/anchor-east', note: '晾绳+毛巾 ×3 自锚树 B 引出（同树挂点贴邻豁免）' },
  { id: 'pineforest/towel-post', x: TOWEL_POST.x, z: TOWEL_POST.z, radius: 0.15, kind: 'prop', cluster: 'pineforest/anchor-east' },
  { id: 'pineforest/birdhouse', x: ANCHOR_B.x - 0.097, z: ANCHOR_B.z - 0.07, radius: 0.25, kind: 'prop', cluster: 'pineforest/anchor-east', note: '鸟屋挂锚树 B 干 h1.5（朝营位向 0.12 偏移）' },
  { id: 'pineforest/trail-sign', x: SIGN_POS.x, z: SIGN_POS.z, radius: 0.5, kind: 'prop' },
  { id: 'pineforest/bucket', x: BUCKET_POS.x, z: BUCKET_POS.z, radius: 0.3, kind: 'prop', cluster: 'pineforest/water-point' },
  { id: 'pineforest/ladle', x: LADLE_POS.x, z: LADLE_POS.z, radius: 0.2, kind: 'prop', cluster: 'pineforest/water-point', note: '水瓢搁桶旁溪岸' },

  /* —— 地形一体构件（只登记不校验）—— */
  { id: 'pineforest/platform', x: -3.3, z: -2.9, radius: 2.99, kind: 'terrain', note: '木质营位平台 4.6×3.8（J2 车辆不停平台）' },
  { id: 'pineforest/platform-steps', x: -1.73, z: -0.23, radius: 0.75, kind: 'terrain', note: '营位→平台木阶 ×5' },
  { id: 'pineforest/bridge', x: -8.55, z: -4.83, radius: 2.5, kind: 'terrain', note: '跨溪小木桥 4.6×1.05' },
  { id: 'pineforest/bear-box', x: -1.75, z: -2.0, radius: 0.55, kind: 'terrain', note: '防熊食物储藏箱置平台面（随平台豁免，J2）' },
  { id: 'pineforest/camp-pad', x: 0.4, z: 0.2, radius: 4.0, kind: 'terrain', note: '营位碎石垫面（地形贴花）' },
];
