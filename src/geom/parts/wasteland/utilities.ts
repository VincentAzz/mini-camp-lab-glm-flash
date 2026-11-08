// docs/01-整体架构.md §3.2 geom/parts/wasteland/utilities.ts —— 2.3.2-⑧ 净水装置+发电机 / ⑨ 太阳能板阵列 / ⑩ 旋转雷达天线。
// docs/02-场景模块.md §4.1.3-⑧「滤瓶 ×2 半透明+支架+管路；发电机+散热栅+弯头排气管；滤瓶 LampHandle
//   blink 2.4s 青冷色荧光」/ -⑨「倾角 28°，实例化，板面 roofTop」/ -⑩「Lathe 抛物面+背筋+馈源；
//   LampHandle blink 1.2s；named radar」。
// 灯色注记：LED 青取 2.3.3 场景通道 cyanGlow #5ad8d0（docs/04 §5.5「通道定值权在 02-场景模块.md」；
//   7.1.4 行 #4AD8E8 为同族近色）。
// ★ 禁止人形/人物几何（一.6）。T20 落点。
import * as THREE from 'three';
import type { SharedAssets } from '@/systems/handles';
import { toonMaterials } from '@/render/toonMaterial';
import { mergeGeometries, hardenEdges, roundedBox, tube, lathe } from '@/geom/primitives';
import { InstancedGroup } from '@/geom/instanced';
import { paintCanvasTexture, drawSolarCell } from './texPaint';

/* ============================== ⑧ 净水装置 + 发电机 ============================== */

export interface PurifierResult {
  readonly group: THREE.Group;
  /** 滤瓶 LED 材质（LampHandle.emissiveMat；blink 2.4s 青） */
  readonly ledMaterial: THREE.MeshToonMaterial;
  /** LED 光晕精灵 */
  readonly ledHalo: THREE.Sprite;
  /** 发电机排气管口（蒸汽发射挂点） */
  readonly exhaustAnchor: THREE.Object3D;
}

