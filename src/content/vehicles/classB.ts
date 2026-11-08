// docs/01-整体架构.md §3.2 content/vehicles/classB.ts —— 3.4 B型露营面包车（vanlife）；T26 落点。
// docs/03-车型模块.md §4.2.0 共通约定 + §4.2.4 车型四 B 型全文；细部几何配方取 docs/drafts/12-车型模块.md
//   §6（【3.4-1…12】逐条落点）；灯光定值 docs/05 §7.1.2 布料行/§7.1.4 灯点行（串灯 blink 3s duty 0.6
//   stagger 错相——「轻快闪烁」而非爆闪，depth 0.3 同海崖串灯不爆闪口径）；docs/04 §5.5 glass/paint 差异点。
//
// ★ 实现期裁定（如实登记）：
//   ① docs/03 §4.2.4 内饰清单列 15 个 named 键但记「16 个 named」、§4.2.6 矩阵记 B 16/23——本实现以
//     钩子清单中的「车内小顶灯」补位第 16 个 named（ceilLamp，steady 0.4 与 C 型顶灯同构），键表如实
//     呈报 openIssues。
//   ② draft §6.1 侧窗洞 x −1.5→0.9 与「尾部台面厨房」清单矛盾（厨房 x −2.3..−1.45 全在洞外，透窗不可
//     见）——取连贯框架：大侧窗洞扩展为 x −1.9→0.9（van 长窗带读法，仍在窗台线 1.15 下留视域）；厨房
//     台面 x −2.3..−1.45 前段入洞带，尾段经后掀尾门开口（纱帘柔化）二次透读。偏差属框架性，不逐条登记。
//   ③ 后掀尾门「掀开露出舱口」：车尾开口以「洞框+内衬暗腔+纱帘」承担（ExtrudeGeometry 端帽无法开洞，
//     建模字典②侧影洞仅贯通侧窗）；大侧窗真开洞按 docs 点名执行（建模字典②）。
//   ④ popTopMattress「俯视经收拢帘可见」：床垫置于升顶帐帘带腔内（y 2.05..2.47、opacity 0.85 半透）+
//     楔前收拢卷 ×2 错缝，俯视经帘/卷读床垫轮廓。
//   ⑤ roofRack/ledString 复用 T27 已落库的通用工厂（@/geom/parts/vehicles/overlandTruck/——docs/03
//     §4.2.0 原划 vehicleKit，T27 按工作流「一车一子目录」惯例落位；跨车 import 为工作流期偏差，待 T28
//     合拢时归位裁决）；awningAssembly 复用 T25 已落库的 vehicleKit 工厂（§4.2.0 原划，无偏差）。
//   ⑥ 翻折小桌铰链落位：draft「卡座之间」与卡座 z ±0.55 坐标打架（卡座间净空 0.36 < 桌深 0.4）——取
//     「卡座旁 −Z 墙、卡座前方」位（x −0.2），半展开 85° 不变。
//
// 依赖纪律（§3.3.6）：只 import core 契约（vehicles/types）+ shared + geom 部件库 + render 工厂；
//   零 import 场景/时间/天气注册表（D2：功率经 applyInteriorLight 下发，本模块不读时间）。
// 无人物红线（一.6）：全模块无人形几何；前排只有座椅/方向盘级道具（radioHandset 式道具不在 B 清单）。
import * as THREE from 'three';
import type {
  DeploymentPart,
  InteriorLightHooks,
  VehicleBuildContext,
  VehicleExterior,
  VehicleInterior,
  VehicleModule,
  WindowSpec,
} from '@/content/vehicles/types';
import { GLASS_NIGHT_OPACITY, GLASS_OPACITY } from '@/content/vehicles/types';
import type { ClothHandle, LampHandle, RGB, SharedAssets, WeatherSurface } from '@/systems/handles';
import { toonMaterials } from '@/render/toonMaterial';
import { hardenEdges, lathe, mergeGeometries, roundedBox, tube } from '@/geom/primitives';
import { InstancedGroup } from '@/geom/instanced';
import {
  createAwningAssembly,
  createBooksStack,
  createPleatedBandGeometry,
  createRollBundleGeometry,
  createWheelGeometries,
} from '@/geom/parts/vehicleKit';
import { createRoofRackParts } from '@/geom/parts/vehicles/overlandTruck/roofRack';
import { createLedStringParts } from '@/geom/parts/vehicles/overlandTruck/ledString';
import { clamp } from '@/shared/math';
import {
  createWoodCounterTexture,
  createRetroTwoToneTexture,
  createStickerTextures,
  createTapestryTexture,
} from '@/geom/parts/vehicles/classB/retroTextures';
import { createGauzeCurtain } from '@/geom/parts/vehicles/classB/gauzeCurtain';
import { createStickerDoodles } from '@/geom/parts/vehicles/classB/stickerDoodle';
import { createFoldTable } from '@/geom/parts/vehicles/classB/foldTable';
import { createBedCushionExt } from '@/geom/parts/vehicles/classB/bedCushionExt';
import { createPlantPot } from '@/geom/parts/vehicles/classB/plantPot';
import { createCoffeeKit } from '@/geom/parts/vehicles/classB/coffeeKit';
import { createSurfboard } from '@/geom/parts/vehicles/classB/surfboard';

/* ============================== 定值（docs/03 §4.2.4 + draft 12 §6） ============================== */

/** B 型通道色板（芥末黄 #d9a13b + 奶油 #fdf6e6/#fff6e2 + 青绿 #7fb5a3 软装【3.4-12】）。 */
const COLORS = {
  body: '#fdf6e6',
  mustard: '#d9a13b',
  teal: '#7fb5a3',
  rust: '#c2564a',
  wedge: '#f7f0e2',
  band: '#f0e6d0',
  innerShell: '#ecd8b0',
  floorWood: '#c9974f',
  warmWhite: '#fff6e2',
  warmLight: '#ffce8a',
  ceilLight: '#ffd9a0',
  fillLight: '#ffce8a',
  tailLamp: '#ff5a4d',
  chassis: '#3a3d42',
  tire: '#2b2b30',
  hub: '#ece8dc', // 白圈复古轮毂（draft §6.1「torus 白环」读法——毂盘白瓷色）
  ink: '#3a3d42',
} satisfies Record<string, RGB>;

/** 几何框架（车体接地：轮胎外缘最低点=局部 y0；docs/03 §4.2.0「+X=车头、+Y=上、+Z=左」）。 */
const F = {
  boxX0: -2.35, boxX1: 2.35, boxY0: 0.35, boxY1: 2.05, boxHalfW: 1.1, // 一厢体（draft §6.1：高 0.35→2.05）
  winX0: -1.9, winX1: 0.9, winY0: 1.15, winY1: 1.75, // 大侧窗洞（裁定②：x 扩展 −1.9）
  fasciaX: 2.37, // 前脸面板（正影挤出，前挡洞）
  wheelR: 0.34, wheelW: 0.22, wheelZ: 0.98, axleF: 1.5, axleR: -1.5,
  wedgeX0: -1.5, wedgeX1: -0.1, wedgeBase: 2.47, wedgeRearTop: 2.85, wedgeFrontTop: 2.75, wedgeHalfW: 0.95,
  bandY0: 2.05, bandH: 0.42, // 帐帘带：车顶 2.05 → 楔底 2.47（补建升顶 ★）
  gateHingeX: -2.35, gateHingeY: 2.02, gateW: 2.0, gateH: 1.62, // 后掀尾门铰链（上掀 70°）
  gateOpenRad: (-70 * Math.PI) / 180,
  openingHalfZ: 0.75, openingY0: 0.55, openingY1: 1.9, // 车尾开口（洞框+暗腔+纱帘，裁定③）
  awningY: 1.98, awningZ: 1.1, // 侧遮阳棚棚根（左壁 +Z）
  rackX: 1.25, rackY: 2.16, // 车顶行李架台面中心
  floorY: 0.55, ceilY: 1.95,
} as const;

/** 布料定值（docs/05 §7.1.2 总表逐行：B 棚 0.4/1.0/0.05、升顶帐帘带 0.9/0.12、纱帘 0.35/0.12、挂毯 0.6/0.12）。 */
const CLOTH = {
  awning: { stiffness: 0.4, windFactor: 1.0, sagAmp: 0.05 },
  band: { stiffness: 0.9, windFactor: 0.12, opacity: 0.85, glow: 0.5 },
  gauze: { stiffness: 0.35, windFactor: 0.12, opacity: 0.5, glow: 0.5 },
  tapestry: { stiffness: 0.6, windFactor: 0.12, glow: 0.15 },
} as const;

/** 灯点（docs/03 §4.2.4 钩子行：串灯 blink 3s 占空 0.6 逐灯错相 stagger 0.4rad + 小顶灯 steady 0.4）。 */
const LAMPS = {
  blinkPeriod: 3,
  blinkDuty: 0.6,
  blinkStagger: 0.4,
  blinkDepth: 0.3, // 「轻快闪烁」不爆闪（docs/05 §7.2.1-① 海崖串灯同口径）
  bulbAuthored: 1.4,
  ceilGain: 0.4,
  ceilAuthored: 1.4,
  stringGroups: 4, // 12 泡分 4 相位组（组内错位排布——逐灯读法，材质预算 4 实例）
} as const;

/** 车内暖光点光（draft 12 §6.4：位 (−0.6,1.5,0)、distance 4.5 小车厢光域更聚；强度 1.15×power×emphasis）。 */
const FILL_LIGHT = { position: [-0.6, 1.5, 0], color: COLORS.fillLight, distance: 4.5, decay: 1.8, gain: 1.15 } as const;

