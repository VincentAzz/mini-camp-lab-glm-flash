// docs/01-整体架构.md §3.2 content/vehicles/trailerRig.ts —— 3.3 拖挂式房车+牵引皮卡（单一模块双主体，
//   决策 D4；T25 落点）。
// docs/03-车型模块.md §4.2.0 共通约定（对位/四大手法/三件套/玻璃三档/内饰灯光钩子模板/布料天气挂点/
//   vehicleKit 部件库）+ §4.2.3 车型三全文；细部几何配方与 named 键表取 docs/drafts/12-车型模块.md §5.0–§5.5
//   （【3.3-1…12】逐条落点）；docs/00-需求理解与核对.md 一.12「★-半径」仲裁（拖挂组合目标外接半径 ≤4.2）；
//   docs/04 §5.5（paintCar/glass 差异强制点：渲染层零车型分支，贴图/材质本模块内工厂直取）。
//
// ★ 实现期裁定（如实登记，openIssues 同步）：
//   ① ★-半径仲裁：draft §5.0 组合 9.8×2.5（外接半径 5.1）超出场景章营位半径上限 4.2 → 组合按比例回调至
//      8.0×2.5（外接半径 hypot(4.0,1.25)≈4.19≤4.2；在 4.0 半径营位仍会告警——docs/00 ★-半径行明示的
//      既定非阻断行为，R15）。皮卡 4.35 长（尾 −0.40→头 +4.00）、拖挂 3.10 长（尾 −4.00→鼻尖 −0.90）、
//      牵引杆间隙 0.50（draft 定值）。
//   ② draft §5.3 表列 11 个拖挂 named 键但记「拖挂内 10 个 named」且 docs/03 §4.2.6 记 16(10+6)——卡座
//      在两文档中均写作单键 `dinetteBenchF/R`（对坐卡座一组双凳），故 10+6=16 自洽。实现取键名
//      `dinetteBenchFR`（draft 写法含「/」，会破坏物体名路径查找/勾验），named 恰 16。
//   ③ 「分瓣法」落地：上/下扇区 Cylinder（各跨 ±55°）+ 左右侧板带洞挤出拼装（窗洞必须落在平面才可
//      Shape.holes 真开洞）；尾端以椭圆平端面盘承担「球冠」读法（球面无法开舷窗洞——真开洞优先）。
//   ④ §4.2.0「拖挂组合额外 +0.06rad 微调」按模块侧实现（exterior/interior 组自转 0.06；Director 持有
//      root 旋转权、本模块不改 director.ts 以免与 T24/T26/T27 并行冲突；归 T28 合拢裁定归属层）。
//   ⑤ liftTable（可升降小桌板）为 DeploymentPart kind 'other'（升起态）且属内饰 named——几何在
//      buildExterior 构建并存 refs，buildInterior 挂入内饰组（Director 序：deployment 先于 interior）。
//
// 依赖纪律（§3.3.6）：只 import core 契约（vehicles/types）+ shared + geom 部件库 + render 工厂；
//   零 import 场景/时间/天气注册表（D2：功率经 applyInteriorLight 下发，本模块不读时间）。
// 无人物红线（一.6）：全模块无人形几何；「驾驶舱」只有仪表/方向盘级道具，后座只有睡袋/行李道具。
// 3.3-12「车队式旅居感」落点：皮卡（载具、深蓝冷色、仪表冷青微光 ≤0.35）在前开路；拖挂（白色生活舱、
//   暖顶灯 #ffb066+暖光点光）在后跟随——一大一小、一冷一暖（勾验见 verify-t25.headless.mjs）。
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
  createGaugeCluster,
  createScreenPanel,
  createWheelGeometries,
} from '@/geom/parts/vehicleKit';
import {
  createAFrameHitch,
  createAwningAssembly,
  createFirewoodStack,
  createGasBottle,
  createJackLeg,
  createJerryCan,
  createLuggageBox,
  createSleepingBag,
  createSpareTire,
  createTrailerShellGeometries,
} from '@/geom/parts/vehicles/trailerRig';
import { clamp } from '@/shared/math';

/* ============================== 定值（docs/03 §4.2.3 + draft §5.0–§5.5） ============================== */

/** 组合色板（皮卡深蓝 #2c4a6e【3.3-1】×拖挂白 #f6f3ec+薄荷/粉线【3.3-2】；内饰复古白+薄荷+拼布【3.3-12】）。 */
const COLORS = {
  pickupBody: '#2c4a6e',
  pickupSkirt: '#22384f',
  trailerWhite: '#f6f3ec',
  bandMint: '#7fb5a3',
  bandPink: '#e8a0a8',
  chassis: '#3a3d42',
  tire: '#2b2b30',
  hub: '#b9bcc2',
  detail: '#d8d2c4',
  darkDetail: '#4a4d52',
  tailLamp: '#ff5a4d',
  headLamp: '#ffe9b8',
  markerLamp: '#ffb84d',
  innerShell: '#f0dfc4',
  floorWood: '#d9b98c',
  mint: '#9ec7bb',
  quiltA: '#7fb5a3',
  quiltB: '#e8a0a8',
  warmWhite: '#fff4e2',
  warmLight: '#ffb066',
  coldGlow: '#7fd8d0',
} satisfies Record<string, RGB>;

/** 组合几何框架（+X=皮卡车头、+Y=上、+Z=左；组合居中：皮卡尾 −0.40 / 拖挂尾 −4.00 / 皮卡头 +4.00）。 */
const F = {
  /* —— 皮卡（3.3-1；侧影一次成型）—— */
  pkTail: -0.4, pkHead: 4.0, pkHalfW: 1.0,
  pkBedRear: -0.32, pkBedFront: 0.78, pkBedRail: 1.45, pkBedFloor: 0.78,
  pkCabRear: 0.84, pkCabFront: 2.72, pkRoof: 2.02,
  pkWindBase: 3.04, pkHoodTop: 1.3, pkHoodFront: 3.9, pkBottom: 0.62,
  pkWinA: [1.1, 1.1, 1.64, 1.62] as const, // 双排侧窗真开洞 ×2（x0,y0,x1,y1；draft §5.1 y 1.10→1.62）
  pkWinB: [1.94, 1.1, 2.5, 1.62] as const,
  pkAxleF: 2.85, pkAxleR: 0.15, pkWheelZ: 1.1, pkWheelR: 0.44, pkWheelW: 0.3,
  pkFloor: 0.66,
  /* —— 拖挂（3.3-2…5；厢体局部系原点=厢体中心）—— */
  tTail: -4.0, tNoseTip: -0.9,
  tCenterX: -2.45, tCenterY: 1.52, tRadius: 1.02, tSquash: 0.88, tFlatBottom: -0.8,
  tSectionLen: 2.2, tPanelHalfX: 1.45, tPanelY: 0.72,
  tWinX0: -1.05, tWinX1: 0.85, tWinY0: -0.46, tWinY1: 0.32, tWinR: 0.1, // 厢体局部（绝对 x −3.50..−1.60 / y 1.06..1.84）
  tTailCapX: -1.55, tNoseBaseX: 1.1, tNoseTipX: 1.55,
  tPortholeU: 0.4, tPortholeV: 0.1, tPortholeR: 0.155, // 盘面系（u→−Z、v→+Y）：绝对 y 1.62 / z ∓0.40
  tAxle: -2.45, tWheelZ: 1.02, tWheelR: 0.38, tWheelW: 0.24,
  tFloor: 0.74,
  /* —— 摆位/挂点 —— */
  hitchGap: 0.5, // 牵引杆间隙（draft §5.0 定值）：皮卡尾 −0.40 ↔ 拖挂鼻尖 −0.90
  awningSpan: 3.2, awningReach: 1.7, awningSlope: 0.23, awningY: 2.1,
  headingTrim: 0.06, // docs/03 §4.2.0 拖挂组合微调（裁定④）
} as const;

/** footprint=组合尺寸（★半径仲裁回调：8.0×2.5，外接半径 hypot(4.0,1.25)≈4.19≤4.2；裁定①）。
 *  布局约束系统（本轮）：length/width 同源引用 content/layout/vehicles.ts（车身字面量唯一来源）。 */
const FOOTPRINT = { length: VEHICLE_BODIES.trailerRig.length, width: VEHICLE_BODIES.trailerRig.width, track: F.pkWheelZ * 2, height: 2.42 } as const;

/** PaintSpec（拖挂白主体+薄荷/粉线 v 区间按侧板 y0.80..2.24 换算：(y−0.80)/1.44；皮卡深蓝为副主体色）。 */
const STRIPE_SPEC: readonly PaintStripe[] = [
  { color: COLORS.bandPink, from: 0.055, to: 0.075 },
  { color: COLORS.bandMint, from: 0.09, to: 0.13 },
];

/** 16 个 named 键（draft §5.3 拖挂 10 + §5.4 皮卡 6；裁定②：dinetteBenchFR 单键=对坐卡座一组双凳）。 */
const TRAILER_KEYS = [
  'rearBed', 'kitchenette', 'trailerCabinets', 'dinetteBenchFR', 'liftTable',
  'bathPartition', 'washBasin', 'toiletBox', 'trailerWoodFloor', 'trailerCeilLamp',
] as const;
const PICKUP_KEYS = ['pickupDash', 'pickupScreen', 'pickupSteering', 'rearSleepingBag', 'rearDuffel', 'pickupFloorMat'] as const;
const NAMED_KEYS = [...TRAILER_KEYS, ...PICKUP_KEYS] as const;

/** 布料/灯点/glow 定值（docs/03 §4.2.3：棚 stiffness 0.4/windFactor 1.0·docs/05 §7.1.2；顶灯 steady 1.0
 *   暖 #ffb066；皮卡屏微光 0.35；暖光点光拖挂厢内 (−2.6,1.5,0)——draft §5.4/Q6 拍板）。 */
