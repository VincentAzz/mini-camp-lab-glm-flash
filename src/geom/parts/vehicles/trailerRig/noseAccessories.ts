// docs/01-整体架构.md §3.2 geom/parts/vehicles/trailerRig/noseAccessories.ts —— T25 部件：拖挂前鼻挂件。
// docs/03-车型模块.md §4.2.3【3.3-5】「燃气瓶 ×2+备胎竖挂前鼻面」；draft 12-车型模块 §5.2 行
//   「燃气瓶 Cylinder(0.13,0.4)+阀 torus ×2；备胎 torus(0.30,0.09)+毂盘 竖挂前鼻面」。
// 输出约定：燃气瓶原点=底面中心（竖立）；备胎原点=胎心（胎面法线 ±X，竖挂姿态）。
// ★ 禁止人形/人物几何（一.6）。
import * as THREE from 'three';
import type { SharedAssets } from '@/systems/handles';
import { toonMaterials } from '@/render/toonMaterial';
import { hardenEdges, mergeGeometries } from '@/geom/primitives';

/** 燃气瓶：Cylinder(0.13, 0.4) 瓶体+肩环+阀杆+阀轮 torus；原点底面中心。 */
export function createGasBottle(assets: SharedAssets, name: string): THREE.Group {
  const group = new THREE.Group();
  group.name = `${name}/gas-bottle`;

  const bottleMaterial = toonMaterials.get('paintTrim', { color: '#c8b24a', name: `${name}/gas-body` });
  const valveMaterial = toonMaterials.get('metal', { color: '#8a8f96', outline: false, name: `${name}/gas-valve` });
  const geometry = assets.geometry(`${name}|gas-bottle`, () => {
    const bodyPart = hardenEdges(new THREE.CylinderGeometry(0.13, 0.13, 0.36, 12));
    bodyPart.translate(0, 0.18, 0);
    const shoulder = hardenEdges(new THREE.SphereGeometry(0.13, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2));
    shoulder.scale(1, 0.45, 1);
    shoulder.translate(0, 0.36, 0);
    const merged = mergeGeometries([bodyPart, shoulder]);
    if (!merged) throw new Error(`[trailerRig/nose] 燃气瓶合并失败：${name}`);
    return merged;
  });
  const body = new THREE.Mesh(geometry, bottleMaterial);
  body.name = `${name}/gas-bottle/body`;
  body.castShadow = true;
  group.add(body);

  const valveGeometry = assets.geometry(`${name}|gas-valve`, () => {
    const stem = hardenEdges(new THREE.CylinderGeometry(0.02, 0.02, 0.06, 6));
    stem.translate(0, 0.425, 0);
    const wheel = hardenEdges(new THREE.TorusGeometry(0.032, 0.01, 6, 10));
    wheel.translate(0, 0.462, 0);
    const merged = mergeGeometries([stem, wheel]);
    if (!merged) throw new Error(`[trailerRig/nose] 燃气阀合并失败：${name}`);
    return merged;
  });
  const valve = new THREE.Mesh(valveGeometry, valveMaterial);
  valve.name = `${name}/gas-bottle/valve`;
  group.add(valve);
  return group;
}

/** 备胎：torus(0.30, 0.09) 胎体+毂盘+4 螺栓；竖挂姿态（胎面法线 ±X），原点=胎心。 */
export function createSpareTire(assets: SharedAssets, name: string): THREE.Group {
  const group = new THREE.Group();
  group.name = `${name}/spare-tire`;

  const tireMaterial = toonMaterials.get('matteProp', { color: '#2b2b30', name: `${name}/spare-tire` });
  const geometry = assets.geometry(`${name}|spare-tire`, () => {
    const tire = hardenEdges(new THREE.TorusGeometry(0.3, 0.09, 10, 20)); // 环面 XY、法线 +Z
    tire.rotateY(Math.PI / 2); // 胎面法线 ±X（竖挂前鼻面）
    const hub = hardenEdges(new THREE.CylinderGeometry(0.16, 0.16, 0.1, 12));
    hub.rotateZ(Math.PI / 2); // 毂轴 ±X
    const parts = [tire, hub];
    for (let i = 0; i < 4; i++) {
      const bolt = hardenEdges(new THREE.CylinderGeometry(0.02, 0.02, 0.12, 6));
      bolt.rotateZ(Math.PI / 2);
      const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
      bolt.translate(0, Math.sin(angle) * 0.085, Math.cos(angle) * 0.085);
      parts.push(bolt);
    }
    const merged = mergeGeometries(parts);
    if (!merged) throw new Error(`[trailerRig/nose] 备胎合并失败：${name}`);
    return merged;
  });
  const tire = new THREE.Mesh(geometry, tireMaterial);
  tire.name = `${name}/spare-tire/body`;
  tire.castShadow = true;
  group.add(tire);
  return group;
}
