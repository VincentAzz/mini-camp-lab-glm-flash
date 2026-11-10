// scripts/check-layout.mjs —— ★ 布局约束静态校验（4 场景 × 5 车型全矩阵）。
//
// 与浏览器内 Director（DEV）共用同一份数据与同一套校验逻辑：
//   数据 = src/content/layout/**（纯数据模块，零 three/DOM——node v24 原生 TS 类型剥离直读）
//   逻辑 = src/core/layout.ts 的 LayoutGrid.verify（场景 buildProps 与本脚本共用）
// 校验规则：车辆包络圆 vs prop 圆净距 ≥0.25（不可豁免）；prop 两两净距 ≥0.01（cluster 贴邻豁免）；
//   terrain 类只登记不校验（见 core/layout.ts 文件头设计注记）。
// 有违规 → 明细表 + exit 1；全绿 → exit 0。
import { layoutGrid } from '../src/core/layout.ts';
import { VEHICLE_ENVELOPES } from '../src/content/layout/vehicles.ts';
import { SEA_CLIFF_SCENE_ID, SEA_CLIFF_CAMP_POS, SEA_CLIFF_ITEMS } from '../src/content/layout/scenes/seacliff.ts';
import { PINEFOREST_SCENE_ID, PINEFOREST_CAMP_POS, PINEFOREST_ITEMS } from '../src/content/layout/scenes/pineforest.ts';
import { WASTELAND_SCENE_ID, WASTELAND_CAMP_POS, WASTELAND_ITEMS } from '../src/content/layout/scenes/wasteland.ts';
import { SERVICEAREA_SCENE_ID, SERVICEAREA_CAMP_POS, SERVICEAREA_ITEMS } from '../src/content/layout/scenes/servicearea.ts';

const SCENES = [
  [SEA_CLIFF_SCENE_ID, SEA_CLIFF_CAMP_POS, SEA_CLIFF_ITEMS],
  [PINEFOREST_SCENE_ID, PINEFOREST_CAMP_POS, PINEFOREST_ITEMS],
  [WASTELAND_SCENE_ID, WASTELAND_CAMP_POS, WASTELAND_ITEMS],
  [SERVICEAREA_SCENE_ID, SERVICEAREA_CAMP_POS, SERVICEAREA_ITEMS],
];

layoutGrid.setVehicleEnvelopes(VEHICLE_ENVELOPES);
for (const [sceneId, anchor, items] of SCENES) layoutGrid.register(sceneId, items, anchor);

const vehicleIds = VEHICLE_ENVELOPES.map((v) => v.id);
const propCounts = SCENES.map(([id, , items]) => `${id}: ${items.filter((i) => i.kind === 'prop').length} prop / ${items.filter((i) => i.kind === 'terrain').length} terrain`);

console.log('== check:layout 布局约束校验 ==');
console.log(`车型包络表：${vehicleIds.map((id) => `${id}=${VEHICLE_ENVELOPES.find((v) => v.id === id).envelopeRadius.toFixed(3)}u`).join('  ')}`);
console.log(`场景占位：${propCounts.join('  ')}`);
console.log(`矩阵：${SCENES.length} 场景 × ${vehicleIds.length} 车型\n`);

let total = 0;
const perCombo = [];
for (const [sceneId] of SCENES) {
  for (const vehicleId of vehicleIds) {
    const violations = layoutGrid.verify(sceneId, vehicleId);
    total += violations.length;
    perCombo.push([sceneId, vehicleId, violations]);
  }
}

if (total > 0) {
  console.log(`✗ 违规 ${total} 条：`);
  console.log('');
  console.log('| 场景 × 车型 | 类型 | 双方 | 净距 | 要求 |');
  console.log('|---|---|---|---|---|');
  for (const [sceneId, vehicleId, violations] of perCombo) {
    for (const v of violations) {
      const pair = v.type === 'vehicle-prop' ? `${v.bId} ↔ ${v.aId}(包络)` : `${v.aId} ↔ ${v.bId}`;
      console.log(`| ${sceneId}×${vehicleId} | ${v.type} | ${pair} | ${v.gap.toFixed(3)} | ${v.required} |`);
    }
  }
  process.exit(1);
}

console.log('✓ 全绿：4 场景 × 5 车型 全矩阵 0 违规（车辆包络×道具净距 ≥0.25；道具两两净距 ≥0.01）');
console.log('');
console.log('—— 逐组合最小车辆净距一览（对角线=0 即贴线，正=富余） ——');
for (const [sceneId, anchor] of SCENES) {
  const items = layoutGrid.itemsOf(sceneId).filter((i) => i.kind === 'prop');
  const row = vehicleIds.map((vehicleId) => {
    const env = layoutGrid.envelopeOf(vehicleId).envelopeRadius;
    const min = Math.min(...items.map((i) => Math.hypot(i.x - anchor.x, i.z - anchor.z) - i.radius - env));
    return `${vehicleId} ${min >= 0 ? '+' : ''}${min.toFixed(2)}`;
  });
  console.log(`  ${sceneId.padEnd(12)} ${row.join('  ')}`);
}
process.exit(0);