/** footprint（docs/03 §4.2.4：4.7×2.2 外接半径 2.7 五车最小；实算 hypot(2.35,1.1)≈2.60 ≤4.2★）。 */
const FOOTPRINT = { length: 4.7, width: 2.2, track: F.wheelZ * 2, height: 2.9 } as const;

/** 16 个 named 键（docs/03 §4.2.4 键表 15 键 + 裁定① ceilLamp 补位=16）。 */
const NAMED_KEYS = [
  'benchL', 'benchR', 'foldTable', 'bedCushionExt', 'miniStove', 'miniSink', 'miniFridge',
  'stringLights', 'tapestry', 'plantPot', 'coffeeKit', 'booksStack', 'popTopMattress',
  'woodCounter', 'frontSeats', 'ceilLamp',
] as const;

/* ============================== 跨构建共享态（同一模块闭包，同 classC refs 模式） ============================== */

interface ClassBRefs {
  popTop: THREE.Group | null;
  bandMesh: THREE.Mesh | null;
  tailgate: THREE.Group | null;
  awning: THREE.Group | null;
  tapestryMesh: THREE.Mesh | null;
  tapestryMaterial: THREE.MeshToonMaterial | null;
  gauzeMaterial: THREE.MeshToonMaterial | null;
  lampHandles: LampHandle[];
  fillLight: THREE.PointLight;
}

const refs: ClassBRefs = {
  popTop: null,
  bandMesh: null,
  tailgate: null,
  awning: null,
  tapestryMesh: null,
  tapestryMaterial: null,
  gauzeMaterial: null,
  lampHandles: [],
  fillLight: new THREE.PointLight(COLORS.fillLight, 0, FILL_LIGHT.distance, FILL_LIGHT.decay),
};

/* ============================== 小工具（顶点圆角轮廓 / halo 精灵 / 雪壳） ============================== */

/** 顶点圆角多边形轮廓（同 classC roundedPolygon；radii 逐角）。 */
function roundedPolygon(target: THREE.Path, points: readonly (readonly [number, number])[], radii: readonly number[]): void {
  const n = points.length;
  const pt = (i: number): THREE.Vector2 => {
    const p = points[((i % n) + n) % n];
    if (!p) throw new Error('[classB] 轮廓点越界');
    return new THREE.Vector2(p[0], p[1]);
  };
  for (let i = 0; i < n; i++) {
    const prev = pt(i - 1);
    const cur = pt(i);
    const next = pt(i + 1);
    const d1 = cur.clone().sub(prev).normalize();
    const d2 = next.clone().sub(cur).normalize();
    const raw = radii[i] ?? 0.08;
    const r = Math.min(raw, cur.distanceTo(prev) * 0.45, cur.distanceTo(next) * 0.45);
    const a = cur.clone().sub(d1.multiplyScalar(r));
    const b = cur.clone().add(d2.multiplyScalar(r));
    if (i === 0) target.moveTo(a.x, a.y);
    else target.lineTo(a.x, a.y);
    target.quadraticCurveTo(cur.x, cur.y, b.x, b.y);
  }
  target.closePath();
}

function roundedRectPath(x0: number, y0: number, x1: number, y1: number, r: number): THREE.Path {
  const path = new THREE.Path();
  roundedPolygon(path, [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], [r, r, r, r]);
  return path;
}

/** additive 光晕精灵（同 classC makeHaloSprite；docs/05 §4.3.3-⑧ 基值口径）。 */
function makeHaloSprite(assets: SharedAssets, key: string, scale: number, color: string): THREE.Sprite {
  const texture = assets.texture(`${key}-tex`, () => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error(`[classB] 无法获取 2d 上下文 ${key}`);
    const grad = ctx.createRadialGradient(32, 32, 1, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,0.9)');
    grad.addColorStop(0.4, 'rgba(255,255,255,0.28)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    const texture = new THREE.CanvasTexture(canvas);
    texture.name = `${key}-tex`;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
  });
  const material = new THREE.SpriteMaterial({
    color,
    map: texture,
    transparent: true,
    opacity: 0.35, // op=0.35×功率×(1+0.5×glowBoost)——LightBreath 逐帧驱动
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  });
  material.name = `${key}-mat`;
  const sprite = new THREE.Sprite(material);
  sprite.name = key;
  sprite.scale.setScalar(scale);
  sprite.renderOrder = 20;
  return sprite;
}

/** 雪壳材质（同 classC makeSnowShellMaterial；WeatherMaterialSystem 注册期 patchShellExtrude 接管）。 */
function makeSnowShellMaterial(name: string): THREE.Material {
  return toonMaterials.get('matteProp', { color: '#edf2f9', snow: 'off', opacity: 0.999, name });
}

/* ============================== ① buildExterior（docs/03 §4.2.4 外部清单 3.4-1…5） ============================== */

