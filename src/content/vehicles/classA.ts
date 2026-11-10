// docs/01-整体架构.md §3.2 content/vehicles/classA.ts —— 3.2 A型大巴式房车（17 named/环形沙发/中岛/卫浴）。
// docs/03-车型模块.md §4.2.0 共通约定（对位/四大手法/三件套/玻璃三档/内饰灯光钩子模板/布料天气挂点/
//   vehicleKit 部件库）+ §4.2.2 车型二 A 型全文；细部几何配方与 named 键表取 docs/drafts/12-车型模块.md
//   §4.1–§4.5（【3.2-1…13】逐条落点）；docs/05 §7.1.4 灯点定值（interior 各车型行）；
//   docs/04 §5.5（paintCar/glass 差异强制点：A 银白+藏青裙+金线，渲染层零车型分支）。
//
// ★ 实现期裁定（如实登记）：
//   ① ★半径仲裁（docs/03 §4.2.2 逐字）：车长 9.0→7.9（footprint 7.9×2.7，外接半径 ≈4.175 ≤4.2；
//     原 9.0×2.7 外接半径 ≈4.70 超场景章营位半径上限）。车身高度轮廓（0.55→3.05）与侧窗带 y
//     （1.75→2.55 draft 值，取 1.72..2.52）不随长度缩水——纵向坐标按 7.9/9.0 重排，横向/纵向轮廓保留。
//   ② draft §4.3 表坐标与 7.9 车长存在重叠矛盾（bedDouble x −3.2±0.95 与 bathPod 右后角 x −2.2..−3.2
//     相交、cabinetTower 叠柜与 partitionWall 同位）。取连贯框架：地板 y=0.60（内高 ≈2.37 vs C 型 1.9，
//     【3.2-13】进深读法；innerShell 高 2.42——底缘 0.55 低于地板防遮挡、顶缘 2.97 贴顶）、
//     卧室隔断 x −2.0（门洞留左 1/3）、床区 x −3.68..−2.10（z 偏左）、卫浴角舱 x −3.70..−2.95
//     （z 右侧），互不重叠且全部收在内衬壳内；框架性偏差不逐条登记（见 openIssues）。
//   ③ draft §4.4 bedLamp「周期 5s」不属 RhythmClock.BREATH_PERIODS 三档（1.5/3/6，§7.1.1）——
//     按 docs/05 §7.1.4「各车型行」口径注册 breath 6s depth 0.18（LightBreath 对 5s 亦会收敛到 6s 并告警，
//     直接注册 6s 保持 console 干净）。
//   ④ lightStrip 1.8 长灯带需连续柜底——cabinetTower 取「三段叠各宽 1.5」壁挂连排（x −1.95..−0.45，
//     底缘 y 1.55），灯带单条贯通柜底，兼读「通顶吊柜（三段叠）」。
//   ⑤ 外部雷达罩/格栅等未列小件（前大灯/门把手/金腰线实体饰条/接驳口）为外部要素行数 ≥22 的补齐项，
//     与 §4.2.2 外部清单无冲突。
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
  createAwningAssembly,
  createBikeFolding,
  createGaugeCluster,
  createWheelGeometries,
} from '@/geom/parts/vehicleKit';
import { clamp } from '@/shared/math';

/* ============================== 定值（docs/03 §4.2.2 + draft 12 §4.1–§4.5） ============================== */

/** A 型通道色板（【3.2-13】暖木胡桃 #7a5236 + 米色皮革 #f2e4c8 + 黄铜 #c9a227；车身银白 #e8ecf0 +
 *  藏青裙 #24344d + 金腰线 #c9a227）。 */
const COLORS = {
  body: '#e8ecf0',
  skirt: '#24344d',
  gold: '#c9a227',
  walnut: '#7a5236',
  walnutLight: '#8a6a4a',
  leather: '#f2e4c8',
  leatherAlt: '#e7d5b4',
  stone: '#e8e4da',
  innerShell: '#e6d3b0',
  stripLight: '#ffc27d',
  bedLight: '#ffd9a0',
  bathLight: '#cfe6ee',
  fillLight: '#ffbf7d',
  tailLamp: '#ff5a4d',
  markerLamp: '#ffb84d',
  headLamp: '#ffe9c0',
  chassis: '#3a3d42',
  tire: '#2b2b30',
  hub: '#c8ccd2',
  awning: '#24344d',
  awningStripe: '#f6f1e4',
} satisfies Record<string, RGB>;

/** 几何框架（车体接地：轮胎外缘最低点=局部 y0；docs/03 §4.2.0「+X=车头、+Y=上、+Z=左」）。 */
const F = {
  bodyX0: -3.95, bodyX1: 3.95, bodyY0: 0.55, bodyY1: 3.05, halfW: 1.22,
  skirtTop: 1.15, // 藏青裙上缘（金线 1.15..1.21）
  winX0: -3.2, winX1: 2.3, winY0: 1.72, winY1: 2.52, // 贯通侧窗带（真开洞）
  fasciaX: 3.98, fasciaTop: 2.42, // 前脸面板（厚 0.07，x 3.945..4.015）
  wsY0: 1.5, wsY1: 2.42, wsHalfW: 0.44, wsGap: 0.04, // 双片前挡洞（z ±(gap/2..gap/2+halfW)）
  acX: 2.35, acY: 3.16, acSize: { w: 1.15, h: 0.22, d: 0.9 } as const,
  dishX: -3.35, dishZ: 0.55, dishR: 0.34, dishElev: (35 * Math.PI) / 180,
  bayY: 0.85, bayW: 0.95, bayH: 0.55, bayXs: [-3.0, -1.9, -0.8, 0.3], // 侧裙储物舱门 ×4（右壁）
  doorX0: 2.35, doorX1: 2.95, doorY0: 0.9, doorY1: 1.72, // 右前车门（窗带以下）
  awnX: -0.5, awnY: 2.42, awnW: 4.2, awnD: 1.9, // 侧遮阳棚（左壁 +Z，棚根布面高 2.42）
  stepX: 2.65, stepY: 0.42, stepD: 0.38, // 电动踏步（右前门下，双级外伸）
  rackX: -4.28, rackY: 0.82, // 车尾自行车架+折叠自行车
  wheelR: 0.46, wheelW: 0.28, wheelZ: 1.22, wheelInnerZ: 0.84, axleF: 2.6, axleR: -2.0,
  floorY: 0.6, ceilY: 3.0, // 内高 2.4（【3.2-13】vs C 型 1.9）
} as const;

/** 布料定值（docs/03 §4.2.2：遮阳棚布 stiffness 0.4 / windFactor 1.0；docs/05 五-3 A·B 棚 sagAmp 0.05）。 */
const AWN_CLOTH = { stiffness: 0.4, windFactor: 1.0, sagAmp: 0.05 } as const;
/** glowTags（对齐 §4.2.0 模板：床垫 0.10 / innerShell 0.12——A 型帘布透光由棚布承担，车外不 glow）。 */
const GLOW = { mattress: 0.1, innerShell: 0.12 } as const;

/** tinted 玻璃材质模块级引用（同缓存键 'classA/glass-tinted' = buildExterior 前挡同一实例；
 *  内饰烤箱视窗/淋浴隔断复用，applyInteriorLight 一次写全场生效）。 */
const glassTintedRef = toonMaterials.getToon('glass', { color: '#9fc4d8', opacity: GLASS_OPACITY.tinted, name: 'classA/glass-tinted' });
/** 灯点（docs/03 §4.2.2：lightStrip steady 1.0 + bedLamp breath 0.5 + 卫浴冷光 steady 0.25；
 *  authored 基值 ≥1（R-P3-1 注③ 纪律）；bedLamp 周期 6s 裁定③）。 */
const LAMPS = { stripGain: 1.0, bedGain: 0.5, bathGain: 0.25, breathPeriod: 6, breathDepth: 0.18, authored: 1.4, bathAuthored: 1.2 } as const;

/** 车内暖光点光（docs/03 §4.2.0 模板：强度 1.15×power×emphasis；draft §4.4 位 (0,2.1,0) distance 7）。 */
const FILL_LIGHT = { position: [0, 2.1, 0], color: COLORS.fillLight, distance: 7.0, decay: 1.8, gain: 1.15 } as const;

/** footprint（docs/03 §4.2.2 ★半径仲裁回调：7.9×2.7 外接半径 hypot(3.95,1.35)≈4.175 ≤4.2）。
 *  布局约束系统（本轮）：length/width 同源引用 content/layout/vehicles.ts（车身字面量唯一来源）。 */
const FOOTPRINT = { length: VEHICLE_BODIES.classA.length, width: VEHICLE_BODIES.classA.width, track: F.wheelZ * 2, height: 3.7 } as const;

/** PaintSpec 色带（v 区间按车身 y0.55..3.05 换算：(y−0.55)/2.5；藏青裙 0..0.24 + 金线 0.24..0.264）。 */
const STRIPE_SPEC: readonly PaintStripe[] = [
  { color: COLORS.skirt, from: 0, to: 0.24 },
  { color: COLORS.gold, from: 0.24, to: 0.264 },
];

/** 17 个 named 键（docs/03 §4.2.2「透视内饰（3.2-7…12，17 个 named）」；draft §4.3 键表逐字）。 */
const NAMED_KEYS = [
  'ringSofa', 'islandCounter', 'fridgeDouble', 'islandSink', 'stoveEmbedded', 'oven',
  'cabinetTower', 'lightStrip', 'woodFloor', 'partitionWall', 'bedDouble', 'bedLamp',
  'bathPod', 'basin', 'mirror', 'showerGlass', 'showerHead',
] as const;

/* ============================== 跨构建共享态（同一模块闭包，同 classC refsRef 模式） ============================== */

interface ClassARefs {
  awningGroup: THREE.Group | null;
  stepGroup: THREE.Group | null;
  lampHandles: LampHandle[];
  fillLight: THREE.PointLight;
  screens: THREE.MeshBasicMaterial[];
}

const refs: ClassARefs = {
  awningGroup: null,
  stepGroup: null,
  lampHandles: [],
  fillLight: new THREE.PointLight(COLORS.fillLight, 0, FILL_LIGHT.distance, FILL_LIGHT.decay),
  screens: [],
};

/* ============================== 小工具（Canvas 贴图 / 圆角轮廓 / halo / 雪壳） ============================== */

type CanvasDraw = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

