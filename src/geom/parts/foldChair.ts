// docs/01-整体架构.md §3.2 geom/parts/foldChair.ts —— 可复用部件库 foldChair（折叠椅）。
// docs/02-场景模块.md §4.1.0：海崖首创（2.1.2-①「椅 ×2 实例化」），服务区复用。
// 建模：座面/椅背帆布板 + 铝管架（两侧 U 形管交叉）；单体几何合并（1 DC），成组经 InstancedGroup。
// ★ 禁止人形/人物几何（一.6）。T18 落点。
import * as THREE from 'three';
import type { SharedAssets } from '@/systems/handles';
import { toonMaterials } from '@/render/toonMaterial';
import { mergeGeometries, hardenEdges, roundedBox } from '@/geom/primitives';
import { InstancedGroup } from '@/geom/instanced';

export interface FoldChairPlacement {
  readonly position: readonly [number, number, number];
  readonly rotY?: number;
}

export interface FoldChairSetParams {
  readonly assets: SharedAssets;
  readonly name: string;
  /** 帆布色（默认海崖蓝灰 #6a8aa8；InstanceColor ±5% 微差防复印感） */
  readonly fabricColor?: string;
  readonly placements: readonly FoldChairPlacement[];
  readonly withShell?: boolean;
}

/**
 * 成组折叠椅（docs/02 2.1.2-①「椅 ×2 实例化」——容量按 placements 估足）。
 * 单体=单几何（座+背+架合并 1 DC）× InstancedGroup（含壳恒 2 DC/组）。
 */
export function createFoldChairSet(params: FoldChairSetParams): THREE.Group {
  const { assets, name } = params;
  const geometry = assets.geometry(`${name}/chair`, () => buildChairGeometry());
  const fabricMaterial = toonMaterials.get('matteProp', {
    color: params.fabricColor ?? '#6a8aa8',
    name: `${name}/fabric`,
  });
  const instanced = new InstancedGroup(geometry, fabricMaterial, {
    capacity: Math.max(1, params.placements.length),
    withShell: params.withShell ?? true,
    name: `${name}/chairs`,
  });
  const matrix = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const pos = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  for (const placement of params.placements) {
    pos.set(placement.position[0], placement.position[1], placement.position[2]);
    euler.set(0, placement.rotY ?? 0, 0);
    quat.setFromEuler(euler);
    matrix.compose(pos, quat, one);
    instanced.add(matrix, params.fabricColor ?? '#6a8aa8');
  }
  return instanced.group;
}

/** 单椅几何：座面 + 椅背 + 两侧交叉铝管（局部坐标原点=地面中心，座高 0.42）。 */
function buildChairGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const seat = roundedBox({ width: 0.44, height: 0.03, depth: 0.4, radius: 0.008 });
  seat.translate(0, 0.42, 0.02);
  seat.rotateX(0.06);
  parts.push(hardenEdges(seat));
  const back = roundedBox({ width: 0.44, height: 0.42, depth: 0.03, radius: 0.008 });
  back.translate(0, 0.63, -0.2);
  back.rotateX(-0.16);
  parts.push(hardenEdges(back));
  for (const side of [-1, 1]) {
    // 前腿（竖直微斜）+ 后腿（交叉斜管）
    const front = new THREE.CylinderGeometry(0.013, 0.013, 0.44, 6);
    front.translate(side * 0.19, 0.22, 0.18);
    front.rotateX(-0.05);
    parts.push(hardenEdges(front));
    const rear = new THREE.CylinderGeometry(0.013, 0.013, 0.68, 6);
    rear.translate(side * 0.19, 0.34, -0.05);
    rear.rotateX(0.3);
    parts.push(hardenEdges(rear));
    const arm = new THREE.CylinderGeometry(0.011, 0.011, 0.4, 6);
    arm.rotateX(Math.PI / 2);
    arm.translate(side * 0.19, 0.41, 0.0);
    parts.push(hardenEdges(arm));
  }
  const merged = mergeGeometries(parts);
  if (!merged) throw new Error('[foldChair] 椅体合并失败');
  merged.computeBoundingSphere();
  return merged;
}
