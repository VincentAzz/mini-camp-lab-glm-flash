// docs/01-整体架构.md §3.2 geom/parts/servicearea/ —— 服务区专属部件库：加油站（雨棚+加油机 ×2）。
// docs/02-场景模块.md §4.1.4-①「加油站雨棚+加油机 ×2（立柱+悬挑顶板+棚下灯板 ×2；加油机+顶灯箱+屏+软管；
//   棚灯=steady×shopPower×0.8（7.1.4）」。
// 材质全部经 ToonMaterialFactory（禁止内容模块私搭）；灯体 emissive 经 LampHandle（场景装配层注册）。
// ★ 禁止人形/人物几何（一.6）。T21 落点。
import * as THREE from 'three';
import type { SharedAssets } from '@/systems/handles';
import { toonMaterials } from '@/render/toonMaterial';
import { mergeGeometries, hardenEdges, roundedBox, tube } from '@/geom/primitives';

export interface GasStationParams {
  readonly assets: SharedAssets;
  /** 缓存 id 前缀（'gasStation/servicearea'） */
  readonly id: string;
  /** 悬挑顶板尺寸（x×z，默认 5.2×3.9） */
  readonly roofWidth?: number;
  readonly roofDepth?: number;
  /** 顶板底面高（默认 2.55——加油机 1.15 + 车顶净空） */
  readonly roofHeight?: number;
  /** 顶板色（canopyBlue 通道默认值） */
  readonly roofColor?: string;
  /** 灯板/加油机顶灯箱 emissive 色与材质（场景装配层取用注册 LampHandle；缺省场景侧自建） */
  readonly lightEmissive?: string;
}

export interface GasStationResult {
  readonly group: THREE.Group;
  /** 棚下灯板 ×2（与加油机顶灯箱共用同一 emissive 材质 → 1 个 LampHandle 驱动全部，2.4-①） */
  readonly lightPanelMaterial: THREE.MeshToonMaterial;
  /** 加油机 ×2（含顶灯箱/屏/软管，管体合并 1 DC） */
  readonly pumps: readonly THREE.Group[];
  /** 雨棚顶（雪壳作用面挂点：顶板 mesh） */
  readonly roofMesh: THREE.Mesh;
}