function buildExterior(ctx: VehicleBuildContext): VehicleExterior {
  const { assets, rng } = ctx;
  const group = new THREE.Group();
  group.name = 'classB/exterior';
  refs.popTop = null;
  refs.bandMesh = null;
  refs.tailgate = null;
  refs.awning = null;
  refs.tapestryMesh = null;
  refs.tapestryMaterial = null;
  refs.gauzeMaterial = null;

  /* —— 材质（工厂唯一着色路径；描边：厢体/前脸/尾门/升顶楔开反壳，玻璃/帘布/贴纸/小件 noOutline）—— */
  const retroTexture = createRetroTwoToneTexture(assets, 'classB', COLORS.body, COLORS.mustard);
  retroTexture.repeat.set(1 / (F.boxX1 - F.boxX0), 1 / (F.boxY1 - F.boxY0));
  retroTexture.offset.set(-F.boxX0 / (F.boxX1 - F.boxX0), -F.boxY0 / (F.boxY1 - F.boxY0));
  const bodySideMat = toonMaterials.get('paintCar', { color: COLORS.body, map: retroTexture, name: 'classB/body-side' });
  const bodyPlainMat = toonMaterials.get('paintCar', { color: COLORS.body, name: 'classB/body-plain' });
  const fasciaMat = toonMaterials.get('paintCar', { color: COLORS.body, name: 'classB/fascia' });
  const wedgeMat = toonMaterials.get('paintCar', { color: COLORS.wedge, name: 'classB/wedge' });
  const chassisMat = toonMaterials.get('concrete', { color: COLORS.chassis, name: 'classB/chassis' });
  const tireMat = toonMaterials.get('matteProp', { color: COLORS.tire, name: 'classB/tire' });
  const hubMat = toonMaterials.get('metal', { color: COLORS.hub, name: 'classB/hub' });
  const fenderMat = toonMaterials.get('paintCar', { color: COLORS.chassis, name: 'classB/fender' });
  const detailMat = toonMaterials.get('matteProp', { color: '#d8d2c4', outline: false, name: 'classB/detail' });
  const darkDetailMat = toonMaterials.get('matteProp', { color: '#4a4d52', outline: false, name: 'classB/detail-dark' });
  const tailLampMat = toonMaterials.getToon('matteProp', { color: '#5a1f1a', emissive: COLORS.tailLamp, emissiveIntensity: 0.9, name: 'classB/tail-lamp' });
  const rackMat = toonMaterials.get('metal', { color: '#4a4d52', name: 'classB/rack' });
  const glassClearMat = toonMaterials.get('glass', { color: '#bcd8e8', opacity: GLASS_OPACITY.clear, name: 'classB/glass-clear' });
  glassClearMat.side = THREE.DoubleSide; // 三件套：玻璃 DoubleSide（唯一 name 缓存键内改，同 classC）
  const glassTintedMat = toonMaterials.get('glass', { color: '#9fc4d8', opacity: GLASS_OPACITY.tinted, name: 'classB/glass-tinted' });
  glassTintedMat.side = THREE.DoubleSide;

  /* —— ①一厢式车身：侧影 profileExtrude（短头圆弧 r0.55+高顶平顶），大侧窗真开洞贯通双侧，texRetroTwoTone —— */
  const boxShape = new THREE.Shape();
  roundedPolygon(
    boxShape,
    [
      [F.boxX0, F.boxY0], [F.boxX1, F.boxY0], [F.boxX1, 1.5], [F.boxX1 - 0.55, F.boxY1], [F.boxX0, F.boxY1],
    ],
    [0.08, 0.3, 0.55, 0.14, 0.22], // 短头圆弧：前上角过渡段 r0.55（draft §6.1），高顶平顶
  );
  boxShape.holes.push(roundedRectPath(F.winX0, F.winY0, F.winX1, F.winY1, 0.14));
  const boxMesh = new THREE.Mesh(
    assets.geometry('classB/box-profile', () => {
      const geometry = new THREE.ExtrudeGeometry(boxShape, { depth: F.boxHalfW * 2, bevelEnabled: false, curveSegments: 10, steps: 1 });
      geometry.translate(0, 0, -F.boxHalfW);
      geometry.computeVertexNormals();
      return geometry;
    }),
    [bodySideMat, bodyPlainMat], // 组 0=两侧围 cap（贴 texRetroTwoTone 波浪双色），组 1=顶/底/前后沿（素色）
  );
  boxMesh.name = 'classB/box';
  boxMesh.castShadow = true;
  group.add(boxMesh);

  /* —— 前脸面板（正影挤出+前挡洞）+ 前挡大弧玻璃 tinted（draft §6.1「分面前脸+大弧玻璃」）—— */
  const fasciaShape = new THREE.Shape();
  roundedPolygon(
    fasciaShape,
    [
      [-F.boxHalfW, F.boxY0], [F.boxHalfW, F.boxY0], [F.boxHalfW, 1.5], [F.boxHalfW - 0.5, F.boxY1 - 0.03], [-F.boxHalfW, F.boxY1 - 0.03],
    ],
    [0.06, 0.12, 0.35, 0.12, 0.18], // 轮廓随车身侧影（短头弧+平顶缩 0.03 防共面）
  );
  fasciaShape.holes.push(roundedRectPath(-0.72, 1.15, 0.72, 1.85, 0.12));
  const fasciaMesh = new THREE.Mesh(
    assets.geometry('classB/fascia', () => {
      const geometry = new THREE.ExtrudeGeometry(fasciaShape, { depth: 0.07, bevelEnabled: false, curveSegments: 8, steps: 1 });
      geometry.translate(-0.035, 0, 0);
      geometry.rotateY(Math.PI / 2); // (u,v,t)→(t,v,−u)：厚 0.07 沿 X、宽 2.2
      geometry.translate(F.fasciaX, 0, 0);
      geometry.computeVertexNormals();
      return geometry;
    }),
    fasciaMat,
  );
  fasciaMesh.name = 'classB/fascia';
  fasciaMesh.castShadow = true;
  group.add(fasciaMesh);

  const windshieldGeometry = assets.geometry('classB/windshield', () => {
    const geometry = new THREE.CylinderGeometry(3.0, 3.0, 0.78, 24, 1, true, Math.PI / 2 - 0.31, 0.62);
    geometry.rotateZ(0.17); // 前倾 10°：顶缘后倚（大弧玻璃读法）
    geometry.computeVertexNormals();
    const center = new THREE.Box3().setFromBufferAttribute(geometry.getAttribute('position') as THREE.BufferAttribute).getCenter(new THREE.Vector3());
    geometry.translate(F.fasciaX + 0.02 - center.x, 1.52 - center.y, -center.z);
    return geometry;
  });
  const windshield = new THREE.Mesh(windshieldGeometry, glassTintedMat);
  windshield.name = 'classB/windshield';
  windshield.renderOrder = 20;
  windshield.userData.noOutline = true;
  group.add(windshield);

  /* —— 大侧窗玻璃 ×2（洞形 ShapeGeometry 外偏 0.012；clear=主透视面【3.4-6】）—— */
  const windows: WindowSpec[] = [{ mesh: windshield, tint: 'tinted', label: 'front' }];
  const paneShape = new THREE.Shape();
  roundedPolygon(paneShape, [[F.winX0, F.winY0], [F.winX1, F.winY0], [F.winX1, F.winY1], [F.winX0, F.winY1]], [0.14, 0.14, 0.14, 0.14]);
  const paneGeometry = assets.geometry('classB/glass-side-pane', () => new THREE.ShapeGeometry(paneShape, 6));
  for (const [tag, z] of [['side-l', F.boxHalfW + 0.012], ['side-r', -(F.boxHalfW + 0.012)]] as const) {
    const pane = new THREE.Mesh(paneGeometry, glassClearMat);
    pane.name = `classB/glass-${tag}`;
    pane.position.z = z;
    pane.renderOrder = 20;
    pane.userData.noOutline = true;
    group.add(pane);
    windows.push({ mesh: pane, tint: 'clear', label: tag });
  }

  /* —— 车门把手 ×2（滑门位）+ 后视镜 ×2（短头 A 柱两侧）—— */
  const handleGeometry = assets.geometry('classB/handle', () => {
    const bar = new THREE.CylinderGeometry(0.013, 0.013, 0.13, 8);
    bar.rotateZ(Math.PI / 2);
    return hardenEdges(bar);
  });
  for (const z of [F.boxHalfW + 0.015, -(F.boxHalfW + 0.015)]) {
    const handle = new THREE.Mesh(handleGeometry, detailMat);
    handle.name = `classB/handle/${z}`;
    handle.position.set(0.35, 1.06, z);
    group.add(handle);
    const arm = new THREE.Mesh(
      assets.geometry('classB/mirror-arm', () => hardenEdges(new THREE.CylinderGeometry(0.012, 0.012, 0.24, 8).rotateX(Math.PI / 2))),
      darkDetailMat,
    );
    arm.name = `classB/mirror-arm/${z}`;
    arm.position.set(2.24, 1.7, z > 0 ? F.boxHalfW + 0.12 : -(F.boxHalfW + 0.12));
    group.add(arm);
    const mirrorBox = new THREE.Mesh(
      assets.geometry('classB/mirror-box', () => hardenEdges(roundedBox({ width: 0.05, height: 0.15, depth: 0.1, radius: 0.015 }))),
      detailMat,
    );
    mirrorBox.name = `classB/mirror-box/${z}`;
    mirrorBox.position.set(2.24, 1.7, z > 0 ? F.boxHalfW + 0.26 : -(F.boxHalfW + 0.26));
    group.add(mirrorBox);
  }

  /* —— ②升顶（补建 ★）：楔形 profileExtrude + pleatedBand 帐帘带 + 收拢卷 ×2（00 决议：楔+帐帘带+收拢卷）—— */
  const popTop = new THREE.Group();
  popTop.name = 'classB/pop-top';
  const wedgeShape = new THREE.Shape();
  roundedPolygon(
    wedgeShape,
    [
      [F.wedgeX0, F.wedgeBase], [F.wedgeX1, F.wedgeBase], [F.wedgeX1 - 0.18, F.wedgeFrontTop], [F.wedgeX0 + 0.18, F.wedgeRearTop],
    ],
    [0.08, 0.08, 0.14, 0.14],
  );
  const wedge = new THREE.Mesh(
    assets.geometry('classB/wedge', () => {
      const geometry = new THREE.ExtrudeGeometry(wedgeShape, { depth: F.wedgeHalfW * 2, bevelEnabled: false, curveSegments: 6, steps: 1 });
      geometry.translate(0, 0, -F.wedgeHalfW);
      geometry.computeVertexNormals();
      return geometry;
    }),
    wedgeMat,
  );
  wedge.name = 'classB/pop-top/wedge';
  wedge.castShadow = true;
  popTop.add(wedge);

  // 帐帘带：pleatedBand 环形围合（前/后 3 褶 + 左/右 4 褶；单一网格=单一 ClothHandle）
  const bandY = F.bandY0 + F.bandH / 2;
  const bandParts: THREE.BufferGeometry[] = [];
  const addBandStrip = (width: number, pleats: number, rotY: number, x: number, z: number): void => {
    const geometry = createPleatedBandGeometry({ width, height: F.bandH, pleats, depth: 0.05 });
    geometry.applyMatrix4(new THREE.Matrix4().makeRotationY(rotY).setPosition(x, bandY, z));
    bandParts.push(geometry);
  };
  addBandStrip(F.wedgeHalfW * 2, 4, Math.PI / 2, F.wedgeX1, 0);
  addBandStrip(F.wedgeHalfW * 2, 4, -Math.PI / 2, F.wedgeX0, 0);
  addBandStrip(F.wedgeX1 - F.wedgeX0, 3, Math.PI, (F.wedgeX0 + F.wedgeX1) / 2, -F.wedgeHalfW);
  addBandStrip(F.wedgeX1 - F.wedgeX0, 3, 0, (F.wedgeX0 + F.wedgeX1) / 2, F.wedgeHalfW);
  const bandMerged = mergeGeometries(bandParts);
  if (!bandMerged) throw new Error('[classB] 帐帘带合并失败');
  const bandMat = toonMaterials.getToon('cloth', {
    color: COLORS.band, opacity: CLOTH.band.opacity, emissive: COLORS.fillLight, emissiveIntensity: 0,
    outline: false, name: 'classB/band',
  });
  bandMat.side = THREE.DoubleSide; // 工厂无 side 参数——唯一 name 缓存键内设置（同 classC 帐帘带）
  const bandMesh = new THREE.Mesh(bandMerged, bandMat);
  bandMesh.name = 'classB/pop-top/band';
  bandMesh.castShadow = true;
  popTop.add(bandMesh);
  refs.bandMesh = bandMesh;

  // 收拢卷帘 ×2（rollBundle，楔前角横置——俯视经卷可见升顶床垫裁定④）
  const rollGeo = createRollBundleGeometry(assets, 'classB/roll', { len: 1.0 });
  for (const z of [-0.5, 0.5]) {
    const roll = new THREE.Mesh(rollGeo, bandMat);
    roll.name = `classB/pop-top/roll/${z}`;
    roll.rotation.y = Math.PI / 2; // 卷轴 X → 车宽向 Z
    roll.position.set(F.wedgeX1 - 0.06, bandY + 0.03, z);
    popTop.add(roll);
  }
  group.add(popTop);
  refs.popTop = popTop;

  /* —— ②车顶行李架（roofRack 1.6×1.1）+ 冲浪板（斜置 6°+双绑带，青绿）【3.4-2】—— */
  const rack = createRoofRackParts(assets, 'classB/roof-rack', { length: 1.6, width: 1.1, legFront: 0.105, legRear: 0.105, strips: 5 });
  const rackFrame = new THREE.Mesh(rack.frameGeometry, rackMat);
  rackFrame.name = 'classB/roof-rack/frame';
  rackFrame.position.set(F.rackX, F.rackY, 0);
  rackFrame.castShadow = true;
  group.add(rackFrame);
  const rackStrips = new THREE.Mesh(rack.stripsGeometry, toonMaterials.get('metal', { color: '#6a6f76', outline: false, name: 'classB/rack-strips' }));
  rackStrips.name = 'classB/roof-rack/strips';
  rackStrips.position.set(F.rackX, F.rackY, 0);
  rackStrips.userData.noOutline = true;
  group.add(rackStrips);

  const surfboard = createSurfboard({ assets, id: 'classB/surfboard', length: 1.9, color: COLORS.teal, name: 'classB/surfboard' });
  surfboard.group.name = 'classB/surfboard';
  surfboard.group.position.set(F.rackX, F.rackY + 0.015, 0);
  surfboard.group.rotation.z = 0.105; // 斜置 6°（draft §6.1）
  group.add(surfboard.group);

  /* —— ③侧遮阳棚 awningAssembly(2.6,1.6)（左壁 +Z 展开态；复用 vehicleKit 工厂裁定⑤）【3.4-3】—— */
  const awning = createAwningAssembly({
    assets,
    id: 'classB/awning',
    width: 2.6,
    drop: 1.6,
    color: COLORS.mustard,
    stripeColor: '#fdf6e6',
    stiffness: CLOTH.awning.stiffness,
    windFactor: CLOTH.awning.windFactor,
    sagAmp: CLOTH.awning.sagAmp,
    armColor: '#4a4d52',
  });
  awning.group.name = 'classB/awning';
  awning.group.position.set(0.15, F.awningY, F.awningZ);
  group.add(awning.group);
  refs.awning = awning.group;

  /* —— ④后掀式尾门（弧形板，上掀 70° 悬停）+ 液压杆 ×2 + 车尾开口洞框/暗腔 + 纱帘【3.4-4】—— */
  // 开口洞框（尾端帽无法开洞，裁定③：框+暗腔承担「掀开露出舱口」读法）
  const frameMat = chassisMat;
  const openingW = F.openingHalfZ * 2;
  const openingH = F.openingY1 - F.openingY0;
  const openingCY = (F.openingY0 + F.openingY1) / 2;
  const framePieces: THREE.BufferGeometry[] = [
    hardenEdges(roundedBox({ width: 0.06, height: 0.1, depth: openingW + 0.2, radius: 0.015 })), // 顶框
    hardenEdges(roundedBox({ width: 0.06, height: 0.1, depth: openingW + 0.2, radius: 0.015 })), // 底框
    hardenEdges(roundedBox({ width: 0.06, height: openingH + 0.2, depth: 0.1, radius: 0.015 })), // 侧框
    hardenEdges(roundedBox({ width: 0.06, height: openingH + 0.2, depth: 0.1, radius: 0.015 })), // 侧框
  ];
  framePieces[0]!.translate(-2.38, F.openingY1 + 0.05, 0);
  framePieces[1]!.translate(-2.38, F.openingY0 - 0.05, 0);
  framePieces[2]!.translate(-2.38, openingCY, F.openingHalfZ + 0.05);
  framePieces[3]!.translate(-2.38, openingCY, -(F.openingHalfZ + 0.05));
  const openingFrame = new THREE.Mesh(
    assets.geometry('classB/rear-opening-frame', () => {
      const merged = mergeGeometries(framePieces);
      if (!merged) throw new Error('[classB] 尾部开口框合并失败');
      return merged;
    }),
    frameMat,
  );
  openingFrame.name = 'classB/rear-opening/frame';
  openingFrame.castShadow = true;
  group.add(openingFrame);

  // 内衬暗腔（尾端帽 x −2.35 向内 0.05 的暗盒五面）
  const cavityMat = toonMaterials.get('matteProp', { color: '#4a4038', outline: false, name: 'classB/cavity' });
  const cavityPieces: THREE.BufferGeometry[] = [
    hardenEdges(new THREE.BoxGeometry(0.05, openingH, openingW)), // 腔底（x −2.31）
    hardenEdges(new THREE.BoxGeometry(0.05, 0.02, openingW)),
    hardenEdges(new THREE.BoxGeometry(0.05, 0.02, openingW)),
    hardenEdges(new THREE.BoxGeometry(0.05, openingH, 0.02)),
    hardenEdges(new THREE.BoxGeometry(0.05, openingH, 0.02)),
  ];
  cavityPieces[0]!.translate(-2.305, openingCY, 0);
  cavityPieces[1]!.translate(-2.325, F.openingY1 - 0.01, 0);
  cavityPieces[2]!.translate(-2.325, F.openingY0 + 0.01, 0);
  cavityPieces[3]!.translate(-2.325, openingCY, F.openingHalfZ - 0.01);
  cavityPieces[4]!.translate(-2.325, openingCY, -(F.openingHalfZ - 0.01));
  const cavity = new THREE.Mesh(
    assets.geometry('classB/rear-cavity', () => {
      const merged = mergeGeometries(cavityPieces);
      if (!merged) throw new Error('[classB] 尾部暗腔合并失败');
      return merged;
    }),
    cavityMat,
  );
  cavity.name = 'classB/rear-cavity';
  cavity.userData.noOutline = true;
  group.add(cavity);

  // 纱帘（texGauze 网格 alpha 0.5 + 微风 ClothHandle——舱口内侧，透明策略「网格柔化」）
  const gauze = createGauzeCurtain({
    assets,
    id: 'classB/gauze',
    width: openingW - 0.04,
    height: openingH - 0.02,
    glowColor: COLORS.warmLight,
    stiffness: CLOTH.gauze.stiffness,
    windFactor: CLOTH.gauze.windFactor,
    name: 'classB/gauze',
  });
  gauze.mesh.name = 'classB/gauze';
  gauze.mesh.position.set(-2.322, openingCY, 0);
  group.add(gauze.mesh);
  refs.gauzeMaterial = gauze.material; // glowTag 0.5×power 由钩子写（WindSystem 克隆后双写同步）

  // 尾门枢轴组（铰链在车顶后缘；掀开 70° 悬停 + 液压杆 ×2）
  const tailgate = new THREE.Group();
  tailgate.name = 'classB/tailgate';
  tailgate.position.set(F.gateHingeX, F.gateHingeY, 0);
  const gatePanelShape = new THREE.Shape();
  roundedPolygon(
    gatePanelShape,
    [
      [0.02, 0], [F.gateW - 0.02, 0], [F.gateW - 0.06, -F.gateH * 0.62], [F.gateW * 0.5, -F.gateH], [0.06, -F.gateH * 0.62],
    ],
    [0.05, 0.2, 0.12, 0.12, 0.05], // 弧形读法：底缘中点外凸五点轮廓（弧面门板）
  );
  const gatePanel = new THREE.Group();
  gatePanel.name = 'classB/tailgate/panel';
  gatePanel.rotation.z = F.gateOpenRad; // 上掀 70° 悬停（绕 Z 铰链轴外翻）
  const gateMesh = new THREE.Mesh(
    assets.geometry('classB/gate-panel', () => {
      const geometry = new THREE.ExtrudeGeometry(gatePanelShape, { depth: 0.06, bevelEnabled: false, curveSegments: 8, steps: 1 });
      geometry.translate(0, 0, -0.03);
      geometry.rotateY(Math.PI / 2); // (u,v,t)→(t,v,−u)：厚 0.06 沿 X、门宽沿 Z
      geometry.translate(-0.03, 0, 0); // 门板挂铰链外侧（x −0.06..0，闭合位贴尾端帽 x −2.41..−2.35）
      geometry.computeVertexNormals();
      return geometry;
    }),
    bodyPlainMat,
  );
  gateMesh.name = 'classB/tailgate/gate';
  gateMesh.castShadow = true;
  gatePanel.add(gateMesh);
  // 门内把手（掀开仰视可见；内面=x 0 侧）
  const gateHandle = new THREE.Mesh(
    assets.geometry('classB/gate-handle', () => hardenEdges(new THREE.CylinderGeometry(0.016, 0.016, 0.22, 8).rotateZ(Math.PI / 2))),
    detailMat,
  );
  gateHandle.name = 'classB/tailgate/handle';
  gateHandle.position.set(0.015, -0.28, 0);
  gatePanel.add(gateHandle);
  tailgate.add(gatePanel);

  // 液压杆 ×2：车身锚点 → 门板内面锚点（门板旋转 −70° 后的门侧锚点经旋转矩阵换算到枢轴局部）
  const strutParts: THREE.BufferGeometry[] = [];
  const cosG = Math.cos(F.gateOpenRad);
  const sinG = Math.sin(F.gateOpenRad);
  for (const z of [-0.78, 0.78]) {
    const bodyAnchor = new THREE.Vector3(0.09, -0.87, z); // 车身侧下锚（枢轴局部）
    const gateAnchorLocal = new THREE.Vector3(-0.05, -1.32, z); // 门板内面锚（门板局部）
    const gateAnchor = new THREE.Vector3(
      gateAnchorLocal.x * cosG - gateAnchorLocal.y * sinG,
      gateAnchorLocal.x * sinG + gateAnchorLocal.y * cosG,
      z,
    );
    strutParts.push(
      hardenEdges(
        tube({ pointsOrCurve: [bodyAnchor, bodyAnchor.clone().lerp(gateAnchor, 0.5), gateAnchor], radius: 0.016, tubularSegments: 6, radialSegments: 6 }),
      ),
    );
    strutParts.push(hardenEdges(new THREE.SphereGeometry(0.028, 8, 6).translate(bodyAnchor.x, bodyAnchor.y, bodyAnchor.z)));
    strutParts.push(hardenEdges(new THREE.SphereGeometry(0.028, 8, 6).translate(gateAnchor.x, gateAnchor.y, gateAnchor.z)));
  }
  const struts = new THREE.Mesh(
    assets.geometry('classB/gate-struts', () => {
      const merged = mergeGeometries(strutParts);
      if (!merged) throw new Error('[classB] 液压杆合并失败');
      return merged;
    }),
    toonMaterials.get('metal', { color: '#8a8f96', outline: false, name: 'classB/struts' }),
  );
  struts.name = 'classB/tailgate/struts';
  tailgate.add(struts);
  group.add(tailgate);
  refs.tailgate = tailgate;

  /* —— ⑤手绘贴纸 ×3（4 固定槽位 rng 选 3；右侧裙 ×2 + 尾门 ×2——draft §6.1）【3.4-5】—— */
  const stickerTextures = createStickerTextures(assets, 'classB', COLORS.ink, COLORS.mustard, COLORS.teal);
  const stickerSlots = [
    { tag: 'right-skirt-a', width: 0.26, height: 0.26 },
    { tag: 'right-skirt-b', width: 0.22, height: 0.22 },
    { tag: 'tailgate-a', width: 0.26, height: 0.26 },
    { tag: 'tailgate-b', width: 0.2, height: 0.2 },
  ] as const;
  const stickers = createStickerDoodles({ assets, id: 'classB', textures: stickerTextures, rng: rng.fork('stickers'), slots: stickerSlots });
  const slotPoses: Record<string, { parent: THREE.Object3D; position: [number, number, number]; rotationY: number }> = {
    'right-skirt-a': { parent: group, position: [-0.5, 0.78, -(F.boxHalfW + 0.012)], rotationY: Math.PI },
    'right-skirt-b': { parent: group, position: [-1.4, 0.72, -(F.boxHalfW + 0.012)], rotationY: Math.PI },
    'tailgate-a': { parent: gatePanel, position: [-0.075, -0.5, 0], rotationY: -Math.PI / 2 },
    'tailgate-b': { parent: gatePanel, position: [-0.075, -1.15, 0], rotationY: -Math.PI / 2 },
  };
  stickers.meshes.forEach((mesh, i) => {
    const tag = stickers.pickedTags[i];
    const pose = tag ? slotPoses[tag] : undefined;
    if (!pose) throw new Error(`[classB] 贴纸槽位无位姿：${tag}`);
    mesh.position.set(...pose.position);
    mesh.rotation.y = pose.rotationY;
    pose.parent.add(mesh);
  });
  group.add(stickers.group); // 组容器随槽位拆挂后仅作命名挂点（网格已 reparent 到位姿父节点）

  /* —— 挂毯（3.4-10；布料挂点在 exterior 登记、网格由 buildInterior 转挂内饰组）—— */
  const tapestryTexture = createTapestryTexture(assets, 'classB', COLORS.warmWhite, COLORS.mustard, COLORS.teal, COLORS.rust);
  const tapestryMat = toonMaterials.getToon('cloth', {
    color: COLORS.warmWhite, map: tapestryTexture, opacity: 0.96,
    emissive: COLORS.warmLight, emissiveIntensity: 0, outline: false, name: 'classB/tapestry',
  });
  tapestryMat.side = THREE.DoubleSide;
  const tapestryMesh = new THREE.Mesh(
    assets.geometry('classB/tapestry-mesh', () => {
      const plane = new THREE.PlaneGeometry(0.7, 0.5, 8, 6);
      const position = plane.getAttribute('position') as THREE.BufferAttribute;
      const uv = plane.getAttribute('uv') as THREE.BufferAttribute;
      for (let i = 0; i < position.count; i++) {
        const u = uv.getX(i);
        const v = uv.getY(i);
        uv.setX(i, 1 - v); // wind 定点：固定边=uv.x 0（上缘挂杆）
        uv.setY(i, u);
        position.setZ(i, Math.sin(u * Math.PI * 2) * 0.01 * (1 - v)); // 上缘微垂静态形
      }
      position.needsUpdate = true;
      uv.needsUpdate = true;
      plane.computeVertexNormals();
      plane.computeBoundingSphere();
      return plane;
    }),
    tapestryMat,
  );
  tapestryMesh.name = 'classB/tapestry';
  tapestryMesh.userData.noOutline = true;
  tapestryMesh.position.set(-0.35, 1.45, -0.99);
  tapestryMesh.renderOrder = 14;
  group.add(tapestryMesh);
  refs.tapestryMesh = tapestryMesh;
  refs.tapestryMaterial = tapestryMat; // glowTag 0.15×power 由钩子写
  const tapestryHandle: ClothHandle = {
    mesh: tapestryMesh,
    swayAxes: ['x', 'z'], // 固定边在上：下摆横向/纵深微摆（车内微风）
    stiffness: CLOTH.tapestry.stiffness,
    windFactor: CLOTH.tapestry.windFactor,
    sagAmp: 0,
  };

  /* —— 底盘/保险杠/轮组 ×4（白圈复古轮毂）/轮眉/排气/尾灯（draft §6.1 其余行）—— */
  const chassis = new THREE.Mesh(
    assets.geometry('classB/chassis', () => hardenEdges(roundedBox({ width: 4.2, height: 0.3, depth: 1.9, radius: 0.05 }))),
    chassisMat,
  );
  chassis.name = 'classB/chassis';
  chassis.position.set(0, 0.5, 0);
  chassis.castShadow = true;
  group.add(chassis);
  const bumperGeometry = assets.geometry('classB/bumper', () => hardenEdges(roundedBox({ width: 0.18, height: 0.26, depth: 1.96, radius: 0.05 })));
  for (const [x, tag] of [[2.44, 'front'], [-2.44, 'rear']] as const) {
    const bumper = new THREE.Mesh(bumperGeometry, chassisMat);
    bumper.name = `classB/bumper-${tag}`;
    bumper.position.set(x, 0.48, 0);
    bumper.castShadow = true;
    group.add(bumper);
  }

  // 轮组 ×4：wheel(0.34,0.22) 白圈复古轮毂——InstancedGroup 成对反壳（§5.6）
  const wheelGeometries = createWheelGeometries(assets, 'vehicleKit/wheel/classB', { radius: F.wheelR, width: F.wheelW });
  const tires = new InstancedGroup(wheelGeometries.tire, tireMat, { capacity: 4, withShell: { width: 0.02 }, name: 'classB/wheel-tires' });
  const hubs = new InstancedGroup(wheelGeometries.hub, hubMat, { capacity: 4, withShell: { width: 0.02 }, name: 'classB/wheel-hubs' });
  const wheelMatrix = new THREE.Matrix4();
  for (const [x, z] of [[F.axleF, F.wheelZ], [F.axleF, -F.wheelZ], [F.axleR, F.wheelZ], [F.axleR, -F.wheelZ]] as const) {
    wheelMatrix.identity().setPosition(x, F.wheelR, z);
    tires.add(wheelMatrix, COLORS.tire);
    hubs.add(wheelMatrix, COLORS.hub);
  }
  group.add(tires.group, hubs.group);

  // 轮眉 ×4（弧形挤出）
  const fenderShape = new THREE.Shape();
  fenderShape.moveTo(0.46, 0);
  fenderShape.absarc(0, 0, 0.46, 0, Math.PI, false);
  fenderShape.lineTo(-0.36, 0);
  fenderShape.absarc(0, 0, 0.36, Math.PI, 0, true);
  fenderShape.closePath();
  const fenderGeometry = assets.geometry('classB/fender', () => {
    const geometry = new THREE.ExtrudeGeometry(fenderShape, { depth: 0.3, bevelEnabled: false, curveSegments: 10, steps: 1 });
    geometry.translate(0, 0, -0.15);
    return geometry;
  });
  for (const z of [F.wheelZ, -F.wheelZ]) {
    for (const [tag, x] of [['front', F.axleF], ['rear', F.axleR]] as const) {
      const fender = new THREE.Mesh(fenderGeometry, fenderMat);
      fender.name = `classB/fender-${tag}/${z}`;
      fender.position.set(x, F.wheelR, z);
      fender.castShadow = true;
      group.add(fender);
    }
  }

  // 排气管（尾下）+ 组合尾灯 ×2（尾角竖置红常亮——静态 emissive，非车内灯位）
  const exhaust = new THREE.Mesh(
    assets.geometry('classB/exhaust', () => hardenEdges(new THREE.CylinderGeometry(0.045, 0.045, 0.4, 10).rotateZ(Math.PI / 2))),
    toonMaterials.get('metal', { color: '#8a8f96', outline: false, name: 'classB/exhaust' }),
  );
  exhaust.name = 'classB/exhaust';
  exhaust.position.set(-2.32, 0.3, -0.5);
  group.add(exhaust);
  const tailGeometry = assets.geometry('classB/tail-lamp', () => hardenEdges(roundedBox({ width: 0.07, height: 0.34, depth: 0.1, radius: 0.02 })));
  for (const z of [0.95, -0.95]) {
    const tail = new THREE.Mesh(tailGeometry, tailLampMat);
    tail.name = `classB/tail-lamp/${z}`;
    tail.position.set(-2.39, 1.7, z);
    group.add(tail);
  }

  /* —— weatherSurfaces：棚布 clothTop + 车顶/行李架/升顶楔顶 roofTop（冲浪板顶不积雪——绑带弱化）—— */
  const weatherSurfaces = buildRoofWeatherSurfaces(assets, group, bodyPlainMat, wedgeMat, rackMat, awning);

  return {
    group,
    footprint: { ...FOOTPRINT },
    paint: { baseColor: COLORS.body, textureKeys: ['texRetroTwoTone'], weathering: false },
    windows,
    cloths: [awning.handle, bandHandle(bandMesh), gauze.handle, tapestryHandle],
    weatherSurfaces,
  };
}

