// docs/01-整体架构.md §3.2 geom/parts/pineforest/birdhouse.ts —— 鸟屋+防熊食物储藏箱（松林首创）。
// docs/02-场景模块.md §4.1.2 2.2.2-⑥：「鸟屋+防熊食物储藏箱（挂锚树干 h1.5 / 平台边）」。
// 无人物红线（一.6）：鸟屋为动物设施非人物；箱体无图形文字。
// ★ 禁止人形/人物几何（一.6）。T19 落点。
import * as THREE from 'three';
import type { SharedAssets } from '@/systems/handles';
import { toonMaterials } from '@/render/toonMaterial';
import { hardenEdges, mergeGeometries, roundedBox } from '@/geom/primitives';

export interface BirdhouseResult {
  /** 鸟屋组（原点=悬挂环顶部；挂到锚树干 h1.5 由场景摆放） */
  readonly group: THREE.Group;
}

/** 悬挂鸟屋：小屋身+双坡顶+圆洞门+栖木+挂环（合计 3 DC）。 */
export function createBirdhouse(assets: SharedAssets, id: string): BirdhouseResult {
  const group = new THREE.Group();
  group.name = id;
  const woodMat = toonMaterials.get('wood', { color: '#a8825c', name: `${id}/body` });
  const roofMat = toonMaterials.get('wood', { color: '#6d523c', name: `${id}/roof` });
  const darkMat = toonMaterials.get('matteProp', { color: '#3a3d44', name: `${id}/hole` });

  const body = new THREE.Mesh(
    assets.geometry(`${id}/body`, () => {
      const box = roundedBox({ width: 0.17, height: 0.2, depth: 0.15, radius: 0.012 });
      box.translate(0, -0.13, 0);
      return hardenEdges(box);
    }),
    woodMat,
  );
  body.name = `${id}/body`;
  body.castShadow = true;
  group.add(body);

  const roof = new THREE.Mesh(
    assets.geometry(`${id}/roof`, () => {
      const parts: THREE.BufferGeometry[] = [];
      for (const side of [-1, 1]) {
        const slab = new THREE.BoxGeometry(0.11, 0.016, 0.2);
        slab.rotateZ(side * 0.62);
        slab.translate(side * 0.052, -0.015, 0);
        parts.push(hardenEdges(slab));
      }
      const ridge = new THREE.BoxGeometry(0.02, 0.02, 0.21);
      ridge.translate(0, 0.052, 0);
      parts.push(hardenEdges(ridge));
      const merged = mergeGeometries(parts);
      if (!merged) throw new Error(`[birdhouse] 屋顶合并失败 ${id}`);
      return merged;
    }),
    roofMat,
  );
  roof.name = `${id}/roof`;
  roof.castShadow = true;
  group.add(roof);

  const hole = new THREE.Mesh(
    assets.geometry(`${id}/hole`, () => {
      const disc = new THREE.CylinderGeometry(0.026, 0.026, 0.01, 10);
      disc.rotateX(Math.PI / 2);
      disc.translate(0, -0.115, 0.077);
      return disc;
    }),
    darkMat,
  );
  hole.name = `${id}/hole`;
  group.add(hole);

  const perch = new THREE.Mesh(
    assets.geometry(`${id}/perch`, () => {
      const stick = new THREE.CylinderGeometry(0.007, 0.007, 0.09, 5);
      stick.rotateZ(Math.PI / 2);
      stick.translate(0, -0.155, 0.1);
      return hardenEdges(stick);
    }),
    roofMat,
  );
  perch.name = `${id}/perch`;
  group.add(perch);

  const loop = new THREE.Mesh(
    assets.geometry(`${id}/loop`, () => {
      const ring = new THREE.TorusGeometry(0.016, 0.004, 5, 10);
      ring.translate(0, 0, 0);
      return ring;
    }),
    darkMat,
  );
  loop.name = `${id}/loop`;
  loop.position.y = -0.002;
  group.add(loop);

  return { group };
}

export interface BearBoxResult {
  /** 防熊箱组（原点=地面中心；平台边摆放由场景） */
  readonly group: THREE.Group;
  /** 箱盖顶材质（roofTop 雪壳挂点备用——雪壳由场景克隆摆放） */
  readonly lidMaterial: THREE.Material;
}

/** 防熊食物储藏箱：4 腿高架箱体+斜掀盖+前扣（营地食物远离地面，2.2.2-⑥）。合计 2 DC。 */
export function createBearBox(assets: SharedAssets, id: string): BearBoxResult {
  const group = new THREE.Group();
  group.name = id;
  const woodMat = toonMaterials.get('wood', { color: '#9a744e', name: `${id}/body` });
  const lidMaterial = toonMaterials.get('wood', { color: '#7c5c3e', name: `${id}/lid` });
  const metalMat = toonMaterials.get('metal', { color: '#4a4a50', name: `${id}/metal` });

  const stand = new THREE.Mesh(
    assets.geometry(`${id}/stand`, () => {
      const parts: THREE.BufferGeometry[] = [];
      for (const [sx, sz] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ] as const) {
        const leg = new THREE.CylinderGeometry(0.022, 0.026, 0.52, 6);
        leg.translate(sx * 0.2, 0.26, sz * 0.16);
        parts.push(hardenEdges(leg));
      }
      const merged = mergeGeometries(parts);
      if (!merged) throw new Error(`[birdhouse] 防熊箱支腿合并失败 ${id}`);
      return merged;
    }),
    woodMat,
  );
  stand.name = `${id}/stand`;
  stand.castShadow = true;
  group.add(stand);

  const box = new THREE.Mesh(
    assets.geometry(`${id}/box`, () => {
      const bodyGeo = roundedBox({ width: 0.52, height: 0.3, depth: 0.4, radius: 0.014 });
      bodyGeo.translate(0, 0.67, 0);
      return hardenEdges(bodyGeo);
    }),
    woodMat,
  );
  box.name = `${id}/box`;
  box.castShadow = true;
  group.add(box);

  // 箱盖独立面（roofTop 材质引用——雪壳由场景克隆到盖上方）
  const lidPlate = new THREE.Mesh(
    assets.geometry(`${id}/lid-plate`, () => {
      const plate = roundedBox({ width: 0.55, height: 0.045, depth: 0.43, radius: 0.012 });
      plate.rotateX(-0.16);
      plate.translate(0, 0.845, -0.018);
      return plate;
    }),
    lidMaterial,
  );
  lidPlate.name = `${id}/lid-plate`;
  lidPlate.castShadow = true;
  group.add(lidPlate);

  const latch = new THREE.Mesh(
    assets.geometry(`${id}/latch`, () => {
      const hasp = new THREE.TorusGeometry(0.02, 0.005, 5, 10, Math.PI);
      hasp.rotateY(Math.PI / 2);
      hasp.translate(0, 0.74, 0.202);
      return hardenEdges(hasp);
    }),
    metalMat,
  );
  latch.name = `${id}/latch`;
  group.add(latch);

  return { group, lidMaterial };
}
