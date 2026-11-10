// docs/01-整体架构.md §3.2 content/vehicles/classC.ts —— 3.1 C型房车（默认车型，透视内饰三件套 + 16 named）。
// docs/03-车型模块.md §4.2.0 共通约定（对位/四大手法/三件套/玻璃三档/内饰灯光钩子模板/布料天气挂点/
//   vehicleKit 部件库）+ §4.2.1 车型一 C 型全文；细部几何配方与 named 键表取 docs/drafts/12-车型模块.md
//   §3.1–§3.5（【3.1-1…13】逐条落点）；docs/05 §7.1.4 灯点定值（小夜灯 breath 6s depth 0.18★唯一参数源）；
//   docs/04 §5.5（paintCar/glass 差异强制点：C 暖白+饰条，渲染层零车型分支）。
//
// ★ 实现期裁定（如实登记）：
//   ① draft §3.3 内饰表 y 值彼此矛盾（如 interiorFloor y1.06 与 fridge/吊柜/床铺重叠、dinetteTable z0.62
//     与卡座 z±0.62 同位）。本实现取连贯框架：内饰地板 y=0.66（厢底沿 1.05 以下、窗台线 1.45 以下留视域），
//     家具按家具学常规高度落位（台面≈地板+0.72、座面+0.42、床垫面+0.42、吊柜底+1.11）；各件 y 与 draft
//     表的偏差属框架性偏差，不逐条登记（见 openIssues）。
//   ② draft §3.1「主厢左壁挖洞 x −2.9→−1.0」以「滑出舱体+风琴套+滑轨」组合承担接缝读法（真开洞仅
//     docs/03 §4.2.1 点名的侧窗贯通洞）；滑出舱外板另开真窗洞+clear 玻璃，保证 named `slideoutSofa`
//     透窗「清楚看到」。
//   ③ T17 遗留②（VehicleModule 缺 weatherSurfaces 产出字段）本任务对齐：VehicleExterior 增可选
//     weatherSurfaces，Director 注册/反注册 WeatherMaterialSystem（director.ts/weatherMaterial.ts 同步小改）。
//   ④ LightBreath 注册期快照 authored emissiveIntensity（R-P3-1 注③）：小夜灯/顶灯材质为工厂缓存单例，
//     buildInterior 每次构建先重写 authored 基值再注册，杜绝跨车型交换快照漂移。
//
// 依赖纪律（§3.3.6）：只 import core 契约（vehicles/types）+ shared + geom 部件库 + render 工厂；
//   零 import 场景/时间/天气注册表（D2：功率经 applyInteriorLight 下发，本模块不读时间）。
// 无人物红线（一.6）：全模块无人形几何；「驾驶舱」只有仪表/方向盘级道具，无座椅人形。
import * as THREE from 'three';
import type {
  DeploymentPart,
  InteriorLightHooks,
  PaintStripe,
  VehicleBuildContext,
  VehicleExterior,
  VehicleInterior,
  VehicleModule,
  WindowSpec,
} from '@/content/vehicles/types';
import { GLASS_NIGHT_OPACITY, GLASS_OPACITY } from '@/content/vehicles/types';
import { VEHICLE_BODIES } from '@/content/layout/vehicles'; // 布局约束系统：footprint 字面量同源
import type { ClothHandle, LampHandle, RGB, SharedAssets, WeatherSurface } from '@/systems/handles';
import { toonMaterials } from '@/render/toonMaterial';
import { hardenEdges, lathe, mergeGeometries, roundedBox, tube } from '@/geom/primitives';
import { InstancedGroup } from '@/geom/instanced';
import {
  createBooksStack,
  createGaugeCluster,
  createPleatedBandGeometry,
  createRollBundleGeometry,
  createScreenPanel,
  createWheelGeometries,
} from '@/geom/parts/vehicleKit';
import { clamp } from '@/shared/math';

/* ============================== 定值（docs/03 §4.2.1 + draft §3.1） ============================== */

/** C 型通道色板（奶油木 #d9b98c + 暖白 #fff1dd + 橙点缀 #e8975a【3.1-13】；车身奶油白 #f3ead8）。 */
const COLORS = {
  body: '#f3ead8',
  wedge: '#f7f0e2',
  stripeOrange: '#e8975a',
  stripeTeal: '#4f8f8b',
  floorWood: '#d9b98c',
  warmWhite: '#fff1dd',
  accent: '#e8975a',
  innerShell: '#e8d0a8',
  band: '#e6ddc8',
  warmLight: '#ffce8a',
  ceilLight: '#ffd9a0',
  fillLight: '#ffb066',
  tailLamp: '#ff5a4d',
  markerLamp: '#ffb84d',
  chassis: '#3a3d42',
  tire: '#2b2b30',
  hub: '#b9bcc2',
} satisfies Record<string, RGB>;

/** 几何框架（车体接地：轮胎外缘最低点=局部 y0；docs/03 §4.2.0「+X=车头、+Y=上、+Z=左」）。 */
const F = {
  boxX0: -3.2, boxX1: 0.9, boxY0: 1.05, boxY1: 2.35, boxHalfW: 1.15,
  cabX0: 0.9, cabX1: 2.4, cabFrontTop: 1.9,
  fasciaX: 2.44, fasciaTop: 2.28,
  overX0: 0.88, overX1: 2.52, overY0: 2.28, overRearTop: 3.04, overFrontTop: 2.74,
  wedgeX0: -2.55, wedgeX1: -0.85, wedgeBase: 2.77, wedgeRearTop: 3.27, wedgeFrontTop: 3.03, wedgeHalfW: 1.05,
  bandY0: 2.35, bandH: 0.42,
  slideX0: -2.85, slideX1: -0.95, slideY0: 0.66, slideY1: 2.1, slideOuterZ: -2.1,
  winX0: -1.9, winX1: -0.2, winY0: 1.5, winY1: 2.05,
  doorX0: 1.15, doorX1: 1.75, doorY0: 1.45, doorY1: 2.0,
  wheelR: 0.42, wheelW: 0.26, wheelZ: 1.03, wheelInnerZ: 0.72, axleF: 1.35, axleR: -2.25,
  floorY: 0.66, ceilY: 2.3,
} as const;

/** 布料定值（docs/03 §4.2.1：帐帘带 stiffness 0.9、车内微风 windFactor 0.12；opacity 0.85+透光 emissive）。 */
const BAND_CLOTH = { stiffness: 0.9, windFactor: 0.12, opacity: 0.85, glowFactor: 0.55 } as const;
/** glowTags（docs/03 §4.2.1：床垫 0.10 / 帘布带 0.55 / innerShell 0.12）。 */
const GLOW = { mattress: 0.1, band: BAND_CLOTH.glowFactor, innerShell: 0.12 } as const;
/** 灯点（docs/05 §7.1.4 定值：小夜灯 breath 6s depth 0.18；顶灯 steady 0.55→authored 1.4×0.55）。 */
const LAMPS = { breathPeriod: 6, breathDepth: 0.18, authored: 1.4, ceilGain: 0.55 } as const;

/** 车内暖光点光（docs/03 §4.2.0 模板：强度 1.15×power×emphasis；draft §3.4 位 (−0.9,1.8,0)，3200K 暖域）。 */
const FILL_LIGHT = { position: [-0.9, 1.8, 0], color: COLORS.fillLight, distance: 6.0, decay: 1.8, gain: 1.15 } as const;

/** footprint（docs/03 §4.2.1：6.4×2.6；外接半径 hypot(3.2,1.3)≈3.45 ≤ 营位半径上限 4.2★半径仲裁）。
 *  布局约束系统（本轮）：length/width 同源引用 content/layout/vehicles.ts（车身字面量唯一来源）。 */
const FOOTPRINT = { length: VEHICLE_BODIES.classC.length, width: VEHICLE_BODIES.classC.width, track: F.wheelZ * 2, height: 3.3 } as const;

/** PaintSpec 色带（橙青双色带 v 区间按车身 y1.45..1.75 换算：(y−1.05)/1.3）。 */
const STRIPE_SPEC: readonly PaintStripe[] = [
  { color: COLORS.stripeOrange, from: 0.308, to: 0.415 },
  { color: COLORS.stripeTeal, from: 0.442, to: 0.538 },
];

/** 16 个 named 键（docs/03 §4.2.1「共 16 个 named 组」；draft §3.3 键表逐字）。 */
const NAMED_KEYS = [
  'dashScreen', 'gaugeCluster', 'dinetteTable', 'dinetteBenchL', 'dinetteBenchR',
  'kitchenSink', 'stove', 'fridge', 'overheadCabinets', 'bed', 'nightLamp',
  'slideoutSofa', 'bookshelf', 'books', 'interiorFloor', 'ceilLamp',
] as const;

/* ============================== 跨构建共享态（同一模块闭包，同 seacliff propsRef 模式） ============================== */

interface ClassCRefs {
  bandMesh: THREE.Mesh | null;
  popTop: THREE.Group | null;
  slideOut: THREE.Group | null;
  lampHandles: LampHandle[];
  fillLight: THREE.PointLight;
  screens: THREE.MeshBasicMaterial[];
}

const refs: ClassCRefs = {
  bandMesh: null,
  popTop: null,
  slideOut: null,
  lampHandles: [],
  fillLight: new THREE.PointLight(COLORS.fillLight, 0, FILL_LIGHT.distance, FILL_LIGHT.decay),
  screens: [],
};