const CLOTH_AWNING = { stiffness: 0.4, windFactor: 1.0, sagAmp: 0.05 } as const;
const LAMPS = { ceilAuthored: 1.4, ceilGain: 1.0 } as const;
const GLOW = { mattress: 0.1, quilt: 0.08, innerShell: 0.12 } as const;
const SCREENS = { base: 0.12, gain: 0.23 } as const; // 微光标量 0.12+0.23×power（上限 0.35——draft「微光 0.35」）

/** 车内暖光点光（docs/03 §4.2.0 模板：强度 1.15×power×emphasis；docs/03 §4.2.3 位拖挂厢内 (−2.6,1.5,0)）。 */
const FILL_LIGHT = { position: [-2.6, 1.5, 0], color: COLORS.warmLight, distance: 6.0, decay: 1.8, gain: 1.15 } as const;

/* ============================== 跨构建共享态（同一模块闭包，同 classC refs 模式） ============================== */

interface TrailerRigRefs {
  jackLegs: THREE.Group | null;
  awning: { group: THREE.Group; clothMesh: THREE.Mesh; snowShell: THREE.Mesh } | null;
  liftTable: THREE.Group | null;
  lampHandles: LampHandle[];
  fillLight: THREE.PointLight;
  screens: THREE.MeshBasicMaterial[];
}

