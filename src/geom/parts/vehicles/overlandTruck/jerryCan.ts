// docs/01-整体架构.md §3.2 geom/parts/vehicles/overlandTruck/ —— T27 越野皮卡专用部件：油桶/工具箱/水箱座。
// docs/03-车型模块.md §4.2.0 vehicleKit 表「jerryCan(color)：圆角盒+壶嘴斜管+盖」；
// draft 12-车型模块 §7.1「货斗四件：油桶 jerryCan('#b3541e')+水箱 roundedBox+透明水位条+toolbox()」。
// 输出约定：局部原点=桶底中心，+Y 上；壶嘴/盖合并进单几何，调用方给主材质（水位条等透明件由调用方另配）。
// ★ 禁止人形/人物几何（一.6）。
import * as THREE from 'three';
import type { SharedAssets } from '@/systems/handles';
import { hardenEdges, mergeGeometries, roundedBox, tube } from '@/geom/primitives';

export interface JerryCanParams {
  /** 桶高（缺省 0.42——货斗栏板 1.62 内不冒头） */
  readonly height?: number;
  /** 桶宽（X 向，缺省 0.34） */
  readonly width?: number;
  /** 桶厚（Z 向，缺省 0.24） */
  readonly depth?: number;
}

/** 油桶几何：圆角桶身+斜壶嘴+桶盖；原点=桶底中心。 */
export function createJerryCanGeometry(assets: SharedAssets, id: string, params: JerryCanParams = {}): THREE.BufferGeometry {
  const height = params.height ?? 0.42;
  const width = params.width ?? 0.34;
  const depth = params.depth ?? 0.24;
  const cacheId = `${id}|${height}|${width}|${depth}`;
  return assets.geometry(cacheId, () => {
    const body = hardenEdges(roundedBox({ width, height, depth, radius: 0.03 }));
    body.translate(0, height / 2, 0);
    // 壶嘴斜管（右上角伸出）+盖
    const spout = tube({
      pointsOrCurve: [
        new THREE.Vector3(width * 0.18, height * 0.72, 0),
        new THREE.Vector3(width * 0.34, height * 0.9, 0),
        new THREE.Vector3(width * 0.5, height + 0.09, 0),
      ],
      radius: 0.026,
      tubularSegments: 10,
    });
    spout.translate(0, 0, 0);
    const cap = new THREE.CylinderGeometry(0.034, 0.034, 0.03, 10);
    cap.translate(width * 0.5, height + 0.11, 0);
    // 侧面凹槽把手（X 凸筋读法：两条竖凹槽用窄盒浅贴表达）
    const ribGeometry = new THREE.BoxGeometry(width * 0.96, height * 0.62, 0.012);
    const parts: THREE.BufferGeometry[] = [body, hardenEdges(spout), hardenEdges(cap)];
    for (const side of [-1, 1]) {
      const rib = ribGeometry.clone();
      rib.translate(0, height * 0.52, (side * depth) / 2);
      parts.push(hardenEdges(rib));
    }
    const merged = mergeGeometries(parts);
    if (!merged) throw new Error(`[overlandTruck/jerryCan] 合并失败：${cacheId}`);
    return merged;
  });
}
