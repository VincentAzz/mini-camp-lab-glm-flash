// docs/01-整体架构.md §3.2 geom/parts/pineforest/logBench.ts —— 可复用部件库 logBench（松林首创）。
// docs/02-场景模块.md §4.1.2 2.2.2-②「环形原木凳 ×6」/ ⑧「柴堆（金字塔 ×6 根，堆体实例化）」；
// docs/04-三渲二渲染.md §5.6 实例化清单「松林=…原木凳…柴堆」——原点=地面中心，供 InstancedGroup。
// ★ 禁止人形/人物几何（一.6）。T19 落点。
import * as THREE from 'three';
import type { SharedAssets } from '@/systems/handles';
import { hardenEdges, mergeGeometries } from '@/geom/primitives';

/** 原木凳几何（横卧圆木 + 两端垫石短桩；座高 ≈0.3）。确定性形，供实例化。 */
export function createLogBenchGeometry(assets: SharedAssets, id: string): THREE.BufferGeometry {
  return assets.geometry(id, () => {
    const parts: THREE.BufferGeometry[] = [];
    const log = new THREE.CylinderGeometry(0.115, 0.125, 0.82, 9);
    log.rotateZ(Math.PI / 2); // 横卧：轴向 x
    log.translate(0, 0.225, 0);
    parts.push(hardenEdges(log));
    for (const side of [-1, 1]) {
      const stub = new THREE.CylinderGeometry(0.06, 0.07, 0.16, 7);
      stub.translate(side * 0.3, 0.08, 0);
      parts.push(hardenEdges(stub));
    }
    const merged = mergeGeometries(parts);
    if (!merged) throw new Error(`[logBench] 原木凳合并失败 ${id}`);
    return merged;
  });
}

/** 柴堆金字塔几何（2+3+1? →「金字塔 ×6」= 底 3 + 中 2 + 顶 1，确定性错缝）。供实例化堆放。 */
export function createFirewoodPyramidGeometry(assets: SharedAssets, id: string): THREE.BufferGeometry {
  return assets.geometry(id, () => {
    const parts: THREE.BufferGeometry[] = [];
    const rows: readonly { count: number; y: number }[] = [
      { count: 3, y: 0.07 },
      { count: 2, y: 0.21 },
      { count: 1, y: 0.35 },
    ];
    rows.forEach((row, ri) => {
      for (let i = 0; i < row.count; i++) {
        const log = new THREE.CylinderGeometry(0.055, 0.06, 0.56, 7);
        log.rotateZ(Math.PI / 2); // 轴向 → x（偶数行）
        const alongZ = ri % 2 === 1; // 奇数行转向 z（错缝码放）
        if (alongZ) log.rotateY(Math.PI / 2);
        const spread = 0.13;
        const offset = (i - (row.count - 1) / 2) * spread;
        if (alongZ) {
          log.translate(0, row.y, offset);
        } else {
          log.translate(offset, row.y, 0);
        }
        parts.push(hardenEdges(log));
      }
    });
    const merged = mergeGeometries(parts);
    if (!merged) throw new Error(`[logBench] 柴堆金字塔合并失败 ${id}`);
    return merged;
  });
}
