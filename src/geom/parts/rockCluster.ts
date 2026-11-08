// docs/01-整体架构.md §3.2 geom/parts/rockCluster.ts —— 可复用部件库 rockCluster（礁石/崖石/碎石）。
// docs/02-场景模块.md §4.1.0：避难所首创，松林/海崖复用；海崖 2.1.2-⑬「礁石 ×12 实例化」、
// §5.6 实例化清单「海崖=礁石(12)」。docs/04 §5.6：InstancedGroup + instanceColor ±5% 微差。
// 几何：Icosahedron 顶点确定性扰动（以 id 为种子，同组合可复现，§3.3.2）+ hardenEdges 硬边描边（§5.3）。
// ★ 禁止人形/人物几何（一.6）。T18 落点。
import * as THREE from 'three';
import type { SharedAssets } from '@/systems/handles';
import { hardenEdges } from '@/geom/primitives';
import { InstancedGroup } from '@/geom/instanced';
import { mulberry32, hashString } from '@/shared/rng';

/* ============================ 单块岩石几何（确定性） ============================ */

export interface RockGeometryParams {
  readonly assets: SharedAssets;
  /** 缓存 id（同 id 跨场景共享：'rockCluster/boulder-a'…） */
  readonly id: string;
  /** 基准半径（u） */
  readonly radius: number;
  /** 顶点扰动幅度（半径比例，默认 0.28） */
  readonly jitter?: number;
  /** 细分（默认 1 → 80 面；§5.7 礁石 ≤120 tri 纪律） */
  readonly detail?: number;
  /** 扁平度（y 压扁比例，默认 0.72——礁石略扁伏） */
  readonly squash?: number;
}

/** 生成一块扰动礁石几何（硬边+扁平化；经 SharedAssets 跨场景共享缓存）。 */
export function createRockGeometry(params: RockGeometryParams): THREE.BufferGeometry {
  const { assets, id } = params;
  return assets.geometry(id, () => {
    const geometry = new THREE.IcosahedronGeometry(params.radius, params.detail ?? 1);
    const jitter = params.jitter ?? 0.28;
    const rng = mulberry32(hashString(id));
    const position = geometry.getAttribute('position') as THREE.BufferAttribute;
    const vertex = new THREE.Vector3();
    const seen = new Map<string, number>();
    for (let i = 0; i < position.count; i++) {
      vertex.fromBufferAttribute(position, i);
      // 共享顶点同值同扰动（Icosahedron 顶点共享，按坐标键去重，保证面不撕裂）
      const key = `${vertex.x.toFixed(4)}|${vertex.y.toFixed(4)}|${vertex.z.toFixed(4)}`;
      let scale = seen.get(key);
      if (scale === undefined) {
        scale = 1 + (rng() * 2 - 1) * jitter;
        seen.set(key, scale);
      }
      vertex.multiplyScalar(scale);
      position.setXYZ(i, vertex.x, vertex.y, vertex.z);
    }
    geometry.scale(1, params.squash ?? 0.72, 1);
    geometry.translate(0, params.radius * (params.squash ?? 0.72) * 0.55, 0); // 底部略埋入地面
    return hardenEdges(geometry); // 硬边：toon 色带与反壳描边更利（§5.3）
  });
}

/* ============================ 成组散布（InstancedGroup，≥3 必实例化 §5.6） ============================ */

export interface RockPlacement {
  /** 世界/父级坐标 */
  readonly position: readonly [number, number, number];
  /** 均匀缩放（默认 1） */
  readonly scale?: number;
  /** 绕 y 旋转（rad） */
  readonly rotY?: number;
}

export interface RockSetParams {
  readonly assets: SharedAssets;
  readonly name: string;
  /** 岩石材质（metal/concrete/matteProp 由场景按岩色取用） */
  readonly material: THREE.Material;
  /** 岩石几何（createRockGeometry 产出；可多块混铺） */
  readonly geometries: readonly THREE.BufferGeometry[];
  readonly placements: readonly RockPlacement[];
  /** 反壳成对（§5.6 恒 2 DC/组）；默认 true */
  readonly withShell?: boolean;
  /** 实例色 ±5% 微差基色（§5.6 防「复印感」） */
  readonly color?: string;
}

/** 按 placements 实例化一批岩石。geometries 依次轮流分配给各实例（错落感）。 */
export function createRockSet(params: RockSetParams): THREE.Group {
  const withShell = params.withShell ?? true;
  const groups: THREE.Group[] = [];
  params.geometries.forEach((geometry, gi) => {
    const placements = params.placements.filter((_, i) => i % params.geometries.length === gi);
    if (placements.length === 0) return;
    const instanced = new InstancedGroup(geometry, params.material, {
      capacity: placements.length,
      withShell,
      name: `${params.name}/${gi}`,
    });
    const matrix = new THREE.Matrix4();
    const quat = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    for (const placement of placements) {
      pos.set(placement.position[0], placement.position[1], placement.position[2]);
      euler.set(0, placement.rotY ?? 0, 0);
      quat.setFromEuler(euler);
      const s = placement.scale ?? 1;
      scl.set(s, s, s);
      matrix.compose(pos, quat, scl);
      instanced.add(matrix, params.color);
    }
    groups.push(instanced.group);
  });
  const root = new THREE.Group();
  root.name = params.name;
  for (const group of groups) root.add(group);
  return root;
}
