// docs/01-整体架构.md §3.2 content/scenes/seacliff.ts —— 2.1 海崖营地 seacliff（默认场景，15 组元素 + 7 动效）。T18 落点。
// docs/02-场景模块.md §4.1.1（模块卡/地形 2.1.1/道具 2.1.2 十五组/palette 2.1.3 12 通道/光照钩子行为表/注册与预算）
//   + §4.1.0 campAnchor 海崖行 + §4.0 四域共通（句柄接入/程序化字典/无人物红线）；
// docs/05-时间天气动效.md §7.2.1 海崖 7 动效逐项落点 + §7.1 定值表（唯一参数源）+ §4.3.2 通道定值（场景只解释）；
// docs/04-三渲二渲染.md §5.5（海崖=ramp3+RGB ramp 补丁+water 波光+晚霞天空板——渲染层零场景分支）。
//
// ★ 地形实现注记（T18 实现期裁定，如实登记）：docs/02 2.1.1「海面 y=−2.6」依赖底座顶板开孔；T07
//   BaseAssembler 顶板为整版实心 Box（baseAssembler.ts buildTopChamferGeometry，20×20 无开孔），
//   y<0 的下沉面在底座足迹内任意俯角均被顶板遮挡、不可见。本实现采用「崖体抬升」等观感方案：
//   草坪台体向 +y 抬升 LAWN_TOP=1.2（侧壁沉积带朝海），海床/海面/湾水/湾沙位于底座台面上方
//   （SEA 0.30 / BAY 0.50 / SAND 0.62），崖上崖下总落差 0.9u，底座立裙岩层带（rockStrata）+ 台缘
//   剖面在视线上延续崖壁。campAnchor.position.y/groundY 相应取 LAWN_TOP（车型按 groundY 对位，
//   docs/03 §3.0 适配口）；x/z/heading/radius 仍逐字取 §4.1.0 海崖行。帆船四档 (x,z) 逐字保留
//   （y=SEA_Y 水线），左舷崖缘按曲线加 0.55u 小凹为近岸位 (−2,−5.6) 留水道。正式修法（顶板开孔/
//   下沉层声明）属 BaseAssembler 契约扩展，待 T22/T43 评审另任务处理（详见 T18 返回 openIssues）。
//
// 依赖纪律（§3.3.6）：只 import core 契约（types/handles）+ shared + geom 部件库 + render 工厂 +
//   systems/wind 的 injectVegetationWind（P2 注入器，wind.ts 用法注记点名「T18/T19/T21 植被材质装配处」）。
//   零 import 车型/时间/天气注册表；布料/粒子/灯点只交句柄与参数（docs/01 §3.4 归属裁定）。
// 无人物红线（一.6）：全场景无人形几何；海鸟为原文点名动物动效载体（7-1-⑤）；帆船空船自动航行。
import * as THREE from 'three';
import type {
  SceneAnimation,
  SceneBuildContext,
  SceneLightHooks,
  SceneLightState,
  SceneModule,
  ScenePalette,
  SceneProps,
  SceneRuntime,
  SceneTerrain,
} from '@/content/scenes/types';
import type {
  ClothHandle,
  EmitterSpec,
  LampHandle,
  LightBreathSystem,
  RGB,
  WeatherSurface,
  WindSystem,
} from '@/systems/handles';
import { toonMaterials, sharedUniforms } from '@/render/toonMaterial';
import { mergeGeometries, hardenEdges, roundedBox, lathe, tube } from '@/geom/primitives';
import { InstancedGroup } from '@/geom/instanced';
import { injectVegetationWind } from '@/systems/wind';
import { createWaterSurface, createGlintLayer } from '@/geom/parts/waterSurface';
import { createRockGeometry, createRockSet } from '@/geom/parts/rockCluster';
import { createBench } from '@/geom/parts/benchSlat';
import { createFoldTable } from '@/geom/parts/foldTable';
import { createFoldChairSet } from '@/geom/parts/foldChair';
import { createMicroCloth } from '@/geom/parts/clothMicro';
import { createSignBoard } from '@/geom/parts/signBoard';
import { createHoseRun, createHoseReel } from '@/geom/parts/gardenHose';
import { createFoldBicycle } from '@/geom/parts/bicycle';
import { createGrill } from '@/geom/parts/campfire';
import { createFbm2D, hashStringToSeed } from '@/tex/canvasTex';
import { mulberry32, hashString } from '@/shared/rng';
import { clamp } from '@/shared/math';

/* ============================== 场景定值（docs/02 §4.1.1） ============================== */

/** 草坪台体顶面（T18 抬升方案，见文件头注记；x/z/campAnchor 其余字段仍取 §4.1.0 定值）。 */
const LAWN_TOP = 1.2;
/** 海面（水线）/ 海床 / 湾水 / 湾沙（2.1.1「海面 −2.6/湾水 −2.3/沙 −1.9」在台面上的等观感映射）。 */
const SEA_Y = 0.3;
const BED_Y = 0.02;
const BAY_Y = 0.5;
const SAND_Y = 0.62;

/** 崖缘曲线（2.1.1「z=−5+1.2·sin(0.5x)，右侧小海湾凹进」）+ 左舷小凹（帆船近岸位 (−2,−5.6) 留水道）。 */
function cliffEdgeZ(x: number): number {
  const base = -5 + 1.2 * Math.sin(0.5 * x);
  const leftNotch = -0.55 * Math.exp(-Math.pow((x + 2.2) / 1.4, 2));
  const cove = 2.35 * Math.exp(-Math.pow((x - 4.7) / 1.75, 2));
  return base + leftNotch + cove;
}

/** 色彩通道（2.1.3 十二通道，docs/02 定值逐字）。 */
const CHANNELS = {
  seaDeep: '#2c4a7c',
  seaShallow: '#4a7fb5',
  seaGlint: '#b8d8f0',
  grassLawn: '#86b05c',
  grassDry: '#a8b86a',
  cliffRock: '#9a8672',
  cliffStrata: '#7c6a58',
  sandCove: '#e0cf9d',
  woodDeck: '#b98a58',
  canvasTarp: '#f2e9d4',
  lampWarm: '#ffcf8a',
  sailWhite: '#f5f2ea',
} satisfies Record<string, RGB>;

/** 帆船四档位置表（★行为表逐字；y=SEA_Y 水线；heading/bobMul/swayMul 为「微摆/静泊/缓行」解释参数）。 */
interface BoatTarget {
  x: number;
  z: number;
  heading: number;
  bobMul: number;
  swayMul: number;
}

/** 黄昏档兜底（Record 点访问在 noUncheckedIndexedAccess 下可空；初值/兜底共用同一常量）。 */
const BOAT_DUSK: BoatTarget = { x: 2.5, z: -8.6, heading: 0.85, bobMul: 1, swayMul: 0.5 }; // 远海缓行
const BOAT_TARGETS: Record<string, BoatTarget> = {
  dawn: { x: -2.0, z: -5.6, heading: -0.55, bobMul: 1, swayMul: 1 }, // 刚刚出海：近岸微摆
  day: { x: -4.5, z: -8.2, heading: -0.3, bobMul: 1, swayMul: 0.5 }, // 远海
  dusk: BOAT_DUSK,
  night: { x: -6.2, z: -8.4, heading: 0.1, bobMul: 0.4, swayMul: 0.25 }, // 归港：防波堤内侧静泊
};
/** 灯塔光束/顶灯功率场景映射（7.1.4「lampPower（dusk 0.4/night 1.0）」；7-1-④「dusk 0.4 起、白天 0」）。 */
const BEAM_TARGETS: Record<string, number> = { dawn: 0, day: 0, dusk: 0.4, night: 1.0 };
/** 波光色（行为表「波光色/朝霞」行：晨金/中性/金橙/月光带）+ 亮度档（夜间月光带 α×0.7）。 */
interface GlintTarget {
  color: string;
  mul: number;
}

const GLINT_DUSK: GlintTarget = { color: '#ffc984', mul: 1.15 }; // 金橙粼光
const GLINT_TARGETS: Record<string, GlintTarget> = {
  dawn: { color: '#f2cf9a', mul: 1.0 }, // 偏晨金
  day: { color: CHANNELS.seaGlint, mul: 0.75 }, // 中性
  dusk: GLINT_DUSK,
  night: { color: '#a9b6e0', mul: 0.7 }, // 月光带 α×0.7
};
/** 桅灯/泊港灯点（行为表夜间「泊港灯点微亮」；随档位连续插值）。 */
const BOAT_LAMP_TARGETS: Record<string, number> = { dawn: 0.12, day: 0, dusk: 0.45, night: 0.6 };
/** 天气 → 波光倍率（§7.2.1-③「雨×0.9 雾×0.85 雪×0.85」）与光晕增益（§4.4.1 glowBoost 定值同源近似——
 * SceneLightState 不携带 glowBoost，场景按天气 id 取同表数值，T33 接管后可删）。 */
const WEATHER_GLINT_MUL: Record<string, number> = { clear: 1, cloudy: 1, rain: 0.9, fog: 0.85, snow: 0.85 };
const WEATHER_GLOW: Record<string, number> = { clear: 0, cloudy: 0.15, rain: 0.35, fog: 0.8, snow: 0.25 };

/** 场景内部共享运行态（lightHooks/update/SceneAnimation 三方读写——同一模块闭包，无跨模块泄漏）。 */
interface SeacliffState {
  time: string;
  weather: string;
  lampPower: number;
  emberPower: number;
  smokePower: number;
  interiorGlow: number;
  boat: { x: number; z: number; heading: number; bobMul: number; swayMul: number };
  boatFrom: BoatTarget;
  boatTo: BoatTarget;
  beam: number;
  beamFrom: number;
  beamTo: number;
  boatLamp: number;
  boatLampFrom: number;
  boatLampTo: number;
  glintTint: THREE.Color;
  glintTintFrom: THREE.Color;
  glintTintTo: THREE.Color;
  glintMul: number;
  glintMulFrom: number;
  glintMulTo: number;
  dew: number;
  dewTo: number;
  breakfastVisible: boolean;
  breakfastFaded: boolean;
  breakfastFade: number;
  lastKey: string | null;
  pendingKey: string | null;
}

/** LightBreathSystem 实现侧场景映射口（结构化可选访问：契约未含时优雅降级——不 import 实现文件，§3.4）。 */
type BreathSceneExt = LightBreathSystem & {
  getLampOutput?: (lamp: LampHandle) => number;
  setLampPower?: (lamp: LampHandle, power: number) => void;
};

/** WindSystem 实现侧阵风口（7-1-⑦ 纸巾轻掀 boostCloth——wind.ts 注记的 EventScheduler 触发点）。 */
type WindSceneExt = WindSystem & {
  boostCloth?: (mesh: THREE.Mesh, multiplier?: number, decayS?: number) => void;
};

// ---------------------------------------------------------------------------
// Canvas 贴图绘制（程序化，docs/04 §5.4；经 ctx.assets.texture 缓存与引用计数）
// ---------------------------------------------------------------------------

type CanvasDraw = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

function paintCanvasTexture(key: string, w: number, h: number, draw: CanvasDraw, transparent = false): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(2, w);
  canvas.height = Math.max(2, h);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error(`[seacliff] 无法获取 2d 上下文 ${key}`);
  try {
    draw(ctx, canvas.width, canvas.height);
  } catch (err) {
    console.warn(`[seacliff] 贴图绘制失败，降级留白 ${key}`, err);
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

/** 草坪噪点（近白中值 + 草叶短线，明暗不烘进贴图——docs/04 §5.4 中值原则）。 */
function drawLawn(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const fbm = createFbm2D(hashStringToSeed('seacliff/lawn'), 4);
  const image = ctx.createImageData(w, h);
  const data = image.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = clamp(0.93 + (fbm((x / w) * 24, (y / h) * 24) - 0.5) * 0.07, 0, 1);
      const c = Math.round(v * 255);
      const i = (y * w + x) * 4;
      data[i] = c;
      data[i + 1] = c;
      data[i + 2] = c;
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  const rng = mulberry32(hashStringToSeed("seacliff/lawn/flecks"));
    // NOTE: 局部绘制用裸函数句柄（非 Rng 类）
  ctx.strokeStyle = 'rgba(0,0,0,0.10)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 240; i++) {
    const x = rng() * w;
    const y = rng() * h;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rng() - 0.5) * 3, y - 1.5 - rng() * 2);
    ctx.stroke();
  }
}