/** 帐帘带布料句柄（docs/05 §7.1.2：0.9/0.12 车内微风；sway y 微量同 classC 帐帘带）。 */
function bandHandle(mesh: THREE.Mesh): ClothHandle {
  return {
    mesh,
    swayAxes: ['y'],
    stiffness: CLOTH.band.stiffness,
    windFactor: CLOTH.band.windFactor,
    sagAmp: 0,
  };
}

/** roofTop/clothTop 挂点 ×4（车顶/行李架/升顶楔顶 roofTop + 棚布 clothTop；M4 snowShell 预建 visible=false）。 */
function buildRoofWeatherSurfaces(
  assets: SharedAssets,
  host: THREE.Group,
  roofMat: THREE.Material,
  wedgeMat: THREE.Material,
  rackMat: THREE.Material,
  awning: { group: THREE.Group; clothMesh: THREE.Mesh },
): WeatherSurface[] {
  const makeShell = (id: string, w: number, d: number, position: [number, number, number], rotZ: number, parent: THREE.Object3D): THREE.Mesh => {
    const shell = new THREE.Mesh(
      assets.geometry(id, () => new THREE.PlaneGeometry(w, d, 4, 3).rotateX(-Math.PI / 2)),
      makeSnowShellMaterial(`${id}/mat`),
    );
    shell.name = id;
    shell.position.set(...position);
    shell.rotation.z = rotZ;
    shell.userData.noOutline = true;
    shell.visible = false; // WeatherMaterialSystem 注册后按 snowCover 驱动（docs/05 §4.4.2-M4）
    parent.add(shell);
    return shell;
  };
  const roofSnow = makeShell('classB/snow-roof', 4.5, 2.1, [-0.3, F.boxY1 + 0.012, 0], 0, host);
  const wedgeSnow = makeShell('classB/snow-wedge', 1.15, 1.75, [(F.wedgeX0 + F.wedgeX1) / 2, F.wedgeRearTop + 0.02, 0], -0.05, host);
  const rackSnow = makeShell('classB/snow-rack', 1.5, 1.0, [F.rackX, F.rackY + 0.02, 0], 0, host);
  // 棚布雪壳挂遮阳棚组（斜面随棚倾角——clothTop 行「雪壳挂布料之下」）
  const awningSnow = makeShell('classB/snow-awning', 2.5, 1.55, [0.15, -0.03, 0.78], 0, awning.group);
  awningSnow.rotation.x = 0.209; // 同棚布 12° 斜面（docs/05 §7.1.2 B 棚行）
  return [
    { material: roofMat, kind: 'roofTop', snowShell: roofSnow },
    { material: wedgeMat, kind: 'roofTop', snowShell: wedgeSnow },
    { material: rackMat, kind: 'roofTop', snowShell: rackSnow },
    { material: awning.clothMesh.material as THREE.Material, kind: 'clothTop', snowShell: awningSnow },
  ];
}

