// docs/01-整体架构.md §3.2 geom/parts/servicearea/ —— 电动车充电桩。
// docs/02-场景模块.md §4.1.4-④「电动车充电桩 ×2（屏幕+指示灯 blink 2.4s 绿）」。
// 指示灯走 LampHandle blink（场景装配层注册）；两桩共用同一指示灯材质 → 1 个句柄驱动（7.1.4 表）。
// ★ 禁止人形/人物几何（一.6）。T21 落点。
import * as THREE from 'three';
import type { SharedAssets } from '@/systems/handles';
import { toonMaterials } from '@/render/toonMaterial';
import { mergeGeometries, hardenEdges, roundedBox, tube } from '@/geom/primitives';

export interface ChargingPileParams {
  readonly assets: SharedAssets;
  /** 缓存 id（'charging/servicearea'） */
  readonly id: string;
  /** 指示灯 emissive 色（默认绿 #4adf6e） */
  readonly indicatorColor?: string;
}

export interface ChargingPileResult {
  readonly group: THREE.Group;
  /** 指示灯 emissive 材质（两桩共用 → 1 个 LampHandle blink 2.4s） */
  readonly indicatorMaterial: THREE.MeshToonMaterial;
}

/** 单桩：立柱+屏幕+充电枪+缆线；指示灯为屏幕上方小点（共用材质）。原点=桩底地面。 */
export function createChargingPile(params: ChargingPileParams): THREE.Group {
  const { assets, id } = params;
  const group = new THREE.Group();
  group.name = id;

  const bodyGeometry = assets.geometry(`${id}/body`, () => {
    const parts: THREE.BufferGeometry[] = [];
    const post = roundedBox({ width: 0.24, height: 1.0, depth: 0.17, radius: 0.03 });
    post.translate(0, 0.5, 0);
    parts.push(hardenEdges(post));
    const base = roundedBox({ width: 0.32, height: 0.07, depth: 0.24, radius: 0.015 });
    base.translate(0, 0.035, 0);
    parts.push(hardenEdges(base));
    const cap = roundedBox({ width: 0.28, height: 0.05, depth: 0.2, radius: 0.015 });
    cap.translate(0, 1.03, 0);
    parts.push(hardenEdges(cap));
    const holster = roundedBox({ width: 0.08, height: 0.14, depth: 0.06, radius: 0.012 });
    holster.translate(-0.14, 0.72, 0.02);
    parts.push(hardenEdges(holster));
    const merged = mergeGeometries(parts);
    if (!merged) throw new Error(`[chargingPile] 桩体合并失败 ${id}`);
    return merged;
  });
  const bodyMaterial = toonMaterials.get('matteProp', { color: '#dfe4e8', name: `${id}/body` });
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
  body.name = `${id}/body`;
  body.castShadow = true;
  group.add(body);

  // 屏幕（暗色 glass，静态）
  const screen = new THREE.Mesh(
    assets.geometry(`${id}/screen`, () => hardenEdges(roundedBox({ width: 0.16, height: 0.12, depth: 0.012, radius: 0.006 }))),
    toonMaterials.get('glass', { color: '#15272e', name: `${id}/screen` }),
  );
  screen.name = `${id}/screen`;
  screen.position.set(0, 0.82, 0.092);
  screen.userData.noOutline = true;
  group.add(screen);

  // 指示灯（屏幕上方小圆点——两桩共用同一材质，场景以 1 个 LampHandle blink 2.4s 绿驱动）
  const indicatorMaterial = toonMaterials.getToon('matteProp', {
    color: '#e8f4ea',
    emissive: params.indicatorColor ?? '#4adf6e',
    emissiveIntensity: 1.2, // authored 基值：LightBreath 按 shopPower × blink 方波倍乘
    name: `${id}/indicator`,
  });
  const indicatorGeometry = assets.geometry(`${id}/indicator`, () => new THREE.SphereGeometry(0.022, 8, 6));
  for (const px of [-0.055, 0.055]) {
    const led = new THREE.Mesh(indicatorGeometry, indicatorMaterial);
    led.name = `${id}/indicator`;
    led.position.set(px, 0.93, 0.092);
    group.add(led);
  }

  // 充电枪 + 缆线（Tube 弯垂）
  const gun = new THREE.Mesh(
    assets.geometry(`${id}/gun`, () => hardenEdges(roundedBox({ width: 0.05, height: 0.13, depth: 0.04, radius: 0.01 }))),
    toonMaterials.get('matteProp', { color: '#3a3d42', name: `${id}/gun` }),
  );
  gun.name = `${id}/gun`;
  gun.position.set(-0.14, 0.8, 0.03);
  gun.castShadow = true;
  group.add(gun);
  const cable = new THREE.Mesh(
    assets.geometry(`${id}/cable`, () =>
      tube({
        pointsOrCurve: [
          new THREE.Vector3(-0.1, 0.78, 0.02),
          new THREE.Vector3(-0.18, 0.62, 0.06),
          new THREE.Vector3(-0.2, 0.4, 0.03),
          new THREE.Vector3(-0.16, 0.18, 0.05),
        ],
        radius: 0.012,
        tubularSegments: 14,
        radialSegments: 6,
      }),
    ),
    toonMaterials.get('matteProp', { color: '#3a3d42', name: `${id}/cable` }),
  );
  cable.name = `${id}/cable`;
  group.add(cable);

  return group;
}

/** 充电桩对（×2；同 id → 几何/材质经缓存天然共享，指示灯两桩同一材质 = 1 个 LampHandle 驱动）。
 *  placements：两桩摆位（position/rotY），缺省双双居中。 */
export function createChargingPilePair(
  params: ChargingPileParams,
  placements?: readonly { position: [number, number, number]; rotY: number }[],
): ChargingPileResult {
  const group = new THREE.Group();
  group.name = params.id;
  const a = createChargingPile(params);
  const b = createChargingPile(params); // 同 id：geometry/material 走 SharedAssets/工厂缓存共享
  const placementsA = placements?.[0];
  const placementsB = placements?.[1];
  if (placementsA) {
    a.position.set(...placementsA.position);
    a.rotation.y = placementsA.rotY;
  }
  if (placementsB) {
    b.position.set(...placementsB.position);
    b.rotation.y = placementsB.rotY;
  }
  group.add(a, b);
  const indicatorMaterial = toonMaterials.getToon('matteProp', {
    color: '#e8f4ea',
    emissive: params.indicatorColor ?? '#4adf6e',
    emissiveIntensity: 1.2,
    name: `${params.id}/indicator`,
  });
  return { group, indicatorMaterial };
}