/** 崖壁三条沉积层带（上下边同色→v 重复无缝；边界 sin 微扰 + 层内轻噪 ≤8% 纪律）。 */
function drawCliffStrata(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const fbm = createFbm2D(hashStringToSeed('seacliff/strata'), 3);
  const bands = [0.98, 0.86, 0.93];
  const image = ctx.createImageData(w, h);
  const data = image.data;
  for (let x = 0; x < w; x++) {
    const u = x / w;
    for (let y = 0; y < h; y++) {
      const v = y / h;
      const wob = Math.sin(u * Math.PI * 4 + v * 2.2) * 0.03 + (fbm(u * 7, v * 3) - 0.5) * 0.05;
      const band = clamp(Math.floor((v + wob) * 3), 0, 2);
      const shade = clamp((bands[band] ?? 0.9) + (fbm(u * 14, v * 9) - 0.5) * 0.05, 0, 1);
      const c = Math.round(shade * 255);
      const i = (y * w + x) * 4;
      data[i] = c;
      data[i + 1] = c;
      data[i + 2] = c;
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
}

/** 野餐垫 gingham 格纹（语义图形可烘色，docs/04 §5.4 中值原则例外项）。 */
function drawGingham(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = '#f6f1e6';
  ctx.fillRect(0, 0, w, h);
  const cell = w / 8;
  ctx.fillStyle = 'rgba(196,88,74,0.5)';
  for (let i = 0; i < 8; i += 2) {
    ctx.fillRect(i * cell, 0, cell, h);
    ctx.fillRect(0, i * cell, w, cell);
  }
  ctx.fillStyle = 'rgba(196,88,74,0.85)';
  for (let i = 0; i < 8; i += 2) {
    for (let j = 0; j < 8; j += 2) {
      ctx.fillRect(i * cell, j * cell, cell, cell);
    }
  }
}

/** 灯塔红白环带（v 对位 Lathe 轮廓分段；§4.1.2-⑮「红白环带」）。 */
function drawLighthouseBands(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = '#f2efe8';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#c8493f';
  for (const b of [0.08, 0.3, 0.52, 0.74]) {
    ctx.fillRect(0, h * b, w, h * 0.13);
  }
}

/* ============================== ① buildTerrain（2.1.1） ============================== */

function buildTerrain(ctx: SceneBuildContext): SceneTerrain {
  const { assets } = ctx;
  const group = new THREE.Group();
  group.name = 'seacliff/terrain';

  // —— 材质（全部经工厂，docs/04 §5.2；海面 RGB ramp 场合由 water 原型承担）——
  const lawnTexture = assets.texture('seacliff/tex/lawn', () => paintCanvasTexture('seacliff/tex/lawn', 256, 256, drawLawn));
  lawnTexture.repeat.set(1 / 8, 1 / 8);
  const lawnMaterial = toonMaterials.get('groundTerrain', { color: CHANNELS.grassLawn, map: lawnTexture, name: 'seacliff/lawn' });

  const strataTexture = assets.texture('seacliff/tex/strata', () => paintCanvasTexture('seacliff/tex/strata', 256, 128, drawCliffStrata));
  strataTexture.repeat.set(1 / 9, 1 / 1.3);
  const cliffMaterial = toonMaterials.get('concrete', { color: CHANNELS.cliffRock, map: strataTexture, name: 'seacliff/cliff' });

  const sandTexture = assets.texture('seacliff/tex/sand', () =>
    paintCanvasTexture('seacliff/tex/sand', 128, 128, (c, w, h) => {
      const fbm = createFbm2D(hashStringToSeed('seacliff/sand'), 3);
      const image = c.createImageData(w, h);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const v = clamp(0.95 + (fbm((x / w) * 30, (y / h) * 30) - 0.5) * 0.08, 0, 1);
          const g = Math.round(v * 255);
          const i = (y * w + x) * 4;
          image.data[i] = g;
          image.data[i + 1] = g;
          image.data[i + 2] = g;
          image.data[i + 3] = 255;
        }
      }
      c.putImageData(image, 0, 0);
    }),
  );
  sandTexture.repeat.set(1 / 2.4, 1 / 2.4);
  const sandMaterial = toonMaterials.get('groundTerrain', { color: CHANNELS.sandCove, map: sandTexture, name: 'seacliff/sand' });

  // —— 草坪台体（崖缘曲线轮廓；顶面草坪/侧壁沉积带双材质；T18 抬升方案见文件头注记）——
  const shapeSamples: THREE.Vector2[] = [];
  for (let x = -10; x <= 10.0001; x += 0.4) {
    shapeSamples.push(new THREE.Vector2(x, -cliffEdgeZ(x)));
  }
  const plateauShape = new THREE.Shape([...shapeSamples, new THREE.Vector2(10, -10), new THREE.Vector2(-10, -10)]);
  const plateauGeometry = assets.geometry('seacliff/plateau', () => {
    const geometry = new THREE.ExtrudeGeometry(plateauShape, {
      depth: LAWN_TOP,
      bevelEnabled: false,
      curveSegments: 4,
      steps: 1,
    });
    geometry.rotateX(-Math.PI / 2); // (x, y_shape, z_extrude)→(x, y_extrude, −y_shape)：worldZ=−shapeY
    geometry.computeVertexNormals();
    return geometry;
  });
  const plateau = new THREE.Mesh(plateauGeometry, [lawnMaterial, cliffMaterial]);
  plateau.name = 'seacliff/plateau';
  plateau.receiveShadow = true;
  group.add(plateau);

  // —— 2 片错位薄板「层蛋糕」崖壁（贴崖壁面、错位高差，2.1.1）——
  const slabMaterial = toonMaterials.get('concrete', { color: CHANNELS.cliffStrata, name: 'seacliff/strata-slab' });
  const slabSpecs: readonly { x: number; y: number; len: number }[] = [
    { x: -2.6, y: 0.52, len: 2.6 },
    { x: 0.7, y: 0.86, len: 2.2 },
  ];
  slabSpecs.forEach((spec, i) => {
    const tangent = (cliffEdgeZ(spec.x + 0.25) - cliffEdgeZ(spec.x - 0.25)) / 0.5; // dz/dx
    const slab = new THREE.Mesh(
      assets.geometry(`seacliff/strata-slab-${i}`, () => new THREE.BoxGeometry(spec.len, 0.14, 0.05)),
      slabMaterial,
    );
    slab.name = `seacliff/strata-slab-${i}`;
    slab.position.set(spec.x, spec.y, cliffEdgeZ(spec.x) - 0.05); // 海侧 0.05 外贴（不埋入台体）
    slab.rotation.y = -Math.atan(tangent);
    group.add(slab);
  });

  // —— 海床（实心底座台面之上覆板；顶板开孔待 BaseAssembler 契约扩展，见文件头注记）——
  const bedGeometry = assets.geometry('seacliff/bed', () => {
    const bed = new THREE.BoxGeometry(19.2, 0.44, 8.5);
    bed.translate(0, BED_Y - 0.22, -5.75); // z −10.0..−1.5（不越出底座）
    return bed;
  });
  const bed = new THREE.Mesh(bedGeometry, toonMaterials.get('concrete', { color: '#3d4a5c', name: 'seacliff/bed' }));
  bed.name = 'seacliff/bed';
  group.add(bed);

  // —— 崖缘浅草压边（沿崖缘的 grassDry 色带 ribbon）——
  const ribbonGeometry = assets.geometry('seacliff/lawn-ribbon', () => {
    const samples = 72;
    const positions: number[] = [];
    const indices: number[] = [];
    for (let i = 0; i <= samples; i++) {
      const x = -9.6 + (19.2 * i) / samples;
      const z = cliffEdgeZ(x) + 0.42;
      positions.push(x, LAWN_TOP + 0.008, z, x, LAWN_TOP + 0.008, z + 0.38);
      if (i < samples) {
        const a = i * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  });
  const ribbon = new THREE.Mesh(
    ribbonGeometry,
    toonMaterials.get('groundTerrain', { color: CHANNELS.grassDry, name: 'seacliff/lawn-ribbon' }),
  );
  ribbon.name = 'seacliff/lawn-ribbon';
  group.add(ribbon);

  // —— 海面（water 原型 1 平面）+ 2 层 additive 波光面（2.1.1；§7.2.1-③ 运行期由波光动效驱动）——
  const sea = createWaterSurface({
    assets,
    name: 'seacliff/sea',
    width: 19.3,
    depth: 8.5,
    color: CHANNELS.seaDeep,
    glintColor: CHANNELS.seaGlint,
    waveScale: 9,
    waveSpeed: 0.06,
    opacity: 0.9,
  });
  sea.position.set(0, SEA_Y, -5.75);
  group.add(sea);
  const glintA = createGlintLayer({ assets, name: 'seacliff/glint-a', width: 19.3, depth: 8.5, color: '#ffffff', opacity: 0.16 });
  glintA.position.set(0, SEA_Y + 0.015, -5.75);
  const glintB = createGlintLayer({ assets, name: 'seacliff/glint-b', width: 19.3, depth: 8.5, color: '#dfeaf2', opacity: 0.13, streakScale: 11 });
  glintB.position.set(0, SEA_Y + 0.03, -5.75);
  group.add(glintA, glintB);

  // —— 小海湾：湾沙台（湾水高于海面——2.1.1「沙 −1.9 / 湾水 −2.3 / 海 −2.6」的相对关系保留）——
  const coveShape = new THREE.Shape();
  coveShape.absellipse(4.7, 2.6, 1.85, 1.45, 0, Math.PI * 2); // shape y=2.6 → world z=−2.6
  const sandGeometry = assets.geometry('seacliff/cove-sand', () => {
    const geometry = new THREE.ExtrudeGeometry(coveShape, { depth: 0.84, bevelEnabled: false, curveSegments: 12, steps: 1 });
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, SAND_Y - 0.84, 0); // 顶面 = SAND_Y，底部坐海床
    return geometry;
  });
  const sand = new THREE.Mesh(sandGeometry, sandMaterial);
  sand.name = 'seacliff/cove-sand';
  sand.receiveShadow = true;
  group.add(sand);
  const bay = createWaterSurface({
    assets,
    name: 'seacliff/bay',
    width: 3.0,
    depth: 2.4,
    color: CHANNELS.seaShallow,
    glintColor: '#dceef2',
    waveScale: 6,
    waveSpeed: 0.035,
    opacity: 0.55,
  });
  bay.position.set(4.72, BAY_Y, -2.6);
  group.add(bay);
  propsRef.glintLayers = [glintA, glintB]; // 波光动效（SceneAnimation）取用点

  return {
    group,
    campAnchor: {
      // §4.1.0 海崖行 (0, 0, 0.8)/+0.30/groundY 0/radius 4.0——y=groundY=LAWN_TOP 为 T18 裁定
      // （实心底座顶板无开孔，见文件头注记）；x/z/heading/radius 逐字（★半径契约仲裁 ≤4.2 口径不变）。
      position: new THREE.Vector3(0, LAWN_TOP, 0.8),
      headingRad: 0.3,
      groundY: LAWN_TOP,
      radius: 4.0,
    },
  };
}

/* ============================== ② buildProps（2.1.2 十五组） ============================== */

/** buildProps 产物登记（lightHooks.update / createAnimations 的取用点）。 */
interface PropRefs {
  sailboat: THREE.Group;
  sailboatInner: THREE.Group;
  mastLampMaterial: THREE.MeshToonMaterial;
  breakfastSet: THREE.Group;
  breakfastFadeMats: THREE.MeshToonMaterial[];
  stringLamp: LampHandle;
  campLamp: LampHandle;
  lighthouseLamp: LampHandle;
  stringHaloMaterial: THREE.MeshBasicMaterial;
  beamGroup: THREE.Group;
  beamMaterials: THREE.MeshBasicMaterial[];
  coalMaterial: THREE.MeshToonMaterial;
  glintLayers: THREE.Mesh[];
  sparkleMaterial: THREE.MeshBasicMaterial;
  groundGlowMaterial: THREE.MeshBasicMaterial;
  towelMesh: THREE.Mesh;
}

const propsRef: Partial<PropRefs> = {};

function buildProps(ctx: SceneBuildContext): SceneProps {
  const { assets } = ctx;
  const group = new THREE.Group();
  group.name = 'seacliff/props';
  const rng = ctx.rng.fork('props');
  const cloths: ClothHandle[] = [];
  const lamps: LampHandle[] = [];
  const emitters: EmitterSpec[] = [];
  const surfaces: WeatherSurface[] = [];
  const y = LAWN_TOP;

  /* —— 共用材质（重复元素一律 InstancedGroup，§5.6；同类 ≥3 必实例化）—— */
  const deckWoodMaterial = toonMaterials.get('wood', { color: CHANNELS.woodDeck, wetReactive: true, name: 'seacliff/deck-wood' });
  const postWoodMaterial = toonMaterials.get('wood', { color: '#a8825c', name: 'seacliff/post-wood' });
  const metalDarkMaterial = toonMaterials.get('metal', { color: '#4a4a50', name: 'seacliff/metal-dark' });

  /* — ① 遮阳天幕与折叠桌椅（ClothHandle 0.35 + clothTop + 桌椅复用 foldTable/foldChair）— */
  const tarp = createMicroCloth({
    assets,
    id: 'seacliff/tarp',
    width: 3.2,
    height: 2.6,
    color: CHANNELS.canvasTarp,
    stiffness: 0.35, // docs/05 §7.1.2 布料总表（海崖遮阳天幕）
    windFactor: 1.0,
    sagAmp: 0.06, // 五-3 积水下凹（uSag→ClothHandle 链，WindSystem 消费）
    swayAxes: ['x', 'z'],
    preset: 'canopy',
    droop: 0.1, // 2.1.2-①「预置下垂」
    dripAnchors: [new THREE.Vector3(-1.4, -0.12, 1.1), new THREE.Vector3(1.4, -0.12, 1.1)], // 布檐最低点（M1）
    doubleSided: true,
  });
  const tarpRoot = new THREE.Group();
  tarpRoot.name = 'seacliff/tarp-root';
  tarpRoot.position.set(-1.7, y, 1.35);
  tarpRoot.rotation.y = 0.12;
  tarp.mesh.position.y = 1.62;
  tarpRoot.add(tarp.mesh);
  group.add(tarpRoot);
  cloths.push(tarp.handle);
  // clothTop 作用面 + 雪壳（挂布料网格之下继承风摆与 sag——M4，§4.4.2 clothTop 行）
  const tarpSnow = new THREE.Mesh(
    assets.geometry('seacliff/tarp-snow', () => new THREE.PlaneGeometry(3.05, 2.45, 6, 5).rotateX(-Math.PI / 2)),
    makeSnowShellMaterial('seacliff/tarp-snow'),
  );
  tarpSnow.name = 'seacliff/tarp-snow';
  tarpSnow.position.y = 0.02;
  tarpSnow.userData.noOutline = true;
  tarpSnow.visible = false;
  tarp.mesh.add(tarpSnow);
  surfaces.push({ material: tarp.mesh.material as THREE.Material, kind: 'clothTop', snowShell: tarpSnow });

  // 4 支撑杆（1 DC）+ 2 拉绳（1 DC）
  const poleGeometry = assets.geometry('seacliff/tarp-poles', () => {
    const parts: THREE.BufferGeometry[] = [];
    const poleSpecs: readonly [number, number, number][] = [
      [-1.5, -1.2, 1.72],
      [1.5, -1.2, 1.72],
      [-1.5, 1.2, 1.5],
      [1.5, 1.2, 1.5],
    ];
    for (const [px, pz, ph] of poleSpecs) {
      const pole = new THREE.CylinderGeometry(0.022, 0.028, ph, 8);
      pole.translate(px, ph / 2, pz);
      parts.push(hardenEdges(pole));
    }
    const merged = mergeGeometries(parts);
    if (!merged) throw new Error('[seacliff] 天幕支撑杆合并失败');
    return merged;
  });
  const poles = new THREE.Mesh(poleGeometry, metalDarkMaterial);
  poles.name = 'seacliff/tarp-poles';
  poles.castShadow = true;
  tarpRoot.add(poles);
  const guyGeometry = assets.geometry('seacliff/tarp-guys', () => {
    const curves: readonly THREE.Vector3[][] = [
      [new THREE.Vector3(-1.5, 1.7, -1.2), new THREE.Vector3(-2.3, 0.01, -2.0)],
      [new THREE.Vector3(1.5, 1.7, -1.2), new THREE.Vector3(2.3, 0.01, -2.0)],
    ];
    const merged = mergeGeometries(curves.map((points) => tube({ pointsOrCurve: points, radius: 0.012, tubularSegments: 12 })));
    if (!merged) throw new Error('[seacliff] 天幕拉绳合并失败');
    return merged;
  });
  const guys = new THREE.Mesh(guyGeometry, toonMaterials.get('matteProp', { color: '#6a6258', name: 'seacliff/tarp-guys' }));
  guys.name = 'seacliff/tarp-guys';
  tarpRoot.add(guys);

  const table = createFoldTable({ assets, id: 'foldTable/camp' });
  table.name = 'seacliff/fold-table';
  table.position.set(-1.7, y, 1.35);
  table.rotation.y = 0.12;
  group.add(table);
  const chairs = createFoldChairSet({
    assets,
    name: 'seacliff/fold-chairs',
    fabricColor: '#6a8aa8',
    placements: [
      { position: [-2.45, y, 2.05], rotY: -0.55 },
      { position: [-1.0, y, 2.2], rotY: 0.5 },
    ],
  });
  group.add(chairs);

  /* — ② 串灯（CatmullRom 悬链 3 段 + 14 泡实例化 + halo 成对 2 DC；LampHandle blink 3s/0.3/0.4rad）— */
  const anchorA = new THREE.Vector3(-3.2, y + 1.72, 1.35); // 天幕左后杆顶（世界系）
  const anchorB = new THREE.Vector3(-0.25, y + 1.5, 2.55); // 天幕左前杆顶
  const anchorC = new THREE.Vector3(2.7, y + 1.72, 1.35); // 天幕右后杆顶
  const anchorD = new THREE.Vector3(-2.75, y + 1.44, 2.3); // 营地灯挂臂端
  const strandCurves = [
    new THREE.CatmullRomCurve3([anchorA, anchorA.clone().lerp(anchorD, 0.5).add(new THREE.Vector3(0, -0.22, 0)), anchorD]),
    new THREE.CatmullRomCurve3([anchorD, anchorD.clone().lerp(anchorB, 0.5).add(new THREE.Vector3(0, -0.2, 0)), anchorB]),
    new THREE.CatmullRomCurve3([anchorB, anchorB.clone().lerp(anchorC, 0.5).add(new THREE.Vector3(0, -0.24, 0)), anchorC]),
  ];
  const wireGeometry = assets.geometry('seacliff/string-wire', () => {
    const merged = mergeGeometries(strandCurves.map((curve) => tube({ pointsOrCurve: curve, radius: 0.008, tubularSegments: 28, radialSegments: 6 })));
    if (!merged) throw new Error('[seacliff] 串灯电线合并失败');
    return merged;
  });
  const wire = new THREE.Mesh(wireGeometry, toonMaterials.get('matteProp', { color: '#3a3d42', name: 'seacliff/string-wire' }));
  wire.name = 'seacliff/string-wire';
  group.add(wire);
  // 14 泡：沿 3 段曲线取点（7/4/3）；灯泡 InstancedMesh 1 DC + halo 成对 InstancedMesh 1 DC（2.1.2-②）
  const bulbMat = toonMaterials.getToon('matteProp', {
    color: '#d8d2c4',
    emissive: CHANNELS.lampWarm,
    emissiveIntensity: 1.4, // authored 基值：LightBreath 注册期快照后按 lampPower×blink 波形倍乘（不可为 0）
    name: 'seacliff/string-bulb',
  });
  const bulbGeometry = assets.geometry('seacliff/string-bulb', () => hardenEdges(new THREE.SphereGeometry(0.05, 8, 6)));
  const bulbGroup = new InstancedGroup(bulbGeometry, bulbMat, { capacity: 14, name: 'seacliff/string-bulbs' });
  const haloTexture = makeHaloTexture(assets, 'seacliff/tex/halo');
  const stringHaloMaterial = new THREE.MeshBasicMaterial({
    color: CHANNELS.lampWarm,
    map: haloTexture,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  });
  stringHaloMaterial.name = 'seacliff/string-halo';
  const haloGeometry = assets.geometry('seacliff/string-halo-quad', () => new THREE.PlaneGeometry(0.34, 0.34));
  const haloMesh = new THREE.InstancedMesh(haloGeometry, stringHaloMaterial, 14);
  haloMesh.name = 'seacliff/string-halos';
  haloMesh.count = 0;
  haloMesh.frustumCulled = false;
  haloMesh.renderOrder = 20;
  haloMesh.userData.noOutline = true;
  const tmpObj = new THREE.Object3D();
  const strandCounts: readonly number[] = [7, 4, 3];
  strandCurves.forEach((curve, si) => {
    const count = strandCounts[si] ?? 3;
    for (let i = 0; i < count; i++) {
      const t = 0.12 + (0.76 * i) / Math.max(1, count - 1);
      const p = curve.getPoint(t);
      tmpObj.position.copy(p).add(new THREE.Vector3(0, -0.075, 0));
      tmpObj.rotation.set(0, 0, 0);
      tmpObj.scale.setScalar(1);
      tmpObj.updateMatrix();
      bulbGroup.add(tmpObj.matrix, '#ffd9a0');
      // halo quad 朝常规机位（theta −0.62 / 仰角 30°）倾斜——「成对」贴花层，非受光面（§5.6 halo 层）
      tmpObj.rotation.set(-0.52, -0.62, 0);
      tmpObj.updateMatrix();
      haloMesh.setMatrixAt(Math.max(0, bulbGroup.count - 1), tmpObj.matrix);
    }
  });
  haloMesh.count = bulbGroup.count;
  haloMesh.instanceMatrix.needsUpdate = true;
  group.add(bulbGroup.group, haloMesh);
  const stringLamp: LampHandle = {
    emissiveMat: bulbMat,
    mode: 'blink', // 7-1-①：LightBreath blink 3s depth 0.3 stagger 0.4rad（★统一节奏，成组交错相位）
    params: { period: 3, depth: 0.3, stagger: 0.4 },
  };
  lamps.push(stringLamp);

  /* — ③ 烧烤炉（Lathe 烤碗+盖+3 腿+炭；炊烟 EmitterSpec steam）— */
  const grill = createGrill({ assets, id: 'campfire/grill-seacliff' });
  grill.group.name = 'seacliff/grill';
  grill.group.position.set(1.35, y, 1.5);
  grill.group.rotation.y = -0.4;
  group.add(grill.group);
  propsRef.coalMaterial = grill.coalMaterial;
  // EmitterSpec（docs/05 §7.1.3 steam 行：rate 2.2×smokePower+0.4 / life 3.5 / 0.05→0.25 / 0.22m/s↑+风漂；
  // rate 基值取白天 2.6。注记：场景发射器锚点由 Director 统一取 campAnchor（director.ts 注册路径），
  // smokePower 逐帧调制归 Director/T33 侧 emitterHandles——场景 lightHooks 无 setRate 通路，见 openIssues。）
  emitters.push({
    kind: 'steam',
    area: new THREE.Vector3(3.0, 1.3, 1.7),
    rate: 2.6,
    lifetime: 3.5,
    size0: 0.05,
    size1: 0.25,
    vel0: new THREE.Vector3(0.02, 0.22, 0.01),
    color: '#e8e4dc',
    opacity: 0.34,
    additive: false,
  });

  /* — ④ 野餐垫（gingham Canvas + 纸巾 ClothHandle 0.85 + 垫顶 clothTop + 早餐餐具 J4）— */
  const ginghamTexture = assets.texture('seacliff/tex/gingham', () => paintCanvasTexture('seacliff/tex/gingham', 128, 128, drawGingham));
  ginghamTexture.repeat.set(3, 2.4);
  const matMaterial = toonMaterials.get('cloth', { color: '#ffffff', map: ginghamTexture, name: 'seacliff/picnic-mat' });
  const matMesh = new THREE.Mesh(
    assets.geometry('seacliff/picnic-mat', () => new THREE.PlaneGeometry(2.0, 1.5, 1, 1).rotateX(-Math.PI / 2)),
    matMaterial,
  );
  matMesh.name = 'seacliff/picnic-mat';
  matMesh.position.set(-1.7, y + 0.012, 3.15);
  matMesh.rotation.y = 0.12;
  matMesh.receiveShadow = true;
  group.add(matMesh);
  const matSnow = new THREE.Mesh(
    assets.geometry('seacliff/mat-snow', () => new THREE.PlaneGeometry(1.9, 1.4).rotateX(-Math.PI / 2)),
    makeSnowShellMaterial('seacliff/mat-snow'),
  );
  matSnow.name = 'seacliff/mat-snow';
  matSnow.position.y = 0.012;
  matSnow.userData.noOutline = true;
  matSnow.visible = false;
  matMesh.add(matSnow);
  surfaces.push({ material: matMaterial, kind: 'clothTop', snowShell: matSnow });

  // 纸巾（ClothHandle stiffness 0.85，7-1-⑦ 阵风轻掀 → boostCloth ×2.2/0.8s）
  const towel = createMicroCloth({
    assets,
    id: 'seacliff/towel',
    width: 0.36,
    height: 0.28,
    color: '#eef0f2',
    stiffness: 0.85, // docs/05 §7.1.2「野餐垫纸巾」
    windFactor: 0.8,
    swayAxes: ['y', 'z'],
    preset: null,
    doubleSided: true,
  });
  towel.mesh.rotation.set(-Math.PI / 2, 0, 0.5);
  towel.mesh.position.set(-2.5, y + 0.035, 3.0);
  group.add(towel.mesh);
  cloths.push(towel.handle);
  propsRef.towelMesh = towel.mesh;

  // 早餐餐具 breakfastSet（J4 主展示位：盘×2+杯×2+壶；docs/05 §4.3.3-③ Lathe 一套，仅 dawn 出现）
  const breakfastSet = buildBreakfastSet(assets);
  breakfastSet.name = 'seacliff/breakfast-set';
  breakfastSet.position.set(-1.7, y + 0.665, 1.35);
  breakfastSet.rotation.y = 0.12;
  breakfastSet.visible = false;
  group.add(breakfastSet);
  propsRef.breakfastSet = breakfastSet;
  propsRef.breakfastFadeMats = collectMeshMaterials(breakfastSet);

  /* — ⑤ 小营地灯（Lathe 灯笼罩+emissive 内芯；breath 1.5s depth 0.55；castReflection）— */
  const lampRoot = new THREE.Group();
  lampRoot.name = 'seacliff/camp-lamp';
  lampRoot.position.set(-3.2, y, 2.3);
  const lampPole = new THREE.Mesh(
    assets.geometry('seacliff/camp-lamp-pole', () => {
      const pole = new THREE.CylinderGeometry(0.024, 0.03, 1.5, 8);
      pole.translate(0, 0.75, 0);
      const arm = new THREE.CylinderGeometry(0.016, 0.016, 0.5, 6);
      arm.rotateZ(Math.PI / 2);
      arm.translate(0.22, 1.44, 0);
      const merged = mergeGeometries([hardenEdges(pole), hardenEdges(arm)]);
      if (!merged) throw new Error('[seacliff] 营地灯杆合并失败');
      return merged;
    }),
    metalDarkMaterial,
  );
  lampPole.name = 'seacliff/camp-lamp-pole';
  lampPole.castShadow = true;
  lampRoot.add(lampPole);
  const shade = new THREE.Mesh(
    assets.geometry('seacliff/camp-lamp-shade', () =>
      lathe({
        profile: [
          [0.045, 0.3],
          [0.11, 0.24],
          [0.145, 0.12],
          [0.135, 0.02],
          [0.06, 0.0],
        ],
        segments: 14,
      }),
    ),
    toonMaterials.get('matteProp', { color: '#e8e2d4', name: 'seacliff/camp-lamp-shade' }),
  );
  shade.name = 'seacliff/camp-lamp-shade';
  shade.position.set(0.45, 1.38, 0);
  shade.castShadow = true;
  lampRoot.add(shade);
  const coreMat = toonMaterials.getToon('matteProp', {
    color: '#f5e6c8',
    emissive: CHANNELS.lampWarm,
    emissiveIntensity: 1.5, // authored 基值（breath 1.5s depth 0.55 倍乘后 dawn≈0.07~0.23 起伏）
    name: 'seacliff/camp-lamp-core',
  });
  const core = new THREE.Mesh(assets.geometry('seacliff/camp-lamp-core', () => new THREE.SphereGeometry(0.055, 8, 6)), coreMat);
  core.name = 'seacliff/camp-lamp-core';
  core.position.set(0.45, 1.44, 0);
  lampRoot.add(core);
  const lampHalo = makeHaloSprite(assets, 'seacliff/camp-lamp-halo', 0.62, CHANNELS.lampWarm);
  lampHalo.position.set(0.45, 1.44, 0);
  lampRoot.add(lampHalo);
  const campLamp: LampHandle = {
    emissiveMat: coreMat,
    halo: lampHalo,
    mode: 'breath', // docs/05 §7.1.4：breath 1.5s depth 0.55（dawn 0.15 → 亮度 0.07~0.23「将熄未熄」）
    params: { period: 1.5, depth: 0.55 },
    castReflection: true, // M4：近地强灯雨天反光条（每场景 ≤6 盏）
  };
  lamps.push(campLamp);
  group.add(lampRoot);

  /* — ⑥ 防水地垫（Box+棱纹；WeatherSurface ground）— */
  const doormatMaterial = toonMaterials.get('groundTerrain', { color: '#5f6a58', name: 'seacliff/doormat' });
  const doormat = new THREE.Mesh(
    assets.geometry('seacliff/doormat', () => {
      const parts: THREE.BufferGeometry[] = [];
      const base = roundedBox({ width: 1.1, height: 0.035, depth: 0.62, radius: 0.02 });
      base.translate(0, 0.018, 0);
      parts.push(hardenEdges(base));
      for (let i = 0; i < 7; i++) {
        const rib = roundedBox({ width: 0.045, height: 0.055, depth: 0.56, radius: 0.01 });
        rib.translate(-0.42 + i * 0.14, 0.032, 0);
        parts.push(hardenEdges(rib));
      }
      const merged = mergeGeometries(parts);
      if (!merged) throw new Error('[seacliff] 地垫合并失败');
      return merged;
    }),
    doormatMaterial,
  );
  doormat.name = 'seacliff/doormat';
  doormat.position.set(0.35, y, 2.75);
  doormat.rotation.y = 0.15;
  doormat.castShadow = true;
  doormat.receiveShadow = true;
  group.add(doormat);
  surfaces.push({ material: doormatMaterial, kind: 'ground' });

  /* — ⑦ 水电桩与管线（桩+卷盘+Tube 管线；J8 止于营位边缘地环不接触车型）— */
  const utilityPost = new THREE.Group();
  utilityPost.name = 'seacliff/utility-post';
  utilityPost.position.set(3.3, y, 0.35);
  utilityPost.rotation.y = -0.2;
  const postBody = new THREE.Mesh(
    assets.geometry('seacliff/utility-body', () => {
      const parts: THREE.BufferGeometry[] = [];
      const body = roundedBox({ width: 0.2, height: 1.02, depth: 0.16, radius: 0.02 });
      body.translate(0, 0.51, 0);
      parts.push(hardenEdges(body));
      const cap = roundedBox({ width: 0.26, height: 0.05, depth: 0.22, radius: 0.015 });
      cap.translate(0, 1.04, 0);
      parts.push(hardenEdges(cap));
      for (const [ox, oz] of [
        [-0.06, 0.085],
        [0.06, 0.085],
      ] as const) {
        const outlet = roundedBox({ width: 0.07, height: 0.09, depth: 0.03, radius: 0.008 });
        outlet.translate(ox, 0.82, oz);
        parts.push(hardenEdges(outlet));
      }
      const merged = mergeGeometries(parts);
      if (!merged) throw new Error('[seacliff] 水电桩合并失败');
      return merged;
    }),
    toonMaterials.get('concrete', { color: '#9aa0a2', name: 'seacliff/utility-body' }),
  );
  postBody.name = 'seacliff/utility-body';
  postBody.castShadow = true;
  utilityPost.add(postBody);
  group.add(utilityPost);
  const reel = createHoseReel({ assets, id: 'gardenHose/seacliff' });
  reel.name = 'seacliff/hose-reel';
  reel.position.set(3.06, y, 0.62);
  reel.rotation.y = 2.6;
  group.add(reel);
  const hose = createHoseRun({
    assets,
    id: 'gardenHose/seacliff-run',
    points: [
      new THREE.Vector3(2.98, y + 0.46, 0.72),
      new THREE.Vector3(2.5, y + 0.1, 1.15),
      new THREE.Vector3(2.05, y + 0.05, 1.7),
      new THREE.Vector3(1.75, y + 0.03, 2.2),
    ],
    radius: 0.028,
  });
  hose.name = 'seacliff/hose-run';
  group.add(hose);

  /* — ⑧ 小型折叠自行车（bicycle 部件，车型章 3.2/3.3 复用）— */
  const bicycle = createFoldBicycle({ assets, id: 'bicycle/seacliff', frameColor: '#3f6fa8' });
  bicycle.name = 'seacliff/bicycle';
  bicycle.position.set(2.5, y, 0.05);
  bicycle.rotation.y = 1.15;
  group.add(bicycle);

  /* — ⑨ 木栈道（板 ~36 沿路径实例化；栈道顶 roofTop）— */
  const deckCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.2, y, -1.35),
    new THREE.Vector3(1.3, y + 0.005, -1.85),
    new THREE.Vector3(2.5, y, -2.3),
    new THREE.Vector3(3.25, y, -2.62),
  ]);
  const deckGeometry = assets.geometry('seacliff/deck-board', () =>
    hardenEdges(roundedBox({ width: 0.58, height: 0.045, depth: 0.26, radius: 0.012 })),
  );
  const deckGroup = new InstancedGroup(deckGeometry, deckWoodMaterial, {
    capacity: 36,
    withShell: true,
    name: 'seacliff/deck-boards',
    jitter: { hue: 0.008, saturation: 0.03, lightness: 0.04 },
  });
  const deckMatrix = new THREE.Matrix4();
  for (let i = 0; i < 36; i++) {
    const t = i / 35;
    const p = deckCurve.getPointAt(clamp(t, 0, 1));
    const tangent = deckCurve.getTangentAt(clamp(t, 0.001, 0.999));
    deckMatrix.identity().setPosition(p.x, p.y + 0.024, p.z);
    deckMatrix.multiply(new THREE.Matrix4().makeRotationY(Math.atan2(tangent.x, tangent.z) + (rng.next() - 0.5) * 0.06));
    deckGroup.add(deckMatrix, CHANNELS.woodDeck);
  }
  group.add(deckGroup.group);
  // 栈道顶雪壳（roofTop，五-5 枚举部位；沿路径 ribbon）
  const deckSnow = new THREE.Mesh(buildRibbonGeometry(assets, 'seacliff/deck-snow', deckCurve, 0.34, y + 0.052), makeSnowShellMaterial('seacliff/deck-snow'));
  deckSnow.name = 'seacliff/deck-snow';
  deckSnow.userData.noOutline = true;
  deckSnow.visible = false;
  group.add(deckSnow);
  surfaces.push({ material: deckWoodMaterial, kind: 'roofTop', snowShell: deckSnow });

  /* — ⑩ 崖边护栏（桩 ~14 + 扶手/中横杆 Tube 沿崖缘；顶杆 roofTop）— */
  const railSpan: readonly [number, number] = [-4.2, 2.3];
  const railOffset = 0.62;
  const railCurve = new THREE.CatmullRomCurve3(
    Array.from({ length: 9 }, (_, i) => {
      const x = railSpan[0] + ((railSpan[1] - railSpan[0]) * i) / 8;
      return new THREE.Vector3(x, y, cliffEdgeZ(x) + railOffset);
    }),
  );
  const railPostGeometry = assets.geometry('seacliff/rail-post', () =>
    hardenEdges(roundedBox({ width: 0.07, height: 0.85, depth: 0.07, radius: 0.012 })),
  );
  const railPosts = new InstancedGroup(railPostGeometry, postWoodMaterial, { capacity: 14, withShell: true, name: 'seacliff/rail-posts' });
  const railMatrix = new THREE.Matrix4();
  for (let i = 0; i < 14; i++) {
    const p = railCurve.getPointAt(i / 13);
    railMatrix.identity().setPosition(p.x, p.y + 0.425, p.z);
    railPosts.add(railMatrix, '#a8825c');
  }
  group.add(railPosts.group);
  const railGeometry = assets.geometry('seacliff/rail-bars', () => {
    const merged = mergeGeometries([
      tube({ pointsOrCurve: offsetRailCurve(railCurve, 0.85), radius: 0.032, tubularSegments: 32 }),
      tube({ pointsOrCurve: offsetRailCurve(railCurve, 0.5), radius: 0.024, tubularSegments: 32 }),
    ]);
    if (!merged) throw new Error('[seacliff] 护栏横杆合并失败');
    return merged;
  });
  const railBarMaterial = toonMaterials.get('wood', { color: '#b08a5e', name: 'seacliff/rail-bars' });
  const railBars = new THREE.Mesh(railGeometry, railBarMaterial);
  railBars.name = 'seacliff/rail-bars';
  railBars.castShadow = true;
  group.add(railBars);
  const railSnow = new THREE.Mesh(
    tube({ pointsOrCurve: offsetRailCurve(railCurve, 0.885), radius: 0.045, tubularSegments: 32 }),
    makeSnowShellMaterial('seacliff/rail-snow'),
  );
  railSnow.name = 'seacliff/rail-snow';
  railSnow.userData.noOutline = true;
  railSnow.visible = false;
  group.add(railSnow);
  surfaces.push({ material: railBarMaterial, kind: 'roofTop', snowShell: railSnow });

  /* — ⑪ 观景长椅（benchSlat，面海放置）— */
  const bench = createBench({ assets, id: 'benchSlat/seacliff-view', withBackrest: true, slatColor: '#a8825c' });
  bench.name = 'seacliff/view-bench';
  bench.position.set(-2.4, y, -3.15);
  bench.rotation.y = 0.18;
  group.add(bench);

  /* — ⑫ 路牌（signBoard 双板；J6 日英双语）— */
  const sign = createSignBoard({
    assets,
    id: 'signBoard/seacliff',
    faces: [
      { lines: ['潮見岬'], subLines: ['Shiomi-misaki'] },
      { lines: ['Sea Cliff Camp'], subLines: ['ウェストコースト 1.2km'], arrow: 'right' },
    ],
    postHeight: 1.4,
  });
  sign.name = 'seacliff/sign';
  sign.position.set(3.0, y, -2.95);
  sign.rotation.y = -0.45;
  group.add(sign);

  /* — ⑬ 海草与礁石（礁石 ×12、草簇 ×20 实例化；海草走植被风摆通道 P2）— */
  const shoreRockMaterial = toonMaterials.get('metal', { color: CHANNELS.cliffRock, name: 'seacliff/shore-rock' });
  const rockA = createRockGeometry({ assets, id: 'rockCluster/shore-a', radius: 0.3, jitter: 0.3 });
  const rockB = createRockGeometry({ assets, id: 'rockCluster/shore-b', radius: 0.19, jitter: 0.34 });
  const rockPlacements: { position: [number, number, number]; scale: number; rotY: number }[] = [];
  for (let i = 0; i < 7; i++) {
    // 崖脚半浸礁石（沿崖缘海侧）
    const x = -7.5 + i * 2.15 + rng.next() * 0.6;
    rockPlacements.push({
      position: [x, BED_Y + 0.14, cliffEdgeZ(clamp(x, -9.5, 9.5)) - 0.75 - rng.next() * 0.3],
      scale: 0.75 + rng.next() * 0.75,
      rotY: rng.next() * Math.PI * 2,
    });
  }
  for (let i = 0; i < 3; i++) {
    // 湾内礁石（沙地上）
    rockPlacements.push({
      position: [3.6 + i * 0.9, SAND_Y + 0.02, -3.35 - i * 0.35],
      scale: 0.5 + rng.next() * 0.4,
      rotY: rng.next() * Math.PI * 2,
    });
  }
  for (let i = 0; i < 2; i++) {
    // 防波堤根乱石
    rockPlacements.push({
      position: [-4.7 + i * 2.6, BED_Y + 0.16, -7.0 - i * 1.5],
      scale: 0.6 + rng.next() * 0.5,
      rotY: rng.next() * Math.PI * 2,
    });
  }
  const rocks = createRockSet({
    assets,
    name: 'seacliff/rocks',
    material: shoreRockMaterial,
    geometries: [rockA, rockB],
    placements: rockPlacements,
  });
  rocks.name = 'seacliff/rocks';
  group.add(rocks);

  // 海草（foliage 原型 + P2 植被风摆注入——wind.ts 用法注记点名 T18）
  const weedGeometry = assets.geometry('seacliff/seaweed-tuft', () => buildSeaweedGeometry());
  const weedMaterial = toonMaterials.get('foliage', { color: '#3f6e4e', name: 'seacliff/seaweed' });
  injectVegetationWind(weedMaterial, { ampU: 0.05, freqHz: 0.8, heightU: 0.52, phase: 1.3 }); // P2（海草）
  const weeds = new InstancedGroup(weedGeometry, weedMaterial, { capacity: 20, name: 'seacliff/seaweeds' });
  const weedMatrix = new THREE.Matrix4();
  for (let i = 0; i < 20; i++) {
    let wx: number;
    let wz: number;
    let wy: number;
    if (i < 12) {
      wx = 3.4 + rng.next() * 2.8;
      wz = -3.5 + rng.next() * 1.6;
      wy = SAND_Y; // 湾沙草簇
    } else {
      wx = -8.5 + rng.next() * 15;
      wz = cliffEdgeZ(clamp(wx, -9.5, 9.5)) + 0.75 + rng.next() * 0.5;
      wy = y; // 崖缘草簇
    }
    weedMatrix.identity().setPosition(wx, wy, wz);
    weedMatrix.multiply(new THREE.Matrix4().makeRotationY(rng.next() * Math.PI * 2));
    weeds.add(weedMatrix, '#3f6e4e');
  }
  group.add(weeds.group);

  /* — ⑭ 通往小海湾的石阶（之字台阶 ×22 实例化 + 休息平台板）— */
  const stepGeometry = assets.geometry('seacliff/step', () =>
    hardenEdges(roundedBox({ width: 0.5, height: 0.05, depth: 0.2, radius: 0.01 })),
  );
  const stepMaterial = toonMaterials.get('wood', { color: '#b08a5e', name: 'seacliff/steps' });
  const steps = new InstancedGroup(stepGeometry, stepMaterial, { capacity: 22, withShell: true, name: 'seacliff/steps' });
  const stepMatrix = new THREE.Matrix4();
  // 之字两段：第一段沿崖壁横移下行 → 休息平台 → 第二段转落湾沙
  const flight1 = { origin: new THREE.Vector3(3.0, y - 0.05, -2.05), dir: new THREE.Vector3(0.98, 0, -0.19).normalize(), run: 0.132 };
  const flight2 = { origin: new THREE.Vector3(4.5, y - 0.36, -2.52), dir: new THREE.Vector3(0.4, 0, -0.92).normalize(), run: 0.12 };
  const rise = 0.029;
  for (let i = 0; i < 22; i++) {
    const second = i >= 11;
    const idx = second ? i - 11 : i;
    const flight = second ? flight2 : flight1;
    const px = flight.origin.x + flight.dir.x * flight.run * idx;
    const pz = flight.origin.z + flight.dir.z * flight.run * idx;
    const py = flight.origin.y - rise * idx;
    stepMatrix.identity().setPosition(px, py, pz);
    stepMatrix.multiply(new THREE.Matrix4().makeRotationY(Math.atan2(flight.dir.x, flight.dir.z)));
    steps.add(stepMatrix, '#b08a5e');
  }
  group.add(steps.group);
  const platform = new THREE.Mesh(
    assets.geometry('seacliff/step-platform', () => hardenEdges(roundedBox({ width: 0.72, height: 0.05, depth: 0.6, radius: 0.012 }))),
    stepMaterial,
  );
  platform.name = 'seacliff/step-platform';
  platform.position.set(4.32, y - 0.345, -2.3);
  platform.rotation.y = 0.3;
  platform.castShadow = true;
  group.add(platform);

  /* — ⑮ 帆船与防波堤灯塔（named sailboat；LampHandle rotate 0.25rad/s + 2 对置光束锥 additive）— */
  buildBoatAndBreakwater(assets, group, lamps);

  // — 天幕前缘滴水占位（五-3「天幕前缘滴水（drip emitter）」；rate 0 基值待 T33 天气门控接
  //   emitterHandles 后调制 2.5/点——场景 lightHooks 无 setRate 通路，见 openIssues）—
  emitters.push({
    kind: 'drip',
    area: new THREE.Vector3(2.4, 0.15, 0.3),
    rate: 0,
    lifetime: 0.8,
    size0: 0.015,
    size1: 0.015,
    vel0: new THREE.Vector3(0, -3, 0),
    color: '#b8d4e8',
    opacity: 0.5,
    additive: false,
  });

  /* — 露水 sparkle 层（docs/05 §4.3.3-④ dawn 露水：40~60 个 sparkle，1 DC）— */
  const sparkleGeometry = assets.geometry('seacliff/dew-sparkle', () => new THREE.PlaneGeometry(0.09, 0.09));
  const sparkleMaterial = new THREE.MeshBasicMaterial({
    color: '#e8f4ff',
    map: haloTexture,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  });
  sparkleMaterial.name = 'seacliff/dew-sparkles';
  const sparkles = new THREE.InstancedMesh(sparkleGeometry, sparkleMaterial, 52);
  sparkles.name = 'seacliff/dew-sparkles';
  sparkles.count = 52;
  sparkles.frustumCulled = false;
  sparkles.renderOrder = 20;
  sparkles.userData.noOutline = true;
  for (let i = 0; i < 52; i++) {
    const onMat = i < 16;
    tmpObj.position.set(
      onMat ? -1.7 + (rng.next() - 0.5) * 1.8 : -6 + rng.next() * 10,
      onMat ? y + 0.035 : y + 0.022,
      onMat ? 3.15 + (rng.next() - 0.5) * 1.3 : -1 + rng.next() * 6,
    );
    tmpObj.rotation.set(-Math.PI / 2 + 0.2, 0, rng.next() * Math.PI);
    tmpObj.scale.setScalar(0.6 + rng.next() * 0.8);
    tmpObj.updateMatrix();
    sparkles.setMatrixAt(i, tmpObj.matrix);
  }
  sparkles.instanceMatrix.needsUpdate = true;
  group.add(sparkles);
  propsRef.sparkleMaterial = sparkleMaterial;

  propsRef.stringLamp = stringLamp;
  propsRef.campLamp = campLamp;
  propsRef.stringHaloMaterial = stringHaloMaterial;

  /* — 暖车窗光贴花（黄昏行为表：op=interiorGlow×0.35 铺营位地面——D2 派生量，场景解释为车外衬光）— */
  const groundGlowMaterial = new THREE.MeshBasicMaterial({
    color: '#ffb26e',
    map: haloTexture,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  });
  groundGlowMaterial.name = 'seacliff/ground-glow';
  const groundGlow = new THREE.Mesh(
    assets.geometry('seacliff/ground-glow', () => new THREE.PlaneGeometry(4.2, 3.4).rotateX(-Math.PI / 2)),
    groundGlowMaterial,
  );
  groundGlow.name = 'seacliff/ground-glow';
  groundGlow.position.set(0, y + 0.018, 0.8); // 营位锚点地面（车型停驻处，光从车窗洒出）
  groundGlow.renderOrder = 20;
  groundGlow.userData.noOutline = true;
  group.add(groundGlow);
  propsRef.groundGlowMaterial = groundGlowMaterial;

  return { group, named: { sailboat: propsRef.sailboat!, breakfastSet }, cloths, lamps, emitters, weatherSurfaces: surfaces };
}

