// docs/01-整体架构.md §3.2 geom/parts/vehicles/trailerRig/cargoBedLoad.ts —— T25 部件：皮卡货斗载物三件。
// docs/03-车型模块.md §4.2.3【3.3-1】「货斗载物三件：行李箱 roundedBox+双绑带、备用油桶 jerryCan、
//   柴火 Cylinder ×8 交错实例化」；draft 12-车型模块 §5.1 行（行李箱(0.9,0.45,0.55)、油桶 #8a2f23、
//   柴火 InstancedMesh Cylinder(0.05,0.5) ×8 交错堆）。
// 实例化纪律（docs/04 §5.6「同类 ≥3 必实例化」）：柴火 ×8 走 InstancedGroup（instanceColor ±5% 微差防复印感）。
// 输出约定：三件各自原点在自己底面中心，调用方按货斗地板高度/槽位摆位。
// ★ 禁止人形/人物几何（一.6）。
import * as THREE from 'three';
import type { Rng } from '@/shared/rng';
import type { SharedAssets } from '@/systems/handles';
import { toonMaterials } from '@/render/toonMaterial';
import { hardenEdges, roundedBox } from '@/geom/primitives';
import { InstancedGroup } from '@/geom/instanced';

/** 行李箱（roundedBox(0.9,0.45,0.55)+双绑带+提手）：原点底面中心。 */
export function createLuggageBox(assets: SharedAssets, name: string): THREE.Group {
  const group = new THREE.Group();
  group.name = `${name}/luggage`;

  const boxMaterial = toonMaterials.get('cloth', { color: '#a4713e', name: `${name}/luggage-body` });
  const strapMaterial = toonMaterials.get('matteProp', { color: '#4a3222', outline: false, name: `${name}/luggage-strap` });
  const body = new THREE.Mesh(
    assets.geometry(`${name}|luggage-body`, () => hardenEdges(roundedBox({ width: 0.9, height: 0.45, depth: 0.55, radius: 0.05 }))),
    boxMaterial,
  );
  body.name = `${name}/luggage/body`;
  body.position.y = 0.225;
  body.castShadow = true;
  const strapGeometry = assets.geometry(`${name}|luggage-strap`, () => hardenEdges(roundedBox({ width: 0.06, height: 0.49, depth: 0.59, radius: 0.01 })));
  for (const x of [-0.28, 0.28]) {
    const strap = new THREE.Mesh(strapGeometry, strapMaterial);
    strap.name = `${name}/luggage/strap/${x}`;
    strap.position.set(x, 0.225, 0);
    group.add(strap);
  }
  const handle = new THREE.Mesh(
    assets.geometry(`${name}|luggage-handle`, () => hardenEdges(new THREE.TorusGeometry(0.06, 0.014, 6, 12, Math.PI))),
    strapMaterial,
  );
  handle.name = `${name}/luggage/handle`;
  handle.position.set(0, 0.46, 0);
  group.add(body, handle);
  return group;
}

/** 备用油桶 jerryCan（红棕 #8a2f23+顶提手+加油口）：原点底面中心。 */
export function createJerryCan(assets: SharedAssets, name: string): THREE.Group {
  const group = new THREE.Group();
  group.name = `${name}/jerry-can`;

  const canMaterial = toonMaterials.get('paintTrim', { color: '#8a2f23', name: `${name}/jerry-body` });
  const capMaterial = toonMaterials.get('metal', { color: '#565b62', outline: false, name: `${name}/jerry-cap` });
  const body = new THREE.Mesh(
    assets.geometry(`${name}|jerry-body`, () => hardenEdges(roundedBox({ width: 0.3, height: 0.4, depth: 0.18, radius: 0.035 }))),
    canMaterial,
  );
  body.name = `${name}/jerry-can/body`;
  body.position.y = 0.2;
  body.castShadow = true;
  const handleGeometry = assets.geometry(`${name}|jerry-handle`, () => hardenEdges(new THREE.TorusGeometry(0.055, 0.016, 6, 10, Math.PI)));
  for (const x of [-0.075, 0.075]) {
    const grip = new THREE.Mesh(handleGeometry, capMaterial);
    grip.name = `${name}/jerry-can/grip/${x}`;
    grip.position.set(x, 0.42, 0);
    group.add(grip);
  }
  const cap = new THREE.Mesh(
    assets.geometry(`${name}|jerry-cap`, () => hardenEdges(new THREE.CylinderGeometry(0.035, 0.035, 0.05, 8))),
    capMaterial,
  );
  cap.name = `${name}/jerry-can/cap`;
  cap.position.set(0.09, 0.435, 0);
  group.add(body, cap);
  return group;
}

/** 柴火堆（Cylinder(0.05,0.5) ×8 交错堆——奇偶层轴互垂；InstancedGroup 实例化+微差着色）。 */
export function createFirewoodStack(assets: SharedAssets, rng: Rng, name: string): THREE.Group {
  const group = new THREE.Group();
  group.name = `${name}/firewood`;

  const geometry = assets.geometry(`${name}|log`, () => {
    const log = new THREE.CylinderGeometry(0.05, 0.05, 0.5, 10);
    log.rotateX(Math.PI / 2); // 轴 Y → Z（底层躺向）
    return hardenEdges(log);
  });
  const material = toonMaterials.get('wood', { color: '#7a5236', outline: false, name: `${name}/firewood-log` });
  const logs = new InstancedGroup(geometry, material, { capacity: 8, withShell: { width: 0.012 }, name: `${name}/firewood-logs` });
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3(1, 1, 1);
  // 交错堆：底层 4 根轴 Z（y 0.05）、上层 4 根轴 X（y 0.15），位置 rng 抖动
  const axisXQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
  for (let i = 0; i < 8; i++) {
    const layer = i < 4 ? 0 : 1;
    const indexInLayer = i % 4;
    if (layer === 0) {
      quaternion.identity();
      position.set(rng.range(-0.02, 0.02), 0.05, -0.18 + indexInLayer * 0.115);
    } else {
      quaternion.copy(axisXQuat);
      position.set(-0.15 + indexInLayer * 0.095, 0.148, rng.range(-0.02, 0.02));
    }
    matrix.compose(position, quaternion, scale);
    logs.add(matrix, '#7a5236');
  }
  logs.group.userData.noOutline = true;
  group.add(logs.group);
  return group;
}
