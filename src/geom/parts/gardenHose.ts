// docs/01-整体架构.md §3.2 geom/parts/gardenHose.ts —— 可复用部件库 gardenHose（浇花软管+卷盘）。
// docs/02-场景模块.md §4.1.0 复用清单「gardenHose」；海崖 2.1.2-⑦「水电桩与管线：桩+卷盘+Tube 管线；
//   管线止于营位边缘地环不接触车型（J8 解耦）」。
// 建模：Tube+CatmullRom 扫掠（docs/02 §4.0 程序化建模字典「管线/绳」）；卷盘=鼓筒+盘绕 Torus+摇柄。
// ★ 禁止人形/人物几何（一.6）。T18 落点。
import * as THREE from 'three';
import type { SharedAssets } from '@/systems/handles';
import { toonMaterials } from '@/render/toonMaterial';
import { mergeGeometries, hardenEdges, tube } from '@/geom/primitives';

export interface HoseRunParams {
  readonly assets: SharedAssets;
  readonly id: string;
  /** 管线途经点（首点=卷盘出口，末点=地环落点；Tube 沿点平滑） */
  readonly points: readonly THREE.Vector3[];
  /** 管半径（默认 0.03） */
  readonly radius?: number;
  /** 管色（默认营地绿 #4e7a4a） */
  readonly color?: string;
  /** 末端接地环（Torus 平放，默认 true——J8「止于营位边缘地环」） */
  readonly endRing?: boolean;
}

/** 管线（Tube 1 DC + 末端地环 1 DC）。原点随 points 世界坐标。 */
export function createHoseRun(params: HoseRunParams): THREE.Group {
  const { assets, id } = params;
  const group = new THREE.Group();
  group.name = id;
  const material = toonMaterials.get('matteProp', { color: params.color ?? '#4e7a4a', name: `${id}/hose` });

  const hoseGeometry = assets.geometry(`${id}/tube`, () =>
    tube({ pointsOrCurve: params.points, radius: params.radius ?? 0.03, tubularSegments: 32, radialSegments: 8 }),
  );
  const hose = new THREE.Mesh(hoseGeometry, material);
  hose.name = `${id}/hose`;
  hose.castShadow = true;
  group.add(hose);

  if (params.endRing ?? true) {
    const last = params.points[params.points.length - 1];
    if (last) {
      const ringGeometry = assets.geometry(`${id}/ring`, () => {
        const ring = new THREE.TorusGeometry(0.16, 0.024, 8, 20);
        ring.rotateX(-Math.PI / 2); // 平放地面
        return ring;
      });
      const ring = new THREE.Mesh(ringGeometry, material);
      ring.name = `${id}/ring`;
      ring.position.set(last.x, Math.max(0.025, last.y - 0.02), last.z);
      ring.castShadow = true;
      group.add(ring);
    }
  }
  return group;
}

export interface HoseReelParams {
  readonly assets: SharedAssets;
  readonly id: string;
  /** 卷盘色（默认营地绿） */
  readonly color?: string;
  /** 支架金属色 */
  readonly bracketColor?: string;
}

/** 软管卷盘：立式支架 + 鼓筒 + 盘绕软管圈 + 摇柄（合计 2 DC）。原点=地面中心。 */
export function createHoseReel(params: HoseReelParams): THREE.Group {
  const { assets, id } = params;
  const group = new THREE.Group();
  group.name = id;

  // 支架（1 DC：立杆 + 底座）
  const bracketColor = params.bracketColor ?? '#5a5f66';
  const bracketGeometry = assets.geometry(`${id}/bracket`, () => {
    const parts: THREE.BufferGeometry[] = [];
    const pole = new THREE.CylinderGeometry(0.022, 0.026, 0.62, 8);
    pole.translate(0, 0.31, 0);
    parts.push(hardenEdges(pole));
    const foot = new THREE.CylinderGeometry(0.11, 0.13, 0.04, 12);
    foot.translate(0, 0.02, 0);
    parts.push(hardenEdges(foot));
    const merged = mergeGeometries(parts);
    if (!merged) throw new Error(`[gardenHose] 卷盘支架合并失败 ${id}`);
    return merged;
  });
  const bracket = new THREE.Mesh(bracketGeometry, toonMaterials.get('metal', { color: bracketColor, name: `${id}/bracket` }));
  bracket.name = `${id}/bracket`;
  bracket.castShadow = true;
  group.add(bracket);

  // 鼓筒 + 盘绕圈 + 摇柄（1 DC）
  const drumGeometry = assets.geometry(`${id}/drum`, () => {
    const parts: THREE.BufferGeometry[] = [];
    const drum = new THREE.CylinderGeometry(0.09, 0.09, 0.16, 14);
    drum.rotateZ(Math.PI / 2);
    drum.translate(0, 0.52, 0);
    parts.push(hardenEdges(drum));
    for (const offset of [-0.05, 0.05]) {
      const flange = new THREE.CylinderGeometry(0.13, 0.13, 0.02, 14);
      flange.rotateZ(Math.PI / 2);
      flange.translate(0, 0.52, offset);
      parts.push(hardenEdges(flange));
    }
    const coil = new THREE.TorusGeometry(0.105, 0.03, 8, 20);
    coil.rotateY(Math.PI / 2);
    coil.translate(0, 0.52, 0);
    parts.push(hardenEdges(coil));
    const crank = new THREE.CylinderGeometry(0.012, 0.012, 0.1, 6);
    crank.rotateX(Math.PI / 2);
    crank.translate(0, 0.52, 0.14);
    parts.push(hardenEdges(crank));
    const merged = mergeGeometries(parts);
    if (!merged) throw new Error(`[gardenHose] 卷盘鼓筒合并失败 ${id}`);
    return merged;
  });
  const drum = new THREE.Mesh(drumGeometry, toonMaterials.get('matteProp', { color: params.color ?? '#4e7a4a', name: `${id}/drum` }));
  drum.name = `${id}/drum`;
  drum.castShadow = true;
  group.add(drum);

  return group;
}
