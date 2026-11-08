// docs/01-整体架构.md §3.2 content/vehicles/overlandTruck.ts —— 3.5 越野皮卡+车顶帐篷（16 named/RTT 双壳/LED 串/全地形胎）。T27 落点。
// docs/03-车型模块.md §4.2.0 共通约定（对位/四大手法/三件套/玻璃三档/内饰灯光钩子模板/布料天气挂点/
//   vehicleKit 部件库）+ §4.2.5 车型五全文；细部几何配方与 named 键表取 docs/drafts/12-车型模块.md
//   §7.1–§7.5（【3.5-1…9】逐条落点）；docs/05 §7.1.4 灯点定值（LED 串 blink 2.5s stagger 错相；
//   车内小顶灯 steady 0.35；车顶探照灯 steady 0.3 且不给 rotate——旋转扫动是场景探照灯专属语义）；
//   docs/04 §5.5（paintCar/glass 差异强制点：军绿+哑光黑+橙警示，渲染层零车型分支）。
//
// ★ 实现期裁定（如实登记，见 openIssues 同源项）：
//   ① draft §7.1「车身 profileExtrude x −2.6→2.6（货斗段同体）」：货斗若随主侧影一体挤出，斗内为实心——
//     【3.5-4】货斗四件（油桶/水箱/工具箱/折叠桌板）将不可见。本实现取「双排舱+引擎盖一体 profileExtrude
//     （含双排侧窗真开洞 ×2 贯通双侧）+ 货斗分件拼装（左右栏板/前板/尾门/斗底板）」：斗内开敞、载物可见，
//     x 包络与 draft 一致（−2.6→2.6）。轮廓读法等效，记框架性偏差。
//   ② draft §7.1「上壳斜撑 −165°（形成 12° 顶）」符号约定随铰链位形而异：本实现铰链取基座后缘、闭态上壳
//     沿 +X 平放，上翻角取 +168°（=180°−12°），展开后上壳沿 −X 斜撑、恰成 12° 顶并覆盖下壳 1.35 外伸段
//     （−165° 直接套用会与下壳穿模；12° 顶为 draft 标明结果值）。
//   ③ draft §7.3 named 表 14 行（crateA/B 记 2）合计 15 组，§7.3/§4.2.5/§8.2 三处口径均为 16——补
//     `interiorFloor`（双排舱地板，同 C 型 named 地板惯例，支撑细节只增不减）凑足 16，并在验收脚本逐键核对。
//   ④ footprint 按车体计 5.2×2.3（docs/03 §4.2.5 定值）；帐篷外伸后视觉包络 ≈6.3（draft 估 6.6），
//     外接半径 hypot(3.3,1.15)≈3.49 ≤4.2★半径仲裁、≤海崖 4.0，不触发越界告警（Director 按 footprint 口径核对）。
//
// 依赖纪律（§3.3.6）：只 import core 契约（vehicles/types）+ shared + geom 部件库 + render 工厂；
//   零 import 场景/时间/天气注册表（D2：功率经 applyInteriorLight 下发，本模块不读时间）。
// 无人物红线（一.6/Q5）：全模块无人形几何；「手持对讲机」按 Q5 拍板为摆放后座床台的道具（无人持握）。
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
import type { ClothHandle, LampHandle, RGB, SharedAssets, WeatherSurface } from '@/systems/handles';
import { toonMaterials } from '@/render/toonMaterial';
import { hardenEdges, lathe, roundedBox, tube } from '@/geom/primitives';
import { InstancedGroup } from '@/geom/instanced';
import { createGaugeCluster, createScreenPanel, createWheelGeometries } from '@/geom/parts/vehicleKit';
import {
  createCargoNetParts,
  createJerryCanGeometry,
  createLadderGeometry,
  createLedStringParts,
  createMapOpenGeometry,
  createMapRollGeometry,
  createRoofRackParts,
  createRoofTent,
  createShadeSail,
  createSleepingBagGeometry,
  createToolboxGeometry,
} from '@/geom/parts/vehicles/overlandTruck';
import { clamp } from '@/shared/math';

/* ============================== 定值（docs/03 §4.2.5 + draft §7.1–§7.5） ============================== */

/** 越野皮卡三色板（军绿 #5b6650 + 灰黑哑光 #3a3f45 + 橙警示 #e07a2a【3.5-9】硬朗整洁）。 */
const COLORS = {
  body: '#5b6650',
  skirt: '#3a3f45',
  matteBlack: '#2e3236',
  hazard: '#e07a2a',
  floorRubber: '#2e3033',
  khaki: '#c2b28a',
  military: '#6a7562',
  gunmetal: '#43484e',
  orangeAccent: '#e07a2a',
  warmLight: '#ffb066',
  coolScreen: '#9fd8d0',
  tailLamp: '#ff5a4d',
  markerLamp: '#ffb84d',
  headLamp: '#ffe9c4',
  chassis: '#33373c',
  tire: '#26262b',
  hub: '#8f939a',
  shell: '#8e9484',
  innerShell: '#7e8773',
} satisfies Record<string, RGB>;

/** 几何框架（车体接地：轮胎外缘最低点=局部 y0；docs/03 §4.2.0「+X=车头、+Y=上、+Z=左」）。 */
const F = {
  wheelR: 0.5, wheelW: 0.34, wheelZ: 0.93, axleF: 1.45, axleR: -1.55,
  bodyBottom: 0.92, // 升高底盘：车身上抬 0.28（标准皮卡 sill ≈0.64 → 0.92，大缝腔读法）
  bedX0: -2.6, bedX1: -0.02, bedFloorTop: 1.06, bedRailTop: 1.62, bedHalfW: 1.15, bedWallT: 0.07,
  cabX0: 0.02, cabRoofEnd: 1.72, cabRoofY: 2.02, cabHalfW: 1.06,
  hoodX1: 2.6, hoodTopY: 1.7, wsTopX: 1.72, wsBaseX: 2.14, wsBaseY: 1.74,
  winY0: 1.3, winY1: 1.86, winRearX0: 0.3, winRearX1: 0.85, winFrontX0: 1.05, winFrontX1: 1.6,
  frameTop: 0.78,
  rackX0: -1.88, rackX1: 0.12, rackHalfW: 0.65, deckTop: 2.14,
  tentHingeX: -1.83,
  ladderFootX: -3.59, // 登车梯落地（梯顶挂钩 −3.18,2.06；梯长 2.1 斜撑）
  sailInnerZ: 0.68, sailInnerY: 2.18, sailOuterZ: 2.376, sailOuterY: 1.12, sailCX: -0.3,
  floorY: 1.12, ceilY: 1.92, platformTop: 1.48,
} as const;

/** 布料定值（docs/03 §4.2.5：帐篷侧布 stiffness 0.8/windFactor 1.0；遮阳幕 0.4/1.0；§2.5 透光/emissive）。 */
const CLOTH = {
  tent: { stiffness: 0.8, windFactor: 1.0, sagAmp: 0.04 },
  sail: { stiffness: 0.4, windFactor: 1.0, sagAmp: 0.05 },
  glow: 0.55, // 帐布透光 emissiveIntensity = 0.55×power（docs/03 §4.2.0 帐帘/纱帘透光行）
} as const;
/** glowTags（对齐 C 型口径：床品 0.10 / innerShell 0.12；帐布 0.55 见 CLOTH.glow）。 */
const GLOW = { bag: 0.1, innerShell: 0.12 } as const;
/** 灯点（draft §7.4 定值：LED blink gain 0.9 周期 2.5s stagger 错相；小顶灯 steady 0.35；探照灯 steady 0.3 不 rotate）。
 *  authored 基值 = 1.4×gain（R-P3-1 注③ 同 C 型口径：LightBreath 注册期快照 authored）。 */
const LAMPS = { authored: 1.4, ledGain: 0.9, ledPeriod: 2.5, ledStagger: 0.4, ledDuty: 0.6, ceilGain: 0.35, searchGain: 0.3 } as const;

/** 车内暖光点光（draft §7.4：位驾驶舱后 (0.6,1.5,0)、distance 4；docs/03 §4.2.0 模板强度 1.15×power×emphasis）。 */
const FILL_LIGHT = { position: [0.6, 1.5, 0], color: COLORS.warmLight, distance: 4.0, decay: 1.8, gain: 1.15 } as const;

/** footprint（docs/03 §4.2.5：5.2×2.3 车体计；帐篷外伸视觉包络见文件头裁定④）。 */
const FOOTPRINT = { length: 5.2, width: 2.3, track: F.wheelZ * 2, height: 2.75 } as const;

/** PaintSpec（军绿基色+橙警示条 v 区间按车身 y 0.92..2.02 换算：(y−0.92)/1.10）。 */
const STRIPE_SPEC: readonly PaintStripe[] = [{ color: COLORS.hazard, from: 0.355, to: 0.4 }];

/** 16 个 named 键（draft §7.3 键表 14 行 crateA/B 记 2 = 15 + interiorFloor 补齐 = 16，见文件头裁定③）。 */
const NAMED_KEYS = [
  'dashLCD', 'centerScreen', 'gaugeCluster', 'sleepPlatform', 'sleepingBag', 'unfoldedMap', 'mapRoll',
  'radioHandset', 'cargoNet', 'molleBoard', 'floorMat', 'crateA', 'crateB', 'thermos', 'grabHandle', 'interiorFloor',
] as const;

/* ============================== 跨构建共享态（同一模块闭包，同 classC refs 模式） ============================== */

interface OverlandRefs {
  lampHandles: LampHandle[];
  fabricMesh: THREE.Mesh | null;
  fillLight: THREE.PointLight;
  screens: THREE.MeshBasicMaterial[];
  sailAssembly: THREE.Group | null;
  tentGroup: THREE.Group | null;
  ladder: THREE.Mesh | null;
}

const refs: OverlandRefs = {
  lampHandles: [],
  fabricMesh: null,
  fillLight: new THREE.PointLight(COLORS.warmLight, 0, FILL_LIGHT.distance, FILL_LIGHT.decay),
  screens: [],
  sailAssembly: null,
  tentGroup: null,
  ladder: null,
};

/* ============================== 小工具（Canvas 贴图 / 圆角轮廓 / halo / 雪壳） ============================== */

type CanvasDraw = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

