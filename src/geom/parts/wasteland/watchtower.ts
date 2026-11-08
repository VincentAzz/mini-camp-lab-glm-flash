// docs/01-整体架构.md §3.2 geom/parts/wasteland/watchtower.ts —— 2.3.2-② 铁架瞭望塔+探照灯。
// docs/02-场景模块.md §4.1.3-②「4 斜腿+横撑 ×8+平台+围栏+爬梯；探照灯灯头+遮光罩；
//   named `searchlightYoke`，云台 SceneAnimation+LampHandle 亮度」+ docs/05 §7.2.3-①
//   「rotate sweep + 地面光斑 sprite 沿轨迹同步 + 光柱 dust 体积感」。
// 云台 yaw/pitch 分层：yoke（yaw，named）→ head（pitch 固定俯角）→ 灯头/遮光罩/光束锥；
// 地面光斑为 yoke 直挂子层（只随 yaw 沿轨迹走，不随 pitch）。原点=塔底地面中心。
// ★ 禁止人形/人物几何（一.6）。T20 落点。
import * as THREE from 'three';
import type { SharedAssets } from '@/systems/handles';
import { toonMaterials } from '@/render/toonMaterial';
import { mergeGeometries, hardenEdges, tube, roundedBox } from '@/geom/primitives';

export interface WatchtowerParams {
  readonly assets: SharedAssets;
  readonly id: string;
  /** 平台高度（默认 3.0） */
  readonly platformH?: number;
  /** 塔底半宽（默认 0.95） */
  readonly baseHalf?: number;
  /** 探照灯俯角 rad（默认 0.62 ≈35°，光斑落营位侧） */
  readonly pitch?: number;
  /** 光束锥颜色（默认暖白） */
  readonly beamColor?: string;
}

export interface WatchtowerResult {
  readonly group: THREE.Group;
  /** 云台 yaw 组（named `searchlightYoke`；SceneAnimation 写 rotation.y） */
  readonly yoke: THREE.Group;
  /** 灯头自发光镜面材质（LampHandle.emissiveMat） */
  readonly lensMaterial: THREE.MeshToonMaterial;
  /** 光晕精灵（LampHandle.halo） */
  readonly halo: THREE.Sprite;
  /** 光束锥材质 ×1（additive 渐隐；SceneAnimation 写 opacity） */
  readonly beamMaterial: THREE.MeshBasicMaterial;
  /** 地面光斑精灵 quad（additive；随 yoke yaw 沿轨迹同步） */
  readonly groundSpot: THREE.Mesh;
  /** 云台世界挂高（光斑轨迹半径换算用） */
  readonly yokeHeight: number;
  /** 俯角 rad */
  readonly pitch: number;
}

const HALO_TEXTURE_KEY = 'wasteland/tex/halo';

/** 径向光晕贴图（塔灯/警示灯/天线灯/光斑共用；同 id 走 SharedAssets 缓存）。 */
export function makeHaloTexture(assets: SharedAssets, key = HALO_TEXTURE_KEY): THREE.Texture {
  return assets.texture(key, () => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error(`[wasteland] 无法获取 2d 上下文 ${key}`);
    const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,0.9)');
    grad.addColorStop(0.4, 'rgba(255,255,255,0.28)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    const texture = new THREE.CanvasTexture(canvas);
    texture.name = key;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
  });
}