/** 净水装置（滤瓶 ×2 半透明 + 支架 + 管路）+ 发电机（机体的散热栅 + 弯头排气管）。原点=地面。 */
export function createPurifierGenerator(assets: SharedAssets, id: string, ledColor: string): PurifierResult {
  const group = new THREE.Group();
  group.name = id;
  const frameMaterial = toonMaterials.get('metal', { color: '#4a4a50', name: `${id}/frame` });
  const bodyMaterial = toonMaterials.get('metal', { color: '#6a7076', name: `${id}/gen-body` });

  // —— 净水装置：A 字支架 + 滤瓶 ×2（glass 半透明青）+ 串联管路 ——
  const frameGeometry = assets.geometry(`${id}/frame`, () => {
    const parts: THREE.BufferGeometry[] = [];
    for (const sx of [-1, 1]) {
      const legA = new THREE.CylinderGeometry(0.02, 0.025, 1.0, 6);
      legA.rotateZ(sx * 0.22);
      legA.translate(sx * 0.28, 0.48, 0);
      parts.push(hardenEdges(legA));
      const legB = new THREE.CylinderGeometry(0.02, 0.025, 1.0, 6);
      legB.rotateZ(sx * 0.22);
      legB.rotateY(Math.PI / 2);
      legB.translate(sx * 0.28, 0.48, 0.22);
      parts.push(hardenEdges(legB));
    }
    const shelf = roundedBox({ width: 0.78, height: 0.05, depth: 0.56, radius: 0.01 });
    shelf.translate(0, 0.98, 0.1);
    parts.push(hardenEdges(shelf));
    const merged = mergeGeometries(parts);
    if (!merged) throw new Error(`[wasteland] 净水支架合并失败 ${id}`);
    return merged;
  });
  const frame = new THREE.Mesh(frameGeometry, frameMaterial);
  frame.name = `${id}/frame`;
  frame.castShadow = true;
  group.add(frame);

  const bottleGeometry = assets.geometry(`${id}/bottle`, () =>
    lathe({
      profile: [
        [0.0, 0.0],
        [0.11, 0.0],
        [0.13, 0.05],
        [0.13, 0.3],
        [0.11, 0.36],
        [0.05, 0.38],
        [0.05, 0.44],
        [0.065, 0.46],
      ],
      segments: 12,
    }),
  );
  const bottleMaterial = toonMaterials.get('glass', { color: '#7ec8c4', opacity: 0.42, name: `${id}/bottle` });
  for (const [bx, bz] of [
    [-0.18, 0.1],
    [0.18, 0.1],
  ] as const) {
    const bottle = new THREE.Mesh(bottleGeometry, bottleMaterial);
    bottle.name = `${id}/bottle`;
    bottle.position.set(bx, 1.0, bz);
    group.add(bottle);
  }
  // 管路（进水→瓶→瓶→出水龙头，Tube 合并 1 DC）
  const pipeGeometry = assets.geometry(`${id}/pipe`, () => {
    const curves = [
      [new THREE.Vector3(-0.18, 0.62, 0.1), new THREE.Vector3(-0.18, 1.02, 0.1)],
      [new THREE.Vector3(-0.18, 1.44, 0.1), new THREE.Vector3(0.18, 1.44, 0.1)],
      [new THREE.Vector3(0.18, 1.0, 0.1), new THREE.Vector3(0.18, 0.66, 0.24), new THREE.Vector3(0.3, 0.6, 0.3)],
    ];
    const merged = mergeGeometries(curves.map((points) => tube({ pointsOrCurve: points, radius: 0.016, tubularSegments: 8 })));
    if (!merged) throw new Error(`[wasteland] 净水管路合并失败 ${id}`);
    return merged;
  });
  const pipes = new THREE.Mesh(pipeGeometry, frameMaterial);
  pipes.name = `${id}/pipe`;
  group.add(pipes);

  // 滤瓶 LED（青 blink 2.4s——LampHandle 在场景组装）
  const ledMaterial = toonMaterials.getToon('matteProp', {
    color: '#3c4a4c',
    emissive: ledColor,
    emissiveIntensity: 1.4, // authored 基值；功率场景映射（dawn 0.4 / 白天 0 / dusk·night 0.4）
    name: `${id}/led`,
  });
  const led = new THREE.Mesh(
    assets.geometry(`${id}/led`, () => new THREE.SphereGeometry(0.03, 8, 6)),
    ledMaterial,
  );
  led.name = `${id}/led`;
  led.position.set(0.18, 1.5, 0.1);
  group.add(led);
  const ledHalo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      color: ledColor,
      map: makeDotHaloTexture(assets, `${id}/halo-tex`),
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  ledHalo.name = `${id}/halo`;
  ledHalo.scale.setScalar(0.28);
  ledHalo.position.copy(led.position);
  ledHalo.renderOrder = 20;
  group.add(ledHalo);

  // —— 发电机（机体+散热栅+弯头排气管；置于净水架旁 0.95）——
  const genGeometry = assets.geometry(`${id}/gen`, () => {
    const parts: THREE.BufferGeometry[] = [];
    const body = roundedBox({ width: 0.72, height: 0.52, depth: 0.46, radius: 0.03 });
    body.translate(0, 0.3, 0);
    parts.push(hardenEdges(body));
    const skid = roundedBox({ width: 0.8, height: 0.06, depth: 0.52, radius: 0.01 });
    skid.translate(0, 0.03, 0);
    parts.push(hardenEdges(skid));
    // 散热栅（正面凹槽条 ×5）
    for (let i = 0; i < 5; i++) {
      const fin = roundedBox({ width: 0.04, height: 0.3, depth: 0.02, radius: 0.005 });
      fin.translate(0.24, 0.3, -0.14 + i * 0.07);
      parts.push(hardenEdges(fin));
    }
    // 弯头排气管（立柱 + 弯头 + 短水平段）
    const riser = new THREE.CylinderGeometry(0.035, 0.035, 0.5, 8);
    riser.translate(-0.24, 0.56, 0);
    parts.push(hardenEdges(riser));
    const elbow = new THREE.TorusGeometry(0.07, 0.035, 6, 10, Math.PI / 2);
    elbow.rotateY(Math.PI / 2);
    elbow.rotateZ(Math.PI / 2);
    elbow.translate(-0.24, 0.81, 0);
    parts.push(hardenEdges(elbow)); // hardenEdges 统一非索引（与 body/riser 等同批合并）
    const tip = new THREE.CylinderGeometry(0.035, 0.035, 0.16, 8);
    tip.rotateZ(Math.PI / 2);
    tip.translate(-0.16, 0.81, 0);
    parts.push(hardenEdges(tip));
    const merged = mergeGeometries(parts);
    if (!merged) throw new Error(`[wasteland] 发电机合并失败 ${id}`);
    return merged;
  });
  const generator = new THREE.Mesh(genGeometry, bodyMaterial);
  generator.name = `${id}/gen`;
  generator.position.set(0.98, 0, 0.05);
  generator.castShadow = true;
  group.add(generator);
  const exhaustAnchor = new THREE.Object3D();
  exhaustAnchor.name = `${id}/exhaust-anchor`;
  exhaustAnchor.position.set(0.98 - 0.08, 0.86, 0.05);
  group.add(exhaustAnchor);

  return { group, ledMaterial, ledHalo, exhaustAnchor };
}