/* ============================== ② buildDeployment（draft 12 §6.2：3 个 DeploymentPart） ============================== */

function buildDeployment(_ctx: VehicleBuildContext): readonly DeploymentPart[] {
  const popTop = refs.popTop;
  const tailgate = refs.tailgate;
  const awning = refs.awning;
  if (!popTop || !tailgate || !awning) throw new Error('[classB] buildDeployment 先于 buildExterior 调用（Director 分帧序）');
  return [
    { node: awning, kind: 'awning', deployAmount: 1 }, // 侧遮阳棚整组（展开态）
    { node: tailgate, kind: 'tailgate', deployAmount: 1 }, // 后掀尾门+液压杆（70° 悬停态）
    { node: popTop, kind: 'popTop', deployAmount: 1 }, // 升顶楔+帐帘带+收拢卷（补建件，展开态）
  ];
}

/* ============================== ③ buildInterior（3.4-6…12 逐项；16 named + 三件套） ============================== */

/* —— 内饰材质（工厂缓存单例；灯材质 authored 基值在 buildInterior 内重写，同 classC 裁定④）—— */

const innerShellMat = toonMaterials.getToon('matteProp', {
  color: COLORS.innerShell, outline: false, emissive: COLORS.fillLight, emissiveIntensity: 0, name: 'classB/inner-shell',
});
innerShellMat.side = THREE.BackSide; // 三件套：innerShell BackSide 暖色内壁
const bandMatRef = toonMaterials.getToon('cloth', {
  color: COLORS.band, opacity: CLOTH.band.opacity, emissive: COLORS.fillLight, emissiveIntensity: 0,
  outline: false, name: 'classB/band',
});
const ceilLampMat = toonMaterials.getToon('matteProp', {
  color: '#f5ead6', emissive: COLORS.ceilLight, emissiveIntensity: LAMPS.ceilAuthored * LAMPS.ceilGain, name: 'classB/ceil-lamp',
});