/* ============================== ⑮ 帆船/防波堤/灯塔（2.1.2-⑮） ============================== */

function buildBoatAndBreakwater(assets: SceneBuildContext['assets'], group: THREE.Group, lamps: LampHandle[]): void {
  // —— 帆船（named `sailboat`；Lathe 船壳+桅杆+主帆/前帆；空船自动航行，一.6 无人物）——
  const boat = new THREE.Group();
  boat.name = 'seacliff/sailboat';
  const inner = new THREE.Group(); // 起伏/摇摆内层（位置由 lightHooks.update 驱动）
  inner.name = 'seacliff/sailboat-inner';
  boat.add(inner);

  const hull = new THREE.Mesh(
    assets.geometry('seacliff/boat-hull', () => {
      const hullGeo = lathe({
        profile: [
          [0.0, 0.0],
          [0.16, 0.005],
          [0.27, 0.08],
          [0.31, 0.18],
          [0.3, 0.28],
          [0.26, 0.34],
          [0.18, 0.37],
        ],
        segments: 14,
      });
      hullGeo.scale(1, 1, 1.9); // 拉长船壳
      return hardenEdges(hullGeo);
    }),
    toonMaterials.get('matteProp', { color: '#e8e4da', name: 'seacliff/boat-hull' }),
  );
  hull.name = 'seacliff/boat-hull';
  hull.castShadow = true;
  inner.add(hull);
  const gunwale = new THREE.Mesh(
    assets.geometry('seacliff/boat-gunwale', () => {
      const rim = new THREE.TorusGeometry(0.27, 0.022, 6, 16);
      rim.rotateX(Math.PI / 2);
      rim.scale(1, 1, 1.9);
      return rim;
    }),
    toonMaterials.get('wood', { color: '#8a6a48', name: 'seacliff/boat-gunwale' }),
  );
  gunwale.position.y = 0.37;
  inner.add(gunwale);
  const deck = new THREE.Mesh(
    assets.geometry('seacliff/boat-deck', () => {
      const disc = new THREE.CylinderGeometry(0.27, 0.27, 0.02, 14);
      disc.scale(1, 1, 1.9);
      return disc;
    }),
    toonMaterials.get('wood', { color: '#b08a5e', name: 'seacliff/boat-deck' }),
  );
  deck.position.y = 0.345;
  inner.add(deck);
  const mast = new THREE.Mesh(
    assets.geometry('seacliff/boat-mast', () => new THREE.CylinderGeometry(0.018, 0.024, 1.5, 8)),
    toonMaterials.get('wood', { color: '#8a6a48', name: 'seacliff/boat-mast' }),
  );
  mast.name = 'seacliff/boat-mast';
  mast.position.set(0.02, 1.05, 0.05);
  mast.castShadow = true;
  inner.add(mast);
  const mainSailMat = toonMaterials.get('cloth', { color: CHANNELS.sailWhite, name: 'seacliff/sail-main' });
  mainSailMat.side = THREE.DoubleSide; // 唯一 name 缓存键 → 改 side 不影响其他布料（工厂无 side 参数）
  const mainSail = new THREE.Mesh(
    buildSailGeometry('seacliff/sail-main', 0.62, 0.95),
    mainSailMat,
  );
  mainSail.name = 'seacliff/sail-main';
  mainSail.position.set(0.11, 1.02, 0.05);
  mainSail.rotation.y = 0.18;
  mainSail.castShadow = true;
  inner.add(mainSail);
  const jibMat = toonMaterials.get('cloth', { color: CHANNELS.sailWhite, name: 'seacliff/sail-jib' });
  jibMat.side = THREE.DoubleSide;
  const jib = new THREE.Mesh(
    buildSailGeometry('seacliff/sail-jib', 0.34, 0.5),
    jibMat,
  );
  jib.name = 'seacliff/sail-jib';
  jib.position.set(0.05, 0.88, 0.5);
  jib.rotation.y = -0.5;
  inner.add(jib);
  // 桅灯（泊港灯点微亮——场景 lightHooks 驱动，不注册进 LightBreath 以保持「3 lamps」口径）
  const mastLampMaterial = toonMaterials.getToon('matteProp', {
    color: '#f5e6c8',
    emissive: CHANNELS.lampWarm,
    emissiveIntensity: 1.1, // 场景 lightHooks.update 逐帧写 1.1×boatLamp（泊港灯点微亮）
    name: 'seacliff/boat-mast-lamp',
  });
  const mastLamp = new THREE.Mesh(assets.geometry('seacliff/boat-mast-lamp', () => new THREE.SphereGeometry(0.035, 8, 6)), mastLampMaterial);
  mastLamp.name = 'seacliff/boat-mast-lamp';
  mastLamp.position.set(0.02, 1.83, 0.05);
  inner.add(mastLamp);
  boat.position.set(BOAT_DUSK.x, SEA_Y, BOAT_DUSK.z); // 首帧由 applyLighting(blend=1) 对位
  boat.rotation.y = BOAT_DUSK.heading;
  group.add(boat);
  propsRef.sailboat = boat;
  propsRef.sailboatInner = inner;
  propsRef.mastLampMaterial = mastLampMaterial;

  // —— 防波堤两段（乱石并入 ⑬ rockSet）——
  const breakwaterMaterial = toonMaterials.get('concrete', { color: '#8d8578', name: 'seacliff/breakwater' });
  const bwGeometry = assets.geometry('seacliff/breakwater', () => {
    const seg = roundedBox({ width: 2.9, height: 0.5, depth: 0.62, radius: 0.05 });
    seg.translate(0, 0.12, 0);
    return hardenEdges(seg);
  });
  const bw1 = new THREE.Mesh(bwGeometry, breakwaterMaterial);
  bw1.name = 'seacliff/breakwater-1';
  bw1.position.set(-5.0, SEA_Y - 0.12, -6.8);
  bw1.rotation.y = 0.82;
  bw1.castShadow = true;
  group.add(bw1);
  const bw2 = new THREE.Mesh(bwGeometry, breakwaterMaterial);
  bw2.name = 'seacliff/breakwater-2';
  bw2.position.set(-6.6, SEA_Y - 0.12, -8.3);
  bw2.rotation.y = 0.82;
  bw2.castShadow = true;
  group.add(bw2);

  // —— 灯塔（Lathe 收腰塔身红白环带+红锥顶+灯室；LampHandle rotate 0.25rad/s + 2 对置光束锥）——
  const towerRoot = new THREE.Group();
  towerRoot.name = 'seacliff/lighthouse';
  towerRoot.position.set(-7.55, SEA_Y - 0.08, -9.15);
  const tower = new THREE.Mesh(
    assets.geometry('seacliff/lighthouse-tower', () =>
      lathe({
        profile: [
          [0.34, 0],
          [0.3, 0.28],
          [0.22, 0.72],
          [0.19, 1.05],
          [0.21, 1.16],
          [0.2, 1.2],
        ],
        segments: 16,
      }),
    ),
    toonMaterials.get('matteProp', { color: '#ffffff', map: assets.texture('seacliff/tex/lighthouse-bands', () => paintCanvasTexture('seacliff/tex/lighthouse-bands', 128, 128, drawLighthouseBands)), name: 'seacliff/lighthouse-tower' }),
  );
  tower.name = 'seacliff/lighthouse-tower';
  tower.castShadow = true;
  towerRoot.add(tower);
  const gallery = new THREE.Mesh(
    assets.geometry('seacliff/lighthouse-gallery', () => new THREE.CylinderGeometry(0.3, 0.3, 0.05, 16)),
    toonMaterials.get('metal', { color: '#4a4a50', name: 'seacliff/lighthouse-gallery' }),
  );
  gallery.position.y = 1.24;
  towerRoot.add(gallery);
  const lampRoomMat = toonMaterials.getToon('matteProp', {
    color: '#3a3d44',
    emissive: '#ffd9a0',
    emissiveIntensity: 1.3, // authored 基值（rotate 灯；beacon 由 setLampPower 场景映射 dusk 0.4/night 1.0）
    name: 'seacliff/lighthouse-lamproom',
  });
  const lampRoom = new THREE.Mesh(
    assets.geometry('seacliff/lighthouse-lamproom', () => new THREE.CylinderGeometry(0.14, 0.14, 0.22, 12)),
    lampRoomMat,
  );
  lampRoom.name = 'seacliff/lighthouse-lamproom';
  lampRoom.position.y = 1.38;
  towerRoot.add(lampRoom);
  const roof = new THREE.Mesh(
    assets.geometry('seacliff/lighthouse-roof', () => new THREE.ConeGeometry(0.19, 0.24, 12)),
    toonMaterials.get('matteProp', { color: '#c8493f', name: 'seacliff/lighthouse-roof' }),
  );
  roof.name = 'seacliff/lighthouse-roof';
  roof.position.y = 1.62;
  roof.castShadow = true;
  towerRoot.add(roof);
  const towerHalo = makeHaloSprite(assets, 'seacliff/lighthouse-halo', 0.85, '#ffd9a0');
  towerHalo.position.y = 1.4;
  towerRoot.add(towerHalo);
  // 2 对置光束锥（additive 渐隐 alpha 贴图，docs/04 §5.8 光束锥行；旋转由场景 update 与 rotate 灯同步）
  const beamTexture = assets.texture('seacliff/tex/beam', () =>
    paintCanvasTexture('seacliff/tex/beam', 64, 128, (c, w, h) => {
      // 渐变沿贴图 v（=锥体轴向）：v=0（灯室端）亮 → v=1（远端）透明
      const grad = c.createLinearGradient(0, h, 0, 0);
      grad.addColorStop(0, 'rgba(255,255,255,0.7)');
      grad.addColorStop(0.5, 'rgba(255,255,255,0.2)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = grad;
      c.fillRect(0, 0, w, h);
    }, true),
  );
  const beamGroup = new THREE.Group();
  beamGroup.name = 'seacliff/lighthouse-beams';
  beamGroup.position.y = 1.38;
  const beamMaterials: THREE.MeshBasicMaterial[] = [];
  for (const dir of [1, -1]) {
    const beamMaterial = new THREE.MeshBasicMaterial({
      color: '#ffd9a0',
      map: beamTexture,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    beamMaterial.name = `seacliff/lighthouse-beam-${dir}`;
    const cone = new THREE.ConeGeometry(0.62, 3.0, 12, 1, true);
    cone.rotateZ((dir * Math.PI) / 2); // 锥轴 +y → ±x（灯室端=锥尖）
    cone.translate(dir * 1.5, 0, 0);
    const beam = new THREE.Mesh(assets.geometry(`seacliff/lighthouse-beam-${dir}`, () => cone), beamMaterial);
    beam.name = `seacliff/lighthouse-beam-${dir}`;
    beam.userData.noOutline = true;
    beam.renderOrder = 20;
    beamGroup.add(beam);
    beamMaterials.push(beamMaterial);
  }
  towerRoot.add(beamGroup);
  group.add(towerRoot);
  propsRef.beamGroup = beamGroup;
  propsRef.beamMaterials = beamMaterials;

  const lighthouseLamp: LampHandle = {
    emissiveMat: lampRoomMat,
    halo: towerHalo,
    mode: 'rotate', // 7-1-④★：0.25rad/s ≈25s/圈
    params: { speed: 0.25 },
  };
  lamps.push(lighthouseLamp);
  propsRef.lighthouseLamp = lighthouseLamp;
}

/* ============================== 早餐餐具（J4；Lathe 盘/杯/壶，docs/05 §4.3.3-③） ============================== */

function buildBreakfastSet(assets: SceneBuildContext['assets']): THREE.Group {
  const group = new THREE.Group();
  group.name = 'seacliff/breakfast-inner';
  // 材质以独立 name 取用（工厂缓存键含 name）→ 淡入淡出改 opacity 不影响共享材质
  const uniqueMat = (color: string, name: string): THREE.MeshToonMaterial =>
    toonMaterials.getToon('matteProp', { color, opacity: 0.999, name }); // opacity<1 → transparent 开（0.2s 淡变）
  const plateMat = uniqueMat('#f5f2ea', 'seacliff/breakfast-plate');
  const cupMat = uniqueMat('#6a8aa8', 'seacliff/breakfast-cup');
  const potMat = uniqueMat('#e8e2d4', 'seacliff/breakfast-pot');

  const plateGeometry = assets.geometry('seacliff/breakfast-plate', () =>
    lathe({
      profile: [
        [0.0, 0.012],
        [0.1, 0.006],
        [0.16, 0.03],
        [0.19, 0.032],
      ],
      segments: 14,
    }),
  );
  for (const [px, pz] of [
    [-0.28, 0.08],
    [0.1, 0.12],
  ] as const) {
    const plate = new THREE.Mesh(plateGeometry, plateMat);
    plate.name = 'seacliff/breakfast-plate';
    plate.position.set(px, 0, pz);
    group.add(plate);
  }
  const cupGeometry = assets.geometry('seacliff/breakfast-cup', () =>
    lathe({
      profile: [
        [0.0, 0.0],
        [0.045, 0.0],
        [0.052, 0.085],
        [0.048, 0.09],
      ],
      segments: 12,
    }),
  );
  for (const [px, pz] of [
    [-0.05, -0.12],
    [0.22, -0.06],
  ] as const) {
    const cup = new THREE.Mesh(cupGeometry, cupMat);
    cup.name = 'seacliff/breakfast-cup';
    cup.position.set(px, 0.01, pz);
    group.add(cup);
  }
  const potBody = new THREE.Mesh(
    assets.geometry('seacliff/breakfast-pot', () =>
      lathe({
        profile: [
          [0.0, 0.02],
          [0.09, 0.0],
          [0.12, 0.06],
          [0.13, 0.16],
          [0.115, 0.2],
          [0.05, 0.21],
        ],
        segments: 14,
      }),
    ),
    potMat,
  );
  potBody.name = 'seacliff/breakfast-pot';
  const potHandle = new THREE.Mesh(
    assets.geometry('seacliff/breakfast-pot-handle', () => {
      const handle = new THREE.TorusGeometry(0.05, 0.012, 6, 10, Math.PI);
      handle.rotateY(Math.PI / 2);
      return handle;
    }),
    potMat,
  );
  potHandle.name = 'seacliff/breakfast-pot-handle';
  potHandle.position.set(0.15, 0.14, 0);
  const potLid = new THREE.Mesh(
    assets.geometry('seacliff/breakfast-pot-lid', () =>
      lathe({
        profile: [
          [0.0, 0.03],
          [0.06, 0.025],
          [0.115, 0.0],
        ],
        segments: 14,
      }),
    ),
    potMat,
  );
  potLid.name = 'seacliff/breakfast-pot-lid';
  potLid.position.set(0, 0.2, 0);
  group.add(potBody, potHandle, potLid);
  return group;
}

function collectMeshMaterials(root: THREE.Object3D): THREE.MeshToonMaterial[] {
  const found: THREE.MeshToonMaterial[] = [];
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh && mesh.material instanceof THREE.MeshToonMaterial) found.push(mesh.material);
  });
  return found;
}

