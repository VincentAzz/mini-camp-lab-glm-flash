// docs/01-整体架构.md §3.2 content/scenes/pineforest.ts —— 2.2 山间松林营地 pineforest（12 组元素 + 7 动效）。T19 落点。
// docs/02-场景模块.md §4.1.2（模块卡/地形 2.2.1/道具 2.2.2 十二组/色彩 2.2.3/光照钩子行为表/注册与预算）
//   + §4.1.0 campAnchor 松林行 + baseStyle 差异表 + §4.0 四域共通（句柄接入/程序化字典/无人物红线）；
// docs/05-时间天气动效.md §7.2.2 松林 7 动效逐项落点 + §7.1 定值表（唯一参数源）+ §4.3.2 通道定值
//   （场景只解释）+ §4.3.4 松林行（清晨流动晨雾+光斑跳动/黄昏逆光剪影+金色光斑/夜间月光斑）；
// docs/04-三渲二渲染.md §5.5（松林=ramp3+rim（逆光剪影）+foliage 层叠+光斑摇曳+water 溪流——渲染层零场景分支）。
//
// ★ 地形实现注记（T19 实现期裁定，如实登记；同 T18 崖体抬升口径）：docs/02 2.2.1「溪谷下拉 1.6u、
//   溪流 y=−1.35」依赖底座顶板开孔；T07 BaseAssembler 顶板为整版实心 Box（无开孔），y<0 的下沉面
//   在底座足迹内被顶板遮挡。本实现采用「台体抬升」：碎石台体整体抬升 GRAVEL_TOP=1.6（恰为文档
//   谷深），谷底=底座台面（y≈0，gravel 主题透出为河床），溪水面 y=STREAM_Y=0.25（=1.6−1.35，
//   与文档「台面下 1.35」的相对关系逐字保留），两岸 0.85u 斜坡带落实「宽 2.2u 斜带」。campAnchor
//   position.y/groundY 相应取 GRAVEL_TOP（车型按 groundY 对位，docs/03 §3.0 适配口）；x/z/heading/
//   radius 仍逐字取 §4.1.0 松林行。正式修法（顶板开孔/下沉层声明）属 BaseAssembler 契约扩展，
//   待 T22/T43 评审（与 T18 同一 openIssues 项）。
//
// 依赖纪律（§3.3.6）：只 import core 契约（types/handles）+ shared + geom 部件库（含 pineforest/ 新件）
//   + render 工厂 + systems/wind 的 injectVegetationWind（P2 注入器，wind.ts 用法注记点名 T19）。
//   零 import 车型/时间/天气注册表；布料/粒子/灯点只交句柄与参数（docs/01 §3.4 归属裁定）。
// 无人物红线（一.6）：全场景无人形几何；松鼠为原文点名动物动效载体（7-2-④）。
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
} from '@/systems/handles';
import { toonMaterials, sharedUniforms } from '@/render/toonMaterial';
import { mergeGeometries, hardenEdges, roundedBox, lathe, tube } from '@/geom/primitives';
import { InstancedGroup } from '@/geom/instanced';
import { injectVegetationWind } from '@/systems/wind';
import { createWaterSurface, createGlintLayer } from '@/geom/parts/waterSurface';
import { createCampfirePit } from '@/geom/parts/campfire';
import { createMicroCloth } from '@/geom/parts/clothMicro';
import { createPineTierGeometries, PINE_TIERS } from '@/geom/parts/pineforest/treePine';
import { createHammock } from '@/geom/parts/pineforest/hammock';
import { createLogBenchGeometry, createFirewoodPyramidGeometry } from '@/geom/parts/pineforest/logBench';
import { createCampfireFlame, createFireGlowCore } from '@/geom/parts/pineforest/campfireFlame';
import { createStreamBridge } from '@/geom/parts/pineforest/streamBridge';
import { createTrailSign } from '@/geom/parts/pineforest/trailSign';
import { createBirdhouse, createBearBox } from '@/geom/parts/pineforest/birdhouse';
import {
  createMossPatchGeometry,
  createFernTuftGeometry,
  createMushroomGeometry,
  paintMushroomCapTexture,
  createWaterBucket,
  createWaterLadle,
} from '@/geom/parts/pineforest/forestFloor';
import { createFbm2D, hashStringToSeed } from '@/tex/canvasTex';
import { mulberry32 } from '@/shared/rng';
import { clamp } from '@/shared/math';

/* ============================== 场景定值（docs/02 §4.1.0 / §4.1.2） ============================== */

/** 碎石台体顶面（T19 抬升方案见文件头注记；x/z/campAnchor 其余字段仍取 §4.1.0 定值）。 */
const GRAVEL_TOP = 1.6;
/** 溪水面（=GRAVEL_TOP−1.35，保留 2.2.1「台面下 1.35」相对关系）；谷底=底座台面 y≈0。 */
const STREAM_Y = 0.25;
/** 溪谷斜带（2.2.1「宽 2.2u 斜带穿左后角」）：中心线 P0→P1、谷底半宽 1.1、含斜坡带切半宽 1.95。 */
const VALLEY_P0 = new THREE.Vector2(-5.0, -10.4);
const VALLEY_P1 = new THREE.Vector2(-10.6, -1.6);
const VALLEY_DIR = VALLEY_P1.clone().sub(VALLEY_P0).normalize(); // 沿谷向（流向）
const VALLEY_N = new THREE.Vector2(VALLEY_DIR.y, -VALLEY_DIR.x); // 内岸法线（朝台面中心侧）
const VALLEY_CUT_HALF = 1.95; // 切口半宽（谷底 1.1 + 斜坡 0.85）
const VALLEY_BED_HALF = 1.1; // 谷底半宽（底宽 2.2 逐字）
/** 溪水/波光带中心与旋转（贴 band 走向）。 */
const STREAM_CENTER = VALLEY_P0.clone().add(VALLEY_P1).multiplyScalar(0.5);
const STREAM_ROT_Y = Math.atan2(VALLEY_DIR.x, VALLEY_DIR.y); // 局部 +z 对齐谷向

/** 营位与道具定值（campAnchor §4.1.0 松林行 x/z/heading/radius 逐字；y=T19 抬升裁定）。 */
const CAMP_X = 0.4;
const CAMP_Z = 0.2;
const CAMP_HEADING = 0.2;
const CAMP_RADIUS = 4.0;
/** 篝火/平台/锚树等布置位（营位半径外缘 or 车身侧向净空外，J2 车辆不停平台）。 */
const FIRE_POS = new THREE.Vector3(3.3, GRAVEL_TOP, 1.15);
const PLATFORM_POS = new THREE.Vector3(-3.3, GRAVEL_TOP, -2.9);
/** 板格 4.6×3.8（2.2.2-③ 逐字）；板条净宽留边 0.16。 */
const PLATFORM_SIZE = { w: 4.6, d: 3.8 };
const PLATFORM_PLANK_W = PLATFORM_SIZE.w - 0.16;
const ANCHOR_A = new THREE.Vector3(4.75, GRAVEL_TOP, -0.55); // 锚树 ×2（承担吊床/晾绳挂点）
const ANCHOR_B = new THREE.Vector3(4.45, GRAVEL_TOP, 2.45);
const BRIDGE_CENTER = new THREE.Vector3(-8.55, 0, -4.83); // 谷上（y 由桥体局部高度给出）
const BRIDGE_ROT_Y = Math.atan2(VALLEY_N.x, VALLEY_N.y); // 桥长轴垂直谷向
const TOWEL_POST = new THREE.Vector3(2.3, GRAVEL_TOP, 3.6); // 晾绳另一端立柱（一端挂锚树 B）
const SIGN_POS = new THREE.Vector3(-3.35, GRAVEL_TOP, 1.75);

/** 色彩通道（2.2.3 十通道，docs/02 定值逐字）。 */
const CHANNELS = {
  forestGreen: '#3f7a4a',
  canopyDark: '#2f5e40',
  canopyLight: '#6aa25c',
  trunkBark: '#6d523c',
  gravelGround: '#9aa08e',
  streamBlue: '#6fb5c8',
  mistCyan: '#cfe4e6',
  mushroomRed: '#c8493f',
  campfireOrange: '#ff9a4a',
  sunSpot: '#fff3c8',
} satisfies Record<string, RGB>;

/** 黄昏金色光斑（2.2.3「sunSpot 黄昏→#ffd9a0 金」；§4.3.4 另记 #FFC860——以 2.2.3 色彩基调为准，openIssues）。 */
const SUN_SPOT_DUSK = '#ffd9a0';

/** 光斑四档（§4.3.4 松林行 + §7.1.6：清晨白金 0.55+跳动/白天 0.5/黄昏金 0.75/夜间月光斑 0.06）。 */
interface SpotTarget {
  base: number;
  color: string;
}
const SPOT_DUSK: SpotTarget = { base: 0.75, color: SUN_SPOT_DUSK };
const SPOT_TARGETS: Record<string, SpotTarget> = {
  dawn: { base: 0.55, color: CHANNELS.sunSpot },
  day: { base: 0.5, color: CHANNELS.sunSpot },
  dusk: SPOT_DUSK,
  night: { base: 0.06, color: '#aee8e8' }, // 月光斑微青（2.2.3 mistCyan 族）
};
/** 雾板 α 档（7-2-⑦「清晨 0.5/白天 0.12/黄昏 0.2/夜间 0.3」×fogDensity 归一）。 */
const MIST_BOARD_ALPHA: Record<string, number> = { dawn: 0.5, day: 0.12, dusk: 0.2, night: 0.3 };

/** 天气 → 光斑倍率（§7.2.1-③ 同族口径：雨 0.9/雾 0.85/雪 0.85；多云 1）。 */
const WEATHER_SPOT_MUL: Record<string, number> = { clear: 1, cloudy: 1, rain: 0.9, fog: 0.85, snow: 0.85 };

/** 场景内部共享运行态（lightHooks/update/SceneAnimation 三方读写——同一模块闭包，无跨模块泄漏）。 */
interface PineforestState {
  time: string;
  weather: string;
  lampPower: number;
  emberPower: number;
  smokePower: number;
  spotBase: number;
  spotBaseFrom: number;
  spotBaseTo: number;
  spotTint: THREE.Color;
  spotTintFrom: THREE.Color;
  spotTintTo: THREE.Color;
  mistBoard: number;
  mistBoardFrom: number;
  mistBoardTo: number;
  canopyTint: THREE.Color;
  canopyTintFrom: THREE.Color;
  canopyTintTo: THREE.Color;
  dew: number;
  dewTo: number;
  fogDensity: number; // AtmosphereSystem 合成结果（applyLighting 由 SceneLightState.fogDensity 转写）
  breakfastVisible: boolean;
  breakfastFaded: boolean;
  breakfastFade: number;
  burstT: number; // songBurst 窗内计时（<0 = 未触发）
  lastKey: string | null;
  pendingKey: string | null;
}

/** LightBreathSystem 实现侧场景映射口（结构化可选访问：契约未含时优雅降级——不 import 实现文件，§3.4）。 */
type BreathSceneExt = LightBreathSystem & {
  getLampOutput?: (lamp: LampHandle) => number;
  setLampPower?: (lamp: LampHandle, power: number) => void;
};

// ---------------------------------------------------------------------------
// Canvas 贴图绘制（程序化，docs/04 §5.4；经 ctx.assets.texture 缓存与引用计数）
// ---------------------------------------------------------------------------

type CanvasDraw = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

