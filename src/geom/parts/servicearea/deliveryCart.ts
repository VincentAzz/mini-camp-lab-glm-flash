// docs/01-整体架构.md §3.2 geom/parts/servicearea/ —— 送货小车（四-1 清晨专属装饰物）。
// docs/02-场景模块.md §4.1.4-「+送货小车（四-1 清晨专属，named deliveryCart）：平板车+扶手+纸箱 ×3 摞
//   （微歪），清晨便利店门口出现、白天收走」+ docs/05 §4.3.1 离散量切换（blend≥0.5 切换+0.2s 淡入，
//   D5）——出现/收走由场景 lightHooks 离散量路径驱动。
// ★ 禁止人形/人物几何（一.6）。T21 落点。
import * as THREE from 'three';
import type { SharedAssets } from '@/systems/handles';
import { toonMaterials } from '@/render/toonMaterial';
import { InstancedGroup } from '@/geom/instanced';
import { mergeGeometries, hardenEdges, roundedBox, tube } from '@/geom/primitives';

export interface DeliveryCartParams {
  readonly assets: SharedAssets;
  /** 缓存 id（'deliveryCart/servicearea'） */
  readonly id: string;
  /** 纸箱摞种子（微歪确定性） */
  readonly seed: number;
}

export interface DeliveryCartResult {
  readonly group: THREE.Group;
  /** 淡入淡出材质（车身金属/纸箱两组——离散切换 0.2s opacity 渐变用，D5） */
  readonly fadeMaterials: readonly THREE.MeshToonMaterial[];
}

/** 送货小车：平板车（板+4 小轮+扶手）+纸箱 ×3 摞（微歪）。原点=车轮接地中心。 */
export function createDeliveryCart(params: DeliveryCartParams): DeliveryCartResult {
  const { assets, id } = params;
  const group = new THREE.Group();
  group.name = id;

  const metalMaterial = toonMaterials.getToon('metal', { color: '#5f666e', opacity: 0.999, name: `${id}/frame` });
  const frameGeometry = assets.geometry(`${id}/frame`, () => {
    const parts: THREE.BufferGeometry[] = [];
    const bed = roundedBox({ width: 0.62, height: 0.05, depth: 0.42, radius: 0.015 });
    bed.translate(0, 0.32, 0);
    parts.push(hardenEdges(bed));
    for (const [wx, wz] of [
      [-0.24, -0.14],
      [0.24, -0.14],
      [-0.24, 0.14],
      [0.24, 0.14],
    ] as const) {
      const wheel = new THREE.CylinderGeometry(0.075, 0.075, 0.045, 10);
      wheel.rotateX(Math.PI / 2);
      wheel.translate(wx, 0.075, wz);
      parts.push(hardenEdges(wheel));
    }
    for (const sx of [-0.3, 0.3]) {
      const upright = new THREE.CylinderGeometry(0.016, 0.016, 0.5, 6);
      upright.translate(sx, 0.57, -0.18);
      parts.push(upright);
    }
    const handle = tube({
      pointsOrCurve: [
        new THREE.Vector3(-0.3, 0.82, -0.18),
        new THREE.Vector3(0, 0.88, -0.2),
        new THREE.Vector3(0.3, 0.82, -0.18),
      ],
      radius: 0.016,
      tubularSegments: 14,
      radialSegments: 6,
    });
    parts.push(handle);
    const lowerShelf = roundedBox({ width: 0.5, height: 0.03, depth: 0.34, radius: 0.01 });
    lowerShelf.translate(0, 0.14, 0);
    parts.push(hardenEdges(lowerShelf));
    // 索引/非索引混合不可合并——统一 non-indexed（cylinder/tube 保共享平滑法线）
    const flatten = (geometry: THREE.BufferGeometry): THREE.BufferGeometry => (geometry.index !== null ? geometry.toNonIndexed() : geometry);
    const merged = mergeGeometries(parts.map(flatten));
    if (!merged) throw new Error(`[deliveryCart] 车体合并失败 ${id}`);
    return merged;
  });
  const frame = new THREE.Mesh(frameGeometry, metalMaterial);
  frame.name = `${id}/frame`;
  frame.castShadow = true;
  group.add(frame);

  // 纸箱 ×3 摞（微歪；确定性 rand）
  let s = params.seed >>> 0;
  const rand = (): number => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const boxMaterial = toonMaterials.getToon('matteProp', { color: '#c8a06a', opacity: 0.999, name: `${id}/box` });
  const boxGeometry = assets.geometry(`${id}/box`, () =>
    hardenEdges(roundedBox({ width: 0.34, height: 0.24, depth: 0.28, radius: 0.012 })),
  );
  const boxes = new InstancedGroup(boxGeometry, boxMaterial, {
    capacity: 3,
    name: `${id}/boxes`,
    jitter: { hue: 0, saturation: 0, lightness: 0.05 },
  });
  const matrix = new THREE.Matrix4();
  const euler = new THREE.Euler();
  const quat = new THREE.Quaternion();
  const scales = [1, 0.92, 0.8];
  const bedTop = 0.345;
  let stackTop = bedTop;
  for (let i = 0; i < 3; i++) {
    const scale = scales[i] ?? 0.8;
    const boxH = 0.24 * scale;
    euler.set(0, (rand() - 0.5) * 0.3, (rand() - 0.5) * 0.06); // 微歪
    quat.setFromEuler(euler);
    matrix.compose(
      new THREE.Vector3((rand() - 0.5) * 0.04, stackTop + boxH / 2, (rand() - 0.5) * 0.03),
      quat,
      new THREE.Vector3(scale, scale, scale),
    );
    boxes.add(matrix, '#c8a06a');
    stackTop += boxH;
  }
  group.add(boxes.group);

  return { group, fadeMaterials: [metalMaterial, boxMaterial] };
}