/* ============================== ③ createAnimations（7.2.1 海崖 7 项） ============================== */

/** 波光流动（7-1-③：场景 SceneAnimation——UV 偏移 (0.030,0.012)/(−0.020,0.008) u/s★ + α=0.22+0.08·sin(0.7t)）。 */
function createWaterAnimation(state: SeacliffState): SceneAnimation {
  let elapsedLocal = 0;
  return {
    update(dt: number): void {
      elapsedLocal += dt;
      const timeMul = state.glintMul;
      const weatherMul = WEATHER_GLINT_MUL[state.weather] ?? 1;
      const alpha = (0.22 + 0.08 * Math.sin(0.7 * elapsedLocal)) * timeMul * weatherMul;
      const layers = propsRef.glintLayers ?? [];
      layers.forEach((layer, i) => {
        const material = layer.material as THREE.MeshBasicMaterial;
        const map = material.map;
        if (map) {
          map.offset.x += (i === 0 ? 0.03 : -0.02) * dt; // ★定值（§7.2.1-③）
          map.offset.y += (i === 0 ? 0.012 : 0.008) * dt;
        }
        const layerScale = i === 0 ? 0.62 : 0.5;
        material.opacity = alpha * layerScale;
        layer.visible = material.opacity > 0.02;
      });
      sharedUniforms.uWaterTime.value += dt; // water 原型 shader 时间相位（§5.8「CPU 每帧 2 uniform」之一）
    },
    dispose(): void {
      /* 波光面归场景卸载统一释放，无独立 GPU 资源 */
    },
  };
}

