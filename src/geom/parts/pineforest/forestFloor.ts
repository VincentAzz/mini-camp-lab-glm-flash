// docs/01-整体架构.md §3.2 geom/parts/pineforest/forestFloor.ts —— 林下地被三件套（松林首创）。
// docs/02-场景模块.md §4.1.2 2.2.2-⑦：「苔藓蕨类蘑菇丛（各 1 组实例化；蘑菇红帽白点，干净治愈）」
//   ——苔藓/蕨类/蘑菇各 1 个 InstancedGroup 的单体几何；蘑菇帽 Canvas 红底白点贴图（语义图形可烘色，
//   docs/04 §5.4）；蕨类走 'foliage' 原型并注入 P2 植被风摆（§7.2.2-① 同源，场景接线）。
// ★ 禁止人形/人物几何（一.6）。T19 落点。
import * as THREE from 'three';
import type { SharedAssets } from '@/systems/handles';
import { toonMaterials } from '@/render/toonMaterial';
import { hardenEdges, mergeGeometries } from '@/geom/primitives';
import { hashString } from '@/shared/rng';

/** 苔藓斑块：5~7 个压扁半椭球并拢的软垫（确定性形）。实例化单体。 */
export function createMossPatchGeometry(assets: SharedAssets, id: string): THREE.BufferGeometry {
  return assets.geometry(id, () => {
    const parts: THREE.BufferGeometry[] = [];
    let seed = hashString(id);
    const rand = (): number => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    for (let i = 0; i < 6; i++) {
      const blob = new THREE.SphereGeometry(0.07 + rand() * 0.055, 7, 5, 0, Math.PI * 2, 0, Math.PI / 2);
      blob.scale(1 + rand() * 0.5, 0.4, 1 + rand() * 0.5);
      blob.translate((rand() - 0.5) * 0.2, 0.01, (rand() - 0.5) * 0.2);
      parts.push(blob);
    }
    const merged = mergeGeometries(parts);
    if (!merged) throw new Error(`[forestFloor] 苔藓合并失败 ${id}`);
    merged.computeVertexNormals();
    return merged;
  });
}

/** 蕨丛：6 片内弯拱形羽叶（压扁锥），根部锚定。实例化单体（P2 风摆由场景注入蕨材质）。 */
export function createFernTuftGeometry(assets: SharedAssets, id: string): THREE.BufferGeometry {
  return assets.geometry(id, () => {
    const parts: THREE.BufferGeometry[] = [];
    let seed = hashString(id);
    const rand = (): number => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    for (let i = 0; i < 6; i++) {
      const len = 0.24 + rand() * 0.12;
      const frond = new THREE.ConeGeometry(0.05, len, 4);
      frond.scale(1, 1, 0.22);
      frond.rotateX(-(0.55 + rand() * 0.35));
      frond.rotateY((i / 6) * Math.PI * 2 + rand() * 0.4);
      frond.translate(Math.sin((i / 6) * Math.PI * 2) * 0.03, len * 0.32, Math.cos((i / 6) * Math.PI * 2) * 0.03);
      parts.push(hardenEdges(frond));
    }
    const merged = mergeGeometries(parts);
    if (!merged) throw new Error(`[forestFloor] 蕨丛合并失败 ${id}`);
    merged.computeVertexNormals();
    return merged;
  });
}

