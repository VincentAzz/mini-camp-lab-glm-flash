// docs/01-整体架构.md §3.2 geom/parts/vehicles/trailerRig/aFrameHitch.ts —— T25 部件：A 字牵引杆+拖钩。
// docs/03-车型模块.md §4.2.3【3.3-1】「拖钩/A 字牵引杆」+ draft 12-车型模块 §5.0/§5.1（牵引角≈0°、
//   牵引杆间隙 0.5、A 字架=两斜管+横梁球头）。
// 输出约定：组原点=拖挂前鼻根部挂点（+X 朝皮卡方向），球头落在 +X 端 ≈ 皮卡尾部拖钩座；
//   调用方整组摆位（本车：鼻根 (−0.90, 0.86)，球头落 (−0.40, 0.64)≈皮卡尾杠）。
// ★ 禁止人形/人物几何（一.6）。
import * as THREE from 'three';
import type { SharedAssets } from '@/systems/handles';
import { toonMaterials } from '@/render/toonMaterial';
import { hardenEdges, mergeGeometries } from '@/geom/primitives';

export interface AFrameHitchParams {
  /** A 字架纵深（鼻根→球头 +X 距离；本车 0.5≈牵引杆间隙） */
  readonly reach: number;
  /** 球头目标高度相对鼻根（负值=低于鼻根；本车 −0.22 落皮卡尾杠高度） */
  readonly ballDrop: number;
  /** 工厂几何/材质缓存键前缀 */
  readonly name: string;
}

/** A 字牵引杆：两斜管+横梁+球头+插销座；原点=鼻根挂点，球头在 (+reach, ballDrop, 0)。 */
export function createAFrameHitch(assets: SharedAssets, params: AFrameHitchParams): THREE.Group {
  const { reach, ballDrop, name } = params;
  const group = new THREE.Group();
  group.name = `${name}/a-frame`;

  const metalMaterial = toonMaterials.get('metal', { color: '#4a4f56', name: `${name}/hitch-metal` });
  const ballMaterial = toonMaterials.get('metal', { color: '#8a8f96', outline: false, name: `${name}/hitch-ball` });

  const geometry = assets.geometry(`${name}|frame`, () => {
    const armsZ = 0.24;
    const parts: THREE.BufferGeometry[] = [];
    // 两斜管（鼻根 ±z → 球头座汇聚）
    const armLength = Math.hypot(reach, ballDrop, armsZ);
    for (const side of [1, -1]) {
      const arm = new THREE.CylinderGeometry(0.026, 0.03, armLength, 8);
      arm.translate(0, armLength / 2, 0);
      const direction = new THREE.Vector3(reach, ballDrop, side * armsZ).normalize();
      arm.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction));
      parts.push(hardenEdges(arm));
    }
    // 横梁（两斜管中段间联杆）
    const beam = new THREE.CylinderGeometry(0.018, 0.018, armsZ * 1.15, 8);
    beam.rotateX(Math.PI / 2);
    beam.translate(reach * 0.55, ballDrop * 0.55, 0);
    parts.push(hardenEdges(beam));
    // 插销座（球头上方薄盒）
    const coupler = new THREE.BoxGeometry(0.12, 0.05, 0.07);
    coupler.translate(reach - 0.05, ballDrop + 0.055, 0);
    parts.push(hardenEdges(coupler));
    const merged = mergeGeometries(parts);
    if (!merged) throw new Error(`[trailerRig/aFrame] A 字架合并失败：${name}`);
    return merged;
  });
  const frame = new THREE.Mesh(geometry, metalMaterial);
  frame.name = `${name}/a-frame/arms`;
  frame.castShadow = true;
  group.add(frame);

  const ball = new THREE.Mesh(
    assets.geometry(`${name}|ball`, () => hardenEdges(new THREE.SphereGeometry(0.055, 10, 8))),
    ballMaterial,
  );
  ball.name = `${name}/a-frame/ball`;
  ball.position.set(reach, ballDrop, 0);
  group.add(ball);
  return group;
}
