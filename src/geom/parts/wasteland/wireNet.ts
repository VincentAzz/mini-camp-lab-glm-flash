// docs/01-整体架构.md §3.2 geom/parts/wasteland/wireNet.ts —— 2.3.2-⑤ 缠绕铁丝网。
// docs/02-场景模块.md §4.1.3-⑤「guardNet alpha 贴图网面+卷网筒 ×3+支桩 ×6，实例化」。
// 网面=alpha 贴图 Plane（菱形网孔）实例化；卷网筒=Torus 螺旋叠圈合并；支桩=斜尖桩。
// ★ 禁止人形/人物几何（一.6）。T20 落点。
import * as THREE from 'three';
import type { SharedAssets } from '@/systems/handles';
import { toonMaterials } from '@/render/toonMaterial';
import { mergeGeometries, hardenEdges } from '@/geom/primitives';
import { InstancedGroup } from '@/geom/instanced';
import { paintCanvasTexture, drawWireNetAlpha } from './texPaint';

export interface WireNetRunSpec {
  /** 网段起点 */
  readonly x: number;
  readonly z: number;
  /** 网段方向方位角 rad（dx=cos, dz=−sin） */
  readonly dirRad: number;
  /** 网段长 */
  readonly length: number;
}

export interface WireNetResult {
  readonly group: THREE.Group;
  /** 网面材质（alpha 网孔；实例化） */
  readonly netMaterial: THREE.Material;
  /** 铺网数（核对用） */
  readonly panelCount: number;
}

/**
 * 缠绕铁丝网：支桩 ×6（斜尖桩，合并 1 DC）+ 网面实例化（alpha 网孔 Plane 沿桩顶起伏）+
 * 卷网筒 ×3（Torus 叠圈 1 DC/筒，倒放在墙脚）。
 */
export function createWireNet(assets: SharedAssets, id: string, runs: readonly WireNetRunSpec[]): WireNetResult {
  const netTexture = assets.texture(`${id}/tex-net`, () =>
    paintCanvasTexture(`${id}/tex-net`, 128, 128, drawWireNetAlpha, true),
  );
  netTexture.repeat.set(2, 1.6);
  const netMaterial = toonMaterials.get('matteProp', {
    color: '#8a8f94',
    map: netTexture,
    opacity: 0.999, // 借 transparent 打开 map alpha 承载网孔（同 signBoard 口径）
    name: `${id}/net`,
  });
  (netMaterial as THREE.MeshToonMaterial).side = THREE.DoubleSide; // 网面双面可见（唯一 name 缓存键内设置）

  // —— 支桩 ×6（斜尖桩：直杆 + 尖头，合并 1 DC；每网段 2 桩=两端，3 段 ×2=×6）——
  const postGeometry = assets.geometry(`${id}/post`, () => {
    const parts: THREE.BufferGeometry[] = [];
    const postH = 1.55;
    const shaft = new THREE.CylinderGeometry(0.028, 0.035, postH, 6);
    shaft.translate(0, postH / 2, 0);
    parts.push(hardenEdges(shaft));
    const tip = new THREE.ConeGeometry(0.034, 0.12, 6);
    tip.translate(0, postH + 0.06, 0);
    parts.push(hardenEdges(tip));
    const merged = mergeGeometries(parts);
    if (!merged) throw new Error(`[wasteland] 铁丝网支桩合并失败 ${id}`);
    return merged;
  });
  const postMaterial = toonMaterials.get('metal', { color: '#54585e', name: `${id}/post` });
  const posts = new InstancedGroup(postGeometry, postMaterial, {
    capacity: runs.length * 2,
    withShell: true,
    name: `${id}/posts`,
  });
  const matrix = new THREE.Matrix4();
  const euler = new THREE.Euler();
  const quat = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  const pos = new THREE.Vector3();
  let postCount = 0;
  const netPlacements: { x: number; z: number; rotY: number; w: number }[] = [];
  for (const run of runs) {
    const cos = Math.cos(run.dirRad);
    const sin = Math.sin(run.dirRad);
    // 2 支桩/段（两端）
    for (const t of [0, 1]) {
      pos.set(run.x + cos * run.length * t, 0.76, run.z - sin * run.length * t);
      euler.set(0, run.dirRad, 0);
      quat.setFromEuler(euler);
      matrix.compose(pos, quat, one);
      posts.add(matrix, '#54585e');
      postCount += 1;
    }
    // 网面 2 块/段（中桩分缝）
    for (const t of [0.25, 0.75]) {
      netPlacements.push({
        x: run.x + cos * run.length * t,
        z: run.z - sin * run.length * t,
        rotY: run.dirRad, // Plane 局部 x 轴对齐网段方向（法线朝网段左侧）
        w: run.length * 0.5,
      });
    }
  }

  // —— 网面实例化（单位几何 1×1.5，实例按段宽缩放；alpha 网孔）——
  const netGeometry = assets.geometry(`${id}/net`, () => new THREE.PlaneGeometry(1, 1.5, 4, 2));
  const nets = new InstancedGroup(netGeometry, netMaterial, {
    capacity: netPlacements.length,
    name: `${id}/nets`,
  });
  const scaleVec = new THREE.Vector3();
  for (const p of netPlacements) {
    pos.set(p.x, 0.86, p.z);
    euler.set(0, p.rotY, 0);
    quat.setFromEuler(euler);
    scaleVec.set(p.w, 1, 1);
    matrix.compose(pos, quat, scaleVec);
    nets.add(matrix);
  }

  // —— 卷网筒 ×3（Torus 螺旋叠圈，倒放墙脚；1 DC/筒共享几何）——
  const coilGeometry = assets.geometry(`${id}/coil`, () => {
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 7; i++) {
      const ring = new THREE.TorusGeometry(0.26 - i * 0.012, 0.014, 5, 20);
      ring.rotateX(Math.PI / 2);
      ring.translate(0, 0.03 + i * 0.028, 0);
      parts.push(ring);
    }
    const merged = mergeGeometries(parts);
    if (!merged) throw new Error(`[wasteland] 卷网筒合并失败 ${id}`);
    return merged;
  });
  const coilMaterial = toonMaterials.get('metal', { color: '#6e7478', name: `${id}/coil` });
  const coils = new InstancedGroup(coilGeometry, coilMaterial, { capacity: 3, withShell: true, name: `${id}/coils` });
  // 卷筒位：第一段墙脚 ×2 + 第二段墙脚 ×1（由 runs 前两条推导）
  const coilSpots: { x: number; z: number; rotY: number }[] = [];
  runs.slice(0, 3).forEach((run, i) => {
    const t = i === 2 ? 0.3 : 0.72;
    coilSpots.push({ x: run.x + Math.cos(run.dirRad) * run.length * t, z: run.z - Math.sin(run.dirRad) * run.length * t, rotY: i * 1.1 });
  });
  for (const spot of coilSpots) {
    pos.set(spot.x, 0.1, spot.z);
    euler.set(0, spot.rotY, 0);
    quat.setFromEuler(euler);
    matrix.compose(pos, quat, one);
    coils.add(matrix, '#6e7478');
  }

  const group = new THREE.Group();
  group.name = id;
  group.add(posts.group, nets.group, coils.group);
  void postCount; // 桩数=runs×3（≤6 由场景段数控制）
  return { group, netMaterial, panelCount: netPlacements.length };
}