/** 径向小光晕贴图（LED/灯点共用型）。 */
export function makeDotHaloTexture(assets: SharedAssets, key: string): THREE.Texture {
  return assets.texture(key, () => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error(`[wasteland] 无法获取 2d 上下文 ${key}`);
    const grad = ctx.createRadialGradient(32, 32, 1, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,0.95)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.3)');
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

/* ============================== ⑨ 太阳能板阵列 ×4 ============================== */

export interface SolarResult {
  readonly group: THREE.Group;
  /** 板面材质（roofTop 雪壳注册用） */
  readonly panelMaterial: THREE.Material;
  /** 单板倾角 rad（28°） */
  readonly tilt: number;
}

/** 太阳能板阵列 ×4（倾角 28°，实例化 1+1 DC；板面 roofTop）。原点=阵列地面中心，板面朝 +z。 */
export function createSolarArray(assets: SharedAssets, id: string): SolarResult {
  const group = new THREE.Group();
  group.name = id;
  const tilt = (28 * Math.PI) / 180;

  const cellTexture = assets.texture(`${id}/tex-cell`, () => paintCanvasTexture(`${id}/tex-cell`, 128, 96, drawSolarCell));
  const panelMaterial = toonMaterials.get('metal', { color: '#ffffff', map: cellTexture, name: `${id}/panel` });

  // 母版：板面 + 边框 + 双腿（合并 1 DC；实例 ×4）
  const panelGeometry = assets.geometry(`${id}/panel`, () => {
    const parts: THREE.BufferGeometry[] = [];
    const face = new THREE.BoxGeometry(1.06, 0.03, 0.72);
    face.rotateX(-tilt);
    parts.push(hardenEdges(face));
    const frameTop = new THREE.BoxGeometry(1.1, 0.05, 0.05);
    frameTop.rotateX(-tilt);
    frameTop.translate(0, Math.sin(tilt) * 0.36, -Math.cos(tilt) * 0.36);
    parts.push(hardenEdges(frameTop));
    const frameBottom = new THREE.BoxGeometry(1.1, 0.05, 0.05);
    frameBottom.rotateX(-tilt);
    frameBottom.translate(0, -Math.sin(tilt) * 0.36, Math.cos(tilt) * 0.36);
    parts.push(hardenEdges(frameBottom));
    for (const sx of [-0.4, 0.4]) {
      const legFront = new THREE.CylinderGeometry(0.02, 0.02, 0.52, 6);
      legFront.translate(sx, 0.26, 0.28);
      parts.push(hardenEdges(legFront));
      const legBack = new THREE.CylinderGeometry(0.02, 0.02, 0.86, 6);
      legBack.rotateX(-0.36);
      legBack.translate(sx, 0.4, -0.2);
      parts.push(hardenEdges(legBack));
    }
    const merged = mergeGeometries(parts);
    if (!merged) throw new Error(`[wasteland] 太阳能板母版合并失败 ${id}`);
    return merged;
  });
  const panels = new InstancedGroup(panelGeometry, panelMaterial, {
    capacity: 4,
    withShell: true,
    name: `${id}/panels`,
    jitter: { hue: 0.003, saturation: 0.02, lightness: 0.03 },
  });
  const matrix = new THREE.Matrix4();
  const euler = new THREE.Euler();
  const quat = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  const pos = new THREE.Vector3();
  for (let i = 0; i < 4; i++) {
    pos.set(-1.65 + i * 1.1, 0.5, 0);
    euler.set(0, (i % 2) * 0.03 - 0.015, 0);
    quat.setFromEuler(euler);
    matrix.compose(pos, quat, one);
    panels.add(matrix, '#ffffff');
  }
  group.add(panels.group);
  return { group, panelMaterial, tilt };
}

/* ============================== ⑩ 旋转雷达天线 ============================== */

export interface RadarResult {
  readonly group: THREE.Group;
  /** 旋转部（抛物面+背筋+馈源；named `radar`，场景 update 写 rotation.y） */
  readonly rotor: THREE.Group;
  /** 指示灯材质（LampHandle.emissiveMat；blink 1.2s 红） */
  readonly indicatorMaterial: THREE.MeshToonMaterial;
  /** 指示灯光晕 */
  readonly indicatorHalo: THREE.Sprite;
}

/** 旋转雷达天线：基座+立柱（静）+ 转台/Lathe 抛物面/背筋/馈源（named rotor）+ 顶部红色指示灯。原点=地面。 */
export function createRadarDish(assets: SharedAssets, id: string): RadarResult {
  const group = new THREE.Group();
  group.name = id;
  const metalMaterial = toonMaterials.get('metal', { color: '#5a6066', name: `${id}/metal` });

  // 基座 + 立柱（静部 1 DC）
  const baseGeometry = assets.geometry(`${id}/base`, () => {
    const parts: THREE.BufferGeometry[] = [];
    const pad = new THREE.CylinderGeometry(0.34, 0.4, 0.1, 12);
    pad.translate(0, 0.05, 0);
    parts.push(hardenEdges(pad));
    const mast = new THREE.CylinderGeometry(0.05, 0.065, 1.32, 8);
    mast.translate(0, 0.76, 0);
    parts.push(hardenEdges(mast));
    const merged = mergeGeometries(parts);
    if (!merged) throw new Error(`[wasteland] 雷达基座合并失败 ${id}`);
    return merged;
  });
  const base = new THREE.Mesh(baseGeometry, metalMaterial);
  base.name = `${id}/base`;
  base.castShadow = true;
  group.add(base);

  // 旋转部（named radar）
  const rotor = new THREE.Group();
  rotor.name = 'radar';
  rotor.position.y = 1.46;
  group.add(rotor);
  // Lathe 抛物面（开口朝 +z：Lathe 绕 y 成型后倾倒）
  const dishGeometry = assets.geometry(`${id}/dish`, () => {
    const dish = lathe({
      profile: [
        [0.03, 0.0],
        [0.16, 0.035],
        [0.3, 0.1],
        [0.44, 0.2],
        [0.56, 0.34],
        [0.62, 0.44],
      ],
      segments: 18,
    });
    dish.rotateX(-Math.PI / 2); // 抛物面开口朝 +z
    dish.rotateY(Math.PI);
    return dish;
  });
  const dishMaterial = toonMaterials.get('metal', { color: '#8a9298', name: `${id}/dish` });
  const dish = new THREE.Mesh(dishGeometry, dishMaterial);
  dish.name = `${id}/dish`;
  dish.castShadow = true;
  rotor.add(dish);
  // 背筋 ×3（背面弧形托条）
  const ribGeometry = assets.geometry(`${id}/ribs`, () => {
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 3; i++) {
      const angle = -Math.PI / 3 + (i * Math.PI) / 3;
      const points: THREE.Vector3[] = [];
      for (let t = 0; t <= 8; t++) {
        const r = (0.62 * t) / 8;
        const depth = 0.44 * Math.pow(r / 0.62, 2); // 抛物线 y=κr²
        points.push(new THREE.Vector3(Math.sin(angle) * r, -0.06 - depth, Math.cos(angle) * r));
      }
      parts.push(tube({ pointsOrCurve: points, radius: 0.016, tubularSegments: 10 }));
    }
    const merged = mergeGeometries(parts);
    if (!merged) throw new Error(`[wasteland] 雷达背筋合并失败 ${id}`);
    return merged;
  });
  const ribs = new THREE.Mesh(ribGeometry, metalMaterial);
  ribs.name = `${id}/ribs`;
  rotor.add(ribs);
  // 馈源（支杆 + 焦点小盘）
  const feedGeometry = assets.geometry(`${id}/feed`, () => {
    const parts: THREE.BufferGeometry[] = [];
    const rod = new THREE.CylinderGeometry(0.012, 0.012, 0.5, 6);
    rod.rotateX(Math.PI / 2);
    rod.translate(0, 0, 0.25);
    parts.push(hardenEdges(rod));
    const horn = new THREE.CylinderGeometry(0.045, 0.03, 0.07, 8);
    horn.rotateX(Math.PI / 2);
    horn.translate(0, 0, 0.5);
    parts.push(hardenEdges(horn));
    const merged = mergeGeometries(parts);
    if (!merged) throw new Error(`[wasteland] 雷达馈源合并失败 ${id}`);
    return merged;
  });
  const feed = new THREE.Mesh(feedGeometry, metalMaterial);
  feed.name = `${id}/feed`;
  rotor.add(feed);
  // 转台
  const turntable = new THREE.Mesh(
    assets.geometry(`${id}/turntable`, () => {
      const disc = new THREE.CylinderGeometry(0.12, 0.14, 0.1, 10);
      disc.translate(0, -0.06, 0);
      return hardenEdges(disc);
    }),
    metalMaterial,
  );
  turntable.name = `${id}/turntable`;
  rotor.add(turntable);

  // 红色指示灯（blink 1.2s duty 0.5——LampHandle 在场景组装）
  const indicatorMaterial = toonMaterials.getToon('matteProp', {
    color: '#4a3230',
    emissive: '#ff5a4a',
    emissiveIntensity: 1.5, // authored 基值；功率场景映射（dawn 0.3 / 白天 0 / dusk·night 1.0）
    name: `${id}/indicator`,
  });
  const indicator = new THREE.Mesh(
    assets.geometry(`${id}/indicator`, () => new THREE.SphereGeometry(0.032, 8, 6)),
    indicatorMaterial,
  );
  indicator.name = `${id}/indicator`;
  indicator.position.set(0, 0.16, -0.1);
  rotor.add(indicator);
  const indicatorHalo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      color: '#ff5a4a',
      map: makeDotHaloTexture(assets, `${id}/halo-tex`),
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  indicatorHalo.name = `${id}/halo`;
  indicatorHalo.scale.setScalar(0.3);
  indicatorHalo.position.copy(indicator.position);
  indicatorHalo.renderOrder = 20;
  rotor.add(indicatorHalo);

  return { group, rotor, indicatorMaterial, indicatorHalo };
}
