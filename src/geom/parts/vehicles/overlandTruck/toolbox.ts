// docs/01-整体架构.md §3.2 geom/parts/vehicles/overlandTruck/ —— T27 越野皮卡专用部件：工具箱。
// docs/03-车型模块.md §4.2.0 vehicleKit 表「toolbox()：圆角盒+搭扣 2+提手弯管」；
// draft 12-车型模块 §7.1「货斗 toolbox()」/§7.3「crateA/B：toolbox() 变体大小两件」。
// 输出约定：局部原点=箱底中心，+Y 上；提手管+搭扣合并进单几何。
// ★ 禁止人形/人物几何（一.6）。
import * as THREE from 'three';
import type { SharedAssets } from '@/systems/handles';
import { hardenEdges, mergeGeometries, roundedBox, tube } from '@/geom/primitives';

export interface ToolboxParams {
  /** 箱宽（X 向；货斗toolbox 0.5 / crateA 0.42 / crateB 0.3） */
  readonly width?: number;
  /** 箱高（缺省 0.22） */
  readonly height?: number;
  /** 箱深（Z 向，缺省 0.28） */
  readonly depth?: number;
}

/** 工具箱几何：圆角箱身+2 搭扣+拱形提手；原点=箱底中心。 */
export function createToolboxGeometry(assets: SharedAssets, id: string, params: ToolboxParams = {}): THREE.BufferGeometry {
  const width = params.width ?? 0.5;
  const height = params.height ?? 0.22;
  const depth = params.depth ?? 0.28;
  const cacheId = `${id}|${width}|${height}|${depth}`;
  return assets.geometry(cacheId, () => {
    const body = hardenEdges(roundedBox({ width, height, depth, radius: 0.025 }));
    body.translate(0, height / 2, 0);
    const parts: THREE.BufferGeometry[] = [body];
    // 搭扣 ×2（前后面各 2 只中取前 2——箱正面朝 +Z 时扣在 +Z/−Z 两窄面各一只中位）
    const latchGeometry = hardenEdges(new THREE.BoxGeometry(0.05, 0.045, 0.02));
    for (const side of [-1, 1]) {
      const latch = latchGeometry.clone();
      latch.translate(0, height * 0.62, (side * (depth + 0.015)) / 2);
      parts.push(latch);
    }
    // 提手拱形弯管（箱顶中央）
    const handle = tube({
      pointsOrCurve: [
        new THREE.Vector3(-width * 0.22, height, 0),
        new THREE.Vector3(-width * 0.12, height + 0.055, 0),
        new THREE.Vector3(width * 0.12, height + 0.055, 0),
        new THREE.Vector3(width * 0.22, height, 0),
      ],
      radius: 0.013,
      tubularSegments: 12,
    });
    parts.push(hardenEdges(handle));
    const merged = mergeGeometries(parts);
    if (!merged) throw new Error(`[overlandTruck/toolbox] 合并失败：${cacheId}`);
    return merged;
  });
}
