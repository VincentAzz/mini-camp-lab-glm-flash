// docs/01-整体架构.md §3.2 geom/parts/vehicles/overlandTruck/ —— T27 越野皮卡专用部件：车顶行李架平台。
// docs/03-车型模块.md §4.2.0 vehicleKit 表「roofRack(w, d)：4 立柱+2 纵梁+网格横条 InstancedMesh」；
// draft 12-车型模块 §7.1「roofRack(2.0,1.3)+台面网格条 ×7——RTT 基座」。
// 输出约定：局部原点=台面顶面中心（台面 y=0）；立柱向下伸（前腿/后腿分别给定落地深度——
//   越野皮卡前腿落双排舱顶、后腿落货斗栏板顶，腿高不同）。
// 网格横条 ×7 merge 进单几何（1 draw call，§5.6 合批收益同 InstancedMesh）。
// ★ 禁止人形/人物几何（一.6）。
import * as THREE from 'three';
import type { SharedAssets } from '@/systems/handles';
import { hardenEdges, mergeGeometries, roundedBox } from '@/geom/primitives';

export interface RoofRackParams {
  /** 台面长（沿车长 X；2.0） */
  readonly length: number;
  /** 台面宽（Z 向；1.3） */
  readonly width: number;
  /** 前腿落地深度（台面下沿到前支承面；0.12） */
  readonly legFront: number;
  /** 后腿落地深度（0.52） */
  readonly legRear: number;
  /** 网格横条数（7——draft 定值） */
  readonly strips: number;
}

export interface RoofRackParts {
  /** 架体（台面板+2 纵梁+4 立柱，含不同腿深） */
  readonly frameGeometry: THREE.BufferGeometry;
  /** 台面网格横条 ×7（单独几何，可另配材质） */
  readonly stripsGeometry: THREE.BufferGeometry;
}

/** 行李架平台：原点=台面顶面中心；frame 含台面/纵梁/立柱，strips 为台面网格条。 */
export function createRoofRackParts(assets: SharedAssets, id: string, params: RoofRackParams): RoofRackParts {
  const { length, width, legFront, legRear, strips } = params;
  const cacheId = `${id}|${length}|${width}|${legFront}|${legRear}|${strips}`;
  const frameGeometry = assets.geometry(`${cacheId}/frame`, () => {
    const parts: THREE.BufferGeometry[] = [
      hardenEdges(roundedBox({ width: length, height: 0.045, depth: width, radius: 0.012 })),
    ];
    for (const side of [-1, 1]) {
      const beam = hardenEdges(roundedBox({ width: length - 0.08, height: 0.05, depth: 0.05, radius: 0.01 }));
      beam.translate(0, -0.048, (side * (width - 0.1)) / 2);
      parts.push(beam);
    }
    // 4 立柱：前腿落双排舱顶（浅）、后腿落货斗栏板顶（深）
    const legXs = [-(length / 2 - 0.12), length / 2 - 0.12];
    for (const [index, x] of legXs.entries()) {
      const legDepth = index === 0 ? legRear : legFront;
      for (const side of [-1, 1]) {
        const leg = new THREE.CylinderGeometry(0.028, 0.028, legDepth + 0.05, 8);
        leg.translate(x, -(legDepth + 0.05) / 2 + 0.02, (side * (width - 0.1)) / 2);
        parts.push(hardenEdges(leg));
        const foot = new THREE.BoxGeometry(0.1, 0.02, 0.1);
        foot.translate(x, -legDepth + 0.005, (side * (width - 0.1)) / 2);
        parts.push(hardenEdges(foot));
      }
    }
    const merged = mergeGeometries(parts);
    if (!merged) throw new Error(`[overlandTruck/roofRack] 架体合并失败：${cacheId}`);
    return merged;
  });
  const stripsGeometry = assets.geometry(`${cacheId}/strips`, () => {
    const parts: THREE.BufferGeometry[] = [];
    const stripGeometry = hardenEdges(roundedBox({ width: 0.05, height: 0.028, depth: width - 0.08, radius: 0.008 }));
    for (let i = 0; i < strips; i++) {
      const x = -length / 2 + 0.14 + ((length - 0.28) * i) / (strips - 1);
      const strip = stripGeometry.clone();
      strip.translate(x, -0.034, 0);
      parts.push(strip);
    }
    const merged = mergeGeometries(parts);
    if (!merged) throw new Error(`[overlandTruck/roofRack] 网格条合并失败：${cacheId}`);
    return merged;
  });
  return { frameGeometry, stripsGeometry };
}