interface FurnitureMaterialSet {
  wood: THREE.Material;
  cream: THREE.Material;
  teal: THREE.Material;
  mustard: THREE.Material;
  darkMetal: THREE.Material;
  steel: THREE.Material;
  counterTop: THREE.Material;
  basin: THREE.Material;
  pillow: THREE.Material;
  floorWood: THREE.Material;
}

function buildFurnitureMaterials(assets: SharedAssets): FurnitureMaterialSet {
  const woodTexture = createWoodCounterTexture(assets, 'classB', '#c9974f');
  woodTexture.repeat.set(1.6, 2.2);
  return {
    wood: toonMaterials.get('wood', { color: COLORS.floorWood, name: 'classB/furn-wood' }),
    cream: toonMaterials.get('matteProp', { color: COLORS.warmWhite, name: 'classB/cream' }),
    teal: toonMaterials.get('cloth', { color: COLORS.teal, name: 'classB/teal' }),
    mustard: toonMaterials.get('cloth', { color: COLORS.mustard, name: 'classB/mustard' }),
    darkMetal: toonMaterials.get('metal', { color: '#4a4a50', name: 'classB/dark-metal' }),
    steel: toonMaterials.get('metal', { color: '#9aa0a6', name: 'classB/steel' }),
    counterTop: toonMaterials.get('wood', { color: COLORS.floorWood, map: woodTexture, name: 'classB/wood-counter' }),
    basin: toonMaterials.get('matteProp', { color: '#3a3d42', name: 'classB/basin' }),
    pillow: toonMaterials.get('cloth', { color: COLORS.warmWhite, name: 'classB/pillow' }),
    floorWood: toonMaterials.get('wood', { color: '#b98a52', name: 'classB/floor' }),
  };
}