/** Canvas 程序化贴图（docs/04 §5.4；经 ctx.assets.texture 缓存与引用计数；同 classC 模式）。 */
function paintCanvasTexture(key: string, w: number, h: number, draw: CanvasDraw, transparent = false): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(2, w);
  canvas.height = Math.max(2, h);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error(`[classA] 无法获取 2d 上下文 ${key}`);
  try {
    draw(ctx, canvas.width, canvas.height);
  } catch (err) {
    console.warn(`[classA] 贴图绘制失败，降级留白 ${key}`, err);
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
    if (!p) throw new Error('[classA] 轮廓点越界');
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

/** additive 光晕精灵（docs/05 §4.3.3-⑧ 基值口径，同 classC makeHaloSprite）。 */
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

/** 雪壳材质（同 classC makeSnowShellMaterial；WeatherMaterialSystem 注册期 patchShellExtrude 接管）。 */
function makeSnowShellMaterial(name: string): THREE.Material {
  return toonMaterials.get('matteProp', { color: '#edf2f9', snow: 'off', opacity: 0.999, name });
}

/* ============================== 程序化贴图（texBodyA / texWoodFloor-walnut / texDash-cool） ============================== */

/**
 * texBodyA（docs/03 §4.2.2「银白+藏青裙+金线」；draft §2.6 程序化贴图）：
 * 银白底 + 藏青裙带（v 0..0.24，canvas 底部行）+ 金腰线（v 0.24..0.264）+ 门缝 + 铆钉行 + 面板细线。
 * v 按 (y−0.55)/2.5 对位，canvas 行=(1−v)×h。
 */
function drawBodyA(ctx: CanvasRenderingContext2D, w: number, h: number, doorSeams: readonly number[]): void {
  ctx.fillStyle = COLORS.body;
  ctx.fillRect(0, 0, w, h);
  // 藏青裙（v 0..0.24 → 行 0.76h..h）
  const skirtTop = (1 - 0.24) * h;
  ctx.fillStyle = COLORS.skirt;
  ctx.fillRect(0, skirtTop, w, h - skirtTop);
  // 金腰线（v 0.24..0.264 → 行 0.736h..0.76h）
  const goldTop = (1 - 0.264) * h;
  ctx.fillStyle = COLORS.gold;
  ctx.fillRect(0, goldTop, w, skirtTop - goldTop);
  // 面板细线（窗带下方 y 1.35 → v 0.32 → 行 0.68h；轻微压痕）
  ctx.fillStyle = 'rgba(0,0,0,0.07)';
  ctx.fillRect(0, 0.68 * h, w, 1.5);
  ctx.fillRect(0, 0.40 * h, w, 1.5);
  // 门缝（u 传入；右侧前门两竖缝）
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  for (const seam of doorSeams) ctx.fillRect(seam * w, goldTop - h * 0.16, Math.max(2, w * 0.005), h * 0.60);
  // 铆钉行（裙线上缘一排）
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  for (let i = 0; i < 32; i++) {
    ctx.beginPath();
    ctx.arc((w * (i + 0.5)) / 32, goldTop - h * 0.012, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** texWoodFloor walnut（draft §2.6 参数化：条纹+年轮弧+板缝；胡桃深木变体）。 */
function drawWoodFloorWalnut(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = COLORS.walnut;
  ctx.fillRect(0, 0, w, h);
  const rows = 8;
  for (let r = 0; r < rows; r++) {
    const y = (h * r) / rows;
    ctx.fillStyle = r % 2 === 0 ? 'rgba(255,240,210,0.09)' : 'rgba(30,16,8,0.16)';
    ctx.fillRect(0, y, w, h / rows);
    ctx.strokeStyle = 'rgba(24,12,6,0.4)';
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

/** texDash cool（draft §2.6：深灰面板+发光刻度弧+指针，冷青变体——仪表组 'cool'）。 */
function drawDashCool(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = '#1f242a';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#6fd8e0';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(w * 0.3, h * 0.62, h * 0.4, Math.PI * 0.85, Math.PI * 1.95);
  ctx.stroke();
  ctx.strokeStyle = '#d8e6ea';
  ctx.lineWidth = 2;
  for (let i = 0; i < 9; i++) {
    const a = Math.PI * (0.85 + (1.1 * i) / 8);
    ctx.beginPath();
    ctx.moveTo(w * 0.3 + Math.cos(a) * h * 0.33, h * 0.62 - Math.sin(a) * h * 0.33);
    ctx.lineTo(w * 0.3 + Math.cos(a) * h * 0.42, h * 0.62 - Math.sin(a) * h * 0.42);
    ctx.stroke();
  }
  ctx.strokeStyle = '#9fe8f0';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(w * 0.3, h * 0.62);
  ctx.lineTo(w * 0.3 + Math.cos(Math.PI * 1.5) * h * 0.34, h * 0.62 - Math.sin(Math.PI * 1.5) * h * 0.34);
  ctx.stroke();
  ctx.fillStyle = COLORS.skirt;
  ctx.fillRect(w * 0.62, h * 0.28, w * 0.3, h * 0.44);
}

/* ============================== ① buildExterior（docs/03 §4.2.2 外部清单 3.2-1…6） ============================== */

function buildExterior(ctx: VehicleBuildContext): VehicleExterior {
  const { assets } = ctx;
  const group = new THREE.Group();
  group.name = 'classA/exterior';
  refs.awningGroup = null;
  refs.stepGroup = null;

  /* —— 材质（工厂唯一着色路径；描边：车身/裙带开描边，格栅条/舱门/小件关——draft §4.1 描边行）—— */
  const bodyTexture = assets.texture('classA/tex/body', () =>
    paintCanvasTexture('classA/tex/body', 512, 256, (c, w, h) => drawBodyA(c, w, h, [
      (F.doorX0 - F.bodyX0) / (F.bodyX1 - F.bodyX0),
      (F.doorX1 - F.bodyX0) / (F.bodyX1 - F.bodyX0),
    ])),
  );
  bodyTexture.repeat.set(1 / (F.bodyX1 - F.bodyX0), 1 / (F.bodyY1 - F.bodyY0));
  bodyTexture.offset.set(-F.bodyX0 / (F.bodyX1 - F.bodyX0), -F.bodyY0 / (F.bodyY1 - F.bodyY0));

  const bodySideMat = toonMaterials.get('paintCar', { color: COLORS.body, map: bodyTexture, name: 'classA/body-side' });
  const bodyPlainMat = toonMaterials.get('paintCar', { color: COLORS.body, name: 'classA/body-plain' });
  const skirtMat = toonMaterials.get('paintCar', { color: COLORS.skirt, name: 'classA/skirt' });
  const goldMat = toonMaterials.get('paintTrim', { color: COLORS.gold, name: 'classA/gold-trim' });
  const acFrontMat = toonMaterials.get('paintCar', { color: '#dfe3e6', name: 'classA/ac-front' });
  const acRearMat = toonMaterials.get('paintCar', { color: '#dfe3e6', name: 'classA/ac-rear' });
  const acGrilleMat = toonMaterials.get('metal', { color: '#9aa0a6', outline: false, name: 'classA/ac-grille' });
  const dishMat = toonMaterials.get('paintCar', { color: '#d4d8dc', outline: false, name: 'classA/dish' });
  const chassisMat = toonMaterials.get('concrete', { color: COLORS.chassis, name: 'classA/chassis' });
  const tireMat = toonMaterials.get('matteProp', { color: COLORS.tire, name: 'classA/tire' });
  const hubMat = toonMaterials.get('metal', { color: COLORS.hub, name: 'classA/hub' });
  const fenderMat = toonMaterials.get('paintCar', { color: COLORS.skirt, name: 'classA/fender' });
  const detailMat = toonMaterials.get('matteProp', { color: '#d8d2c4', outline: false, name: 'classA/detail' });
  const darkDetailMat = toonMaterials.get('matteProp', { color: '#4a4d52', outline: false, name: 'classA/detail-dark' });
  const tailLampMat = toonMaterials.getToon('matteProp', { color: '#5a1f1a', emissive: COLORS.tailLamp, emissiveIntensity: 0.9, name: 'classA/tail-lamp' });
  const markerLampMat = toonMaterials.getToon('matteProp', { color: '#6a4a20', emissive: COLORS.markerLamp, emissiveIntensity: 0.8, name: 'classA/marker-lamp' });
  const headLampMat = toonMaterials.getToon('matteProp', { color: '#c8bda0', emissive: COLORS.headLamp, emissiveIntensity: 0.5, name: 'classA/head-lamp' });
  const rackMat = toonMaterials.get('metal', { color: '#4a4d52', name: 'classA/rack' });
  const exhaustMat = toonMaterials.get('metal', { color: '#8a8f96', outline: false, name: 'classA/exhaust' });
  const glassClearMat = toonMaterials.get('glass', { color: '#bcd8e8', opacity: GLASS_OPACITY.clear, name: 'classA/glass-clear' });
  glassClearMat.side = THREE.DoubleSide; // 三件套：玻璃 DoubleSide（docs/03 §4.2.0；唯一 name 缓存键内改）
  const glassTintedMat = toonMaterials.get('glass', { color: '#9fc4d8', opacity: GLASS_OPACITY.tinted, name: 'classA/glass-tinted' });
  glassTintedMat.side = THREE.DoubleSide;

  /* —— 大巴主车身：侧影 profileExtrude，前上角大圆角 r0.75 模拟前脸弧 + 贯通侧窗带真开洞
  /*   （建模字典②；texBodyA 贴两侧围 cap——【3.2-1】【3.2-2】）—— */
  const bodyShape = new THREE.Shape();
  roundedPolygon(bodyShape, [
    [F.bodyX0, F.bodyY0], [F.bodyX1, F.bodyY0], [F.bodyX1, F.bodyY1], [F.bodyX0, F.bodyY1],
  ], [0.05, 0.08, 0.75, 0.2]); // 前上角（index 2）大圆角 r0.75
  bodyShape.holes.push(roundedRectPath(F.winX0, F.winY0, F.winX1, F.winY1, 0.16)); // 贯通侧窗带一整条
  const bodyMesh = new THREE.Mesh(
    assets.geometry('classA/body-profile', () => {
      const geometry = new THREE.ExtrudeGeometry(bodyShape, { depth: F.halfW * 2, bevelEnabled: false, curveSegments: 10, steps: 1 });
      geometry.translate(0, 0, -F.halfW);
      geometry.computeVertexNormals();
      return geometry;
    }),
    [bodySideMat, bodyPlainMat], // 组 0=两侧围 cap（贴 texBodyA），组 1=顶/底/前后沿（素色）
  );
  bodyMesh.name = 'classA/body';
  bodyMesh.castShadow = true;
  group.add(bodyMesh);

  /* —— 前脸面板（正影挤出厚 0.07，双片前挡洞）+ 洞缘亮条（金）—— */
  const fasciaShape = new THREE.Shape();
  roundedPolygon(fasciaShape, [
    [-F.halfW, F.bodyY0], [F.halfW, F.bodyY0], [F.halfW, F.fasciaTop], [-F.halfW, F.fasciaTop],
  ], [0.04, 0.04, 0.14, 0.14]);
  const wsYc = (F.wsY0 + F.wsY1) / 2;
  fasciaShape.holes.push(roundedRectPath(-(F.wsGap / 2 + F.wsHalfW), F.wsY0, -F.wsGap / 2, F.wsY1, 0.12));
  fasciaShape.holes.push(roundedRectPath(F.wsGap / 2, F.wsY0, F.wsGap / 2 + F.wsHalfW, F.wsY1, 0.12));
  const fasciaMesh = new THREE.Mesh(
    assets.geometry('classA/fascia', () => {
      const geometry = new THREE.ExtrudeGeometry(fasciaShape, { depth: 0.07, bevelEnabled: false, curveSegments: 8, steps: 1 });
      geometry.rotateY(Math.PI / 2); // (u,v,t)→(t,v,−u)：厚 0.07 沿 X、宽 2.44
      geometry.translate(F.fasciaX, 0, 0);
      geometry.computeVertexNormals();
      return geometry;
    }),
    bodyPlainMat,
  );
  fasciaMesh.name = 'classA/fascia';
  fasciaMesh.castShadow = true;
  group.add(fasciaMesh);
  // 前挡中柱亮条 + 洞缘上下亮条（金——「洞缘亮条」draft §4.1）
  const divider = new THREE.Mesh(assets.geometry('classA/ws-divider', () => hardenEdges(roundedBox({ width: 0.05, height: F.wsY1 - F.wsY0, depth: 0.07, radius: 0.01 }))), goldMat);
  divider.name = 'classA/ws-divider';
  divider.position.set(F.fasciaX + 0.005, wsYc, 0);
  group.add(divider);
  const wsTrimGeo = assets.geometry('classA/ws-trim', () => hardenEdges(roundedBox({ width: 0.04, height: 0.05, depth: F.wsHalfW * 2 + F.wsGap + 0.1, radius: 0.01 })));
  for (const [tag, y] of [['bottom', F.wsY0 - 0.02], ['top', F.wsY1 + 0.02]] as const) {
    const trim = new THREE.Mesh(wsTrimGeo, goldMat);
    trim.name = `classA/ws-trim-${tag}`;
    trim.position.set(F.fasciaX + 0.005, y, 0);
    group.add(trim);
  }
  // 前脸/尾部藏青裙板 + 金线（挤出体前后沿为素色组——裙色由实体板补齐，读法与 texBodyA 侧围一致）
  const frontSkirt = new THREE.Mesh(assets.geometry('classA/skirt-front', () => hardenEdges(roundedBox({ width: 0.03, height: 0.6, depth: 2.4, radius: 0.01 }))), skirtMat);
  frontSkirt.name = 'classA/skirt-front';
  frontSkirt.position.set(F.fasciaX + 0.05, 0.85, 0);
  group.add(frontSkirt);
  const frontGold = new THREE.Mesh(assets.geometry('classA/gold-front', () => hardenEdges(roundedBox({ width: 0.025, height: 0.04, depth: 2.4, radius: 0.01 }))), goldMat);
  frontGold.name = 'classA/gold-front';
  frontGold.position.set(F.fasciaX + 0.055, 1.185, 0);
  group.add(frontGold);
  const rearSkirt = new THREE.Mesh(assets.geometry('classA/skirt-rear', () => hardenEdges(roundedBox({ width: 0.03, height: 0.6, depth: 2.4, radius: 0.01 }))), skirtMat);
  rearSkirt.name = 'classA/skirt-rear';
  rearSkirt.position.set(F.bodyX0 - 0.03, 0.85, 0);
  group.add(rearSkirt);
  const rearGold = new THREE.Mesh(assets.geometry('classA/gold-rear', () => hardenEdges(roundedBox({ width: 0.025, height: 0.04, depth: 2.4, radius: 0.01 }))), goldMat);
  rearGold.name = 'classA/gold-rear';
  rearGold.position.set(F.bodyX0 - 0.035, 1.185, 0);
  group.add(rearGold);

  /* —— 前挡弧玻璃 ×2（Cylinder 开口弧段 r2.2 θ0.30 仰 8°，glassMat/tinted，双片拼角窗）—— */
  const windshieldGeometry = assets.geometry('classA/windshield', () => {
    const geometry = new THREE.CylinderGeometry(2.2, 2.2, 0.95, 24, 1, true, Math.PI / 2 - 0.15, 0.30);
    geometry.rotateZ(0.14); // 仰 8°：顶缘后倾
    geometry.computeVertexNormals();
    const center = new THREE.Box3().setFromBufferAttribute(geometry.getAttribute('position') as THREE.BufferAttribute).getCenter(new THREE.Vector3());
    geometry.translate(-center.x, -center.y, -center.z);
    return geometry;
  });
  const windows: WindowSpec[] = [];
  for (const [tag, z] of [['front-l', F.wsGap / 2 + F.wsHalfW / 2], ['front-r', -(F.wsGap / 2 + F.wsHalfW / 2)]] as const) {
    const pane = new THREE.Mesh(windshieldGeometry, glassTintedMat);
    pane.name = `classA/windshield-${tag}`;
    pane.position.set(F.fasciaX + 0.02, wsYc, z);
    pane.renderOrder = 20;
    pane.userData.noOutline = true;
    group.add(pane);
    windows.push({ mesh: pane, tint: 'tinted', label: tag });
  }

  /* —— 贯通侧窗玻璃 ×2 clear（全车最大透视面【3.2-2】；洞形 ShapeGeometry 外偏 0.012）—— */
  const paneGeometry = (x0: number, y0: number, x1: number, y1: number, r: number, id: string): THREE.BufferGeometry =>
    assets.geometry(id, () => {
      const shape = new THREE.Shape();
      roundedPolygon(shape, [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], [r, r, r, r]);
      return new THREE.ShapeGeometry(shape, 6);
    });
  const addSidePane = (z: number, id: string, label: string): void => {
    const pane = new THREE.Mesh(paneGeometry(F.winX0, F.winY0, F.winX1, F.winY1, 0.16, 'classA/glass-band'), glassClearMat);
    pane.name = id;
    pane.position.z = z;
    pane.renderOrder = 20;
    pane.userData.noOutline = true;
    group.add(pane);
    windows.push({ mesh: pane, tint: 'clear', label });
  };
  addSidePane(F.halfW + 0.012, 'classA/glass-band-l', 'side-l');
  addSidePane(-(F.halfW + 0.012), 'classA/glass-band-r', 'side-r');

  /* —— 右前车门（窗带以下门板缝+竖扶手 ×2）—— */
  const doorPanel = new THREE.Mesh(
    assets.geometry('classA/door-panel', () => hardenEdges(roundedBox({ width: F.doorX1 - F.doorX0 - 0.06, height: F.doorY1 - F.doorY0, depth: 0.03, radius: 0.015 }))),
    skirtMat,
  );
  doorPanel.name = 'classA/door-panel';
  doorPanel.position.set((F.doorX0 + F.doorX1) / 2, (F.doorY0 + F.doorY1) / 2, -(F.halfW + 0.018));
  group.add(doorPanel);
  const grabGeometry = assets.geometry('classA/door-grab', () => hardenEdges(new THREE.CylinderGeometry(0.018, 0.018, 0.5, 8)));
  for (const x of [F.doorX0 + 0.12, F.doorX1 - 0.12]) {
    const grab = new THREE.Mesh(grabGeometry, detailMat);
    grab.name = `classA/door-grab/${x}`;
    grab.position.set(x, 1.28, -(F.halfW + 0.045));
    group.add(grab);
  }

  /* —— 车顶空调外机 ×2（roundedBox+格栅条实例化 ×6/台——【3.2-3】）—— */
  const acGeometry = assets.geometry('classA/ac-body', () => hardenEdges(roundedBox({ width: F.acSize.w, height: F.acSize.h, depth: F.acSize.d, radius: 0.03 })));
  const acFront = new THREE.Mesh(acGeometry, acFrontMat);
  acFront.name = 'classA/ac-front';
  acFront.position.set(F.acX, F.acY, 0);
  acFront.castShadow = true;
  group.add(acFront);
  const acRear = new THREE.Mesh(acGeometry, acRearMat);
  acRear.name = 'classA/ac-rear';
  acRear.position.set(-F.acX, F.acY, 0);
  acRear.castShadow = true;
  group.add(acRear);
  const grilleGeometry = assets.geometry('classA/ac-grille-slat', () => hardenEdges(roundedBox({ width: 1.02, height: 0.014, depth: 0.07, radius: 0.005 })));
  const grilles = new InstancedGroup(grilleGeometry, acGrilleMat, { capacity: 12, withShell: { width: 0.015 }, name: 'classA/ac-grille' });
  const grilleMatrix = new THREE.Matrix4();
  for (const unitX of [F.acX, -F.acX]) {
    for (let i = 0; i < 6; i++) {
      grilleMatrix.identity().setPosition(unitX, F.acY + F.acSize.h / 2 + 0.008, -0.3 + i * 0.12);
      grilles.add(grilleMatrix, '#9aa0a6');
    }
  }
  group.add(grilles.group);

  /* —— 卫星锅（Lathe 抛物面 r0.34 仰 35° + 馈源杆 + 立柱——【3.2-3】）—— */
  const dishPost = new THREE.Mesh(
    assets.geometry('classA/dish-post', () => hardenEdges(new THREE.CylinderGeometry(0.028, 0.036, 0.32, 8))),
    darkDetailMat,
  );
  dishPost.name = 'classA/dish-post';
  dishPost.position.set(F.dishX, F.bodyY1 + 0.16, F.dishZ);
  group.add(dishPost);
  const dishGeometry = assets.geometry('classA/dish', () =>
    lathe({ profile: [[0.03, 0], [0.1, 0.014], [0.18, 0.05], [0.26, 0.11], [F.dishR, 0.19]], segments: 14 }));
  const dish = new THREE.Mesh(dishGeometry, dishMat);
  dish.name = 'classA/dish';
  dish.rotation.z = Math.PI / 2 - F.dishElev; // 锅口仰 35°（开口自 +Y 转向天顶偏车尾）
  dish.position.set(F.dishX - 0.02, F.bodyY1 + 0.38, F.dishZ);
  dish.castShadow = true;
  group.add(dish);
  const feedArm = new THREE.Mesh(
    assets.geometry('classA/dish-feed', () => hardenEdges(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 6))),
    darkDetailMat,
  );
  feedArm.name = 'classA/dish-feed';
  feedArm.rotation.z = Math.PI / 2 - F.dishElev;
  feedArm.position.set(F.dishX - 0.12, F.bodyY1 + 0.47, F.dishZ);
  group.add(feedArm);
  const feedHorn = new THREE.Mesh(assets.geometry('classA/dish-horn', () => new THREE.SphereGeometry(0.028, 8, 6)), darkDetailMat);
  feedHorn.name = 'classA/dish-horn';
  feedHorn.position.set(F.dishX - 0.19, F.bodyY1 + 0.52, F.dishZ);
  group.add(feedHorn);

  /* —— 侧裙储物舱门 ×4（inset 圆角面板+缝线槽+小拉手，右壁一排——【3.2-4】）—— */
  const bayGeometry = assets.geometry('classA/bay-door', () => hardenEdges(roundedBox({ width: F.bayW, height: F.bayH, depth: 0.03, radius: 0.02 })));
  const bayHandleGeometry = assets.geometry('classA/bay-handle', () => hardenEdges(roundedBox({ width: 0.16, height: 0.025, depth: 0.02, radius: 0.008 })));
  for (const x of F.bayXs) {
    const bay = new THREE.Mesh(bayGeometry, skirtMat);
    bay.name = `classA/bay-door/${x}`;
    bay.position.set(x, F.bayY, -(F.halfW + 0.015));
    bay.castShadow = true;
    group.add(bay);
    const handle = new THREE.Mesh(bayHandleGeometry, detailMat);
    handle.name = `classA/bay-handle/${x}`;
    handle.position.set(x + F.bayW / 2 - 0.14, F.bayY + F.bayH / 2 - 0.09, -(F.halfW + 0.038));
    group.add(handle);
  }

  /* —— 侧遮阳棚 awningAssembly(4.2,1.9)（左壁 +Z 展开，ClothHandle+clothTop——【3.2-5】）—— */
  const awning = createAwningAssembly({
    assets,
    id: 'classA/awning',
    width: F.awnW,
    drop: F.awnD,
    color: COLORS.awning,
    stripeColor: COLORS.awningStripe,
    stiffness: AWN_CLOTH.stiffness,
    windFactor: AWN_CLOTH.windFactor,
    sagAmp: AWN_CLOTH.sagAmp,
    armColor: '#4a4d52',
  });
  awning.group.name = 'classA/awning';
  awning.group.position.set(F.awnX, F.awnY, F.halfW); // 左壁 +Z：外伸沿 +Z 直用
  group.add(awning.group);
  refs.awningGroup = awning.group;
  // clothTop 雪壳（挂布料网格之下继承风摆与 sag——M4，§4.4.2 clothTop 行；同 seacliff 帆做法）
  const awningSnow = new THREE.Mesh(
    assets.geometry('classA/snow-awning', () => {
      const shell = new THREE.PlaneGeometry(F.awnW * 0.94, F.awnD * 0.92, 4, 3);
      shell.rotateX(0.209); // 跟随斜布倾角 12°
      shell.translate(0, 0.03, F.awnD * 0.46);
      return shell;
    }),
    makeSnowShellMaterial('classA/snow-awning/mat'),
  );
  awningSnow.name = 'classA/snow-awning';
  awningSnow.userData.noOutline = true;
  awningSnow.visible = false;
  awning.clothMesh.add(awningSnow);

  /* —— 电动踏步（双级展开态：双级板+侧支架+踏面警示纹，右前门下——【3.2-5】）—— */
  const stepGroup = new THREE.Group();
  stepGroup.name = 'classA/step';
  const treadGeometry = assets.geometry('classA/step-tread', () => hardenEdges(roundedBox({ width: 0.55, height: 0.03, depth: F.stepD, radius: 0.012 })));
  const treadStripeGeometry = assets.geometry('classA/step-stripe', () => hardenEdges(roundedBox({ width: 0.5, height: 0.008, depth: 0.05, radius: 0.003 })));
  const stepBracketGeometry = assets.geometry('classA/step-bracket', () => hardenEdges(roundedBox({ width: 0.04, height: 0.3, depth: 0.03, radius: 0.008 })));
  const stepSpecs: readonly (readonly [number, number, number])[] = [
    [0, 0.16, F.stepY],
    [1, 0.16 + F.stepD + 0.06, F.stepY - 0.18],
  ];
  for (const [i, zOff, y] of stepSpecs) {
    const tread = new THREE.Mesh(treadGeometry, chassisMat);
    tread.name = `classA/step-tread/${i}`;
    tread.position.set(F.stepX, y, -(F.halfW + zOff));
    tread.castShadow = true;
    stepGroup.add(tread);
    const stripe = new THREE.Mesh(treadStripeGeometry, markerLampMat);
    stripe.name = `classA/step-stripe/${i}`;
    stripe.position.set(F.stepX, y + 0.02, -(F.halfW + zOff - F.stepD / 2 + 0.06));
    stepGroup.add(stripe);
  }
  for (const x of [F.stepX - 0.24, F.stepX + 0.24]) {
    const bracket = new THREE.Mesh(stepBracketGeometry, darkDetailMat);
    bracket.name = `classA/step-bracket/${x}`;
    bracket.position.set(x, F.stepY - 0.08, -(F.halfW + 0.14));
    stepGroup.add(bracket);
  }
  group.add(stepGroup);
  refs.stepGroup = stepGroup;

  /* —— 车尾自行车架（管架 Cylinder ×4）+ 折叠自行车 bikeFolding（【3.2-6】尾部横置）—— */
  const rackGeometry = assets.geometry('classA/rack-tubes', () => {
    const parts: THREE.BufferGeometry[] = [];
    for (const x of [F.rackX - 0.12, F.rackX + 0.12]) {
      const bar = new THREE.CylinderGeometry(0.024, 0.024, 1.5, 8);
      bar.rotateX(Math.PI / 2); // 轴 Y → 轴 Z（横杆沿车宽）
      bar.translate(x, F.rackY, 0);
      parts.push(bar);
    }
    for (const z of [-0.62, 0.62]) {
      const arm = new THREE.CylinderGeometry(0.022, 0.022, 0.52, 8);
      arm.rotateZ(1.05); // 斜臂：车尾壁 → 架外端
      arm.translate(F.rackX + 0.2, F.rackY - 0.16, z);
      parts.push(arm);
    }
    const merged = mergeGeometries(parts);
    if (!merged) throw new Error('[classA] 车尾架合并失败');
    return hardenEdges(merged);
  });
  const rack = new THREE.Mesh(rackGeometry, rackMat);
  rack.name = 'classA/rack';
  rack.castShadow = true;
  group.add(rack);
  const bike = createBikeFolding({ name: 'classA/bike', frameColor: '#d97b3f' });
  bike.name = 'classA/bike';
  bike.rotation.x = -Math.PI / 2; // 折叠车平躺架面（尾部横置读法）
  bike.position.set(F.rackX, F.rackY + 0.05, 0.21);
  group.add(bike);

  /* —— 底盘/保险杠/轮组/轮眉/排气/接驳口（draft §4.1 其余行）—— */
  const chassis = new THREE.Mesh(
    assets.geometry('classA/chassis', () => hardenEdges(roundedBox({ width: 7.3, height: 0.36, depth: 2.2, radius: 0.05 }))),
    chassisMat,
  );
  chassis.name = 'classA/chassis';
  chassis.position.set(-0.1, 0.52, 0);
  chassis.castShadow = true;
  group.add(chassis);
  const bumperGeometry = assets.geometry('classA/bumper', () => hardenEdges(roundedBox({ width: 0.22, height: 0.3, depth: 2.3, radius: 0.05 })));
  for (const [x, tag] of [[4.02, 'front'], [-4.02, 'rear']] as const) {
    const bumper = new THREE.Mesh(bumperGeometry, chassisMat);
    bumper.name = `classA/bumper-${tag}`;
    bumper.position.set(x, 0.42, 0);
    bumper.castShadow = true;
    group.add(bumper);
  }

  // 轮组：wheel(0.46,0.28) ×6（后双胎，轴距 4.6）——InstancedGroup 成对反壳（§5.6）
  const wheelGeometries = createWheelGeometries(assets, 'vehicleKit/wheel/classA', { radius: F.wheelR, width: F.wheelW });
  const tires = new InstancedGroup(wheelGeometries.tire, tireMat, { capacity: 6, withShell: { width: 0.02 }, name: 'classA/wheel-tires' });
  const hubs = new InstancedGroup(wheelGeometries.hub, hubMat, { capacity: 6, withShell: { width: 0.02 }, name: 'classA/wheel-hubs' });
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

  // 轮眉 ×4（弧形挤出；前 0.36 宽 / 后 0.72 宽盖双胎）
  const fenderShape = new THREE.Shape();
  fenderShape.moveTo(0.6, 0);
  fenderShape.absarc(0, 0, 0.6, 0, Math.PI, false);
  fenderShape.lineTo(-0.48, 0);
  fenderShape.absarc(0, 0, 0.48, Math.PI, 0, true);
  fenderShape.closePath();
  const fenderFront = assets.geometry('classA/fender-front', () => {
    const geometry = new THREE.ExtrudeGeometry(fenderShape, { depth: 0.36, bevelEnabled: false, curveSegments: 10, steps: 1 });
    geometry.translate(0, 0, -0.18);
    return geometry;
  });
  const fenderRear = assets.geometry('classA/fender-rear', () => {
    const geometry = new THREE.ExtrudeGeometry(fenderShape, { depth: 0.72, bevelEnabled: false, curveSegments: 10, steps: 1 });
    geometry.translate(0, 0, -0.36);
    return geometry;
  });
  for (const z of [F.wheelZ, -F.wheelZ]) {
    const front = new THREE.Mesh(fenderFront, fenderMat);
    front.name = `classA/fender-front/${z}`;
    front.position.set(F.axleF, F.wheelR, z);
    front.castShadow = true;
    group.add(front);
    const rear = new THREE.Mesh(fenderRear, fenderMat);
    rear.name = `classA/fender-rear/${z}`;
    rear.position.set(F.axleR, F.wheelR, z > 0 ? (F.wheelZ + F.wheelInnerZ) / 2 : -(F.wheelZ + F.wheelInnerZ) / 2);
    rear.castShadow = true;
    group.add(rear);
  }

  /* —— 金腰线实体饰条（侧壁 y 1.18 沿车身，与 texBodyA 金线同位加浮雕）—— */
  const goldStripGeometry = assets.geometry('classA/gold-strip', () => hardenEdges(roundedBox({ width: 6.1, height: 0.035, depth: 0.02, radius: 0.008 })));
  for (const z of [F.halfW + 0.008, -(F.halfW + 0.008)]) {
    const strip = new THREE.Mesh(goldStripGeometry, goldMat);
    strip.name = `classA/gold-strip/${z}`;
    strip.position.set(-0.35, 1.18, z);
    group.add(strip);
  }

  /* —— 前大灯 ×2（前脸下角，暖白低亮）—— */
  const headGeometry = assets.geometry('classA/head-lamp', () => hardenEdges(roundedBox({ width: 0.05, height: 0.18, depth: 0.34, radius: 0.03 })));
  for (const z of [0.82, -0.82]) {
    const head = new THREE.Mesh(headGeometry, headLampMat);
    head.name = `classA/head-lamp/${z}`;
    head.position.set(F.fasciaX + 0.045, 0.95, z);
    group.add(head);
  }

  /* —— 组合尾灯 ×2（尾角竖置，红低常亮——静态 emissive，非 interiorLightHooks 车内灯位）—— */
  const tailGeometry = assets.geometry('classA/tail-lamp', () => hardenEdges(roundedBox({ width: 0.08, height: 0.55, depth: 0.12, radius: 0.02 })));
  for (const z of [1.02, -1.02]) {
    const tail = new THREE.Mesh(tailGeometry, tailLampMat);
    tail.name = `classA/tail-lamp/${z}`;
    tail.position.set(-3.99, 1.25, z);
    group.add(tail);
  }

  /* —— 示廓灯 ×4（前顶角 ×2 + 尾顶角 ×2，琥珀常亮）—— */
  const markerGeometry = assets.geometry('classA/marker', () => hardenEdges(roundedBox({ width: 0.03, height: 0.05, depth: 0.06, radius: 0.008 })));
  for (const [x, z] of [[3.86, 0.95], [3.86, -0.95], [-3.9, 0.95], [-3.9, -0.95]] as const) {
    const marker = new THREE.Mesh(markerGeometry, markerLampMat);
    marker.name = `classA/marker/${x}/${z}`;
    marker.position.set(x, F.bodyY1 - 0.08, z);
    group.add(marker);
  }

  /* —— 后视镜 ×2（大巴长臂，A 柱两侧）—— */
  for (const z of [F.halfW + 0.06, -(F.halfW + 0.06)]) {
    const arm = new THREE.Mesh(
      assets.geometry('classA/mirror-arm', () => hardenEdges(new THREE.CylinderGeometry(0.014, 0.014, 0.34, 8).rotateX(Math.PI / 2))),
      darkDetailMat,
    );
    arm.name = `classA/mirror-arm/${z}`;
    arm.position.set(3.72, 2.2, z > 0 ? F.halfW + 0.2 : -(F.halfW + 0.2));
    group.add(arm);
    const mirrorBox = new THREE.Mesh(
      assets.geometry('classA/mirror-box', () => hardenEdges(roundedBox({ width: 0.05, height: 0.28, depth: 0.12, radius: 0.015 }))),
      detailMat,
    );
    mirrorBox.name = `classA/mirror-box/${z}`;
    mirrorBox.position.set(3.72, 2.2, z > 0 ? F.halfW + 0.38 : -(F.halfW + 0.38));
    group.add(mirrorBox);
  }

  /* —— 排气管（尾下）+ 水电接驳口（尾左裙，呼应场景水电桩）—— */
  const exhaust = new THREE.Mesh(
    assets.geometry('classA/exhaust', () => hardenEdges(new THREE.CylinderGeometry(0.055, 0.055, 0.55, 10).rotateZ(Math.PI / 2))),
    exhaustMat,
  );
  exhaust.name = 'classA/exhaust';
  exhaust.position.set(-3.9, 0.36, -0.6);
  group.add(exhaust);
  const hookup = new THREE.Mesh(assets.geometry('classA/hookup', () => hardenEdges(roundedBox({ width: 0.3, height: 0.22, depth: 0.05, radius: 0.02 }))), darkDetailMat);
  hookup.name = 'classA/hookup';
  hookup.position.set(-3.6, 0.85, -(F.halfW + 0.02));
  group.add(hookup);

  return {
    group,
    footprint: { ...FOOTPRINT },
    paint: { baseColor: COLORS.body, stripeSpec: STRIPE_SPEC, textureKeys: ['texBodyA'], weathering: false },
    windows,
    cloths: [
      {
        mesh: awning.clothMesh,
        swayAxes: awning.handle.swayAxes, // 固定边在棚根：外缘沿 y/z 摆（docs/05 §7.1.2 车棚行）
        stiffness: AWN_CLOTH.stiffness,
        windFactor: AWN_CLOTH.windFactor,
        sagAmp: AWN_CLOTH.sagAmp,
      } satisfies ClothHandle,
    ],
    weatherSurfaces: buildRoofWeatherSurfaces(assets, group, bodyPlainMat, acFrontMat, acRearMat, awning),
  };
}

/** 天气挂点 ×4（docs/03 §4.2.2：棚布 clothTop + 车顶/空调外机顶 roofTop ×3；M4 snowShell 预建）。 */
function buildRoofWeatherSurfaces(
  assets: SharedAssets,
  host: THREE.Group,
  roofMat: THREE.Material,
  acFrontMat: THREE.Material,
  acRearMat: THREE.Material,
  awning: { clothMesh: THREE.Mesh; },
): WeatherSurface[] {
  const makeShell = (id: string, w: number, d: number, position: [number, number, number]): THREE.Mesh => {
    const shell = new THREE.Mesh(
      assets.geometry(id, () => new THREE.PlaneGeometry(w, d, 4, 3).rotateX(-Math.PI / 2)),
      makeSnowShellMaterial(`${id}/mat`),
    );
    shell.name = id;
    shell.position.set(...position);
    shell.userData.noOutline = true;
    shell.visible = false; // WeatherMaterialSystem 注册后按 snowCover 驱动（docs/05 §4.4.2-M4）
    return shell;
  };
  const roofSnow = makeShell('classA/snow-roof', 7.5, 2.3, [-0.1, F.bodyY1 + 0.012, 0]);
  const acFrontSnow = makeShell('classA/snow-ac-front', 1.1, 0.85, [F.acX, F.acY + F.acSize.h / 2 + 0.012, 0]);
  const acRearSnow = makeShell('classA/snow-ac-rear', 1.1, 0.85, [-F.acX, F.acY + F.acSize.h / 2 + 0.012, 0]);
  host.add(roofSnow, acFrontSnow, acRearSnow); // 雪壳随车体变换；棚布雪壳已挂 clothMesh（继承风摆）
  return [
    { material: roofMat, kind: 'roofTop', snowShell: roofSnow },
    { material: acFrontMat, kind: 'roofTop', snowShell: acFrontSnow },
    { material: acRearMat, kind: 'roofTop', snowShell: acRearSnow },
    { material: (awning.clothMesh.material as THREE.Material), kind: 'clothTop', snowShell: host.getObjectByName('classA/snow-awning') as THREE.Mesh },
  ];
}

/* ============================== ② buildDeployment（draft §4.2：2 个 DeploymentPart，默认已展开） ============================== */

function buildDeployment(_ctx: VehicleBuildContext): readonly DeploymentPart[] {
  const awningGroup = refs.awningGroup;
  const stepGroup = refs.stepGroup;
  if (!awningGroup || !stepGroup) throw new Error('[classA] buildDeployment 先于 buildExterior 调用（Director 分帧序）');
  return [
    { node: awningGroup, kind: 'awning', deployAmount: 1 }, // 遮阳棚整组（斜布 12°、支撑臂八字张开）
    { node: stepGroup, kind: 'step', deployAmount: 1 }, // 电动踏步（双级全部伸出）
  ];
}

/* ============================== ③ buildInterior（3.2-7…12 逐项；17 named + 三件套） ============================== */

/* —— 内饰材质（工厂缓存单例；灯材质 authored 基值在 buildInterior 内重写，同 classC 裁定④）—— */

const innerShellMat = toonMaterials.getToon('matteProp', {
  color: COLORS.innerShell, outline: false, emissive: COLORS.fillLight, emissiveIntensity: 0, name: 'classA/inner-shell',
});
innerShellMat.side = THREE.BackSide; // 三件套：innerShell BackSide 暖色内壁（docs/03 §4.2.0）
const mattressMat = toonMaterials.getToon('cloth', { color: '#eee6d6', emissive: '#ff9a5a', emissiveIntensity: 0, name: 'classA/mattress' });
const stripLampMat = toonMaterials.getToon('matteProp', { color: '#f5ead6', emissive: COLORS.stripLight, emissiveIntensity: LAMPS.authored, name: 'classA/strip-lamp' });
const bedLampMat = toonMaterials.getToon('matteProp', { color: '#f5ead6', emissive: COLORS.bedLight, emissiveIntensity: LAMPS.authored * LAMPS.bedGain, name: 'classA/bed-lamp' });
const bathLampMat = toonMaterials.getToon('matteProp', { color: '#e8eef0', emissive: COLORS.bathLight, emissiveIntensity: LAMPS.bathAuthored * LAMPS.bathGain, name: 'classA/bath-lamp' });

interface FurnitureMaterialSet {
  wood: THREE.Material;
  woodLight: THREE.Material;
  leather: THREE.Material;
  leatherAlt: THREE.Material;
  brass: THREE.Material;
  darkMetal: THREE.Material;
  steel: THREE.Material;
  stone: THREE.Material;
  quilt: THREE.Material;
  pillow: THREE.Material;
  floorWood: THREE.Material;
}

function buildFurnitureMaterials(assets: SharedAssets): FurnitureMaterialSet {
  const floorTexture = assets.texture('classA/tex/floor-walnut', () => paintCanvasTexture('classA/tex/floor-walnut', 256, 256, drawWoodFloorWalnut));
  floorTexture.repeat.set(7, 2.2);
  return {
    wood: toonMaterials.get('wood', { color: COLORS.walnut, name: 'classA/furn-walnut' }),
    woodLight: toonMaterials.get('wood', { color: COLORS.walnutLight, name: 'classA/furn-walnut-light' }),
    leather: toonMaterials.get('cloth', { color: COLORS.leather, name: 'classA/leather' }),
    leatherAlt: toonMaterials.get('cloth', { color: COLORS.leatherAlt, name: 'classA/leather-alt' }),
    brass: toonMaterials.get('metal', { color: COLORS.gold, name: 'classA/brass' }),
    darkMetal: toonMaterials.get('metal', { color: '#4a4a50', name: 'classA/dark-metal' }),
    steel: toonMaterials.get('metal', { color: '#9aa0a6', name: 'classA/steel' }),
    stone: toonMaterials.get('matteProp', { color: COLORS.stone, name: 'classA/counter-stone' }),
    quilt: toonMaterials.get('cloth', { color: '#b26a4a', name: 'classA/quilt' }),
    pillow: toonMaterials.get('cloth', { color: COLORS.leather, name: 'classA/pillow' }),
    floorWood: toonMaterials.get('wood', { color: COLORS.walnut, map: floorTexture, name: 'classA/wood-floor' }),
  };
}

/** 环形环段 Shape（外弧 r1 逆时针 a0→a1 + 内弧 r0 顺时针返回——ringSofa 坐垫/靠背共用）。 */
function annulusSector(r0: number, r1: number, a0: number, a1: number): THREE.Shape {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, r1, a0, a1, false);
  shape.lineTo(r0 * Math.cos(a1), r0 * Math.sin(a1));
  shape.absarc(0, 0, r0, a1, a0, true);
  shape.closePath();
  return shape;
}

/** 环段挤出转竖直（XY 环段沿 Z 挤 depth → rotateX(−π/2)：环段面躺平、挤出沿 +Y 升起）。 */
function extrudeSectorVertical(r0: number, r1: number, a0: number, a1: number, depth: number, curveSegments = 10): THREE.ExtrudeGeometry {
  const geometry = new THREE.ExtrudeGeometry(annulusSector(r0, r1, a0, a1), { depth, bevelEnabled: false, curveSegments, steps: 1 });
  geometry.rotateX(-Math.PI / 2);
  geometry.computeVertexNormals();
  return geometry;
}

function buildInterior(ctx: VehicleBuildContext): VehicleInterior {
  const { assets, rng } = ctx;
  const group = new THREE.Group();
  group.name = 'classA/interior';
  group.userData.noOutline = true; // 三件套：内饰子树整体跳过描边（§5.3）

  // —— 灯基值重写（裁定④：LightBreath 注册期快照 authored，先重写再由 Director 注册）——
  stripLampMat.emissiveIntensity = LAMPS.authored;
  bedLampMat.emissiveIntensity = LAMPS.authored * LAMPS.bedGain;
  bathLampMat.emissiveIntensity = LAMPS.bathAuthored * LAMPS.bathGain;
  stripLampMat.visible = true;
  bedLampMat.visible = true;
  bathLampMat.visible = true;

  const mats = buildFurnitureMaterials(assets);
  const named: Record<string, THREE.Object3D> = {};
  const add = (key: (typeof NAMED_KEYS)[number], object: THREE.Object3D): void => {
    object.name = `classA/interior/${key}`;
    group.add(object);
    named[key] = object;
  };
  const box = (w: number, h: number, d: number, material: THREE.Material, id?: string): THREE.Mesh => {
    const mesh = new THREE.Mesh(
      assets.geometry(id ?? `classA/furn-box|${w}x${h}x${d}`, () => hardenEdges(roundedBox({ width: w, height: h, depth: d, radius: Math.min(0.02, Math.min(w, h, d) * 0.2) }))),
      material,
    );
    mesh.name = id ?? `classA/furn-box|${w}x${h}x${d}`; // 勾验/冒烟按 name 取件（同 classC named 物体名前缀纪律）
    return mesh;
  };

  /* —— 三件套 ①innerShell：车身体缩放圆角盒 BackSide（宽深 0.94、高 2.42——底缘 0.55 低于地板 0.60，
  /*   防地板被壳底面遮挡；顶缘 2.97≈内高 2.37+地板，【3.2-13】进深读法；castShadow=false）—— */
  const shell = new THREE.Mesh(
    assets.geometry('classA/inner-shell', () => roundedBox({
      width: (F.bodyX1 - F.bodyX0) * 0.94,
      height: 2.42,
      depth: F.halfW * 2 * 0.94,
      radius: 0.12,
    })),
    innerShellMat,
  );
  shell.name = 'classA/interior/inner-shell';
  shell.position.set(0, 1.76, 0);
  group.add(shell);

  /* —— `woodFloor` 木纹地板（texWoodFloor walnut 全舱——【3.2-10】；内高 2.4 起点）—— */
  const floor = new THREE.Mesh(
    assets.geometry('classA/wood-floor', () => new THREE.PlaneGeometry(7.3, 2.26, 1, 1).rotateX(-Math.PI / 2)),
    mats.floorWood,
  );
  floor.name = 'classA/interior/woodFloor';
  floor.position.set(-0.1, F.floorY, 0);
  group.add(floor);
  named.woodFloor = floor;

  /* —— 驾驶舱（非 named）：仪表组 gaugeCluster('cool') + 仪表台板——screens=仪表组（docs/03 §4.2.2）—— */
  const dashTexture = assets.texture('classA/tex/dash-cool', () => paintCanvasTexture('classA/tex/dash-cool', 256, 128, drawDashCool));
  const gauge = createGaugeCluster({ style: 'cool', map: dashTexture, name: 'classA/gauge', panel: { width: 0.5, height: 0.2 }, wheelRadius: 0.11 });
  gauge.group.name = 'classA/interior/cockpit-gauge';
  gauge.group.position.set(2.9, 1.5, -0.55);
  gauge.group.rotation.y = -Math.PI / 2; // 屏面朝 −X（驾驶员）
  const dashShelf = box(0.55, 0.05, 1.9, mats.wood, 'classA/dash-shelf');
  dashShelf.name = 'classA/interior/dash-shelf';
  dashShelf.position.set(3.5, 1.24, 0);
  group.add(gauge.group, dashShelf);
  refs.screens = [gauge.screenMaterial];

  /* —— `ringSofa` 环形豪华沙发卡座（【3.2-7】：外弧 r1.10/内弧 r0.72 跨 210° + 弧形靠背 +
  /*   坐垫扇形分段 ×5 + 配套圆桌；驾驶区后 (1.55, floor, 0)，缺口朝车头）—— */
  const sofa = new THREE.Group();
  const A0 = (75 * Math.PI) / 180;
  const A1 = (285 * Math.PI) / 180;
  const seatBase = new THREE.Mesh(assets.geometry('classA/ring-seat', () => extrudeSectorVertical(0.72, 1.1, A0, A1, 0.42)), mats.wood);
  seatBase.name = 'classA/ring-seat';
  seatBase.position.y = 0;
  sofa.add(seatBase);
  const backrest = new THREE.Mesh(assets.geometry('classA/ring-back', () => extrudeSectorVertical(1.0, 1.1, A0, A1, 0.70)), mats.leather);
  backrest.name = 'classA/ring-back';
  backrest.position.y = 0.40;
  sofa.add(backrest);
  const brassBand = new THREE.Mesh(assets.geometry('classA/ring-brass', () => extrudeSectorVertical(1.095, 1.115, A0, A1, 0.04)), mats.brass);
  brassBand.name = 'classA/ring-brass';
  brassBand.position.y = 1.06;
  sofa.add(brassBand);
  const cushionGeometry = (i: number): THREE.BufferGeometry =>
    assets.geometry(`classA/ring-cushion-${i}`, () => extrudeSectorVertical(0.75, 1.05, A0 + 0.012 + i * ((A1 - A0 - 0.024) / 5), A0 + ((i + 1) * (A1 - A0 - 0.024)) / 5 - 0.012, 0.07));
  for (let i = 0; i < 5; i++) {
    const cushion = new THREE.Mesh(cushionGeometry(i), i % 2 === 0 ? mats.leather : mats.leatherAlt);
    cushion.name = `classA/ring-cushion/${i}`;
    cushion.position.y = 0.42;
    sofa.add(cushion);
  }
  // 配套圆桌（环形卡座中心，黄铜柱+胡桃桌面）
  const tableTop = new THREE.Mesh(assets.geometry('classA/ring-table-top', () => hardenEdges(new THREE.CylinderGeometry(0.42, 0.42, 0.035, 20))), mats.wood);
  tableTop.name = 'classA/ring-table-top';
  tableTop.position.y = 0.62;
  const tablePost = new THREE.Mesh(assets.geometry('classA/ring-table-post', () => hardenEdges(new THREE.CylinderGeometry(0.05, 0.05, 0.6, 10))), mats.brass);
  tablePost.name = 'classA/ring-table-post';
  tablePost.position.y = 0.31;
  const tableBase = new THREE.Mesh(assets.geometry('classA/ring-table-base', () => lathe({ profile: [[0.02, 0.03], [0.2, 0.03], [0.21, 0.01], [0.0, 0.0]], segments: 14 })), mats.brass);
  tableBase.name = 'classA/ring-table-base';
  sofa.add(tableTop, tablePost, tableBase);
  sofa.position.set(1.55, F.floorY, 0);
  add('ringSofa', sofa);

  /* —— `islandCounter` 中岛厨房（【3.2-8】：台座+浅石纹台面+黄铜踢脚，中轴 (−0.7, floor, +0.05)）—— */
  const counter = new THREE.Group();
  const counterBody = box(2.2, 0.9, 0.85, mats.wood, 'classA/counter-body');
  counterBody.position.set(0, 0.45, 0);
  const counterTop = box(2.3, 0.05, 0.95, mats.stone, 'classA/counter-top');
  counterTop.position.set(0, 0.925, 0);
  const kickStrip = box(2.16, 0.06, 0.02, mats.brass, 'classA/counter-kick');
  kickStrip.position.set(0, 0.05, 0.435);
  counter.add(counterBody, counterTop, kickStrip);
  counter.position.set(-0.7, F.floorY, 0.05);
  add('islandCounter', counter);

  /* —— `islandSink` 水槽（内嵌槽+Lathe 弯龙头，中岛前端）—— */
  const sink = new THREE.Group();
  const sinkBasin = box(0.38, 0.03, 0.3, mats.darkMetal, 'classA/sink-basin');
  sinkBasin.position.set(-0.75, F.floorY + 0.915, 0.05);
  const faucet = new THREE.Mesh(
    assets.geometry('classA/sink-faucet', () => tube({
      pointsOrCurve: [
        new THREE.Vector3(-0.45, F.floorY + 0.93, 0.05),
        new THREE.Vector3(-0.45, F.floorY + 1.16, 0.05),
        new THREE.Vector3(-0.45, F.floorY + 1.2, 0.0),
        new THREE.Vector3(-0.45, F.floorY + 1.15, -0.04),
        new THREE.Vector3(-0.45, F.floorY + 1.06, -0.04),
      ],
      radius: 0.014,
      tubularSegments: 16,
    })),
    mats.steel,
  );
  faucet.name = 'classA/sink-faucet';
  sink.add(sinkBasin, faucet);
  add('islandSink', sink);

  /* —— `stoveEmbedded` 嵌入式灶台（台面开槽深玻璃+4 炉架 torus(0.075)，中岛中部）—— */
  const stove = new THREE.Group();
  const stoveGlass = box(0.52, 0.014, 0.44, mats.darkMetal, 'classA/stove-glass');
  stoveGlass.position.set(-1.5, F.floorY + 0.932, 0.05);
  const burnerGeometry = assets.geometry('classA/burner', () => hardenEdges(new THREE.TorusGeometry(0.075, 0.013, 6, 14).rotateX(Math.PI / 2)));
  const grateGeometry = assets.geometry('classA/grate', () => hardenEdges(new THREE.BoxGeometry(0.13, 0.012, 0.02)));
  for (const [dx, dz] of [[-0.13, 0.1], [0.13, 0.1], [-0.13, -0.1], [0.13, -0.1]] as const) {
    const burner = new THREE.Mesh(burnerGeometry, mats.darkMetal);
    burner.name = `classA/burner/${dx}/${dz}`;
    burner.position.set(-1.5 + dx, F.floorY + 0.945, 0.05 + dz);
    stove.add(burner);
    for (const rot of [0, Math.PI / 2]) {
      const grate = new THREE.Mesh(grateGeometry, mats.darkMetal);
      grate.name = `classA/grate/${dx}/${dz}/${rot}`;
      grate.position.set(-1.5 + dx, F.floorY + 0.94, 0.05 + dz);
      grate.rotation.y = rot;
      stove.add(grate);
    }
  }
  stove.add(stoveGlass);
  add('stoveEmbedded', stove);

  /* —— `oven` 烤箱（前脸圆角盒+玻璃视窗 tinted+横把手+旋钮 ×3，中岛前脸朝 +Z 过道）—— */
  const oven = new THREE.Group();
  const ovenBody = box(0.62, 0.5, 0.1, mats.steel, 'classA/oven-body');
  ovenBody.position.set(-0.7, F.floorY + 0.45, 0.5);
  const ovenWindow = new THREE.Mesh(assets.geometry('classA/oven-window', () => new THREE.PlaneGeometry(0.4, 0.24)), glassTintedRef);
  ovenWindow.name = 'classA/oven-window';
  ovenWindow.position.set(-0.7, F.floorY + 0.5, 0.556);
  ovenWindow.rotation.y = 0;
  ovenWindow.renderOrder = 20;
  ovenWindow.userData.noOutline = true;
  const ovenHandle = box(0.5, 0.025, 0.025, mats.brass, 'classA/oven-handle');
  ovenHandle.position.set(-0.7, F.floorY + 0.66, 0.56);
  const ovenKnobGeometry = assets.geometry('classA/oven-knob', () => hardenEdges(new THREE.CylinderGeometry(0.022, 0.022, 0.02, 8).rotateX(Math.PI / 2)));
  for (const dx of [-0.2, 0, 0.2]) {
    const knob = new THREE.Mesh(ovenKnobGeometry, mats.brass);
    knob.name = `classA/oven-knob/${dx}`;
    knob.position.set(-0.7 + dx, F.floorY + 0.3, 0.556);
    oven.add(knob);
  }
  oven.add(ovenBody, ovenWindow, ovenHandle);
  add('oven', oven);

  /* —— `fridgeDouble` 双开门冰箱（双门缝+双长把手黄铜，右墙）—— */
  const fridge = new THREE.Group();
  const fridgeBody = box(0.85, 1.55, 0.62, mats.steel, 'classA/fridge-body');
  fridgeBody.position.set(-1.5, F.floorY + 0.775, -0.835);
  const fridgeSeam = box(0.014, 1.5, 0.02, mats.darkMetal, 'classA/fridge-seam');
  fridgeSeam.position.set(-1.5, F.floorY + 0.775, -0.518);
  const fridgeHandleGeometry = assets.geometry('classA/fridge-handle', () => hardenEdges(roundedBox({ width: 0.03, height: 0.55, depth: 0.03, radius: 0.01 })));
  for (const dx of [-0.3, 0.3]) {
    const handle = new THREE.Mesh(fridgeHandleGeometry, mats.brass);
    handle.name = `classA/fridge-handle/${dx}`;
    handle.position.set(-1.5 + dx, F.floorY + 0.95, -0.505);
    fridge.add(handle);
  }
  fridge.add(fridgeBody, fridgeSeam);
  add('fridgeDouble', fridge);

  /* —— `cabinetTower` 通顶吊柜（三段叠壁挂连排，左墙）+ `lightStrip` 暖色灯带（柜底 emissive）—— */
  const tower = new THREE.Group();
  const towerGeometry = (h: number): THREE.BufferGeometry => assets.geometry(`classA/tower|${h}`, () => hardenEdges(roundedBox({ width: 1.5, height: h, depth: 0.32, radius: 0.02 })));
  const towerHeights = [0.55, 0.55, 0.35] as const;
  let towerY = 1.55; // 底缘（台面 1.55 上方起，通到顶 3.0）
  for (const h of towerHeights) {
    const section = new THREE.Mesh(towerGeometry(h), mats.wood);
    section.name = `classA/tower-section/${towerY}`;
    section.position.set(-1.2, towerY + h / 2, 0.98);
    tower.add(section);
    const grip = box(0.9, 0.02, 0.02, mats.brass, 'classA/tower-grip');
    grip.position.set(-1.2, towerY + 0.06, 0.805);
    tower.add(grip);
    towerY += h;
  }
  add('cabinetTower', tower);

  const lightStripGroup = new THREE.Group();
  const strip = box(1.8, 0.02, 0.03, stripLampMat, 'classA/light-strip');
  strip.name = 'classA/light-strip-bar';
  strip.position.set(-1.2, 1.53, 0.80);
  const stripHalo = makeHaloSprite(assets, 'classA/light-strip-halo', 0.7, COLORS.stripLight);
  stripHalo.position.set(-1.2, 1.5, 0.78);
  lightStripGroup.add(strip, stripHalo);
  add('lightStrip', lightStripGroup);

  /* —— `partitionWall` 半隔断（板墙 0.05 厚 + 门洞留左 1/3 + 黄铜门框，x −2.0）—— */
  const partition = new THREE.Group();
  // 轮廓 x_shape=−z（挤出 rotateY(π/2) 后 z'=−x_shape 复原 z 向）：z −1.15..+0.40，门洞留 +0.40..+1.15（左 1/3）
  const panelShape = new THREE.Shape();
  panelShape.moveTo(-0.4, 0);
  panelShape.lineTo(1.15, 0);
  panelShape.lineTo(1.15, 2.4);
  panelShape.lineTo(-0.4, 2.4);
  panelShape.closePath();
  const panelMesh = new THREE.Mesh(
    assets.geometry('classA/partition-panel', () => {
      const geometry = new THREE.ExtrudeGeometry(panelShape, { depth: 0.05, bevelEnabled: false, curveSegments: 4, steps: 1 });
      geometry.rotateY(Math.PI / 2); // (x,y,t)→(t,y,−x)：厚 0.05 沿 X、z −1.15..+0.4
      geometry.translate(-2.025, F.floorY, 0);
      geometry.computeVertexNormals();
      return geometry;
    }),
    mats.woodLight,
  );
  panelMesh.name = 'classA/partition-panel';
  partition.add(panelMesh);
  const jambGeometry = assets.geometry('classA/partition-jamb', () => hardenEdges(roundedBox({ width: 0.07, height: 2.4, depth: 0.05, radius: 0.01 })));
  for (const z of [0.4, 1.15]) {
    const jamb = new THREE.Mesh(jambGeometry, mats.brass);
    jamb.name = `classA/partition-jamb/${z}`;
    jamb.position.set(-2.0, F.floorY + 1.2, z);
    partition.add(jamb);
  }
  const lintel = box(0.07, 0.05, 0.75, mats.brass, 'classA/partition-lintel');
  lintel.name = 'classA/partition-lintel';
  lintel.position.set(-2.0, F.floorY + 2.37, 0.775);
  partition.add(lintel);
  add('partitionWall', partition);

  /* —— `bedDouble` 独立卧室双人床（床箱+床垫+双枕+搭盖毯+床头板，床区 x −3.68..−2.10 偏左，
  /*   全部收在内衬壳 x ±3.71 之内——壳背面临床区不遮床头）—— */
  const bed = new THREE.Group();
  const bedFrame = box(1.58, 0.45, 1.43, mats.wood, 'classA/bed-frame');
  bedFrame.position.set(-2.89, F.floorY + 0.225, 0.41);
  const bedMattress = new THREE.Mesh(
    assets.geometry('classA/bed-mattress', () => hardenEdges(roundedBox({ width: 1.52, height: 0.16, depth: 1.36, radius: 0.05 }))),
    mattressMat,
  );
  bedMattress.name = 'classA/bed-mattress';
  bedMattress.position.set(-2.89, F.floorY + 0.53, 0.41);
  const headboard = box(0.08, 0.85, 1.43, mats.wood, 'classA/bed-headboard');
  headboard.position.set(-3.64, F.floorY + 0.85, 0.41);
  bed.add(bedFrame, bedMattress, headboard);
  for (const dz of [0.36, -0.36]) {
    const pillow = box(0.36, 0.1, 0.4, mats.pillow, 'classA/bed-pillow');
    pillow.position.set(-3.36, F.floorY + 0.66, 0.41 + dz);
    pillow.rotation.y = rng.range(-0.08, 0.08);
    bed.add(pillow);
  }
  const quilt = box(0.95, 0.09, 1.4, mats.quilt, 'classA/bed-quilt');
  quilt.position.set(-2.54, F.floorY + 0.64, 0.41 + rng.range(-0.03, 0.03));
  quilt.rotation.z = rng.range(-0.02, 0.02);
  bed.add(quilt);
  add('bedDouble', bed);

  /* —— `bedLamp` 床头阅读灯（弯臂小灯双 Cylinder+乳白罩，床头板面；breath 0.5）—— */
  const bedLamp = new THREE.Group();
  const bedLampArm = new THREE.Mesh(
    assets.geometry('classA/bed-lamp-arm', () => tube({
      pointsOrCurve: [
        new THREE.Vector3(-3.62, F.floorY + 0.95, 0.72),
        new THREE.Vector3(-3.56, F.floorY + 1.0, 0.72),
        new THREE.Vector3(-3.5, F.floorY + 1.08, 0.72),
      ],
      radius: 0.014,
      tubularSegments: 10,
    })),
    mats.brass,
  );
  bedLampArm.name = 'classA/bed-lamp-arm';
  const bedLampShade = new THREE.Mesh(assets.geometry('classA/bed-lamp-shade', () => lathe({ profile: [[0.0, 0.05], [0.055, 0.02], [0.06, 0.0]], segments: 10 })), bedLampMat);
  bedLampShade.name = 'classA/bed-lamp-shade';
  bedLampShade.position.set(-3.48, F.floorY + 1.08, 0.72);
  const bedLampHalo = makeHaloSprite(assets, 'classA/bed-lamp-halo', 0.42, COLORS.bedLight);
  bedLampHalo.position.set(-3.46, F.floorY + 1.04, 0.72);
  bedLamp.add(bedLampArm, bedLampShade, bedLampHalo);
  add('bedLamp', bedLamp);

  /* —— `bathPod` 小卫浴间体（三面板围合角舱+门槛，右后角；含卫浴冷光小灯）—— */
  const pod = new THREE.Group();
  // P1：沿车长向隔板（x −3.70..−2.95，z −0.42，厚 0.04 沿 Z；XY 轮廓即 x=车长、y=高，挤出沿 Z 直用）
  const podShapeP1 = new THREE.Shape();
  podShapeP1.moveTo(-3.7, 0);
  podShapeP1.lineTo(-2.95, 0);
  podShapeP1.lineTo(-2.95, 2.4);
  podShapeP1.lineTo(-3.7, 2.4);
  podShapeP1.closePath();
  const podP1 = new THREE.Mesh(
    assets.geometry('classA/pod-p1', () => {
      const geometry = new THREE.ExtrudeGeometry(podShapeP1, { depth: 0.04, bevelEnabled: false, curveSegments: 4, steps: 1 });
      geometry.translate(0, F.floorY, -0.42); // z −0.42..−0.38（隔板贴床位侧）
      geometry.computeVertexNormals();
      return geometry;
    }),
    mats.woodLight,
  );
  podP1.name = 'classA/pod-p1';
  pod.add(podP1);
  // P2：沿车宽向隔板（x −2.95，z −1.15..−0.72，厚 0.04 沿 X；轮廓 x_shape=−z，rotateY(π/2) 后复原）
  const podShapeP2 = new THREE.Shape();
  podShapeP2.moveTo(0.72, 0);
  podShapeP2.lineTo(1.15, 0);
  podShapeP2.lineTo(1.15, 2.4);
  podShapeP2.lineTo(0.72, 2.4);
  podShapeP2.closePath();
  const podP2 = new THREE.Mesh(
    assets.geometry('classA/pod-p2', () => {
      const geometry = new THREE.ExtrudeGeometry(podShapeP2, { depth: 0.04, bevelEnabled: false, curveSegments: 4, steps: 1 });
      geometry.rotateY(Math.PI / 2); // (x,y,t)→(t,y,−x)：z'=−x_shape=−1.15..−0.72、x'=厚 0..0.04
      geometry.translate(-2.97, F.floorY, 0); // x −2.97..−2.93（中心 −2.95）
      geometry.computeVertexNormals();
      return geometry;
    }),
    mats.woodLight,
  );
  podP2.name = 'classA/pod-p2';
  pod.add(podP2);
  // 门楣（入口上方 x −2.95 z −0.72..−0.38）+ 门槛
  const podHeader = box(0.04, 0.85, 0.34, mats.woodLight, 'classA/pod-header');
  podHeader.name = 'classA/pod-header';
  podHeader.position.set(-2.95, F.floorY + 1.975, -0.55);
  pod.add(podHeader);
  const podSill = box(0.06, 0.035, 0.34, mats.brass, 'classA/pod-sill');
  podSill.name = 'classA/pod-sill';
  podSill.position.set(-2.95, F.floorY + 0.018, -0.55);
  pod.add(podSill);
  // 卫浴冷光小灯（steady 0.25 #cfe6ee 冷暖层次——舱内顶角）
  const bathLampDisc = new THREE.Mesh(assets.geometry('classA/bath-lamp-disc', () => hardenEdges(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 10))), bathLampMat);
  bathLampDisc.name = 'classA/bath-lamp-disc';
  bathLampDisc.position.set(-3.6, F.ceilY - 0.06, -0.95);
  const bathHalo = makeHaloSprite(assets, 'classA/bath-lamp-halo', 0.36, COLORS.bathLight);
  bathHalo.position.set(-3.6, F.ceilY - 0.1, -0.95);
  pod.add(bathLampDisc, bathHalo);
  add('bathPod', pod);

  /* —— `basin` 洗手盆（Lathe 回转盆+立柱龙头，P1 隔板舱内侧台面）—— */
  const basin = new THREE.Group();
  const basinShelf = box(0.55, 0.04, 0.35, mats.stone, 'classA/basin-shelf');
  basinShelf.position.set(-3.12, F.floorY + 0.82, -0.6); // 贴 P1 舱内面（z −0.42），悬挑台面
  const basinBowl = new THREE.Mesh(
    assets.geometry('classA/basin-bowl', () => lathe({ profile: [[0.03, 0], [0.12, 0.05], [0.16, 0.11], [0.12, 0.125], [0.0, 0.13]], segments: 14 })),
    mats.stone,
  );
  basinBowl.name = 'classA/basin-bowl';
  basinBowl.position.set(-3.12, F.floorY + 0.84, -0.6);
  const basinFaucet = new THREE.Mesh(
    assets.geometry('classA/basin-faucet', () => tube({
      pointsOrCurve: [
        new THREE.Vector3(-3.12, F.floorY + 0.84, -0.46),
        new THREE.Vector3(-3.12, F.floorY + 1.04, -0.46),
        new THREE.Vector3(-3.12, F.floorY + 1.08, -0.52),
        new THREE.Vector3(-3.12, F.floorY + 1.02, -0.58),
      ],
      radius: 0.013,
      tubularSegments: 12,
    })),
    mats.brass,
  );
  basinFaucet.name = 'classA/basin-faucet';
  basin.add(basinShelf, basinBowl, basinFaucet);
  add('basin', basin);

  /* —— `mirror` 镜（浅蓝 basic 薄板，盆上方 P1 舱内面，朝 −z 供右窗透视）—— */
  const mirror = new THREE.Mesh(
    assets.geometry('classA/mirror', () => new THREE.PlaneGeometry(0.45, 0.55)),
    new THREE.MeshBasicMaterial({ color: '#a9c6d8', name: 'classA/mirror-basic' }),
  );
  mirror.name = 'classA/interior/mirror';
  mirror.position.set(-3.12, F.floorY + 1.35, -0.425);
  mirror.rotation.y = Math.PI; // 面朝 −z（P1 舱内侧）
  mirror.userData.noOutline = true;
  group.add(mirror);
  named.mirror = mirror;

  /* —— `showerGlass` 淋浴隔断（glassMat/tinted 板 0.75×1.4，舱内淋浴/盆区分界）—— */
  const showerGlass = new THREE.Mesh(
    assets.geometry('classA/shower-glass', () => new THREE.PlaneGeometry(0.75, 1.4)),
    glassTintedRef,
  );
  showerGlass.name = 'classA/interior/showerGlass';
  showerGlass.position.set(-3.35, F.floorY + 0.72, -0.765);
  showerGlass.rotation.y = Math.PI / 2; // 面朝 ±X
  showerGlass.renderOrder = 20;
  showerGlass.userData.noOutline = true;
  group.add(showerGlass);
  named.showerGlass = showerGlass;

  /* —— `showerHead` 花洒（L 管+小喷头锥，舱内后角 x −3.66 淋浴区）—— */
  const showerHead = new THREE.Group();
  const showerRiser = new THREE.Mesh(
    assets.geometry('classA/shower-riser', () => tube({
      pointsOrCurve: [
        new THREE.Vector3(-3.66, F.floorY + 0.3, -1.05),
        new THREE.Vector3(-3.66, F.floorY + 1.5, -1.05),
        new THREE.Vector3(-3.58, F.floorY + 1.62, -1.0),
      ],
      radius: 0.016,
      tubularSegments: 12,
    })),
    mats.steel,
  );
  showerRiser.name = 'classA/shower-riser';
  const showerNozzle = new THREE.Mesh(assets.geometry('classA/shower-nozzle', () => hardenEdges(new THREE.ConeGeometry(0.055, 0.09, 10).rotateX(-Math.PI / 2))), mats.steel);
  showerNozzle.name = 'classA/shower-nozzle';
  showerNozzle.position.set(-3.54, F.floorY + 1.58, -0.98);
  showerHead.add(showerRiser, showerNozzle);
  add('showerHead', showerHead);

  /* —— 灯点句柄（docs/03 §4.2.2：lamps=lightStrip steady 1.0 + bedLamp breath 0.5 + 卫浴冷光 steady 0.25）—— */
  refs.lampHandles = [
    { emissiveMat: stripLampMat, halo: stripHalo, mode: 'steady', params: {} } satisfies LampHandle,
    { emissiveMat: bedLampMat, halo: bedLampHalo, mode: 'breath', params: { period: LAMPS.breathPeriod, depth: LAMPS.breathDepth } } satisfies LampHandle,
    { emissiveMat: bathLampMat, halo: bathHalo, mode: 'steady', params: {} } satisfies LampHandle,
  ];

  /* —— 车内暖光点光（全局 ≤2 点光预算之「车内暖光」位；强度经 applyInteriorLight 下发）—— */
  const fillLight = new THREE.PointLight(COLORS.fillLight, 0, FILL_LIGHT.distance, FILL_LIGHT.decay);
  fillLight.name = 'classA/fill-light';
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

  // named 键完整性自检（17 个逐项在场；漏键即刻抛错——TASKS 勾验通路）
  for (const key of NAMED_KEYS) {
    if (!named[key]) throw new Error(`[classA] named 键缺失：${key}`);
  }
  return { group, named };
}

/* ============================== ④ interiorLightHooks（D2 唯一驱动链；docs/03 §4.2.2 钩子行） ============================== */

/**
 * 可透视窗透明度目标（clear 0.24 / tinted 0.40 → 夜间随 interiorPower 插值降至 0.22，docs/04 §5.5）。
 * 经工厂同名缓存键取用——与 buildExterior 内玻璃材质为同一实例（改一处全场生效）。
 */
const windowGlassTargets: readonly { readonly material: THREE.MeshToonMaterial; readonly base: number }[] = [
  { material: toonMaterials.getToon('glass', { color: '#bcd8e8', opacity: GLASS_OPACITY.clear, name: 'classA/glass-clear' }), base: GLASS_OPACITY.clear },
  { material: toonMaterials.getToon('glass', { color: '#9fc4d8', opacity: GLASS_OPACITY.tinted, name: 'classA/glass-tinted' }), base: GLASS_OPACITY.tinted },
];

const interiorLightHooks: InteriorLightHooks = {
  get lamps(): readonly LampHandle[] {
    // 每次构建由 buildInterior 重写（halo 精灵/句柄随构建刷新；材质单例重写 authored 基值）
    return refs.lampHandles;
  },
  applyInteriorLight(power: number, emphasis: number, blend: number): void {
    const p = clamp(power, 0, 1);
    const b = clamp(blend, 0, 1);
    // ① 车窗透明度随 interiorPower 向 0.22 插值（docs/03 §4.2.0 玻璃三档行；车内暖光透出增强冷暖对比）
    for (const target of windowGlassTargets) {
      target.material.opacity = target.base + (GLASS_NIGHT_OPACITY - target.base) * p;
    }
    // ② glowTags：床垫 0.10 / innerShell 0.12（§4.2.0 模板定值对齐）
    mattressMat.emissiveIntensity = GLOW.mattress * p;
    innerShellMat.emissiveIntensity = GLOW.innerShell * p;
    // ③ 屏幕自发光标量（draft §2.4：color 0.30+0.70×power；黄昏档 interiorPower≈0.85 时接近全亮）
    for (const screen of refs.screens) {
      screen.color.setScalar(0.3 + 0.7 * p);
    }
    // ④ 车内暖光点光：1.15×power×emphasis（docs/03 §4.2.0 模板逐字；blend 平滑，激活/完成时 blend=1）
    const target = FILL_LIGHT.gain * p * clamp(emphasis, 0, 2);
    refs.fillLight.intensity = THREE.MathUtils.lerp(refs.fillLight.intensity, target, b);
  },
};

/* ============================== 模块装配（§3.3.3 注册行见 registry.ts；label「A型大巴」） ============================== */

export const classA: VehicleModule = {
  id: 'classA',
  label: 'A型大巴',
  buildExterior,
  buildDeployment,
  buildInterior,
  interiorLightHooks,
};