/** 海鸟掠过（7-1-⑤：EventScheduler 平均 16s±6s，1~3 只，仅 dawn/day/dusk——夜间归巢；noOutline）。 */
function createSeagullAnimation(runtime: SceneRuntime, state: SeacliffState): SceneAnimation {
  const { assets, scheduler, rng } = runtime;
  const root = new THREE.Group();
  root.name = 'seacliff/seagulls';
  root.visible = false;
  runtime.root.add(root);
  const bodyMaterial = toonMaterials.get('matteProp', { color: '#f4f4ef', outline: false, name: 'seacliff/seagull-body' });
  const wingMaterial = toonMaterials.get('matteProp', { color: '#e4e6ea', outline: false, name: 'seacliff/seagull-wing' });
  wingMaterial.side = THREE.DoubleSide; // 双翼 plane 正反面可见（工厂无 side 参数，唯一 name 缓存键）
  const birdBody = assets.geometry('seacliff/seagull-body', () => {
    const bodyGeo = new THREE.CapsuleGeometry(0.045, 0.1, 4, 8);
    bodyGeo.rotateZ(Math.PI / 2);
    bodyGeo.scale(1.25, 0.85, 0.7);
    return bodyGeo;
  });
  const birdHead = assets.geometry('seacliff/seagull-head', () => new THREE.SphereGeometry(0.035, 6, 5));
  const birdWing = assets.geometry('seacliff/seagull-wing', () => {
    const wing = new THREE.PlaneGeometry(0.28, 0.12, 3, 1);
    wing.translate(0.14, 0, 0);
    return wing;
  });
  const birds: {
    group: THREE.Group;
    wingL: THREE.Mesh;
    wingR: THREE.Mesh;
    t: number;
    dur: number;
    p0: THREE.Vector3;
    p1: THREE.Vector3;
    p2: THREE.Vector3;
    flapHz: number;
    phase: number;
  }[] = [];
  for (let i = 0; i < 3; i++) {
    const bird = new THREE.Group();
    bird.name = `seacliff/seagull-${i}`;
    const body = new THREE.Mesh(birdBody, bodyMaterial);
    bird.add(body);
    const head = new THREE.Mesh(birdHead, bodyMaterial);
    head.position.set(0.13, 0.03, 0);
    bird.add(head);
    const wingL = new THREE.Mesh(birdWing, wingMaterial);
    const wingR = new THREE.Mesh(birdWing, wingMaterial);
    wingR.scale.x = -1;
    bird.add(wingL, wingR);
    bird.visible = false;
    root.add(bird);
    birds.push({ group: bird, wingL, wingR, t: 0, dur: 12.5, p0: new THREE.Vector3(), p1: new THREE.Vector3(), p2: new THREE.Vector3(), flapHz: 3.2, phase: 0 });
  }
  const handle = scheduler.add({
    meanIntervalS: 16, // docs/05 §7.1.5-1
    jitterS: 6,
    fire(): void {
      if (state.time === 'night') return; // 夜间归巢
      const count = 1 + Math.floor(rng.next() * 3);
      const startY = 1.9 + rng.next() * 0.5; // 海面上空 h1.6~2.4m（海面 y=0.3 上方）
      birds.forEach((bird, i) => {
        if (i >= count) {
          bird.group.visible = false;
          return;
        }
        const side = rng.bool() ? 1 : -1;
        bird.p0.set(side * 11, startY + rng.next() * 0.4, -4.5 - rng.next() * 4);
        bird.p1.set(side * 2, startY + 0.5 + rng.next() * 0.3, -6.5 - rng.next() * 2.5);
        bird.p2.set(-side * 11, startY + rng.next() * 0.3, -4 - rng.next() * 4);
        bird.t = -i * 0.5;
        bird.dur = 12.5; // 贝塞尔横越 ≈22u / 1.8m/s
        bird.flapHz = 3.2 * (0.85 + rng.next() * 0.3);
        bird.phase = rng.next() * Math.PI * 2;
        bird.group.visible = true;
      });
    },
  });
  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();
  const bezier = (bird: (typeof birds)[number], u: number, out: THREE.Vector3): THREE.Vector3 =>
    out
      .set(0, 0, 0)
      .addScaledVector(bird.p0, (1 - u) * (1 - u))
      .addScaledVector(bird.p1, 2 * (1 - u) * u)
      .addScaledVector(bird.p2, u * u);
  return {
    update(dt: number): void {
      let anyVisible = false;
      for (const bird of birds) {
        if (!bird.group.visible) continue;
        bird.t += dt;
        const u = clamp(bird.t / bird.dur, 0, 1);
        if (u >= 1) {
          bird.group.visible = false;
          continue;
        }
        anyVisible = true;
        const pos = bezier(bird, u, tmpA);
        bird.group.position.copy(pos);
        // 朝向：+x 体轴对准轨迹切线（ahead 点差分）
        bezier(bird, Math.min(1, u + 0.02), tmpB);
        bird.group.rotation.y = Math.atan2(-(tmpB.z - pos.z), tmpB.x - pos.x);
        bird.group.rotation.z = -0.08 * Math.sin(Math.PI * 2 * u * 1.5); // 转弯侧倾
        // 扑翼 3.2Hz±40° 与滑翔交替（§7.1.5-1）
        const glide = Math.sin(bird.phase + bird.t * 0.55) < 0;
        const flapAmp = glide ? 0.15 : 0.7;
        const wing = Math.sin(bird.t * Math.PI * 2 * bird.flapHz) * 0.7 * flapAmp;
        bird.wingL.rotation.z = wing;
        bird.wingR.rotation.z = -wing;
      }
      root.visible = anyVisible;
    },
    dispose(): void {
      handle.cancel();
      root.removeFromParent();
    },
  };
}

