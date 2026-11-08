// docs/01-整体架构.md §3.2 geom/parts/vehicles/classB/ —— T26 B型面包车专用部件：小盆栽。
// docs/03-车型模块.md §4.2.0 vehicleKit 表「plantPot」；§4.2.4 内饰清单「plantPot 小盆栽（台面角）」。
// 陶盆 Lathe + 土面 + 叶丛（锥叶 5 片外倾+中心立叶；foliage 原型）——绿植几何，非人形（一.6 红线）。
import * as THREE from 'three';
import type { SharedAssets } from '@/systems/handles';
import { toonMaterials } from '@/render/toonMaterial';
import { hardenEdges, lathe, mergeGeometries } from '@/geom/primitives';

export interface PlantPotParams {
  readonly assets: SharedAssets;
  /** 缓存/日志 id */
  readonly id: string;
  /** 盆口径（缺省 0.11——台面角小盆） */
  readonly radius?: number;
  /** 陶盆色 */
  readonly potColor?: string;
  /** 叶丛色 */
  readonly leafColor?: string;
  /** 工厂材质 name 前缀（缓存键） */
  readonly name: string;
}

/** 小盆栽：陶盆（Lathe）+土面+叶丛（锥叶 5+1）；原点=盆底。 */
export function createPlantPot(params: PlantPotParams): THREE.Group {
  const { assets, id, name } = params;
  const radius = params.radius ?? 0.11;

  const group = new THREE.Group();
  group.name = `${id}/plant-pot`;

  const pot = new THREE.Mesh(
    assets.geometry(`${id}/pot|${radius}`, () =>
      hardenEdges(
        lathe({
          profile: [
            [radius * 0.62, 0],
            [radius * 0.66, 0.005],
            [radius * 0.88, 0.09],
            [radius * 0.92, 0.1],
            [radius, 0.115],
            [radius * 0.94, 0.118],
            [radius * 0.9, 0.1],
          ],
          segments: 12,
        }),
      )),
    toonMaterials.get('matteProp', { color: params.potColor ?? '#b9704f', name: `${name}/pot` }),
  );
  pot.name = `${id}/pot`;
  group.add(pot);

  const soil = new THREE.Mesh(
    assets.geometry(`${id}/soil`, () => hardenEdges(new THREE.CylinderGeometry(radius * 0.84, radius * 0.8, 0.02, 10))),
    toonMaterials.get('groundTerrain', { color: '#3d3229', name: `${name}/soil` }),
  );
  soil.name = `${id}/soil`;
  soil.position.y = 0.1;
  group.add(soil);

  // 叶丛：中心立叶 + 外倾锥叶 ×5（单几何合并=1 DC）
  const leafHeight = radius * 2.6;
  const leavesGeometry = assets.geometry(`${id}/leaves|${radius}`, () => {
    const parts: THREE.BufferGeometry[] = [];
    const center = new THREE.ConeGeometry(radius * 0.16, leafHeight, 6);
    center.translate(0, leafHeight / 2 + 0.1, 0);
    parts.push(hardenEdges(center));
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2;
      const leaf = new THREE.ConeGeometry(radius * 0.14, leafHeight * 0.78, 5);
      leaf.translate(0, (leafHeight * 0.78) / 2 + 0.09, 0);
      leaf.rotateX(0.62); // 外倾
      leaf.rotateY(angle);
      parts.push(hardenEdges(leaf));
    }
    const merged = mergeGeometries(parts);
    if (!merged) throw new Error(`[classB/plantPot] 叶丛合并失败：${id}`);
    return merged;
  });
  const leaves = new THREE.Mesh(
    leavesGeometry,
    toonMaterials.get('foliage', { color: params.leafColor ?? '#4f7a5a', name: `${name}/leaves` }),
  );
  leaves.name = `${id}/leaves`;
  group.add(leaves);

  group.traverse((object) => {
    object.userData.noOutline = true; // 内饰小件 noOutline
  });
  return group;
}
