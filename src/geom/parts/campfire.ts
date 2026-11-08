// docs/01-整体架构.md §3.2 geom/parts/campfire.ts —— 可复用部件库 campfire（篝火堆/烧烤炉变体）。
// docs/02-场景模块.md §4.1.0：松林首创（7-2-② 石圈+原木凳+柴堆），海崖烧烤炉变体
//   （2.1.2-③「Lathe 烤碗+盖+3 腿+炭」），避难所油桶烤架变体后续复用。
// 余烬纪律（docs/05 §4.3.3-②）：炭堆 emissive #FF5A20 × emberPower 噪声闪烁——本件只产出带
//   emissive 材质的炭堆网格与挂点；功率驱动归场景 lightHooks（docs/02 4.1.x 行为表，D3 句柄接入）。
// ★ 禁止人形/人物几何（一.6）。T18 落点。
import * as THREE from 'three';
import type { SharedAssets } from '@/systems/handles';
import { toonMaterials } from '@/render/toonMaterial';
import { mergeGeometries, hardenEdges, lathe } from '@/geom/primitives';

export interface GrillParams {
  readonly assets: SharedAssets;
  /** 缓存 id（同 id 几何共享） */
  readonly id: string;
  /** 烤碗口径（默认 0.5） */
  readonly bowlRadius?: number;
  /** 腿高（默认 0.42） */
  readonly legHeight?: number;
  /** 炭色基色 */
  readonly coalColor?: string;
  /** 余烬自发光色（docs/05 §4.3.3-② #FF5A20） */
  readonly emberColor?: string;
}

export interface GrillResult {
  readonly group: THREE.Group;
  /** 炭堆材质（场景 lightHooks 写 emissiveIntensity = 基值 × emberPower × 闪烁） */
  readonly coalMaterial: THREE.MeshToonMaterial;
  /** 炊烟发射挂点（碗口中心上方 0.15） */
  readonly smokeAnchor: THREE.Object3D;
}

/** 海崖烧烤炉变体：Lathe 烤碗 + 侧挂盖 + 3 斜腿 + 炭堆（合计 3 DC）。原点=地面中心。 */
export function createGrill(params: GrillParams): GrillResult {
  const { assets, id } = params;
  const bowlRadius = params.bowlRadius ?? 0.5;
  const legHeight = params.legHeight ?? 0.42;
  const group = new THREE.Group();
  group.name = id;

  // —— 支架（1 DC：3 斜腿 + 环托）——
  const frameGeometry = assets.geometry(`${id}/frame`, () => {
    const parts: THREE.BufferGeometry[] = [];
    const legTopR = bowlRadius * 0.72;
    for (let i = 0; i < 3; i++) {
      const angle = (i / 3) * Math.PI * 2 + 0.5;
      const leg = new THREE.CylinderGeometry(0.018, 0.02, Math.hypot(legHeight, legTopR) + 0.08, 8);
      leg.translate(0, (legHeight + 0.08) / 2, 0);
      leg.rotateX(Math.atan2(legTopR, legHeight));
      leg.rotateY(-angle);
      leg.translate(0, 0, 0);
      parts.push(hardenEdges(leg));
    }
    const ring = new THREE.TorusGeometry(bowlRadius * 0.82, 0.02, 6, 18);
    ring.rotateX(-Math.PI / 2);
    ring.translate(0, legHeight, 0);
    parts.push(hardenEdges(ring));
    const merged = mergeGeometries(parts);
    if (!merged) throw new Error(`[campfire] 烤炉支架合并失败 ${id}`);
    return merged;
  });
  const frame = new THREE.Mesh(frameGeometry, toonMaterials.get('metal', { color: '#3a3d44', name: `${id}/frame` }));
  frame.name = `${id}/frame`;
  frame.castShadow = true;
  group.add(frame);

  // —— Lathe 烤碗（1 DC，碗口沿 + 收腰）——
  const bowlGeometry = assets.geometry(`${id}/bowl`, () =>
    lathe({
      profile: [
        [0, 0.02],
        [bowlRadius * 0.55, 0.0],
        [bowlRadius * 0.86, 0.1],
        [bowlRadius * 0.97, 0.24],
        [bowlRadius, 0.3],
        [bowlRadius * 1.02, 0.34],
        [bowlRadius * 0.94, 0.36],
      ],
      segments: 16,
    }),
  );
  const bowl = new THREE.Mesh(bowlGeometry, toonMaterials.get('metal', { color: '#2e3238', name: `${id}/bowl` }));
  bowl.name = `${id}/bowl`;
  bowl.position.y = legHeight;
  bowl.castShadow = true;
  group.add(bowl);

  // —— 侧挂盖（碟形，斜靠碗沿）——
  const lidGeometry = assets.geometry(`${id}/lid`, () =>
    lathe({
      profile: [
        [0, 0.035],
        [bowlRadius * 0.5, 0.05],
        [bowlRadius * 0.95, 0.0],
        [bowlRadius, -0.02],
      ],
      segments: 16,
    }),
  );
  const lid = new THREE.Mesh(lidGeometry, toonMaterials.get('metal', { color: '#43474f', name: `${id}/lid` }));
  lid.name = `${id}/lid`;
  lid.position.set(bowlRadius * 1.35, legHeight + 0.18, bowlRadius * 0.4);
  lid.rotation.z = 1.25;
  lid.castShadow = true;
  group.add(lid);

  // —— 炭堆（1 DC：Icosahedron ×5 合并；emissive 材质交场景驱动）——
  const coalGeometry = assets.geometry(`${id}/coal`, () => {
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 5; i++) {
      const chunk = new THREE.IcosahedronGeometry(0.075 + (i % 3) * 0.014, 0);
      chunk.translate(
        Math.sin(i * 2.4) * bowlRadius * 0.32,
        0.055 + (i % 2) * 0.035,
        Math.cos(i * 2.1) * bowlRadius * 0.32,
      );
      parts.push(hardenEdges(chunk));
    }
    const merged = mergeGeometries(parts);
    if (!merged) throw new Error(`[campfire] 炭堆合并失败 ${id}`);
    return merged;
  });
  const coalMaterial = toonMaterials.getToon('matteProp', {
    color: params.coalColor ?? '#2c2622',
    emissive: params.emberColor ?? '#FF5A20',
    emissiveIntensity: 0,
    name: `${id}/coal`,
  });
  const coal = new THREE.Mesh(coalGeometry, coalMaterial);
  coal.name = `${id}/coal`;
  coal.position.y = legHeight;
  coal.castShadow = false;
  group.add(coal);

  const smokeAnchor = new THREE.Object3D();
  smokeAnchor.name = `${id}/smoke-anchor`;
  smokeAnchor.position.y = legHeight + 0.55;
  group.add(smokeAnchor);

  return { group, coalMaterial, smokeAnchor };
}