/** 纸巾阵风轻掀（7-1-⑦：EventScheduler 平均 11s±4s → boostCloth ×2.2 / 0.8s 衰减）。 */
function createTowelGustAnimation(runtime: SceneRuntime): SceneAnimation {
  const handle = runtime.scheduler.add({
    meanIntervalS: 11, // docs/05 §7.1.5-3
    jitterS: 4,
    fire(): void {
      const mesh = propsRef.towelMesh;
      if (!mesh) return;
      (runtime.wind as WindSceneExt).boostCloth?.(mesh, 2.2, 0.8);
    },
  });
  return {
    update(): void {
      /* 排程即动效——轻掀本体归 WindSystem（docs/01 §3.4 归属裁定） */
    },
    dispose(): void {
      handle.cancel();
    },
  };
}

function createAnimations(runtime: SceneRuntime): readonly SceneAnimation[] {
  return [
    createWaterAnimation(sceneState),
    createSeagullAnimation(runtime, sceneState),
    createTowelGustAnimation(runtime),
  ];
}

/* ============================== ④ palette（2.1.3） ============================== */

const palette: ScenePalette = {
  colorChannels: CHANNELS,
  baseStyle: {
    topTheme: 'lawn', // 草地噪点（§4.1.0 差异表）
    edgeMatId: 'rockStrata', // 岩层三条沉积带
    rimDecal: null,
    skirtLayers: 1, // 海面下沉 −2.6（立裙加层）
    silhouette: 'coast',
  },
  baseFog: 0.1,
};