function paintCanvasTexture(key: string, w: number, h: number, draw: CanvasDraw, transparent = false): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(2, w);
  canvas.height = Math.max(2, h);
  const ctx2d = canvas.getContext('2d');
  if (!ctx2d) throw new Error(`[pineforest] 无法获取 2d 上下文 ${key}`);
  try {
    draw(ctx2d, canvas.width, canvas.height);
  } catch (err) {
    console.warn(`[pineforest] 贴图绘制失败，降级留白 ${key}`, err);
    ctx2d.fillStyle = transparent ? 'rgba(0,0,0,0)' : '#dddddd';
    ctx2d.fillRect(0, 0, canvas.width, canvas.height);
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

/** 碎石地噪点（近白中值 + 碎石颗粒短线，明暗不烘进贴图——docs/04 §5.4 中值原则）。 */
function drawGravel(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const fbm = createFbm2D(hashStringToSeed('pineforest/gravel'), 4);
  const image = ctx.createImageData(w, h);
  const data = image.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = clamp(0.94 + (fbm((x / w) * 26, (y / h) * 26) - 0.5) * 0.08, 0, 1);
      const c = Math.round(v * 255);
      const i = (y * w + x) * 4;
      data[i] = c;
      data[i + 1] = c;
      data[i + 2] = c;
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  const rng = mulberry32(hashStringToSeed('pineforest/gravel/pebbles'));
  // 碎石颗粒：短椭圆点（局部绘制用裸函数句柄，非 Rng 类）
  for (let i = 0; i < 220; i++) {
    const x = rng() * w;
    const y = rng() * h;
    const r = 0.8 + rng() * 1.6;
    ctx.fillStyle = rng() < 0.5 ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.10)';
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.7, rng() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** 根系土层（台体侧壁/谷岸）：三条棕壤层带 + 细根须线（对位 §4.1.0 台缘 edgeMatId「根系土层」观感）。 */
function drawRootSoil(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const fbm = createFbm2D(hashStringToSeed('pineforest/soil'), 3);
  const bands = [0.9, 0.78, 0.86];
  const image = ctx.createImageData(w, h);
  const data = image.data;
  for (let x = 0; x < w; x++) {
    const u = x / w;
    for (let y = 0; y < h; y++) {
      const v = y / h;
      const wob = Math.sin(u * Math.PI * 5 + v * 1.8) * 0.03 + (fbm(u * 8, v * 3) - 0.5) * 0.06;
      const band = clamp(Math.floor((v + wob) * 3), 0, 2);
      const shade = clamp((bands[band] ?? 0.85) + (fbm(u * 16, v * 10) - 0.5) * 0.05, 0, 1);
      const c = Math.round(shade * 255);
      const i = (y * w + x) * 4;
      data[i] = c;
      data[i + 1] = c;
      data[i + 2] = c;
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  const rng = mulberry32(hashStringToSeed('pineforest/soil/roots'));
  ctx.strokeStyle = 'rgba(0,0,0,0.12)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 60; i++) {
    const x = rng() * w;
    const y = rng() * h;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + (rng() - 0.5) * 20, y + 6, x + (rng() - 0.5) * 30, y + 12 + rng() * 8);
    ctx.stroke();
  }
}

/** 光斑斑驳 alpha 贴图：2~3 团软边叶隙光斑（近白中值不适用——alpha 承载形状，色走材质）。 */
function drawDappleTexture(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const fbm = createFbm2D(hashStringToSeed('pineforest/dapple'), 4);
  const image = ctx.createImageData(w, h);
  const data = image.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const v = y / h;
      // 椭圆软斑 × fbm 破碎（林间叶隙光斑）
      const dx = (u - 0.5) / 0.36;
      const dy = (v - 0.5) / 0.3;
      const d = Math.sqrt(dx * dx + dy * dy);
      const n = fbm(u * 7 + 3.1, v * 7 + 8.7);
      const a = Math.max(0, (1 - d) * 1.25 - 0.28) * (0.45 + 0.55 * n);
      const i = (y * w + x) * 4;
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = Math.round(clamp(a, 0, 1) * 255);
    }
  }
  ctx.putImageData(image, 0, 0);
}

/** 晨雾板 alpha 贴图：横向 fbm 雾带（下实上虚）。 */
function drawMistBandTexture(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const fbm = createFbm2D(hashStringToSeed('pineforest/mistband'), 4);
  const image = ctx.createImageData(w, h);
  const data = image.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const v = y / h; // 0 顶 → 1 底
      const n = fbm(u * 5 + 1.7, v * 2.4 + 4.2);
      const vertical = Math.pow(v, 0.8) * (1 - Math.pow(v, 6)); // 底部实、顶端散
      const a = vertical * (0.4 + 0.6 * n);
      const i = (y * w + x) * 4;
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = Math.round(clamp(a, 0, 1) * 255);
    }
  }
  ctx.putImageData(image, 0, 0);
}

/* ============================== ① buildTerrain（2.2.1） ============================== */

/** 点到溪谷中心线段的距离（树/道具避让用）。 */
function valleyDistance(x: number, z: number): number {
  const p = new THREE.Vector2(x, z);
  const seg = VALLEY_P1.clone().sub(VALLEY_P0);
  const t = clamp(p.clone().sub(VALLEY_P0).dot(seg) / seg.lengthSq(), 0, 1);
  const closest = VALLEY_P0.clone().addScaledVector(seg, t);
  return p.distanceTo(closest);
}

