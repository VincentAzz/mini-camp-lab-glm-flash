// docs/01-整体架构.md §3.2 geom/parts/servicearea/ —— 遮阳连廊+公共步道。
// docs/02-场景模块.md §4.1.4-⑥「遮阳连廊+公共步道（柱 ×6+微拱顶板+盲道凸条）」。
// 柱 ×6 走 InstancedGroup（同类 ≥3 必实例化，§5.6）；微拱顶板=半圆管段（薄壳 DoubleSide）。
// ★ 禁止人形/人物几何（一.6）。T21 落点。
import * as THREE from 'three';
import type { SharedAssets } from '@/systems/handles';
import { toonMaterials } from '@/render/toonMaterial';
import { InstancedGroup } from '@/geom/instanced';
import { mergeGeometries, hardenEdges, roundedBox } from '@/geom/primitives';

export interface ShadeCorridorParams {
  readonly assets: SharedAssets;
  /** 缓存 id（'corridor/servicearea'） */
  readonly id: string;
  /** 廊宽（x 向，默认 3.4） */
  readonly width?: number;
  /** 廊长（z 向，默认 3.2） */
  readonly length?: number;
  /** 拱顶中心高（默认 2.5，柱高 2.3） */
  readonly archHeight?: number;
}

export interface ShadeCorridorResult {
  readonly group: THREE.Group;
  /** 拱顶板 mesh（积雪 roofTop 可选挂点；微拱薄壳） */
  readonly archMesh: THREE.Mesh;
}

/**
 * 遮阳连廊：柱 ×6（两排 ×3）+ 微拱顶板（半圆管扁壳）+ 盲道凸条两条。
 * 原点=廊底面中心；长轴沿 z（商店→车位方向）。
 */
export function createShadeCorridor(params: ShadeCorridorParams): ShadeCorridorResult {
  const { assets, id } = params;
  const width = params.width ?? 3.4;
  const length = params.length ?? 3.2;
  const archH = params.archHeight ?? 2.5;
  const postH = archH - 0.2;
  const group = new THREE.Group();
  group.name = id;

  // —— 柱 ×6（InstancedGroup，1 DC）——
  const postGeometry = assets.geometry(`${id}/post`, () => {
    const post = new THREE.CylinderGeometry(0.055, 0.07, postH, 10);
    post.translate(0, postH / 2, 0);
    const foot = roundedBox({ width: 0.2, height: 0.05, depth: 0.2, radius: 0.012 });
    foot.translate(0, 0.025, 0);
    // 索引/非索引混合不可合并（BufferGeometryUtils 纪律）——统一 non-indexed（保持共享平滑法线）
    const flatten = (geometry: THREE.BufferGeometry): THREE.BufferGeometry => (geometry.index !== null ? geometry.toNonIndexed() : geometry);
    return mergeGeometries([flatten(post), flatten(foot)])!;
  });
  const postMaterial = toonMaterials.get('metal', { color: '#8fa2b5', name: `${id}/posts` });
  const posts = new InstancedGroup(postGeometry, postMaterial, { capacity: 6, name: `${id}/posts` });
  const matrix = new THREE.Matrix4();
  const px = width / 2 - 0.22;
  for (const pz of [-length / 2 + 0.25, 0, length / 2 - 0.25]) {
    for (const sx of [-px, px]) {
      matrix.identity().setPosition(sx, 0, pz);
      posts.add(matrix);
    }
  }
  group.add(posts.group);

  // —— 微拱顶板（半圆管薄壳，y 压扁 0.5；DoubleSide）——
  const archGeometry = assets.geometry(`${id}/arch`, () => {
    const radius = width / 2;
    const shell = new THREE.CylinderGeometry(radius, radius, length - 0.35, 14, 1, true, 0, Math.PI);
    shell.rotateZ(Math.PI / 2); // 轴向 z：半圆开口朝下
    shell.scale(1, 0.5, 1); // 微拱：y 向压扁 0.5（拱顶高 postH+radius/2）
    shell.translate(0, postH, 0);
    return shell;
  });
  const archMaterial = toonMaterials.get('metal', { color: '#d8dce0', name: `${id}/arch` });
  archMaterial.side = THREE.DoubleSide; // 薄壳双面（唯一 name 缓存键内设置）
  const arch = new THREE.Mesh(archGeometry, archMaterial);
  arch.name = `${id}/arch`;
  arch.castShadow = true;
  group.add(arch);

  // —— 盲道凸条（两条导盲条带：沿 z 向小凸条阵列，合并 1 DC）——
  const tactileGeometry = assets.geometry(`${id}/tactile`, () => {
    const parts: THREE.BufferGeometry[] = [];
    for (const tx of [-0.32, 0.32]) {
      for (let i = 0; i < Math.floor(length / 0.12); i++) {
        const bar = roundedBox({ width: 0.05, height: 0.018, depth: 0.07, radius: 0.004 });
        bar.translate(tx, 0.009, -length / 2 + 0.09 + i * 0.12);
        parts.push(hardenEdges(bar));
      }
    }
    const merged = mergeGeometries(parts);
    if (!merged) throw new Error(`[shadeCorridor] 盲道合并失败 ${id}`);
    return merged;
  });
  const tactile = new THREE.Mesh(
    tactileGeometry,
    toonMaterials.get('concrete', { color: '#c9b98a', name: `${id}/tactile` }),
  );
  tactile.name = `${id}/tactile`;
  tactile.receiveShadow = true;
  group.add(tactile);

  return { group, archMesh: arch };
}