/* ============================== ⑤ lightHooks（行为表逐行实现） ============================== */

/** 模块级运行态（Director 单场景装配；初值=黄昏档，首帧 applyLighting(blend=1) 对位，§4.3.5）。 */
const sceneState: SeacliffState = {
  time: 'dusk',
  weather: 'clear',
  lampPower: 0,
  emberPower: 0,
  smokePower: 0.35,
  interiorGlow: 0.85,
  boat: { ...BOAT_DUSK },
  boatFrom: { ...BOAT_DUSK },
  boatTo: { ...BOAT_DUSK },
  beam: 0.4,
  beamFrom: 0.4,
  beamTo: 0.4,
  boatLamp: 0.45,
  boatLampFrom: 0.45,
  boatLampTo: 0.45,
  glintTint: new THREE.Color(GLINT_DUSK.color),
  glintTintFrom: new THREE.Color(GLINT_DUSK.color),
  glintTintTo: new THREE.Color(GLINT_DUSK.color),
  glintMul: GLINT_DUSK.mul,
  glintMulFrom: GLINT_DUSK.mul,
  glintMulTo: GLINT_DUSK.mul,
  dew: 0,
  dewTo: 0,
  breakfastVisible: false,
  breakfastFaded: true,
  breakfastFade: 0,
  lastKey: 'dusk',
  pendingKey: null,
};

/** Director 运行期注入的 breath 引用（createAnimations 时快照；lightHooks 的场景映射口）。 */
let runtimeBreath: LightBreathSystem | null = null;