function buildInterior(ctx: VehicleBuildContext): VehicleInterior {
  const { assets, rng } = ctx;
  const group = new THREE.Group();
  group.name = 'classB/interior';
  group.userData.noOutline = true; // 三件套：内饰子树整体跳过描边（§5.3）

  // —— 灯基值重写（裁定④同 classC：LightBreath 注册期快照 authored，先重写再注册）——
  ceilLampMat.emissiveIntensity = LAMPS.ceilAuthored * LAMPS.ceilGain;
  ceilLampMat.visible = true;

  const mats = buildFurnitureMaterials(assets);
  const named: Record<string, THREE.Object3D> = {};
  const add = (key: (typeof NAMED_KEYS)[number], object: THREE.Object3D): void => {
    object.name = `classB/interior/${key}`;
    group.add(object);
    named[key] = object;
  };
  const box = (w: number, h: number, d: number, material: THREE.Material, id?: string): THREE.Mesh => {
    const mesh = new THREE.Mesh(
      assets.geometry(id ?? `classB/furn-box|${w}x${h}x${d}`, () => hardenEdges(roundedBox({ width: w, height: h, depth: d, radius: Math.min(0.02, Math.min(w, h, d) * 0.2) }))),
      material,
    );
    if (id) mesh.name = id; // 命名网格（smoke 勾验按名取用）
    return mesh;
  };

  /* —— 三件套 ①innerShell：厢体缩放 0.94 圆角盒 BackSide（castShadow=false）—— */
  const shell = new THREE.Mesh(
    assets.geometry('classB/inner-shell-main', () => roundedBox({ width: (F.boxX1 - F.boxX0) * 0.94, height: (F.boxY1 - F.boxY0) * 0.94, depth: F.boxHalfW * 2 * 0.94, radius: 0.12 })),
    innerShellMat,
  );
  shell.name = 'classB/interior/inner-shell-main';
  shell.position.set(0, (F.boxY0 + F.boxY1) / 2, 0);
  group.add(shell);

  /* —— 地板（素木地板，非 named——named 台面由 woodCounter 承担）—— */
  const floor = new THREE.Mesh(
    assets.geometry('classB/interior-floor', () => new THREE.PlaneGeometry(4.35, 2.0, 1, 1).rotateX(-Math.PI / 2)),
    mats.floorWood,
  );
  floor.name = 'classB/interior/floor';
  floor.position.set(0, F.floorY, 0);
  group.add(floor);

  /* —— `benchL/R` 对坐小卡座【3.4-7】（benchL 保持卡座态；benchR 为变床侧座框）—— */
  const buildBench = (side: 1 | -1, keepSeat: boolean): THREE.Group => {
    const bench = new THREE.Group();
    const seatBase = box(0.8, 0.34, 0.46, mats.wood);
    seatBase.position.set(-0.95, F.floorY + 0.17, side * 0.62);
    bench.add(seatBase);
    if (keepSeat) {
      // 卡座态：青绿坐垫 + 直立靠背（3.4-12 软装色）
      const cushion = box(0.76, 0.08, 0.42, mats.teal, 'classB/bench-cushion');
      cushion.position.set(-0.95, F.floorY + 0.38, side * 0.62);
      const back = box(0.8, 0.55, 0.09, mats.wood, 'classB/bench-back');
      back.position.set(-0.95, F.floorY + 0.62, side * 0.88);
      bench.add(cushion, back);
    }
    return bench;
  };
  add('benchL', buildBench(1, true)); // +Z 左侧：完整卡座（座框+坐垫+靠背——「另一侧保持卡座态」）
  add('benchR', buildBench(-1, false)); // −Z 右侧：变床侧座框（坐垫滑出/靠背翻倒归 bedCushionExt）

  /* —— `foldTable` 翻折小桌（半展开 85°）+ `bedCushionExt` 可变床结构半展——一车同现【3.4-7】—— */
  const foldTable = createFoldTable({
    assets,
    id: 'classB/fold-table',
    width: 0.55,
    depth: 0.4,
    name: 'classB/fold-table',
  });
  foldTable.group.name = 'classB/interior/foldTable';
  foldTable.group.position.set(-0.2, F.floorY + 0.42, -0.88); // 铰链贴 −Z 墙（裁定⑥：卡座旁位）
  foldTable.group.rotation.y = Math.PI; // 局部 −Z（展开向）→ 车厢 +Z（向内）
  group.add(foldTable.group);
  named.foldTable = foldTable.group;

  const bedCushion = createBedCushionExt({
    assets,
    id: 'classB/bed-cushion',
    width: 0.8,
    depth: 0.5,
    slideRatio: 0.6,
    rng: rng.fork('bed-cushion'),
    cushionColor: COLORS.mustard,
    backColor: COLORS.teal,
    name: 'classB/bed-cushion',
  });
  bedCushion.group.name = 'classB/interior/bedCushionExt';
  bedCushion.group.position.set(-0.95, F.floorY + 0.36, -0.62); // 座框顶面（变床侧）
  bedCushion.group.rotation.y = Math.PI; // 局部 −Z（滑出向）→ 车厢 +Z（向内）
  group.add(bedCushion.group);
  named.bedCushionExt = bedCushion.group;

  /* —— 尾部台面（woodCounter 台面木纹 texWoodFloor oak）+ `miniStove`/`miniSink`/`miniFridge`【3.4-8】—— */
  const counter = new THREE.Group();
  const counterBody = box(0.85, 0.72, 1.44, mats.wood, 'classB/counter-body');
  counterBody.position.set(-1.875, F.floorY + 0.36, 0);
  const counterTopPlate = new THREE.Mesh(
    assets.geometry('classB/counter-top', () => hardenEdges(roundedBox({ width: 0.9, height: 0.045, depth: 1.48, radius: 0.015 }))),
    mats.counterTop,
  );
  counterTopPlate.name = 'classB/counter-top';
  counterTopPlate.position.set(-1.875, F.floorY + 0.745, 0);
  counter.add(counterBody, counterTopPlate);
  add('woodCounter', counter);

  const miniStove = new THREE.Group();
  const stoveBase = box(0.3, 0.03, 0.3, mats.darkMetal, 'classB/stove-base');
  stoveBase.position.set(-2.02, F.floorY + 0.78, 0.42);
  const burner = new THREE.Mesh(
    assets.geometry('classB/burner', () => hardenEdges(new THREE.TorusGeometry(0.09, 0.014, 6, 14).rotateX(Math.PI / 2))),
    mats.darkMetal,
  );
  burner.name = 'classB/burner';
  burner.position.set(-2.02, F.floorY + 0.8, 0.42);
  miniStove.add(stoveBase, burner);
  for (const rot of [0, Math.PI / 2]) {
    const grate = new THREE.Mesh(assets.geometry('classB/grate', () => hardenEdges(new THREE.BoxGeometry(0.15, 0.012, 0.02))), mats.steel);
    grate.name = `classB/grate/${rot}`;
    grate.position.set(-2.02, F.floorY + 0.8, 0.42);
    grate.rotation.y = rot;
    miniStove.add(grate);
  }
  add('miniStove', miniStove);

  const miniSink = new THREE.Group();
  const basinRim = box(0.34, 0.045, 0.28, mats.steel, 'classB/basin-rim');
  basinRim.position.set(-2.0, F.floorY + 0.78, -0.38);
  const basinInner = box(0.28, 0.06, 0.22, mats.basin, 'classB/basin-inner');
  basinInner.position.set(-2.0, F.floorY + 0.75, -0.38);
  const faucet = new THREE.Mesh(
    assets.geometry('classB/faucet', () =>
      tube({
        pointsOrCurve: [
          new THREE.Vector3(-2.0, F.floorY + 0.8, -0.5),
          new THREE.Vector3(-2.0, F.floorY + 0.94, -0.5),
          new THREE.Vector3(-2.0, F.floorY + 0.97, -0.44),
          new THREE.Vector3(-2.0, F.floorY + 0.9, -0.4),
        ],
        radius: 0.012,
        tubularSegments: 10,
      }),
    ),
    mats.steel,
  );
  faucet.name = 'classB/faucet';
  miniSink.add(basinRim, basinInner, faucet);
  add('miniSink', miniSink);

  const miniFridge = new THREE.Group();
  const fridgeBody = box(0.42, 0.55, 0.4, mats.cream, 'classB/fridge-body');
  fridgeBody.position.set(-1.72, F.floorY + 0.275, 0.45);
  const fridgeSeam = box(0.42, 0.012, 0.02, mats.darkMetal, 'classB/fridge-seam');
  fridgeSeam.position.set(-1.72, F.floorY + 0.42, 0.645);
  const fridgeHandle = box(0.025, 0.2, 0.025, mats.steel, 'classB/fridge-handle');
  fridgeHandle.position.set(-1.56, F.floorY + 0.38, 0.655);
  miniFridge.add(fridgeBody, fridgeSeam, fridgeHandle);
  add('miniFridge', miniFridge);

  /* —— `stringLights` 车内串灯（ledString 沿顶缘双弧 12 泡；blink 3s duty 0.6 逐灯错相）【3.4-9】—— */
  const stringLights = new THREE.Group();
  stringLights.name = 'classB/interior/stringLights';
  const bulbMatrices: THREE.Matrix4[] = [];
  // 双弧：每侧一条悬链（sag 0.16），各 6 泡
  const strandDefs: readonly { readonly from: THREE.Vector3; readonly to: THREE.Vector3 }[] = [
    { from: new THREE.Vector3(-1.72, 1.84, 0.68), to: new THREE.Vector3(0.78, 1.84, 0.68) },
    { from: new THREE.Vector3(-1.72, 1.84, -0.68), to: new THREE.Vector3(0.78, 1.84, -0.68) },
  ];
  for (const [si, strand] of strandDefs.entries()) {
    const mid = strand.from.clone().lerp(strand.to, 0.5).add(new THREE.Vector3(0, -0.16, 0));
    const led = createLedStringParts(assets, `classB/string-${si}`, { points: [strand.from, mid, strand.to], bulbs: 6, bulbRadius: 0.026 });
    const wire = new THREE.Mesh(led.wireGeometry, toonMaterials.get('matteProp', { color: '#3a3d42', outline: false, name: `classB/string-wire-${si}` }));
    wire.name = `classB/string-wire/${si}`;
    wire.userData.noOutline = true;
    stringLights.add(wire);
    bulbMatrices.push(...led.bulbMatrices);
  }
  // 12 泡分 4 相位组（i % 4——相邻泡不同相，「逐灯相位错开」读法；材质预算 4 实例）
  refs.lampHandles = [];
  for (let g = 0; g < LAMPS.stringGroups; g++) {
    const bulbMat = toonMaterials.getToon('matteProp', {
      color: '#f5ead6', emissive: COLORS.warmLight, emissiveIntensity: LAMPS.bulbAuthored, name: `classB/string-bulb-${g}`,
    });
    const group_ = new InstancedGroup(
      assets.geometry(`classB/string-bulb-geo`, () => hardenEdges(new THREE.SphereGeometry(0.026, 8, 6))),
      bulbMat,
      { capacity: 3, name: `classB/string-bulbs-${g}` },
    );
    bulbMatrices.forEach((m, i) => {
      if (i % LAMPS.stringGroups !== g) return;
      group_.add(m, '#ffd9a0');
    });
    group_.group.userData.noOutline = true;
    stringLights.add(group_.group);
    refs.lampHandles.push({
      emissiveMat: bulbMat,
      mode: 'blink',
      params: { period: LAMPS.blinkPeriod, duty: LAMPS.blinkDuty, stagger: LAMPS.blinkStagger, depth: LAMPS.blinkDepth },
    } satisfies LampHandle);
  }
  add('stringLights', stringLights);

  /* —— `tapestry` 挂毯（Canvas 几何纹样；exterior 建网，此处转挂内饰组；ClothHandle 已登记）【3.4-10】—— */
  const tapestryMesh = refs.tapestryMesh;
  if (!tapestryMesh) throw new Error('[classB] 挂毯网格缺失（buildExterior 未构建）');
  tapestryMesh.name = 'classB/interior/tapestry';
  group.add(tapestryMesh); // 从 exterior 组转挂内饰组（wind 注册在 buildInterior 之后，句柄引用不变）
  named.tapestry = tapestryMesh;

  /* —— `plantPot` 小盆栽（台面角）+ `coffeeKit` 手冲咖啡具（台面）【3.4-10/3.4-11】—— */
  const plantPot = createPlantPot({ assets, id: 'classB/plant-pot', name: 'classB/plant-pot' });
  plantPot.name = 'classB/interior/plantPot';
  plantPot.position.set(-2.24, F.floorY + 0.77, 0.62);
  plantPot.rotation.y = rng.range(0.035, 0.07) * (rng.bool() ? 1 : -1);
  group.add(plantPot);
  named.plantPot = plantPot;

  const coffeeKit = createCoffeeKit({ assets, id: 'classB/coffee-kit', dripperColor: COLORS.teal, name: 'classB/coffee-kit' });
  coffeeKit.name = 'classB/interior/coffeeKit';
  coffeeKit.position.set(-1.62, F.floorY + 0.77, -0.35);
  coffeeKit.rotation.y = Math.PI / 2 + rng.range(-0.07, 0.07); // 壶嘴朝车内（台面随手摆放）
  group.add(coffeeKit);
  named.coffeeKit = coffeeKit;

  /* —— `booksStack` 散落的书（booksStack(5) 双叠+1 本斜靠，座面）【3.4-11】—— */
  const books = createBooksStack({ count: 5, rng: rng.fork('books'), bookSize: [0.18, 0.03, 0.13], name: 'classB/books' });
  books.name = 'classB/interior/booksStack';
  books.position.set(-1.1, F.floorY + 0.35, 0.58);
  books.rotation.y = rng.range(-0.07, 0.07);
  group.add(books);
  named.booksStack = books;

  /* —— `popTopMattress` 升顶床垫（帐帘带腔内；俯视经收拢帘可见——裁定④）—— */
  const popTopMattress = new THREE.Group();
  const mattress = new THREE.Mesh(
    assets.geometry('classB/poptop-mattress', () => hardenEdges(roundedBox({ width: 0.95, height: 0.09, depth: 1.3, radius: 0.03 }))),
    mats.pillow,
  );
  mattress.name = 'classB/poptop-mattress';
  mattress.position.set(-0.8, 2.16, 0);
  const mattressPillow = box(0.3, 0.08, 0.22, mats.teal, 'classB/poptop-pillow');
  mattressPillow.position.set(-1.14, 2.25, 0);
  mattressPillow.rotation.y = rng.range(-0.07, 0.07);
  popTopMattress.add(mattress, mattressPillow);
  add('popTopMattress', popTopMattress);

  /* —— `frontSeats` 前排双座+方向盘（支撑；无人形——只有座椅/方向盘道具）—— */
  const frontSeats = new THREE.Group();
  for (const z of [0.42, -0.42]) {
    const pedestal = box(0.4, 0.12, 0.46, mats.darkMetal, 'classB/seat-pedestal');
    pedestal.position.set(1.35, F.floorY + 0.06, z);
    const cushion = box(0.52, 0.12, 0.5, mats.mustard, 'classB/seat-cushion');
    cushion.position.set(1.35, F.floorY + 0.18, z);
    const back = box(0.12, 0.58, 0.5, mats.mustard, 'classB/seat-back');
    back.position.set(1.62, F.floorY + 0.5, z);
    back.rotation.z = -0.14; // 椅背微后倚
    frontSeats.add(pedestal, cushion, back);
  }
  const steering = new THREE.Mesh(
    assets.geometry('classB/steering', () => hardenEdges(new THREE.TorusGeometry(0.14, 0.02, 6, 14).rotateY(Math.PI / 2))),
    mats.darkMetal,
  );
  steering.name = 'classB/steering';
  steering.position.set(1.78, 1.08, 0.42);
  steering.rotation.z = 0.35; // 随握姿微倾
  const steeringColumn = new THREE.Mesh(
    assets.geometry('classB/steering-column', () => hardenEdges(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 8).rotateZ(Math.PI / 2 - 0.35))),
    mats.darkMetal,
  );
  steeringColumn.name = 'classB/steering-column';
  steeringColumn.position.set(1.6, 0.92, 0.42);
  frontSeats.add(steering, steeringColumn);
  add('frontSeats', frontSeats);

  /* —— `ceilLamp` 车内小顶灯（steady 0.4；裁定①第 16 named）—— */
  const ceilLamp = new THREE.Group();
  const ceilBase = new THREE.Mesh(
    assets.geometry('classB/ceil-lamp-base', () => lathe({ profile: [[0.02, 0.0], [0.09, 0.0], [0.09, 0.02], [0.08, 0.05], [0.0, 0.05]], segments: 12 })),
    mats.darkMetal,
  );
  ceilBase.name = 'classB/ceil-lamp-base';
  ceilBase.position.set(0.3, F.ceilY - 0.02, 0);
  ceilBase.rotation.x = Math.PI;
  const ceilBulb = new THREE.Mesh(assets.geometry('classB/ceil-lamp-bulb', () => new THREE.SphereGeometry(0.06, 10, 8)), ceilLampMat);
  ceilBulb.name = 'classB/ceil-lamp-bulb';
  ceilBulb.position.set(0.3, F.ceilY - 0.08, 0);
  const ceilHalo = makeHaloSprite(assets, 'classB/ceil-lamp-halo', 0.5, COLORS.ceilLight);
  ceilHalo.position.copy(ceilBulb.position);
  ceilLamp.add(ceilBase, ceilBulb, ceilHalo);
  add('ceilLamp', ceilLamp);

  /* —— 灯点句柄收尾：串灯 ×4（blink）+ 小顶灯（steady）—— */
  refs.lampHandles.push({
    emissiveMat: ceilLampMat,
    halo: ceilHalo,
    mode: 'steady',
    params: {},
  } satisfies LampHandle);

  /* —— 车内暖光点光（全局 ≤2 点光预算之「车内暖光」位；draft §6.4 位 (−0.6,1.5,0) distance 4.5）—— */
  const fillLight = new THREE.PointLight(COLORS.fillLight, 0, FILL_LIGHT.distance, FILL_LIGHT.decay);
  fillLight.name = 'classB/fill-light';
  fillLight.position.set(FILL_LIGHT.position[0], FILL_LIGHT.position[1], FILL_LIGHT.position[2]);
  fillLight.castShadow = false;
  group.add(fillLight);
  refs.fillLight = fillLight;

  /* —— 内饰组纪律：不投影不接收阴影（draft §2.2）—— */
  group.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.castShadow = false;
      mesh.receiveShadow = false;
    }
  });

  // named 键完整性自检（16 个逐项在场；漏键即刻抛错——TASKS 勾验通路）
  for (const key of NAMED_KEYS) {
    if (!named[key]) throw new Error(`[classB] named 键缺失：${key}`);
  }
  return { group, named };
}