/* ============================== 小工具（Canvas 贴图 / 圆角轮廓 / halo / 雪壳） ============================== */

type CanvasDraw = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

/** Canvas 程序化贴图（docs/04 §5.4；经 ctx.assets.texture 缓存与引用计数；同 seacliff 模式）。 */
function paintCanvasTexture(key: string, w: number, h: number, draw: CanvasDraw, transparent = false): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(2, w);
  canvas.height = Math.max(2, h);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error(`[classC] 无法获取 2d 上下文 ${key}`);
  try {
    draw(ctx, canvas.width, canvas.height);
  } catch (err) {
    console.warn(`[classC] 贴图绘制失败，降级留白 ${key}`, err);
    ctx.fillStyle = transparent ? 'rgba(0,0,0,0)' : '#dddddd';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.name = key;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = transparent ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

/** 顶点圆角多边形轮廓（radii 逐角；用于车身侧影/洞形 Shape/Path）。 */
function roundedPolygon(target: THREE.Path, points: readonly (readonly [number, number])[], radii: readonly number[]): void {
  const n = points.length;
  const pt = (i: number): THREE.Vector2 => {
    const p = points[((i % n) + n) % n];
    if (!p) throw new Error('[classC] 轮廓点越界');
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

/** additive 光晕精灵（docs/05 §4.3.3-⑧ 基值口径，同 seacliff makeHaloSprite）。 */
function makeHaloSprite(assets: SharedAssets, key: string, scale: number, color: string): THREE.Sprite {
  const texture = assets.texture(`${key}-tex`, () =>
    paintCanvasTexture(`${key}-tex`, 64, 64, (c, w, h) => {
      const grad = c.createRadialGradient(w / 2, h / 2, 1, w / 2, h / 2, w / 2);
      grad.addColorStop(0, 'rgba(255,255,255,0.9)');
      grad.addColorStop(0.4, 'rgba(255,255,255,0.28)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = grad;
      c.fillRect(0, 0, w, h);
    }, true),
  );
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

/** 雪壳材质（同 seacliff makeSnowShellMaterial；WeatherMaterialSystem 注册期 patchShellExtrude 接管）。 */
function makeSnowShellMaterial(name: string): THREE.Material {
  return toonMaterials.get('matteProp', { color: '#edf2f9', snow: 'off', opacity: 0.999, name });
}

/* ============================== 程序化贴图（texStripeC / texWoodFloor / texScreenNav / texDash） ============================== */

/** texStripeC（draft §2.6：奶油白底+橙/青双色腰带波峰折线+门缝+铆钉；v 按 (y−1.05)/1.3 对位，canvas 行=(1−v)×h）。 */
function drawStripeC(ctx: CanvasRenderingContext2D, w: number, h: number, doorSeams: readonly number[]): void {
  ctx.fillStyle = COLORS.body;
  ctx.fillRect(0, 0, w, h);
  const bandTop = (1 - 0.415) * h;
  const bandBottom = (1 - 0.308) * h;
  const orangeBottom = bandTop + (bandBottom - bandTop) * 0.52;
  ctx.fillStyle = COLORS.stripeOrange;
  ctx.fillRect(0, bandTop, w, orangeBottom - bandTop);
  ctx.fillStyle = COLORS.stripeTeal;
  ctx.beginPath();
  ctx.moveTo(0, orangeBottom);
  const peaks = 7;
  for (let i = 0; i <= peaks; i++) {
    const x = (w * i) / peaks;
    ctx.lineTo(x, orangeBottom + (i % 2 === 0 ? -6 : 6));
  }
  ctx.lineTo(w, bandBottom);
  ctx.lineTo(0, bandBottom);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  for (const seam of doorSeams) ctx.fillRect(seam * w, bandTop - h * 0.18, Math.max(2, w * 0.006), h * 0.42);
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  for (let i = 0; i < 24; i++) {
    ctx.beginPath();
    ctx.arc((w * (i + 0.5)) / 24, bandTop - h * 0.1, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** texWoodFloor oak（draft §2.6：条纹+年轮弧+板缝；oak 亮橡木变体）。 */
function drawWoodFloor(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = COLORS.floorWood;
  ctx.fillRect(0, 0, w, h);
  const rows = 8;
  for (let r = 0; r < rows; r++) {
    const y = (h * r) / rows;
    ctx.fillStyle = r % 2 === 0 ? 'rgba(255,255,255,0.10)' : 'rgba(90,60,30,0.08)';
    ctx.fillRect(0, y, w, h / rows);
    ctx.strokeStyle = 'rgba(90,60,30,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
    const offset = ((r * 97) % 100) / 100;
    ctx.beginPath();
    ctx.arc(w * offset, y + (h / rows) / 2, (h / rows) * 0.32, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(w * offset, y);
    ctx.lineTo(w * offset, y + h / rows);
    ctx.stroke();
  }
}

/** texScreenNav（draft §2.6：抽象 UI 色块行，128²）。 */
function drawScreenNav(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = '#22303a';
  ctx.fillRect(0, 0, w, h);
  const rows: readonly (readonly [string, number])[] = [
    [COLORS.stripeTeal, 0.3], [COLORS.accent, 0.18], ['#d9b98c', 0.24], [COLORS.stripeOrange, 0.12],
  ];
  let y = h * 0.1;
  for (const [color, frac] of rows) {
    ctx.fillStyle = color;
    ctx.fillRect(w * 0.08, y, w * 0.84 * frac, h * 0.14);
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillRect(w * 0.08, y, w * 0.84, h * 0.05);
    y += h * 0.22;
  }
  ctx.fillStyle = '#e8f2f4';
  ctx.fillRect(w * 0.08, y, w * 0.5, h * 0.08);
}

/** texDash warm（draft §2.6：深灰面板+发光刻度弧+指针，暖橙变体）。 */
function drawDashWarm(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = '#26292e';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = COLORS.accent;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(w * 0.3, h * 0.62, h * 0.4, Math.PI * 0.85, Math.PI * 1.95);
  ctx.stroke();
  ctx.strokeStyle = '#e8e2d4';
  ctx.lineWidth = 2;
  for (let i = 0; i < 9; i++) {
    const a = Math.PI * (0.85 + (1.1 * i) / 8);
    ctx.beginPath();
    ctx.moveTo(w * 0.3 + Math.cos(a) * h * 0.33, h * 0.62 - Math.sin(a) * h * 0.33);
    ctx.lineTo(w * 0.3 + Math.cos(a) * h * 0.42, h * 0.62 - Math.sin(a) * h * 0.42);
    ctx.stroke();
  }
  ctx.strokeStyle = '#ffd9a0';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(w * 0.3, h * 0.62);
  ctx.lineTo(w * 0.3 + Math.cos(Math.PI * 1.5) * h * 0.34, h * 0.62 - Math.sin(Math.PI * 1.5) * h * 0.34);
  ctx.stroke();
  ctx.fillStyle = '#4f8f8b';
  ctx.fillRect(w * 0.62, h * 0.28, w * 0.3, h * 0.44);
}

/* ============================== ① buildExterior（docs/03 §4.2.1 外部清单 3.1-1/2/3/4/5） ============================== */

function buildExterior(ctx: VehicleBuildContext): VehicleExterior {
  const { assets } = ctx;
  const group = new THREE.Group();
  group.name = 'classC/exterior';
  refs.bandMesh = null;
  refs.popTop = null;
  refs.slideOut = null;

  /* —— 材质（工厂唯一着色路径；描边：主厢/驾驶舱/凸头/升顶楔开反壳，玻璃/帐帘/小件 noOutline）—— */
  const stripeBoxTexture = assets.texture('classC/tex/stripe-box', () =>
    paintCanvasTexture('classC/tex/stripe-box', 512, 256, (c, w, h) => drawStripeC(c, w, h, [])),
  );
  stripeBoxTexture.repeat.set(1 / (F.boxX1 - F.boxX0), 1 / (F.boxY1 - F.boxY0));
  stripeBoxTexture.offset.set(-F.boxX0 / (F.boxX1 - F.boxX0), -F.boxY0 / (F.boxY1 - F.boxY0));
  const stripeCabTexture = assets.texture('classC/tex/stripe-cab', () =>
    paintCanvasTexture('classC/tex/stripe-cab', 256, 256, (c, w, h) =>
      drawStripeC(c, w, h, [(F.doorX0 - F.cabX0) / (F.cabX1 - F.cabX0), (F.doorX1 - F.cabX0) / (F.cabX1 - F.cabX0)]),
    ),
  );
  stripeCabTexture.repeat.set(1 / (F.cabX1 - F.cabX0), 1 / (F.boxY1 - F.boxY0));
  stripeCabTexture.offset.set(-F.cabX0 / (F.cabX1 - F.cabX0), -F.boxY0 / (F.boxY1 - F.boxY0));

  const bodySideMat = toonMaterials.get('paintCar', { color: COLORS.body, map: stripeBoxTexture, name: 'classC/body-side' });
  const bodyPlainMat = toonMaterials.get('paintCar', { color: COLORS.body, name: 'classC/body-plain' });
  const cabSideMat = toonMaterials.get('paintCar', { color: COLORS.body, map: stripeCabTexture, name: 'classC/cab-side' });
  const cabPlainMat = toonMaterials.get('paintCar', { color: COLORS.body, name: 'classC/cab-plain' });
  const overMat = toonMaterials.get('paintCar', { color: COLORS.body, name: 'classC/cabover' });
  const wedgeMat = toonMaterials.get('paintCar', { color: COLORS.wedge, name: 'classC/wedge' });
  const fasciaMat = toonMaterials.get('paintCar', { color: COLORS.body, name: 'classC/fascia' });
  const slideBodyMat = toonMaterials.get('paintCar', { color: COLORS.body, name: 'classC/slideout-body' });
  const slideRoofMat = toonMaterials.get('paintCar', { color: COLORS.body, name: 'classC/slideout-roof' });
  const chassisMat = toonMaterials.get('concrete', { color: COLORS.chassis, name: 'classC/chassis' });
  const tireMat = toonMaterials.get('matteProp', { color: COLORS.tire, name: 'classC/tire' });
  const hubMat = toonMaterials.get('metal', { color: COLORS.hub, name: 'classC/hub' });
  const fenderMat = toonMaterials.get('paintCar', { color: COLORS.chassis, name: 'classC/fender' });
  const detailMat = toonMaterials.get('matteProp', { color: '#d8d2c4', outline: false, name: 'classC/detail' });
  const darkDetailMat = toonMaterials.get('matteProp', { color: '#4a4d52', outline: false, name: 'classC/detail-dark' });
  const tailLampMat = toonMaterials.getToon('matteProp', { color: '#5a1f1a', emissive: COLORS.tailLamp, emissiveIntensity: 0.9, name: 'classC/tail-lamp' });
  const markerLampMat = toonMaterials.getToon('matteProp', { color: '#6a4a20', emissive: COLORS.markerLamp, emissiveIntensity: 0.8, name: 'classC/marker-lamp' });
  const trimMat = toonMaterials.get('matteProp', { color: COLORS.stripeTeal, outline: false, name: 'classC/trim' });
  const exhaustMat = toonMaterials.get('metal', { color: '#8a8f96', outline: false, name: 'classC/exhaust' });
  const glassClearMat = toonMaterials.get('glass', { color: '#bcd8e8', opacity: GLASS_OPACITY.clear, name: 'classC/glass-clear' });
  glassClearMat.side = THREE.DoubleSide; // 三件套：玻璃 DoubleSide（docs/03 §4.2.1；唯一 name 缓存键内改）
  const glassTintedMat = toonMaterials.get('glass', { color: '#9fc4d8', opacity: GLASS_OPACITY.tinted, name: 'classC/glass-tinted' });
  glassTintedMat.side = THREE.DoubleSide;

  /* —— 主厢体：侧影 profileExtrude，侧窗真开洞贯通双侧（建模字典②；texStripeC 贴两侧围 cap）—— */
  const boxShape = new THREE.Shape();
  roundedPolygon(boxShape, [
    [F.boxX0, F.boxY0], [F.boxX1, F.boxY0], [F.boxX1, F.boxY1], [F.boxX0, F.boxY1],
  ], [0.05, 0.05, 0.26, 0.26]);
  boxShape.holes.push(roundedRectPath(F.winX0, F.winY0, F.winX1, F.winY1, 0.12));
  const boxMesh = new THREE.Mesh(
    assets.geometry('classC/box-profile', () => {
      const geometry = new THREE.ExtrudeGeometry(boxShape, { depth: F.boxHalfW * 2, bevelEnabled: false, curveSegments: 8, steps: 1 });
      geometry.translate(0, 0, -F.boxHalfW);
      geometry.computeVertexNormals();
      return geometry;
    }),
    [bodySideMat, bodyPlainMat], // 组 0=两侧围 cap（贴条纹），组 1=顶/底/前后沿（素色）
  );
  boxMesh.name = 'classC/box';
  boxMesh.castShadow = true;
  group.add(boxMesh);

  /* —— 驾驶舱段：侧影挤出（上缘前倾），门窗洞贯通双侧（draft §3.1）—— */
  const cabShape = new THREE.Shape();
  roundedPolygon(cabShape, [
    [F.cabX0, F.boxY0], [F.cabX1, F.boxY0], [F.cabX1, F.cabFrontTop], [F.cabX0, F.boxY1],
  ], [0.05, 0.08, 0.14, 0.2]);
  cabShape.holes.push(roundedRectPath(F.doorX0, F.doorY0, F.doorX1, F.doorY1, 0.1));
  const cabMesh = new THREE.Mesh(
    assets.geometry('classC/cab-profile', () => {
      const geometry = new THREE.ExtrudeGeometry(cabShape, { depth: F.boxHalfW * 2, bevelEnabled: false, curveSegments: 8, steps: 1 });
      geometry.translate(0, 0, -F.boxHalfW);
      geometry.computeVertexNormals();
      return geometry;
    }),
    [cabSideMat, cabPlainMat],
  );
  cabMesh.name = 'classC/cab';
  cabMesh.castShadow = true;
  group.add(cabMesh);

  /* —— 前脸面板（正影挤出，前挡洞）+ 凸头舱 cab-over（1.5×0.72 上缘前倾 12°，C 型标志【3.1-4】）—— */
  const fasciaShape = new THREE.Shape();
  roundedPolygon(fasciaShape, [
    [-F.boxHalfW, F.boxY0], [F.boxHalfW, F.boxY0], [F.boxHalfW, F.fasciaTop], [-F.boxHalfW, F.fasciaTop],
  ], [0.04, 0.04, 0.16, 0.16]);
  fasciaShape.holes.push(roundedRectPath(-0.6, 1.5, 0.6, 2.2, 0.1));
  const fasciaMesh = new THREE.Mesh(
    assets.geometry('classC/fascia', () => {
      const geometry = new THREE.ExtrudeGeometry(fasciaShape, { depth: 0.08, bevelEnabled: false, curveSegments: 8, steps: 1 });
      geometry.translate(-0.04, 0, 0); // 厚度沿 X：−0.04..0.04
      geometry.rotateY(Math.PI / 2); // (u,v,t)→(t,v,−u)：厚 0.08、宽 2.3
      geometry.translate(F.fasciaX, 0, 0);
      geometry.computeVertexNormals();
      return geometry;
    }),
    fasciaMat,
  );
  fasciaMesh.name = 'classC/fascia';
  fasciaMesh.castShadow = true;
  group.add(fasciaMesh);

  const overShape = new THREE.Shape();
  roundedPolygon(overShape, [
    [F.overX0, F.overY0], [F.overX1, F.overY0], [F.overX1, F.overFrontTop], [F.overX0, F.overRearTop],
  ], [0.06, 0.1, 0.14, 0.16]);
  const overMesh = new THREE.Mesh(
    assets.geometry('classC/cabover', () => {
      const geometry = new THREE.ExtrudeGeometry(overShape, { depth: 2.2, bevelEnabled: false, curveSegments: 8, steps: 1 });
      geometry.translate(0, 0, -1.1);
      geometry.computeVertexNormals();
      return geometry;
    }),
    overMat,
  );
  overMesh.name = 'classC/cab-over';
  overMesh.castShadow = true;
  group.add(overMesh);
  // 前脸装饰条 + 示廓灯 ×3（凸头前缘，琥珀常亮）
  const trim = new THREE.Mesh(assets.geometry('classC/trim', () => hardenEdges(roundedBox({ width: 0.04, height: 0.09, depth: 1.9, radius: 0.01 }))), trimMat);
  trim.name = 'classC/trim';
  trim.position.set(F.overX1 + 0.02, 2.56, 0);
  group.add(trim);
  const markerGeometry = assets.geometry('classC/marker', () => hardenEdges(roundedBox({ width: 0.03, height: 0.05, depth: 0.05, radius: 0.008 })));
  for (const z of [-0.62, 0, 0.62]) {
    const marker = new THREE.Mesh(markerGeometry, markerLampMat);
    marker.name = `classC/marker/${z}`;
    marker.position.set(F.overX1 + 0.025, 2.62, z);
    group.add(marker);
  }

  /* —— 前挡弧玻璃（Cylinder 开口弧段 r2.6 θ0.62 h0.74 仰 8°，glassMat/tinted，draft §3.1）—— */
  const windshieldGeometry = assets.geometry('classC/windshield', () => {
    const geometry = new THREE.CylinderGeometry(2.6, 2.6, 0.74, 24, 1, true, Math.PI / 2 - 0.31, 0.62);
    geometry.rotateZ(0.14); // 仰 8°：顶缘后倾
    geometry.computeVertexNormals();
    const center = new THREE.Box3().setFromBufferAttribute(geometry.getAttribute('position') as THREE.BufferAttribute).getCenter(new THREE.Vector3());
    geometry.translate(2.41 - center.x, 1.86 - center.y, -center.z);
    return geometry;
  });
  const windshield = new THREE.Mesh(windshieldGeometry, glassTintedMat);
  windshield.name = 'classC/windshield';
  windshield.renderOrder = 20;
  windshield.userData.noOutline = true;
  group.add(windshield);

  /* —— 可透视窗（洞形 ShapeGeometry 外偏 0.012；clear=主透视面【3.1-5】）—— */
  const windows: WindowSpec[] = [{ mesh: windshield, tint: 'tinted', label: 'front' }];
  const paneGeometry = (x0: number, y0: number, x1: number, y1: number, r: number, id: string): THREE.BufferGeometry =>
    assets.geometry(id, () => {
      const shape = new THREE.Shape();
      roundedPolygon(shape, [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], [r, r, r, r]);
      return new THREE.ShapeGeometry(shape, 6);
    });
  const addSidePane = (x0: number, y0: number, x1: number, y1: number, r: number, z: number, id: string, label: string): void => {
    const pane = new THREE.Mesh(paneGeometry(x0, y0, x1, y1, r, id), glassClearMat);
    pane.name = id;
    pane.position.z = z;
    pane.renderOrder = 20;
    pane.userData.noOutline = true;
    group.add(pane);
    windows.push({ mesh: pane, tint: 'clear', label });
  };
  addSidePane(F.winX0, F.winY0, F.winX1, F.winY1, 0.12, F.boxHalfW + 0.012, 'classC/glass-side-l', 'side-l');
  addSidePane(F.winX0, F.winY0, F.winX1, F.winY1, 0.12, -(F.boxHalfW + 0.012), 'classC/glass-side-r', 'side-r');
  addSidePane(F.doorX0, F.doorY0, F.doorX1, F.doorY1, 0.1, F.boxHalfW + 0.012, 'classC/glass-door-l', 'door-l');
  addSidePane(F.doorX0, F.doorY0, F.doorX1, F.doorY1, 0.1, -(F.boxHalfW + 0.012), 'classC/glass-door-r', 'door-r');

  /* —— 车门把手 ×2 / 后视镜 ×2（A 柱两侧）—— */
  const handleGeometry = assets.geometry('classC/handle', () => {
    const bar = new THREE.CylinderGeometry(0.014, 0.014, 0.14, 8);
    bar.rotateZ(Math.PI / 2);
    return hardenEdges(bar);
  });
  for (const z of [F.boxHalfW + 0.015, -(F.boxHalfW + 0.015)]) {
    const handle = new THREE.Mesh(handleGeometry, detailMat);
    handle.name = `classC/handle/${z}`;
    handle.position.set(1.84, 1.52, z);
    group.add(handle);
    const arm = new THREE.Mesh(
      assets.geometry('classC/mirror-arm', () => hardenEdges(new THREE.CylinderGeometry(0.012, 0.012, 0.26, 8).rotateX(Math.PI / 2))),
      darkDetailMat,
    );
    arm.name = `classC/mirror-arm/${z}`;
    arm.position.set(2.3, 1.98, z > 0 ? F.boxHalfW + 0.13 : -(F.boxHalfW + 0.13));
    group.add(arm);
    const mirrorBox = new THREE.Mesh(
      assets.geometry('classC/mirror-box', () => hardenEdges(roundedBox({ width: 0.05, height: 0.16, depth: 0.1, radius: 0.015 }))),
      detailMat,
    );
    mirrorBox.name = `classC/mirror-box/${z}`;
    mirrorBox.position.set(2.3, 1.98, z > 0 ? F.boxHalfW + 0.27 : -(F.boxHalfW + 0.27));
    group.add(mirrorBox);
  }

  /* —— 升顶楔 + 帐帘带 + 收拢卷帘 ×2（【3.1-2】展开态；popTop DeploymentPart 内容物）—— */
  const popTop = new THREE.Group();
  popTop.name = 'classC/pop-top';
  const wedgeShape = new THREE.Shape();
  roundedPolygon(wedgeShape, [
    [F.wedgeX0, F.wedgeBase], [F.wedgeX1, F.wedgeBase], [F.wedgeX1, F.wedgeFrontTop], [F.wedgeX0, F.wedgeRearTop],
  ], [0.1, 0.1, 0.14, 0.14]);
  const wedge = new THREE.Mesh(
    assets.geometry('classC/wedge', () => {
      const geometry = new THREE.ExtrudeGeometry(wedgeShape, { depth: F.wedgeHalfW * 2, bevelEnabled: false, curveSegments: 6, steps: 1 });
      geometry.translate(0, 0, -F.wedgeHalfW);
      geometry.computeVertexNormals();
      return geometry;
    }),
    wedgeMat,
  );
  wedge.name = 'classC/pop-top/wedge';
  wedge.castShadow = true;
  popTop.add(wedge);

  // 帐帘带：pleatedBand 环形围合（前/后 4 褶 + 左/右 3 褶 = 14 褶★；单一网格=单一 ClothHandle）
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
  if (!bandMerged) throw new Error('[classC] 帐帘带合并失败');
  const bandMat = toonMaterials.get('cloth', {
    color: COLORS.band, opacity: BAND_CLOTH.opacity, emissive: COLORS.fillLight, emissiveIntensity: 0,
    outline: false, name: 'classC/band',
  });
  bandMat.side = THREE.DoubleSide; // 工厂无 side 参数——唯一 name 缓存键内设置（同 seacliff 帆做法）
  const bandMesh = new THREE.Mesh(bandMerged, bandMat);
  bandMesh.name = 'classC/pop-top/band';
  bandMesh.castShadow = true;
  popTop.add(bandMesh);
  refs.bandMesh = bandMesh;

  // 收拢卷帘 ×2（rollBundle，楔前角横置——俯视可见升顶内，draft §3.1）
  const rollGeo = createRollBundleGeometry(assets, 'classC/roll', { len: 1.0 });
  for (const z of [-0.6, 0.6]) {
    const roll = new THREE.Mesh(rollGeo, bandMat);
    roll.name = `classC/pop-top/roll/${z}`;
    roll.rotation.y = Math.PI / 2; // 卷轴 X → 车宽向 Z
    roll.position.set(F.wedgeX1 - 0.06, bandY + 0.02, z);
    popTop.add(roll);
  }
  group.add(popTop);
  refs.popTop = popTop;

  /* —— 侧拓展舱 + 风琴套 + 滑轨 ×2（【3.1-3】滑出态外移 0.95；slideOut DeploymentPart 内容物）—— */
  const slideOut = new THREE.Group();
  slideOut.name = 'classC/slide-out';
  const slideZc = (F.slideOuterZ - F.boxHalfW) / 2; // 舱体 z 中心（−1.15..−2.10）
  const slideXc = (F.slideX0 + F.slideX1) / 2;
  const slideYc = (F.slideY0 + F.slideY1) / 2;
  const slideH = F.slideY1 - F.slideY0;
  const slideFloor = new THREE.Mesh(assets.geometry('classC/slide-floor', () => hardenEdges(roundedBox({ width: 1.9, height: 0.06, depth: 0.95, radius: 0.015 }))), slideBodyMat);
  slideFloor.name = 'classC/slide-out/floor';
  slideFloor.position.set(slideXc, F.slideY0 - 0.03, slideZc);
  slideFloor.castShadow = true;
  slideOut.add(slideFloor);
  const slideRoof = new THREE.Mesh(assets.geometry('classC/slide-roof', () => hardenEdges(roundedBox({ width: 1.9, height: 0.06, depth: 0.95, radius: 0.015 }))), slideRoofMat);
  slideRoof.name = 'classC/slide-out/roof';
  slideRoof.position.set(slideXc, F.slideY1 + 0.03, slideZc);
  slideRoof.castShadow = true;
  slideOut.add(slideRoof);
  for (const [tag, x] of [['rear', F.slideX0 + 0.03], ['front', F.slideX1 - 0.03]] as const) {
    const cap = new THREE.Mesh(assets.geometry('classC/slide-cap', () => hardenEdges(roundedBox({ width: 0.06, height: slideH, depth: 0.89, radius: 0.015 }))), slideBodyMat);
    cap.name = `classC/slide-out/cap-${tag}`;
    cap.position.set(x, slideYc, slideZc);
    cap.castShadow = true;
    slideOut.add(cap);
  }
  // 外板：真窗洞 + clear 玻璃（裁定②：滑出舱沙发透窗读法）
  const slideShape = new THREE.Shape();
  roundedPolygon(slideShape, [
    [F.slideX0, F.slideY0], [F.slideX1, F.slideY0], [F.slideX1, F.slideY1], [F.slideX0, F.slideY1],
  ], [0.06, 0.06, 0.1, 0.1]);
  slideShape.holes.push(roundedRectPath(-2.5, 1.3, -1.3, 1.95, 0.1));
  const slidePanel = new THREE.Mesh(
    assets.geometry('classC/slide-panel', () => {
      const geometry = new THREE.ExtrudeGeometry(slideShape, { depth: 0.06, bevelEnabled: false, curveSegments: 6, steps: 1 });
      geometry.translate(0, 0, F.slideOuterZ);
      geometry.computeVertexNormals();
      return geometry;
    }),
    slideBodyMat,
  );
  slidePanel.name = 'classC/slide-out/panel';
  slidePanel.castShadow = true;
  slideOut.add(slidePanel);
  const slideGlass = new THREE.Mesh(paneGeometry(-2.5, 1.3, -1.3, 1.95, 0.1, 'classC/glass-slideout'), glassClearMat);
  slideGlass.name = 'classC/glass-slideout';
  slideGlass.position.z = F.slideOuterZ - 0.012;
  slideGlass.renderOrder = 20;
  slideGlass.userData.noOutline = true;
  slideOut.add(slideGlass);
  windows.push({ mesh: slideGlass, tint: 'clear', label: 'slideout' });
  // 风琴套（pleatedBand 褶 10 横向，舱体与车身接缝）+ 滑轨 ×2（洞上下缘，draft §3.1）
  const bellowGeometry = createPleatedBandGeometry({ width: 2.0, height: 0.95, pleats: 10, depth: 0.06 });
  bellowGeometry.applyMatrix4(new THREE.Matrix4().makeRotationY(Math.PI).setPosition(slideXc, slideYc, -(F.boxHalfW + 0.04)));
  const bellowMat = toonMaterials.get('matteProp', { color: '#5a5d63', outline: false, name: 'classC/bellow' });
  const bellow = new THREE.Mesh(bellowGeometry, bellowMat);
  bellow.name = 'classC/slide-out/bellow';
  slideOut.add(bellow);
  const railGeometry = assets.geometry('classC/slide-rail', () => hardenEdges(roundedBox({ width: 1.9, height: 0.06, depth: 0.08, radius: 0.01 })));
  for (const [tag, y] of [['bottom', F.slideY0 + 0.03], ['top', F.slideY1 - 0.03]] as const) {
    const rail = new THREE.Mesh(railGeometry, toonMaterials.get('metal', { color: '#6a6f76', outline: false, name: 'classC/slide-rail' }));
    rail.name = `classC/slide-out/rail-${tag}`;
    rail.position.set(slideXc, y, -(F.boxHalfW + 0.04));
    slideOut.add(rail);
  }
  group.add(slideOut);
  refs.slideOut = slideOut;

  /* —— 底盘/保险杠/轮组/轮眉/排气/舱口/尾灯（draft §3.1 其余行）—— */
  const chassis = new THREE.Mesh(
    assets.geometry('classC/chassis', () => hardenEdges(roundedBox({ width: 5.7, height: 0.5, depth: 2.2, radius: 0.05 }))),
    chassisMat,
  );
  chassis.name = 'classC/chassis';
  chassis.position.set(-0.35, 0.8, 0);
  chassis.castShadow = true;
  group.add(chassis);
  const bumperGeometry = assets.geometry('classC/bumper', () => hardenEdges(roundedBox({ width: 0.24, height: 0.34, depth: 2.1, radius: 0.05 })));
  for (const [x, tag] of [[2.62, 'front'], [-3.32, 'rear']] as const) {
    const bumper = new THREE.Mesh(bumperGeometry, chassisMat);
    bumper.name = `classC/bumper-${tag}`;
    bumper.position.set(x, 0.72, 0);
    bumper.castShadow = true;
    group.add(bumper);
  }

  // 轮组：wheel(0.42,0.26) 后双胎（外 z ±1.03 + 内 z ±0.72）——InstancedGroup 成对反壳（§5.6）
  const wheelGeometries = createWheelGeometries(assets, 'vehicleKit/wheel/classC', { radius: F.wheelR, width: F.wheelW });
  const tires = new InstancedGroup(wheelGeometries.tire, tireMat, { capacity: 6, withShell: { width: 0.02 }, name: 'classC/wheel-tires' });
  const hubs = new InstancedGroup(wheelGeometries.hub, hubMat, { capacity: 6, withShell: { width: 0.02 }, name: 'classC/wheel-hubs' });
  const wheelMatrix = new THREE.Matrix4();
  const wheelSpots: readonly (readonly [number, number])[] = [
    [F.axleF, F.wheelZ], [F.axleF, -F.wheelZ],
    [F.axleR, F.wheelZ], [F.axleR, -F.wheelZ],
    [F.axleR, F.wheelInnerZ], [F.axleR, -F.wheelInnerZ],
  ];
  for (const [x, z] of wheelSpots) {
    wheelMatrix.identity().setPosition(x, F.wheelR, z);
    tires.add(wheelMatrix, COLORS.tire);
    hubs.add(wheelMatrix, COLORS.hub);
  }
  group.add(tires.group, hubs.group);

  // 轮眉 ×4（弧形挤出；前 0.34 宽 / 后 0.66 宽盖双胎）
  const fenderShape = new THREE.Shape();
  fenderShape.moveTo(0.56, 0);
  fenderShape.absarc(0, 0, 0.56, 0, Math.PI, false);
  fenderShape.lineTo(-0.44, 0);
  fenderShape.absarc(0, 0, 0.44, Math.PI, 0, true);
  fenderShape.closePath();
  const fenderFront = assets.geometry('classC/fender-front', () => {
    const geometry = new THREE.ExtrudeGeometry(fenderShape, { depth: 0.34, bevelEnabled: false, curveSegments: 10, steps: 1 });
    geometry.translate(0, 0, -0.17);
    return geometry;
  });
  const fenderRear = assets.geometry('classC/fender-rear', () => {
    const geometry = new THREE.ExtrudeGeometry(fenderShape, { depth: 0.66, bevelEnabled: false, curveSegments: 10, steps: 1 });
    geometry.translate(0, 0, -0.33);
    return geometry;
  });
  for (const z of [F.wheelZ, -F.wheelZ]) {
    const front = new THREE.Mesh(fenderFront, fenderMat);
    front.name = `classC/fender-front/${z}`;
    front.position.set(F.axleF, F.wheelR, z);
    front.castShadow = true;
    group.add(front);
    const rear = new THREE.Mesh(fenderRear, fenderMat);
    rear.name = `classC/fender-rear/${z}`;
    rear.position.set(F.axleR, F.wheelR, z > 0 ? (F.wheelZ + F.wheelInnerZ) / 2 : -(F.wheelZ + F.wheelInnerZ) / 2);
    rear.castShadow = true;
    group.add(rear);
  }

  // 排气管（尾下，金属灰）
  const exhaust = new THREE.Mesh(
    assets.geometry('classC/exhaust', () => hardenEdges(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 10).rotateZ(Math.PI / 2))),
    exhaustMat,
  );
  exhaust.name = 'classC/exhaust';
  exhaust.position.set(-3.05, 0.42, -0.55);
  group.add(exhaust);

  // 设备舱口 ×2（侧裙）+ 水电接驳口（尾左，呼应场景水电桩）
  const hatchGeometry = assets.geometry('classC/hatch', () => hardenEdges(roundedBox({ width: 0.6, height: 0.35, depth: 0.03, radius: 0.02 })));
  for (const [x, z] of [[-0.6, F.boxHalfW + 0.015], [-3.0, -(F.boxHalfW + 0.015)]] as const) {
    const hatch = new THREE.Mesh(hatchGeometry, darkDetailMat);
    hatch.name = `classC/hatch/${x}/${z}`;
    hatch.position.set(x, 0.85, z);
    group.add(hatch);
  }
  const hookup = new THREE.Mesh(assets.geometry('classC/hookup', () => hardenEdges(roundedBox({ width: 0.3, height: 0.22, depth: 0.05, radius: 0.02 }))), darkDetailMat);
  hookup.name = 'classC/hookup';
  hookup.position.set(-3.18, 0.82, -0.85);
  group.add(hookup);

  // 组合尾灯 ×2（尾角竖置，红低常亮——静态 emissive，非 interiorLightHooks 车内灯位）
  const tailGeometry = assets.geometry('classC/tail-lamp', () => hardenEdges(roundedBox({ width: 0.08, height: 0.5, depth: 0.12, radius: 0.02 })));
  for (const z of [1.0, -1.0]) {
    const tail = new THREE.Mesh(tailGeometry, tailLampMat);
    tail.name = `classC/tail-lamp/${z}`;
    tail.position.set(-3.23, 1.3, z);
    group.add(tail);
  }

  return {
    group,
    footprint: { ...FOOTPRINT },
    paint: { baseColor: COLORS.body, stripeSpec: STRIPE_SPEC, textureKeys: ['texStripeC'], weathering: false },
    windows,
    cloths: [
      {
        mesh: bandMesh,
        swayAxes: ['y'], // draft §3.5：帐帘带 swayAxes y 微量
        stiffness: BAND_CLOTH.stiffness,
        windFactor: BAND_CLOTH.windFactor, // 车内微风（docs/05 §7.1.2 C 型帐帘带行）
      } satisfies ClothHandle,
    ],
    weatherSurfaces: buildRoofWeatherSurfaces(assets, group, bodyPlainMat, wedgeMat, slideRoofMat),
  };
}

/** roofTop 挂点 ×3（docs/03 §4.2.1：车顶面板/升顶楔顶/拓展舱顶；M4 snowShell 预建克隆，visible=false）。 */
function buildRoofWeatherSurfaces(
  assets: SharedAssets,
  host: THREE.Group,
  roofMat: THREE.Material,
  wedgeMat: THREE.Material,
  slideRoofMat: THREE.Material,
): WeatherSurface[] {
  const makeShell = (id: string, w: number, d: number, position: [number, number, number], rotZ: number): THREE.Mesh => {
    const shell = new THREE.Mesh(
      assets.geometry(id, () => new THREE.PlaneGeometry(w, d, 4, 3).rotateX(-Math.PI / 2)),
      makeSnowShellMaterial(`${id}/mat`),
    );
    shell.name = id;
    shell.position.set(...position);
    shell.rotation.z = rotZ;
    shell.userData.noOutline = true;
    shell.visible = false; // WeatherMaterialSystem 注册后按 snowCover 驱动（docs/05 §4.4.2-M4）
    return shell;
  };
  const roofSnow = makeShell('classC/snow-roof', 3.5, 2.26, [-1.15, F.boxY1 + 0.012, 0], 0);
  const wedgeSnow = makeShell('classC/snow-wedge', 1.55, 2.0, [(F.wedgeX0 + F.wedgeX1) / 2, 3.18, 0], -0.14);
  const slideSnow = makeShell('classC/snow-slideout', 1.8, 0.9, [(F.slideX0 + F.slideX1) / 2, F.slideY1 + 0.072, (F.slideOuterZ - F.boxHalfW) / 2], 0);
  host.add(roofSnow, wedgeSnow, slideSnow); // 雪壳随车体变换（Director 经 weatherSurfaces 注册进 WeatherMaterialSystem）
  return [
    { material: roofMat, kind: 'roofTop', snowShell: roofSnow },
    { material: wedgeMat, kind: 'roofTop', snowShell: wedgeSnow },
    { material: slideRoofMat, kind: 'roofTop', snowShell: slideSnow },
  ];
}

/* ============================== ② buildDeployment（draft §3.2：2 个 DeploymentPart，默认已展开） ============================== */

function buildDeployment(_ctx: VehicleBuildContext): readonly DeploymentPart[] {
  const popTop = refs.popTop;
  const slideOut = refs.slideOut;
  if (!popTop || !slideOut) throw new Error('[classC] buildDeployment 先于 buildExterior 调用（Director 分帧序）');
  return [
    { node: popTop, kind: 'popTop', deployAmount: 1 }, // 升顶楔+帐帘带+收拢卷（静态展开态，不做开合动画）
    { node: slideOut, kind: 'slideOut', deployAmount: 1 }, // 侧拓展舱+风琴套+滑轨（静态滑出态）
  ];
}

/* ============================== ③ buildInterior（3.1-6…12 逐项；16 named + 三件套） ============================== */

/* —— 内饰材质（工厂缓存单例；灯材质 authored 基值在 buildInterior 内重写，见文件头裁定④）—— */

const innerShellMat = toonMaterials.getToon('matteProp', {
  color: COLORS.innerShell, outline: false, emissive: COLORS.fillLight, emissiveIntensity: 0, name: 'classC/inner-shell',
});
innerShellMat.side = THREE.BackSide; // 三件套：innerShell BackSide 暖色内壁（docs/03 §4.2.1）
const mattressMat = toonMaterials.getToon('cloth', { color: '#e8dcc8', emissive: '#ff9a5a', emissiveIntensity: 0, name: 'classC/mattress' });
const nightLampMat = toonMaterials.getToon('matteProp', { color: '#f5ead6', emissive: COLORS.warmLight, emissiveIntensity: LAMPS.authored, name: 'classC/night-lamp' });
const ceilLampMat = toonMaterials.getToon('matteProp', { color: '#f5ead6', emissive: COLORS.ceilLight, emissiveIntensity: LAMPS.authored * LAMPS.ceilGain, name: 'classC/ceil-lamp' });

interface FurnitureMaterialSet {
  wood: THREE.Material;
  warmWhite: THREE.Material;
  accent: THREE.Material;
  darkMetal: THREE.Material;
  steel: THREE.Material;
  counterTop: THREE.Material;
  basin: THREE.Material;
  quiltA: THREE.Material;
  quiltB: THREE.Material;
  sofa: THREE.Material;
  pillow: THREE.Material;
  shelf: THREE.Material;
  floorWood: THREE.Material;
}

function buildFurnitureMaterials(assets: SharedAssets): FurnitureMaterialSet {
  const woodFloorTexture = assets.texture('classC/tex/wood-floor', () => paintCanvasTexture('classC/tex/wood-floor', 256, 256, drawWoodFloor));
  woodFloorTexture.repeat.set(6, 2.4);
  return {
    wood: toonMaterials.get('wood', { color: COLORS.floorWood, name: 'classC/furn-wood' }),
    warmWhite: toonMaterials.get('matteProp', { color: COLORS.warmWhite, name: 'classC/warm-white' }),
    accent: toonMaterials.get('matteProp', { color: COLORS.accent, name: 'classC/accent' }),
    darkMetal: toonMaterials.get('metal', { color: '#4a4a50', name: 'classC/dark-metal' }),
    steel: toonMaterials.get('metal', { color: '#9aa0a6', name: 'classC/steel' }),
    counterTop: toonMaterials.get('matteProp', { color: '#e8e2d4', name: 'classC/counter' }),
    basin: toonMaterials.get('matteProp', { color: '#3a3d42', name: 'classC/basin' }),
    quiltA: toonMaterials.get('cloth', { color: '#c2564a', name: 'classC/quilt-a' }),
    quiltB: toonMaterials.get('cloth', { color: COLORS.stripeTeal, name: 'classC/quilt-b' }),
    sofa: toonMaterials.get('cloth', { color: '#d9885c', name: 'classC/sofa' }),
    pillow: toonMaterials.get('cloth', { color: COLORS.warmWhite, name: 'classC/pillow' }),
    shelf: toonMaterials.get('wood', { color: '#c9a86e', name: 'classC/shelf' }),
    floorWood: toonMaterials.get('wood', { color: COLORS.floorWood, map: woodFloorTexture, name: 'classC/interior-floor' }),
  };
}

function buildInterior(ctx: VehicleBuildContext): VehicleInterior {
  const { assets, rng } = ctx;
  const group = new THREE.Group();
  group.name = 'classC/interior';
  group.userData.noOutline = true; // 三件套：内饰子树整体跳过描边（§5.3）

  // —— 灯基值重写（裁定④：LightBreath 注册期快照 authored，先重写再由 Director 注册）——
  nightLampMat.emissiveIntensity = LAMPS.authored;
  ceilLampMat.emissiveIntensity = LAMPS.authored * LAMPS.ceilGain;
  nightLampMat.visible = true;
  ceilLampMat.visible = true;

  const mats = buildFurnitureMaterials(assets);
  const named: Record<string, THREE.Object3D> = {};
  const add = (key: (typeof NAMED_KEYS)[number], object: THREE.Object3D): void => {
    object.name = `classC/interior/${key}`;
    group.add(object);
    named[key] = object;
  };
  const box = (w: number, h: number, d: number, material: THREE.Material, id?: string): THREE.Mesh =>
    new THREE.Mesh(
      assets.geometry(id ?? `classC/furn-box|${w}x${h}x${d}`, () => hardenEdges(roundedBox({ width: w, height: h, depth: d, radius: Math.min(0.02, Math.min(w, h, d) * 0.2) }))),
      material,
    );

  /* —— 三件套 ①innerShell：车身体缩放 0.94 圆角盒 BackSide（主厢+驾驶舱两段；castShadow=false）—— */
  const shellMain = new THREE.Mesh(
    assets.geometry('classC/inner-shell-main', () => roundedBox({ width: (F.boxX1 - F.boxX0) * 0.94, height: (F.boxY1 - F.boxY0) * 0.94, depth: F.boxHalfW * 2 * 0.94, radius: 0.1 })),
    innerShellMat,
  );
  shellMain.name = 'classC/interior/inner-shell-main';
  shellMain.position.set((F.boxX0 + F.boxX1) / 2, (F.boxY0 + F.boxY1) / 2, 0);
  const shellCab = new THREE.Mesh(
    assets.geometry('classC/inner-shell-cab', () => roundedBox({ width: (F.cabX1 - F.cabX0) * 0.94, height: (F.boxY1 - F.boxY0) * 0.94, depth: F.boxHalfW * 2 * 0.94, radius: 0.1 })),
    innerShellMat,
  );
  shellCab.name = 'classC/interior/inner-shell-cab';
  shellCab.position.set((F.cabX0 + F.cabX1) / 2 + 0.05, (F.boxY0 + F.boxY1) / 2, 0);
  group.add(shellMain, shellCab);

  /* —— `interiorFloor` 地板（texWoodFloor oak，厢内；【3.1-13】奶油木基调）—— */
  const floor = new THREE.Mesh(
    assets.geometry('classC/interior-floor', () => new THREE.PlaneGeometry(5.3, 2.14, 1, 1).rotateX(-Math.PI / 2)),
    mats.floorWood,
  );
  floor.name = 'classC/interior/interiorFloor';
  floor.position.set(-0.4, F.floorY, 0);
  group.add(floor);
  named.interiorFloor = floor;

  /* —— `dashScreen` 驾驶舱大屏（screenPanel+texScreenNav，斜立 12°）+ `gaugeCluster` 仪表+方向盘 —— */
  const navTexture = assets.texture('classC/tex/screen-nav', () => paintCanvasTexture('classC/tex/screen-nav', 128, 128, drawScreenNav));
  const dash = createScreenPanel({ width: 0.5, height: 0.3, map: navTexture, name: 'classC/dash-screen' });
  dash.group.name = 'classC/interior/dashScreen'; // named 键统一命名（16 named 物体名前缀一致，勾验/冒烟取用）
  dash.group.position.set(1.48, 1.66, -0.45);
  dash.group.rotation.y = -Math.PI / 2; // 屏面朝 −X（驾驶员）
  const dashTilt = new THREE.Group();
  dashTilt.name = 'classC/interior/dash-tilt';
  dashTilt.rotation.z = -0.21; // 斜立 12°（顶缘后倚）
  dashTilt.add(dash.group);
  group.add(dashTilt);
  named.dashScreen = dash.group;
  refs.screens = [dash.screenMaterial];

  const dashTexture = assets.texture('classC/tex/dash-warm', () => paintCanvasTexture('classC/tex/dash-warm', 256, 128, drawDashWarm));
  const gauge = createGaugeCluster({ style: 'warm', map: dashTexture, name: 'classC/gauge' });
  gauge.group.name = 'classC/interior/gaugeCluster'; // named 键统一命名
  gauge.group.position.set(1.7, 1.52, -0.45);
  gauge.group.rotation.y = -Math.PI / 2;
  group.add(gauge.group);
  named.gaugeCluster = gauge.group;
  refs.screens.push(gauge.screenMaterial);

  /* —— `dinetteTable` 卡座餐桌 + `dinetteBenchL/R` 对坐卡座（z ±0.62 对坐，桌居中）—— */
  const table = new THREE.Group();
  const tableTop = box(1.05, 0.05, 0.65, mats.wood, 'classC/dinette-top');
  tableTop.position.set(0.35, F.floorY + 0.675, 0);
  const pedestal = box(0.12, 0.64, 0.12, mats.darkMetal, 'classC/dinette-pedestal');
  pedestal.position.set(0.35, F.floorY + 0.34, 0);
  const tableBase = new THREE.Mesh(assets.geometry('classC/dinette-base', () => lathe({ profile: [[0.02, 0.03], [0.16, 0.03], [0.17, 0.01], [0.0, 0.0]], segments: 12 })), mats.darkMetal);
  tableBase.name = 'classC/dinette-base';
  tableBase.position.set(0.35, F.floorY, 0);
  table.add(tableTop, pedestal, tableBase);
  add('dinetteTable', table);

  const buildBench = (side: 1 | -1): THREE.Group => {
    const bench = new THREE.Group();
    const seat = box(1.1, 0.42, 0.5, mats.wood);
    seat.position.set(0.35, F.floorY + 0.21, side * 0.6);
    const cushion = box(1.05, 0.06, 0.44, mats.accent, 'classC/bench-cushion');
    cushion.position.set(0.35, F.floorY + 0.45, side * 0.6);
    const back = box(1.1, 0.55, 0.08, mats.wood, 'classC/bench-back');
    back.position.set(0.35, F.floorY + 0.66, side * 1.03);
    bench.add(seat, cushion, back);
    return bench;
  };
  add('dinetteBenchL', buildBench(1));
  add('dinetteBenchR', buildBench(-1));

  /* —— `kitchenSink` 水槽（台面开槽内嵌深灰薄盒 + 弯龙头）+ `stove` 灶台（2 炉架+格栅纹）—— */
  const kitchen = new THREE.Group();
  const counterBody = box(1.1, 0.68, 0.32, mats.wood, 'classC/counter-body');
  counterBody.position.set(-0.59, F.floorY + 0.34, -0.82);
  const counterTopPlate = box(1.14, 0.04, 0.36, mats.counterTop, 'classC/counter-top');
  counterTopPlate.position.set(-0.59, F.floorY + 0.70, -0.82);
  const basin = box(0.34, 0.05, 0.26, mats.basin, 'classC/basin');
  basin.position.set(-0.86, F.floorY + 0.725, -0.82);
  const faucet = new THREE.Mesh(
    assets.geometry('classC/faucet', () => tube({
      pointsOrCurve: [
        new THREE.Vector3(-0.86, F.floorY + 0.74, -0.94),
        new THREE.Vector3(-0.86, F.floorY + 0.96, -0.94),
        new THREE.Vector3(-0.86, F.floorY + 1.0, -0.9),
        new THREE.Vector3(-0.86, F.floorY + 0.96, -0.86),
        new THREE.Vector3(-0.86, F.floorY + 0.89, -0.86),
      ],
      radius: 0.014,
      tubularSegments: 16,
    })),
    mats.steel,
  );
  faucet.name = 'classC/faucet';
  kitchen.add(counterBody, counterTopPlate, basin, faucet);
  add('kitchenSink', kitchen);

  const stove = new THREE.Group();
  const burnerGeometry = assets.geometry('classC/burner', () => hardenEdges(new THREE.TorusGeometry(0.09, 0.014, 6, 14).rotateX(Math.PI / 2)));
  const grateGeometry = assets.geometry('classC/grate', () => hardenEdges(new THREE.BoxGeometry(0.16, 0.012, 0.02)));
  for (const z of [-0.74, -0.9]) {
    const burner = new THREE.Mesh(burnerGeometry, mats.darkMetal);
    burner.name = `classC/burner/${z}`;
    burner.position.set(-0.34, F.floorY + 0.735, z);
    stove.add(burner);
    for (const rot of [0, Math.PI / 2]) {
      const grate = new THREE.Mesh(grateGeometry, mats.darkMetal);
      grate.name = `classC/grate/${z}/${rot}`;
      grate.position.set(-0.34, F.floorY + 0.73, z);
      grate.rotation.y = rot;
      stove.add(grate);
    }
  }
  add('stove', stove);

  /* —— `fridge` 冰箱（门缝+长把手，尾左）—— */
  const fridge = new THREE.Group();
  const fridgeBody = box(0.62, 1.05, 0.58, mats.warmWhite, 'classC/fridge-body');
  fridgeBody.position.set(-1.55, F.floorY + 0.525, -0.69);
  const fridgeSeam = box(0.62, 0.014, 0.02, mats.darkMetal, 'classC/fridge-seam');
  fridgeSeam.position.set(-1.55, F.floorY + 0.84, -0.395);
  const fridgeHandle = box(0.03, 0.3, 0.03, mats.steel, 'classC/fridge-handle');
  fridgeHandle.position.set(-1.28, F.floorY + 0.76, -0.385);
  fridge.add(fridgeBody, fridgeSeam, fridgeHandle);
  add('fridge', fridge);

  /* —— `overheadCabinets` 吊柜 ×3 连（厨区上方）—— */
  const cabinets = new THREE.Group();
  const cabinetGeometry = assets.geometry('classC/cabinet', () => hardenEdges(roundedBox({ width: 0.55, height: 0.38, depth: 0.3, radius: 0.02 })));
  for (const x of [-1.55, -0.97, -0.39]) {
    const cabinet = new THREE.Mesh(cabinetGeometry, mats.wood);
    cabinet.name = `classC/cabinet/${x}`;
    cabinet.position.set(x, F.floorY + 1.3, -0.85);
    cabinets.add(cabinet);
    const grip = box(0.16, 0.02, 0.02, mats.darkMetal, 'classC/cabinet-grip');
    grip.position.set(x, F.floorY + 1.13, -0.695);
    cabinets.add(grip);
  }
  add('overheadCabinets', cabinets);

  /* —— `bed` 床铺（床箱+床垫+双枕+双色被，横贯尾部；床垫=glowTag 0.10）—— */
  const bed = new THREE.Group();
  const bedFrame = box(1.15, 0.3, 1.84, mats.wood, 'classC/bed-frame');
  bedFrame.position.set(-2.475, F.floorY + 0.15, 0);
  const mattress = new THREE.Mesh(
    assets.geometry('classC/mattress', () => hardenEdges(roundedBox({ width: 1.1, height: 0.12, depth: 1.78, radius: 0.04 }))),
    mattressMat,
  );
  mattress.name = 'classC/bed-mattress';
  mattress.position.set(-2.475, F.floorY + 0.36, 0);
  bed.add(bedFrame, mattress);
  for (const z of [0.42, -0.42]) {
    const pillow = box(0.3, 0.09, 0.34, mats.pillow, 'classC/bed-pillow');
    pillow.position.set(-2.9, F.floorY + 0.475, z);
    pillow.rotation.y = rng.range(-0.08, 0.08);
    bed.add(pillow);
  }
  const quiltA = box(0.6, 0.07, 1.8, mats.quiltA, 'classC/bed-quilt-a');
  quiltA.position.set(-2.28, F.floorY + 0.455, 0);
  const quiltB = box(0.48, 0.07, 1.82, mats.quiltB, 'classC/bed-quilt-b');
  quiltB.position.set(-2.72, F.floorY + 0.465, 0.04);
  quiltB.rotation.z = rng.range(-0.03, 0.03);
  bed.add(quiltA, quiltB);
  add('bed', bed);

  /* —— `nightLamp` 温暖小夜灯（灯座+乳白球；breath 6s depth 0.18★docs/05 §7.1.4）—— */
  const nightLamp = new THREE.Group();
  const nightstand = box(0.34, 0.5, 0.34, mats.wood, 'classC/nightstand');
  nightstand.position.set(-1.68, F.floorY + 0.25, 0.62);
  const lampBase = new THREE.Mesh(assets.geometry('classC/night-lamp-base', () => lathe({ profile: [[0.02, 0.0], [0.1, 0.0], [0.1, 0.02], [0.05, 0.1], [0.05, 0.12]], segments: 10 })), mats.darkMetal);
  lampBase.name = 'classC/night-lamp-base';
  lampBase.position.set(-1.68, F.floorY + 0.5, 0.62);
  const lampBulb = new THREE.Mesh(assets.geometry('classC/night-lamp-bulb', () => new THREE.SphereGeometry(0.06, 10, 8)), nightLampMat);
  lampBulb.name = 'classC/night-lamp-bulb';
  lampBulb.position.set(-1.68, F.floorY + 0.65, 0.62);
  const nightHalo = makeHaloSprite(assets, 'classC/night-lamp-halo', 0.5, COLORS.warmLight);
  nightHalo.position.copy(lampBulb.position);
  nightLamp.add(nightstand, lampBase, lampBulb, nightHalo);
  add('nightLamp', nightLamp);

  /* —— `slideoutSofa` 拓展舱沙发+靠枕 ×2（滑出舱内；经外板真窗洞透窗可见）—— */
  const sofa = new THREE.Group();
  const sofaSeat = box(1.7, 0.55, 0.8, mats.sofa, 'classC/sofa-seat');
  sofaSeat.position.set(-1.9, F.floorY + 0.275, -1.62);
  const sofaBack = box(1.7, 0.48, 0.14, mats.sofa, 'classC/sofa-back');
  sofaBack.position.set(-1.9, F.floorY + 0.76, -1.95);
  sofa.add(sofaSeat, sofaBack);
  for (const x of [-2.32, -1.48]) {
    const pillow = box(0.34, 0.3, 0.11, mats.pillow, 'classC/sofa-pillow');
    pillow.position.set(x, F.floorY + 0.72, -1.86);
    pillow.rotation.z = rng.range(-0.15, 0.15);
    sofa.add(pillow);
  }
  add('slideoutSofa', sofa);

  /* —— `bookshelf` 书架（双立板+3 层隔板，床尾上方贴右舱壁）+ `books` 书册 booksStack(9)—— */
  const shelf = new THREE.Group();
  const sideGeometry = assets.geometry('classC/shelf-side', () => hardenEdges(roundedBox({ width: 0.03, height: 0.64, depth: 0.3, radius: 0.008 })));
  for (const x of [-1.83, -1.41]) {
    const side = new THREE.Mesh(sideGeometry, mats.shelf);
    side.name = `classC/shelf-side/${x}`;
    side.position.set(x, F.floorY + 0.94, 0.98);
    shelf.add(side);
  }
  const boardGeometry = assets.geometry('classC/shelf-board', () => hardenEdges(roundedBox({ width: 0.42, height: 0.02, depth: 0.3, radius: 0.006 })));
  for (const y of [F.floorY + 0.64, F.floorY + 0.94, F.floorY + 1.24]) {
    const board = new THREE.Mesh(boardGeometry, mats.shelf);
    board.name = `classC/shelf-board/${y}`;
    board.position.set(-1.62, y, 0.98);
    shelf.add(board);
  }
  add('bookshelf', shelf);

  const books = createBooksStack({ count: 9, rng: rng.fork('books'), name: 'classC/books' });
  books.name = 'classC/interior/books';
  books.position.set(-1.62, F.floorY + 0.655, 0.98);
  group.add(books);
  named.books = books;

  /* —— `ceilLamp` 顶灯（吸顶小盘+乳白罩；steady 0.55★）—— */
  const ceilLamp = new THREE.Group();
  const ceilBase = new THREE.Mesh(assets.geometry('classC/ceil-lamp-base', () => lathe({ profile: [[0.02, 0.0], [0.1, 0.0], [0.1, 0.02], [0.09, 0.05], [0.0, 0.05]], segments: 12 })), mats.darkMetal);
  ceilBase.name = 'classC/ceil-lamp-base';
  ceilBase.position.set(-0.6, F.ceilY - 0.02, 0);
  ceilBase.rotation.x = Math.PI;
  const ceilBulb = new THREE.Mesh(assets.geometry('classC/ceil-lamp-bulb', () => new THREE.SphereGeometry(0.075, 10, 8)), ceilLampMat);
  ceilBulb.name = 'classC/ceil-lamp-bulb';
  ceilBulb.position.set(-0.6, F.ceilY - 0.09, 0);
  const ceilHalo = makeHaloSprite(assets, 'classC/ceil-lamp-halo', 0.62, COLORS.ceilLight);
  ceilHalo.position.copy(ceilBulb.position);
  ceilLamp.add(ceilBase, ceilBulb, ceilHalo);
  add('ceilLamp', ceilLamp);

  /* —— 灯点句柄（docs/03 §4.2.1：lamps=nightLamp breath + ceilLamp steady 0.55；halo 随构建刷新）—— */
  refs.lampHandles = [
    { emissiveMat: nightLampMat, halo: nightHalo, mode: 'breath', params: { period: LAMPS.breathPeriod, depth: LAMPS.breathDepth } } satisfies LampHandle,
    { emissiveMat: ceilLampMat, halo: ceilHalo, mode: 'steady', params: {} } satisfies LampHandle,
  ];

  /* —— 车内暖光点光（全局 ≤2 点光预算之「车内暖光」位；强度经 applyInteriorLight 下发）—— */
  const fillLight = new THREE.PointLight(COLORS.fillLight, 0, FILL_LIGHT.distance, FILL_LIGHT.decay);
  fillLight.name = 'classC/fill-light';
  fillLight.position.set(FILL_LIGHT.position[0], FILL_LIGHT.position[1], FILL_LIGHT.position[2]);
  fillLight.castShadow = false;
  group.add(fillLight);
  refs.fillLight = fillLight;

  /* —— 内饰组纪律：不投影不接收阴影（draft §2.2「内饰组默认 noOutline+不接收方向光阴影」）—— */
  group.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.castShadow = false;
      mesh.receiveShadow = false;
    }
  });

  // named 键完整性自检（16 个逐项在场；漏键即刻抛错——TASKS 勾验通路）
  for (const key of NAMED_KEYS) {
    if (!named[key]) throw new Error(`[classC] named 键缺失：${key}`);
  }
  return { group, named };
}

/* ============================== ④ interiorLightHooks（D2 唯一驱动链；docs/03 §4.2.1 钩子模板） ============================== */

/**
 * 可透视窗透明度目标（clear 0.24 / tinted 0.40 → 夜间随 interiorPower 插值降至 0.22，docs/04 §5.5）。
 * 经工厂同名缓存键取用——与 buildExterior 内玻璃材质为同一实例（改一处全场生效）。
 */
const windowGlassTargets: readonly { readonly material: THREE.MeshToonMaterial; readonly base: number }[] = [
  { material: toonMaterials.getToon('glass', { color: '#bcd8e8', opacity: GLASS_OPACITY.clear, name: 'classC/glass-clear' }), base: GLASS_OPACITY.clear },
  { material: toonMaterials.getToon('glass', { color: '#9fc4d8', opacity: GLASS_OPACITY.tinted, name: 'classC/glass-tinted' }), base: GLASS_OPACITY.tinted },
];

/** 帐帘带材质单例（与 buildExterior 同缓存键=同一实例；透光 emissiveIntensity 经钩子写入）。 */
const bandMatRef = toonMaterials.getToon('cloth', {
  color: COLORS.band, opacity: BAND_CLOTH.opacity, emissive: COLORS.fillLight, emissiveIntensity: 0,
  outline: false, name: 'classC/band',
});

const interiorLightHooks: InteriorLightHooks = {
  get lamps(): readonly LampHandle[] {
    // 每次构建由 buildInterior 重写（halo 精灵/句柄随构建刷新；材质单例重写 authored 基值，裁定④）
    return refs.lampHandles;
  },
  applyInteriorLight(power: number, emphasis: number, blend: number): void {
    const p = clamp(power, 0, 1);
    const b = clamp(blend, 0, 1);
    // ① 车窗透明度随 interiorPower 向 0.22 插值（docs/03 §4.2.0 玻璃三档行；车内暖光透出增强冷暖对比）
    for (const target of windowGlassTargets) {
      target.material.opacity = target.base + (GLASS_NIGHT_OPACITY - target.base) * p;
    }
    // ② glowTags：床垫 0.10 / innerShell 0.12（docs/03 §4.2.1 定值）
    mattressMat.emissiveIntensity = GLOW.mattress * p;
    innerShellMat.emissiveIntensity = GLOW.innerShell * p;
    // ③ 帐帘带透光 0.55×power（draft §2.3「帘不掀开也能读到室内温暖」；WindSystem 注册期克隆材质——双写同步）
    const bandGlow = GLOW.band * p;
    bandMatRef.emissiveIntensity = bandGlow;
    const liveBand = refs.bandMesh?.material;
    if (liveBand instanceof THREE.MeshToonMaterial && liveBand !== bandMatRef) {
      liveBand.emissiveIntensity = bandGlow;
    }
    // ④ 屏幕自发光标量（draft §2.4：color 0.30+0.70×power；黄昏档 interiorPower≈0.85 时接近全亮）
    for (const screen of refs.screens) {
      screen.color.setScalar(0.3 + 0.7 * p);
    }
    // ⑤ 车内暖光点光：1.15×power×emphasis（docs/03 §4.2.0 模板逐字；blend 平滑，激活/完成时 blend=1）
    const target = FILL_LIGHT.gain * p * clamp(emphasis, 0, 2);
    refs.fillLight.intensity = THREE.MathUtils.lerp(refs.fillLight.intensity, target, b);
  },
};

/* ============================== 模块装配（§3.3.3 注册行见 registry.ts；label「C型房车」） ============================== */

export const classC: VehicleModule = {
  id: 'classC',
  label: 'C型房车',
  isDefault: true,
  buildExterior,
  buildDeployment,
  buildInterior,
  interiorLightHooks,
};
