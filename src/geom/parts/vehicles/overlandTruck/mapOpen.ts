// docs/01-整体架构.md §3.2 geom/parts/vehicles/overlandTruck/ —— T27 越野皮卡专用部件：地图。
// docs/03-车型模块.md §4.2.0 vehicleKit 表「mapOpen()：双段 Plane 微折+texScreenMap」；
// draft 12-车型模块 §7.3「unfoldedMap 摊开的地图（mapOpen）/ mapRoll 卷起的地图 Cylinder(0.03,0.45)+绑带」。
// 输出约定：摊开地图=沿 X 中缝微折（两段各带 ±折角），uv 全幅铺 texScreenMap；
//   卷地图=横置圆柱+绑带环合并单几何。
// ★ 禁止人形/人物几何（一.6）。
import * as THREE from 'three';
import type { SharedAssets } from '@/systems/handles';
import { hardenEdges, mergeGeometries } from '@/geom/primitives';

export interface MapOpenParams {
  /** 摊开全宽（X 向；0.52） */
  readonly width?: number;
  /** 单幅深（Z 向；0.36） */
  readonly depth?: number;
  /** 中缝折角（rad，微折；缺省 0.12） */
  readonly foldAngle?: number;
}

/** 摊开的地图：双段 Plane 微折合并（uv 各段铺满半幅贴图）。 */
export function createMapOpenGeometry(assets: SharedAssets, id: string, params: MapOpenParams = {}): THREE.BufferGeometry {
  const width = params.width ?? 0.52;
  const depth = params.depth ?? 0.36;
  const foldAngle = params.foldAngle ?? 0.12;
  const cacheId = `${id}|${width}|${depth}|${foldAngle.toFixed(3)}`;
  return assets.geometry(cacheId, () => {
    const halfWidth = width / 2;
    const parts: THREE.BufferGeometry[] = [];
    for (const side of [-1, 1]) {
      const segment = new THREE.PlaneGeometry(halfWidth, depth, 2, 2);
      const uv = segment.getAttribute('uv') as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) {
        // 每段铺贴图半幅：拼接后整幅 texScreenMap
        const u = uv.getX(i);
        uv.setX(i, side === -1 ? u * 0.5 : 0.5 + u * 0.5);
      }
      uv.needsUpdate = true;
      segment.rotateY(side === -1 ? foldAngle : -foldAngle); // 中缝微折（脊线略抬）
      segment.translate((side * halfWidth) / 2, 0, 0);
      parts.push(segment);
    }
    const merged = mergeGeometries(parts);
    if (!merged) throw new Error(`[overlandTruck/mapOpen] 合并失败：${cacheId}`);
    return merged;
  });
}

/** 卷起的地图：横置圆柱（轴向 X）+绑带环；原点=卷筒中心。 */
export function createMapRollGeometry(assets: SharedAssets, id: string, params: { readonly length?: number } = {}): THREE.BufferGeometry {
  const length = params.length ?? 0.45;
  const cacheId = `${id}|${length}`;
  return assets.geometry(cacheId, () => {
    const roll = new THREE.CylinderGeometry(0.03, 0.03, length, 10);
    roll.rotateZ(Math.PI / 2);
    const strap = new THREE.TorusGeometry(0.033, 0.006, 6, 12);
    strap.rotateY(Math.PI / 2);
    strap.translate(length * 0.22, 0, 0);
    const merged = mergeGeometries([hardenEdges(roll), hardenEdges(strap)]); // 统一非索引（mergeGeometries 属性一致性）
    if (!merged) throw new Error(`[overlandTruck/mapRoll] 合并失败：${cacheId}`);
    return merged;
  });
}