export interface PitParams {
  readonly assets: SharedAssets;
  readonly id: string;
  /** 石圈半径（默认 0.6） */
  readonly ringRadius?: number;
}

export interface PitResult {
  readonly group: THREE.Group;
  /** 火焰/火光挂点（堆中心） */
  readonly flameAnchor: THREE.Object3D;
  /** 柴堆网格（松林火焰 SceneAnimation 挂点） */
  readonly logs: THREE.Mesh;
}

/** 基础篝火堆（松林 7-2-② 用）：石圈 + 井字柴堆（2 DC）。原点=地面中心。 */
export function createCampfirePit(params: PitParams): PitResult {
  const { assets, id } = params;
  const ringRadius = params.ringRadius ?? 0.6;
  const group = new THREE.Group();
  group.name = id;

  const stoneGeometry = assets.geometry(`${id}/stones`, () => {
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2;
      const stone = new THREE.IcosahedronGeometry(0.09 + (i % 3) * 0.018, 0);
      stone.scale(1, 0.7, 1);
      stone.rotateY(angle);
      stone.translate(Math.sin(angle) * ringRadius, 0.05, Math.cos(angle) * ringRadius);
      parts.push(hardenEdges(stone));
    }
    const merged = mergeGeometries(parts);
    if (!merged) throw new Error(`[campfire] 石圈合并失败 ${id}`);
    return merged;
  });
  const stones = new THREE.Mesh(stoneGeometry, toonMaterials.get('concrete', { color: '#8d8a80', name: `${id}/stones` }));
  stones.name = `${id}/stones`;
  stones.castShadow = true;
  group.add(stones);

  const logGeometry = assets.geometry(`${id}/logs`, () => {
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 4; i++) {
      const log = new THREE.CylinderGeometry(0.045, 0.05, 0.52, 8);
      log.rotateZ(Math.PI / 2);
      log.rotateY((i / 4) * Math.PI);
      log.translate(0, 0.07 + (i % 2) * 0.09, 0);
      parts.push(hardenEdges(log));
    }
    const merged = mergeGeometries(parts);
    if (!merged) throw new Error(`[campfire] 柴堆合并失败 ${id}`);
    return merged;
  });
  const logs = new THREE.Mesh(logGeometry, toonMaterials.get('wood', { color: '#7a5c3e', name: `${id}/logs` }));
  logs.name = `${id}/logs`;
  logs.castShadow = true;
  group.add(logs);

  const flameAnchor = new THREE.Object3D();
  flameAnchor.name = `${id}/flame-anchor`;
  flameAnchor.position.y = 0.24;
  group.add(flameAnchor);

  return { group, flameAnchor, logs };
}
