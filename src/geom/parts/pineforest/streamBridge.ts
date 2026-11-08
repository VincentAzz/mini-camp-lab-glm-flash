// docs/01-整体架构.md §3.2 geom/parts/pineforest/streamBridge.ts —— 跨溪小木桥（松林首创）。
// docs/02-场景模块.md §4.1.2 2.2.2-④「跨溪小木桥（纵梁+桥板 ×8+扶绳；桥面 roofTop）」；
// docs/04-三渲二渲染.md §5.6 桥板同板实例化（板 ≥3 必实例化）；雪壳（roofTop snowShell）由场景挂。
// ★ 禁止人形/人物几何（一.6）。T19 落点。
import * as THREE from 'three';
import type { SharedAssets } from '@/systems/handles';
import { toonMaterials } from '@/render/toonMaterial';
import { hardenEdges, mergeGeometries, roundedBox, tube } from '@/geom/primitives';
import { InstancedGroup } from '@/geom/instanced';

export interface StreamBridgeParams {
  readonly assets: SharedAssets;
  readonly id: string;
  /** 桥长（跨溪方向，u；谷带宽 2.2 + 两岸踏步） */
  readonly length?: number;
  /** 桥宽 */
  readonly width?: number;
  /** 中拱高（跨中抬升） */
  readonly arch?: number;
  /** 木色 */
  readonly woodColor?: string;
}

export interface StreamBridgeResult {
  readonly group: THREE.Group;
  /** 桥面材质（WeatherSurface roofTop 挂点；雪壳由场景按桥板带生成后组合） */
  readonly deckMaterial: THREE.Material;
  /** 扶绳横杆材质（roofTop 第二作用面） */
  readonly railMaterial: THREE.Material;
}

/** 跨溪小木桥（局部原点=桥面跨中地面投影，+z=桥长方向）。纵梁 1 DC + 桥板实例组 + 扶绳桩/绳。 */
export function createStreamBridge(params: StreamBridgeParams): StreamBridgeResult {
  const { assets, id } = params;
  const length = params.length ?? 4.6;
  const width = params.width ?? 1.05;
  const arch = params.arch ?? 0.14;
  const group = new THREE.Group();
  group.name = id;

  const woodColor = params.woodColor ?? '#9a744e';
  const deckMaterial = toonMaterials.get('wood', { color: woodColor, wetReactive: true, name: `${id}/deck` });
  const beamMaterial = toonMaterials.get('wood', { color: '#7c5c3e', name: `${id}/beam` });
  const railMaterial = toonMaterials.get('matteProp', { color: '#8a6f52', name: `${id}/rail` });

  // —— 纵梁 ×2（拱形：3 段折线近似；1 DC）——
  const beamGeometry = assets.geometry(`${id}/beams`, () => {
    const parts: THREE.BufferGeometry[] = [];
    for (const side of [-1, 1]) {
      const segs = 6;
      for (let i = 0; i < segs; i++) {
        const t0 = i / segs;
        const t1 = (i + 1) / segs;
        const y0 = Math.sin(Math.PI * t0) * arch;
        const y1 = Math.sin(Math.PI * t1) * arch;
        const z0 = (t0 - 0.5) * length;
        const z1 = (t1 - 0.5) * length;
        const len = Math.hypot(z1 - z0, y1 - y0);
        const seg = new THREE.BoxGeometry(0.07, 0.06, len + 0.01);
        seg.rotateX(-Math.atan2(y1 - y0, z1 - z0));
        seg.translate(side * (width / 2 - 0.06), (y0 + y1) / 2 + 0.03, (z0 + z1) / 2);
        parts.push(hardenEdges(seg));
      }
    }
    const merged = mergeGeometries(parts);
    if (!merged) throw new Error(`[streamBridge] 纵梁合并失败 ${id}`);
    return merged;
  });
  const beams = new THREE.Mesh(beamGeometry, beamMaterial);
  beams.name = `${id}/beams`;
  beams.castShadow = true;
  group.add(beams);

  // —— 桥板 ×8（实例化，§5.6；随拱抬升/斜置）——
  const plankGeometry = assets.geometry(`${id}/plank`, () =>
    hardenEdges(roundedBox({ width: width - 0.06, height: 0.04, depth: length / 8 - 0.055, radius: 0.008 })),
  );
  const planks = new InstancedGroup(plankGeometry, deckMaterial, {
    capacity: 8,
    withShell: true,
    name: `${id}/planks`,
    jitter: { hue: 0.008, saturation: 0.03, lightness: 0.04 },
  });
  const matrix = new THREE.Matrix4();
  const euler = new THREE.Euler();
  const quat = new THREE.Quaternion();
  const scaleOne = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < 8; i++) {
    const t = (i + 0.5) / 8;
    const y = Math.sin(Math.PI * t) * arch + 0.075;
    const z = (t - 0.5) * length;
    euler.set(-Math.cos(Math.PI * t) * arch * (Math.PI / length) * 2.6, 0, 0);
    quat.setFromEuler(euler);
    matrix.compose(new THREE.Vector3(0, y, z), quat, scaleOne);
    planks.add(matrix, woodColor);
  }
  group.add(planks.group);

  // —— 扶绳：4 桩（1 DC）+ 两侧扶绳 Tube（1 DC）——
  const postGeometry = assets.geometry(`${id}/posts`, () => {
    const parts: THREE.BufferGeometry[] = [];
    for (const side of [-1, 1]) {
      for (const tEnd of [0.04, 0.96]) {
        const post = new THREE.CylinderGeometry(0.028, 0.033, 0.52, 6);
        post.translate(side * (width / 2 - 0.05), Math.sin(Math.PI * tEnd) * arch + 0.26, (tEnd - 0.5) * length);
        parts.push(hardenEdges(post));
      }
    }
    const merged = mergeGeometries(parts);
    if (!merged) throw new Error(`[streamBridge] 扶绳桩合并失败 ${id}`);
    return merged;
  });
  const posts = new THREE.Mesh(postGeometry, beamMaterial);
  posts.name = `${id}/posts`;
  posts.castShadow = true;
  group.add(posts);

  const ropeGeometry = assets.geometry(`${id}/ropes`, () => {
    const parts: THREE.BufferGeometry[] = [];
    for (const side of [-1, 1]) {
      const points: THREE.Vector3[] = [];
      for (let i = 0; i <= 8; i++) {
        const t = i / 8;
        points.push(new THREE.Vector3(side * (width / 2 - 0.05), Math.sin(Math.PI * t) * arch + 0.5, (t - 0.5) * length));
      }
      parts.push(tube({ pointsOrCurve: points, radius: 0.014, tubularSegments: 20, radialSegments: 5 }));
    }
    const merged = mergeGeometries(parts);
    if (!merged) throw new Error(`[streamBridge] 扶绳合并失败 ${id}`);
    return merged;
  });
  const ropes = new THREE.Mesh(ropeGeometry, railMaterial);
  ropes.name = `${id}/ropes`;
  group.add(ropes);

  return { group, deckMaterial, railMaterial };
}
