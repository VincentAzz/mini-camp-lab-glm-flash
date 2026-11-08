// docs/01-整体架构.md §3.2 core/baseAssembler.ts —— BaseAssembler：统一正方形底座生成（一.3：形式统一，仅材质/边缘按场景换）。T07 落点。
// docs/02-场景模块.md §4.0（统一骨架）：底边 20×20u、台面 y=0、底座厚 1.5u、四周 45° 倒角台缘 +
//   底缘内收 0.15u「模型剖面」阶梯、底面 19.2×19.2 深灰托板；场景只经 palette.baseStyle
//   （J1 五字段 topTheme/edgeMatId/rimDecal/skirtLayers/silhouette）换材质与边缘。
// docs/04-三渲二渲染.md §5.5：材质配方=顶面 groundTerrain(ramp2+场景地面图)+边缘 45° 倒角环带+外缘描边 0.05 档；
//   §5.2 原型表：底座侧壁=concrete 原型；§5.3：底座级描边 0.050（挂 OutlineSystem 物体级开关）。
// docs/02 §4.0 D1：后缘剪影板（Canvas alpha 剪影，随全局光照同色调，浓雾按 fogDensity 逐层雾化——
//   运行期调色调/透明度由 lightHooks/AtmosphereSystem 消费 silhouetteHolder 完成，本文件只就位挂点与板体）。
// 依赖纪律（§3.1）：core 不 import content——BaseStyleSpec 以结构化局部类型消费（与
//   content/scenes/types.ts 的 BaseStyleSpec 同形）；资源一律经 T04 契约 SharedAssets（systems/handles.ts）。
import * as THREE from 'three';
import type { SharedAssets } from '@/systems/handles';
import { toonMaterials } from '@/render/toonMaterial';
import { mergeGeometries, profileExtrude } from '@/geom/primitives';
import { createFbm2D, hashStringToSeed } from '@/tex/canvasTex';
import { mulberry32 } from '@/shared/rng';
import { clamp } from '@/shared/math';

// ---------------------------------------------------------------------------
// 尺寸常量（docs/02 §4.0 统一骨架；实现期标定值——档位微调归 T43 观感调参）
// ---------------------------------------------------------------------------

const BASE_SIZE = 20;          // 台面/最大足迹 20×20u
const CHAMFER = 0.35;          // 45° 倒角台缘宽度（=落差）
const WALL_HEIGHT = 1.0;       // 台缘竖直带（edgeMatId 剖面带）高度：y −0.35..−1.35
const STEP_INSET = 0.15;       // 底缘内收「模型剖面」阶梯
const STEP_HEIGHT = 0.15;
const PLATE_SIZE = 19.2;       // 深灰托板（§4.0 定值）
const PLATE_THICKNESS = 0.12;
const SKIRT_TIER_HEIGHT = 0.45; // skirtLayers=1 时的加层剖面带高
const SKIRT_TIER_INSET = 0.3;   // 每层两侧共内收 0.3（每侧 0.15，与阶梯同节奏）
const WALL_HALF = BASE_SIZE / 2 - CHAMFER; // 9.65：倒角底/墙外缘半宽
const STEP_HALF = WALL_HALF - STEP_INSET;  // 9.5：阶梯内缘半宽

/** 结构化底座样式（与 content/scenes/types.ts BaseStyleSpec 同形；core 不 import content，§3.1）。 */
export interface BaseStyleSpecLike {
  readonly topTheme: string;
  readonly edgeMatId: string;
  readonly rimDecal: string | null;
  readonly skirtLayers: number;
  readonly silhouette: string | null;
}

export interface BaseBuild {
  readonly group: THREE.Group;
  /** 后缘剪影板挂点（D1）：光照同色调/逐层雾化的运行期取用点 */
  readonly silhouetteHolder: THREE.Group;
  /** 台面材质（T13 WeatherMaterialSystem kind:'ground' 挂点；wet/snow 补丁已按 groundTerrain 默认开启） */
  readonly topMaterial: THREE.Material;
  /** 台缘剖面带材质（§5.2 concrete 原型） */
  readonly edgeMaterial: THREE.Material;
}

// ---------------------------------------------------------------------------
// 台面主题配方（topTheme）——贴图按「中值原则」（04 §5.4：明暗不烘进贴图，灰度 0.85–1.0 区间，
// albedo 色相来自材质 color；裂纹/划线等语义图形除外）
// ---------------------------------------------------------------------------

