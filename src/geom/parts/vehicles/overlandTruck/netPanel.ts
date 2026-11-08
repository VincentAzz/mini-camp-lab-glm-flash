// docs/01-整体架构.md §3.2 geom/parts/vehicles/overlandTruck/ —— T27 越野皮卡专用部件：杂物网兜。
// docs/03-车型模块.md §4.2.0 vehicleKit 表「netPanel(w, h)：Plane+texGauze alpha+四角挂点」；
// draft 12-车型模块 §7.3「cargoNet(0.8,0.5) 张于后舱顶缘四挂点，中部下垂弧」。
// 输出约定：网面=带下垂弧的细分 Plane（局部 X 宽向/Y 高向，法线 +Z；水平张挂由调用方旋转），
//   uv 保留供 texGauze alpha；四角挂环几何单独返回（torus 合并）。
// ★ 禁止人形/人物几何（一.6）。
import * as THREE from 'three';
import type { SharedAssets } from '@/systems/handles';
import { hardenEdges, mergeGeometries } from '@/geom/primitives';

export interface CargoNetParams {
  /** 网面宽（X 向；0.8） */
  readonly width: number;
  /** 网面高（Y 向；0.5） */
  readonly height: number;
  /** 中部下垂深（局部 −Y；0.12） */
  readonly sag?: number;
}

export interface CargoNetParts {
  /** 网面几何（texGauze alpha 材质由调用方给） */
  readonly netGeometry: THREE.BufferGeometry;
  /** 四角挂环（torus ×4 合并，金属材质由调用方给） */
  readonly hookGeometry: THREE.BufferGeometry;
}

/** 网兜：细分 Plane 中部下垂（sin 弧）+四角挂环。 */
export function createCargoNetParts(assets: SharedAssets, id: string, params: CargoNetParams): CargoNetParts {
  const { width, height } = params;
  const sag = params.sag ?? 0.12;
  const cacheId = `${id}|${width}|${height}|${sag}`;
  const netGeometry = assets.geometry(`${cacheId}/net`, () => {
    const geometry = new THREE.PlaneGeometry(width, height, 8, 6);
    const position = geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i);
      const y = position.getY(i);
      const drop = Math.sin((Math.PI * (x + width / 2)) / width) * Math.sin((Math.PI * (y + height / 2)) / height) * sag;
      position.setZ(i, -drop); // 局部 −Z 下垂（网面法线 +Z 时为「沉向车内」读法由调用方定向）
    }
    position.needsUpdate = true;
    geometry.computeVertexNormals();
    return geometry;
  });
  const hookGeometry = assets.geometry(`${cacheId}/hook`, () => {
    const ringGeometry = hardenEdges(new THREE.TorusGeometry(0.018, 0.005, 6, 10));
    const parts: THREE.BufferGeometry[] = [];
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      const ring = ringGeometry.clone();
      ring.translate((sx * width) / 2, (sy * height) / 2, 0);
      parts.push(ring);
    }
    const merged = mergeGeometries(parts);
    if (!merged) throw new Error(`[overlandTruck/netPanel] 挂环合并失败：${cacheId}`);
    return merged;
  });
  return { netGeometry, hookGeometry };
}