const lightHooks: SceneLightHooks = {
  applyLighting(state: SceneLightState, blend: number): void {
    sceneState.time = state.time;
    sceneState.weather = state.weather;
    sceneState.lampPower = state.lampPower;
    sceneState.emberPower = state.emberPower;
    sceneState.smokePower = state.smokePower;
    sceneState.interiorGlow = state.interiorGlow;

    // —— 连续量：帆船位置/光束功率/桅灯/波光 tint 随 blend 全程插值（§4.3.1 连续量清单）——
    const target = BOAT_TARGETS[state.time] ?? BOAT_DUSK;
    const beamTarget = BEAM_TARGETS[state.time] ?? 0;
    const glintTarget = GLINT_TARGETS[state.time] ?? GLINT_TARGETS.day ?? GLINT_DUSK;
    const boatLampTarget = BOAT_LAMP_TARGETS[state.time] ?? 0;
    if (sceneState.lastKey !== state.time) {
      // 换档：快照当前插值中间态为新 from（§4.3.5「中途改档不跳变」同口径）
      sceneState.boatFrom = { ...sceneState.boat };
      sceneState.beamFrom = sceneState.beam;
      sceneState.boatLampFrom = sceneState.boatLamp;
      sceneState.glintTintFrom.copy(sceneState.glintTint);
      sceneState.glintMulFrom = sceneState.glintMul;
      sceneState.boatTo = target;
      sceneState.beamTo = beamTarget;
      sceneState.boatLampTo = boatLampTarget;
      sceneState.glintTintTo.set(glintTarget.color);
      sceneState.glintMulTo = glintTarget.mul;
      sceneState.pendingKey = state.time;
      sceneState.lastKey = state.time;
    }
    const b = clamp(blend, 0, 1);
    const eased = b * b * (3 - 2 * b);
    sceneState.boat.x = THREE.MathUtils.lerp(sceneState.boatFrom.x, sceneState.boatTo.x, eased);
    sceneState.boat.z = THREE.MathUtils.lerp(sceneState.boatFrom.z, sceneState.boatTo.z, eased);
    sceneState.boat.heading = THREE.MathUtils.lerp(sceneState.boatFrom.heading, sceneState.boatTo.heading, eased);
    sceneState.boat.bobMul = THREE.MathUtils.lerp(sceneState.boatFrom.bobMul, sceneState.boatTo.bobMul, eased);
    sceneState.boat.swayMul = THREE.MathUtils.lerp(sceneState.boatFrom.swayMul, sceneState.boatTo.swayMul, eased);
    sceneState.beam = THREE.MathUtils.lerp(sceneState.beamFrom, sceneState.beamTo, eased);
    sceneState.boatLamp = THREE.MathUtils.lerp(sceneState.boatLampFrom, sceneState.boatLampTo, eased);
    sceneState.glintTint.lerpColors(sceneState.glintTintFrom, sceneState.glintTintTo, eased);
    sceneState.glintMul = THREE.MathUtils.lerp(sceneState.glintMulFrom, sceneState.glintMulTo, eased);

    // —— 离散量：早餐餐具（dawn 出现/其余收起；blend≥0.5 切换 + 0.2s opacity 淡变，§4.3.1/D5）——
    if (sceneState.pendingKey !== null && b >= 0.5) {
      const targetVisible = sceneState.pendingKey === 'dawn';
      if (targetVisible && !sceneState.breakfastVisible) {
        sceneState.breakfastVisible = true;
        sceneState.breakfastFaded = false;
      } else if (!targetVisible && sceneState.breakfastVisible) {
        sceneState.breakfastFaded = true; // update 内 0.2s 淡出后隐藏
      }
      sceneState.pendingKey = null;
    }
    sceneState.dewTo = state.time === 'dawn' ? 1 : 0;

    // —— 灯塔 lampPower 场景映射（7.1.4「dusk 0.4/night 1.0」；实现侧 setLampPower 结构化可选口，
    //     契约缺省时由 update 内按 beam 值自驱）——
    const lighthouse = propsRef.lighthouseLamp;
    const breath = runtimeBreath as BreathSceneExt | null;
    if (lighthouse && breath?.setLampPower) {
      breath.setLampPower(lighthouse, sceneState.beam);
    }
  },

  /** 每帧细粒度驱动（行为表：帆船起伏/泊港 ×0.4 在本钩子；光束旋转+可见度；桅灯；余烬；露水；餐具淡变）。 */
  update(dt: number, elapsed: number): void {
    // —— 帆船起伏（行为表：y=0.03·sin(0.9t)+0.02·sin(1.7t)、roll=0.04·sin(0.6t)；泊港幅度 ×0.4）——
    const boat = propsRef.sailboat;
    const inner = propsRef.sailboatInner;
    if (boat && inner) {
      const bobMul = sceneState.boat.bobMul;
      const bobY = (0.03 * Math.sin(0.9 * elapsed) + 0.02 * Math.sin(1.7 * elapsed)) * bobMul;
      inner.position.y = bobY;
      inner.rotation.z = 0.04 * Math.sin(0.6 * elapsed) * bobMul;
      boat.position.set(sceneState.boat.x, SEA_Y + bobY * 0.35, sceneState.boat.z);
      boat.rotation.y = sceneState.boat.heading + 0.06 * Math.sin(0.35 * elapsed) * sceneState.boat.swayMul; // 「微摆」
      const mastMat = propsRef.mastLampMaterial;
      if (mastMat) {
        mastMat.emissiveIntensity = 1.1 * sceneState.boatLamp;
        mastMat.visible = sceneState.boatLamp >= 0.02;
      }
    }

    // —— 灯塔光束旋转（与 rotate 灯同式 angle=0.25·elapsed，7-1-④★）与可见度（dusk 0.4 起、白天 0）——
    const beamGroup = propsRef.beamGroup;
    const beamMats = propsRef.beamMaterials;
    if (beamGroup && beamMats) {
      beamGroup.rotation.y = 0.25 * elapsed;
      const glow = WEATHER_GLOW[sceneState.weather] ?? 0;
      const opacity = clamp(sceneState.beam * 0.85 * (1 + 0.6 * glow), 0, 1); // 五-4 光束锥 α×(1+0.6×glow)
      for (const material of beamMats) {
        material.opacity = opacity;
        material.visible = opacity >= 0.02;
      }
      const lampRoomMat = propsRef.lighthouseLamp?.emissiveMat;
      if (lampRoomMat && !(runtimeBreath as BreathSceneExt | null)?.setLampPower) {
        // 降级路径：契约无 setLampPower 时灯室自驱（beacon 0.4/1.0 映射已入 beam 值）
        lampRoomMat.emissiveIntensity = 1.2 * Math.max(sceneState.beam, sceneState.lampPower * 0.4);
        lampRoomMat.visible = lampRoomMat.emissiveIntensity >= 0.02;
      }
    }

    // —— 串灯 halo 成对层（灯体 emissive 由 LightBreath blink 驱动；halo 层同步灯输出）——
    const haloMat = propsRef.stringHaloMaterial;
    const stringLamp = propsRef.stringLamp;
    if (haloMat && stringLamp) {
      const out = (runtimeBreath as BreathSceneExt | null)?.getLampOutput?.(stringLamp) ?? sceneState.lampPower;
      const glow = WEATHER_GLOW[sceneState.weather] ?? 0;
      const opacity = 0.3 * out * (1 + 0.5 * glow);
      haloMat.opacity = opacity;
      haloMat.visible = opacity >= 0.02;
    }

    // —— 波光 tint → uWaterSkyColor（§5.8「CPU 每帧 2 uniform」之二；海面菲涅尔混天空色）——
    sharedUniforms.uWaterSkyColor.value.copy(sceneState.glintTint);

    // —— 炭火余烬（docs/05 §4.3.3-②：emissive × emberPower 噪声闪烁）——
    const coalMat = propsRef.coalMaterial;
    if (coalMat) {
      const flicker = 0.72 + 0.18 * Math.sin(7.3 * elapsed) + 0.1 * Math.sin(3.1 * elapsed + 1.7);
      coalMat.emissiveIntensity = 1.7 * sceneState.emberPower * flicker;
      coalMat.visible = coalMat.emissiveIntensity >= 0.02;
    }

    // —— 暖车窗光贴花（行为表黄昏行：op=interiorGlow×0.35 铺营位地面）——
    const glowMat = propsRef.groundGlowMaterial;
    if (glowMat) {
      glowMat.opacity = 0.35 * sceneState.interiorGlow;
      glowMat.visible = glowMat.opacity >= 0.02;
    }

    // —— 露水（dawn=1 → 白天晒干淡出，§4.3.3-④；sparkle 层随 dew 起伏）——
    const k = 1 - Math.exp(-dt / 0.6);
    sceneState.dew += (sceneState.dewTo - sceneState.dew) * k;
    const sparkleMat = propsRef.sparkleMaterial;
    if (sparkleMat) {
      const twinkle = 0.55 + 0.45 * Math.sin(1.3 * elapsed);
      sparkleMat.opacity = 0.6 * sceneState.dew * twinkle;
      sparkleMat.visible = sparkleMat.opacity >= 0.02;
    }

    // —— 早餐餐具 0.2s 淡入淡出（切换用 opacity 渐变不用 scale 弹跳，§4.3.1）——
    const breakfast = propsRef.breakfastSet;
    if (breakfast) {
      const targetOpacity = sceneState.breakfastVisible && !sceneState.breakfastFaded ? 1 : 0;
      if (targetOpacity > sceneState.breakfastFade) {
        sceneState.breakfastFade = Math.min(1, sceneState.breakfastFade + dt / 0.2);
      } else if (targetOpacity < sceneState.breakfastFade) {
        sceneState.breakfastFade = Math.max(0, sceneState.breakfastFade - dt / 0.2);
        if (sceneState.breakfastFade <= 0) sceneState.breakfastVisible = false;
      }
      breakfast.visible = sceneState.breakfastFade > 0.02;
      for (const material of propsRef.breakfastFadeMats ?? []) {
        material.opacity = 0.999 * sceneState.breakfastFade;
        material.visible = sceneState.breakfastFade > 0.02;
      }
    }
  },
};

/* ============================== SceneModule（§3.3.2 五部分） ============================== */

/** 海崖营地（默认场景；id/label/isDefault = 'seacliff'/'海崖'/true，§4.1.1 模块卡）。 */
export const seacliffScene: SceneModule = {
  id: 'seacliff',
  label: '海崖',
  isDefault: true,
  buildTerrain,
  buildProps,
  createAnimations(runtime: SceneRuntime): readonly SceneAnimation[] {
    runtimeBreath = runtime.breath; // 结构化可选口（getLampOutput/setLampPower）在 lightHooks 中按需取用
    return createAnimations(runtime);
  },
  palette,
  lightHooks,
};

/* ============================== 局部工具 ============================== */

/** 曲线整体平移（CatmullRomCurve3 无 translate 方法——按控制点平移后重建同型曲线）。 */
function offsetRailCurve(curve: THREE.CatmullRomCurve3, dy: number): THREE.CatmullRomCurve3 {
  return new THREE.CatmullRomCurve3(
    curve.points.map((p) => p.clone().add(new THREE.Vector3(0, dy, 0))),
    curve.closed,
    curve.curveType,
    curve.tension,
  );
}

function makeHaloTexture(assets: SceneBuildContext['assets'], key: string): THREE.Texture {
  return assets.texture(key, () =>
    paintCanvasTexture(key, 64, 64, (c, w, h) => {
      const grad = c.createRadialGradient(w / 2, h / 2, 1, w / 2, h / 2, w / 2);
      grad.addColorStop(0, 'rgba(255,255,255,0.9)');
      grad.addColorStop(0.4, 'rgba(255,255,255,0.28)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = grad;
      c.fillRect(0, 0, w, h);
    }, true),
  );
}

function makeHaloSprite(assets: SceneBuildContext['assets'], key: string, scale: number, color: string): THREE.Sprite {
  const material = new THREE.SpriteMaterial({
    color,
    map: makeHaloTexture(assets, `${key}-tex`),
    transparent: true,
    opacity: 0.35, // §4.3.3-⑧ 基值：op=0.35×lampPower×(1+0.5×glowBoost)——LightBreath 逐帧驱动
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  material.name = `${key}-mat`;
  const sprite = new THREE.Sprite(material);
  sprite.name = key;
  sprite.scale.setScalar(scale);
  sprite.renderOrder = 20;
  return sprite;
}

function makeSnowShellMaterial(name: string): THREE.Material {
  return toonMaterials.get('matteProp', { color: '#edf2f9', snow: 'off', opacity: 0.999, name });
}

/** 沿曲线的贴地 ribbon（栈道顶雪壳等共用形）。 */
function buildRibbonGeometry(
  assets: SceneBuildContext['assets'],
  key: string,
  curve: THREE.Curve<THREE.Vector3>,
  width: number,
  yOffset: number,
): THREE.BufferGeometry {
  return assets.geometry(key, () => {
    const samples = 40;
    const positions: number[] = [];
    const indices: number[] = [];
    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      const p = curve.getPointAt(t);
      const tangent = curve.getTangentAt(t);
      const side = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize().multiplyScalar(width / 2);
      positions.push(p.x - side.x, p.y + yOffset, p.z - side.z, p.x + side.x, p.y + yOffset, p.z + side.z);
      if (i < samples) {
        const a = i * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  });
}

/** 帆面几何：三角帆（顶边收拢）+ 浅弧鼓风（静态预弯——船帆属船体刚性件，未注册 Wind）。 */
function buildSailGeometry(key: string, width: number, height: number): THREE.BufferGeometry {
  const geometry = new THREE.PlaneGeometry(width, height, 4, 6);
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < position.count; i++) {
    const px = position.getX(i);
    const py = position.getY(i);
    const v = (py + height / 2) / height; // 0 底 → 1 顶
    position.setX(i, px * (1 - v * 0.55) - width * 0.22);
    position.setZ(i, Math.sin(Math.PI * clamp(v, 0, 1)) * 0.06);
  }
  geometry.computeVertexNormals();
  geometry.name = key;
  return geometry;
}

/** 海草簇几何：5 片内弯窄叶（flattened cone）合并，确定性形（同 id 可复现）。 */
function buildSeaweedGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const rng = mulberry32(hashString('seacliff/seaweed'));
  for (let i = 0; i < 5; i++) {
    const blade = new THREE.ConeGeometry(0.05, 0.36 + rng() * 0.22, 4);
    blade.scale(1, 1, 0.3);
    blade.rotateX(-0.35 - rng() * 0.3);
    blade.rotateY((i / 5) * Math.PI * 2);
    blade.translate(Math.sin((i / 5) * Math.PI * 2) * 0.045, 0.16, Math.cos((i / 5) * Math.PI * 2) * 0.045);
    parts.push(blade);
  }
  const merged = mergeGeometries(parts);
  if (!merged) throw new Error('[seacliff] 海草簇合并失败');
  merged.computeVertexNormals();
  return merged;
}