interface ThemeRecipe {
  albedo: string;
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
}

function paintSpeckle(ctx: CanvasRenderingContext2D, w: number, h: number, seed: string, base: number, amp: number, freq: number): void {
  const fbm = createFbm2D(hashStringToSeed(seed), 4);
  const image = ctx.createImageData(w, h);
  const data = image.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = clamp(base + (fbm((x / w) * freq, (y / h) * freq) - 0.5) * 2 * amp, 0, 1);
      const c = Math.round(v * 255);
      const i = (y * w + x) * 4;
      data[i] = c;
      data[i + 1] = c;
      data[i + 2] = c;
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
}

const TOP_THEMES: Record<string, ThemeRecipe> = {
  // 草地噪点（§4.1.0 差异表）
  lawn: {
    albedo: '#86b05c',
    draw: (ctx, w, h) => {
      paintSpeckle(ctx, w, h, 'base/top/lawn', 0.93, 0.035, 24);
      const rng = mulberry32(hashStringToSeed('base/top/lawn/flecks'));
      ctx.strokeStyle = 'rgba(0,0,0,0.10)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 260; i++) {
        const x = rng() * w;
        const y = rng() * h;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + (rng() - 0.5) * 3, y - 1.5 - rng() * 2);
        ctx.stroke();
      }
    },
  },
  // 碎石地
  gravel: {
    albedo: '#9aa08e',
    draw: (ctx, w, h) => {
      paintSpeckle(ctx, w, h, 'base/top/gravel', 0.9, 0.06, 56);
      const rng = mulberry32(hashStringToSeed('base/top/gravel/stones'));
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      for (let i = 0; i < 220; i++) {
        ctx.beginPath();
        ctx.ellipse(rng() * w, rng() * h, 0.8 + rng() * 1.6, 0.6 + rng() * 1.2, rng() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
    },
  },
  // 裂纹混凝土（噪声幅度 ≤8% 纪律；裂纹=语义图形，淡）
  crackedConcrete: {
    albedo: '#9aa0a2',
    draw: (ctx, w, h) => {
      paintSpeckle(ctx, w, h, 'base/top/concrete', 0.94, 0.04, 16);
      const rng = mulberry32(hashStringToSeed('base/top/concrete/cracks'));
      ctx.strokeStyle = 'rgba(40,40,44,0.14)';
      ctx.lineWidth = 1;
      for (let c = 0; c < 3; c++) {
        let x = rng() * w;
        let y = rng() * h;
        ctx.beginPath();
        ctx.moveTo(x, y);
        const segs = 6 + Math.floor(rng() * 5);
        for (let s = 0; s < segs; s++) {
          x += (rng() - 0.5) * w * 0.16;
          y += (rng() - 0.5) * h * 0.16;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    },
  },
  // 沥青+划线区（划线=独立 linePaint 作用面，场景层负责；此处只做沥青骨料颗粒）
  asphaltLot: {
    albedo: '#565c62',
    draw: (ctx, w, h) => {
      paintSpeckle(ctx, w, h, 'base/top/asphalt', 0.9, 0.05, 64);
      const rng = mulberry32(hashStringToSeed('base/top/asphalt/aggregate'));
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      for (let i = 0; i < 320; i++) {
        ctx.fillRect(rng() * w, rng() * h, 1, 1);
      }
    },
  },
};

const TOP_THEME_FALLBACK: ThemeRecipe = {
  albedo: '#8a8478',
  draw: (ctx, w, h) => paintSpeckle(ctx, w, h, `base/top/fallback`, 0.92, 0.04, 24),
};

// ---------------------------------------------------------------------------
// 台缘剖面带配方（edgeMatId；docs/02 §4.1.0 差异表四描述 → 本表 canonical id，场景层按此传 id）
// ---------------------------------------------------------------------------

interface EdgeRecipe {
  albedo: string;
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
}

/** 水平分层带：边界 sin 微扰 + 层内轻噪（岩层三条沉积带/根系土层通用骨架） */
function paintStrata(ctx: CanvasRenderingContext2D, w: number, h: number, seed: string, bands: readonly number[]): void {
  const fbm = createFbm2D(hashStringToSeed(seed), 3);
  const rng = mulberry32(hashStringToSeed(seed + '/bounds'));
  const bounds: number[] = [0];
  for (let i = 1; i < bands.length; i++) {
    bounds.push((i / bands.length) * h + (rng() - 0.5) * h * 0.06);
  }
  bounds.push(h);
  const image = ctx.createImageData(w, h);
  const data = image.data;
  for (let x = 0; x < w; x++) {
    const wob = (px: number): number => Math.sin((px / w) * Math.PI * 3 + x / w * 2) * h * 0.012 + (fbm(x / w * 6, px) - 0.5) * h * 0.02;
    for (let y = 0; y < h; y++) {
      let band = 0;
      for (let b = 0; b < bands.length; b++) {
        const lo = (bounds[b] as number) + wob(b);
        const hi = (bounds[b + 1] as number) + wob(b + 1);
        if (y >= lo && y < hi) { band = b; break; }
        if (b === bands.length - 1) band = b;
      }
      const v = clamp(bands[band] as number, 0, 1);
      const c = Math.round(v * 255);
      const i = (y * w + x) * 4;
      data[i] = c;
      data[i + 1] = c;
      data[i + 2] = c;
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
}

const EDGE_RECIPES: Record<string, EdgeRecipe> = {
  // 岩层剖面：三条沉积层带（海崖）
  rockStrata: {
    albedo: '#9a8672',
    draw: (ctx, w, h) => paintStrata(ctx, w, h, 'base/edge/rockStrata', [0.98, 0.86, 0.93]),
  },
  // 根系土层（松林）
  rootSoil: {
    albedo: '#7a6248',
    draw: (ctx, w, h) => {
      paintStrata(ctx, w, h, 'base/edge/rootSoil', [0.95, 0.85]);
      const rng = mulberry32(hashStringToSeed('base/edge/rootSoil/roots'));
      ctx.strokeStyle = 'rgba(52,38,26,0.28)';
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 26; i++) {
        const x = rng() * w;
        const y0 = rng() * h * 0.4;
        ctx.beginPath();
        ctx.moveTo(x, y0);
        ctx.quadraticCurveTo(x + (rng() - 0.5) * 14, y0 + h * 0.2, x + (rng() - 0.5) * 22, y0 + h * (0.3 + rng() * 0.5));
        ctx.stroke();
      }
    },
  },
  // 混凝土毛面（避难所）
  concreteRough: {
    albedo: '#9aa0a2',
    draw: (ctx, w, h) => paintSpeckle(ctx, w, h, 'base/edge/concreteRough', 0.93, 0.045, 20),
  },
  // 路缘石（服务区）
  curbStone: {
    albedo: '#8a8f94',
    draw: (ctx, w, h) => {
      paintSpeckle(ctx, w, h, 'base/edge/curbStone', 0.95, 0.03, 18);
      ctx.fillStyle = 'rgba(40,42,46,0.22)';
      ctx.fillRect(0, h * 0.34, w, 1.5);
      ctx.fillRect(0, h * 0.68, w, 1.5);
    },
  },
};

const EDGE_FALLBACK: EdgeRecipe = {
  albedo: '#8a8478',
  draw: (ctx, w, h) => paintStrata(ctx, w, h, 'base/edge/fallback', [0.96, 0.88, 0.94]),
};

// ---------------------------------------------------------------------------
// 后缘剪影板（D1；BaseStyleSpec.silhouette：'coast'/'mountains'/'bridge+skyline'/null）
// Canvas alpha 剪影：白色形状+透明底，色相由材质 color×rampFar 承担（§5.3 远景剪影关描边）。
// ---------------------------------------------------------------------------

interface PlateSpec {
  id: string;
  height: number;
  z: number;
}

function drawRidge(ctx: CanvasRenderingContext2D, w: number, h: number, seed: string, segments: number, topFrac: number, baseFrac: number): void {
  const rng = mulberry32(hashStringToSeed(seed));
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(0, h);
  const step = w / segments;
  for (let i = 0; i <= segments; i++) {
    const peak = i % 2 === 0 ? topFrac : baseFrac;
    const jitter = (rng() - 0.5) * h * 0.08;
    ctx.lineTo(Math.min(w, i * step), h * peak + jitter);
  }
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();
}

const SILHOUETTE_DRAWERS: Record<string, (ctx: CanvasRenderingContext2D, w: number, h: number, layer: number) => void> = {
  coast: (ctx, w, h) => {
    // 海崖远岸头丘：圆缓海岬两座+低平岬角（帆船/灯塔由场景道具承担，剪影只留岸线）
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.quadraticCurveTo(w * 0.08, h * 0.62, w * 0.22, h * 0.55);
    ctx.quadraticCurveTo(w * 0.32, h * 0.5, w * 0.36, h * 0.22); // 主海岬
    ctx.quadraticCurveTo(w * 0.42, h * 0.05, w * 0.48, h * 0.42);
    ctx.quadraticCurveTo(w * 0.56, h * 0.62, w * 0.66, h * 0.58); // 小海湾凹进
    ctx.quadraticCurveTo(w * 0.78, h * 0.52, w * 0.84, h * 0.36); // 次海岬
    ctx.quadraticCurveTo(w * 0.92, h * 0.28, w, h * 0.6);
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
  },
  mountains: (ctx, w, h, layer) => {
    // 层叠山脊（4.1.2：×2，h 4.5/3.0）：后层高缓、前层低碎
    if (layer === 0) drawRidge(ctx, w, h, 'base/sil/mountains/0', 6, 0.18, 0.42);
    else drawRidge(ctx, w, h, 'base/sil/mountains/1', 10, 0.3, 0.6);
  },
  bridge: (ctx, w, h) => {
    // 断桥（4.1.3：桥面断口 Extrude+3 桥墩+倾斜断段，h3.2）
    ctx.fillStyle = '#ffffff';
    const deckTop = h * 0.42;
    const deckH = h * 0.09;
    ctx.fillRect(0, deckTop, w * 0.42, deckH); // 左段桥面
    ctx.fillRect(w * 0.64, deckTop, w * 0.36, deckH); // 右段桥面
    ctx.save(); // 倾斜断段
    ctx.translate(w * 0.5, deckTop + deckH * 0.5);
    ctx.rotate(-0.22);
    ctx.fillRect(-w * 0.09, -deckH * 0.5, w * 0.16, deckH);
    ctx.restore();
    for (const px of [0.07, 0.26, 0.86]) { // 3 桥墩（梯形）
      const pw = w * 0.045;
      ctx.beginPath();
      ctx.moveTo(px * w - pw * 0.7, deckTop + deckH);
      ctx.lineTo(px * w + pw * 0.7, deckTop + deckH);
      ctx.lineTo(px * w + pw, h);
      ctx.lineTo(px * w - pw, h);
      ctx.closePath();
      ctx.fill();
    }
  },
  skyline: (ctx, w, h) => {
    // 城市剪影：8–10 栋低楼群、2:1 高低差、平顶无尖塔（J7；仅建筑轮廓——一.6 红线）
    const rng = mulberry32(hashStringToSeed('base/sil/skyline'));
    ctx.fillStyle = '#ffffff';
    let x = w * 0.02;
    const count = 9;
    for (let i = 0; i < count && x < w * 0.97; i++) {
      const bw = w * (0.07 + rng() * 0.045);
      const tall = i % 2 === 0;
      const bh = h * (tall ? 0.72 + rng() * 0.22 : 0.36 + rng() * 0.14); // 2:1 高低差
      ctx.fillRect(x, h - bh, bw, bh);
      x += bw + w * 0.008;
    }
  },
};

function silhouettePlates(id: string): PlateSpec[] {
  if (id === 'coast') return [{ id: 'coast', height: 4.6, z: -9.45 }];
  if (id === 'mountains') {
    return [
      { id: 'mountains', height: 4.5, z: -9.5 }, // 后层
      { id: 'mountains', height: 3.0, z: -9.15 }, // 前层（层叠）
    ];
  }
  if (id.includes('+')) {
    // 组合 id（如 'bridge+skyline'）：逐段展开、由后至前
    const parts = id.split('+');
    const plates: PlateSpec[] = [];
    parts.forEach((part, i) => {
      if (part === 'bridge') plates.push({ id: 'bridge', height: 3.2, z: -9.5 - i * 0.05 });
      else if (part === 'skyline') plates.push({ id: 'skyline', height: 4.2, z: -9.2 - i * 0.05 });
      else plates.push({ id: part, height: 3.5, z: -9.4 - i * 0.05 });
    });
    return plates;
  }
  if (SILHOUETTE_DRAWERS[id] !== undefined) return [{ id, height: 3.5, z: -9.4 }];
  console.warn(`[baseAssembler] 未登记的剪影 id '${id}'，回退通用山脊板`);
  return [{ id: 'ridge', height: 3.5, z: -9.4 }];
}

function drawRidgeFallback(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  drawRidge(ctx, w, h, 'base/sil/ridge', 8, 0.25, 0.55);
}

// ---------------------------------------------------------------------------
// 程序化贴图（经 SharedAssets 契约 texture(id, build) 缓存；本文件自带 Canvas→CanvasTexture
// 薄封装，不与 tex/canvasTex 的缓存叠用——契约层负责缓存与引用计数）
// ---------------------------------------------------------------------------

type CanvasDraw = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

function paintCanvasTexture(key: string, w: number, h: number, draw: CanvasDraw, transparent = false): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error(`[baseAssembler] 无法获取 2d 上下文 key=${key}`);
  try {
    draw(ctx, w, h);
  } catch (err) {
    console.warn(`[baseAssembler] 贴图绘制失败，降级留白 key=${key}`, err);
    ctx.fillStyle = transparent ? 'rgba(0,0,0,0)' : '#dddddd';
    ctx.fillRect(0, 0, w, h);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.name = key;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  if (transparent) {
    // 剪影/贴花：透明底 alpha 由 map 携带
    texture.premultiplyAlpha = false;
  }
  texture.needsUpdate = true;
  return texture;
}

// ---------------------------------------------------------------------------
// 几何（统一骨架，全场景同形；经 SharedAssets 契约 geometry(id, build) 跨场景共享缓存）
// ---------------------------------------------------------------------------

/** 台面核心 + 四条 45° 倒角台缘棱条，合并为单几何（1 DC）。 */
function buildTopChamferGeometry(): THREE.BufferGeometry {
  const core = new THREE.BoxGeometry(BASE_SIZE - CHAMFER * 2, CHAMFER, BASE_SIZE - CHAMFER * 2);
  core.translate(0, -CHAMFER / 2, 0);
  const parts: THREE.BufferGeometry[] = [core.toNonIndexed()];

  // 倒角棱条断面（局部 XY，挤出沿 +Z）：顶边外缘 (0,0)、内缘 (±CHAMFER, 0) 与 (±CHAMFER, −CHAMFER)
  const posProfile: [number, number][] = [[0, 0], [CHAMFER, 0], [CHAMFER, -CHAMFER]];
  const negProfile: [number, number][] = [[0, 0], [-CHAMFER, 0], [-CHAMFER, -CHAMFER]];

  // 南缘（+z）：rotateY(π/2) 后 (px,py,t)→(t,py,−px)，再平移到外缘 z=+10
  const south = profileExtrude({ profile: posProfile, depth: BASE_SIZE, center: false });
  south.rotateY(Math.PI / 2);
  south.translate(-BASE_SIZE / 2, 0, BASE_SIZE / 2);
  // 北缘（−z）
  const north = profileExtrude({ profile: posProfile, depth: BASE_SIZE, center: false });
  north.rotateY(-Math.PI / 2);
  north.translate(BASE_SIZE / 2, 0, -BASE_SIZE / 2);
  // 东缘（+x）：断面取负 x 侧，避免镜像翻转法线
  const east = profileExtrude({ profile: negProfile, depth: BASE_SIZE - CHAMFER * 2, center: false });
  east.translate(BASE_SIZE / 2, 0, -(BASE_SIZE - CHAMFER * 2) / 2);
  // 西缘（−x）
  const west = profileExtrude({ profile: negProfile, depth: BASE_SIZE - CHAMFER * 2, center: false });
  west.translate(-BASE_SIZE / 2, 0, -(BASE_SIZE - CHAMFER * 2) / 2);

  parts.push(south, north, east, west);
  const merged = mergeGeometries(parts);
  if (!merged) throw new Error('[baseAssembler] 台面+倒角合并失败');
  merged.computeBoundingSphere();
  return merged;
}

function buildWallGeometry(): THREE.BufferGeometry {
  const wall = new THREE.BoxGeometry(BASE_SIZE - CHAMFER * 2, WALL_HEIGHT, BASE_SIZE - CHAMFER * 2);
  wall.translate(0, -CHAMFER - WALL_HEIGHT / 2, 0);
  return wall;
}

/** 底缘阶梯 + skirtLayers 加层剖面带 + 深灰托板，合并为单几何（1 DC）。 */
function buildTrimGeometry(skirtLayers: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const step = new THREE.BoxGeometry(STEP_HALF * 2, STEP_HEIGHT, STEP_HALF * 2);
  step.translate(0, -CHAMFER - WALL_HEIGHT - STEP_HEIGHT / 2, 0);
  parts.push(step.toNonIndexed());
  let bottom = -(CHAMFER + WALL_HEIGHT + STEP_HEIGHT); // −1.5
  const tiers = clamp(Math.floor(skirtLayers), 0, 2);
  for (let i = 0; i < tiers; i++) {
    const side = STEP_HALF * 2 - SKIRT_TIER_INSET * (i + 1);
    const tier = new THREE.BoxGeometry(side, SKIRT_TIER_HEIGHT, side);
    tier.translate(0, bottom - SKIRT_TIER_HEIGHT / 2, 0);
    parts.push(tier.toNonIndexed());
    bottom -= SKIRT_TIER_HEIGHT;
  }
  const plate = new THREE.BoxGeometry(PLATE_SIZE, PLATE_THICKNESS, PLATE_SIZE);
  plate.translate(0, bottom - PLATE_THICKNESS / 2, 0);
  parts.push(plate.toNonIndexed());
  const merged = mergeGeometries(parts);
  if (!merged) throw new Error('[baseAssembler] 剖面阶梯+托板合并失败');
  merged.computeBoundingSphere();
  return merged;
}

/** 四角警示斜纹贴花（rimDecal='hazardStripes'），合并为单几何（1 DC，贴台面四角）。 */
function buildCornerDecalGeometry(size: number, inset: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const plane = new THREE.PlaneGeometry(size, size);
      plane.rotateX(-Math.PI / 2);
      plane.translate(sx * inset, 0.004, sz * inset);
      parts.push(plane);
    }
  }
  const merged = mergeGeometries(parts);
  if (!merged) throw new Error('[baseAssembler] 四角贴花合并失败');
  return merged;
}

// ---------------------------------------------------------------------------
// BaseAssembler
// ---------------------------------------------------------------------------

export class BaseAssembler {
  private readonly assets: SharedAssets;

  /** assets：T04 契约（systems/handles.ts SharedAssets）——Director 注入（§3.5.1）。 */
  constructor(assets: SharedAssets) {
    this.assets = assets;
  }

  /**
   * 生成统一底座（形式全场景统一，仅材质/边缘/层数按 spec 变化，一.3）。
   * 台面 y=0；顶面/侧壁 receiveShadow=true（§5.2 阴影接收面）。
   * 几何与贴图经 SharedAssets 引用计数；卸载时 Director 按同 id release（§3.5.3）。
   */
  build(spec: BaseStyleSpecLike): BaseBuild {
    const group = new THREE.Group();
    group.name = 'base';

    // —— 材质（全部经 ToonMaterialFactory，全项目唯一着色路径）——
    const top = TOP_THEMES[spec.topTheme] ?? (() => {
      console.warn(`[baseAssembler] 未登记的台面主题 '${spec.topTheme}'，回退通用噪点`);
      return TOP_THEME_FALLBACK;
    })();
    const topTexture = this.assets.texture(`base/top-tex/${spec.topTheme}`, () =>
      paintCanvasTexture(`base/top-tex/${spec.topTheme}`, 256, 256, top.draw),
    );
    const topMaterial = toonMaterials.get('groundTerrain', {
      color: top.albedo,
      map: topTexture,
      name: `base/top/${spec.topTheme}`,
    });

    const edge = EDGE_RECIPES[spec.edgeMatId] ?? (() => {
      console.warn(`[baseAssembler] 未登记的台缘材质 id '${spec.edgeMatId}'，回退混凝土毛面`);
      return EDGE_FALLBACK;
    })();
    const edgeTexture = this.assets.texture(`base/edge-tex/${spec.edgeMatId}`, () =>
      paintCanvasTexture(`base/edge-tex/${spec.edgeMatId}`, 256, 64, edge.draw),
    );
    const edgeMaterial = toonMaterials.get('concrete', {
      color: edge.albedo,
      map: edgeTexture,
      name: `base/edge/${spec.edgeMatId}`,
    });

    const trimMaterial = toonMaterials.get('matteProp', { color: '#3f4046', name: 'base/trim' });

    // —— 网格（几何跨场景共享缓存）——
    const topMesh = new THREE.Mesh(this.assets.geometry('base/top-chamfer', buildTopChamferGeometry), topMaterial);
    topMesh.name = 'base/top';
    topMesh.receiveShadow = true;
    const wallMesh = new THREE.Mesh(this.assets.geometry('base/wall', buildWallGeometry), edgeMaterial);
    wallMesh.name = 'base/wall';
    wallMesh.receiveShadow = true;
    const trimMesh = new THREE.Mesh(
      this.assets.geometry(`base/trim-${clamp(Math.floor(spec.skirtLayers), 0, 2)}`, () => buildTrimGeometry(spec.skirtLayers)),
      trimMaterial,
    );
    trimMesh.name = 'base/trim';
    trimMesh.receiveShadow = true;
    group.add(topMesh, wallMesh, trimMesh);

    // —— 台缘装饰贴花（rimDecal）——
    if (spec.rimDecal !== null) {
      if (spec.rimDecal === 'hazardStripes') {
        const decalTexture = this.assets.texture('base/decal/hazardStripes', () =>
          paintCanvasTexture('base/decal/hazardStripes', 128, 128, (ctx, w, h) => {
            // 黄黑警示斜纹（语义图形，色相烘入贴图——04 §5.4 中值原则例外项）
            ctx.fillStyle = '#e8c23a';
            ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = '#2f2a33';
            const stripe = w / 8;
            for (let i = -8; i < 16; i++) {
              ctx.beginPath();
              ctx.moveTo(i * stripe, h);
              ctx.lineTo(i * stripe + stripe, h);
              ctx.lineTo(i * stripe + stripe + h, 0);
              ctx.lineTo(i * stripe + h, 0);
              ctx.closePath();
              ctx.fill();
            }
          }),
        );
        const decalMaterial = toonMaterials.get('matteProp', {
          color: '#ffffff',
          map: decalTexture,
          opacity: 0.999, // 透明贴花：借 opacity<1 打开 transparent（map alpha 承载形状）
          snow: 'off',
          name: 'base/decal/hazardStripes',
        });
        const decalMesh = new THREE.Mesh(this.assets.geometry('base/decal-corners', () => buildCornerDecalGeometry(0.85, 9.1)), decalMaterial);
        decalMesh.name = 'base/rimDecal';
        group.add(decalMesh);
      } else {
        console.warn(`[baseAssembler] 未登记的台缘贴花 id '${spec.rimDecal}'，跳过`);
      }
    }

    // —— 后缘剪影板挂点（D1）——
    const silhouetteHolder = new THREE.Group();
    silhouetteHolder.name = 'silhouette';
    if (spec.silhouette !== null) {
      const plates = silhouettePlates(spec.silhouette);
      plates.forEach((plate, i) => {
        const key = `base/sil-tex/${plate.id}/${i % 2}`;
        const texture = this.assets.texture(key, () =>
          paintCanvasTexture(key, 512, Math.round(plate.height * 64), (ctx, w, h) => {
            const drawer = SILHOUETTE_DRAWERS[plate.id];
            if (drawer) drawer(ctx, w, h, i % 2);
            else drawRidgeFallback(ctx, w, h);
          }, true),
        );
        const material = toonMaterials.get('matteProp', {
          color: '#454b58', // 深蓝灰基调；「随全局光照同色调」由 lightHooks 运行期调制 color
          map: texture,
          ramp: 'rampFar',
          outline: false, // §5.3：远景剪影板关描边（它本身就是轮廓）
          opacity: 0.999, // map alpha 承载剪影形状
          snow: 'off',
          name: `base/sil/${plate.id}/${i}`,
        });
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(BASE_SIZE - 0.6, plate.height), material);
        mesh.name = `base/silhouette/${plate.id}/${i}`;
        mesh.position.set(0, plate.height / 2, plate.z);
        silhouetteHolder.add(mesh);
      });
    }
    silhouetteHolder.userData.silhouetteId = spec.silhouette;
    group.add(silhouetteHolder);

    group.userData.baseStyle = { ...spec };
    return { group, silhouetteHolder, topMaterial, edgeMaterial };
  }
}

/** 便捷入口（§3.5.1：BaseAssembler.build(palette.baseStyle)）。 */
export function buildBase(spec: BaseStyleSpecLike, assets: SharedAssets): BaseBuild {
  return new BaseAssembler(assets).build(spec);
}