/** 加油站：立柱 ×4 + 悬挑顶板 + 棚下灯板 ×2 + 加油机 ×2。原点=雨棚中心地面投影。 */
export function createGasStation(params: GasStationParams): GasStationResult {
  const { assets, id } = params;
  const roofW = params.roofWidth ?? 5.2;
  const roofD = params.roofDepth ?? 3.9;
  const roofH = params.roofHeight ?? 2.55;
  const group = new THREE.Group();
  group.name = id;

  // —— 立柱 ×4（圆管+柱头环，合并 1 DC）——
  const postGeometry = assets.geometry(`${id}/posts`, () => {
    const parts: THREE.BufferGeometry[] = [];
    const xs = roofW / 2 - 0.42;
    const zs = roofD / 2 - 0.45;
    for (const [px, pz] of [
      [-xs, -zs],
      [xs, -zs],
      [-xs, zs],
      [xs, zs],
    ] as const) {
      const post = new THREE.CylinderGeometry(0.075, 0.095, roofH, 10);
      post.translate(px, roofH / 2, pz);
      parts.push(post); // Lathe/Cylinder 平滑面保持共享法线（§5.3）
      const collar = new THREE.CylinderGeometry(0.105, 0.105, 0.07, 10);
      collar.translate(px, 0.12, pz);
      parts.push(collar);
    }
    const merged = mergeGeometries(parts);
    if (!merged) throw new Error(`[gasStation] 立柱合并失败 ${id}`);
    return merged;
  });
  const postMaterial = toonMaterials.get('metal', { color: '#c9cdd4', name: `${id}/posts` });
  const posts = new THREE.Mesh(postGeometry, postMaterial);
  posts.name = `${id}/posts`;
  posts.castShadow = true;
  group.add(posts);

  // —— 悬挑顶板（扁盒+双坡微起脊，1 DC；顶面 roofTop 雪壳作用面）——
  const roofGeometry = assets.geometry(`${id}/roof`, () => {
    const slab = roundedBox({ width: roofW, height: 0.18, depth: roofD, radius: 0.05 });
    slab.translate(0, roofH + 0.09, 0);
    const ridge = roundedBox({ width: roofW - 0.5, height: 0.09, depth: 0.42, radius: 0.03 });
    ridge.translate(0, roofH + 0.21, 0);
    const fascia = roundedBox({ width: roofW + 0.06, height: 0.1, depth: roofD + 0.06, radius: 0.02 });
    fascia.translate(0, roofH - 0.02, 0);
    return hardenEdges(mergeGeometries([slab, ridge, fascia])!);
  });
  const roofMaterial = toonMaterials.get('metal', { color: params.roofColor ?? '#4a7fb5', name: `${id}/roof` });
  const roof = new THREE.Mesh(roofGeometry, roofMaterial);
  roof.name = `${id}/roof`;
  roof.castShadow = true;
  group.add(roof);

  // —— 棚下灯板 ×2（emissive 长条，与加油机顶灯箱共用材质 → LampHandle 单点驱动）——
  const lightPanelMaterial = toonMaterials.getToon('matteProp', {
    color: '#f5efe2',
    emissive: params.lightEmissive ?? '#ffd9a0',
    emissiveIntensity: 1.4, // authored 基值：LightBreath 注册期快照后按 shopPower×0.8 倍乘（T18 纪律③）
    name: `${id}/light-panel`,
  });
  const panelGeometry = assets.geometry(`${id}/light-panel`, () =>
    hardenEdges(roundedBox({ width: roofW - 1.2, height: 0.05, depth: 0.24, radius: 0.02 })),
  );
  for (const pz of [-roofD / 2 + 0.85, roofD / 2 - 0.85]) {
    const panel = new THREE.Mesh(panelGeometry, lightPanelMaterial);
    panel.name = `${id}/light-panel`;
    panel.position.set(0, roofH - 0.14, pz);
    group.add(panel);
  }

  // —— 加油机 ×2（管体+屏+侧板合并 1 DC + 顶灯箱（灯）+软管 Tube）——
  const pumpBodyMaterial = toonMaterials.get('matteProp', { color: '#e4e6ea', name: `${id}/pump-body` });
  const screenMaterial = toonMaterials.get('glass', { color: '#1c2f38', name: `${id}/pump-screen` });
  const bodyGeometry = assets.geometry(`${id}/pump-body`, () => {
    const parts: THREE.BufferGeometry[] = [];
    const body = roundedBox({ width: 0.42, height: 1.05, depth: 0.34, radius: 0.045 });
    body.translate(0, 0.525, 0);
    parts.push(hardenEdges(body));
    const skirt = roundedBox({ width: 0.48, height: 0.1, depth: 0.4, radius: 0.02 });
    skirt.translate(0, 0.05, 0);
    parts.push(hardenEdges(skirt));
    const screen = roundedBox({ width: 0.26, height: 0.17, depth: 0.02, radius: 0.008 });
    screen.translate(0, 0.82, 0.175);
    parts.push(hardenEdges(screen));
    for (const side of [-1, 1]) {
      const nozzle = roundedBox({ width: 0.07, height: 0.13, depth: 0.05, radius: 0.012 });
      nozzle.translate(side * 0.235, 0.62, 0.06);
      parts.push(hardenEdges(nozzle));
    }
    const merged = mergeGeometries(parts);
    if (!merged) throw new Error(`[gasStation] 加油机合并失败 ${id}`);
    return merged;
  });
  const topBoxGeometry = assets.geometry(`${id}/pump-topbox`, () =>
    hardenEdges(roundedBox({ width: 0.4, height: 0.2, depth: 0.26, radius: 0.03 })),
  );
  const hoseGeometry = assets.geometry(`${id}/pump-hose`, () => {
    const hose = tube({
      pointsOrCurve: [
        new THREE.Vector3(0.2, 0.68, 0.05),
        new THREE.Vector3(0.3, 0.52, 0.1),
        new THREE.Vector3(0.26, 0.3, 0.12),
        new THREE.Vector3(0.16, 0.24, 0.08),
      ],
      radius: 0.016,
      tubularSegments: 16,
      radialSegments: 6,
    });
    return hose;
  });
  const hoseMaterial = toonMaterials.get('matteProp', { color: '#3a3d42', name: `${id}/pump-hose` });
  const pumps: THREE.Group[] = [];
  for (const [px, pz] of [
    [-0.85, 0],
    [0.85, 0],
  ] as const) {
    const pump = new THREE.Group();
    pump.name = `${id}/pump`;
    const body = new THREE.Mesh(bodyGeometry, pumpBodyMaterial);
    body.name = `${id}/pump-body`;
    body.castShadow = true;
    pump.add(body);
    const screen = new THREE.Mesh(assets.geometry(`${id}/pump-screen`, () => hardenEdges(roundedBox({ width: 0.24, height: 0.15, depth: 0.01, radius: 0.006 }))), screenMaterial);
    screen.name = `${id}/pump-screen`;
    screen.position.set(0, 0.82, 0.186);
    pump.add(screen);
    const topBox = new THREE.Mesh(topBoxGeometry, lightPanelMaterial); // 顶灯箱（灯，共用棚灯材质）
    topBox.name = `${id}/pump-topbox`;
    topBox.position.set(0, 1.15, 0);
    topBox.castShadow = true;
    pump.add(topBox);
    const hose = new THREE.Mesh(hoseGeometry, hoseMaterial);
    hose.name = `${id}/pump-hose`;
    pump.add(hose);
    pump.position.set(px, 0, pz);
    pump.rotation.y = px < 0 ? Math.PI : 0; // 两机背靠背（屏各朝一侧车道）
    group.add(pump);
    pumps.push(pump);
  }

  return { group, lightPanelMaterial, pumps, roofMesh: roof };
}