/* ============================== ④ interiorLightHooks（D2 唯一驱动链；docs/03 §4.2.4 钩子行） ============================== */

/**
 * 可透视窗透明度目标（clear 0.24 / tinted 0.40 → 夜间随 interiorPower 插值降至 0.22，docs/04 §5.5）。
 * 经工厂同名缓存键取用——与 buildExterior 内玻璃材质为同一实例（改一处全场生效）。
 * （B 型涂装无 stripeSpec——芥末波浪双色由 texRetroTwoTone 贴图承担。）
 */
const windowGlassTargets: readonly { readonly material: THREE.MeshToonMaterial; readonly base: number }[] = [
  { material: toonMaterials.getToon('glass', { color: '#bcd8e8', opacity: GLASS_OPACITY.clear, name: 'classB/glass-clear' }), base: GLASS_OPACITY.clear },
  { material: toonMaterials.getToon('glass', { color: '#9fc4d8', opacity: GLASS_OPACITY.tinted, name: 'classB/glass-tinted' }), base: GLASS_OPACITY.tinted },
];

const interiorLightHooks: InteriorLightHooks = {
  get lamps(): readonly LampHandle[] {
    // 每次构建由 buildInterior 重写（串灯 4 相位组 blink + 小顶灯 steady；材质单例重写 authored 基值）
    return refs.lampHandles;
  },
  applyInteriorLight(power: number, emphasis: number, blend: number): void {
    const p = clamp(power, 0, 1);
    const b = clamp(blend, 0, 1);
    // ① 车窗透明度随 interiorPower 向 0.22 插值（docs/03 §4.2.0 玻璃三档行）
    for (const target of windowGlassTargets) {
      target.material.opacity = target.base + (GLASS_NIGHT_OPACITY - target.base) * p;
    }
    // ② glowTags：挂毯 0.15 / 纱帘 0.5 / 帐帘带 0.5（docs/03 §4.2.4 定值；WindSystem 克隆后双写同步）
    const tapestryGlow = CLOTH.tapestry.glow * p;
    const liveTapestry = refs.tapestryMaterial;
    if (liveTapestry) liveTapestry.emissiveIntensity = tapestryGlow;
    const gauzeGlow = CLOTH.gauze.glow * p;
    const liveGauze = refs.gauzeMaterial;
    if (liveGauze) liveGauze.emissiveIntensity = gauzeGlow;
    const bandGlow = CLOTH.band.glow * p;
    bandMatRef.emissiveIntensity = bandGlow;
    const liveBand = refs.bandMesh?.material;
    if (liveBand instanceof THREE.MeshToonMaterial && liveBand !== bandMatRef) {
      liveBand.emissiveIntensity = bandGlow;
    }
    // ③ 无大屏（vanlife 不设屏——忠实原文清单）；串灯/顶灯功率由 LightBreath 'interior' 通道下发
    // ④ 车内暖光点光：1.15×power×emphasis（docs/03 §4.2.0 模板逐字；blend 平滑）
    const target = FILL_LIGHT.gain * p * clamp(emphasis, 0, 2);
    refs.fillLight.intensity = THREE.MathUtils.lerp(refs.fillLight.intensity, target, b);
  },
};

/* ============================== 模块装配（§3.3.3 注册行见 registry.ts；label「B型面包车」） ============================== */

export const classB: VehicleModule = {
  id: 'classB',
  label: 'B型面包车',
  buildExterior,
  buildDeployment,
  buildInterior,
  interiorLightHooks,
};
