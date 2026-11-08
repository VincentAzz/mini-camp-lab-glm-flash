// docs/01-整体架构.md §3.2 geom/parts/servicearea/ —— 公路主线护栏（波形梁）。
// docs/02-场景模块.md §4.1.4 地形「护栏波形梁 Extrude ×10+立柱 ×11」+ ⑧「公路主线+护栏（地形件；
//   护栏顶 roofTop）」。
// 波形梁=断面 W 波轮廓 profileExtrude（2.4.1「Extrude ×10」），×10 段 InstancedGroup；立柱 ×11 同理。
// ★ 禁止人形/人物几何（一.6）。T21 落点。
import * as THREE from 'three';
import type { SharedAssets } from '@/systems/handles';
import { toonMaterials } from '@/render/toonMaterial';
import { InstancedGroup } from '@/geom/instanced';
import { profileExtrude } from '@/geom/primitives';

export interface GuardrailParams {
  readonly assets: SharedAssets;
  /** 缓存 id（'guardrail/servicearea'） */
  readonly id: string;
  /** 波形梁段数（2.4.1 定值 10） */
  readonly segments?: number;
  /** 立柱数（2.4.1 定值 11） */
  readonly posts?: number;
  /** 每段梁长（默认 1.9 → 全线 ≈19u 贯穿底座前缘） */
  readonly segmentLength?: number;
  /** 梁面高（波形梁板面中心高，默认 0.62） */
  readonly railHeight?: number;
}

export interface GuardrailResult {
  readonly group: THREE.Group;
  /** 波形梁材质（护栏顶雪壳挂点由场景以 ribbon/tube 网格另行构建后配对注册 roofTop） */
  readonly beamMaterial: THREE.Material;
  /** 全线长（段数×段长） */
  readonly totalLength: number;
}

/**
 * 波形梁护栏组：×10 段 W 波断面梁（InstancedGroup 1 DC）+ ×11 立柱（1 DC）。
 * 原点=全线起点（x=0 端），梁沿 +x 延伸；调用方平移/旋摆到公路边线。
 */
export function createGuardrail(params: GuardrailParams): GuardrailResult {
  const { assets, id } = params;
  const segments = params.segments ?? 10;
  const postCount = params.posts ?? 11;
  const segLen = params.segmentLength ?? 1.9;
  const railH = params.railHeight ?? 0.62;
  const group = new THREE.Group();
  group.name = id;

  // —— 波形梁（W 波断面沿 x 挤出；断面两峰一谷，高 0.31）——
  const beamGeometry = assets.geometry(`${id}/beam`, () => {
    const beam = profileExtrude({
      profile: [
        [0, 0],
        [0.016, 0.078],
        [0.05, 0.078],
        [0.068, 0.155],
        [0.05, 0.232],
        [0.016, 0.232],
        [0, 0.31],
        [-0.016, 0.232],
        [-0.05, 0.232],
        [-0.068, 0.155],
        [-0.05, 0.078],
        [-0.016, 0.078],
      ],
      depth: segLen - 0.06,
      curveSegments: 2,
    });
    beam.rotateY(Math.PI / 2); // 断面法线朝 z（板面平行公路），挤出向 x
    beam.translate(segLen / 2, railH, 0);
    return beam;
  });
  const beamMaterial = toonMaterials.get('metal', { color: '#b5bcc4', name: `${id}/beam` });
  const beams = new InstancedGroup(beamGeometry, beamMaterial, { capacity: segments, name: `${id}/beams` });
  const matrix = new THREE.Matrix4();
  for (let i = 0; i < segments; i++) {
    matrix.identity().setPosition(i * segLen, 0, 0);
    beams.add(matrix);
  }
  group.add(beams.group);

  // —— 立柱 ×11（InstancedGroup 1 DC；首尾立柱在梁端外 0.05 处收口）——
  const postGeometry = assets.geometry(`${id}/post`, () => {
    const postH = railH + 0.18;
    const post = new THREE.BoxGeometry(0.09, postH, 0.075);
    post.translate(0, postH / 2, 0);
    return post;
  });
  const postMaterial = toonMaterials.get('metal', { color: '#7d858d', name: `${id}/posts` });
  const posts = new InstancedGroup(postGeometry, postMaterial, { capacity: postCount, name: `${id}/posts` });
  for (let i = 0; i < postCount; i++) {
    const x = (i * (segments * segLen)) / (postCount - 1);
    matrix.identity().setPosition(x, 0, 0);
    posts.add(matrix);
  }
  group.add(posts.group);

  return { group, beamMaterial, totalLength: segments * segLen };
}