function buildTerrain(ctx: SceneBuildContext): SceneTerrain {
  const { assets } = ctx;
  const group = new THREE.Group();
  group.name = 'pineforest/terrain';

  // —— 材质（全部经工厂，docs/04 §5.2）——
  const gravelTexture = assets.texture('pineforest/tex/gravel', () => paintCanvasTexture('pineforest/tex/gravel', 256, 256, drawGravel));
  gravelTexture.repeat.set(1 / 7, 1 / 7);
  const gravelMaterial = toonMaterials.get('groundTerrain', {
    color: CHANNELS.gravelGround,
    map: gravelTexture,
    name: 'pineforest/gravel-top',
  }); // ground 作用面（碎石地湿深/覆雪，§4.4.2）
  const soilTexture = assets.texture('pineforest/tex/soil', () => paintCanvasTexture('pineforest/tex/soil', 256, 128, drawRootSoil));
  soilTexture.repeat.set(1 / 6, 1 / 1.4);
  const soilMaterial = toonMaterials.get('concrete', { color: '#7c6248', map: soilTexture, name: 'pineforest/root-soil' });

  // —— 碎石台体（方形轮廓挖去溪谷斜带；T19 抬升方案见文件头注记）——
  // 主台体多边形：内岸切口线（直线段，与谷带平行）+ 底座方形其余边界。
  const innerEntry = VALLEY_P0.clone().addScaledVector(VALLEY_N, VALLEY_CUT_HALF);
  const innerExit = VALLEY_P1.clone().addScaledVector(VALLEY_N, VALLEY_CUT_HALF);
  // 内岸线与 z=−10 / x=−10 的交点（直线参数反解）
  const innerDir = innerExit.clone().sub(innerEntry).normalize();
  const sBack = (-10 - innerEntry.y) / innerDir.y;
  const innerBackX = innerEntry.x + innerDir.x * sBack;
  const sLeft = (-10 - innerEntry.x) / innerDir.x;
  const innerLeftZ = innerEntry.y + innerDir.y * sLeft;
  const plateauShape = new THREE.Shape([
    new THREE.Vector2(innerBackX, 10),
    new THREE.Vector2(10, 10),
    new THREE.Vector2(10, -10),
    new THREE.Vector2(innerBackX, -10),
    new THREE.Vector2(-10, -innerLeftZ), // 形状 y=−worldZ
    new THREE.Vector2(innerExit.x, -innerExit.y),
    new THREE.Vector2(innerEntry.x, -innerEntry.y),
  ]);
  const plateauGeometry = assets.geometry('pineforest/plateau', () => {
    const geometry = new THREE.ExtrudeGeometry(plateauShape, { depth: GRAVEL_TOP, bevelEnabled: false, curveSegments: 4, steps: 1 });
    geometry.rotateX(-Math.PI / 2); // (x, y_shape, z_extrude)→(x, y_extrude, −y_shape)：worldZ=−shapeY（T18 同式）
    geometry.computeVertexNormals();
    return geometry;
  });
  const plateau = new THREE.Mesh(plateauGeometry, [gravelMaterial, soilMaterial]);
  plateau.name = 'pineforest/plateau';
  plateau.receiveShadow = true;
  group.add(plateau);
  propsRef.groundMaterial = gravelMaterial; // ground 作用面（buildProps 登记——碎石地湿深/覆雪）

  // —— 角部小台地（溪谷外岸与底座角之间的碎石残台，同高）——
  const outerEntry = VALLEY_P0.clone().addScaledVector(VALLEY_N, -VALLEY_CUT_HALF);
  const outerExit = VALLEY_P1.clone().addScaledVector(VALLEY_N, -VALLEY_CUT_HALF);
  const outerDir = outerExit.clone().sub(outerEntry).normalize();
  const osBack = (-10 - outerEntry.y) / outerDir.y;
  const outerBackX = outerEntry.x + outerDir.x * osBack;
  const osLeft = (-10 - outerEntry.x) / outerDir.x;
  const outerLeftZ = outerEntry.y + outerDir.y * osLeft;
  const wedgeShape = new THREE.Shape([
    new THREE.Vector2(-10, 10),
    new THREE.Vector2(outerBackX, 10),
    new THREE.Vector2(-10, -outerLeftZ),
  ]);
  const wedgeGeometry = assets.geometry('pineforest/wedge', () => {
    const geometry = new THREE.ExtrudeGeometry(wedgeShape, { depth: GRAVEL_TOP, bevelEnabled: false, curveSegments: 4, steps: 1 });
    geometry.rotateX(-Math.PI / 2);
    geometry.computeVertexNormals();
    return geometry;
  });
  const wedge = new THREE.Mesh(wedgeGeometry, [gravelMaterial, soilMaterial]);
  wedge.name = 'pineforest/wedge';
  wedge.receiveShadow = true;
  group.add(wedge);

  // —— 两岸斜坡带（「斜带」：谷底缘 y0.05 → 台缘 y=GRAVEL_TOP 的四边形条带 ×2，1 DC/侧）——
  const buildShoulder = (sideSign: number): THREE.BufferGeometry => {
    const positions: number[] = [];
    const indices: number[] = [];
    const segs = 2; // 直带（切口为直线）
    const a0 = VALLEY_P0.clone().addScaledVector(VALLEY_N, sideSign * VALLEY_CUT_HALF);
    const a1 = VALLEY_P1.clone().addScaledVector(VALLEY_N, sideSign * VALLEY_CUT_HALF);
    const b0 = VALLEY_P0.clone().addScaledVector(VALLEY_N, sideSign * VALLEY_BED_HALF);
    const b1 = VALLEY_P1.clone().addScaledVector(VALLEY_N, sideSign * VALLEY_BED_HALF);
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const ax = a0.x + (a1.x - a0.x) * t;
      const az = a0.y + (a1.y - a0.y) * t;
      const bx = b0.x + (b1.x - b0.x) * t;
      const bz = b0.y + (b1.y - b0.y) * t;
      positions.push(ax, GRAVEL_TOP + 0.005, az, bx, 0.05, bz);
      if (i < segs) {
        const k = i * 2;
        indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  };
  for (const side of [1, -1]) {
    const shoulder = new THREE.Mesh(assets.geometry(`pineforest/shoulder-${side}`, () => buildShoulder(side)), soilMaterial);
    shoulder.name = `pineforest/shoulder-${side}`;
    shoulder.receiveShadow = true;
    group.add(shoulder);
  }

  // —— 溪床卵石带（谷底条带，浅色碎石，1 DC）——
  const bedGeometry = assets.geometry('pineforest/stream-bed', () => {
    const positions: number[] = [];
    const indices: number[] = [];
    const segs = 2;
    const b0 = VALLEY_P0.clone().addScaledVector(VALLEY_N, VALLEY_BED_HALF);
    const b1 = VALLEY_P1.clone().addScaledVector(VALLEY_N, VALLEY_BED_HALF);
    const c0 = VALLEY_P0.clone().addScaledVector(VALLEY_N, -VALLEY_BED_HALF);
    const c1 = VALLEY_P1.clone().addScaledVector(VALLEY_N, -VALLEY_BED_HALF);
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      positions.push(
        b0.x + (b1.x - b0.x) * t, 0.045, b0.y + (b1.y - b0.y) * t,
        c0.x + (c1.x - c0.x) * t, 0.045, c0.y + (c1.y - c0.y) * t,
      );
      if (i < segs) {
        const k = i * 2;
        indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  });
  const bedMaterial = toonMaterials.get('groundTerrain', { color: '#aab09a', name: 'pineforest/stream-bed' });
  const bed = new THREE.Mesh(bedGeometry, bedMaterial);
  bed.name = 'pineforest/stream-bed';
  group.add(bed);

  // —— 溪流水面（water 原型 1 DC）+ 2 层 additive 波光面（2.2.1；§7.2.2-③ 运行期 uv 滚动）——
  const stream = createWaterSurface({
    assets,
    name: 'pineforest/stream',
    width: 2.0,
    depth: 12.6,
    color: CHANNELS.streamBlue,
    glintColor: '#d8eef2',
    waveScale: 6,
    waveSpeed: 0.05,
    opacity: 0.8,
  });
  stream.position.set(STREAM_CENTER.x, STREAM_Y, STREAM_CENTER.y);
  stream.rotation.y = STREAM_ROT_Y;
  group.add(stream);
  const glintA = createGlintLayer({ assets, name: 'pineforest/stream-glint-a', width: 2.0, depth: 12.4, color: '#ffffff', opacity: 0.18 });
  glintA.position.set(STREAM_CENTER.x, STREAM_Y + 0.015, STREAM_CENTER.y);
  glintA.rotation.y = STREAM_ROT_Y;
  const glintB = createGlintLayer({ assets, name: 'pineforest/stream-glint-b', width: 2.0, depth: 12.4, color: '#e2f2f4', opacity: 0.13, streakScale: 9 });
  glintB.position.set(STREAM_CENTER.x, STREAM_Y + 0.03, STREAM_CENTER.y);
  glintB.rotation.y = STREAM_ROT_Y;
  group.add(glintA, glintB);
  propsRef.glintLayers = [glintA, glintB]; // 溪水流光动效取用点（lightHooks.update）

  // —— 营位碎石压盘（车停碎石地；1 DC 贴地圆盘）——
  const campPad = new THREE.Mesh(
    assets.geometry('pineforest/camp-pad', () => new THREE.CircleGeometry(2.3, 20).rotateX(-Math.PI / 2)),
    toonMaterials.get('groundTerrain', { color: '#8d937f', name: 'pineforest/camp-pad' }),
  );
  campPad.name = 'pineforest/camp-pad';
  campPad.position.set(CAMP_X, GRAVEL_TOP + 0.012, CAMP_Z);
  campPad.receiveShadow = true;
  group.add(campPad);

  // —— 山腰云带 billboard ×3（named mistBillboards；2.2.1 y 3.0/3.6/4.2 + 抬升 1.6 映射，7-2-⑦）——
  const mistGroup = new THREE.Group();
  mistGroup.name = 'pineforest/mist-billboards';
  const mistTexture = assets.texture('pineforest/tex/mist-band', () => paintCanvasTexture('pineforest/tex/mist-band', 256, 64, drawMistBandTexture, true));
  const mistSpecs: readonly { x: number; y: number; z: number; scale: number }[] = [
    { x: -2.2, y: 3.0 + GRAVEL_TOP, z: -5.6, scale: 7.0 },
    { x: 0.6, y: 3.6 + GRAVEL_TOP, z: -6.8, scale: 8.2 },
    { x: 2.4, y: 4.2 + GRAVEL_TOP, z: -4.6, scale: 6.2 },
  ];
  const mistMaterials: THREE.SpriteMaterial[] = [];
  mistSpecs.forEach((spec, i) => {
    const material = new THREE.SpriteMaterial({
      color: CHANNELS.mistCyan,
      map: mistTexture,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false,
    });
    material.name = `pineforest/mist-board-${i}`;
    const sprite = new THREE.Sprite(material);
    sprite.name = `pineforest/mist-board-${i}`;
    sprite.position.set(spec.x, spec.y, spec.z);
    sprite.scale.set(spec.scale, spec.scale * 0.2, 1);
    sprite.renderOrder = 20;
    sprite.userData.noOutline = true;
    mistGroup.add(sprite);
    mistMaterials.push(material);
  });
  group.add(mistGroup);
  propsRef.mistBoards = mistGroup.children as THREE.Sprite[];
  propsRef.mistMaterials = mistMaterials;
  propsRef.mistBaseX = mistSpecs.map((spec) => spec.x);
  propsRef.mistGroup = mistGroup; // named mistBillboards 取用点（buildProps 交出）

  return {
    group,
    campAnchor: {
      // §4.1.0 松林行 (0.4, 0, 0.2)/+0.20/groundY 0/radius 4.0——y=groundY=GRAVEL_TOP 为 T19 抬升裁定
      // （实心底座顶板无开孔，见文件头注记）；x/z/heading/radius 逐字。
      position: new THREE.Vector3(CAMP_X, GRAVEL_TOP, CAMP_Z),
      headingRad: CAMP_HEADING,
      groundY: GRAVEL_TOP,
      radius: CAMP_RADIUS,
    },
  };
}

/* ============================== ② buildProps（2.2.2 十二组） ============================== */

/** buildProps 产物登记（lightHooks.update / createAnimations 的取用点）。 */
interface PropRefs {
  glintLayers: THREE.Mesh[];
  mistBoards: THREE.Sprite[];
  mistMaterials: THREE.SpriteMaterial[];
  mistBaseX: number[];
  mistGroup: THREE.Group;
  groundMaterial: THREE.Material;
  canopyMaterials: THREE.MeshToonMaterial[];
  canopyBaseColors: THREE.Color[];
  fernMaterial: THREE.MeshToonMaterial;
  fernBaseColor: THREE.Color;
  coalMaterial: THREE.MeshToonMaterial;
  flameGroup: THREE.Group;
  flameMaterials: THREE.MeshBasicMaterial[];
  fireLamp: LampHandle;
  fireHaloMaterial: THREE.SpriteMaterial;
  towelMeshes: THREE.Mesh[];
  breakfastSet: THREE.Group;
  breakfastFadeMats: THREE.MeshToonMaterial[];
  spotMesh: THREE.InstancedMesh;
  spotMaterial: THREE.MeshBasicMaterial;
  spotBaseData: { x: number; z: number; rot: number; scale: number; phase: number }[];
}

const propsRef: Partial<PropRefs> = {};

function buildProps(ctx: SceneBuildContext): SceneProps {
  const { assets } = ctx;
  const group = new THREE.Group();
  group.name = 'pineforest/props';
  const rng = ctx.rng.fork('props');
  const cloths: ClothHandle[] = [];
  const lamps: LampHandle[] = [];
  const emitters: EmitterSpec[] = [];
  const surfaces: WeatherSurface[] = [];
  const y = GRAVEL_TOP;

  // ground 作用面（碎石地湿深/地面覆雪——§4.4.2 松林小雨/降雪行；材质自 buildTerrain 转交）
  surfaces.push({ material: propsRef.groundMaterial!, kind: 'ground' });

  /* —— 共用材质（同类 ≥3 必实例化，§5.6）—— */
  const deckWoodMaterial = toonMaterials.get('wood', { color: '#b08a5e', wetReactive: true, name: 'pineforest/deck-wood' });
  const postWoodMaterial = toonMaterials.get('wood', { color: '#8a6a48', name: 'pineforest/post-wood' });
  const barkMaterial = toonMaterials.get('wood', { color: CHANNELS.trunkBark, name: 'pineforest/pine-trunk' });

  /* — 松林环带 ×38：3 档实例化（干/冠分组，§5.6）+ 锚树 ×2 单体 — */
  // 冠材质：'foliage' 原型（ramp3+rim——§5.5 松林「逆光剪影 rim」由原型自带）；P2 植被风摆注入
  //   （7-2-①：顶摆幅 0.06u、0.8Hz；整批共享同一 uWindStrength 源——injectVegetationWind 语义）。
  const canopyColors = [CHANNELS.forestGreen, CHANNELS.canopyDark, CHANNELS.canopyLight];
  const tierCounts: Record<string, number> = { s: 12, m: 12, l: 12 };
  const tierIndexByTier: Record<string, number> = { s: 0, m: 1, l: 2 };
  const trunkGroups: Record<string, InstancedGroup> = {};
  const canopyGroups: Record<string, InstancedGroup> = {};
  const canopyMaterials: THREE.MeshToonMaterial[] = [];
  const canopyBaseColors: THREE.Color[] = [];
  for (const tier of PINE_TIERS) {
    const geo = createPineTierGeometries(assets, tier.id);
    const canopyMat = toonMaterials.get('foliage', { color: '#ffffff', name: `pineforest/canopy-${tier.id}` });
    injectVegetationWind(canopyMat, {
      ampU: 0.06, // 7-2-① 顶摆幅 0.06u
      freqHz: 0.8, // 0.8Hz
      heightU: geo.canopyTopY,
      phase: tierIndexByTier[tier.id]! * 0.7, // 异档错相（同种整批同步=同档共享材质）
    });
    canopyMaterials.push(canopyMat as THREE.MeshToonMaterial);
    canopyBaseColors.push(new THREE.Color('#ffffff'));
    trunkGroups[tier.id] = new InstancedGroup(geo.trunk, barkMaterial, {
      capacity: tierCounts[tier.id]!,
      withShell: true,
      name: `pineforest/pine-trunk-${tier.id}`,
      jitter: { hue: 0.006, saturation: 0.03, lightness: 0.04 },
    });
    canopyGroups[tier.id] = new InstancedGroup(geo.canopy, canopyMat, {
      capacity: tierCounts[tier.id]!,
      withShell: true,
      name: `pineforest/pine-canopy-${tier.id}`,
      jitter: { hue: 0.012, saturation: 0.04, lightness: 0.05 },
    });
  }

  /** 树位避让判定（营位/平台/火堆/步道/桥端/谷带/既有树距）。 */
  const placedTrees: THREE.Vector2[] = [];
  const exclusions: { x: number; z: number; r: number }[] = [
    { x: FIRE_POS.x, z: FIRE_POS.z, r: 2.5 },
    { x: ANCHOR_A.x, z: ANCHOR_A.z, r: 2.3 },
    { x: ANCHOR_B.x, z: ANCHOR_B.z, r: 2.3 },
    { x: TOWEL_POST.x, z: TOWEL_POST.z, r: 1.1 },
    { x: SIGN_POS.x, z: SIGN_POS.z, r: 1.3 },
    { x: BRIDGE_CENTER.x + VALLEY_N.x * 2.3, z: BRIDGE_CENTER.y + VALLEY_N.y * 2.3, r: 1.7 }, // 桥近端
    { x: -6.7, z: -3.4, r: 1.2 }, // 打水桶位
  ];
  const canPlaceTree = (x: number, z: number): boolean => {
    if (valleyDistance(x, z) < VALLEY_CUT_HALF + 0.55) return false; // 谷带+斜坡余量
    if (Math.hypot(x - CAMP_X, z - CAMP_Z) < 4.35) return false; // 营位净空
    if (Math.abs(x - PLATFORM_POS.x) < 2.85 && Math.abs(z - PLATFORM_POS.z) < 2.45) return false; // 平台+步道
    for (const ex of exclusions) {
      if (Math.hypot(x - ex.x, z - ex.z) < ex.r) return false;
    }
    for (const t of placedTrees) {
      if (t.distanceTo(new THREE.Vector2(x, z)) < 1.55) return false; // 株距
    }
    return true;
  };
  // 环带 ×36（3 档轮转 → 12/12/12 实例化）+ 锚树 ×2 单体 = 全场 38 棵（2.2.1「×38」与「锚树 ×2」
  // 的名额口径：锚树计入 38 总量、为环带外独立单体——干/冠几何与档位 m 共享，见 openIssues 注记）。
  const treeMatrix = new THREE.Matrix4();
  const tmpVec2 = new THREE.Vector2();
  let placed = 0;
  let guard = 0;
  while (placed < 36 && guard++ < 900) {
    // 环带散布：角度均分+抖动，半径 4.6~9.2（营位半径外缘起）；前缘（近观众 +z）少量大树保持营位视线
    const angle = (placed / 36) * Math.PI * 2 + (rng.next() - 0.5) * 0.38 + guard * 0.011;
    let radius = 4.6 + rng.next() * 4.6;
    const sinA = Math.sin(angle);
    if (sinA > 0.45 && Math.abs(Math.cos(angle)) < 0.75) radius = 8.2 + rng.next() * 1.2; // 前缘稀植
    const x = CAMP_X + Math.cos(angle) * radius;
    const z = CAMP_Z + sinA * radius;
    if (x < -9.2 || x > 9.2 || z < -9.2 || z > 9.2) continue;
    if (!canPlaceTree(x, z)) continue;
    placedTrees.push(tmpVec2.set(x, z).clone());
    const tier = PINE_TIERS[placed % 3]!; // 3 档轮转 → 12/12/12
    const color = canopyColors[placed % 3]!; // ×3 色档轮转
    treeMatrix.identity().setPosition(x, y, z);
    treeMatrix.multiply(new THREE.Matrix4().makeRotationY(rng.next() * Math.PI * 2));
    const scale = 0.9 + rng.next() * 0.25;
    treeMatrix.multiply(new THREE.Matrix4().makeScale(scale, scale, scale));
    trunkGroups[tier.id]!.add(treeMatrix, CHANNELS.trunkBark);
    canopyGroups[tier.id]!.add(treeMatrix, color);
    placed += 1;
  }
  for (const tier of PINE_TIERS) {
    group.add(trunkGroups[tier.id]!.group, canopyGroups[tier.id]!.group);
  }

  // 锚树 ×2（tier M 单体：干/冠 Mesh 各 1，供鸟屋/吊床/晾绳挂靠）
  const anchorTierGeo = createPineTierGeometries(assets, 'm');
  // 打磨轮次1修复：锚树冠此前直接复用 tier-m 实例冠材质（pineforest/canopy-m，基色白、靠
  // instanceColor 上绿）——单体 Mesh 无 instanceColor，全时段恒显纯白与松林冲突。改用同档配色
  // 专材（canopyDark = tier-m 档配色，canopyColors[1] 同源），并登记进 canopyMaterials/
  // canopyBaseColors，与实例冠同走「树冠剪影 canopyTint」逐帧驱动（update 侧 forEach 追加项）。
  const anchorCanopyMat = toonMaterials.get('foliage', {
    color: CHANNELS.canopyDark,
    name: 'pineforest/canopy-anchor',
  });
  injectVegetationWind(anchorCanopyMat, {
    ampU: 0.06, // 与 tier-m 同参（7-2-① 顶摆幅 0.06u / 0.8Hz）
    freqHz: 0.8,
    heightU: anchorTierGeo.canopyTopY,
    phase: 0.7, // tierIndex 1 × 0.7，与 m 档同相
  });
  canopyMaterials.push(anchorCanopyMat as THREE.MeshToonMaterial);
  canopyBaseColors.push(new THREE.Color(CHANNELS.canopyDark));
  const anchorDefs: readonly { pos: THREE.Vector3; rotY: number }[] = [
    { pos: ANCHOR_A, rotY: 0.7 },
    { pos: ANCHOR_B, rotY: 2.1 },
  ];
  anchorDefs.forEach((def, i) => {
    const trunk = new THREE.Mesh(anchorTierGeo.trunk, barkMaterial);
    trunk.name = `pineforest/anchor-trunk-${i}`;
    trunk.position.copy(def.pos);
    trunk.rotation.y = def.rotY;
    trunk.castShadow = true;
    const canopy = new THREE.Mesh(anchorTierGeo.canopy, anchorCanopyMat);
    canopy.name = `pineforest/anchor-canopy-${i}`;
    canopy.position.copy(def.pos);
    canopy.rotation.y = def.rotY;
    canopy.castShadow = true;
    group.add(trunk, canopy);
  });

  /* — ① 吊床（ClothHandle stiffness 0.3，7-2-⑤；两端绑绳挂锚树）— */
  const hammockSpan = ANCHOR_A.distanceTo(ANCHOR_B);
  const hammock = createHammock({ assets, id: 'pineforest/hammock', span: hammockSpan, color: '#d8734f' });
  const hammockMid = ANCHOR_A.clone().add(ANCHOR_B).multiplyScalar(0.5);
  hammock.mesh.position.set(hammockMid.x, y + 0.86, hammockMid.z);
  hammock.mesh.rotation.y = Math.atan2(ANCHOR_B.x - ANCHOR_A.x, ANCHOR_B.z - ANCHOR_A.z) + Math.PI / 2; // 局部 x 对齐两树连线
  group.add(hammock.mesh);
  cloths.push(hammock.handle);

  /* — ② 篝火堆+环形原木凳（石圈 ×10 复用 campfire.pit + 原木凳 ×6 + 柴堆；火焰+spark+火光灯）— */
  const fireRoot = new THREE.Group();
  fireRoot.name = 'pineforest/campfire';
  fireRoot.position.copy(FIRE_POS);
  const pit = createCampfirePit({ assets, id: 'campfire/pit-pineforest', ringRadius: 0.6 });
  fireRoot.add(pit.group);
  // 石顶雪壳（roofTop，五-5「平台/桥/石顶薄雪」；石圈顶面薄环壳）
  const stonesMesh = pit.group.children[0] as THREE.Mesh;
  const stonesSnow = new THREE.Mesh(
    assets.geometry('pineforest/stones-snow', () => {
      const ring = new THREE.TorusGeometry(0.62, 0.08, 6, 14);
      ring.rotateX(Math.PI / 2);
      ring.scale(1, 1, 0.55);
      ring.translate(0, 0.1, 0);
      return ring;
    }),
    makeSnowShellMaterial('pineforest/stones-snow'),
  );
  stonesSnow.name = 'pineforest/stones-snow';
  stonesSnow.userData.noOutline = true;
  stonesSnow.visible = false;
  pit.group.add(stonesSnow);
  surfaces.push({ material: stonesMesh.material as THREE.Material, kind: 'roofTop', snowShell: stonesSnow });
  // 余烬炭床（docs/05 §4.3.3-②：emissive #FF5A20 × emberPower 噪声闪烁——功率归场景 lightHooks）
  const coalGeometry = assets.geometry('pineforest/embers', () => {
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 5; i++) {
      const chunk = new THREE.IcosahedronGeometry(0.06 + (i % 3) * 0.012, 0);
      chunk.translate(Math.sin(i * 2.2) * 0.2, 0.05 + (i % 2) * 0.03, Math.cos(i * 1.9) * 0.2);
      parts.push(hardenEdges(chunk));
    }
    const merged = mergeGeometries(parts);
    if (!merged) throw new Error('[pineforest] 余烬合并失败');
    return merged;
  });
  const coalMaterial = toonMaterials.getToon('matteProp', {
    color: '#2c2622',
    emissive: '#FF5A20',
    emissiveIntensity: 0,
    name: 'pineforest/embers',
  });
  const embers = new THREE.Mesh(coalGeometry, coalMaterial);
  embers.name = 'pineforest/embers';
  fireRoot.add(embers);
  propsRef.coalMaterial = coalMaterial;

  // 三层火焰 + 火光点光挂点（P3）+ 火光呼吸灯（breath 1.5s 快相位，功率=emberPower 场景映射）
  const flame = createCampfireFlame(assets, 'pineforest/flame');
  fireRoot.add(flame.group);
  propsRef.flameGroup = flame.group;
  propsRef.flameMaterials = flame.materials;
  const glowCore = createFireGlowCore(assets, 'pineforest/fire-glow');
  glowCore.mesh.position.y = 0.5;
  fireRoot.add(glowCore.mesh);
  const fireHaloTexture = makeHaloTexture(assets, 'pineforest/tex/halo');
  const fireHaloMaterial = new THREE.SpriteMaterial({
    color: CHANNELS.campfireOrange,
    map: fireHaloTexture,
    transparent: true,
    opacity: 0.35, // §4.3.3-⑧ 基值：LightBreath 逐帧 ×输出×(1+0.5×glow)
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  fireHaloMaterial.name = 'pineforest/fire-halo';
  const fireHalo = new THREE.Sprite(fireHaloMaterial);
  fireHalo.name = 'pineforest/fire-halo';
  fireHalo.position.y = 0.62;
  fireHalo.scale.setScalar(1.15);
  fireHalo.renderOrder = 20;
  fireRoot.add(fireHalo);
  const fireLamp: LampHandle = {
    emissiveMat: glowCore.material,
    halo: fireHalo,
    mode: 'breath', // 2.2.2-②「LampHandle 呼吸快相位」：breath 1.5s（RhythmClock 快档）
    params: { period: 1.5, depth: 0.4 },
  };
  lamps.push(fireLamp);
  propsRef.fireLamp = fireLamp;
  propsRef.fireHaloMaterial = fireHaloMaterial;
  fireRoot.add(flame.fireLightAnchor); // P3 点光挂点（点光本体归 Director/render 点光池，docs/05 §7.1.4）
  group.add(fireRoot);

  // 环形原木凳 ×6（实例化）+ 早餐餐具（J4，dawn 出现于原木凳面）
  const benchGeometry = createLogBenchGeometry(assets, 'pineforest/log-bench');
  const benchMaterial = toonMaterials.get('wood', { color: '#8a6a48', name: 'pineforest/log-bench' });
  const benches = new InstancedGroup(benchGeometry, benchMaterial, {
    capacity: 6,
    withShell: true,
    name: 'pineforest/log-benches',
    jitter: { hue: 0.008, saturation: 0.03, lightness: 0.04 },
  });
  const benchMatrix = new THREE.Matrix4();
  const benchPositions: THREE.Vector3[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2 + 0.26;
    const bx = FIRE_POS.x + Math.cos(angle) * 1.2;
    const bz = FIRE_POS.z + Math.sin(angle) * 1.2;
    benchPositions.push(new THREE.Vector3(bx, y, bz));
    benchMatrix.identity().setPosition(bx, y, bz);
    benchMatrix.multiply(new THREE.Matrix4().makeRotationY(-angle + Math.PI / 2)); // 凳轴切向火圈
    benches.add(benchMatrix, '#8a6a48');
  }
  group.add(benches.group);
  const breakfastSet = buildBreakfastSet(assets);
  breakfastSet.name = 'pineforest/breakfast-set';
  const breakfastBench = benchPositions[4]!; // 凳面朝平台侧（远离车辆走廊）
  breakfastSet.position.set(breakfastBench.x, y + 0.36, breakfastBench.z);
  breakfastSet.rotation.y = -0.4;
  breakfastSet.scale.setScalar(0.9);
  breakfastSet.visible = false;
  group.add(breakfastSet);
  propsRef.breakfastSet = breakfastSet;
  propsRef.breakfastFadeMats = collectMeshMaterials(breakfastSet);

  // 柴堆金字塔（6 根/堆，实例化 ×3 堆——2.2.2-⑧）
  const firewoodGeometry = createFirewoodPyramidGeometry(assets, 'pineforest/firewood');
  const firewoodMaterial = toonMaterials.get('wood', { color: '#7a5c3e', name: 'pineforest/firewood' });
  const firewood = new InstancedGroup(firewoodGeometry, firewoodMaterial, {
    capacity: 3,
    withShell: true,
    name: 'pineforest/firewood-stacks',
  });
  const woodSpecs: readonly { x: number; z: number; rotY: number }[] = [
    { x: 4.4, z: 0.05, rotY: 0.5 },
    { x: 4.5, z: 2.3, rotY: -0.3 },
    { x: 2.5, z: 2.65, rotY: 0.9 },
  ];
  const woodMatrix = new THREE.Matrix4();
  for (const spec of woodSpecs) {
    woodMatrix.identity().setPosition(spec.x, y, spec.z);
    woodMatrix.multiply(new THREE.Matrix4().makeRotationY(spec.rotY));
    firewood.add(woodMatrix, '#7a5c3e');
  }
  group.add(firewood.group);

  /* — ③ 木质营位平台 + 木阶步道（4.6×3.8 板格；车不停平台上 J2；平台顶 roofTop）— */
  const platformRoot = new THREE.Group();
  platformRoot.name = 'pineforest/platform';
  platformRoot.position.copy(PLATFORM_POS);
  platformRoot.rotation.y = 0.12;
  const plankGeometry = assets.geometry('pineforest/platform-plank', () =>
    hardenEdges(roundedBox({ width: PLATFORM_PLANK_W, height: 0.05, depth: 0.27, radius: 0.01 })),
  );
  const planks = new InstancedGroup(plankGeometry, deckWoodMaterial, {
    capacity: 12,
    withShell: true,
    name: 'pineforest/platform-planks',
    jitter: { hue: 0.008, saturation: 0.03, lightness: 0.04 },
  });
  const plankMatrix = new THREE.Matrix4();
  for (let i = 0; i < 12; i++) {
    plankMatrix.identity().setPosition(0, 0.14, -1.72 + i * 0.313);
    planks.add(plankMatrix, '#b08a5e');
  }
  platformRoot.add(planks.group);
  const platformFrame = new THREE.Mesh(
    assets.geometry('pineforest/platform-frame', () => {
      const parts: THREE.BufferGeometry[] = [];
      for (const side of [-1, 1]) {
        const joist = roundedBox({ width: 4.6, height: 0.08, depth: 0.1, radius: 0.01 });
        joist.translate(0, 0.09, side * 1.85);
        parts.push(hardenEdges(joist));
      }
      for (const px of [-2.2, 0, 2.2]) {
        for (const pz of [-1.75, 1.75]) {
          const post = new THREE.CylinderGeometry(0.05, 0.06, 0.14, 7);
          post.translate(px, 0.07, pz);
          parts.push(hardenEdges(post));
        }
      }
      const merged = mergeGeometries(parts);
      if (!merged) throw new Error('[pineforest] 平台骨架合并失败');
      return merged;
    }),
    postWoodMaterial,
  );
  platformFrame.name = 'pineforest/platform-frame';
  platformFrame.castShadow = true;
  platformRoot.add(platformFrame);
  // 平台顶雪壳（roofTop，五-5）
  const platformSnow = new THREE.Mesh(
    assets.geometry('pineforest/platform-snow', () => new THREE.PlaneGeometry(4.5, 3.7).rotateX(-Math.PI / 2)),
    makeSnowShellMaterial('pineforest/platform-snow'),
  );
  platformSnow.name = 'pineforest/platform-snow';
  platformSnow.position.y = 0.17;
  platformSnow.userData.noOutline = true;
  platformSnow.visible = false;
  platformRoot.add(platformSnow);
  surfaces.push({ material: deckWoodMaterial, kind: 'roofTop', snowShell: platformSnow });
  group.add(platformRoot);
  // 木阶步道（营位→平台，垫木踏步 ×5 实例化）
  const stepGeometry = assets.geometry('pineforest/step', () =>
    hardenEdges(roundedBox({ width: 0.52, height: 0.05, depth: 0.34, radius: 0.01 })),
  );
  const steps = new InstancedGroup(stepGeometry, deckWoodMaterial, {
    capacity: 5,
    withShell: true,
    name: 'pineforest/steps',
  });
  const stepMatrix = new THREE.Matrix4();
  for (let i = 0; i < 5; i++) {
    const t = i / 4;
    const sx = -1.55 + (PLATFORM_POS.x + 1.4 - -1.55) * t;
    const sz = 0.35 + (PLATFORM_POS.z + 2.1 - 0.35) * t;
    stepMatrix.identity().setPosition(sx, y + 0.026, sz);
    stepMatrix.multiply(new THREE.Matrix4().makeRotationY(0.12));
    steps.add(stepMatrix, '#b08a5e');
  }
  group.add(steps.group);

  /* — ④ 跨溪小木桥（纵梁+桥板 ×8+扶绳；桥面 roofTop；落叶 leaf 粒子见 emitters）— */
  const bridge = createStreamBridge({ assets, id: 'pineforest/bridge', length: 4.6, width: 1.05 });
  bridge.group.name = 'pineforest/bridge';
  bridge.group.position.set(BRIDGE_CENTER.x, GRAVEL_TOP - 0.02, BRIDGE_CENTER.z);
  bridge.group.rotation.y = BRIDGE_ROT_Y;
  group.add(bridge.group);
  const bridgeSnow = new THREE.Mesh(
    assets.geometry('pineforest/bridge-snow', () => new THREE.PlaneGeometry(1.0, 4.4).rotateX(-Math.PI / 2)),
    makeSnowShellMaterial('pineforest/bridge-snow'),
  );
  bridgeSnow.name = 'pineforest/bridge-snow';
  bridgeSnow.position.y = 0.24;
  bridgeSnow.userData.noOutline = true;
  bridgeSnow.visible = false;
  bridge.group.add(bridgeSnow);
  surfaces.push({ material: bridge.deckMaterial, kind: 'roofTop', snowShell: bridgeSnow });

  /* — ⑤ 指路木牌（3 块箭头板 J6）— */
  const sign = createTrailSign({
    assets,
    id: 'pineforest/trail-sign',
    arrows: [
      { text: '滝の道 0.8km', arrow: 'right', height: 1.42 },
      { text: '山小屋 2.5km', arrow: 'left', height: 1.12 },
      { text: 'キャンプ場', arrow: 'right', height: 0.82 },
    ],
    postHeight: 1.5,
  });
  sign.name = 'pineforest/trail-sign';
  sign.position.copy(SIGN_POS);
  sign.rotation.y = 0.4;
  group.add(sign);

  /* — ⑥ 鸟屋（挂锚树干 h1.5）+ 防熊食物储藏箱（平台边）— */
  const birdhouse = createBirdhouse(assets, 'pineforest/birdhouse');
  birdhouse.group.name = 'pineforest/birdhouse';
  const bhDir = new THREE.Vector3(CAMP_X - ANCHOR_B.x, 0, CAMP_Z - ANCHOR_B.z).normalize();
  birdhouse.group.position.set(ANCHOR_B.x + bhDir.x * 0.12, y + 1.5, ANCHOR_B.z + bhDir.z * 0.12);
  birdhouse.group.rotation.y = Math.atan2(bhDir.x, bhDir.z);
  group.add(birdhouse.group);
  const bearBox = createBearBox(assets, 'pineforest/bear-box');
  bearBox.group.name = 'pineforest/bear-box';
  bearBox.group.position.set(-1.75, y + 0.165, -2.0); // 平台面（台顶 y+0.165）
  bearBox.group.rotation.y = -0.4;
  group.add(bearBox.group);
  // （防熊箱盖不另占 surface 名额——5 surfaces 口径：ground/平台/桥/石圈/毛巾，§4.1.2 预算行）

  /* — ⑦ 苔藓蕨类蘑菇丛（各 1 组实例化；蘑菇红帽白点）— */
  const mossMaterial = toonMaterials.get('foliage', { color: '#4a6e3f', name: 'pineforest/moss' });
  const mossGeometry = createMossPatchGeometry(assets, 'pineforest/moss-patch');
  const moss = new InstancedGroup(mossGeometry, mossMaterial, { capacity: 10, name: 'pineforest/moss-patches' });
  const fernMaterial = toonMaterials.get('foliage', { color: CHANNELS.forestGreen, name: 'pineforest/fern' });
  injectVegetationWind(fernMaterial, { ampU: 0.04, freqHz: 0.8, heightU: 0.4, phase: 2.1 }); // P2（蕨丛）
  propsRef.fernMaterial = fernMaterial as THREE.MeshToonMaterial;
  propsRef.fernBaseColor = new THREE.Color(CHANNELS.forestGreen);
  const fernGeometry = createFernTuftGeometry(assets, 'pineforest/fern-tuft');
  const ferns = new InstancedGroup(fernGeometry, fernMaterial, { capacity: 12, name: 'pineforest/ferns' });
  const capTexture = assets.texture('pineforest/tex/mushroom-cap', () => paintMushroomCapTexture('pineforest'));
  const mushroomMaterial = toonMaterials.get('matteProp', { color: '#ffffff', map: capTexture, name: 'pineforest/mushroom' });
  const mushroomGeometry = createMushroomGeometry(assets, 'pineforest/mushroom');
  const mushrooms = new InstancedGroup(mushroomGeometry, mushroomMaterial, { capacity: 9, name: 'pineforest/mushrooms' });
  const floraMatrix = new THREE.Matrix4();
  const floraSpot = (): { x: number; z: number } | null => {
    for (let attempt = 0; attempt < 30; attempt++) {
      const angle = rng.next() * Math.PI * 2;
      const radius = 2.8 + rng.next() * 5.6;
      const x = CAMP_X + Math.cos(angle) * radius;
      const z = CAMP_Z + Math.sin(angle) * radius;
      if (x < -9.4 || x > 9.4 || z < -9.4 || z > 9.4) continue;
      if (valleyDistance(x, z) < VALLEY_CUT_HALF + 0.3) continue;
      if (Math.abs(x - PLATFORM_POS.x) < 2.7 && Math.abs(z - PLATFORM_POS.z) < 2.3) continue;
      if (Math.hypot(x - FIRE_POS.x, z - FIRE_POS.z) < 2.2) continue;
      return { x, z };
    }
    return null;
  };
  for (let i = 0; i < 10; i++) {
    const spot = floraSpot();
    if (!spot) continue;
    floraMatrix.identity().setPosition(spot.x, y + 0.01, spot.z);
    floraMatrix.multiply(new THREE.Matrix4().makeRotationY(rng.next() * Math.PI * 2));
    const s = 0.8 + rng.next() * 0.6;
    floraMatrix.multiply(new THREE.Matrix4().makeScale(s, s, s));
    moss.add(floraMatrix, '#4a6e3f');
  }
  for (let i = 0; i < 12; i++) {
    const spot = floraSpot();
    if (!spot) continue;
    floraMatrix.identity().setPosition(spot.x, y, spot.z);
    floraMatrix.multiply(new THREE.Matrix4().makeRotationY(rng.next() * Math.PI * 2));
    const s = 0.85 + rng.next() * 0.5;
    floraMatrix.multiply(new THREE.Matrix4().makeScale(s, s, s));
    ferns.add(floraMatrix, CHANNELS.forestGreen);
  }
  for (let c = 0; c < 3; c++) {
    // 蘑菇 3 丛 ×3 株（红帽白点，2.2.2-⑦）
    const center = floraSpot();
    if (!center) continue;
    for (let k = 0; k < 3; k++) {
      const mx = center.x + (rng.next() - 0.5) * 0.32;
      const mz = center.z + (rng.next() - 0.5) * 0.32;
      floraMatrix.identity().setPosition(mx, y, mz);
      floraMatrix.multiply(new THREE.Matrix4().makeRotationY(rng.next() * Math.PI * 2));
      const s = 0.7 + rng.next() * 0.7;
      floraMatrix.multiply(new THREE.Matrix4().makeScale(s, s, s));
      mushrooms.add(floraMatrix, '#ffffff');
    }
  }
  group.add(moss.group, ferns.group, mushrooms.group);

  /* — ⑨ 晾晒毛巾 ×3（ClothHandle ×3 + clothTop；dawn 露水=uDew emissive 微青近似，§4.3.3-④）— */
  const towelRopeGeometry = assets.geometry('pineforest/towel-rope', () => {
    const a = new THREE.Vector3(ANCHOR_B.x, y + 1.32, ANCHOR_B.z);
    const b = new THREE.Vector3(TOWEL_POST.x, y + 1.3, TOWEL_POST.z);
    const mid = a.clone().lerp(b, 0.5).add(new THREE.Vector3(0, -0.14, 0));
    return tube({ pointsOrCurve: new THREE.CatmullRomCurve3([a, mid, b]), radius: 0.011, tubularSegments: 16, radialSegments: 5 });
  });
  const towelRope = new THREE.Mesh(towelRopeGeometry, toonMaterials.get('matteProp', { color: '#8a7a62', name: 'pineforest/towel-rope' }));
  towelRope.name = 'pineforest/towel-rope';
  group.add(towelRope);
  const towelPost = new THREE.Mesh(
    assets.geometry('pineforest/towel-post', () => {
      const post = new THREE.CylinderGeometry(0.03, 0.036, 1.4, 7);
      post.translate(0, 0.7, 0);
      return hardenEdges(post);
    }),
    postWoodMaterial,
  );
  towelPost.name = 'pineforest/towel-post';
  towelPost.position.copy(TOWEL_POST);
  towelPost.castShadow = true;
  group.add(towelPost);
  const towelColors = ['#eef0f2', '#cfe0e8', '#e8ddd0'];
  const towelMaterials: THREE.MeshToonMaterial[] = [];
  const towelMeshes: THREE.Mesh[] = [];
  const towelSpecs: readonly { t: number; color: string }[] = [
    { t: 0.22, color: towelColors[0]! },
    { t: 0.5, color: towelColors[1]! },
    { t: 0.78, color: towelColors[2]! },
  ];
  towelSpecs.forEach((spec, i) => {
    const towel = createMicroCloth({
      assets,
      id: `pineforest/towel-${i}`,
      width: 0.4, // uv.x 轴=悬挂向（rotation.z −90° 后竖垂，固定边=顶）
      height: 0.58,
      color: spec.color,
      stiffness: 0.5, // docs/05 §7.1.2 晾晒毛巾行
      windFactor: 1.0,
      sagAmp: 0.02, // 布面下凹（uSag 链）
      swayAxes: ['y', 'z'], // 物体系：旋转后=世界水平摆
      preset: 'hang',
      droop: 0.03,
      doubleSided: true,
    });
    // 挂绳位置（含垂弧）：
    const ropeY = y + 1.31 - Math.sin(Math.PI * spec.t) * 0.14;
    const px = ANCHOR_B.x + (TOWEL_POST.x - ANCHOR_B.x) * spec.t;
    const pz = ANCHOR_B.z + (TOWEL_POST.z - ANCHOR_B.z) * spec.t;
    towel.mesh.rotation.set(0, Math.PI / 2 + (i - 1) * 0.14, -Math.PI / 2); // uv.x 轴竖垂（固定边=顶沿挂绳）
    towel.mesh.position.set(px, ropeY - 0.3, pz);
    group.add(towel.mesh);
    cloths.push(towel.handle);
    towelMaterials.push(towel.mesh.material as THREE.MeshToonMaterial);
    towelMeshes.push(towel.mesh);
  });
  propsRef.towelMeshes = towelMeshes;
  // 布顶雪壳（clothTop，挂第 1 条毛巾之下继承风摆与 sag——M4）
  const towelSnow = new THREE.Mesh(
    assets.geometry('pineforest/towel-snow', () => new THREE.PlaneGeometry(0.38, 0.3).rotateX(-Math.PI / 2)),
    makeSnowShellMaterial('pineforest/towel-snow'),
  );
  towelSnow.name = 'pineforest/towel-snow';
  towelSnow.position.y = 0.02;
  towelSnow.userData.noOutline = true;
  towelSnow.visible = false;
  towelMeshes[0]!.add(towelSnow);
  surfaces.push({ material: towelMaterials[0]!, kind: 'clothTop', snowShell: towelSnow });

  /* — ⑩ 打水桶与水瓢（Lathe 桶+半球瓢；溪岸近桥端）— */
  const bucket = createWaterBucket(assets, 'pineforest/bucket');
  bucket.name = 'pineforest/bucket';
  bucket.position.set(-6.7, y, -3.4);
  bucket.rotation.y = 0.5;
  group.add(bucket);
  const ladle = createWaterLadle(assets, 'pineforest/ladle');
  ladle.name = 'pineforest/ladle';
  ladle.position.set(-6.42, y + 0.012, -3.22);
  ladle.rotation.y = 1.8;
  group.add(ladle);

  /* — ⑫ 林间斑驳光斑（10 片 additive 贴地，named lightSpots，实例化 1 DC；§7.2.2-②）— */
  const dappleTexture = assets.texture('pineforest/tex/dapple', () => paintCanvasTexture('pineforest/tex/dapple', 128, 128, drawDappleTexture, true));
  const spotMaterial = new THREE.MeshBasicMaterial({
    color: CHANNELS.sunSpot,
    map: dappleTexture,
    transparent: true,
    opacity: 0.5,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  });
  spotMaterial.name = 'pineforest/light-spots';
  const spotGeometry = assets.geometry('pineforest/light-spot', () => new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2));
  const spotMesh = new THREE.InstancedMesh(spotGeometry, spotMaterial, 10);
  spotMesh.name = 'pineforest/light-spots';
  spotMesh.count = 10;
  spotMesh.frustumCulled = false;
  spotMesh.renderOrder = 20;
  spotMesh.userData.noOutline = true;
  const spotBaseData: { x: number; z: number; rot: number; scale: number; phase: number }[] = [];
  const spotObj = new THREE.Object3D();
  for (let i = 0; i < 10; i++) {
    // 光斑落在林间碎石地上（营位周边环带；无避让——光斑是光不是实体）
    const angle = (i / 10) * Math.PI * 2 + rng.next() * 0.6;
    const radius = 2.6 + rng.next() * 5.2;
    const sx = CAMP_X + Math.cos(angle) * radius;
    const sz = CAMP_Z + Math.sin(angle) * radius;
    const rot = rng.next() * Math.PI * 2;
    const scale = 0.8 + rng.next() * 0.9;
    const phase = rng.next() * Math.PI * 2;
    spotBaseData.push({ x: sx, z: sz, rot, scale, phase });
    spotObj.position.set(sx, y + 0.02, sz);
    spotObj.rotation.set(0, rot, 0);
    spotObj.scale.setScalar(scale);
    spotObj.updateMatrix();
    spotMesh.setMatrixAt(i, spotObj.matrix);
    spotMesh.setColorAt(i, new THREE.Color(CHANNELS.sunSpot));
  }
  spotMesh.instanceMatrix.needsUpdate = true;
  group.add(spotMesh);
  propsRef.spotMesh = spotMesh;
  propsRef.spotMaterial = spotMaterial;
  propsRef.spotBaseData = spotBaseData;
  propsRef.canopyMaterials = canopyMaterials;
  propsRef.canopyBaseColors = canopyBaseColors;

  /* — 粒子发射器（6 spec：spark/steam/mist/leaf/drip×2——§7.1.3 定值；锚点/门控口径见 openIssues）— */
  // spark：rate=6×emberPower（7-2-⑥；handed rate=6 为 emberPower=1 档值，时间门控待 T33 emitterHandles——
  //   T18 steam 同口径）。锚点=Director 下发 campAnchor（R-P3-1 ④ 已登记，火堆偏营位右前 3.05u）。
  emitters.push({
    kind: 'spark',
    area: new THREE.Vector3(1.2, 0.8, 1.2),
    rate: 6,
    lifetime: 1.4, // §7.1.3 spark 行
    size0: 0.02,
    size1: 0.004,
    vel0: new THREE.Vector3(0, 0.5, 0),
    color: '#ffb066',
    opacity: 0.85,
    additive: true,
  });
  // steam：篝火炊烟（白天熄火冒炊烟——§4.3.4 松林 day 2.2/s；§7.1.3「2.2×smokePower+0.4」）
  emitters.push({
    kind: 'steam',
    area: new THREE.Vector3(1.6, 1.2, 1.6),
    rate: 2.2,
    lifetime: 3.5,
    size0: 0.05,
    size1: 0.25,
    vel0: new THREE.Vector3(0.02, 0.22, 0.01),
    color: '#e8e4dc',
    opacity: 0.3,
    additive: false,
  });
  // mist：晨雾（7-2-⑦；§7.1.3 mist 行 rate 1.5/雾天×1.6、life 12、0.8~1.6 大团、0.12m/s 水平漂）
  emitters.push({
    kind: 'mist',
    area: new THREE.Vector3(7.5, 1.3, 7.5),
    rate: 1.5,
    lifetime: 12,
    size0: 0.8,
    size1: 1.6,
    vel0: new THREE.Vector3(0.05, 0.008, 0.03),
    color: CHANNELS.mistCyan,
    opacity: 0.15,
    additive: false,
  });
  // leaf：落叶（7-2-③；§7.1.3 leaf 行 rate 0.4/life 20/0.04×0.03/顺溪 0.14m/s+旋转）
  emitters.push({
    kind: 'leaf',
    area: new THREE.Vector3(3.2, 0.8, 3.2),
    rate: 0.4,
    lifetime: 20,
    size0: 0.04,
    size1: 0.03,
    vel0: new THREE.Vector3(VALLEY_DIR.x * 0.14, -0.02, VALLEY_DIR.y * 0.14),
    color: '#b98a3e',
    opacity: 0.75,
    additive: false,
  });
  // drip ×2：树冠滴水（平台沿/桥沿，rate 2.5/点，§4.4.2 松林小雨行）——rate 0 占位（T18 drip 同口径：
  //   天气门控待 T33；两处锚点逐点化同待 T33 emitterHandles）
  for (let d = 0; d < 2; d++) {
    emitters.push({
      kind: 'drip',
      area: new THREE.Vector3(0.4, 0.12, 0.4),
      rate: 0,
      lifetime: 0.8,
      size0: 0.015,
      size1: 0.015,
      vel0: new THREE.Vector3(0, -3, 0),
      color: '#b8d4e8',
      opacity: 0.5,
      additive: false,
    });
  }

  return {
    group,
    named: {
      campfire: fireRoot,
      lightSpots: spotMesh,
      mistBillboards: propsRef.mistGroup!, // 山腰云带（buildTerrain 构建、props named 交出，§4.1.2）
    },
    cloths,
    lamps,
    emitters,
    weatherSurfaces: surfaces,
  };
}

/* ============================== 早餐餐具（J4；Lathe 盘/杯/壶——原木凳面档） ============================== */

function buildBreakfastSet(assets: SceneBuildContext['assets']): THREE.Group {
  const group = new THREE.Group();
  group.name = 'pineforest/breakfast-inner';
  const uniqueMat = (color: string, name: string): THREE.MeshToonMaterial =>
    toonMaterials.getToon('matteProp', { color, opacity: 0.999, name }); // opacity<1 → transparent 开（0.2s 淡变）
  const plateMat = uniqueMat('#f5f2ea', 'pineforest/breakfast-plate');
  const cupMat = uniqueMat('#6a8aa8', 'pineforest/breakfast-cup');
  const potMat = uniqueMat('#e8e2d4', 'pineforest/breakfast-pot');

  const plateGeometry = assets.geometry('pineforest/breakfast-plate', () =>
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
    [-0.26, 0.07],
    [0.1, 0.11],
  ] as const) {
    const plate = new THREE.Mesh(plateGeometry, plateMat);
    plate.name = 'pineforest/breakfast-plate';
    plate.position.set(px, 0, pz);
    group.add(plate);
  }
  const cupGeometry = assets.geometry('pineforest/breakfast-cup', () =>
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
    [-0.05, -0.11],
    [0.21, -0.05],
  ] as const) {
    const cup = new THREE.Mesh(cupGeometry, cupMat);
    cup.name = 'pineforest/breakfast-cup';
    cup.position.set(px, 0.01, pz);
    group.add(cup);
  }
  const potBody = new THREE.Mesh(
    assets.geometry('pineforest/breakfast-pot', () =>
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
  potBody.name = 'pineforest/breakfast-pot';
  const potHandle = new THREE.Mesh(
    assets.geometry('pineforest/breakfast-pot-handle', () => {
      const handle = new THREE.TorusGeometry(0.05, 0.012, 6, 10, Math.PI);
      handle.rotateY(Math.PI / 2);
      return handle;
    }),
    potMat,
  );
  potHandle.name = 'pineforest/breakfast-pot-handle';
  potHandle.position.set(0.15, 0.14, 0);
  const potLid = new THREE.Mesh(
    assets.geometry('pineforest/breakfast-pot-lid', () =>
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
  potLid.name = 'pineforest/breakfast-pot-lid';
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

/* ============================== ③ createAnimations（7.2.2 松林 4 个） ============================== */

/** 光斑摇曳（7-2-②：每片 α=base·(0.85+0.15·sin(0.4t+φᵢ))、位置微移 ±0.03u、uv 漂移 0.008/s）+ songBurst。 */
function createLightSpotAnimation(runtime: SceneRuntime, state: PineforestState): SceneAnimation {
  const handle = runtime.scheduler.add({
    meanIntervalS: 9, // docs/05 §7.1.5-4 光斑鸟鸣跳动
    jitterS: 3,
    fire(): void {
      if (state.time !== 'dawn') return; // 清晨专属（鸟鸣般跳动，纯视觉 Q1）
      state.burstT = 0; // 0.9s 窗启动（3~5 个 ~4Hz 快脉冲由 update 展包）
    },
  });
  const obj = new THREE.Object3D();
  const tint = new THREE.Color();
  return {
    update(dt: number, elapsed: number): void {
      const mesh = propsRef.spotMesh;
      const material = propsRef.spotMaterial;
      const data = propsRef.spotBaseData;
      if (!mesh || !material || !data) return;
      // songBurst 包络：0.9s 窗内 3~5 个 ~4Hz 快脉冲（高斯包×快频），窗外=0
      let burstBoost = 0;
      if (state.burstT >= 0) {
        state.burstT += dt;
        if (state.burstT > 0.9) {
          state.burstT = -1;
        } else {
          const pulses = 4;
          for (let k = 0; k < pulses; k++) {
            const tk = k * (0.9 / pulses);
            const g = Math.exp(-Math.pow((state.burstT - tk) / 0.09, 2));
            burstBoost = Math.max(burstBoost, g * (0.55 + 0.45 * Math.sin(2 * Math.PI * 4 * state.burstT + k)));
          }
        }
      }
      const weatherMul = WEATHER_SPOT_MUL[state.weather] ?? 1;
      const uv = material.map;
      if (uv) uv.offset.x += 0.008 * dt; // §7.2.2-② uv 漂移 0.008/s
      material.color.copy(state.spotTint); // 时间档 tint（清晨白金/黄昏金 #ffd9a0/夜间月青）
      for (let i = 0; i < data.length; i++) {
        const spot = data[i]!;
        const sway = 0.85 + 0.15 * Math.sin(0.4 * elapsed + spot.phase);
        obj.position.set(
          spot.x + Math.sin(0.4 * elapsed + spot.phase) * 0.03, // 位置微移 ±0.03u
          GRAVEL_TOP + 0.02,
          spot.z + Math.cos(0.4 * elapsed + spot.phase * 1.3) * 0.03,
        );
        obj.rotation.set(0, spot.rot, 0);
        obj.scale.setScalar(spot.scale * (1 + burstBoost * 0.12));
        obj.updateMatrix();
        mesh.setMatrixAt(i, obj.matrix);
        // 逐片 α 走 additive 明度（instanceColor×sway×burst；α=base·(0.85+0.15·sin) 逐字）
        tint.copy(material.color).multiplyScalar(clamp(state.spotBase * sway * weatherMul * (1 + burstBoost * 0.9), 0, 1.2));
        mesh.setColorAt(i, tint);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      material.opacity = clamp(state.spotBase * weatherMul, 0.02, 1);
      material.visible = material.opacity >= 0.02;
    },
    dispose(): void {
      handle.cancel();
    },
  };
}

/** 落叶漂流（7-2-③ 编排面：6 片叶沿溪漂流自转 0.6rad/s——粒子面另经 leaf EmitterSpec）。 */
function createLeafDriftAnimation(runtime: SceneRuntime): SceneAnimation {
  const { assets } = runtime;
  const root = new THREE.Group();
  root.name = 'pineforest/leaf-drift';
  runtime.root.add(root);
  const leafMaterial = toonMaterials.get('matteProp', { color: '#c89040', outline: false, name: 'pineforest/leaf-drift' });
  leafMaterial.side = THREE.DoubleSide;
  const leafGeometry = assets.geometry('pineforest/leaf-drift-quad', () => {
    const quad = new THREE.PlaneGeometry(0.09, 0.06);
    quad.rotateX(-Math.PI / 2);
    return quad;
  });
  const leaves: { mesh: THREE.Mesh; t: number; speed: number; spin: number; lane: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const mesh = new THREE.Mesh(leafGeometry, leafMaterial);
    mesh.name = `pineforest/leaf-drift-${i}`;
    mesh.userData.noOutline = true;
    mesh.renderOrder = 20;
    root.add(mesh);
    leaves.push({ mesh, t: (i / 6) * 1.2, speed: 0.11 + (i % 3) * 0.02, spin: 0.6 * (i % 2 === 0 ? 1 : -1), lane: ((i % 3) - 1) * 0.5 });
  }
  return {
    update(dt: number): void {
      for (const leaf of leaves) {
        leaf.t += (leaf.speed * dt) / 12.6; // 带长归一推进
        if (leaf.t > 1.05) leaf.t -= 1.1;
        const t = clamp(leaf.t, 0, 1);
        const px = VALLEY_P0.x + (VALLEY_P1.x - VALLEY_P0.x) * t;
        const pz = VALLEY_P0.y + (VALLEY_P1.y - VALLEY_P0.y) * t;
        leaf.mesh.position.set(
          px + VALLEY_N.x * leaf.lane,
          STREAM_Y + 0.02 + Math.sin(leaf.t * 40) * 0.008,
          pz + VALLEY_N.y * leaf.lane,
        );
        leaf.mesh.rotation.y += leaf.spin * dt; // 自转 0.6rad/s（§7.2.2-③）
      }
      root.visible = true;
    },
    dispose(): void {
      root.removeFromParent();
    },
  };
}

/** 松鼠窜过（7-2-④：EventScheduler 26s±10s，仅 dawn/day/dusk；地面样条 2~3m/2.2s、中段停 0.4s、8Hz 体颠）。 */
function createSquirrelAnimation(runtime: SceneRuntime, state: PineforestState): SceneAnimation {
  const { assets, scheduler, rng } = runtime;
  const root = new THREE.Group();
  root.name = 'pineforest/squirrel';
  root.visible = false;
  runtime.root.add(root);
  const bodyMaterial = toonMaterials.get('matteProp', { color: '#8a5a38', outline: false, name: 'pineforest/squirrel-body' });
  const tailMaterial = toonMaterials.get('matteProp', { color: '#a87850', outline: false, name: 'pineforest/squirrel-tail' });
  const bodyGeometry = assets.geometry('pineforest/squirrel-body', () => {
    const body = new THREE.CapsuleGeometry(0.045, 0.09, 4, 8);
    body.rotateZ(Math.PI / 2);
    return body;
  });
  const headGeometry = assets.geometry('pineforest/squirrel-head', () => new THREE.SphereGeometry(0.038, 6, 5));
  const tailGeometry = assets.geometry('pineforest/squirrel-tail', () => new THREE.SphereGeometry(0.03, 6, 5));
  const squirrel = new THREE.Group();
  squirrel.name = 'pineforest/squirrel-inner';
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
  squirrel.add(body);
  const head = new THREE.Mesh(headGeometry, bodyMaterial);
  head.position.set(0.11, 0.035, 0);
  squirrel.add(head);
  const tailBalls: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const ball = new THREE.Mesh(tailGeometry, tailMaterial);
    ball.position.set(-0.08 - i * 0.045, 0.03 + i * 0.045, 0);
    squirrel.add(ball);
    tailBalls.push(ball);
  }
  squirrel.visible = false;
  root.add(squirrel);
  const p0 = new THREE.Vector3();
  const p1 = new THREE.Vector3();
  const p2 = new THREE.Vector3();
  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();
  let t = -1;
  const handle = scheduler.add({
    meanIntervalS: 26, // docs/05 §7.1.5-2
    jitterS: 10,
    nightSilent: true, // §7.1.5-2「夜间归巢」：Director 夜间静默下倒计时冻结（scheduler.ts 预置档同口径）
    fire(): void {
      if (state.time === 'night') return; // 仅 dawn/day/dusk
      // 地面样条：营位东侧林地 2~3m 一段
      const ax = 3.0 + rng.next() * 1.2;
      const az = -1.8 + rng.next() * 1.2;
      const bx = ax - 1.0 - rng.next() * 0.8;
      const bz = az + 1.4 + rng.next() * 1.2;
      const cx = bx + 1.2 + rng.next() * 1.0;
      const cz = bz + 1.2 + rng.next() * 1.0;
      p0.set(ax, GRAVEL_TOP, az);
      p1.set(bx, GRAVEL_TOP, bz);
      p2.set(cx, GRAVEL_TOP, cz);
      t = 0;
      squirrel.visible = true;
    },
  });
  const bezier = (u: number, out: THREE.Vector3): THREE.Vector3 =>
    out
      .set(0, 0, 0)
      .addScaledVector(p0, (1 - u) * (1 - u))
      .addScaledVector(p1, 2 * (1 - u) * u)
      .addScaledVector(p2, u * u);
  return {
    update(dt: number, elapsed: number): void {
      if (t < 0) {
        root.visible = false;
        return;
      }
      t += dt;
      const dur = 2.2;
      const u = clamp(t / dur, 0, 1);
      if (u >= 1) {
        t = -1;
        squirrel.visible = false;
        root.visible = false;
        return;
      }
      root.visible = true;
      // 中段停 0.4s（u∈[0.42,0.60] 停驻嗅探）
      const paused = u > 0.42 && u < 0.6;
      const effU = u < 0.42 ? u * (0.5 / 0.42) : 0.5 + ((u - 0.6) / 0.4) * 0.5;
      const pos = bezier(clamp(effU, 0, 1), tmpA);
      squirrel.position.copy(pos);
      bezier(clamp(effU + 0.02, 0, 1), tmpB);
      squirrel.rotation.y = Math.atan2(-(tmpB.z - pos.z), tmpB.x - pos.x);
      // 8Hz 体颠 + 尾波（§7.1.5-2）
      const bounce = paused ? 0 : Math.abs(Math.sin(elapsed * Math.PI * 2 * 8)) * 0.02;
      squirrel.position.y += bounce;
      tailBalls.forEach((ball, i) => {
        ball.rotation.z = Math.sin(elapsed * 6 + i * 0.9) * 0.3;
      });
      squirrel.rotation.z = paused ? 0 : Math.sin(elapsed * Math.PI * 2 * 8) * 0.04;
    },
    dispose(): void {
      handle.cancel();
      root.removeFromParent();
    },
  };
}

/** 篝火火焰（7-2-⑥：三层 cone uv 噪声滚动+顶点摆动近似（层间横移）+scale 脉冲；强度=emberPower）。 */
function createFlameAnimation(state: PineforestState): SceneAnimation {
  return {
    update(dt: number, elapsed: number): void {
      const group = propsRef.flameGroup;
      const materials = propsRef.flameMaterials;
      if (!group || !materials) return;
      const ember = state.emberPower;
      group.visible = ember >= 0.02;
      if (!group.visible) return;
      materials.forEach((material, i) => {
        const map = material.map;
        if (map) map.offset.y -= dt * [0.55, 0.78, 1.05][i]!; // uv 噪声滚动（内层最快）
        const pulse = 1 + 0.08 * Math.sin(9 * elapsed + i * 1.9) + 0.04 * Math.sin(15.3 * elapsed + i * 0.7);
        const mesh = group.children[i] as THREE.Mesh;
        mesh.scale.set(pulse * (1 + 0.05 * Math.sin(7.1 * elapsed + i)), pulse, pulse);
        mesh.position.x = Math.sin(2.6 * elapsed + i * 1.3) * 0.012 * (i + 1); // 顶点摆动近似（层间横移）
        mesh.rotation.y = Math.sin(1.7 * elapsed + i) * 0.1;
        material.opacity = [0.5, 0.68, 0.85][i]! * clamp(ember, 0, 1);
      });
    },
    dispose(): void {
      /* 火焰网格归场景卸载统一释放 */
    },
  };
}

function createAnimations(runtime: SceneRuntime): readonly SceneAnimation[] {
  return [
    createLightSpotAnimation(runtime, sceneState),
    createLeafDriftAnimation(runtime),
    createSquirrelAnimation(runtime, sceneState),
    createFlameAnimation(sceneState),
  ];
}

/* ============================== ④ palette（2.2.3） ============================== */

const palette: ScenePalette = {
  colorChannels: CHANNELS,
  baseStyle: {
    topTheme: 'gravel', // 碎石地（§4.1.0 差异表）
    edgeMatId: 'rootSoil', // 根系土层
    rimDecal: null,
    skirtLayers: 1, // 溪谷下沉 −1.6（T19 抬升方案，立裙加层）
    silhouette: 'mountains', // 后缘山脊剪影板 ×2（h 4.5/3.0，baseAssembler 层叠两层板）
  },
  baseFog: 0.32, // 四场景最高（2.2.3 逐字）
};

/* ============================== ⑤ lightHooks（行为表逐行实现） ============================== */

/** 模块级运行态（Director 单场景装配；初值=黄昏档，首帧 applyLighting(blend=1) 对位，§4.3.5）。 */
const sceneState: PineforestState = {
  time: 'dusk',
  weather: 'clear',
  lampPower: 0,
  emberPower: 1.0,
  smokePower: 0.35,
  spotBase: SPOT_DUSK.base,
  spotBaseFrom: SPOT_DUSK.base,
  spotBaseTo: SPOT_DUSK.base,
  spotTint: new THREE.Color(SPOT_DUSK.color),
  spotTintFrom: new THREE.Color(SPOT_DUSK.color),
  spotTintTo: new THREE.Color(SPOT_DUSK.color),
  mistBoard: MIST_BOARD_ALPHA.dusk!,
  mistBoardFrom: MIST_BOARD_ALPHA.dusk!,
  mistBoardTo: MIST_BOARD_ALPHA.dusk!,
  canopyTint: new THREE.Color('#8b9cb0'),
  canopyTintFrom: new THREE.Color('#8b9cb0'),
  canopyTintTo: new THREE.Color('#8b9cb0'),
  dew: 0,
  dewTo: 0,
  fogDensity: 0.03,
  breakfastVisible: false,
  breakfastFaded: true,
  breakfastFade: 0,
  burstT: -1,
  lastKey: 'dusk',
  pendingKey: null,
};

/** Director 运行期注入的 breath 引用（createAnimations 时快照；lightHooks 的场景映射口）。 */
let runtimeBreath: LightBreathSystem | null = null;

const CANOPY_MUL_DUSK = new THREE.Color('#8b9cb0'); // 逆光剪影 0.55×冷调
const CANOPY_MUL_NIGHT = new THREE.Color('#a3b2c8'); // 月色 0.72×冷调
const CANOPY_MUL_LIT = new THREE.Color('#ffffff');

const lightHooks: SceneLightHooks = {
  applyLighting(state: SceneLightState, blend: number): void {
    sceneState.time = state.time;
    sceneState.weather = state.weather;
    sceneState.lampPower = state.lampPower;
    sceneState.emberPower = state.emberPower;
    sceneState.smokePower = state.smokePower;
    sceneState.fogDensity = state.fogDensity; // D6 合成结果（★三层同源读值点，update 消费）

    // —— 连续量：光斑档/雾板档/树冠剪影档随 blend 全程插值（§4.3.1 连续量清单）——
    const spotTarget = SPOT_TARGETS[state.time] ?? SPOT_TARGETS.dusk ?? SPOT_DUSK;
    const mistTarget = MIST_BOARD_ALPHA[state.time] ?? MIST_BOARD_ALPHA.dusk!;
    const canopyTarget = state.time === 'dusk' ? CANOPY_MUL_DUSK : state.time === 'night' ? CANOPY_MUL_NIGHT : CANOPY_MUL_LIT;
    if (sceneState.lastKey !== state.time) {
      sceneState.spotBaseFrom = sceneState.spotBase;
      sceneState.spotTintFrom.copy(sceneState.spotTint);
      sceneState.mistBoardFrom = sceneState.mistBoard;
      sceneState.canopyTintFrom.copy(sceneState.canopyTint);
      sceneState.spotBaseTo = spotTarget.base;
      sceneState.spotTintTo.set(spotTarget.color);
      sceneState.mistBoardTo = mistTarget;
      sceneState.canopyTintTo.copy(canopyTarget);
      sceneState.pendingKey = state.time;
      sceneState.lastKey = state.time;
    }
    const b = clamp(blend, 0, 1);
    const eased = b * b * (3 - 2 * b);
    sceneState.spotBase = THREE.MathUtils.lerp(sceneState.spotBaseFrom, sceneState.spotBaseTo, eased);
    sceneState.spotTint.lerpColors(sceneState.spotTintFrom, sceneState.spotTintTo, eased);
    sceneState.mistBoard = THREE.MathUtils.lerp(sceneState.mistBoardFrom, sceneState.mistBoardTo, eased);
    sceneState.canopyTint.lerpColors(sceneState.canopyTintFrom, sceneState.canopyTintTo, eased);

    // —— 离散量：早餐餐具（dawn 原木凳面出现/其余收起；blend≥0.5 切换 + 0.2s 淡变，§4.3.1/D5）——
    if (sceneState.pendingKey !== null && b >= 0.5) {
      const targetVisible = sceneState.pendingKey === 'dawn';
      if (targetVisible && !sceneState.breakfastVisible) {
        sceneState.breakfastVisible = true;
        sceneState.breakfastFaded = false;
      } else if (!targetVisible && sceneState.breakfastVisible) {
        sceneState.breakfastFaded = true;
      }
      sceneState.pendingKey = null;
    }
    sceneState.dewTo = state.time === 'dawn' ? 1 : 0; // 毛巾露水（§4.3.3-④）

    // —— 篝火灯功率场景映射（7.1.4 松林行「驱动通道 emberPower」；实现侧 setLampPower 结构化可选口）——
    const fireLamp = propsRef.fireLamp;
    const breath = runtimeBreath as BreathSceneExt | null;
    if (fireLamp && breath?.setLampPower) {
      breath.setLampPower(fireLamp, sceneState.emberPower);
    }
  },

  /** 每帧细粒度驱动（雾板横移/α、溪水流光、毛巾露水、余烬闪烁、树冠剪影、餐具淡变）。 */
  update(dt: number, elapsed: number): void {
    // —— 雾板（7-2-⑦：横移 ±0.06 u/s + α=雾档基准×fogDensity 归一；★三层同源：fogDensity 已含
    //     baseFog 0.32 × 时间雾档 × 天气 fogMul（D6 单通道））——
    const boards = propsRef.mistBoards ?? [];
    const mistMaterials = propsRef.mistMaterials ?? [];
    const mistBaseX = propsRef.mistBaseX ?? [];
    const fogNorm = clamp(sceneState.fogDensity / 0.06, 0, 1);
    boards.forEach((board, i) => {
      const drift = 0.06 * (i % 2 === 0 ? 1 : -0.7); // 横移 ±0.06 u/s（异板反向微差）
      let x = board.position.x + drift * dt;
      const base = mistBaseX[i] ?? 0;
      if (x - base > 2.6) x = base - 2.6;
      if (base - x > 2.6) x = base + 2.6;
      board.position.x = x;
      const material = mistMaterials[i];
      if (material) {
        const op = sceneState.mistBoard * fogNorm * (i === 0 ? 1 : 0.85);
        material.opacity = op;
        board.visible = op >= 0.02;
      }
    });

    // —— 溪水流光（7-2-③：uv 0.05 u/s 沿谷向 + 太阳镜面带；water 时间相位共享 uniform）——
    const layers = propsRef.glintLayers ?? [];
    layers.forEach((layer, i) => {
      const material = layer.material as THREE.MeshBasicMaterial;
      const map = material.map;
      if (map) {
        map.offset.y += (i === 0 ? 0.05 : -0.03) * dt; // 局部 v=谷向（平面深度轴）
        map.offset.x += (i === 0 ? 0.004 : -0.006) * dt;
      }
      material.opacity = (i === 0 ? 0.18 : 0.13) * (0.85 + 0.15 * Math.sin(0.6 * elapsed + i * 2.1));
    });
    sharedUniforms.uWaterTime.value += dt;

    // —— 余烬（docs/05 §4.3.3-②：emissive × emberPower 噪声闪烁）——
    const coalMat = propsRef.coalMaterial;
    if (coalMat) {
      const flicker = 0.72 + 0.18 * Math.sin(7.3 * elapsed) + 0.1 * Math.sin(3.1 * elapsed + 1.7);
      coalMat.emissiveIntensity = 1.7 * sceneState.emberPower * flicker;
      coalMat.visible = coalMat.emissiveIntensity >= 0.02;
    }

    // —— 树冠逆光剪影（黄昏 canopyDark×0.55+rim；rim 为 foliage 原型自带，乘色只调暗部）——
    const canopyMaterials = propsRef.canopyMaterials ?? [];
    const canopyBaseColors = propsRef.canopyBaseColors ?? [];
    canopyMaterials.forEach((material, i) => {
      const base = canopyBaseColors[i] ?? CANOPY_MUL_LIT;
      material.color.copy(base).multiply(sceneState.canopyTint);
    });
    const fernMat = propsRef.fernMaterial;
    if (fernMat) {
      fernMat.color.copy(propsRef.fernBaseColor ?? new THREE.Color(CHANNELS.forestGreen)).multiply(sceneState.canopyTint);
    }

    // —— 毛巾露水（dawn=1 → 白天晒干淡出，§4.3.3-④；uDew 材质层属 T13/T43，本场景以微青 emissive 近似）
    //     ★ 材质逐帧自 mesh.material 现取：WindSystem.register 会以 wind 克隆材质替换 mesh.material
    //     （wind.ts:407-421），写死构建期原材质会在注册后落空——克隆同为 MeshToonMaterial，可直写——
    const k = 1 - Math.exp(-dt / 0.6);
    sceneState.dew += (sceneState.dewTo - sceneState.dew) * k;
    const towelMeshes = propsRef.towelMeshes ?? [];
    towelMeshes.forEach((mesh, i) => {
      const material = mesh.material as THREE.MeshToonMaterial;
      if (!material || !material.emissive) return;
      const twinkle = 0.7 + 0.3 * Math.sin(1.1 * elapsed + i * 2.3);
      material.emissive.set('#7fd8cc'); // 微青（2.2.2-⑨）
      material.emissiveIntensity = 0.5 * sceneState.dew * twinkle;
    });

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

/** fogDensity 旁路已并入 sceneState.fogDensity（applyLighting 从 SceneLightState.fogDensity 转写）。 */

/* ============================== SceneModule（§3.3.2 五部分） ============================== */

/** 山间松林营地（id/label = 'pineforest'/'山间松林'，§4.1.2 模块卡）。 */
export const pineforestScene: SceneModule = {
  id: 'pineforest',
  label: '山间松林',
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

function makeSnowShellMaterial(name: string): THREE.Material {
  return toonMaterials.get('matteProp', { color: '#edf2f9', snow: 'off', opacity: 0.999, name });
}