/** Canvas 程序化贴图（docs/04 §5.4；经 ctx.assets.texture 缓存与引用计数；同 classC 模式）。 */
function paintCanvasTexture(key: string, w: number, h: number, draw: CanvasDraw, transparent = false): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(2, w);
  canvas.height = Math.max(2, h);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error(`[overlandTruck] 无法获取 2d 上下文 ${key}`);
  try {
    draw(ctx, canvas.width, canvas.height);
  } catch (err) {
    console.warn(`[overlandTruck] 贴图绘制失败，降级留白 ${key}`, err);
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

/** 顶点圆角多边形轮廓（同 classC：radii 逐角；用于车身侧影/洞形 Shape/Path）。 */
function roundedPolygon(target: THREE.Path, points: readonly (readonly [number, number])[], radii: readonly number[]): void {
  const n = points.length;
  const pt = (i: number): THREE.Vector2 => {
    const p = points[((i % n) + n) % n];
    if (!p) throw new Error('[overlandTruck] 轮廓点越界');
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

/* ============================== 程序化贴图（texBodyTruck / texDashCool / texScreenNav / texScreenMap / texGauze / texWeaveShade / texHazard） ============================== */

/** texBodyTruck（军绿底+灰黑下裙+橙警示细腰线+门缝竖线；v 按 (y−0.92)/1.10 对位，canvas 行=(1−v)×h）。 */
function drawBodyTruck(ctx: CanvasRenderingContext2D, w: number, h: number, doorSeams: readonly number[]): void {
  ctx.fillStyle = COLORS.body;
  ctx.fillRect(0, 0, w, h);
  // 灰黑下裙（v 0..0.30 → 车身 y 0.92..1.25）
  ctx.fillStyle = COLORS.skirt;
  ctx.fillRect(0, (1 - 0.3) * h, w, 0.3 * h);
  // 橙警示细腰线（v 0.355..0.40 → y 1.31..1.36）
  ctx.fillStyle = COLORS.hazard;
  ctx.fillRect(0, (1 - 0.4) * h, w, 0.045 * h);
  // 军绿面微噪（硬派哑光颗粒感）
  ctx.fillStyle = 'rgba(0,0,0,0.08)';
  for (let i = 0; i < 40; i++) ctx.fillRect((w * ((i * 53) % 97)) / 97, (h * ((i * 29) % 61)) / 61, 3, 3);
  // 门缝竖线 ×2（双排舱两门）
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  for (const seam of doorSeams) ctx.fillRect(seam * w, (1 - 0.92) * h, Math.max(2, w * 0.006), h * 0.8);
}

/** texDashCool（draft §2.6：深灰面板+发光刻度弧+指针，冷青变体——gaugeCluster style 'cool' 承担）。 */
function drawDashCool(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = '#22262b';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = COLORS.coolScreen;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(w * 0.28, h * 0.62, h * 0.4, Math.PI * 0.85, Math.PI * 1.95);
  ctx.stroke();
  ctx.strokeStyle = '#dce8ea';
  ctx.lineWidth = 2;
  for (let i = 0; i < 9; i++) {
    const a = Math.PI * (0.85 + (1.1 * i) / 8);
    ctx.beginPath();
    ctx.moveTo(w * 0.28 + Math.cos(a) * h * 0.33, h * 0.62 - Math.sin(a) * h * 0.33);
    ctx.lineTo(w * 0.28 + Math.cos(a) * h * 0.42, h * 0.62 - Math.sin(a) * h * 0.42);
    ctx.stroke();
  }
  ctx.strokeStyle = '#bfe8e2';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(w * 0.28, h * 0.62);
  ctx.lineTo(w * 0.28 + Math.cos(Math.PI * 1.45) * h * 0.34, h * 0.62 - Math.sin(Math.PI * 1.45) * h * 0.34);
  ctx.stroke();
  ctx.fillStyle = COLORS.hazard;
  ctx.fillRect(w * 0.6, h * 0.26, w * 0.32, h * 0.48);
  ctx.fillStyle = '#22262b';
  ctx.fillRect(w * 0.63, h * 0.32, w * 0.26, h * 0.12);
}

/** texScreenNav（draft §2.6：抽象 UI 色块行，128²，冷青变体）。 */
function drawScreenNav(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = '#1d2a30';
  ctx.fillRect(0, 0, w, h);
  const rows: readonly (readonly [string, number])[] = [
    [COLORS.coolScreen, 0.34], [COLORS.hazard, 0.2], ['#7a8a6a', 0.26], [COLORS.coolScreen, 0.14],
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

/** texScreenMap（draft §2.6：等高线+路线虚线，256²——摊开的地图 mapOpen 铺满）。 */
function drawScreenMap(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = '#e8e0cc';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(90,110,80,0.55)';
  ctx.lineWidth = 1.5;
  for (let ring = 0; ring < 5; ring++) {
    ctx.beginPath();
    for (let i = 0; i <= 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      const r = 18 + ring * 16 + Math.sin(a * 3 + ring) * 6;
      const x = w * 0.38 + Math.cos(a) * r;
      const y = h * 0.42 + Math.sin(a) * r * 0.8;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.strokeStyle = COLORS.hazard;
  ctx.lineWidth = 3;
  ctx.setLineDash([8, 6]);
  ctx.beginPath();
  ctx.moveTo(w * 0.08, h * 0.82);
  ctx.quadraticCurveTo(w * 0.4, h * 0.5, w * 0.9, h * 0.24);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = COLORS.hazard;
  ctx.beginPath();
  ctx.arc(w * 0.9, h * 0.24, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#5a6a58';
  ctx.fillRect(w * 0.06, h * 0.06, w * 0.2, h * 0.08);
}

/** texGauze（draft §2.6：2px 网格线 alpha——网兜 cargoNet）。 */
function drawGauze(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(40,44,40,0.9)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 8; i++) {
    const t = (i / 8) * w;
    ctx.beginPath();
    ctx.moveTo(t, 0);
    ctx.lineTo(t, h);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, (i / 8) * h);
    ctx.lineTo(w, (i / 8) * h);
    ctx.stroke();
  }
}

/** texWeaveShade（draft §2.6：斜织纹半透 alpha——侧边遮阳幕）。 */
function drawWeaveShade(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(240,238,228,0.85)';
  ctx.lineWidth = 3;
  for (let i = -h; i < w + h; i += 7) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + h, h);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(30,36,30,0.5)';
  ctx.lineWidth = 2;
  for (let i = -h; i < w + h; i += 7) {
    ctx.beginPath();
    ctx.moveTo(i + h, 0);
    ctx.lineTo(i, h);
    ctx.stroke();
  }
}

/** texHazard（货斗沿警示斜纹 Canvas——draft §7.1 PaintSpec 行：橙黑斜纹）。 */
function drawHazard(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = COLORS.hazard;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#1c1c1e';
  for (let i = -h; i < w + h; i += 18) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 9, 0);
    ctx.lineTo(i + 9 + h, h);
    ctx.lineTo(i + h, h);
    ctx.closePath();
    ctx.fill();
  }
}

/* ============================== ① buildExterior（docs/03 §4.2.5 外部清单 3.5-1…5） ============================== */

function buildExterior(ctx: VehicleBuildContext): VehicleExterior {
  const { assets } = ctx;
  const group = new THREE.Group();
  group.name = 'overlandTruck/exterior';
  refs.lampHandles = [];
  refs.fabricMesh = null;
  refs.screens = [];
  refs.sailAssembly = null;
  refs.tentGroup = null;
  refs.ladder = null;

  /* —— 材质（工厂唯一着色路径；描边：车身/货斗板开反壳，玻璃/帐布/小件 noOutline）—— */
  const bodyTexture = assets.texture('overlandTruck/tex/body', () =>
    paintCanvasTexture('overlandTruck/tex/body', 512, 256, (c, w, h) => drawBodyTruck(c, w, h, [0.42, 0.72])),
  );
  bodyTexture.repeat.set(1 / (F.hoodX1 - F.cabX0), 1 / (F.cabRoofY - F.bodyBottom));
  bodyTexture.offset.set(-F.cabX0 / (F.hoodX1 - F.cabX0), -F.bodyBottom / (F.cabRoofY - F.bodyBottom));
  const bodySideMat = toonMaterials.get('paintCar', { color: COLORS.body, map: bodyTexture, name: 'overlandTruck/body-side' });
  const bodyPlainMat = toonMaterials.get('paintCar', { color: COLORS.body, name: 'overlandTruck/body-plain' });
  const bedMat = toonMaterials.get('paintCar', { color: COLORS.body, name: 'overlandTruck/bed' });
  const chassisMat = toonMaterials.get('concrete', { color: COLORS.chassis, name: 'overlandTruck/chassis' });
  const matteBlackMat = toonMaterials.get('matteProp', { color: COLORS.matteBlack, name: 'overlandTruck/matte-black' });
  const tireMat = toonMaterials.get('matteProp', { color: COLORS.tire, name: 'overlandTruck/tire' });
  const hubMat = toonMaterials.get('metal', { color: COLORS.hub, name: 'overlandTruck/hub' });
  const fenderMat = toonMaterials.get('paintCar', { color: COLORS.matteBlack, name: 'overlandTruck/fender' });
  const metalMat = toonMaterials.get('metal', { color: '#8f939a', name: 'overlandTruck/metal' });
  const darkDetailMat = toonMaterials.get('matteProp', { color: COLORS.gunmetal, outline: false, name: 'overlandTruck/detail-dark' });
  const tailLampMat = toonMaterials.getToon('matteProp', { color: '#5a1f1a', emissive: COLORS.tailLamp, emissiveIntensity: 0.9, name: 'overlandTruck/tail-lamp' });
  const markerLampMat = toonMaterials.getToon('matteProp', { color: '#6a4a20', emissive: COLORS.markerLamp, emissiveIntensity: 0.8, name: 'overlandTruck/marker-lamp' });
  const headLampMat = toonMaterials.getToon('matteProp', { color: '#6a5a30', emissive: COLORS.headLamp, emissiveIntensity: 0.5, name: 'overlandTruck/head-lamp' });
  const glassClearMat = toonMaterials.get('glass', { color: '#bcd8e8', opacity: GLASS_OPACITY.clear, name: 'overlandTruck/glass-clear' });
  glassClearMat.side = THREE.DoubleSide; // 三件套：玻璃 DoubleSide（docs/03 §4.2.1；唯一 name 缓存键内改）
  const glassTintedMat = toonMaterials.get('glass', { color: '#9fc4d8', opacity: GLASS_OPACITY.tinted, name: 'overlandTruck/glass-tinted' });
  glassTintedMat.side = THREE.DoubleSide;

  /* —— 双排舱+引擎盖：侧影 profileExtrude，双排侧窗真开洞 ×2 贯通双侧（【3.5-1】；texBodyTruck 贴两侧围 cap）—— */
  const cabShape = new THREE.Shape();
  roundedPolygon(cabShape, [
    [F.cabX0, F.bodyBottom], [F.cabX0, F.cabRoofY], [F.cabRoofEnd, F.cabRoofY], [F.wsBaseX, F.wsBaseY],
    [F.hoodX1, F.hoodTopY], [F.hoodX1, F.bodyBottom],
  ], [0.05, 0.1, 0.1, 0.14, 0.08, 0.1]);
  cabShape.holes.push(roundedRectPath(F.winRearX0, F.winY0, F.winRearX1, F.winY1, 0.09));
  cabShape.holes.push(roundedRectPath(F.winFrontX0, F.winY0, F.winFrontX1, F.winY1, 0.09));
  const cabMesh = new THREE.Mesh(
    assets.geometry('overlandTruck/cab-profile', () => {
      const geometry = new THREE.ExtrudeGeometry(cabShape, { depth: F.cabHalfW * 2, bevelEnabled: false, curveSegments: 8, steps: 1 });
      geometry.translate(0, 0, -F.cabHalfW);
      geometry.computeVertexNormals();
      return geometry;
    }),
    [bodySideMat, bodyPlainMat], // 组 0=两侧围 cap（贴军绿裙纹理），组 1=顶/底/前后沿（素色）
  );
  cabMesh.name = 'overlandTruck/cab';
  cabMesh.castShadow = true;
  group.add(cabMesh);

  /* —— 货斗分件拼装（裁定①）：斗底板+左右栏板+前板+尾门+栏板顶警示条（【3.5-1】【3.5-4】开斗体量）—— */
  const bedFloor = new THREE.Mesh(
    assets.geometry('overlandTruck/bed-floor', () => {
      const geometry = hardenEdges(roundedBox({ width: F.bedX1 - F.bedX0 - 0.04, height: 0.06, depth: F.bedHalfW * 2 - 0.16, radius: 0.015 }));
      geometry.translate((F.bedX0 + F.bedX1) / 2, F.bedFloorTop - 0.03, 0);
      return geometry;
    }),
    chassisMat,
  );
  bedFloor.name = 'overlandTruck/bed-floor';
  bedFloor.castShadow = true;
  group.add(bedFloor);
  const wallSideGeometry = assets.geometry('overlandTruck/bed-wall-side', () => {
    const geometry = hardenEdges(roundedBox({ width: F.bedX1 - F.bedX0, height: F.bedRailTop - F.bedFloorTop, depth: F.bedWallT, radius: 0.012 }));
    geometry.translate((F.bedX0 + F.bedX1) / 2, (F.bedRailTop + F.bedFloorTop) / 2, 0);
    return geometry;
  });
  const wallEndGeometry = assets.geometry('overlandTruck/bed-wall-end', () => {
    const geometry = hardenEdges(roundedBox({ width: F.bedWallT, height: F.bedRailTop - F.bedFloorTop, depth: F.bedHalfW * 2, radius: 0.012 }));
    geometry.translate(0, (F.bedRailTop + F.bedFloorTop) / 2, 0);
    return geometry;
  });
  for (const side of [-1, 1]) {
    const wall = new THREE.Mesh(wallSideGeometry, bedMat);
    wall.name = `overlandTruck/bed-wall/${side}`;
    wall.position.z = side * (F.bedHalfW - F.bedWallT / 2);
    wall.castShadow = true;
    group.add(wall);
  }
  const bedFront = new THREE.Mesh(wallEndGeometry, bedMat);
  bedFront.name = 'overlandTruck/bed-wall-front';
  bedFront.position.x = F.bedX1 - F.bedWallT / 2;
  bedFront.castShadow = true;
  group.add(bedFront);
  const tailgate = new THREE.Mesh(wallEndGeometry, bedMat);
  tailgate.name = 'overlandTruck/bed-tailgate';
  tailgate.position.x = F.bedX0 + F.bedWallT / 2;
  tailgate.castShadow = true;
  group.add(tailgate);
  // 栏板顶警示斜纹条 ×3（draft §7.1 PaintSpec 行：货斗沿警示斜纹 Canvas）
  const hazardTexture = assets.texture('overlandTruck/tex/hazard', () => paintCanvasTexture('overlandTruck/tex/hazard', 64, 64, drawHazard));
  hazardTexture.repeat.set(9, 1);
  const hazardMat = toonMaterials.get('paintTrim', { map: hazardTexture, name: 'overlandTruck/hazard-cap' });
  const capSideGeometry = assets.geometry('overlandTruck/hazard-cap-side', () => {
    const geometry = hardenEdges(roundedBox({ width: F.bedX1 - F.bedX0 + 0.06, height: 0.05, depth: F.bedWallT + 0.02, radius: 0.01 }));
    geometry.translate((F.bedX0 + F.bedX1) / 2, 0, 0);
    return geometry;
  });
  const capEndGeometry = assets.geometry('overlandTruck/hazard-cap-end', () => {
    const geometry = hardenEdges(roundedBox({ width: F.bedWallT + 0.02, height: 0.05, depth: F.bedHalfW * 2, radius: 0.01 }));
    return geometry;
  });
  for (const side of [-1, 1]) {
    const cap = new THREE.Mesh(capSideGeometry, hazardMat);
    cap.name = `overlandTruck/hazard-cap/${side}`;
    cap.position.set(0, F.bedRailTop + 0.025, side * (F.bedHalfW - F.bedWallT / 2));
    group.add(cap);
  }
  const tailCap = new THREE.Mesh(capEndGeometry, hazardMat);
  tailCap.name = 'overlandTruck/hazard-cap-tail';
  tailCap.position.set(F.bedX0 + F.bedWallT / 2, F.bedRailTop + 0.025, 0);
  group.add(tailCap);

  /* —— 升高底盘：大缝腔+外露悬挂（【3.5-1】车身上抬 0.28 读法）—— */
  const frameRailGeometry = assets.geometry('overlandTruck/frame-rail', () => hardenEdges(roundedBox({ width: 4.9, height: 0.14, depth: 0.12, radius: 0.02 })));
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(frameRailGeometry, chassisMat);
    rail.name = `overlandTruck/frame-rail/${side}`;
    rail.position.set(-0.05, F.frameTop + 0.07, side * 0.62);
    rail.castShadow = true;
    group.add(rail);
  }
  const axleGeometry = assets.geometry('overlandTruck/axle', () => hardenEdges(new THREE.CylinderGeometry(0.05, 0.05, 1.98, 10).rotateX(Math.PI / 2)));
  for (const x of [F.axleF, F.axleR]) {
    const axle = new THREE.Mesh(axleGeometry, chassisMat);
    axle.name = `overlandTruck/axle/${x}`;
    axle.position.set(x, F.wheelR, 0);
    group.add(axle);
    const diff = new THREE.Mesh(assets.geometry('overlandTruck/diff', () => hardenEdges(roundedBox({ width: 0.34, height: 0.22, depth: 0.24, radius: 0.04 }))), chassisMat);
    diff.name = `overlandTruck/diff/${x}`;
    diff.position.set(x + (x > 0 ? 0.1 : -0.1), F.wheelR - 0.02, 0);
    group.add(diff);
  }
  // 外露减震 ×4 斜置（斜面薄筒：轴端向 frame 倾 32°）
  const shockGeometry = assets.geometry('overlandTruck/shock', () => {
    const shock = new THREE.CylinderGeometry(0.035, 0.042, 0.48, 8);
    shock.translate(0, 0.24, 0);
    return hardenEdges(shock);
  });
  for (const x of [F.axleF, F.axleR]) {
    for (const side of [-1, 1]) {
      const shock = new THREE.Mesh(shockGeometry, matteBlackMat);
      shock.name = `overlandTruck/shock/${x}/${side}`;
      shock.position.set(x, F.wheelR + 0.06, side * 0.78);
      shock.rotation.x = side * -0.55; // 顶端向内倾（斜置外露悬挂）
      group.add(shock);
    }
  }
  // 前后下护板（斜面薄盒）
  const skidGeometry = assets.geometry('overlandTruck/skid', () => hardenEdges(roundedBox({ width: 0.85, height: 0.05, depth: 1.4, radius: 0.02 })));
  const skidFront = new THREE.Mesh(skidGeometry, metalMat);
  skidFront.name = 'overlandTruck/skid-front';
  skidFront.position.set(2.0, 0.66, 0);
  skidFront.rotation.z = 0.12;
  group.add(skidFront);
  const skidRear = new THREE.Mesh(skidGeometry, metalMat);
  skidRear.name = 'overlandTruck/skid-rear';
  skidRear.position.set(-0.7, 0.64, 0);
  skidRear.rotation.z = -0.1;
  group.add(skidRear);

  /* —— 前后保险杠（哑光黑）+ 格栅 + 大灯 ×2 —— */
  const bumperGeometry = assets.geometry('overlandTruck/bumper', () => hardenEdges(roundedBox({ width: 0.3, height: 0.24, depth: 2.2, radius: 0.04 })));
  const bumperFront = new THREE.Mesh(bumperGeometry, matteBlackMat);
  bumperFront.name = 'overlandTruck/bumper-front';
  bumperFront.position.set(2.72, 0.86, 0);
  bumperFront.castShadow = true;
  group.add(bumperFront);
  const bumperRear = new THREE.Mesh(bumperGeometry, matteBlackMat);
  bumperRear.name = 'overlandTruck/bumper-rear';
  bumperRear.position.set(-2.68, 0.84, 0);
  bumperRear.castShadow = true;
  group.add(bumperRear);
  const grille = new THREE.Mesh(assets.geometry('overlandTruck/grille', () => hardenEdges(roundedBox({ width: 0.05, height: 0.32, depth: 1.0, radius: 0.02 }))), matteBlackMat);
  grille.name = 'overlandTruck/grille';
  grille.position.set(2.62, 1.3, 0);
  group.add(grille);
  const headGeometry = assets.geometry('overlandTruck/head-lamp', () => hardenEdges(new THREE.CylinderGeometry(0.11, 0.11, 0.06, 12).rotateZ(Math.PI / 2)));
  for (const side of [-1, 1]) {
    const lamp = new THREE.Mesh(headGeometry, headLampMat);
    lamp.name = `overlandTruck/head-lamp/${side}`;
    lamp.position.set(2.63, 1.3, side * 0.62);
    group.add(lamp);
  }

  /* —— 全地形胎轮组 wheel(0.50,0.34,'at') ×4（五车最大胎径，18 只绕周凸块；§5.6 InstancedGroup）—— */
  const wheelGeometries = createWheelGeometries(assets, 'vehicleKit/wheel/overland', { radius: F.wheelR, width: F.wheelW, kind: 'at' });
  const tires = new InstancedGroup(wheelGeometries.tire, tireMat, { capacity: 4, withShell: { width: 0.02 }, name: 'overlandTruck/wheel-tires' });
  const hubs = new InstancedGroup(wheelGeometries.hub, hubMat, { capacity: 4, withShell: { width: 0.02 }, name: 'overlandTruck/wheel-hubs' });
  const wheelMatrix = new THREE.Matrix4();
  for (const [x, z] of [[F.axleF, F.wheelZ], [F.axleF, -F.wheelZ], [F.axleR, F.wheelZ], [F.axleR, -F.wheelZ]] as const) {
    wheelMatrix.identity().setPosition(x, F.wheelR, z);
    tires.add(wheelMatrix, COLORS.tire);
    hubs.add(wheelMatrix, COLORS.hub);
  }
  group.add(tires.group, hubs.group);

  /* —— 加宽轮眉 ×4（弧形挤出盖 AT 胎）+ 侧踏管 ×2 —— */
  const fenderShape = new THREE.Shape();
  fenderShape.moveTo(0.68, 0);
  fenderShape.absarc(0, 0, 0.68, 0, Math.PI, false);
  fenderShape.lineTo(-0.56, 0);
  fenderShape.absarc(0, 0, 0.56, Math.PI, 0, true);
  fenderShape.closePath();
  const fenderGeometry = assets.geometry('overlandTruck/fender', () => {
    const geometry = new THREE.ExtrudeGeometry(fenderShape, { depth: 0.44, bevelEnabled: false, curveSegments: 10, steps: 1 });
    geometry.translate(0, 0, -0.22);
    return geometry;
  });
  for (const [x, z] of [[F.axleF, F.wheelZ], [F.axleF, -F.wheelZ], [F.axleR, F.wheelZ], [F.axleR, -F.wheelZ]] as const) {
    const fender = new THREE.Mesh(fenderGeometry, fenderMat);
    fender.name = `overlandTruck/fender/${x}/${z}`;
    fender.position.set(x, F.wheelR, z);
    fender.castShadow = true;
    group.add(fender);
  }
  const stepTubeGeometry = assets.geometry('overlandTruck/step-tube', () => hardenEdges(new THREE.CylinderGeometry(0.035, 0.035, 1.8, 10).rotateZ(Math.PI / 2)));
  const stepBracketGeometry = assets.geometry('overlandTruck/step-bracket', () => hardenEdges(roundedBox({ width: 0.06, height: 0.2, depth: 0.05, radius: 0.01 })));
  for (const side of [-1, 1]) {
    const tube_ = new THREE.Mesh(stepTubeGeometry, matteBlackMat);
    tube_.name = `overlandTruck/step-tube/${side}`;
    tube_.position.set(0.95, 0.6, side * 0.98);
    group.add(tube_);
    for (const x of [0.25, 1.65]) {
      const bracket = new THREE.Mesh(stepBracketGeometry, chassisMat);
      bracket.name = `overlandTruck/step-bracket/${side}/${x}`;
      bracket.position.set(x, 0.7, side * 0.98);
      group.add(bracket);
    }
  }

  /* —— 呼吸管：A 柱 3 段弯管+顶口帽（越野标志细节，【3.5-1】draft §7.1）—— */
  const snorkel = new THREE.Mesh(
    assets.geometry('overlandTruck/snorkel', () =>
      tube({
        pointsOrCurve: [
          new THREE.Vector3(1.62, 1.02, 1.09),
          new THREE.Vector3(1.76, 1.55, 1.09),
          new THREE.Vector3(1.84, 2.08, 1.09),
          new THREE.Vector3(1.85, 2.14, 1.09),
        ],
        radius: 0.042,
        tubularSegments: 16,
      }),
    ),
    matteBlackMat,
  );
  snorkel.name = 'overlandTruck/snorkel';
  snorkel.castShadow = true;
  group.add(snorkel);
  const snorkelHead = new THREE.Mesh(assets.geometry('overlandTruck/snorkel-head', () => hardenEdges(roundedBox({ width: 0.12, height: 0.1, depth: 0.1, radius: 0.02 }))), matteBlackMat);
  snorkelHead.name = 'overlandTruck/snorkel-head';
  snorkelHead.position.set(1.86, 2.19, 1.09);
  group.add(snorkelHead);

  /* —— 前挡斜玻璃（斜面分面手法：Plane 顺风窗斜率外偏；tinted 档）—— */
  const windshield = new THREE.Mesh(
    assets.geometry('overlandTruck/windshield', () => {
      const geometry = new THREE.PlaneGeometry(1.84, 0.5, 1, 1);
      // 局部 X(宽1.84)→车宽向 Z、局部 Y(高0.5)→风窗斜率向 (0.832,−0.554)、法线→(0.554,0.832,0)（斜率 (1.72,2.02)→(2.14,1.74)）
      geometry.rotateY(-Math.PI / 2);
      geometry.rotateZ(-2.159);
      geometry.computeVertexNormals();
      return geometry;
    }),
    glassTintedMat,
  );
  windshield.name = 'overlandTruck/windshield';
  windshield.position.set(1.938, 1.892, 0);
  windshield.renderOrder = 20;
  windshield.userData.noOutline = true;
  group.add(windshield);

  /* —— 可透视窗（洞形 ShapeGeometry 外偏 0.012；双排四窗全 clear——差异矩阵「最素」口径【3.5-6】）—— */
  const windows: WindowSpec[] = [{ mesh: windshield, tint: 'tinted', label: 'front' }];
  const paneGeometry = (x0: number, y0: number, x1: number, y1: number, r: number, id: string): THREE.BufferGeometry =>
    assets.geometry(id, () => {
      const shape = new THREE.Shape();
      roundedPolygon(shape, [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], [r, r, r, r]);
      return new THREE.ShapeGeometry(shape, 6);
    });
  const addSidePane = (x0: number, x1: number, z: number, id: string, label: string): void => {
    const pane = new THREE.Mesh(paneGeometry(x0, F.winY0, x1, F.winY1, 0.09, id), glassClearMat);
    pane.name = id;
    pane.position.z = z;
    pane.renderOrder = 20;
    pane.userData.noOutline = true;
    group.add(pane);
    windows.push({ mesh: pane, tint: 'clear', label });
  };
  addSidePane(F.winRearX0, F.winRearX1, F.cabHalfW + 0.012, 'overlandTruck/glass-side-l-rear', 'side-l-rear');
  addSidePane(F.winFrontX0, F.winFrontX1, F.cabHalfW + 0.012, 'overlandTruck/glass-side-l-front', 'side-l-front');
  addSidePane(F.winRearX0, F.winRearX1, -(F.cabHalfW + 0.012), 'overlandTruck/glass-side-r-rear', 'side-r-rear');
  addSidePane(F.winFrontX0, F.winFrontX1, -(F.cabHalfW + 0.012), 'overlandTruck/glass-side-r-front', 'side-r-front');

  /* —— 车顶行李架平台 roofRack(2.0,1.3)+网格条 ×7（RTT 基座【3.5-2】；前腿落舱顶/后腿落货斗栏板）—— */
  const rackParts = createRoofRackParts(assets, 'overlandTruck/roofRack', {
    length: 2.0, width: 1.3, legFront: 0.12, legRear: 0.52, strips: 7,
  });
  const rackFrame = new THREE.Mesh(rackParts.frameGeometry, matteBlackMat);
  rackFrame.name = 'overlandTruck/roof-rack';
  rackFrame.position.set((F.rackX0 + F.rackX1) / 2, F.deckTop, 0);
  rackFrame.castShadow = true;
  group.add(rackFrame);
  const rackDeckMat = toonMaterials.get('metal', { color: COLORS.gunmetal, name: 'overlandTruck/rack-deck' });
  const rackStrips = new THREE.Mesh(rackParts.stripsGeometry, rackDeckMat);
  rackStrips.name = 'overlandTruck/roof-rack-strips';
  rackStrips.position.set((F.rackX0 + F.rackX1) / 2, F.deckTop, 0);
  group.add(rackStrips);

  /* —— 车顶帐篷 RTT（已展开：基座+上壳斜撑 12° 顶+下壳外伸 1.35+三面褶皱侧布+防雨檐【3.5-2】）—— */
  const tent = createRoofTent(assets, 'overlandTruck', {
    baseLength: 1.5, baseHeight: 0.22, baseWidth: 1.25, extension: 1.35, roofAngleDeg: 12, pleats: 6,
  });
  tent.group.name = 'overlandTruck/rtt';
  tent.group.position.set(F.tentHingeX, F.deckTop, 0);
  group.add(tent.group);
  refs.tentGroup = tent.group;
  refs.fabricMesh = tent.fabricMesh;
  // 帐布 authored 透光基值重写（裁定④ 同源：LightBreath 注册期快照 authored；钩子写 0.55×power）
  tent.fabricMaterial.emissiveIntensity = CLOTH.glow;
  // 上壳顶雪壳（继承 12° 倾角——M4 snowShell，visible=false 待 snowCover 驱动）
  const tentSnow = new THREE.Mesh(
    assets.geometry('overlandTruck/snow-rtt-top', () => new THREE.PlaneGeometry(1.5, 1.29, 4, 3).rotateX(-Math.PI / 2)),
    makeSnowShellMaterial('overlandTruck/snow-rtt-top/mat'),
  );
  tentSnow.name = 'overlandTruck/snow-rtt-top';
  tentSnow.position.set(0.75, 0.072, 0);
  tentSnow.userData.noOutline = true;
  tentSnow.visible = false;
  tent.topShellGroup.add(tentSnow);

  /* —— 帐篷边 LED 灯串 ledString 沿下壳外缘 10 灯（【3.5-2】；draft §7.4 灯光主角 blink 2.5s stagger）—— */
  const ledMat = toonMaterials.getToon('matteProp', {
    color: '#5a3a1a', emissive: COLORS.warmLight, emissiveIntensity: LAMPS.authored * LAMPS.ledGain, outline: false, name: 'overlandTruck/led-bulb',
  });
  const ledParts = createLedStringParts(assets, 'overlandTruck/led', {
    points: [
      new THREE.Vector3(F.tentHingeX - 0.07, F.deckTop - 0.13, 0.575),
      new THREE.Vector3(F.tentHingeX - 1.3, F.deckTop - 0.13, 0.575),
      new THREE.Vector3(F.tentHingeX - 1.3, F.deckTop - 0.13, -0.575),
      new THREE.Vector3(F.tentHingeX - 0.07, F.deckTop - 0.13, -0.575),
    ],
    bulbs: 10,
  });
  const ledWire = new THREE.Mesh(ledParts.wireGeometry, darkDetailMat);
  ledWire.name = 'overlandTruck/led-wire';
  group.add(ledWire);
  const ledBulbs = new InstancedGroup(ledParts.bulbGeometry, ledMat, { capacity: ledParts.bulbMatrices.length, name: 'overlandTruck/led-bulbs' });
  for (const matrix of ledParts.bulbMatrices) ledBulbs.add(matrix, COLORS.warmLight);
  group.add(ledBulbs.group);
  const ledHalo = makeHaloSprite(assets, 'overlandTruck/led-halo', 0.9, COLORS.warmLight);
  ledHalo.position.set(F.tentHingeX - 0.7, F.deckTop + 0.1, 0);
  group.add(ledHalo);
  // 灯点句柄（draft §7.4：LED blink gain 0.9 周期 2.5s stagger 错相；句柄于 buildExterior 产出，顶灯由 buildInterior 补入）
  refs.lampHandles.push({
    emissiveMat: ledMat, halo: ledHalo, mode: 'blink',
    params: { period: LAMPS.ledPeriod, duty: LAMPS.ledDuty, stagger: LAMPS.ledStagger },
  } satisfies LampHandle);

  /* —— 登车梯 ladder(2.1,5) 从下壳外缘斜落地（【3.5-2】DeploymentPart kind 'step'）—— */
  const tentLadder = new THREE.Mesh(
    createLadderGeometry(assets, 'overlandTruck/ladder', { height: 2.1, rungs: 5, width: 0.44 }),
    matteBlackMat,
  );
  tentLadder.name = 'overlandTruck/tent-ladder';
  tentLadder.position.set(F.ladderFootX, 0, 0);
  tentLadder.rotation.z = -0.196; // 梯顶挂钩 ≈(−3.18, 2.06) 下壳外缘
  tentLadder.castShadow = true;
  group.add(tentLadder);
  refs.ladder = tentLadder;

  /* —— 侧边遮阳幕：双立杆+斜张 Plane(2.8,2.0)+texWeaveShade α0.6（【3.5-3】DeploymentPart kind 'awning'）—— */
  const weaveTexture = assets.texture('overlandTruck/tex/weave', () => paintCanvasTexture('overlandTruck/tex/weave', 128, 128, drawWeaveShade, true));
  const sail = createShadeSail(assets, 'overlandTruck', { length: 2.8, slant: 2.0, map: weaveTexture, poleHeight: 1.16, name: 'overlandTruck/sail' });
  const sailAssembly = new THREE.Group();
  sailAssembly.name = 'overlandTruck/sail-assembly';
  sailAssembly.add(sail.polesGroup, sail.sailMesh);
  sail.polesGroup.position.set(F.sailCX, 0, F.sailOuterZ - 0.03);
  // 幕布斜张：内缘高 (z0.68,y2.18) → 外缘低 (z2.376,y1.12)；局部 +Y=内缘方向
  sail.sailMesh.position.set(F.sailCX, (F.sailInnerY + F.sailOuterY) / 2, (F.sailInnerZ + F.sailOuterZ) / 2);
  sail.sailMesh.rotation.x = -1.012; // 局部 +Y → (0, cosα, sinα)=(0,0.53,−0.848)：32° 下俯斜张
  group.add(sailAssembly);
  refs.sailAssembly = sailAssembly;

  /* —— 货斗四件（【3.5-4】：油桶/水箱/toolbox/折叠桌板，错位摆放全落斗内）—— */
  const jerryCan = new THREE.Mesh(
    createJerryCanGeometry(assets, 'overlandTruck/jerryCan', { height: 0.42, width: 0.34, depth: 0.24 }),
    toonMaterials.get('paintTrim', { color: '#b3541e', name: 'overlandTruck/jerry-can' }),
  );
  jerryCan.name = 'overlandTruck/jerry-can';
  jerryCan.position.set(-2.25, F.bedFloorTop, 0.72);
  jerryCan.rotation.y = 0.12;
  jerryCan.castShadow = true;
  group.add(jerryCan);
  // 水箱（roundedBox+透明水位条）
  const waterTank = new THREE.Mesh(
    assets.geometry('overlandTruck/water-tank', () => {
      const geometry = hardenEdges(roundedBox({ width: 0.72, height: 0.38, depth: 0.4, radius: 0.04 }));
      geometry.translate(0, 0.19, 0);
      return geometry;
    }),
    toonMaterials.get('matteProp', { color: '#4a5a68', name: 'overlandTruck/water-tank' }),
  );
  waterTank.name = 'overlandTruck/water-tank';
  waterTank.position.set(-1.5, F.bedFloorTop, -0.6);
  waterTank.rotation.y = -0.08;
  waterTank.castShadow = true;
  group.add(waterTank);
  const tankGlassMat = toonMaterials.get('glass', { color: '#9fd0e0', opacity: 0.45, name: 'overlandTruck/tank-level' });
  tankGlassMat.side = THREE.DoubleSide;
  const tankLevel = new THREE.Mesh(assets.geometry('overlandTruck/tank-level', () => new THREE.PlaneGeometry(0.6, 0.2)), tankGlassMat);
  tankLevel.name = 'overlandTruck/tank-level';
  tankLevel.position.set(-1.5, F.bedFloorTop + 0.24, -0.39);
  tankLevel.rotation.y = Math.PI;
  tankLevel.renderOrder = 20;
  tankLevel.userData.noOutline = true;
  group.add(tankLevel);
  const bedToolbox = new THREE.Mesh(
    createToolboxGeometry(assets, 'overlandTruck/bedToolbox', { width: 0.5, height: 0.22, depth: 0.28 }),
    toonMaterials.get('paintTrim', { color: COLORS.hazard, name: 'overlandTruck/bed-toolbox' }),
  );
  bedToolbox.name = 'overlandTruck/bed-toolbox';
  bedToolbox.position.set(-0.62, F.bedFloorTop, 0.68);
  bedToolbox.rotation.y = -0.18;
  bedToolbox.castShadow = true;
  group.add(bedToolbox);
  // 折叠桌板（收折态薄盒+折腿，挂斗左侧内壁）
  const foldTable = new THREE.Group();
  foldTable.name = 'overlandTruck/fold-table';
  const tableBoard = new THREE.Mesh(
    assets.geometry('overlandTruck/fold-board', () => hardenEdges(roundedBox({ width: 0.85, height: 0.5, depth: 0.045, radius: 0.015 }))),
    toonMaterials.get('wood', { color: '#7a6a4e', name: 'overlandTruck/fold-board' }),
  );
  tableBoard.name = 'overlandTruck/fold-board';
  tableBoard.position.set(-1.35, F.bedFloorTop + 0.28, 1.03);
  foldTable.add(tableBoard);
  const legGeometry = assets.geometry('overlandTruck/fold-leg', () => hardenEdges(roundedBox({ width: 0.03, height: 0.44, depth: 0.03, radius: 0.008 })));
  for (const x of [-0.32, 0.32]) {
    const leg = new THREE.Mesh(legGeometry, metalMat);
    leg.name = `overlandTruck/fold-leg/${x}`;
    leg.position.set(-1.35 + x, F.bedFloorTop + 0.28, 1.0);
    leg.rotation.x = Math.PI / 2 - 0.12; // 折腿收拢贴板
    foldTable.add(leg);
  }
  group.add(foldTable);

  /* —— 车侧爬梯 ladder(1.7,4) 贴尾左（【3.5-5】）—— */
  const sideLadder = new THREE.Mesh(
    createLadderGeometry(assets, 'overlandTruck/sideLadder', { height: 1.7, rungs: 4, width: 0.4 }),
    matteBlackMat,
  );
  sideLadder.name = 'overlandTruck/side-ladder';
  sideLadder.position.set(-2.3, 0.04, 1.19); // 梯面(XY 平面)贴尾左侧壁(z 1.15 外偏 0.04)
  sideLadder.castShadow = true;
  group.add(sideLadder);

  /* —— 车顶探照灯：前缘灯体+碗口+光晕 sprite（【3.5-5】；steady 0.3 不给 rotate——场景探照灯专属语义）—— */
  const searchGroup = new THREE.Group();
  searchGroup.name = 'overlandTruck/search-light';
  const searchBase = new THREE.Mesh(assets.geometry('overlandTruck/search-base', () => hardenEdges(new THREE.CylinderGeometry(0.085, 0.095, 0.12, 10))), matteBlackMat);
  searchBase.name = 'overlandTruck/search-base';
  searchBase.position.set(0.02, F.deckTop + 0.06, 0.3);
  searchGroup.add(searchBase);
  const searchBowl = new THREE.Mesh(
    assets.geometry('overlandTruck/search-bowl', () => {
      const profile: [number, number][] = [[0.02, 0], [0.09, 0.02], [0.115, 0.1], [0.115, 0.13], [0.09, 0.12], [0.02, 0.03]];
      const geometry = lathe({ profile, segments: 12 });
      geometry.rotateZ(-(Math.PI / 2 - 0.26)); // 碗口朝 +X 仰 15°
      return geometry;
    }),
    metalMat,
  );
  searchBowl.name = 'overlandTruck/search-bowl';
  searchBowl.position.set(0.12, F.deckTop + 0.2, 0.3);
  searchGroup.add(searchBowl);
  const searchLensMat = toonMaterials.getToon('matteProp', {
    color: '#6a5a30', emissive: COLORS.headLamp, emissiveIntensity: LAMPS.authored * LAMPS.searchGain, outline: false, name: 'overlandTruck/search-lens',
  });
  const searchLens = new THREE.Mesh(assets.geometry('overlandTruck/search-lens', () => new THREE.CircleGeometry(0.1, 12)), searchLensMat);
  searchLens.name = 'overlandTruck/search-lens';
  searchLens.position.set(0.21, F.deckTop + 0.235, 0.3);
  searchLens.rotation.y = 0.26; // 随碗口仰 15°
  searchGroup.add(searchLens);
  const searchHalo = makeHaloSprite(assets, 'overlandTruck/search-halo', 0.5, COLORS.headLamp);
  searchHalo.position.set(0.3, F.deckTop + 0.26, 0.3);
  searchGroup.add(searchHalo);
  group.add(searchGroup);
  // 灯点句柄（draft §7.4：探照灯 steady 0.3，不给 rotate——旋转扫动是场景探照灯专属语义，避免与避难所混淆）
  refs.lampHandles.push({
    emissiveMat: searchLensMat, halo: searchHalo, mode: 'steady', params: {},
  } satisfies LampHandle);

  /* —— 尾灯 ×2 / 示廓灯 ×3（静态 emissive，非 interiorLightHooks 车内灯位，同 classC 口径）—— */
  const tailGeometry = assets.geometry('overlandTruck/tail-lamp', () => hardenEdges(roundedBox({ width: 0.06, height: 0.3, depth: 0.1, radius: 0.02 })));
  for (const side of [-1, 1]) {
    const tail = new THREE.Mesh(tailGeometry, tailLampMat);
    tail.name = `overlandTruck/tail-lamp/${side}`;
    tail.position.set(F.bedX0 - 0.02, 1.3, side * (F.bedHalfW - F.bedWallT / 2));
    group.add(tail);
  }
  const markerGeometry = assets.geometry('overlandTruck/marker', () => hardenEdges(roundedBox({ width: 0.03, height: 0.05, depth: 0.05, radius: 0.008 })));
  for (const z of [-0.5, 0, 0.5]) {
    const marker = new THREE.Mesh(markerGeometry, markerLampMat);
    marker.name = `overlandTruck/marker/${z}`;
    marker.position.set(F.cabRoofEnd + 0.02, F.cabRoofY + 0.03, z);
    group.add(marker);
  }

  /* —— 布料句柄（docs/03 §4.2.5：cloths=帐篷侧布(0.8/1.0)+遮阳幕(0.4/1.0)；车辆不写风力代码 D3）—— */
  const cloths: ClothHandle[] = [
    {
      mesh: tent.fabricMesh,
      swayAxes: ['z'],
      stiffness: CLOTH.tent.stiffness,
      windFactor: CLOTH.tent.windFactor,
      sagAmp: CLOTH.tent.sagAmp,
    } satisfies ClothHandle,
    {
      mesh: sail.sailMesh,
      swayAxes: ['y', 'z'],
      stiffness: CLOTH.sail.stiffness,
      windFactor: CLOTH.sail.windFactor,
      sagAmp: CLOTH.sail.sagAmp,
    } satisfies ClothHandle,
  ];

  /* —— 天气挂点 ×4（draft §7.5：帐篷上壳顶 clothTop+roofTop 双注册 + 车顶平台/货斗盖板 roofTop）—— */
  const deckSnow = new THREE.Mesh(
    assets.geometry('overlandTruck/snow-rack-deck', () => new THREE.PlaneGeometry(2.0, 1.3, 4, 3).rotateX(-Math.PI / 2)),
    makeSnowShellMaterial('overlandTruck/snow-rack-deck/mat'),
  );
  deckSnow.name = 'overlandTruck/snow-rack-deck';
  deckSnow.position.set((F.rackX0 + F.rackX1) / 2, F.deckTop + 0.05, 0);
  deckSnow.userData.noOutline = true;
  deckSnow.visible = false;
  group.add(deckSnow);
  const bedSnow = new THREE.Mesh(
    assets.geometry('overlandTruck/snow-bed', () => new THREE.PlaneGeometry(2.55, 2.24, 4, 3).rotateX(-Math.PI / 2)),
    makeSnowShellMaterial('overlandTruck/snow-bed/mat'),
  );
  bedSnow.name = 'overlandTruck/snow-bed';
  bedSnow.position.set((F.bedX0 + F.bedX1) / 2, F.bedRailTop + 0.06, 0);
  bedSnow.userData.noOutline = true;
  bedSnow.visible = false;
  group.add(bedSnow);
  const weatherSurfaces: WeatherSurface[] = [
    { material: tent.fabricMaterial, kind: 'clothTop' }, // 帐篷顶布：雨天 uSag 下凹（clothTop）
    { material: tent.shellMaterial, kind: 'roofTop', snowShell: tentSnow }, // 帐篷上壳顶：积雪（roofTop）——clothTop+roofTop 双注册之一
    { material: rackDeckMat, kind: 'roofTop', snowShell: deckSnow }, // 车顶平台
    { material: hazardMat, kind: 'roofTop', snowShell: bedSnow }, // 货斗盖板（栏板顶警示条面）
  ];

  return {
    group,
    footprint: { ...FOOTPRINT },
    paint: { baseColor: COLORS.body, stripeSpec: STRIPE_SPEC, textureKeys: ['texBodyTruck', 'texHazard'], weathering: false },
    windows,
    cloths,
    weatherSurfaces,
  };
}

/* ============================== ② buildDeployment（draft §7.2：3 个 DeploymentPart，默认已展开） ============================== */

function buildDeployment(_ctx: VehicleBuildContext): readonly DeploymentPart[] {
  const tentGroup = refs.tentGroup;
  const sailAssembly = refs.sailAssembly;
  const ladder = refs.ladder;
  if (!tentGroup || !sailAssembly || !ladder) throw new Error('[overlandTruck] buildDeployment 先于 buildExterior 调用（Director 分帧序）');
  return [
    { node: tentGroup, kind: 'roofTent', deployAmount: 1 }, // RTT 双壳+侧布+防雨檐（双壳上翻外伸——五车唯一铰链翻开机构）
    { node: sailAssembly, kind: 'awning', deployAmount: 1 }, // 侧遮阳幕（张紧斜面）
    { node: ladder, kind: 'step', deployAmount: 1 }, // 帐篷登车梯（斜撑落地）
  ];
}

/* ============================== ③ buildInterior（3.5-7…9 逐项；16 named + 三件套） ============================== */

/* —— 内饰材质（工厂缓存单例；灯材质 authored 基值在 buildInterior 内重写，见 classC 裁定④ 同源）—— */

const innerShellMat = toonMaterials.getToon('matteProp', {
  color: COLORS.innerShell, outline: false, emissive: COLORS.warmLight, emissiveIntensity: 0, name: 'overlandTruck/inner-shell',
});
innerShellMat.side = THREE.BackSide; // 三件套：innerShell BackSide 暖色内壁（docs/03 §4.2.1）
const bagMat = toonMaterials.getToon('cloth', { color: '#7a8a6a', emissive: '#ff9a5a', emissiveIntensity: 0, name: 'overlandTruck/sleeping-bag' });
const ceilLampMat = toonMaterials.getToon('matteProp', {
  color: '#d8d5c8', emissive: COLORS.warmLight, emissiveIntensity: LAMPS.authored * LAMPS.ceilGain, outline: false, name: 'overlandTruck/ceil-lamp',
});
const radioScreenMat = toonMaterials.get('emissiveLamp', { color: COLORS.coolScreen, name: 'overlandTruck/radio-screen' }) as THREE.MeshBasicMaterial;

interface OverlandMaterialSet {
  military: THREE.Material;
  gunmetal: THREE.Material;
  orange: THREE.Material;
  dark: THREE.Material;
  steel: THREE.Material;
  khaki: THREE.Material;
  paper: THREE.Material;
}

function buildInteriorMaterials(assets: SharedAssets): OverlandMaterialSet {
  void assets;
  return {
    military: toonMaterials.get('matteProp', { color: COLORS.military, name: 'overlandTruck/in-military' }),
    gunmetal: toonMaterials.get('matteProp', { color: COLORS.gunmetal, name: 'overlandTruck/in-gunmetal' }),
    orange: toonMaterials.get('matteProp', { color: COLORS.orangeAccent, name: 'overlandTruck/in-orange' }),
    dark: toonMaterials.get('matteProp', { color: '#2e3033', name: 'overlandTruck/in-dark' }),
    steel: toonMaterials.get('metal', { color: '#9aa0a6', name: 'overlandTruck/in-steel' }),
    khaki: toonMaterials.get('cloth', { color: COLORS.khaki, name: 'overlandTruck/in-khaki' }),
    paper: toonMaterials.get('matteProp', { color: '#e8e0cc', name: 'overlandTruck/in-paper' }),
  };
}

function buildInterior(ctx: VehicleBuildContext): VehicleInterior {
  const { assets, rng } = ctx;
  const group = new THREE.Group();
  group.name = 'overlandTruck/interior';
  group.userData.noOutline = true; // 三件套：内饰子树整体跳过描边（§5.3）

  // —— 灯基值重写（裁定④：LightBreath 注册期快照 authored，先重写再由 Director 注册）——
  ceilLampMat.emissiveIntensity = LAMPS.authored * LAMPS.ceilGain;
  ceilLampMat.visible = true;

  const mats = buildInteriorMaterials(assets);
  const named: Record<string, THREE.Object3D> = {};
  const add = (key: (typeof NAMED_KEYS)[number], object: THREE.Object3D): void => {
    object.name = `overlandTruck/interior/${key}`;
    group.add(object);
    named[key] = object;
  };
  const box = (w: number, h: number, d: number, material: THREE.Material, id?: string): THREE.Mesh =>
    new THREE.Mesh(
      assets.geometry(id ?? `overlandTruck/furn-box|${w}x${h}x${d}`, () => hardenEdges(roundedBox({ width: w, height: h, depth: d, radius: Math.min(0.02, Math.min(w, h, d) * 0.2) }))),
      material,
    );

  /* —— 三件套 ①innerShell：双排舱缩放 0.94 圆角盒 BackSide（castShadow=false）—— */
  const shell = new THREE.Mesh(
    assets.geometry('overlandTruck/inner-shell', () => roundedBox({ width: 1.76, height: 0.94, depth: 2.0, radius: 0.08 })),
    innerShellMat,
  );
  shell.name = 'overlandTruck/interior/inner-shell';
  shell.position.set(0.98, 1.45, 0);
  group.add(shell);

  /* —— `interiorFloor` 双排舱地板（裁定③补位 named；衬胶垫读法素色）—— */
  const floor = new THREE.Mesh(
    assets.geometry('overlandTruck/interior-floor', () => new THREE.PlaneGeometry(1.8, 2.0, 1, 1).rotateX(-Math.PI / 2)),
    mats.gunmetal,
  );
  floor.name = 'overlandTruck/interior/interiorFloor';
  floor.position.set(0.98, F.floorY, 0);
  group.add(floor);
  named.interiorFloor = floor;

  /* —— `dashLCD` 全液晶仪表（宽幅一体屏 texDashCool）+ `centerScreen` 中控大屏（竖置 texScreenNav）【3.5-7】—— */
  const dashTexture = assets.texture('overlandTruck/tex/dash-cool', () => paintCanvasTexture('overlandTruck/tex/dash-cool', 256, 128, drawDashCool));
  const dashLcd = createScreenPanel({ width: 0.42, height: 0.2, map: dashTexture, name: 'overlandTruck/dash-lcd' });
  dashLcd.group.name = 'overlandTruck/interior/dashLCD';
  dashLcd.group.position.set(1.58, 1.66, 0.55);
  dashLcd.group.rotation.y = -Math.PI / 2; // 屏面朝 −X（驾驶员在 +Z 左侧）
  group.add(dashLcd.group);
  named.dashLCD = dashLcd.group;
  refs.screens.push(dashLcd.screenMaterial);

  const navTexture = assets.texture('overlandTruck/tex/screen-nav', () => paintCanvasTexture('overlandTruck/tex/screen-nav', 128, 128, drawScreenNav));
  const centerScreen = createScreenPanel({ width: 0.26, height: 0.34, map: navTexture, name: 'overlandTruck/center-screen' });
  centerScreen.group.name = 'overlandTruck/interior/centerScreen';
  centerScreen.group.position.set(1.54, 1.54, 0.02);
  centerScreen.group.rotation.y = -Math.PI / 2;
  group.add(centerScreen.group);
  named.centerScreen = centerScreen.group;
  refs.screens.push(centerScreen.screenMaterial);

  /* —— `gaugeCluster` 方向盘+座（'cool' texDashCool；驾驶位）—— */
  const gauge = createGaugeCluster({ style: 'cool', map: dashTexture, name: 'overlandTruck/gauge', wheelRadius: 0.1 });
  gauge.group.name = 'overlandTruck/interior/gaugeCluster';
  gauge.group.position.set(1.66, 1.52, 0.55);
  gauge.group.rotation.y = -Math.PI / 2;
  group.add(gauge.group);
  named.gaugeCluster = gauge.group;
  refs.screens.push(gauge.screenMaterial);

  // 中控台+副驾前支撑细节（未 named；驾驶位杯座/台面承担 thermos 落点）
  const console_ = box(0.3, 0.34, 0.42, mats.dark, 'overlandTruck/console');
  console_.position.set(1.4, F.floorY + 0.17, 0);
  group.add(console_);

  /* —— `sleepPlatform` 后座改装平台（平台板 1.5×0.10×1.35+支脚 4——后座放平成床台【3.5-8 基底】）—— */
  const platform = new THREE.Group();
  const platformBoard = box(1.5, 0.1, 1.35, mats.military, 'overlandTruck/platform-board');
  platformBoard.position.set(0.87, F.platformTop - 0.05, 0);
  platform.add(platformBoard);
  const legGeometry = assets.geometry('overlandTruck/platform-leg', () => hardenEdges(roundedBox({ width: 0.06, height: 0.26, depth: 0.06, radius: 0.01 })));
  for (const x of [0.2, 1.54]) {
    for (const z of [-0.6, 0.6]) {
      const leg = new THREE.Mesh(legGeometry, mats.dark);
      leg.name = `overlandTruck/platform-leg/${x}/${z}`;
      leg.position.set(x, F.floorY + 0.13, z);
      platform.add(leg);
    }
  }
  // 折平座椅读法支撑件 ×2（平台前缘下残留座垫盒——后座放平改装的过渡读法）
  for (const z of [-0.52, 0.52]) {
    const cushion = box(0.34, 0.14, 0.5, mats.khaki, 'overlandTruck/platform-cushion');
    cushion.position.set(1.44, F.floorY + 0.09, z);
    platform.add(cushion);
  }
  add('sleepPlatform', platform);

  /* —— `sleepingBag` 睡袋（'half' 摊一半；平台床上，glowTag 0.10）—— */
  const sleepingBag = new THREE.Mesh(
    createSleepingBagGeometry(assets, 'overlandTruck/sleepingBag', { state: 'half', rollLength: 0.7, tongueLength: 0.62 }),
    bagMat,
  );
  sleepingBag.name = 'overlandTruck/interior/sleepingBag';
  sleepingBag.position.set(0.62, F.platformTop + 0.015, 0.28);
  sleepingBag.rotation.y = 0.06 + rng.range(-0.04, 0.04);
  group.add(sleepingBag);
  named.sleepingBag = sleepingBag;

  /* —— `unfoldedMap` 摊开的地图（mapOpen：双段 Plane 微折+texScreenMap）+ `mapRoll` 卷起的地图 —— */
  const mapTexture = assets.texture('overlandTruck/tex/screen-map', () => paintCanvasTexture('overlandTruck/tex/screen-map', 256, 256, drawScreenMap));
  const paperMat = toonMaterials.get('matteProp', { color: '#e8e0cc', map: mapTexture, name: 'overlandTruck/map-paper' });
  paperMat.side = THREE.DoubleSide;
  const unfoldedMap = new THREE.Mesh(
    createMapOpenGeometry(assets, 'overlandTruck/mapOpen', { width: 0.52, depth: 0.36, foldAngle: 0.12 }),
    paperMat,
  );
  unfoldedMap.name = 'overlandTruck/interior/unfoldedMap';
  unfoldedMap.position.set(1.02, F.platformTop + 0.012, -0.32);
  unfoldedMap.rotation.x = -Math.PI / 2;
  unfoldedMap.rotation.z = 0.2 + rng.range(-0.05, 0.05);
  group.add(unfoldedMap);
  named.unfoldedMap = unfoldedMap;

  const mapRoll = new THREE.Mesh(
    createMapRollGeometry(assets, 'overlandTruck/mapRoll', { length: 0.45 }),
    paperMat,
  );
  mapRoll.name = 'overlandTruck/interior/mapRoll';
  mapRoll.position.set(0.24, F.platformTop + 0.045, -0.58);
  mapRoll.rotation.y = 0.5 + rng.range(-0.06, 0.06);
  group.add(mapRoll);
  named.mapRoll = mapRoll;

  /* —— `radioHandset` 手持对讲机（Q5 拍板：摆放后座床台的道具，无人持握——一.6；小屏 emissive 入 screens）—— */
  const radioHandset = new THREE.Group();
  const radioBody = box(0.06, 0.16, 0.04, mats.dark, 'overlandTruck/radio-body');
  radioBody.position.set(0, 0.08, 0);
  const radioAntenna = new THREE.Mesh(assets.geometry('overlandTruck/radio-antenna', () => hardenEdges(new THREE.CylinderGeometry(0.005, 0.005, 0.12, 6))), mats.steel);
  radioAntenna.name = 'overlandTruck/radio-antenna';
  radioAntenna.position.set(0, 0.21, 0);
  const radioScreen = new THREE.Mesh(assets.geometry('overlandTruck/radio-screen-plane', () => new THREE.PlaneGeometry(0.035, 0.05)), radioScreenMat);
  radioScreen.name = 'overlandTruck/radio-screen-plane';
  radioScreen.position.set(0, 0.1, 0.021);
  radioScreen.userData.noOutline = true;
  radioHandset.add(radioBody, radioAntenna, radioScreen);
  radioHandset.position.set(1.3, F.platformTop, 0.52);
  radioHandset.rotation.y = 0.4 + rng.range(-0.1, 0.1);
  radioHandset.rotation.z = -0.08; // 斜倚摆放（无人持握）
  add('radioHandset', radioHandset);
  refs.screens.push(radioScreenMat);

  /* —— `cargoNet` 杂物网兜（netPanel(0.8,0.5) 张于后舱顶缘四挂点，中部下垂弧；texGauze alpha）—— */
  const gauzeTexture = assets.texture('overlandTruck/tex/gauze', () => paintCanvasTexture('overlandTruck/tex/gauze', 64, 64, drawGauze, true));
  const gauzeMat = toonMaterials.get('cloth', { color: '#3a4038', map: gauzeTexture, opacity: 0.85, outline: false, name: 'overlandTruck/cargo-net' });
  gauzeMat.side = THREE.DoubleSide;
  const netParts = createCargoNetParts(assets, 'overlandTruck/cargoNet', { width: 0.8, height: 0.5, sag: 0.12 });
  const cargoNet = new THREE.Group();
  const netMesh = new THREE.Mesh(netParts.netGeometry, gauzeMat);
  netMesh.name = 'overlandTruck/cargo-net-mesh';
  netMesh.rotation.x = -Math.PI / 2; // 平张于舱顶：下垂弧转朝 −Y
  netMesh.userData.noOutline = true;
  cargoNet.add(netMesh);
  const netHooks = new THREE.Mesh(netParts.hookGeometry, mats.steel);
  netHooks.name = 'overlandTruck/cargo-net-hooks';
  netHooks.rotation.x = -Math.PI / 2;
  cargoNet.add(netHooks);
  cargoNet.position.set(0.72, F.ceilY - 0.02, 0);
  add('cargoNet', cargoNet);

  /* —— `molleBoard` 装备挂板（背板+横织带 ×4+附包 ×2，贴舱后壁面向 +X——尾窗/侧窗视域）—— */
  const molleBoard = new THREE.Group();
  const board = box(0.025, 0.52, 0.62, mats.military, 'overlandTruck/molle-board');
  board.position.set(0.12, 1.52, 0);
  molleBoard.add(board);
  const strapGeometry = assets.geometry('overlandTruck/molle-strap', () => hardenEdges(roundedBox({ width: 0.012, height: 0.05, depth: 0.62, radius: 0.004 })));
  for (const y of [1.34, 1.46, 1.58, 1.7]) {
    const strap = new THREE.Mesh(strapGeometry, mats.khaki);
    strap.name = `overlandTruck/molle-strap/${y}`;
    strap.position.set(0.145, y, 0);
    molleBoard.add(strap);
  }
  for (const z of [-0.18, 0.18]) {
    const pouch = new THREE.Mesh(
      assets.geometry('overlandTruck/molle-pouch', () => hardenEdges(roundedBox({ width: 0.05, height: 0.18, depth: 0.14, radius: 0.015 }))),
      mats.gunmetal,
    );
    pouch.name = `overlandTruck/molle-pouch/${z}`;
    pouch.position.set(0.16, z > 0 ? 1.6 : 1.4, z);
    molleBoard.add(pouch);
  }
  add('molleBoard', molleBoard);

  /* —— `floorMat` 橡胶地垫（薄板+横棱条，前后舱脚坑）—— */
  const floorMat = new THREE.Group();
  const matBase = box(1.4, 0.02, 1.9, mats.dark, 'overlandTruck/floormat-base');
  matBase.position.set(1.1, F.floorY + 0.012, 0);
  floorMat.add(matBase);
  const ribGeometry = assets.geometry('overlandTruck/floormat-rib', () => hardenEdges(roundedBox({ width: 1.3, height: 0.014, depth: 0.05, radius: 0.004 })));
  for (let i = 0; i < 5; i++) {
    const rib = new THREE.Mesh(ribGeometry, mats.dark);
    rib.name = `overlandTruck/floormat-rib/${i}`;
    rib.position.set(1.1, F.floorY + 0.03, -0.7 + i * 0.35);
    floorMat.add(rib);
  }
  add('floorMat', floorMat);

  /* —— `crateA`/`crateB` 装备箱 ×2（toolbox() 变体大小两件，平台尾端叠放）—— */
  const crateA = new THREE.Mesh(
    createToolboxGeometry(assets, 'overlandTruck/crateA', { width: 0.42, height: 0.2, depth: 0.3 }),
    mats.gunmetal,
  );
  crateA.name = 'overlandTruck/interior/crateA';
  crateA.position.set(0.3, F.platformTop, -0.42);
  crateA.rotation.y = 0.1 + rng.range(-0.03, 0.03);
  group.add(crateA);
  named.crateA = crateA;
  const crateB = new THREE.Mesh(
    createToolboxGeometry(assets, 'overlandTruck/crateB', { width: 0.3, height: 0.15, depth: 0.24 }),
    mats.orange,
  );
  crateB.name = 'overlandTruck/interior/crateB';
  crateB.position.set(0.29, F.platformTop, 0.02); // 与 crateA 并排落平台尾端（避免压提手）
  crateB.rotation.y = -0.14 + rng.range(-0.03, 0.03);
  group.add(crateB);
  named.crateB = crateB;

  /* —— `thermos` 保温壶（Cylinder+杯盖，中控台侧）—— */
  const thermos = new THREE.Group();
  const thermosBody = new THREE.Mesh(assets.geometry('overlandTruck/thermos-body', () => lathe({ profile: [[0.03, 0], [0.048, 0.01], [0.048, 0.2], [0.036, 0.24], [0.036, 0.26]], segments: 10 })), mats.steel);
  thermosBody.name = 'overlandTruck/thermos-body';
  thermosBody.position.set(1.34, 1.46, 0.14);
  const thermosCup = new THREE.Mesh(assets.geometry('overlandTruck/thermos-cup', () => lathe({ profile: [[0.03, 0], [0.05, 0], [0.05, 0.04], [0.044, 0.04]], segments: 10 })), mats.dark);
  thermosCup.name = 'overlandTruck/thermos-cup';
  thermosCup.position.set(1.46, 1.46, -0.08);
  thermos.add(thermosBody, thermosCup);
  add('thermos', thermos);

  /* —— `grabHandle` 拉手（弯管 torus 弧段，副驾前 A 柱内侧）—— */
  const grabHandle = new THREE.Mesh(
    assets.geometry('overlandTruck/grab-handle', () => {
      const arc = new THREE.TorusGeometry(0.065, 0.011, 6, 12, Math.PI);
      arc.rotateY(Math.PI / 2); // 环面转贴侧壁（开口朝下）
      return hardenEdges(arc);
    }),
    mats.steel,
  );
  grabHandle.name = 'overlandTruck/interior/grabHandle';
  grabHandle.position.set(1.72, 1.7, -0.93);
  group.add(grabHandle);
  named.grabHandle = grabHandle;

  /* —— `ceilLamp` 车内小顶灯（吸顶小盘+乳白罩；steady 0.35★draft §7.4）—— */
  const ceilLamp = new THREE.Group();
  const ceilBase = new THREE.Mesh(assets.geometry('overlandTruck/ceil-lamp-base', () => lathe({ profile: [[0.02, 0], [0.09, 0], [0.09, 0.02], [0.08, 0.05], [0, 0.05]], segments: 12 })), mats.dark);
  ceilBase.name = 'overlandTruck/ceil-lamp-base';
  ceilBase.position.set(0.9, F.ceilY - 0.01, 0);
  ceilBase.rotation.x = Math.PI;
  const ceilBulb = new THREE.Mesh(assets.geometry('overlandTruck/ceil-lamp-bulb', () => new THREE.SphereGeometry(0.06, 10, 8)), ceilLampMat);
  ceilBulb.name = 'overlandTruck/ceil-lamp-bulb';
  ceilBulb.position.set(0.9, F.ceilY - 0.08, 0);
  const ceilHalo = makeHaloSprite(assets, 'overlandTruck/ceil-lamp-halo', 0.55, COLORS.warmLight);
  ceilHalo.position.copy(ceilBulb.position);
  ceilLamp.add(ceilBase, ceilBulb, ceilHalo);
  group.add(ceilLamp); // 小顶灯不入 named（draft §7.3 键表无顶灯行；16 named 口径见文件头裁定③）

  /* —— 灯点句柄（draft §7.4：LED 串 blink 2.5s stagger + 小顶灯 steady 0.35 + 探照灯 steady 0.3 不 rotate；
   *  LED/探照灯句柄于 buildExterior 产出（外部灯体），此处补顶灯——D2 唯一驱动链统一交 LightBreath）—— */
  refs.lampHandles.push(
    { emissiveMat: ceilLampMat, halo: ceilHalo, mode: 'steady', params: {} } satisfies LampHandle,
  );

  /* —— 车内暖光点光（全局 ≤2 点光预算之「车内暖光」位；强度经 applyInteriorLight 下发）—— */
  const fillLight = new THREE.PointLight(COLORS.warmLight, 0, FILL_LIGHT.distance, FILL_LIGHT.decay);
  fillLight.name = 'overlandTruck/fill-light';
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
    if (!named[key]) throw new Error(`[overlandTruck] named 键缺失：${key}`);
  }
  return { group, named };
}

/* ============================== ④ interiorLightHooks（D2 唯一驱动链；docs/03 §4.2.5 钩子模板） ============================== */

/**
 * 可透视窗透明度目标（clear 0.24 / tinted 0.40 → 夜间随 interiorPower 插值降至 0.22，docs/04 §5.5）。
 * 经工厂同名缓存键取用——与 buildExterior 内玻璃材质为同一实例（改一处全场生效）。
 */
const windowGlassTargets: readonly { readonly material: THREE.MeshToonMaterial; readonly base: number }[] = [
  { material: toonMaterials.getToon('glass', { color: '#bcd8e8', opacity: GLASS_OPACITY.clear, name: 'overlandTruck/glass-clear' }), base: GLASS_OPACITY.clear },
  { material: toonMaterials.getToon('glass', { color: '#9fc4d8', opacity: GLASS_OPACITY.tinted, name: 'overlandTruck/glass-tinted' }), base: GLASS_OPACITY.tinted },
];

/** 帐布材质单例（与 createRoofTent 同缓存键=同一实例；透光 emissiveIntensity 经钩子写入）。 */
const fabricMatRef = toonMaterials.getToon('cloth', {
  color: '#c2b28a', emissive: '#ffb066', emissiveIntensity: 0, outline: false, name: 'overlandTruck/rtt/fabric',
});

const interiorLightHooks: InteriorLightHooks = {
  get lamps(): readonly LampHandle[] {
    // 每次构建由 buildExterior（LED/探照灯）+ buildInterior（顶灯）重写（halo 精灵/句柄随构建刷新）
    return refs.lampHandles;
  },
  applyInteriorLight(power: number, emphasis: number, blend: number): void {
    const p = clamp(power, 0, 1);
    const b = clamp(blend, 0, 1);
    // ① 车窗透明度随 interiorPower 向 0.22 插值（docs/03 §4.2.0 玻璃三档行；车内暖光透出增强冷暖对比）
    for (const target of windowGlassTargets) {
      target.material.opacity = target.base + (GLASS_NIGHT_OPACITY - target.base) * p;
    }
    // ② glowTags：睡袋 0.10 / innerShell 0.12（对齐 C 型定值口径）
    bagMat.emissiveIntensity = GLOW.bag * p;
    innerShellMat.emissiveIntensity = GLOW.innerShell * p;
    // ③ 帐布透光 0.55×power（docs/03 §4.2.0 帐帘/纱帘透光行「透过布料洇出来」；WindSystem 注册期克隆材质——双写同步）
    const fabricGlow = CLOTH.glow * p;
    fabricMatRef.emissiveIntensity = fabricGlow;
    const liveFabric = refs.fabricMesh?.material;
    if (liveFabric instanceof THREE.MeshToonMaterial && liveFabric !== fabricMatRef) {
      liveFabric.emissiveIntensity = fabricGlow;
    }
    // ④ 屏幕自发光标量（draft §2.4：color 0.30+0.70×power；dashLCD+centerScreen+radioHandset 冷青微光）
    for (const screen of refs.screens) {
      screen.color.setScalar(0.3 + 0.7 * p);
    }
    // ⑤ 车内暖光点光：1.15×power×emphasis（docs/03 §4.2.0 模板逐字；blend 平滑，激活/完成时 blend=1）
    const target = FILL_LIGHT.gain * p * clamp(emphasis, 0, 2);
    refs.fillLight.intensity = THREE.MathUtils.lerp(refs.fillLight.intensity, target, b);
  },
};

/* ============================== 模块装配（§3.3.3 注册行见 registry.ts；label「越野皮卡」） ============================== */

export const overlandTruck: VehicleModule = {
  id: 'overlandTruck',
  label: '越野皮卡',
  buildExterior,
  buildDeployment,
  buildInterior,
  interiorLightHooks,
};
