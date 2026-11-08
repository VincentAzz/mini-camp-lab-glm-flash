// docs/01-整体架构.md §3.2 geom/parts/vehicles/overlandTruck/ —— T27 越野皮卡专用部件：梯子。
// docs/03-车型模块.md §4.2.0 vehicleKit 表「ladder(h, rungs)：双立柱 Cylinder(0.02)+横档」；
// draft 12-车型模块 §7.1「登车梯 ladder(2.1,5) 从下壳外缘斜落地 / 车侧爬梯 ladder(1.7,4) 贴尾左侧」。
// 输出约定：局部原点=梯底中点，+Y 上到梯顶（h 即立柱总长）；倾斜由调用方 rotation.z 承担。
// 横档少（≤6）直接 merge 进单几何（1 draw call，与 InstancedMesh 同等合批收益——§5.6），非独立实例。
// ★ 禁止人形/人物几何（一.6）。
import * as THREE from 'three';
import type { SharedAssets } from '@/systems/handles';
import { hardenEdges, mergeGeometries } from '@/geom/primitives';

export interface LadderParams {
  /** 梯总长（立柱长，u≈m；帐篷登车梯 2.1 / 车侧爬梯 1.7） */
  readonly height: number;
  /** 横档数（5 / 4） */
  readonly rungs: number;
  /** 梯宽（立柱间距，缺省 0.42） */
  readonly width?: number;
}

/** 梯子几何：双立柱+横档合并单几何；原点=梯底中点，梯顶在局部 +Y=h。 */
export function createLadderGeometry(assets: SharedAssets, id: string, params: LadderParams): THREE.BufferGeometry {
  const { height, rungs } = params;
  const width = params.width ?? 0.42;
  const cacheId = `${id}|${height}|${rungs}|${width}`;
  return assets.geometry(cacheId, () => {
    const parts: THREE.BufferGeometry[] = [];
    for (const side of [-1, 1]) {
      const rail = new THREE.CylinderGeometry(0.02, 0.02, height, 8);
      rail.translate((side * width) / 2, height / 2, 0);
      parts.push(hardenEdges(rail));
    }
    const rungGeometry = new THREE.CylinderGeometry(0.014, 0.014, width, 8);
    rungGeometry.rotateZ(Math.PI / 2);
    for (let i = 0; i < rungs; i++) {
      const t = rungs === 1 ? 0.5 : i / (rungs - 1);
      const rung = rungGeometry.clone();
      rung.translate(0, height * (0.14 + 0.78 * t), 0); // 首末档留踏距余量
      parts.push(hardenEdges(rung));
    }
    const merged = mergeGeometries(parts);
    if (!merged) throw new Error(`[overlandTruck/ladder] 合并失败：${cacheId}`);
    return merged;
  });
}
