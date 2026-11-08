// docs/01-整体架构.md §3.2 geom/parts/foldTable.ts —— 可复用部件库 foldTable（折叠野餐桌）。
// docs/02-场景模块.md §4.1.0：海崖首创（2.1.2-①「桌椅复用 foldTable/foldChair」），服务区复用。
// 建模：铝架 X 形腿 ×2 + 横撑 + 白色 HDPE 桌面（圆角板）；材质经 ToonMaterialFactory metal/matteProp。
// ★ 禁止人形/人物几何（一.6）。T18 落点。
import * as THREE from 'three';
import type { SharedAssets } from '@/systems/handles';
import { toonMaterials } from '@/render/toonMaterial';
import { mergeGeometries, hardenEdges, roundedBox } from '@/geom/primitives';

export interface FoldTableParams {
  readonly assets: SharedAssets;
  /** 缓存 id（跨场景共享） */
  readonly id: string;
  /** 桌面尺寸（默认 1.15×0.7，高 0.62——微缩观感 1u≈1m 折叠桌比例） */
  readonly topWidth?: number;
  readonly topDepth?: number;
  readonly height?: number;
}

/** 折叠桌（原点=地面中心；桌面长边沿 x）。 */
export function createFoldTable(params: FoldTableParams): THREE.Group {
  const { assets, id } = params;
  const topWidth = params.topWidth ?? 1.15;
  const topDepth = params.topDepth ?? 0.7;
  const height = params.height ?? 0.62;
  const group = new THREE.Group();
  group.name = id;

  // —— 桌面（1 DC）——
  const topGeometry = roundedBox({ width: topWidth, height: 0.045, depth: topDepth, radius: 0.02 });
  topGeometry.translate(0, height, 0);
  const topMaterial = toonMaterials.get('matteProp', { color: '#e8e6df', name: `${id}/top` });
  const top = new THREE.Mesh(assets.geometry(`${id}/top`, () => hardenEdges(topGeometry)), topMaterial);
  top.name = `${id}/top`;
  top.castShadow = true;
  top.receiveShadow = true;
  group.add(top);

  // —— 铝架（1 DC：X 腿 ×2 + 横撑 ×2）——
  const frameGeometries: THREE.BufferGeometry[] = [];
  const legTop = height - 0.05;
  for (const side of [-1, 1]) {
    const legLength = Math.hypot(legTop, topDepth - 0.16);
    for (const tilt of [-1, 1]) {
      const leg = new THREE.CylinderGeometry(0.016, 0.016, legLength, 8);
      leg.translate(0, legLength / 2, 0);
      leg.rotateX(tilt * Math.atan2(legTop, topDepth - 0.16) * -1);
      leg.translate(side * (topWidth / 2 - 0.1), 0.03, 0);
      frameGeometries.push(hardenEdges(leg));
    }
    const bar = new THREE.CylinderGeometry(0.014, 0.014, topDepth - 0.14, 8);
    bar.rotateX(Math.PI / 2);
    bar.translate(side * (topWidth / 2 - 0.1), 0.1, 0);
    frameGeometries.push(hardenEdges(bar));
  }
  const frameMerged = mergeGeometries(frameGeometries);
  if (!frameMerged) throw new Error(`[foldTable] 铝架合并失败 ${id}`);
  const frameMaterial = toonMaterials.get('metal', { color: '#8f9aa6', name: `${id}/frame` });
  const frame = new THREE.Mesh(assets.geometry(`${id}/frame`, () => frameMerged), frameMaterial);
  frame.name = `${id}/frame`;
  frame.castShadow = true;
  group.add(frame);

  return group;
}
