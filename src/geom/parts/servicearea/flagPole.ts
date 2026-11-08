// docs/01-整体架构.md §3.2 geom/parts/servicearea/ —— 旗杆（小旗布由 clothMicro 出，本件只出杆体）。
// docs/02-场景模块.md §4.1.4-⑫「旗杆小旗（clothMicro 橙白双色条；ClothHandle stiffness 0.25，
//   7-4-④+七-5「小旗」）」。
// 旗布：场景装配层 createMicroCloth(stiffness 0.25, 橙白双色条 Canvas)——WindSystem 统一驱动。
// ★ 禁止人形/人物几何（一.6）。T21 落点。
import * as THREE from 'three';
import type { SharedAssets } from '@/systems/handles';
import { toonMaterials } from '@/render/toonMaterial';
import { hardenEdges, roundedBox } from '@/geom/primitives';

export interface FlagPoleParams {
  readonly assets: SharedAssets;
  /** 缓存 id（'flagPole/servicearea'） */
  readonly id: string;
  /** 杆高（默认 2.6） */
  readonly height?: number;
}

export interface FlagPoleResult {
  readonly group: THREE.Group;
  /** 杆高（旗布挂位计算用） */
  readonly height: number;
  /** 旗布挂点局部坐标（杆顶下方 0.06，旗布左缘贴杆） */
  readonly flagAnchor: THREE.Vector3;
}

/** 旗杆：锥度杆+球顶+底盘。原点=杆底地面。 */
export function createFlagPole(params: FlagPoleParams): FlagPoleResult {
  const { assets, id } = params;
  const h = params.height ?? 2.6;
  const group = new THREE.Group();
  group.name = id;

  const pole = new THREE.Mesh(
    assets.geometry(`${id}/pole`, () => {
      const post = new THREE.CylinderGeometry(0.018, 0.03, h, 8);
      post.translate(0, h / 2, 0);
      return post;
    }),
    toonMaterials.get('metal', { color: '#c9cdd4', name: `${id}/pole` }),
  );
  pole.name = `${id}/pole`;
  pole.castShadow = true;
  group.add(pole);

  const ball = new THREE.Mesh(
    assets.geometry(`${id}/ball`, () => new THREE.SphereGeometry(0.045, 10, 8)),
    toonMaterials.get('metal', { color: '#e0b84a', name: `${id}/ball` }),
  );
  ball.name = `${id}/ball`;
  ball.position.y = h + 0.04;
  group.add(ball);

  const base = new THREE.Mesh(
    assets.geometry(`${id}/base`, () => hardenEdges(roundedBox({ width: 0.34, height: 0.08, depth: 0.34, radius: 0.02 }))),
    toonMaterials.get('concrete', { color: '#9aa0a2', name: `${id}/base` }),
  );
  base.name = `${id}/base`;
  base.position.y = 0.04;
  base.castShadow = true;
  group.add(base);

  return { group, height: h, flagAnchor: new THREE.Vector3(0, h - 0.06, 0) };
}