export function createWatchtower(params: WatchtowerParams): WatchtowerResult {
  const { assets, id } = params;
  const platformH = params.platformH ?? 3.0;
  const baseHalf = params.baseHalf ?? 0.95;
  const pitch = params.pitch ?? 0.62;
  const group = new THREE.Group();
  group.name = id;

  const metalMaterial = toonMaterials.get('metal', { color: '#4a4a50', name: `${id}/frame` });
  const rustMaterial = toonMaterials.get('metal', { color: '#7c4a38', name: `${id}/frame-rust` });

  // —— 4 斜腿 + 平台 + 爬梯背架（合并 1 DC）——
  const structureGeometry = assets.geometry(`${id}/structure`, () => {
    const parts: THREE.BufferGeometry[] = [];
    const legTopR = baseHalf * 0.55;
    const spread = baseHalf - legTopR;
    const up = new THREE.Vector3(0, 1, 0);
    for (const [sx, sz] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ] as const) {
      // 斜腿：底端落角点 (±baseHalf, ·, ±baseHalf)，顶端收至平台角 (±legTopR, platformH, ±legTopR)
      const dir = new THREE.Vector3(-sx * spread, platformH, -sz * spread).normalize();
      const len = Math.hypot(spread, platformH) + 0.14;
      const leg = new THREE.CylinderGeometry(0.035, 0.05, len, 8);
      leg.translate(0, len / 2, 0);
      leg.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, dir));
      leg.translate(sx * baseHalf, -0.06, sz * baseHalf);
      parts.push(hardenEdges(leg));
    }
    const platform = roundedBox({ width: baseHalf * 2 + 0.5, height: 0.08, depth: baseHalf * 2 + 0.5, radius: 0.015 });
    platform.translate(0, platformH + 0.04, 0);
    parts.push(hardenEdges(platform));
    const merged = mergeGeometries(parts);
    if (!merged) throw new Error(`[wasteland] 瞭望塔主体合并失败 ${id}`);
    return merged;
  });
  const structure = new THREE.Mesh(structureGeometry, metalMaterial);
  structure.name = `${id}/structure`;
  structure.castShadow = true;
  group.add(structure);

  // —— 横撑 ×8（两层平面桁架，Tube 合并 1 DC）+ 围栏 + 爬梯（合并 1 DC）——
  const braceGeometry = assets.geometry(`${id}/braces`, () => {
    const parts: THREE.BufferGeometry[] = [];
    for (const layer of [0.3, 0.62, 0.94]) {
      const y = platformH * layer;
      const half = baseHalf * (1 - layer * 0.45);
      const corners = [
        new THREE.Vector3(-half, y, -half),
        new THREE.Vector3(half, y, -half),
        new THREE.Vector3(half, y, half),
        new THREE.Vector3(-half, y, half),
      ];
      for (let i = 0; i < 4; i++) {
        const a = corners[i]!;
        const b = corners[(i + 1) % 4]!;
        parts.push(tube({ pointsOrCurve: [a, b], radius: 0.018, tubularSegments: 4 }));
        // 每边一条对角斜撑（×8 口径：两层 ×4 边）
        if (layer !== 0.94) {
          const bUp = b.clone().setY(platformH * (layer + 0.32));
          parts.push(tube({ pointsOrCurve: [a, bUp], radius: 0.012, tubularSegments: 4 }));
        }
      }
    }
    const merged = mergeGeometries(parts);
    if (!merged) throw new Error(`[wasteland] 瞭望塔横撑合并失败 ${id}`);
    return merged;
  });
  const braces = new THREE.Mesh(braceGeometry, rustMaterial);
  braces.name = `${id}/braces`;
  braces.castShadow = true;
  group.add(braces);

  const railGeometry = assets.geometry(`${id}/rail`, () => {
    const parts: THREE.BufferGeometry[] = [];
    const half = baseHalf + 0.2;
    const railY = platformH + 0.98;
    const gapHalf = 0.4; // +z 面中央留爬梯口
    for (const [ax, az, bx, bz] of [
      [-half, -half, half, -half], // 后（−z）
      [half, -half, half, half], // 东（+x）
      [-half, half, -half, half], // 西（−x）
      [gapHalf + 0.02, half, half, half], // 前（+z）右半
      [-half, half, -(gapHalf + 0.02), half], // 前左半（中留梯口）
    ] as const) {
      // tube 为索引几何——与 hardenEdges 非索引件同批合并前一律 harden（否则 mergeGeometries 返回 null）
      parts.push(hardenEdges(tube({ pointsOrCurve: [new THREE.Vector3(ax, railY, az), new THREE.Vector3(bx, railY, bz)], radius: 0.02, tubularSegments: 4 })));
      parts.push(hardenEdges(tube({ pointsOrCurve: [new THREE.Vector3(ax, platformH + 0.5, az), new THREE.Vector3(bx, platformH + 0.5, bz)], radius: 0.014, tubularSegments: 4 })));
    }
    for (const [px, pz] of [
      [-half, -half],
      [half, -half],
      [half, half],
      [-half, half],
      [gapHalf + 0.02, half],
    ] as const) {
      const post = new THREE.CylinderGeometry(0.016, 0.016, 1.0, 6);
      post.translate(px, platformH + 0.5, pz);
      parts.push(hardenEdges(post));
    }
    // 爬梯：双轨 + 踏棍 ×6（背架面）
    for (const lx of [-0.22, 0.22]) {
      parts.push(hardenEdges(tube({ pointsOrCurve: [new THREE.Vector3(lx, 0.1, baseHalf + 0.16), new THREE.Vector3(lx, platformH + 0.1, baseHalf + 0.16)], radius: 0.016, tubularSegments: 6 })));
    }
    for (let i = 0; i < 6; i++) {
      const rung = new THREE.CylinderGeometry(0.012, 0.012, 0.46, 6);
      rung.rotateZ(Math.PI / 2);
      rung.translate(0, 0.42 + i * ((platformH - 0.5) / 5), baseHalf + 0.16);
      parts.push(hardenEdges(rung));
    }
    const merged = mergeGeometries(parts);
    if (!merged) throw new Error(`[wasteland] 围栏爬梯合并失败 ${id}`);
    return merged;
  });
  const rail = new THREE.Mesh(railGeometry, metalMaterial);
  rail.name = `${id}/rail`;
  rail.castShadow = true;
  group.add(rail);

  // —— 探照灯云台（named searchlightYoke：yaw 层）+ 灯头（pitch 层）——
  const yoke = new THREE.Group();
  yoke.name = 'searchlightYoke';
  const yokeHeight = platformH + 1.14;
  yoke.position.y = yokeHeight;
  group.add(yoke);
  const yokePost = new THREE.Mesh(
    assets.geometry(`${id}/yoke-post`, () => {
      const post = new THREE.CylinderGeometry(0.05, 0.06, 0.24, 8);
      post.translate(0, -0.12, 0);
      return hardenEdges(post);
    }),
    metalMaterial,
  );
  yokePost.name = `${id}/yoke-post`;
  yoke.add(yokePost);

  const head = new THREE.Group();
  head.name = `${id}/head`;
  head.rotation.x = pitch; // 固定俯角（SceneAnimation 只动 yoke.rotation.y）
  yoke.add(head);

  const headGeometry = assets.geometry(`${id}/head`, () => {
    const parts: THREE.BufferGeometry[] = [];
    const barrel = new THREE.CylinderGeometry(0.16, 0.19, 0.42, 12);
    barrel.rotateX(Math.PI / 2);
    barrel.translate(0, 0, -0.1);
    parts.push(hardenEdges(barrel));
    const merged = mergeGeometries(parts);
    if (!merged) throw new Error(`[wasteland] 灯头合并失败 ${id}`);
    return merged;
  });
  const headMesh = new THREE.Mesh(headGeometry, rustMaterial);
  headMesh.name = `${id}/head-mesh`;
  headMesh.castShadow = true;
  head.add(headMesh);
  // 遮光罩（半筒帽檐，挡上眩光）
  const hood = new THREE.Mesh(
    assets.geometry(`${id}/hood`, () => {
      const half = new THREE.CylinderGeometry(0.21, 0.23, 0.2, 12, 1, true, 0, Math.PI);
      half.rotateZ(Math.PI / 2);
      half.rotateY(Math.PI);
      half.translate(0, 0.06, -0.36);
      return half;
    }),
    metalMaterial,
  );
  hood.name = `${id}/hood`;
  hood.castShadow = true;
  head.add(hood);
  // 镜面（emissive，LampHandle.emissiveMat；authored 基值 1.6——rotate 模式亮度恒定，功率场景映射）
  const lensMaterial = toonMaterials.getToon('matteProp', {
    color: '#f2ead6',
    emissive: '#ffe9b8',
    emissiveIntensity: 1.6,
    name: `${id}/lens`,
  });
  const lens = new THREE.Mesh(
    assets.geometry(`${id}/lens`, () => new THREE.CylinderGeometry(0.145, 0.15, 0.03, 12)),
    lensMaterial,
  );
  lens.name = `${id}/lens`;
  lens.rotation.x = Math.PI / 2;
  lens.position.set(0, 0, -0.32);
  head.add(lens);

  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      color: '#ffe9b8',
      map: makeHaloTexture(assets, `${id}/halo-tex`),
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  halo.name = `${id}/halo`;
  halo.scale.setScalar(0.72);
  halo.position.set(0, 0, -0.36);
  halo.renderOrder = 20;
  yoke.add(halo);

  // —— 光束锥（additive 渐隐 alpha 贴图；长 7.2 覆盖塔→营位）——
  const beamTexture = assets.texture(`${id}/tex-beam`, () => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error(`[wasteland] 无法获取 2d 上下文 ${id}/tex-beam`);
    const grad = ctx.createLinearGradient(0, 128, 0, 0);
    grad.addColorStop(0, 'rgba(255,255,255,0.62)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.18)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 128);
    const texture = new THREE.CanvasTexture(canvas);
    texture.name = `${id}/tex-beam`;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
  });
  const beamMaterial = new THREE.MeshBasicMaterial({
    color: params.beamColor ?? '#ffe9b8',
    map: beamTexture,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  });
  beamMaterial.name = `${id}/beam`;
  const beamGeometry = assets.geometry(`${id}/beam`, () => {
    const cone = new THREE.ConeGeometry(1.15, 7.2, 12, 1, true);
    cone.rotateX(-Math.PI / 2); // 锥轴 +y → −z（灯头朝向）；锥尖=灯室端
    cone.translate(0, 0, -0.34 - 3.6);
    return cone;
  });
  const beam = new THREE.Mesh(beamGeometry, beamMaterial);
  beam.name = `${id}/beam`;
  beam.userData.noOutline = true;
  beam.renderOrder = 20;
  beam.visible = false;
  head.add(beam);

  // —— 地面光斑（yoke 直挂：只随 yaw 沿轨迹走；位置=俯角光轴落点）——
  const spotMaterial = new THREE.MeshBasicMaterial({
    color: '#ffedc2',
    map: makeHaloTexture(assets, `${id}/spot-tex`),
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  });
  spotMaterial.name = `${id}/ground-spot`;
  const groundSpot = new THREE.Mesh(
    assets.geometry(`${id}/ground-spot`, () => new THREE.PlaneGeometry(2.3, 2.3).rotateX(-Math.PI / 2)),
    spotMaterial,
  );
  groundSpot.name = `${id}/ground-spot`;
  const groundDist = yokeHeight / Math.tan(pitch);
  groundSpot.position.set(0, -yokeHeight + 0.06, -groundDist);
  groundSpot.renderOrder = 20;
  groundSpot.userData.noOutline = true;
  groundSpot.visible = false;
  yoke.add(groundSpot);

  return { group, yoke, lensMaterial, halo, beamMaterial, groundSpot, yokeHeight, pitch };
}