const refs: TrailerRigRefs = {
  jackLegs: null,
  awning: null,
  liftTable: null,
  lampHandles: [],
  fillLight: new THREE.PointLight(COLORS.warmLight, 0, FILL_LIGHT.distance, FILL_LIGHT.decay),
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
  if (!ctx) throw new Error(`[trailerRig] 无法获取 2d 上下文 ${key}`);
  try {
    draw(ctx, canvas.width, canvas.height);
  } catch (err) {
    console.warn(`[trailerRig] 贴图绘制失败，降级留白 ${key}`, err);
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

/** 顶点圆角多边形轮廓（逐角半径；车身侧影/洞形 Shape/Path 共用）。 */
function roundedPolygon(target: THREE.Path, points: readonly (readonly [number, number])[], radii: readonly number[]): void {
  const n = points.length;
  const pt = (i: number): THREE.Vector2 => {
    const p = points[((i % n) + n) % n];
    if (!p) throw new Error('[trailerRig] 轮廓点越界');
    return new THREE.Vector2(p[0], p[1]);
  };
  for (let i = 0; i < n; i++) {
    const prev = pt(i - 1);
    const cur = pt(i);
    const next = pt(i + 1);
    const d1 = cur.clone().sub(prev).normalize();
    const d2 = next.clone().sub(cur).normalize();
    const r = Math.min(radii[i] ?? 0.08, cur.distanceTo(prev) * 0.45, cur.distanceTo(next) * 0.45);
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

/* ============================== 程序化贴图（texTrailerBand / texWoodFloor oak / texDash 冷 / texScreenNav） ============================== */

/** texTrailerBand（draft §2.6：白底+薄荷/粉双细线+扇贝边；v 按侧板 (y−0.80)/1.44 对位，带线落窗洞以下）。 */
function drawTrailerBand(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = COLORS.trailerWhite;
  ctx.fillRect(0, 0, w, h);
  // 薄荷腰线（v 0.09..0.13）+ 粉细线（v 0.055..0.075）——canvas 行 = (1−v)×h
  ctx.fillStyle = COLORS.bandMint;
  ctx.fillRect(0, (1 - 0.13) * h, w, (0.13 - 0.09) * h);
  ctx.fillStyle = COLORS.bandPink;
  ctx.fillRect(0, (1 - 0.075) * h, w, (0.075 - 0.055) * h);
  // 扇贝边：自薄荷线下缘垂一排半圆（薄荷/粉交替）
  const scallopR = h * 0.035;
  const scallopTop = (1 - 0.09) * h;
  const count = Math.round(w / (scallopR * 2.4));
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = i % 2 === 0 ? COLORS.bandMint : COLORS.bandPink;
    ctx.beginPath();
    ctx.arc(((i + 0.5) * w) / count, scallopTop, scallopR, 0, Math.PI, false);
    ctx.fill();
  }
  // 铆钉点缀（沿顶缘）
  ctx.fillStyle = 'rgba(0,0,0,0.10)';
  for (let i = 0; i < 20; i++) {
    ctx.beginPath();
    ctx.arc((w * (i + 0.5)) / 20, h * 0.06, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** texWoodFloor oak（draft §2.6 参数化木纹：条纹+年轮弧+板缝；橡木亮色变体，同 classC oak）。 */
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

/** texDash cool（draft §2.6 色相参数化冷青变体：深灰面板+冷青刻度弧+指针——皮卡冷色仪表【3.3-12】）。 */
function drawDashCool(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = '#22262b';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = COLORS.coldGlow;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(w * 0.3, h * 0.62, h * 0.4, Math.PI * 0.85, Math.PI * 1.95);
  ctx.stroke();
  ctx.strokeStyle = '#dce8ea';
  ctx.lineWidth = 2;
  for (let i = 0; i < 9; i++) {
    const a = Math.PI * (0.85 + (1.1 * i) / 8);
    ctx.beginPath();
    ctx.moveTo(w * 0.3 + Math.cos(a) * h * 0.33, h * 0.62 - Math.sin(a) * h * 0.33);
    ctx.lineTo(w * 0.3 + Math.cos(a) * h * 0.42, h * 0.62 - Math.sin(a) * h * 0.42);
    ctx.stroke();
  }
  ctx.strokeStyle = '#bfeef0';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(w * 0.3, h * 0.62);
  ctx.lineTo(w * 0.3 + Math.cos(Math.PI * 1.62) * h * 0.34, h * 0.62 - Math.sin(Math.PI * 1.62) * h * 0.34);
  ctx.stroke();
  ctx.fillStyle = '#3d5a80';
  ctx.fillRect(w * 0.62, h * 0.28, w * 0.3, h * 0.44);
}

/** texScreenNav（draft §2.6：抽象 UI 色块行 128²，冷色 UI 面板）。 */
function drawScreenNav(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = '#1f2a33';
  ctx.fillRect(0, 0, w, h);
  const rows: readonly (readonly [string, number])[] = [
    [COLORS.coldGlow, 0.3], ['#3d5a80', 0.18], [COLORS.bandMint, 0.24], [COLORS.bandPink, 0.12],
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

/* ============================== ① buildExterior（docs/03 §4.2.3 外部清单 3.3-1…5；25 外部要素） ============================== */

function buildExterior(ctx: VehicleBuildContext): VehicleExterior {
  const { assets, rng } = ctx;
  const group = new THREE.Group();
  group.name = 'trailerRig/exterior';
  group.rotation.y = F.headingTrim; // 裁定④：拖挂组合 +0.06rad 微调（「轻微适配」示例，模块侧）
  refs.jackLegs = null;
  refs.awning = null;
  refs.liftTable = null;

  /* —— 材质（工厂唯一着色路径；描边：双主体开反壳，玻璃/小件/布 noOutline）—— */
  const pickupMat = toonMaterials.get('paintCar', { color: COLORS.pickupBody, name: 'trailerRig/pickup-body' });
  const chassisMat = toonMaterials.get('concrete', { color: COLORS.chassis, name: 'trailerRig/chassis' });
  const tireMat = toonMaterials.get('matteProp', { color: COLORS.tire, name: 'trailerRig/tire' });
  const hubMat = toonMaterials.get('metal', { color: COLORS.hub, name: 'trailerRig/hub' });
  const detailMat = toonMaterials.get('matteProp', { color: COLORS.detail, outline: false, name: 'trailerRig/detail' });
  const darkDetailMat = toonMaterials.get('matteProp', { color: COLORS.darkDetail, outline: false, name: 'trailerRig/detail-dark' });
  const headLampMat = toonMaterials.getToon('matteProp', { color: '#5a4a20', emissive: COLORS.headLamp, emissiveIntensity: 0.85, name: 'trailerRig/head-lamp' });
  const tailLampMat = toonMaterials.getToon('matteProp', { color: '#5a1f1a', emissive: COLORS.tailLamp, emissiveIntensity: 0.9, name: 'trailerRig/tail-lamp' });
  const markerLampMat = toonMaterials.getToon('matteProp', { color: '#6a4a20', emissive: COLORS.markerLamp, emissiveIntensity: 0.8, name: 'trailerRig/marker-lamp' });
  const glassClearMat = toonMaterials.get('glass', { color: '#bcd8e8', opacity: GLASS_OPACITY.clear, name: 'trailerRig/glass-clear' });
  glassClearMat.side = THREE.DoubleSide; // 三件套：玻璃 DoubleSide（唯一 name 缓存键内改）
  const glassTintedMat = toonMaterials.get('glass', { color: '#9fc4d8', opacity: GLASS_OPACITY.tinted, name: 'trailerRig/glass-tinted' });
  glassTintedMat.side = THREE.DoubleSide;
  const glassPortholeMat = toonMaterials.get('glass', { color: '#a8c8d4', opacity: GLASS_OPACITY.porthole, name: 'trailerRig/glass-porthole' });
  glassPortholeMat.side = THREE.DoubleSide;

  const pickup = new THREE.Group();
  pickup.name = 'trailerRig/pickup';
  const trailer = new THREE.Group();
  trailer.name = 'trailerRig/trailer';
  group.add(pickup, trailer);

  /* =================== 皮卡车身：侧影 profileExtrude 一次成型（3.3-1；双排侧窗真开洞两扇） =================== */
  const profile = new THREE.Shape();
  roundedPolygon(
    profile,
    [
      [F.pkTail, F.pkBottom], [F.pkTail, F.pkBedRail], [F.pkBedRear, F.pkBedRail],
      [F.pkBedRear, F.pkBedFloor], [F.pkBedFront, F.pkBedFloor], [F.pkCabRear, F.pkRoof],
      [F.pkCabFront, F.pkRoof], [F.pkWindBase, F.pkHoodTop], [F.pkHoodFront, F.pkHoodTop],
      [F.pkHoodFront, F.pkBottom],
    ],
    [0.06, 0.1, 0.05, 0.08, 0.08, 0.16, 0.16, 0.12, 0.14, 0.1],
  );
  profile.holes.push(roundedRectPath(...F.pkWinA, 0.1));
  profile.holes.push(roundedRectPath(...F.pkWinB, 0.1));
  const bodyMesh = new THREE.Mesh(
    assets.geometry('trailerRig/pickup-profile', () => {
      const geometry = new THREE.ExtrudeGeometry(profile, { depth: F.pkHalfW * 2, bevelEnabled: false, curveSegments: 8, steps: 1 });
      geometry.translate(0, 0, -F.pkHalfW);
      geometry.computeVertexNormals();
      return geometry;
    }),
    pickupMat,
  );
  bodyMesh.name = 'trailerRig/pickup-body';
  bodyMesh.castShadow = true;
  pickup.add(bodyMesh);

  /* —— 双排舱侧窗玻璃 ×4（真开洞外偏 0.012，clear）+ 前挡斜面玻璃（tinted）—— */
  const paneGeometry = (x0: number, y0: number, x1: number, y1: number, r: number, id: string): THREE.BufferGeometry =>
    assets.geometry(id, () => {
      const shape = new THREE.Shape();
      roundedPolygon(shape, [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], [r, r, r, r]);
      return new THREE.ShapeGeometry(shape, 6);
    });
  const windows: WindowSpec[] = [];
  const addCabPane = (hole: readonly [number, number, number, number], id: string): void => {
    for (const z of [F.pkHalfW + 0.012, -(F.pkHalfW + 0.012)]) {
      const pane = new THREE.Mesh(paneGeometry(hole[0], hole[1], hole[2], hole[3], 0.1, id), glassClearMat);
      pane.name = `${id}/${z.toFixed(2)}`;
      pane.position.z = z;
      pane.renderOrder = 20;
      pane.userData.noOutline = true;
      pickup.add(pane);
      windows.push({ mesh: pane, tint: 'clear', label: z > 0 ? 'cab-l' : 'cab-r' });
    }
  };
  addCabPane(F.pkWinA, 'trailerRig/glass-cab-a');
  addCabPane(F.pkWinB, 'trailerRig/glass-cab-b');

  // 前挡斜面玻璃：Plane 烘焙（G(2.72,2.02)→H(3.04,1.34) 斜面，后倾 0.4407 rad）
  const windshield = new THREE.Mesh(
    assets.geometry('trailerRig/windshield', () => {
      const geometry = new THREE.PlaneGeometry(1.72, 0.78); // 展向 Z×斜向
      geometry.rotateY(Math.PI / 2); // 展向→Z、法线 +Z→+X
      geometry.rotateZ(0.4407); // 顶缘后倾（贴合侧影斜面）
      geometry.translate(2.9, 1.69, 0);
      return geometry;
    }),
    glassTintedMat,
  );
  windshield.name = 'trailerRig/glass-windshield';
  windshield.renderOrder = 20;
  windshield.userData.noOutline = true;
  pickup.add(windshield);
  windows.push({ mesh: windshield, tint: 'tinted', label: 'front' });

  /* —— 前脸：大灯 ×2+格栅 / 尾灯 ×2 / 后视镜 ×2 / 把手 ×2 / 保险杠 ×2（3.3-1 全尺寸皮卡外观要素）—— */
  const headGeometry = assets.geometry('trailerRig/headlamp', () => hardenEdges(roundedBox({ width: 0.06, height: 0.1, depth: 0.2, radius: 0.02 })));
  for (const z of [0.62, -0.62]) {
    const head = new THREE.Mesh(headGeometry, headLampMat);
    head.name = `trailerRig/headlight/${z}`;
    head.position.set(F.pkHoodFront + 0.02, 1.02, z);
    pickup.add(head);
  }
  const grille = new THREE.Mesh(assets.geometry('trailerRig/grille', () => hardenEdges(roundedBox({ width: 0.04, height: 0.18, depth: 0.72, radius: 0.01 }))), darkDetailMat);
  grille.name = 'trailerRig/grille';
  grille.position.set(F.pkHoodFront + 0.015, 1.02, 0);
  pickup.add(grille);
  const tailGeometry = assets.geometry('trailerRig/pktaillamp', () => hardenEdges(roundedBox({ width: 0.06, height: 0.16, depth: 0.14, radius: 0.02 })));
  for (const z of [0.85, -0.85]) {
    const tail = new THREE.Mesh(tailGeometry, tailLampMat);
    tail.name = `trailerRig/pickup-taillight/${z}`;
    tail.position.set(F.pkTail - 0.015, 1.18, z);
    pickup.add(tail);
  }
  const mirrorArmGeometry = assets.geometry('trailerRig/mirror-arm', () => hardenEdges(new THREE.CylinderGeometry(0.012, 0.012, 0.22, 8).rotateX(Math.PI / 2)));
  const mirrorBoxGeometry = assets.geometry('trailerRig/mirror-box', () => hardenEdges(roundedBox({ width: 0.05, height: 0.15, depth: 0.1, radius: 0.015 })));
  for (const z of [F.pkHalfW + 0.13, -(F.pkHalfW + 0.13)]) {
    const arm = new THREE.Mesh(mirrorArmGeometry, darkDetailMat);
    arm.name = `trailerRig/mirror-arm/${z}`;
    arm.position.set(2.6, 1.9, z);
    const box = new THREE.Mesh(mirrorBoxGeometry, detailMat);
    box.name = `trailerRig/mirror/${z}`;
    box.position.set(2.6, 1.9, z + Math.sign(z) * 0.14);
    pickup.add(arm, box);
  }
  const handleGeometry = assets.geometry('trailerRig/handle', () => {
    const bar = new THREE.CylinderGeometry(0.014, 0.014, 0.14, 8);
    bar.rotateZ(Math.PI / 2);
    return hardenEdges(bar);
  });
  for (const z of [F.pkHalfW + 0.015, -(F.pkHalfW + 0.015)]) {
    const handle = new THREE.Mesh(handleGeometry, detailMat);
    handle.name = `trailerRig/door-handle/${z}`;
    handle.position.set(1.78, 1.1, z);
    pickup.add(handle);
  }
  const bumperGeometry = assets.geometry('trailerRig/pkbumper', () => hardenEdges(roundedBox({ width: 0.14, height: 0.2, depth: 2.04, radius: 0.04 })));
  for (const [x, tag] of [[3.93, 'front'], [-0.33, 'rear']] as const) {
    const bumper = new THREE.Mesh(bumperGeometry, chassisMat);
    bumper.name = `trailerRig/pickup-bumper-${tag}`;
    bumper.position.set(x, 0.6, 0);
    bumper.castShadow = true;
    pickup.add(bumper);
  }

  /* —— 货斗：地板+侧板 ×2（货斗 recess 由侧影凹口成形，补地板/侧板封仓）—— */
  const bedFloor = new THREE.Mesh(assets.geometry('trailerRig/bed-floor', () => hardenEdges(roundedBox({ width: 1.1, height: 0.05, depth: 1.88, radius: 0.02 }))), darkDetailMat);
  bedFloor.name = 'trailerRig/bed-floor';
  bedFloor.position.set((F.pkBedRear + F.pkBedFront) / 2, F.pkBedFloor - 0.025, 0);
  pickup.add(bedFloor);
  const bedWallGeometry = assets.geometry('trailerRig/bed-wall', () => hardenEdges(roundedBox({ width: 1.14, height: 0.71, depth: 0.04, radius: 0.015 })));
  for (const z of [0.98, -0.98]) {
    const wall = new THREE.Mesh(bedWallGeometry, pickupMat);
    wall.name = `trailerRig/bed-wall/${z}`;
    wall.position.set((F.pkBedRear + F.pkBedFront) / 2, 1.115, z);
    pickup.add(wall);
  }

  /* —— 货斗载物三件（3.3-1 子细节全落）：行李箱+双绑带 / 油桶 / 柴火 ×8 交错实例化—— */
  const luggage = createLuggageBox(assets, 'trailerRig');
  luggage.name = 'trailerRig/pickup-luggage';
  luggage.position.set(0.16, F.pkBedFloor, 0.3);
  luggage.rotation.y = 0.08;
  pickup.add(luggage);

  const jerryCan = createJerryCan(assets, 'trailerRig');
  jerryCan.name = 'trailerRig/pickup-jerry-can';
  jerryCan.position.set(-0.12, F.pkBedFloor, -0.45);
  pickup.add(jerryCan);

  const firewood = createFirewoodStack(assets, rng.fork('firewood'), 'trailerRig');
  firewood.name = 'trailerRig/pickup-firewood';
  firewood.position.set(0.45, F.pkBedFloor, -0.38);
  pickup.add(firewood);

  /* —— 皮卡轮组 ×4（wheel 0.44/0.30 AT 轻度凸块 12）+ 轮眉 ×4 + 排气管—— */
  // 接地修正（clip-probe LOW）：AT 凸块外缘=radius·1.1312，轮心只抬 pkWheelR 时胎底低于地面 0.058u
  //   （挂车轮为 road 胎不受影响）——皮卡轮组按「凸块触地半径」落位，轮眉随抬 0.058。
  const pkTireContactY = F.pkWheelR * 1.1312;
  const wheelGeometries = createWheelGeometries(assets, 'vehicleKit/wheel/trailerRig-pickup', {
    radius: F.pkWheelR, width: F.pkWheelW, kind: 'at', lugCount: 12,
  });
  const pkTires = new InstancedGroup(wheelGeometries.tire, tireMat, { capacity: 4, withShell: { width: 0.02 }, name: 'trailerRig/pickup-wheels' });
  const pkHubs = new InstancedGroup(wheelGeometries.hub, hubMat, { capacity: 4, withShell: { width: 0.02 }, name: 'trailerRig/pickup-hubs' });
  const wheelMatrix = new THREE.Matrix4();
  for (const x of [F.pkAxleF, F.pkAxleR]) {
    for (const z of [F.pkWheelZ, -F.pkWheelZ]) {
      wheelMatrix.identity().setPosition(x, pkTireContactY, z);
      pkTires.add(wheelMatrix, COLORS.tire);
      pkHubs.add(wheelMatrix, COLORS.hub);
    }
  }
  pickup.add(pkTires.group, pkHubs.group);
  buildFenders(assets, pickup, 'trailerRig/pk-fender', F.pkWheelR + 0.05, 0.3, [
    [F.pkAxleF, F.pkWheelZ], [F.pkAxleF, -F.pkWheelZ], [F.pkAxleR, F.pkWheelZ], [F.pkAxleR, -F.pkWheelZ],
  ], pickupMat, pkTireContactY - 0.06);
  const exhaust = new THREE.Mesh(assets.geometry('trailerRig/exhaust', () => hardenEdges(new THREE.CylinderGeometry(0.045, 0.045, 0.4, 10).rotateZ(Math.PI / 2))), hubMat);
  exhaust.name = 'trailerRig/exhaust';
  exhaust.position.set(-0.1, 0.42, -0.5);
  pickup.add(exhaust);

  /* =================== 拖挂房车（3.3-2…5；流线厢体分瓣法拼装，厢体局部系原点=厢体中心） =================== */
  const shell = createTrailerShellGeometries(assets, 'trailerRig/hull', {
    sectionLength: F.tSectionLen,
    radius: F.tRadius,
    squashY: F.tSquash,
    flatBottomY: F.tFlatBottom,
    panel: { x0: -1.5, x1: 1.4, y0: -F.tPanelY, y1: F.tPanelY },
    windowHole: { x0: F.tWinX0, x1: F.tWinX1, y0: F.tWinY0, y1: F.tWinY1, r: F.tWinR },
    tailCapX: F.tTailCapX,
    portholes: [
      { u: F.tPortholeU, v: F.tPortholeV, r: F.tPortholeR },
      { u: -F.tPortholeU, v: F.tPortholeV, r: F.tPortholeR },
    ],
    noseBaseX: F.tNoseBaseX,
    noseTipX: F.tNoseTipX,
  });

  const trailerBandTexture = assets.texture('trailerRig/tex/trailer-band', () =>
    paintCanvasTexture('trailerRig/tex/trailer-band', 512, 128, drawTrailerBand));
  // 侧板 cap UV=(局部 x,y) → repeat/offset 对位（同 classC texStripeC 手法）
  trailerBandTexture.repeat.set(1 / 2.9, 1 / (F.tPanelY * 2));
  trailerBandTexture.offset.set(1.5 / 2.9, 0.5);
  const bandPanelMat = toonMaterials.get('paintCar', { color: COLORS.trailerWhite, map: trailerBandTexture, name: 'trailerRig/hull-band-panel' });
  const hullPaintMat = toonMaterials.get('paintCar', { color: COLORS.trailerWhite, name: 'trailerRig/hull-white' });

  const hull = new THREE.Group();
  hull.name = 'trailerRig/hull';
  hull.position.set(F.tCenterX, F.tCenterY, 0);
  const topSector = new THREE.Mesh(shell.topSector, hullPaintMat);
  topSector.name = 'trailerRig/hull-top-sector';
  const bottomSector = new THREE.Mesh(shell.bottomSector, hullPaintMat);
  bottomSector.name = 'trailerRig/hull-bottom-sector';
  const panelGeometry = shell.sidePanel;
  const sidePanels: THREE.Mesh[] = [];
  for (const z of [1.028, -1.028]) {
    const panel = new THREE.Mesh(panelGeometry, [bandPanelMat, hullPaintMat]); // 组 0=两侧 cap（texTrailerBand）/ 1=板缘
    panel.name = `trailerRig/hull-panel/${z}`;
    panel.position.z = z;
    panel.castShadow = true;
    sidePanels.push(panel);
  }
  const tailCap = new THREE.Mesh(shell.tailCap, hullPaintMat);
  tailCap.name = 'trailerRig/hull-tail-cap';
  const nose = new THREE.Mesh(shell.noseShell, hullPaintMat);
  nose.name = 'trailerRig/hull-nose';
  hull.add(topSector, bottomSector, ...sidePanels, tailCap, nose);
  trailer.add(hull);

  /* —— 侧大窗玻璃 ×2（clear 主透视面 3.3-6）+ 尾部舷窗玻璃 ×2（porthole，3.3-7 外观面）—— */
  const sidePaneGeometry = assets.geometry('trailerRig/glass-side', () => {
    const shape = new THREE.Shape();
    roundedPolygon(shape, [[F.tWinX0 + 0.02, F.tWinY0 + 0.02], [F.tWinX1 - 0.02, F.tWinY0 + 0.02], [F.tWinX1 - 0.02, F.tWinY1 - 0.02], [F.tWinX0 + 0.02, F.tWinY1 - 0.02]], [0.09, 0.09, 0.09, 0.09]);
    return new THREE.ShapeGeometry(shape, 6);
  });
  for (const z of [1.045, -1.045]) {
    const pane = new THREE.Mesh(sidePaneGeometry, glassClearMat);
    pane.name = `trailerRig/glass-side/${z}`;
    pane.position.set(0, 0, z); // 厢体局部系（hull 组内）
    pane.renderOrder = 20;
    pane.userData.noOutline = true;
    hull.add(pane);
    windows.push({ mesh: pane, tint: 'clear', label: z > 0 ? 'trailer-l' : 'trailer-r' });
  }
  const portholeGeometry = assets.geometry('trailerRig/glass-porthole', () => new THREE.CircleGeometry(0.148, 16).rotateY(Math.PI / 2));
  for (const z of [F.tPortholeU, -F.tPortholeU]) {
    const porthole = new THREE.Mesh(portholeGeometry, glassPortholeMat);
    porthole.name = `trailerRig/glass-porthole/${z}`;
    porthole.position.set(F.tCenterX + F.tTailCapX - 0.045, F.tCenterY + F.tPortholeV, z);
    porthole.renderOrder = 20;
    porthole.userData.noOutline = true;
    trailer.add(porthole);
    windows.push({ mesh: porthole, tint: 'tinted', label: 'porthole' }); // 档位元数据：舷窗弱透视（材质本体 porthole 0.30）
  }

  /* —— 支撑腿 ×2（3.3-3 放下触地）：挂点=厢底 0.72、drop 0.72 → 脚盘底=局部 y0（触地基准与轮胎一致）—— */
  const jackLegs = new THREE.Group();
  jackLegs.name = 'trailerRig/jack-legs';
  for (const z of [0.42, -0.42]) {
    const leg = createJackLeg(assets, { drop: 0.72, name: 'trailerRig' });
    leg.name = `trailerRig/jack-leg/${z}`;
    leg.position.set(F.tCenterX - 1.15, 0.72, z);
    jackLegs.add(leg);
  }
  trailer.add(jackLegs);
  refs.jackLegs = jackLegs;

  /* —— 遮阳棚 awningAssembly(3.2,1.7) 右侧展开（3.3-4；ClothHandle+clothTop）—— */
  const awning = createAwningAssembly(assets, {
    span: F.awningSpan,
    reach: F.awningReach,
    slope: F.awningSlope,
    name: 'trailerRig', // 部件内组名 `${name}/awning`、布 'trailerRig/awning/cloth' 等
    clothColor: '#cfd4cf',
  });
  awning.group.position.set(-2.3, F.awningY, -1.05); // 右侧壁缘（+Z=左 → 右侧 z−）
  trailer.add(awning.group);
  refs.awning = awning;

  /* —— 燃气瓶 ×2+备胎（3.3-5 竖挂前鼻面；A 字架托盘承瓶）—— */
  const tray = new THREE.Mesh(assets.geometry('trailerRig/gas-tray', () => hardenEdges(roundedBox({ width: 0.32, height: 0.035, depth: 0.62, radius: 0.01 }))), chassisMat);
  tray.name = 'trailerRig/gas-tray';
  tray.position.set(-0.86, 0.28, 0);
  trailer.add(tray);
  for (const [tag, z] of [['left', 0.22], ['right', -0.22]] as const) {
    const bottle = createGasBottle(assets, 'trailerRig');
    bottle.name = `trailerRig/gas-bottle/${tag}`;
    bottle.position.set(-0.86, 0.298, z);
    trailer.add(bottle);
  }
  const spare = createSpareTire(assets, 'trailerRig');
  spare.name = 'trailerRig/spare-tire';
  spare.position.set(-0.98, 1.42, 0);
  trailer.add(spare);

  /* —— A 字牵引杆（拖钩：两斜管+横梁球头，3.3-1；球头落皮卡尾杠）—— */
  const hitch = createAFrameHitch(assets, { reach: 0.5, ballDrop: -0.22, name: 'trailerRig' });
  hitch.name = 'trailerRig/a-frame';
  hitch.position.set(F.tNoseTip, 0.86, 0); // 鼻根 (−0.90, 0.86) → 球头 (−0.40, 0.64)≈皮卡尾杠
  trailer.add(hitch);

  /* —— 拖挂轮组 ×2 单轴 + 挡泥板弧 ×2 + 尾灯 ×2 + 示廓灯 ×2—— */
  const tWheelGeometries = createWheelGeometries(assets, 'vehicleKit/wheel/trailerRig-trailer', {
    radius: F.tWheelR, width: F.tWheelW,
  });
  const tTires = new InstancedGroup(tWheelGeometries.tire, tireMat, { capacity: 2, withShell: { width: 0.02 }, name: 'trailerRig/trailer-wheels' });
  const tHubs = new InstancedGroup(tWheelGeometries.hub, hubMat, { capacity: 2, withShell: { width: 0.02 }, name: 'trailerRig/trailer-hubs' });
  for (const z of [F.tWheelZ, -F.tWheelZ]) {
    wheelMatrix.identity().setPosition(F.tAxle, F.tWheelR, z);
    tTires.add(wheelMatrix, COLORS.tire);
    tHubs.add(wheelMatrix, COLORS.hub);
  }
  trailer.add(tTires.group, tHubs.group);
  buildFenders(assets, trailer, 'trailerRig/t-fender', F.tWheelR + 0.09, 0.34, [
    [F.tAxle, F.tWheelZ], [F.tAxle, -F.tWheelZ],
  ], hullPaintMat);
  const tTailGeometry = assets.geometry('trailerRig/ttaillamp', () => hardenEdges(roundedBox({ width: 0.06, height: 0.14, depth: 0.12, radius: 0.02 })));
  for (const z of [0.55, -0.55]) {
    const tail = new THREE.Mesh(tTailGeometry, tailLampMat);
    tail.name = `trailerRig/trailer-taillight/${z}`;
    tail.position.set(F.tCenterX + F.tTailCapX - 0.04, 0.98, z);
    trailer.add(tail);
  }
  const markerGeometry = assets.geometry('trailerRig/marker', () => hardenEdges(roundedBox({ width: 0.04, height: 0.05, depth: 0.05, radius: 0.008 })));
  for (const z of [0.3, -0.3]) {
    const marker = new THREE.Mesh(markerGeometry, markerLampMat);
    marker.name = `trailerRig/marker/${z}`;
    marker.position.set(F.tCenterX + F.tTailCapX - 0.03, 2.14, z);
    trailer.add(marker);
  }

  /* —— 可升降小桌板（3.3-9；DeploymentPart kind 'other' 升起态——裁定⑤：此处构建、内饰组挂入）—— */
  const liftTable = new THREE.Group();
  liftTable.name = 'trailerRig/interior/liftTable';
  const tabletop = new THREE.Mesh(assets.geometry('trailerRig/lift-top', () => hardenEdges(roundedBox({ width: 0.55, height: 0.04, depth: 0.44, radius: 0.015 }))), hullPaintMat);
  tabletop.name = 'trailerRig/lift-table/tabletop';
  tabletop.position.set(0, 0.44, 0); // 升起态：桌面 = 组原点(地板)+0.44（双升降柱全伸）
  liftTable.add(tabletop);
  const columnGeometry = assets.geometry('trailerRig/lift-column', () => hardenEdges(new THREE.CylinderGeometry(0.03, 0.03, 0.42, 8)));
  for (const x of [-0.23, 0.23]) {
    const column = new THREE.Mesh(columnGeometry, hubMat);
    column.name = `trailerRig/lift-table/column/${x}`;
    column.position.set(x, 0.21, 0);
    liftTable.add(column);
  }
  refs.liftTable = liftTable;

  return {
    group,
    footprint: { ...FOOTPRINT },
    paint: {
      baseColor: COLORS.trailerWhite,
      stripeSpec: STRIPE_SPEC,
      textureKeys: ['texTrailerBand', 'texWoodFloor', 'texDash', 'texScreenNav'],
      weathering: false,
    },
    windows,
    cloths: [
      {
        mesh: awning.clothMesh,
        swayAxes: ['y', 'z'], // 棚布：垂向拍动+侧向鼓风（docs/05 §7.1.2 棚布行）
        stiffness: CLOTH_AWNING.stiffness,
        windFactor: CLOTH_AWNING.windFactor,
        sagAmp: CLOTH_AWNING.sagAmp,
        dripAnchors: [
          new THREE.Vector3(-F.awningSpan * 0.4, -F.awningReach * Math.sin(F.awningSlope), -F.awningReach * Math.cos(F.awningSlope)),
          new THREE.Vector3(F.awningSpan * 0.4, -F.awningReach * Math.sin(F.awningSlope), -F.awningReach * Math.cos(F.awningSlope)),
        ],
      } satisfies ClothHandle,
    ],
    weatherSurfaces: buildRoofWeatherSurfaces(assets, hull, trailer, hullPaintMat, shell.topSector, awning),
  };
}

/** 半环挡泥板弧挤出（轮眉；radius=外弧半径，depth=轮宽向覆盖）。 */
function buildFenders(
  assets: SharedAssets,
  host: THREE.Group,
  name: string,
  outerRadius: number,
  depth: number,
  spots: readonly (readonly [number, number])[],
  material: THREE.Material,
  centerY = 0.38,
): void {
  const shape = new THREE.Shape();
  shape.moveTo(outerRadius, 0);
  shape.absarc(0, 0, outerRadius, 0, Math.PI, false);
  shape.lineTo(-(outerRadius - 0.1), 0);
  shape.absarc(0, 0, outerRadius - 0.1, Math.PI, 0, true);
  shape.closePath();
  const geometry = assets.geometry(`${name}|geo`, () => {
    const part = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 10, steps: 1 });
    part.translate(0, 0, -depth / 2);
    return hardenEdges(part);
  });
  for (const [x, z] of spots) {
    const fender = new THREE.Mesh(geometry, material);
    fender.name = `${name}/${x}/${z}`;
    fender.position.set(x, centerY, z);
    fender.castShadow = true;
    host.add(fender);
  }
}

/** weatherSurfaces ×3（docs/03 §4.2.3：棚布 clothTop + 拖挂顶弧面 roofTop + 皮卡货斗沿口 roofTop）。 */
function buildRoofWeatherSurfaces(
  assets: SharedAssets,
  hull: THREE.Group,
  trailer: THREE.Group,
  hullMat: THREE.Material,
  topSectorGeometry: THREE.BufferGeometry,
  awning: { clothMesh: THREE.Mesh; snowShell: THREE.Mesh },
): WeatherSurface[] {
  // ① 棚布 clothTop：雪壳已挂布网格之下（createAwningAssembly）
  // ② 拖挂顶弧面 roofTop：上扇区同几何 ×1.012（随 hull 组变换）
  const hullSnowMaterial = makeSnowShellMaterial('trailerRig/snow-hull');
  const hullSnow = new THREE.Mesh(topSectorGeometry, hullSnowMaterial);
  hullSnow.name = 'trailerRig/snow-hull-top';
  hullSnow.scale.setScalar(1.012);
  hullSnow.userData.noOutline = true;
  hullSnow.visible = false; // WeatherMaterialSystem 注册后按 snowCover 驱动（docs/05 §4.4.2-M4）
  hull.add(hullSnow);
  // ③ 皮卡货斗沿口 roofTop：双 rail 顶条+尾板顶条合并为单壳（单材质单挂点）
  const rimSnowMaterial = makeSnowShellMaterial('trailerRig/snow-bedrim');
  const rimSnow = new THREE.Mesh(
    assets.geometry('trailerRig/snow-bedrim', () => {
      const railL = new THREE.PlaneGeometry(1.14, 0.07).rotateX(-Math.PI / 2).translate(0.23, 1.462, 0.97);
      const railR = new THREE.PlaneGeometry(1.14, 0.07).rotateX(-Math.PI / 2).translate(0.23, 1.462, -0.97);
      const tailgate = new THREE.PlaneGeometry(0.1, 1.94).rotateX(-Math.PI / 2).translate(-0.36, 1.462, 0);
      const merged = mergeGeometries([
        hardenEdges(railL), hardenEdges(railR), hardenEdges(tailgate),
      ]);
      if (!merged) throw new Error('[trailerRig] 货斗沿口雪壳合并失败');
      return merged;
    }),
    rimSnowMaterial,
  );
  rimSnow.name = 'trailerRig/snow-bedrim';
  rimSnow.userData.noOutline = true;
  rimSnow.visible = false;
  trailer.add(rimSnow);
  return [
    { material: (awning.clothMesh.material as THREE.Material), kind: 'clothTop', snowShell: awning.snowShell },
    { material: hullMat, kind: 'roofTop', snowShell: hullSnow },
    { material: rimSnowMaterial, kind: 'roofTop', snowShell: rimSnow },
  ];
}

/* ============================== ② buildDeployment（3.3-3/4/9：支撑腿+遮阳棚+升降桌板，默认已展开） ============================== */

function buildDeployment(_ctx: VehicleBuildContext): readonly DeploymentPart[] {
  const { jackLegs, awning, liftTable } = refs;
  if (!jackLegs || !awning || !liftTable) throw new Error('[trailerRig] buildDeployment 先于 buildExterior 调用（Director 分帧序）');
  return [
    { node: jackLegs, kind: 'jackLeg', deployAmount: 1 }, // 支撑腿 ×2 放下触地（3.3-3）
    { node: awning.group, kind: 'awning', deployAmount: 1 }, // 遮阳棚右侧展开（3.3-4）
    { node: liftTable, kind: 'other', deployAmount: 1 }, // 可升降小桌板升起态（3.3-9；kind 'other'★draft §5.3）
  ];
}

/* ============================== ③ buildInterior（3.3-6…11；拖挂 10 + 皮卡 6 = 16 named） ============================== */

/* —— 内饰材质（工厂缓存单例；灯材质 authored 基值在 buildInterior 内重写——同 classC 裁定④纪律）—— */

const innerShellMat = toonMaterials.getToon('matteProp', {
  color: COLORS.innerShell, outline: false, emissive: COLORS.warmLight, emissiveIntensity: 0, name: 'trailerRig/inner-shell',
});
innerShellMat.side = THREE.BackSide; // 三件套：innerShell BackSide 暖色内壁
const mattressMat = toonMaterials.getToon('cloth', { color: '#efe6d4', emissive: '#ff9a5a', emissiveIntensity: 0, name: 'trailerRig/mattress' });
const quiltGlowMat = toonMaterials.getToon('cloth', { color: COLORS.quiltA, emissive: '#ff9a5a', emissiveIntensity: 0, name: 'trailerRig/quilt-glow' });
const ceilLampMat = toonMaterials.getToon('matteProp', { color: '#f5ead6', emissive: COLORS.warmLight, emissiveIntensity: LAMPS.ceilAuthored * LAMPS.ceilGain, name: 'trailerRig/ceil-lamp' });

interface FurnitureMaterialSet {
  wood: THREE.Material;
  warmWhite: THREE.Material;
  mint: THREE.Material;
  pink: THREE.Material;
  quiltB: THREE.Material;
  darkMetal: THREE.Material;
  steel: THREE.Material;
  counterTop: THREE.Material;
  pillow: THREE.Material;
  seatPad: THREE.Material;
  floorWood: THREE.Material;
  coldDark: THREE.Material;
}

function buildFurnitureMaterials(assets: SharedAssets): FurnitureMaterialSet {
  const woodFloorTexture = assets.texture('trailerRig/tex/wood-floor', () => paintCanvasTexture('trailerRig/tex/wood-floor', 256, 256, drawWoodFloor));
  woodFloorTexture.repeat.set(5, 2.6);
  return {
    wood: toonMaterials.get('wood', { color: '#c9a86e', name: 'trailerRig/furn-wood' }),
    warmWhite: toonMaterials.get('matteProp', { color: COLORS.warmWhite, name: 'trailerRig/warm-white' }),
    mint: toonMaterials.get('cloth', { color: COLORS.mint, name: 'trailerRig/mint' }),
    pink: toonMaterials.get('cloth', { color: COLORS.bandPink, name: 'trailerRig/pink' }),
    quiltB: toonMaterials.get('cloth', { color: COLORS.quiltB, name: 'trailerRig/quilt-b' }),
    darkMetal: toonMaterials.get('metal', { color: '#4a4a50', name: 'trailerRig/dark-metal' }),
    steel: toonMaterials.get('metal', { color: '#9aa0a6', name: 'trailerRig/steel' }),
    counterTop: toonMaterials.get('matteProp', { color: '#e8e2d4', name: 'trailerRig/counter' }),
    pillow: toonMaterials.get('cloth', { color: COLORS.warmWhite, name: 'trailerRig/pillow' }),
    seatPad: toonMaterials.get('cloth', { color: COLORS.mint, name: 'trailerRig/seat-pad' }),
    floorWood: toonMaterials.get('wood', { color: COLORS.floorWood, map: woodFloorTexture, name: 'trailerRig/floor-wood' }),
    coldDark: toonMaterials.get('matteProp', { color: '#2e3238', outline: false, name: 'trailerRig/cold-dark' }),
  };
}

function buildInterior(ctx: VehicleBuildContext): VehicleInterior {
  const { assets, rng } = ctx;
  const group = new THREE.Group();
  group.name = 'trailerRig/interior';
  group.rotation.y = F.headingTrim; // 裁定④：与 exterior 同步微调
  group.userData.noOutline = true; // 三件套：内饰子树整体跳过描边（§5.3）

  // —— 灯基值重写（LightBreath 注册期快照 authored：先重写再由 Director 注册）——
  ceilLampMat.emissiveIntensity = LAMPS.ceilAuthored * LAMPS.ceilGain;
  ceilLampMat.visible = true;
  mattressMat.emissiveIntensity = 0;
  quiltGlowMat.emissiveIntensity = 0;
  innerShellMat.emissiveIntensity = 0;

  const mats = buildFurnitureMaterials(assets);
  const named: Record<string, THREE.Object3D> = {};
  const add = (key: (typeof NAMED_KEYS)[number], object: THREE.Object3D): void => {
    object.name = `trailerRig/interior/${key}`;
    group.add(object);
    named[key] = object;
  };
  const box = (w: number, h: number, d: number, material: THREE.Material, id?: string): THREE.Mesh =>
    new THREE.Mesh(
      assets.geometry(id ?? `trailerRig/furn-box|${w}x${h}x${d}`, () => hardenEdges(roundedBox({ width: w, height: h, depth: d, radius: Math.min(0.02, Math.min(w, h, d) * 0.2) }))),
      material,
    );

  /* —— 三件套 ①innerShell：拖挂厢=分瓣几何复用 ×0.94 BackSide（同 assets 缓存 id=外板同一份几何）—— */
  const trailerShell = createTrailerShellGeometries(assets, 'trailerRig/hull', {
    sectionLength: F.tSectionLen,
    radius: F.tRadius,
    squashY: F.tSquash,
    flatBottomY: F.tFlatBottom,
    panel: { x0: -1.5, x1: 1.4, y0: -F.tPanelY, y1: F.tPanelY },
    windowHole: { x0: F.tWinX0, x1: F.tWinX1, y0: F.tWinY0, y1: F.tWinY1, r: F.tWinR },
    tailCapX: F.tTailCapX,
    portholes: [
      { u: F.tPortholeU, v: F.tPortholeV, r: F.tPortholeR },
      { u: -F.tPortholeU, v: F.tPortholeV, r: F.tPortholeR },
    ],
    noseBaseX: F.tNoseBaseX,
    noseTipX: F.tNoseTipX,
  });
  const innerTrailer = new THREE.Group();
  innerTrailer.name = 'trailerRig/interior/inner-shell-trailer';
  innerTrailer.position.set(F.tCenterX, F.tCenterY, 0);
  innerTrailer.scale.setScalar(0.94);
  const shellPieces: readonly [string, THREE.BufferGeometry][] = [
    ['top', trailerShell.topSector], ['bottom', trailerShell.bottomSector],
    ['panel-l', trailerShell.sidePanel], ['panel-r', trailerShell.sidePanel],
    ['tail', trailerShell.tailCap], ['nose', trailerShell.noseShell],
  ];
  for (const [tag, geometry] of shellPieces) {
    const piece = new THREE.Mesh(geometry, innerShellMat);
    piece.name = `trailerRig/interior/inner-shell-t-${tag}`;
    if (tag === 'panel-l') piece.position.z = 1.028;
    if (tag === 'panel-r') piece.position.z = -1.028;
    innerTrailer.add(piece);
  }
  const innerPickup = new THREE.Mesh(
    assets.geometry('trailerRig/inner-shell-pickup', () => roundedBox({ width: 1.8, height: 1.32, depth: 1.76, radius: 0.1 })),
    innerShellMat,
  );
  innerPickup.name = 'trailerRig/interior/inner-shell-pickup';
  innerPickup.position.set(1.78, 1.32, 0);
  group.add(innerTrailer, innerPickup);

  /* —— `trailerWoodFloor` 地板（texWoodFloor oak；draft §5.3）—— */
  const floor = new THREE.Mesh(
    assets.geometry('trailerRig/floor', () => new THREE.PlaneGeometry(2.85, 1.6, 1, 1).rotateX(-Math.PI / 2)),
    mats.floorWood,
  );
  floor.name = 'trailerRig/interior/trailerWoodFloor';
  floor.position.set(-2.42, F.tFloor + 0.002, 0);
  group.add(floor);
  named.trailerWoodFloor = floor;

  /* —— `rearBed` 尾部横置双人床（3.3-7：床箱+床垫+双枕+双色拼布被；舷窗在其上方）—— */
  const bed = new THREE.Group();
  const bedFrame = box(0.95, 0.34, 1.44, mats.wood, 'trailerRig/bed-frame');
  bedFrame.position.set(-3.42, F.tFloor + 0.17, 0);
  const mattress = new THREE.Mesh(
    assets.geometry('trailerRig/mattress', () => hardenEdges(roundedBox({ width: 0.88, height: 0.12, depth: 1.36, radius: 0.04 }))),
    mattressMat,
  );
  mattress.name = 'trailerRig/bed-mattress';
  mattress.position.set(-3.42, F.tFloor + 0.4, 0);
  bed.add(bedFrame, mattress);
  for (const z of [0.36, -0.36]) {
    const pillow = box(0.3, 0.09, 0.34, mats.pillow, 'trailerRig/bed-pillow');
    pillow.position.set(-3.74, F.tFloor + 0.5, z);
    pillow.rotation.y = rng.range(-0.08, 0.08);
    bed.add(pillow);
  }
  const quiltA = new THREE.Mesh(
    assets.geometry('trailerRig/quilt-a', () => hardenEdges(roundedBox({ width: 0.45, height: 0.05, depth: 1.38, radius: 0.02 }))),
    quiltGlowMat, // 拼布被 A 色（薄荷，glowTag）
  );
  quiltA.name = 'trailerRig/bed-quilt-a';
  quiltA.position.set(-3.22, F.tFloor + 0.485, 0);
  const quiltB = new THREE.Mesh(
    assets.geometry('trailerRig/quilt-b', () => hardenEdges(roundedBox({ width: 0.42, height: 0.05, depth: 1.4, radius: 0.02 }))),
    mats.quiltB,
  );
  quiltB.name = 'trailerRig/bed-quilt-b';
  quiltB.position.set(-3.6, F.tFloor + 0.495, 0.03);
  quiltB.rotation.z = rng.range(-0.03, 0.03);
  bed.add(quiltA, quiltB);
  add('rearBed', bed);

  /* —— `kitchenette` 一侧紧凑厨房（3.3-8：台面+小水槽+单炉架，右壁）—— */
  const kitchen = new THREE.Group();
  const counterBody = box(1.1, 0.56, 0.44, mats.wood, 'trailerRig/counter-body');
  counterBody.position.set(-2.2, F.tFloor + 0.28, -0.78);
  const counterTop = box(1.14, 0.04, 0.48, mats.counterTop, 'trailerRig/counter-top');
  counterTop.position.set(-2.2, F.tFloor + 0.58, -0.78);
  const sink = box(0.3, 0.05, 0.24, mats.darkMetal, 'trailerRig/sink');
  sink.position.set(-2.46, F.tFloor + 0.605, -0.78);
  const faucet = new THREE.Mesh(
    assets.geometry('trailerRig/faucet', () => tube({
      pointsOrCurve: [
        new THREE.Vector3(-2.46, F.tFloor + 0.62, -0.9),
        new THREE.Vector3(-2.46, F.tFloor + 0.8, -0.9),
        new THREE.Vector3(-2.46, F.tFloor + 0.84, -0.84),
        new THREE.Vector3(-2.46, F.tFloor + 0.8, -0.79),
        new THREE.Vector3(-2.46, F.tFloor + 0.72, -0.79),
      ],
      radius: 0.013,
      tubularSegments: 14,
    })),
    mats.steel,
  );
  faucet.name = 'trailerRig/faucet';
  const burner = new THREE.Mesh(
    assets.geometry('trailerRig/burner', () => hardenEdges(new THREE.TorusGeometry(0.08, 0.014, 6, 14).rotateX(Math.PI / 2))),
    mats.darkMetal,
  );
  burner.name = 'trailerRig/burner';
  burner.position.set(-1.92, F.tFloor + 0.625, -0.78);
  kitchen.add(counterBody, counterTop, sink, faucet, burner);
  add('kitchenette', kitchen);

  /* —— `trailerCabinets` 吊柜 ×2 连（厨区上方，3.3-8）—— */
  const cabinets = new THREE.Group();
  const cabinetGeometry = assets.geometry('trailerRig/cabinet', () => hardenEdges(roundedBox({ width: 0.52, height: 0.34, depth: 0.3, radius: 0.02 })));
  for (const x of [-2.46, -1.94]) {
    const cabinet = new THREE.Mesh(cabinetGeometry, mats.wood);
    cabinet.name = `trailerRig/cabinet/${x}`;
    cabinet.position.set(x, F.tFloor + 1.14, -0.78);
    cabinets.add(cabinet);
    const grip = box(0.16, 0.02, 0.02, mats.darkMetal, 'trailerRig/cabinet-grip');
    grip.position.set(x, F.tFloor + 0.99, -0.625);
    cabinets.add(grip);
  }
  add('trailerCabinets', cabinets);

  /* —— `dinetteBenchFR` 对坐卡座（3.3-9：长凳 ×2 相对，左壁；裁定②单键组）—— */
  const dinette = new THREE.Group();
  const benchSeatGeometry = assets.geometry('trailerRig/bench-seat', () => hardenEdges(roundedBox({ width: 0.6, height: 0.36, depth: 0.32, radius: 0.02 })));
  const benchBackGeometry = assets.geometry('trailerRig/bench-back', () => hardenEdges(roundedBox({ width: 0.6, height: 0.42, depth: 0.07, radius: 0.02 })));
  for (const [tag, z, backZ] of [['F', 0.58, 0.77], ['R', 0.1, -0.07]] as const) {
    const seat = new THREE.Mesh(benchSeatGeometry, mats.wood);
    seat.name = `trailerRig/dinette-bench-${tag}-seat`;
    seat.position.set(-2.15, F.tFloor + 0.18, z);
    const pad = new THREE.Mesh(benchSeatGeometry, mats.seatPad);
    pad.name = `trailerRig/dinette-bench-${tag}-pad`;
    pad.scale.set(0.96, 0.14, 0.9);
    pad.position.set(-2.15, F.tFloor + 0.40, z);
    const back = new THREE.Mesh(benchBackGeometry, mats.wood);
    back.name = `trailerRig/dinette-bench-${tag}-back`;
    back.position.set(-2.15, F.tFloor + 0.62, backZ);
    dinette.add(seat, pad, back);
  }
  add('dinetteBenchFR', dinette);

  /* —— `liftTable` 可升降小桌板（3.3-9；几何在 buildExterior 构建——裁定⑤，此处挂入内饰组）—— */
  const liftTable = refs.liftTable;
  if (!liftTable) throw new Error('[trailerRig] liftTable 缺失（buildExterior 未构建）');
  liftTable.position.set(-2.15, F.tFloor, 0.34); // 组原点=地板：桌面局部 0.32 → 升起态桌面 ≈F.tFloor+0.32
  add('liftTable', liftTable);

  /* —— `bathPartition` 小卫生间隔断（3.3-10：板墙+门缝，前鼻端）—— */
  const partition = new THREE.Group();
  const wallSeg = box(0.05, 1.06, 1.1, mats.warmWhite, 'trailerRig/partition-wall');
  wallSeg.name = 'trailerRig/partition-wall';
  wallSeg.position.set(-1.44, F.tFloor + 0.53, -0.25); // 门洞开 +z 侧（z 0.30..0.80）
  const header = box(0.05, 0.25, 0.5, mats.warmWhite, 'trailerRig/partition-header');
  header.name = 'trailerRig/partition-header';
  header.position.set(-1.44, F.tFloor + 1.18, 0.55);
  const doorSeam = box(0.02, 0.02, 0.5, mats.darkMetal, 'trailerRig/partition-seam');
  doorSeam.name = 'trailerRig/partition-seam';
  doorSeam.position.set(-1.42, F.tFloor + 1.04, 0.55);
  partition.add(wallSeg, header, doorSeam);
  add('bathPartition', partition);

  /* —— `washBasin` 盆（3.3-10：小 Lathe 盆，隔间内搁板）—— */
  const basin = new THREE.Group();
  const shelf = box(0.3, 0.03, 0.34, mats.wood, 'trailerRig/basin-shelf');
  shelf.position.set(-1.22, F.tFloor + 0.36, 0.5);
  const bowl = new THREE.Mesh(
    assets.geometry('trailerRig/basin-bowl', () => lathe({
      profile: [[0.0, 0.0], [0.13, 0.0], [0.14, 0.05], [0.13, 0.12], [0.11, 0.13]],
      segments: 12,
    })),
    mats.counterTop,
  );
  bowl.name = 'trailerRig/basin-bowl';
  bowl.position.set(-1.22, F.tFloor + 0.375, 0.5);
  basin.add(shelf, bowl);
  add('washBasin', basin);

  /* —— `toiletBox` 坐便器（3.3-10：两叠圆角盒，隔间内）—— */
  const toilet = new THREE.Group();
  const toiletBase = box(0.34, 0.2, 0.38, mats.warmWhite, 'trailerRig/toilet-base');
  toiletBase.name = 'trailerRig/toilet-base';
  toiletBase.position.set(-1.18, F.tFloor + 0.1, -0.42);
  const toiletSeat = box(0.3, 0.03, 0.34, mats.counterTop, 'trailerRig/toilet-seat');
  toiletSeat.name = 'trailerRig/toilet-seat';
  toiletSeat.position.set(-1.18, F.tFloor + 0.215, -0.42);
  const toiletTank = box(0.1, 0.3, 0.34, mats.warmWhite, 'trailerRig/toilet-tank');
  toiletTank.name = 'trailerRig/toilet-tank';
  toiletTank.position.set(-1.35, F.tFloor + 0.28, -0.42);
  toilet.add(toiletBase, toiletSeat, toiletTank);
  add('toiletBox', toilet);

  /* —— `trailerCeilLamp` 顶灯（吸顶盘+乳白罩+halo；steady 1.0 暖 #ffb066★Q6 拍板「车内暖光」主角）—— */
  const ceilLamp = new THREE.Group();
  const ceilBase = new THREE.Mesh(
    assets.geometry('trailerRig/ceil-base', () => lathe({ profile: [[0.02, 0.0], [0.11, 0.0], [0.11, 0.02], [0.1, 0.05], [0.0, 0.05]], segments: 12 })),
    mats.darkMetal,
  );
  ceilBase.name = 'trailerRig/ceil-lamp-base';
  ceilBase.position.set(-2.3, 2.34, 0);
  ceilBase.rotation.x = Math.PI;
  const ceilBulb = new THREE.Mesh(
    assets.geometry('trailerRig/ceil-bulb', () => new THREE.SphereGeometry(0.08, 10, 8)),
    ceilLampMat,
  );
  ceilBulb.name = 'trailerRig/ceil-lamp-bulb';
  ceilBulb.position.set(-2.3, 2.27, 0);
  const ceilHalo = makeHaloSprite(assets, 'trailerRig/ceil-lamp-halo', 0.7, COLORS.warmLight);
  ceilHalo.position.copy(ceilBulb.position);
  ceilLamp.add(ceilBase, ceilBulb, ceilHalo);
  add('trailerCeilLamp', ceilLamp);

  /* =================== 皮卡双排舱内饰（3.3-11；6 named；冷色仪表——3.3-12 冷端） =================== */

  /* —— `pickupDash` 仪表盘（gaugeCluster 'cool' + texDash 冷青）—— */
  const dashTexture = assets.texture('trailerRig/tex/dash-cool', () => paintCanvasTexture('trailerRig/tex/dash-cool', 256, 128, drawDashCool));
  const gauge = createGaugeCluster({ style: 'cool', map: dashTexture, name: 'trailerRig/pickup-gauge' });
  gauge.group.name = 'trailerRig/interior/pickupDash';
  gauge.group.position.set(2.52, 1.44, 0.45);
  gauge.group.rotation.y = -Math.PI / 2; // 屏面朝 −X（驾驶员在 +Z 左侧）
  const gaugeTilt = new THREE.Group();
  gaugeTilt.name = 'trailerRig/interior/gauge-tilt';
  gaugeTilt.rotation.z = -0.18;
  gaugeTilt.add(gauge.group);
  group.add(gaugeTilt);
  named.pickupDash = gauge.group;
  refs.screens = [gauge.screenMaterial];

  /* —— `pickupScreen` 中控屏（screenPanel 0.30×0.22 + texScreenNav）—— */
  const navTexture = assets.texture('trailerRig/tex/screen-nav', () => paintCanvasTexture('trailerRig/tex/screen-nav', 128, 128, drawScreenNav));
  const screen = createScreenPanel({ width: 0.3, height: 0.22, map: navTexture, name: 'trailerRig/pickup-screen' });
  screen.group.name = 'trailerRig/interior/pickupScreen';
  screen.group.position.set(2.42, 1.52, 0.1);
  screen.group.rotation.y = -Math.PI / 2;
  screen.group.rotation.z = -0.12;
  group.add(screen.group);
  named.pickupScreen = screen.group;
  refs.screens.push(screen.screenMaterial);

  /* —— `pickupSteering` 方向盘（torus+3 辐条+转向柱，独立 named）—— */
  const steering = new THREE.Group();
  const rimMaterial = toonMaterials.get('matteProp', { color: '#3a3d42', outline: false, name: 'trailerRig/steering' });
  const rim = new THREE.Mesh(
    assets.geometry('trailerRig/steering-rim', () => hardenEdges(new THREE.TorusGeometry(0.105, 0.016, 6, 16))),
    rimMaterial,
  );
  rim.name = 'trailerRig/steering-rim';
  rim.rotation.y = Math.PI / 2; // 环面 YZ（面向 ±X）
  const spokeGeometry = assets.geometry('trailerRig/steering-spoke', () => hardenEdges(new THREE.BoxGeometry(0.19, 0.02, 0.02)));
  for (const angle of [Math.PI / 2, Math.PI / 2 + (Math.PI * 2) / 3, Math.PI / 2 + (Math.PI * 4) / 3]) {
    const spoke = new THREE.Mesh(spokeGeometry, rimMaterial);
    spoke.name = `trailerRig/steering-spoke/${angle.toFixed(2)}`;
    spoke.rotation.y = Math.PI / 2;
    spoke.rotation.x = angle - Math.PI / 2;
    steering.add(spoke);
  }
  const column = new THREE.Mesh(
    assets.geometry('trailerRig/steering-column', () => hardenEdges(new THREE.CylinderGeometry(0.022, 0.026, 0.22, 8))),
    rimMaterial,
  );
  column.name = 'trailerRig/steering-column';
  column.rotation.z = 1.05;
  column.position.set(0.09, -0.07, 0);
  steering.add(rim, column);
  steering.position.set(2.36, 1.26, 0.45);
  steering.rotation.z = -0.28; // 盘面向后倾（驾驶姿态）
  add('pickupSteering', steering);

  /* —— 前排双座+后座长凳（支撑件，非 named——draft §5.4 named 表不含座椅）—— */
  const seatCushionGeometry = assets.geometry('trailerRig/seat-cushion', () => hardenEdges(roundedBox({ width: 0.44, height: 0.16, depth: 0.46, radius: 0.03 })));
  const seatBackGeometry = assets.geometry('trailerRig/seat-back', () => hardenEdges(roundedBox({ width: 0.1, height: 0.44, depth: 0.46, radius: 0.03 })));
  for (const z of [0.45, -0.45]) {
    const cushion = new THREE.Mesh(seatCushionGeometry, mats.coldDark);
    cushion.name = `trailerRig/front-seat/${z}`;
    cushion.position.set(2.1, F.pkFloor + 0.09, z);
    const back = new THREE.Mesh(seatBackGeometry, mats.coldDark);
    back.name = `trailerRig/front-seat-back/${z}`;
    back.position.set(1.9, F.pkFloor + 0.3, z);
    group.add(cushion, back);
  }
  const rearBench = new THREE.Mesh(
    assets.geometry('trailerRig/rear-bench', () => hardenEdges(roundedBox({ width: 0.52, height: 0.36, depth: 1.3, radius: 0.03 }))),
    mats.coldDark,
  );
  rearBench.name = 'trailerRig/rear-bench';
  rearBench.position.set(1.34, F.pkFloor + 0.18, 0); // 座面顶 ≈1.02（高座后 bench——睡袋/行李抬入侧窗带）
  const rearBenchBack = new THREE.Mesh(
    assets.geometry('trailerRig/rear-bench-back', () => hardenEdges(roundedBox({ width: 0.09, height: 0.4, depth: 1.3, radius: 0.03 }))),
    mats.coldDark,
  );
  rearBenchBack.name = 'trailerRig/rear-bench-back';
  rearBenchBack.position.set(1.6, F.pkFloor + 0.56, 0);
  group.add(rearBench, rearBenchBack);

  /* —— `rearSleepingBag` 后座睡袋（3.3-11 半卷态横放）+ `rearDuffel` 后座行李（圆角行囊+绑带）——
       后座道具顶 ≥1.10（侧窗带下缘）——「双排舱内可见」透窗读法（3.3-11）—— */
  const sleepingBag = createSleepingBag(assets, rng.fork('sleepingBag'), { state: 'half', name: 'trailerRig' });
  sleepingBag.name = 'trailerRig/interior/rearSleepingBag';
  sleepingBag.position.set(1.3, 1.03, 0.33);
  sleepingBag.rotation.y = 0.12;
  group.add(sleepingBag);
  named.rearSleepingBag = sleepingBag;

  const duffel = new THREE.Group();
  const duffelBody = new THREE.Mesh(
    assets.geometry('trailerRig/duffel-body', () => hardenEdges(roundedBox({ width: 0.5, height: 0.2, depth: 0.28, radius: 0.08 }))),
    mats.pink,
  );
  duffelBody.name = 'trailerRig/duffel-body';
  duffelBody.position.y = 0.1;
  const duffelStrapGeometry = assets.geometry('trailerRig/duffel-strap', () => hardenEdges(roundedBox({ width: 0.04, height: 0.23, depth: 0.32, radius: 0.01 })));
  for (const x of [-0.14, 0.14]) {
    const strap = new THREE.Mesh(duffelStrapGeometry, mats.darkMetal);
    strap.name = `trailerRig/duffel-strap/${x}`;
    strap.position.set(x, 0.1, 0);
    duffel.add(strap);
  }
  duffel.add(duffelBody);
  duffel.name = 'trailerRig/interior/rearDuffel';
  duffel.position.set(1.32, 1.13, -0.35);
  duffel.rotation.y = -0.1;
  group.add(duffel);
  named.rearDuffel = duffel;

  /* —— `pickupFloorMat` 脚垫（深灰薄板，驾驶位）—— */
  const floorMat = new THREE.Mesh(
    assets.geometry('trailerRig/floor-mat', () => hardenEdges(roundedBox({ width: 0.44, height: 0.02, depth: 0.4, radius: 0.008 }))),
    mats.coldDark,
  );
  floorMat.name = 'trailerRig/interior/pickupFloorMat';
  floorMat.position.set(2.14, F.pkFloor + 0.012, 0.45);
  group.add(floorMat);
  named.pickupFloorMat = floorMat;

  /* —— 灯点句柄（Q6 拍板：trailerCeilLamp steady 1.0 暖 #ffb066 为组合「车内暖光」主角；皮卡屏=screens 不设灯具）—— */
  refs.lampHandles = [
    { emissiveMat: ceilLampMat, halo: ceilHalo, mode: 'steady', params: {} } satisfies LampHandle,
  ];

  /* —— 车内暖光点光（拖挂厢内 (−2.6,1.5,0)★docs/03 §4.2.3；全局 ≤2 点光预算「车内暖光」位）—— */
  const fillLight = new THREE.PointLight(COLORS.warmLight, 0, FILL_LIGHT.distance, FILL_LIGHT.decay);
  fillLight.name = 'trailerRig/fill-light';
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
    if (!named[key]) throw new Error(`[trailerRig] named 键缺失：${key}`);
  }
  return { group, named };
}

/* ============================== ④ interiorLightHooks（D2 唯一驱动链；docs/03 §4.2.3 钩子行） ============================== */

/**
 * 可透视窗透明度目标（clear 0.24 / tinted 0.40 / porthole 0.30 → 夜间随 interiorPower 插值降至 0.22，
 * docs/04 §5.5）。经工厂同名缓存键取用——与 buildExterior 内玻璃材质为同一实例（改一处全场生效）。
 */
const windowGlassTargets: readonly { readonly material: THREE.MeshToonMaterial; readonly base: number }[] = [
  { material: toonMaterials.getToon('glass', { color: '#bcd8e8', opacity: GLASS_OPACITY.clear, name: 'trailerRig/glass-clear' }), base: GLASS_OPACITY.clear },
  { material: toonMaterials.getToon('glass', { color: '#9fc4d8', opacity: GLASS_OPACITY.tinted, name: 'trailerRig/glass-tinted' }), base: GLASS_OPACITY.tinted },
  { material: toonMaterials.getToon('glass', { color: '#a8c8d4', opacity: GLASS_OPACITY.porthole, name: 'trailerRig/glass-porthole' }), base: GLASS_OPACITY.porthole },
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
    // ② glowTags：床垫 0.10 / 拼布被 0.08 / innerShell 0.12（同 C 型口径的自洽定值）
    mattressMat.emissiveIntensity = GLOW.mattress * p;
    quiltGlowMat.emissiveIntensity = GLOW.quilt * p;
    innerShellMat.emissiveIntensity = GLOW.innerShell * p;
    // ③ 屏幕自发光标量：0.12+0.23×power（上限 0.35——draft §5.4「皮卡仪表/中控为 screens（微光 0.35）」）
    for (const screen of refs.screens) {
      screen.color.setScalar(SCREENS.base + SCREENS.gain * p);
    }
    // ④ 车内暖光点光：1.15×power×emphasis（docs/03 §4.2.0 模板逐字；blend 平滑）
    const target = FILL_LIGHT.gain * p * clamp(emphasis, 0, 2);
    refs.fillLight.intensity = THREE.MathUtils.lerp(refs.fillLight.intensity, target, b);
  },
};

/* ============================== 模块装配（§3.3.3 注册行见 registry.ts；label「拖挂房车」★统一） ============================== */

export const trailerRig: VehicleModule = {
  id: 'trailerRig',
  label: '拖挂房车',
  buildExterior,
  buildDeployment,
  buildInterior,
  interiorLightHooks,
};
