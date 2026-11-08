// docs/01-整体架构.md §3.2 geom/parts/wasteland/sandbags.ts —— 2.3.2-③ 沙袋工事。
// docs/02-场景模块.md §4.1.3-③「Sphere 压扁 ×30 错缝码放 2 段矮墙，全实例化，顶面 roofTop」。
// 沙袋几何=压扁椭球（微随机缩放/旋转让码放不机械）；两段墙各 3 排 ×5 袋=30 袋错缝码放，
// 同批 InstancedGroup 全实例化（成对反壳，2 DC）。原点=地面。
// ★ 禁止人形/人物几何（一.6）。T20 落点。
import * as THREE from 'three';
import type { SharedAssets } from '@/systems/handles';
import { toonMaterials } from '@/render/toonMaterial';
import { hardenEdges } from '@/geom/primitives';
import { InstancedGroup } from '@/geom/instanced';

export interface SandbagWallSpec {
  /** 墙段中心 */
  readonly x: number;
  readonly z: number;
  /** 墙段朝向 rad（墙长轴沿局部 x） */
  readonly rotY: number;
  /** 墙段长（默认 2.75=5 袋位） */
  readonly length?: number;
}

export interface SandbagResult {
  readonly group: THREE.Group;
  /** 沙袋材质（roofTop 雪壳注册用——雪壳由场景侧合并统一注册，见 wasteland.ts） */
  readonly material: THREE.Material;
}

/** 沙袋矮墙 ×N 段：单 InstancedGroup 全实例化（每段 3 排 × round(length/0.55) 袋，错缝半袋）。 */
export function createSandbagWalls(assets: SharedAssets, id: string, specs: readonly SandbagWallSpec[]): SandbagResult {
  const bagW = 0.55;
  const rows = 3;
  const capacity = specs.length * rows * Math.max(3, Math.round((specs[0]?.length ?? 2.75) / bagW));
  const geometry = assets.geometry(`${id}/bag`, () => {
    // 压扁椭球：Sphere 压 y 半高（沙袋鼓形）
    const bag = new THREE.SphereGeometry(0.5, 8, 6);
    bag.scale(0.62, 0.34, 0.4);
    return hardenEdges(bag);
  });
  const material = toonMaterials.get('concrete', { color: '#b09468', name: `${id}/bag` });
  const bags = new InstancedGroup(geometry, material, {
    capacity,
    withShell: true,
    name: `${id}/bags`,
    jitter: { hue: 0.01, saturation: 0.04, lightness: 0.05 },
  });
  const matrix = new THREE.Matrix4();
  const euler = new THREE.Euler();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const pos = new THREE.Vector3();

  for (const spec of specs) {
    const length = spec.length ?? 2.75;
    const count = Math.max(3, Math.round(length / bagW));
    const cos = Math.cos(spec.rotY);
    const sin = Math.sin(spec.rotY);
    for (let row = 0; row < rows; row++) {
      const rowY = 0.17 + row * 0.29;
      const shift = row % 2 === 0 ? bagW * 0.25 : -bagW * 0.25; // 错缝：奇偶排反向错开 1/4 袋
      for (let i = 0; i < count; i++) {
        const lx = -((count - 1) * bagW) / 2 + i * bagW + shift;
        const wx = spec.x + lx * cos;
        const wz = spec.z - lx * sin;
        pos.set(wx, rowY, wz);
        euler.set(0, spec.rotY + (i % 3) * 0.045 - 0.045, (i % 2) * 0.05);
        quat.setFromEuler(euler);
        scale.set(0.94 + ((i * 7) % 5) * 0.02, 0.9 + ((i * 5) % 4) * 0.04, 1);
        matrix.compose(pos, quat, scale);
        bags.add(matrix, '#b09468');
      }
    }
    // （墙段顶雪壳归场景侧合并注册——本件不再内建，防 FadeSwap restore 强制可见的孤儿壳）
  }
  const group = new THREE.Group();
  group.name = id;
  group.add(bags.group);
  return { group, material };
}