/** 蘑菇帽贴图：红帽白点（2.2.2-⑦「蘑菇红帽白点，干净治愈」——白点语义图形，其余近红中值）。 */
export function paintMushroomCapTexture(seedName: string): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error(`[forestFloor] 无法获取 2d 上下文 ${seedName}`);
  ctx.fillStyle = '#c8493f';
  ctx.fillRect(0, 0, size, size);
  let seed = hashString(`mushroom/${seedName}`);
  const rand = (): number => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  ctx.fillStyle = '#f5f0e6';
  for (let i = 0; i < 7; i++) {
    const x = 6 + rand() * (size - 12);
    const y = 6 + rand() * (size - 12);
    const r = 2.2 + rand() * 3.2;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.name = `pineforest/mushroom/${seedName}`;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

/** 蘑菇单体几何（菌柄直柱+半球帽；帽 UV 贴红白点图由材质侧给 map）。实例化单体。 */
export function createMushroomGeometry(assets: SharedAssets, id: string): THREE.BufferGeometry {
  return assets.geometry(id, () => {
    const parts: THREE.BufferGeometry[] = [];
    const stem = new THREE.CylinderGeometry(0.022, 0.03, 0.13, 7);
    stem.translate(0, 0.065, 0);
    parts.push(hardenEdges(stem));
    const cap = new THREE.SphereGeometry(0.075, 9, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    cap.scale(1, 0.62, 1);
    cap.translate(0, 0.12, 0);
    parts.push(hardenEdges(cap)); // 帽同样 harden（mergeGeometries 要求 index 一致；UV 逐顶点保留，白点不裂）
    const merged = mergeGeometries(parts);
    if (!merged) throw new Error(`[forestFloor] 蘑菇合并失败 ${id}`);
    return merged;
  });
}

/** 打水桶：Lathe 桶身+桶箍+提梁弧（2.2.2-⑩「Lathe 桶」）。原点=桶底地面。 */
export function createWaterBucket(assets: SharedAssets, id: string): THREE.Group {
  const group = new THREE.Group();
  group.name = id;
  const bucket = new THREE.Mesh(
    assets.geometry(`${id}/bucket`, () => {
      const geo = new THREE.LatheGeometry(
        [
          new THREE.Vector2(0.005, 0),
          new THREE.Vector2(0.1, 0.005),
          new THREE.Vector2(0.125, 0.09),
          new THREE.Vector2(0.14, 0.2),
          new THREE.Vector2(0.142, 0.21),
          new THREE.Vector2(0.132, 0.212),
        ],
        14,
      );
      return hardenEdges(geo);
    }),
    toonMaterials.get('wood', { color: '#8a6a48', name: `${id}/bucket` }),
  );
  bucket.name = `${id}/bucket`;
  bucket.castShadow = true;
  group.add(bucket);
  const hoop = new THREE.Mesh(
    assets.geometry(`${id}/hoop`, () => {
      const ring = new THREE.TorusGeometry(0.128, 0.008, 5, 14);
      ring.rotateX(Math.PI / 2);
      ring.translate(0, 0.16, 0);
      return hardenEdges(ring);
    }),
    toonMaterials.get('metal', { color: '#4a4a50', name: `${id}/hoop` }),
  );
  hoop.name = `${id}/hoop`;
  group.add(hoop);
  const handle = new THREE.Mesh(
    assets.geometry(`${id}/handle`, () => {
      const arc = new THREE.TorusGeometry(0.132, 0.006, 5, 12, Math.PI);
      arc.translate(0, 0.21, 0);
      return hardenEdges(arc);
    }),
    toonMaterials.get('metal', { color: '#4a4a50', name: `${id}/handle` }),
  );
  handle.name = `${id}/handle`;
  group.add(handle);
  return group;
}

/** 水瓢：半球瓢+柄（2.2.2-⑩「半球瓢」）。原点=瓢底。 */
export function createWaterLadle(assets: SharedAssets, id: string): THREE.Group {
  const group = new THREE.Group();
  group.name = id;
  const bowl = new THREE.Mesh(
    assets.geometry(`${id}/bowl`, () => {
      const dome = new THREE.SphereGeometry(0.05, 9, 6, 0, Math.PI * 2, 0, Math.PI / 2);
      dome.scale(1, 0.72, 1);
      dome.rotateX(Math.PI); // 开口朝上
      return dome;
    }),
    toonMaterials.get('wood', { color: '#b08a5e', name: `${id}/bowl` }),
  );
  bowl.name = `${id}/bowl`;
  bowl.castShadow = true;
  group.add(bowl);
  const stick = new THREE.Mesh(
    assets.geometry(`${id}/stick`, () => {
      const rod = new THREE.CylinderGeometry(0.008, 0.01, 0.16, 6);
      rod.rotateZ(Math.PI / 2 - 0.35);
      rod.translate(0.085, 0.035, 0);
      return hardenEdges(rod);
    }),
    toonMaterials.get('wood', { color: '#8a6a48', name: `${id}/stick` }),
  );
  stick.name = `${id}/stick`;
  group.add(stick);
  return group;
}
