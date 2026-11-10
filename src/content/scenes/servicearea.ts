// docs/01-整体架构.md §3.2 content/scenes/servicearea.ts —— 2.4 高速路服务区（12 组元素 + 5 动效，
// shopPower 通道 + 车流）。T21 落点。
// docs/02-场景模块.md §4.1.4（模块卡/地形 2.4.1/道具 2.4.2 十二组/palette 2.4.3 十通道/光照钩子行为表/
//   注册与预算）+ §4.1.0 campAnchor 服务区行 + §4.0 四域共通（句柄接入/无人物红线）；
// docs/05-时间天气动效.md §7.2.4 服务区 5 动效逐项落点 + §7.1.4 shopPower 灯点注册总表（mul 0.8/0.3、
//   floor 0.7）+ §4.3.2 通道定值（D8：dawn 0.35/day 1.0/dusk 0.65/night 1.0，场景只解释）+
//   §7.2.4-① 车流 B3 表（dawn 0.35/day 0.55/dusk 0.8/night 1.0；rain×0.85/fog×0.9/snow×0.8；
//   可见度 dawn 0.45/day 0.3/dusk 0.8/night 1.0；雪 α×0.7）+ §4.4.2 lineFade 特例（划线若隐若现）；
// docs/04-三渲二渲染.md §5.5（服务区=ramp2 为主+灯箱/售货机 emissive（shopPower）+车流光条+湿地反光
//   贴花+uLineFade 划线层——渲染层零场景分支）。
//
// ★ 地形实现注记（T21 实现期裁定，如实登记）：2.4.1「公路主线前缘下沉带 y=−0.12」依赖底座顶板开孔
//   （T07 BaseAssembler 顶板为整版实心 Box 20×20，y<0 面不可见——T18 海崖同源问题）。本实现采用
//   「路缘石高差」等观感方案：车位划线面=底座台面 y=0（campAnchor.groundY=0 逐字），公路面=台面
//   +0.005 薄板，二者以 0.15 高路缘石带+波形梁护栏过渡，车位面到公路面保持 ≈0.14u 视觉落差。
//   campAnchor x/z/heading/radius 逐字取 §4.1.0 服务区行。正式修法（顶板开孔/下沉层声明）属
//   BaseAssembler 契约扩展，随 T18 注记一并在 T22/T43 评审（见 T21 返回 openIssues）。
//
// 依赖纪律（§3.3.6）：只 import core 契约（types/handles）+ shared + geom 部件库（根部复用件 + 本场景
//   servicearea/ 子目录新件）+ render 工厂 + systems/wind 的 injectVegetationWind（P2 注入器）。
//   零 import 车型/时间/天气注册表；布料/粒子/灯点只交句柄与参数（docs/01 §3.4 归属裁定）。
// shopPower 通道（D8）：TimeLightSystem 经 Director 下发 breath.setChannelPower('shop',…)（director.ts
//   §3.5.2-②），本场景 5 灯在 createAnimations 期 bindChannel('shop', mul) 绑定（7.1.4 总表逐灯 mul）；
//   契约实现缺 bindChannel 时降级为 applyLighting 内 setLampPower 逐档覆盖（结构化可选口，同 T18 口径）。
// 无人物红线（一.6）：全场景无人形几何——餐饮窗内仅桌椅剪影（alpha 贴图）、售货机货道为商品盒几何、
//   残骸/人物均无；送货小车为无人推车。
// T31（2026-11-09）：补 J4 四场景就餐面「服务区长椅」档早餐餐具（盘×2+杯×2+壶，dawn 离散+0.2s 淡变，
//   §4.3.3-③；与送货小车共用 lastDiscreteKey 单键门控）——四场景就餐面至此齐备（海崖桌/松林凳面/
//   避难所板条箱面/服务区长椅）。
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
import { toonMaterials } from '@/render/toonMaterial';
import { mergeGeometries, hardenEdges, lathe } from '@/geom/primitives';
import { InstancedGroup } from '@/geom/instanced';
import { injectVegetationWind } from '@/systems/wind';
import { SCHEDULED_EVENT_PRESETS } from '@/systems/scheduler';
import { createBench } from '@/geom/parts/benchSlat';
import { createMicroCloth } from '@/geom/parts/clothMicro';
import { createGasStation } from '@/geom/parts/servicearea/gasStation';
import { createStoreBuilding } from '@/geom/parts/servicearea/storeBuilding';
import { createVendingMachine } from '@/geom/parts/servicearea/vendingMachine';
import { createChargingPilePair } from '@/geom/parts/servicearea/chargingPile';
import { createShadeCorridor } from '@/geom/parts/servicearea/shadeCorridor';
import { createTreeRoundGeometry } from '@/geom/parts/servicearea/treeRound';
import { createGuardrail } from '@/geom/parts/servicearea/guardrail';
import { createHighwaySigns } from '@/geom/parts/servicearea/highwaySigns';
import { createTrashBin } from '@/geom/parts/servicearea/trashBin';
import { createWashBasin } from '@/geom/parts/servicearea/washBasin';
import { createFlagPole } from '@/geom/parts/servicearea/flagPole';
import { createDeliveryCart } from '@/geom/parts/servicearea/deliveryCart';
import { createFbm2D, hashStringToSeed } from '@/tex/canvasTex';
import { hashString, mulberry32 } from '@/shared/rng';
import { clamp } from '@/shared/math';
import { layoutGrid } from '@/core/layout';
import {
  BENCH_POS_E,
  BENCH_POS_W,
  BIN_POS_E,
  BIN_POS_W,
  BREAKFAST_POS,
  CHARGING_POS,
  DELIVERY_CART_POS,
  FLAG_POLE_POS,
  SERVICEAREA_CAMP_POS,
  SERVICEAREA_ITEMS,
  SERVICEAREA_SCENE_ID,
  VENDING_POS_A,
  VENDING_POS_B,
  WASH_BASIN_POS,
} from '@/content/layout/scenes/servicearea';

/* ============================== 场景定值（docs/02 §4.1.4 / docs/05 §7.2.4） ============================== */

/** 划线/公路带 y 定值（T21 裁定见文件头注记：LOT=台面 0，ROAD=台面+0.005，路缘石顶 +0.15）。 */
const LOT_Y = 0;
const ROAD_Y = 0.005;
/** 公路带 z 范围（前缘 +z 侧；双向 2 车道：近道 z 8.25 行 +x，远道 z 9.4 行 −x）。 */
const ROAD_Z0 = 7.7;
const ROAD_Z1 = 9.9;
const LANE_NEAR_Z = 8.25;
const LANE_FAR_Z = 9.4;
/** 波形梁护栏线位（路缘石带上）。 */
const GUARDRAIL_Z = 7.52;

/** 色彩通道（2.4.3 十通道，docs/02 定值逐字）。 */
const CHANNELS = {
  asphaltLot: '#565c62',
  laneWhite: '#e8e8e0',
  storeWarm: '#ffd9a0',
  signGreen: '#1f6e46',
  vendingCyan: '#6ad0e8',
  canopyBlue: '#4a7fb5',
  treeGreen: '#4f8a4f',
  curbGray: '#8a8f94',
  headlightWarm: '#fff2d0',
  taillightRed: '#ff6a5a',
} satisfies Record<string, RGB>;

/** 车流密度 B3 表（docs/05 §7.2.4-①：Poisson 间隔 lerp(3.2s,0.55s,density)）。 */
const TRAFFIC_DENSITY: Record<string, number> = { dawn: 0.35, day: 0.55, dusk: 0.8, night: 1.0 };
/** 车流天气修正（rain×0.85/fog×0.9/snow×0.8）。 */
const TRAFFIC_WEATHER_MUL: Record<string, number> = { clear: 1, cloudy: 1, rain: 0.85, fog: 0.9, snow: 0.8 };
/** 光流可见度（dawn 0.45/day 0.3/dusk 0.8/night 1.0）。 */
const TRAFFIC_VISIBILITY: Record<string, number> = { dawn: 0.45, day: 0.3, dusk: 0.8, night: 1.0 };
/** 夜间前灯拉长（2.4.3「车流密度 1.0 且前灯拉长 1.3×」）。 */
const TRAFFIC_NIGHT_STRETCH = 1.3;
/** 车速（docs/05 §7.2.4-① 定值 2.8m/s）。 */
const TRAFFIC_SPEED = 2.8;
/** 车流光晕增益（§4.4.1 glowBoost 定值同源近似——SceneLightState 不携带 glowBoost，场景按天气 id 取值，T33 接管后可删）。 */
const WEATHER_GLOW: Record<string, number> = { clear: 0, cloudy: 0.15, rain: 0.35, fog: 0.8, snow: 0.25 };

/** shopPower 灯点 mul 表（docs/05 §7.1.4 服务区行逐灯：棚灯 0.8/灯箱 1/灯带 1(floor 0.7)/充电桩 1/路牌 0.3）。 */
const SHOP_MUL = { canopy: 0.8, sign: 1.0, vending: 1.0, charging: 1.0, roadSign: 0.3 } as const;

/** 场景内部共享运行态（lightHooks/update/SceneAnimation 三方读写——同一模块闭包，无跨模块泄漏）。 */
interface ServiceareaState {
  time: string;
  weather: string;
  shopPower: number;
  smokePower: number;
  /** 招牌双闪窗口剩余 s（EventScheduler signDoubleFlash 触发；update 内走双峰包络） */
  flashRemaining: number;
  /** 车流参数（applyLighting 逐档插值目标；update 逐帧消费） */
  density: number;
  densityFrom: number;
  densityTo: number;
  visibility: number;
  visibilityFrom: number;
  visibilityTo: number;
  headlightStretch: number;
  headlightStretchFrom: number;
  headlightStretchTo: number;
  /** 送货小车离散量（dawn 出现/白天收走；blend≥0.5 切换+0.2s opacity 淡变，D5） */
  cartVisible: boolean;
  cartFaded: boolean;
  cartFade: number;
  /** 早餐餐具离散量（J4 服务区长椅档，dawn 出现/其余收走；同 D5 口径，§4.3.3-③） */
  tablewareVisible: boolean;
  tablewareFaded: boolean;
  tablewareFade: number;
  lastKey: string | null;
  pendingKey: string | null;
}

/** LightBreathSystem 实现侧场景映射口（结构化可选访问：契约未含时优雅降级——不 import 实现文件，§3.4）。 */
type BreathSceneExt = LightBreathSystem & {
  getLampOutput?: (lamp: LampHandle) => number;
  setLampPower?: (lamp: LampHandle, power: number) => void;
  clearLampPower?: (lamp: LampHandle) => void;
  bindChannel?: (lamp: LampHandle, channel: 'lamp' | 'ember' | 'shop' | 'interior', mul?: number) => void;
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
  if (!ctx) throw new Error(`[servicearea] 无法获取 2d 上下文 ${key}`);
  try {
    draw(ctx, canvas.width, canvas.height);
  } catch (err) {
    console.warn(`[servicearea] 贴图绘制失败，降级留白 ${key}`, err);
    ctx.fillStyle = transparent ? 'rgba(0,0,0,0)' : '#dddddd';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.name = key;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.wrapS = transparent ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  texture.wrapT = transparent ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

/** 沥青骨料噪点（公路带面；中值原则——明暗不烘进贴图）。 */
function drawAsphalt(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const fbm = createFbm2D(hashStringToSeed('servicearea/road'), 4);
  const image = ctx.createImageData(w, h);
  const data = image.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = clamp(0.92 + (fbm((x / w) * 40, (y / h) * 40) - 0.5) * 0.08, 0, 1);
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

/**
 * 停车场划线整版 decal（2.4.1：白色实线框——大车位 9×5.5 居中 + 4 小车位 + 导向箭头，线宽 0.07u）。
 * 贴图覆盖 x∈[−10,10]、z∈[−5.8,7.5]（decal plane 20×13.3 @ z=0.85）；透明底白线。
 */
function drawLotLines(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const X0 = -10;
  const X1 = 10;
  const Z0 = -5.8;
  const Z1 = 7.5;
  const toU = (x: number): number => ((x - X0) / (X1 - X0)) * w;
  const toV = (z: number): number => ((z - Z0) / (Z1 - Z0)) * h;
  const lw = Math.max(2, Math.round((0.07 / (X1 - X0)) * w)); // 线宽 0.07u
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = '#e8e8e0'; // laneWhite
  ctx.fillStyle = '#e8e8e0';
  ctx.lineWidth = lw;
  const rect = (x0: number, z0: number, x1: number, z1: number): void => {
    ctx.strokeRect(toU(x0), toV(z0), toU(x1) - toU(x0), toV(z1) - toV(z0));
  };
  // 大车位 9×5.5 居中（campAnchor (0,3.4)：x −4.5..4.5 / z 0.65..6.15）
  rect(-4.5, 0.65, 4.5, 6.15);
  // 4 小车位（5.5 深 × 2.5 宽；左右各二）
  rect(-9.6, 0.65, -7.1, 6.15);
  rect(-7.0, 0.65, -4.55, 6.15);
  rect(4.55, 0.65, 7.05, 6.15);
  rect(7.15, 0.65, 9.6, 6.15);
  // 行车道导向箭头 ×3（单向 aisle：z −2.9..0.5，箭头指 +x）
  const arrow = (ax: number, az: number): void => {
    const y = toV(az);
    const xTip = toU(ax + 0.55);
    const xTail = toU(ax - 0.55);
    ctx.lineWidth = lw * 0.9;
    ctx.beginPath();
    ctx.moveTo(xTail, y);
    ctx.lineTo(xTip, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(xTip, y);
    ctx.lineTo(xTip - lw * 3.2, y - lw * 2.2);
    ctx.lineTo(xTip - lw * 3.2, y + lw * 2.2);
    ctx.closePath();
    ctx.fill();
  };
  arrow(-6.5, -1.2);
  arrow(-0.5, -1.2);
  arrow(6.5, -1.2);
}

/** 公路中央黄虚线（烘焙进公路带贴图——2.4.1「双向 2 车道黄虚线」；划线 lineFade 特例只限车位划线）。 */
function drawRoadDashes(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.clearRect(0, 0, w, h);
  const dashY = h * 0.5;
  const dashW = w / 12;
  ctx.fillStyle = '#e0b83a';
  for (let i = 0; i < 12; i += 2) {
    ctx.fillRect(i * dashW + dashW * 0.15, dashY - h * 0.045, dashW * 0.7, h * 0.09);
  }
  ctx.fillStyle = 'rgba(232,232,224,0.85)';
  ctx.fillRect(0, h * 0.06, w, Math.max(2, h * 0.03));
  ctx.fillRect(0, h * 0.91, w, Math.max(2, h * 0.03));
}

/** 小旗橙白双色条（⑫ clothMicro map；语义图形可烘色）。 */
function drawFlagStripes(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.clearRect(0, 0, w, h);
  const bands = ['#e8863a', '#f2efe8', '#e8863a', '#f2efe8'];
  bands.forEach((color, i) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, (i * h) / bands.length, w, h / bands.length + 1);
  });
}

/* ============================== ① buildTerrain（2.4.1） ============================== */

/** buildTerrain 产物登记（buildProps/天气面注册取用点）。 */
interface TerrainRefs {
  guardrailLength: number;
  /** 护栏顶雪壳（roofTop surface 配对注册用） */
  railSnow: THREE.Mesh | null;
  /** 划线 decal 材质（linePaint surface 注册用） */
  lotLinesMaterial: THREE.Material | null;
  /** 公路路面材质（ground surface 注册用） */
  roadMaterial: THREE.Material | null;
}

const terrainRefs: TerrainRefs = { guardrailLength: 0, railSnow: null, lotLinesMaterial: null, roadMaterial: null };

function buildTerrain(ctx: SceneBuildContext): SceneTerrain {
  const { assets } = ctx;
  const group = new THREE.Group();
  group.name = 'servicearea/terrain';

  // —— 公路主线前缘带（薄板 asphalt；中央黄虚线烘焙；ground 作用面——雨夜湿反光）——
  const roadTexture = assets.texture('servicearea/tex/road', () =>
    paintCanvasTexture('servicearea/tex/road', 512, 128, (c, w, h) => {
      drawAsphalt(c, w, h);
      // 虚线画在噪点之上（Composite 正常叠加）
      const overlay = c;
      overlay.globalAlpha = 1;
      drawRoadDashes(overlay, w, h);
    }),
  );
  // 公路带贴图：Box 顶面 UV 0..1 一次覆盖全带（repeat 保持 1）——虚线/边线画满整张
  roadTexture.repeat.set(1, 1);
  const roadMaterial = toonMaterials.get('groundTerrain', {
    color: CHANNELS.asphaltLot,
    map: roadTexture,
    wetReactive: true,
    name: 'servicearea/road',
  });
  terrainRefs.roadMaterial = roadMaterial;
  const road = new THREE.Mesh(
    assets.geometry('servicearea/road', () => new THREE.BoxGeometry(20, 0.05, ROAD_Z1 - ROAD_Z0).translate(0, ROAD_Y - 0.025, (ROAD_Z0 + ROAD_Z1) / 2)),
    roadMaterial,
  );
  road.name = 'servicearea/road';
  road.receiveShadow = true;
  group.add(road);

  // —— 车位划线整版 decal（linePaint 作用面——降雪 lineFade 特例「若隐若现」）——
  const lotLinesTexture = assets.texture('servicearea/tex/lotlines', () =>
    paintCanvasTexture('servicearea/tex/lotlines', 1024, 682, drawLotLines, true),
  );
  const lotLinesMaterial = toonMaterials.get('matteProp', {
    color: '#ffffff',
    map: lotLinesTexture,
    opacity: 0.999, // 借 opacity<1 开 transparent；alpha 载线形，uLineFade 乘 alpha（五-5 特例）
    lineFadeReactive: true,
    name: 'servicearea/lot-lines',
  });
  terrainRefs.lotLinesMaterial = lotLinesMaterial;
  const lotLines = new THREE.Mesh(
    assets.geometry('servicearea/lot-lines', () => new THREE.PlaneGeometry(20, 13.3).rotateX(-Math.PI / 2).translate(0, LOT_Y + 0.008, 0.85)),
    lotLinesMaterial,
  );
  lotLines.name = 'servicearea/lot-lines';
  lotLines.renderOrder = 2;
  lotLines.userData.noOutline = true;
  group.add(lotLines);

  // —— 路缘石带（车位面→公路面 0.15 高差过渡；T21 裁定见文件头注记）——
  const curbMaterial = toonMaterials.get('concrete', { color: CHANNELS.curbGray, name: 'servicearea/curb' });
  const curb = new THREE.Mesh(
    assets.geometry('servicearea/curb', () => new THREE.BoxGeometry(20, 0.15, 0.28).translate(0, 0.075, (GUARDRAIL_Z + ROAD_Z0) / 2 - 0.14)),
    curbMaterial,
  );
  curb.name = 'servicearea/curb';
  curb.castShadow = true;
  curb.receiveShadow = true;
  group.add(curb);

  // —— 公共步道（店前 concrete 走道，湿面反应）——
  const walkMaterial = toonMaterials.get('groundTerrain', { color: '#9aa0a2', name: 'servicearea/walkway' });
  const walkway = new THREE.Mesh(
    assets.geometry('servicearea/walkway', () => new THREE.BoxGeometry(11, 0.045, 1.6).translate(0, 0.022, -5.9)),
    walkMaterial,
  );
  walkway.name = 'servicearea/walkway';
  walkway.receiveShadow = true;
  group.add(walkway);

  // —— 绿化带（前沿矮绿带 ×2 段，中间为行人开口）——
  const greenMaterial = toonMaterials.get('groundTerrain', { color: '#6a9a5a', name: 'servicearea/green-strip' });
  for (const [x0, x1] of [
    [-10, -1.0],
    [1.0, 10],
  ] as const) {
    const strip = new THREE.Mesh(
      assets.geometry(`servicearea/green-strip-${x0}`, () =>
        new THREE.BoxGeometry(x1 - x0, 0.1, 0.8).translate((x0 + x1) / 2, 0.05, 6.82),
      ),
      greenMaterial,
    );
    strip.name = `servicearea/green-strip-${x0}`;
    strip.receiveShadow = true;
    group.add(strip);
  }

  // —— 护栏（⑧ 地形件：波形梁 ×10+立柱 ×11，沿公路边线；顶面 roofTop 雪壳）——
  const guardrail = createGuardrail({ assets, id: 'guardrail/servicearea' });
  guardrail.group.name = 'servicearea/guardrail';
  guardrail.group.position.set(-guardrail.totalLength / 2, 0.15, GUARDRAIL_Z); // 立于路缘石带上
  group.add(guardrail.group);
  terrainRefs.guardrailLength = guardrail.totalLength;
  const railSnowMaterial = toonMaterials.get('matteProp', { color: '#edf2f9', snow: 'off', opacity: 0.999, name: 'servicearea/rail-snow' });
  const railSnow = new THREE.Mesh(
    assets.geometry('servicearea/rail-snow', () =>
      new THREE.BoxGeometry(guardrail.totalLength, 0.05, 0.2).translate(0, 0.83, 0),
    ),
    railSnowMaterial,
  );
  railSnow.name = 'servicearea/rail-snow';
  railSnow.position.set(0, 0.15, GUARDRAIL_Z);
  railSnow.userData.noOutline = true;
  railSnow.visible = false;
  group.add(railSnow);
  terrainRefs.railSnow = railSnow; // roofTop surface 配对注册（buildProps surfaces）

  // —— 灌木球 ×7（绿化带内；foliage 材质 snow:'up' 树冠积雪遮罩）——
  const shrubGeometry = assets.geometry('servicearea/shrub', () => {
    const ball = new THREE.IcosahedronGeometry(0.26, 1);
    ball.scale(1, 0.78, 1);
    ball.translate(0, 0.2, 0);
    return ball;
  });
  const shrubMaterial = toonMaterials.get('foliage', { color: '#3f7a44', name: 'servicearea/shrubs' });
  const shrubs = new InstancedGroup(shrubGeometry, shrubMaterial, { capacity: 7, name: 'servicearea/shrubs' });
  const shrubRng = ctx.rng.fork('shrubs');
  const matrix = new THREE.Matrix4();
  const shrubSpots: readonly [number, number][] = [
    [-7.0, 6.7], [-2.6, 6.75], [2.8, 6.8], [7.2, 6.7], [-4.2, -6.02], [4.3, -6.02], [-9.1, -5.85],
  ];
  for (const [sx, sz] of shrubSpots) {
    matrix.identity().setPosition(sx, 0.02, sz);
    matrix.multiply(new THREE.Matrix4().makeScale(0.8 + shrubRng.next() * 0.5, 0.8 + shrubRng.next() * 0.4, 0.8 + shrubRng.next() * 0.5));
    shrubs.add(matrix, '#3f7a44');
  }
  group.add(shrubs.group);

  return {
    group,
    campAnchor: {
      // §4.1.0 服务区行 (0,0,3.4)/heading 0（顺大车位长轴）/groundY 0/radius 4.2——逐字。
      position: new THREE.Vector3(0, LOT_Y, 3.4),
      headingRad: 0,
      groundY: LOT_Y,
      radius: 4.2,
    },
  };
}

/* ============================== ② buildProps（2.4.2 十二组 + 送货小车） ============================== */

/** buildProps 产物登记（lightHooks.update / createAnimations 的取用点）。 */
interface PropRefs {
  signLamp: LampHandle;
  canopyLamp: LampHandle;
  vendingLamp: LampHandle;
  chargingLamp: LampHandle;
  roadSignLamp: LampHandle;
  /** 同步驱动副件（每帧从主灯材质拷贝输出——2 台售货机/双面板棚灯共用 1 句柄的另一半） */
  vendingStripB: THREE.MeshToonMaterial | null;
  poleFaceMaterial: THREE.MeshToonMaterial | null;
  windowGlowMaterial: THREE.MeshToonMaterial | null;
  /** 手动 halo（成对补光层——op=0.35×out×(1+0.5×glow)，§4.3.3-⑧ 同式） */
  canopyHalos: THREE.Sprite[];
  vendingHalos: THREE.Sprite[];
  deliveryCart: THREE.Group | null;
  cartFadeMaterials: readonly THREE.MeshToonMaterial[];
  tablewareSet: THREE.Group;
  tablewareFadeMats: THREE.MeshToonMaterial[];
  canopyRoofTopY: number;
}

const propsRef: Partial<PropRefs> = {};

/** halo 径向渐变贴图（服务区灯点共用一张）。 */
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
    opacity: 0.35, // §4.3.3-⑧ 基值：op=0.35×灯功率×(1+0.5×glowBoost)——LightBreath/场景 update 驱动
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

/* ============================== 早餐餐具（J4 长椅档；Lathe 盘/杯/壶，docs/05 §4.3.3-③） ============================== */

/**
 * 服务区长椅档早餐餐具：盘 ×2+杯 ×2+壶（J4 全套四件式；海崖主展示同套型）。
 * 三场景既有实现各自内联（R-P3-1⑥：tableware.ts 因文件白名单未拆、内联于场景文件）——
 * 本件按同一模式落 servicearea 档；材质以独立 name 取用（工厂缓存键含 name），
 * 淡入淡出改 opacity 不影响共享材质。
 */
function buildBreakfastSet(assets: SceneBuildContext['assets']): THREE.Group {
  const group = new THREE.Group();
  group.name = 'servicearea/breakfast-inner';
  const uniqueMat = (color: string, name: string): THREE.MeshToonMaterial =>
    toonMaterials.getToon('matteProp', { color, opacity: 0.999, name }); // opacity<1 → transparent 开（0.2s 淡变）
  const plateMat = uniqueMat('#f5f2ea', 'servicearea/breakfast-plate');
  const cupMat = uniqueMat('#6a8aa8', 'servicearea/breakfast-cup');
  const potMat = uniqueMat('#e8e2d4', 'servicearea/breakfast-pot');

  const plateGeometry = assets.geometry('servicearea/breakfast-plate', () =>
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
    [-0.26, 0.09],
    [0.08, 0.14],
  ] as const) {
    const plate = new THREE.Mesh(plateGeometry, plateMat);
    plate.name = 'servicearea/breakfast-plate';
    plate.position.set(px, 0, pz);
    group.add(plate);
  }
  const cupGeometry = assets.geometry('servicearea/breakfast-cup', () =>
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
  for (const [cx, cz] of [
    [0.0, -0.12],
    [0.3, 0.02],
  ] as const) {
    const cup = new THREE.Mesh(cupGeometry, cupMat);
    cup.name = 'servicearea/breakfast-cup';
    cup.position.set(cx, 0.01, cz);
    group.add(cup);
  }
  const potGeometry = assets.geometry('servicearea/breakfast-pot', () =>
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
  );
  const pot = new THREE.Mesh(potGeometry, potMat);
  pot.name = 'servicearea/breakfast-pot';
  pot.position.set(0.24, 0, -0.1);
  group.add(pot);
  return group;
}

/** 淡入淡出材质收集（0.2s opacity 渐变取用点；同 wasteland.ts 同名函数口径）。 */
function collectMeshMaterials(root: THREE.Object3D): THREE.MeshToonMaterial[] {
  const found: THREE.MeshToonMaterial[] = [];
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh && mesh.material instanceof THREE.MeshToonMaterial) found.push(mesh.material);
  });
  return found;
}

function buildProps(ctx: SceneBuildContext): SceneProps {
  const { assets } = ctx;
  const group = new THREE.Group();
  group.name = 'servicearea/props';
  const rng = ctx.rng.fork('props');
  const cloths: ClothHandle[] = [];
  const lamps: LampHandle[] = [];
  const emitters: EmitterSpec[] = [];
  const surfaces: WeatherSurface[] = [];

  /* — ① 加油站：雨棚（立柱+悬挑顶板+棚下灯板 ×2）+ 加油机 ×2（顶灯箱/屏/软管）— */
  const gasStation = createGasStation({
    assets,
    id: 'gasStation/servicearea',
    lightEmissive: CHANNELS.storeWarm,
  });
  gasStation.group.name = 'servicearea/gas-station';
  gasStation.group.position.set(-6.3, LOT_Y, -1.5);
  group.add(gasStation.group);
  // 雨棚顶雪壳（roofTop；顶板上表面薄壳）
  const canopySnow = new THREE.Mesh(
    assets.geometry('servicearea/canopy-snow', () => new THREE.BoxGeometry(5.1, 0.05, 3.8).translate(0, 0.1, 0)),
    makeSnowShellMaterial('servicearea/canopy-snow'),
  );
  canopySnow.name = 'servicearea/canopy-snow';
  canopySnow.position.y = 2.55 + 0.22; // 顶板顶面（roofH 2.55 + 板 0.18 + 富余）
  canopySnow.userData.noOutline = true;
  canopySnow.visible = false;
  gasStation.roofMesh.add(canopySnow);
  const canopyLamp: LampHandle = {
    emissiveMat: gasStation.lightPanelMaterial,
    halo: (() => {
      const halo = makeHaloSprite(assets, 'servicearea/canopy-halo-a', 1.5, CHANNELS.storeWarm);
      halo.position.set(-0.9, 2.41, -1.1);
      gasStation.group.add(halo);
      return halo;
    })(),
    mode: 'steady', // 7.1.4：棚灯 steady，功率 shopPower×0.8（bindChannel mul）
    params: {},
    castReflection: true, // M4：近地强灯雨天反光条
  };
  lamps.push(canopyLamp);
  // 棚灯 B 位 halo（场景 update 按 getLampOutput 同步——成对补光层）
  const canopyHaloB = makeHaloSprite(assets, 'servicearea/canopy-halo-b', 1.5, CHANNELS.storeWarm);
  canopyHaloB.position.set(0.9, 2.41, 1.1);
  gasStation.group.add(canopyHaloB);

  /* — ② 便利店 + 发光招牌（店体 7.6×2.4×3.0 分商店段/食堂段；招牌 breath 6s depth 0.12）— */
  const store = createStoreBuilding({
    assets,
    id: 'store/servicearea',
    signLines: ['STATION HAYABUSA', '道の駅 はやぶさ'],
  });
  store.group.name = 'servicearea/store';
  store.group.position.set(0, LOT_Y, -7.6);
  group.add(store.group);
  const signLamp: LampHandle = {
    emissiveMat: store.signMaterial,
    halo: (() => {
      const halo = makeHaloSprite(assets, 'servicearea/sign-halo', 1.7, CHANNELS.storeWarm);
      halo.position.set(-1.9, 2.62, -6.32);
      store.group.add(halo);
      return halo;
    })(),
    mode: 'breath', // 7-4-②：循环微闪 breath 6s depth 0.12；偶发双闪走 EventScheduler（signDoubleFlash）
    params: { period: 6, depth: 0.12 },
  };
  lamps.push(signLamp);
  // 店顶雪壳（roofTop）
  const storeSnow = new THREE.Mesh(
    assets.geometry('servicearea/store-snow', () => new THREE.BoxGeometry(7.8, 0.05, 2.55).translate(0, 0.12, 0)),
    makeSnowShellMaterial('servicearea/store-snow'),
  );
  storeSnow.name = 'servicearea/store-snow';
  storeSnow.position.y = 3.0 + 0.16;
  storeSnow.userData.noOutline = true;
  storeSnow.visible = false;
  store.roofMesh.add(storeSnow);

  /* — ③ 自动售货机 ×2（货道=3×4=12 商品盒真实小几何 J3；灯带 steady max(shopPower,0.7)）— */
  const vendingMachines = new THREE.Group();
  vendingMachines.name = 'servicearea/vending-machines'; // named 容器（2.4.2 注册表口径）
  group.add(vendingMachines);
  const vendingA = createVendingMachine({ assets, id: 'vending/servicearea-a', seed: hashStringToSeed('servicearea/vending-a') });
  vendingA.group.name = 'servicearea/vending-a';
  vendingA.group.position.set(VENDING_POS_A.x, LOT_Y, VENDING_POS_A.z);
  vendingA.group.rotation.y = 0.14;
  vendingMachines.add(vendingA.group);
  const vendingB = createVendingMachine({ assets, id: 'vending/servicearea-b', seed: hashStringToSeed('servicearea/vending-b') });
  vendingB.group.name = 'servicearea/vending-b';
  vendingB.group.position.set(VENDING_POS_B.x, LOT_Y, VENDING_POS_B.z);
  vendingB.group.rotation.y = -0.14;
  vendingMachines.add(vendingB.group);
  const vendingLamp: LampHandle = {
    emissiveMat: vendingA.stripMaterial,
    halo: (() => {
      const halo = makeHaloSprite(assets, 'servicearea/vending-halo-a', 0.8, CHANNELS.vendingCyan);
      halo.position.set(VENDING_POS_A.x, 1.22, VENDING_POS_A.z + 0.1);
      group.add(halo);
      return halo;
    })(),
    mode: 'steady', // 7-4-③：steady + floor 0.7（B5——灯带常亮，白天也不灭）
    params: { floor: 0.7 },
    castReflection: true,
  };
  lamps.push(vendingLamp);
  // B 机灯带/halo：每帧从 A 机输出同步（2 台共用 1 句柄——7.1.4 表「售货机灯带」单行）
  const vendingHaloB = makeHaloSprite(assets, 'servicearea/vending-halo-b', 0.8, CHANNELS.vendingCyan);
  vendingHaloB.position.set(VENDING_POS_B.x, 1.22, VENDING_POS_B.z + 0.1);
  group.add(vendingHaloB);

  /* — ④ 电动车充电桩 ×2（屏幕+指示灯 blink 2.4s 绿；右列小车位桩位）— */
  const charging = createChargingPilePair(
    { assets, id: 'charging/servicearea' },
    CHARGING_POS.map((p) => ({ position: [p.x, LOT_Y, p.z] as [number, number, number], rotY: 0 })),
  );
  charging.group.name = 'servicearea/charging';
  group.add(charging.group);
  const chargingLamp: LampHandle = {
    emissiveMat: charging.indicatorMaterial,
    mode: 'blink', // 2.4-④：指示灯 blink 2.4s 绿（功率通道 shopPower）
    params: { period: 2.4, duty: 0.5 },
  };
  lamps.push(chargingLamp);

  /* — ⑥ 遮阳连廊+公共步道（柱 ×6+微拱顶板+盲道凸条）— */
  const corridor = createShadeCorridor({ assets, id: 'corridor/servicearea', width: 3.4, length: 2.9 });
  corridor.group.name = 'servicearea/corridor';
  corridor.group.position.set(0, LOT_Y, -4.85);
  group.add(corridor.group);

  /* — ⑦ 行道树 ×5（treeRound 冠 2–3 球叠；P2 植被通道摆幅 ×0.8——7-4-⑤）— */
  const treeTrunkMaterial = toonMaterials.get('wood', { color: '#7a5c3e', name: 'servicearea/tree-trunk' });
  const treeCrownMaterial = toonMaterials.get('foliage', { color: CHANNELS.treeGreen, name: 'servicearea/tree-crown' });
  injectVegetationWind(treeCrownMaterial, { ampU: 0.045, freqHz: 0.8, heightU: 2.1, phase: 0.6 }); // P2（×0.8 规整摆幅）
  const treeTrunks = new InstancedGroup(
    createTreeRoundGeometry({ assets, id: 'treeRound/servicearea-trunk', seed: hashStringToSeed('servicearea/tree-trunk') }).trunkGeometry,
    treeTrunkMaterial,
    { capacity: 5, name: 'servicearea/tree-trunks' },
  );
  const treeCrowns = new InstancedGroup(
    createTreeRoundGeometry({ assets, id: 'treeRound/servicearea-crown', seed: hashStringToSeed('servicearea/tree-crown') }).crownGeometry,
    treeCrownMaterial,
    { capacity: 5, name: 'servicearea/tree-crowns', jitter: { hue: 0.01, saturation: 0.04, lightness: 0.05 } },
  );
  const treeMatrix = new THREE.Matrix4();
  for (const [tx, tz] of [
    [-8.8, 6.85], [-4.3, 6.85], [0.6, 6.9], [5.2, 6.85], [9.0, 6.9],
  ] as const) {
    treeMatrix.identity().setPosition(tx, 0, tz);
    treeMatrix.multiply(new THREE.Matrix4().makeRotationY(rng.range(0, Math.PI * 2)));
    const s = 0.92 + rng.next() * 0.2;
    treeMatrix.multiply(new THREE.Matrix4().makeScale(s, s, s));
    treeTrunks.add(treeMatrix, '#7a5c3e');
    treeCrowns.add(treeMatrix, CHANNELS.treeGreen);
  }
  group.add(treeTrunks.group, treeCrowns.group);

  /* — ⑨ 高速路牌+出口指示牌（门架式绿牌 + 单柱式；牌面夜间微 emissive shopPower×0.3）— */
  const signs = createHighwaySigns({ assets, id: 'hwsign/servicearea' });
  signs.group.name = 'servicearea/hw-signs';
  signs.group.position.set(2.0, ROAD_Y, (ROAD_Z0 + ROAD_Z1) / 2);
  group.add(signs.group);
  const roadSignLamp: LampHandle = {
    emissiveMat: signs.faceMaterial,
    mode: 'steady', // 7.1.4：高速/出口牌微光 steady，功率 shopPower×0.3
    params: {},
  };
  lamps.push(roadSignLamp);
  // 单柱牌面 emissive 同步源（取部件内实际挂板实例——同 name 不同 map 会产生不同缓存实例，禁止重建）
  const poleBoard = signs.group.getObjectByName('hwsign/servicearea/pole-board') as THREE.Mesh | undefined;
  const poleFaceMaterial = (poleBoard?.material as THREE.MeshToonMaterial | undefined) ?? signs.faceMaterial;

  /* — ⑩ 长椅 ×2（benchSlat 无靠背变体）+ 分类垃圾桶 ×2（分类色环）— */
  const benchSnowParts: THREE.BufferGeometry[] = [];
  const benchIdA = 'benchSlat/servicearea-west';
  for (const [bx, bz] of [
    [BENCH_POS_W.x, BENCH_POS_W.z],
    [BENCH_POS_E.x, BENCH_POS_E.z],
  ] as const) {
    const bench = createBench({ assets, id: benchIdA, withBackrest: false, slatColor: '#9a7a52' }); // 同 id：几何/材质缓存共享（×2 摆位）
    bench.name = `servicearea/bench-${bx}`;
    bench.position.set(bx, LOT_Y, bz);
    group.add(bench);
    benchSnowParts.push(new THREE.BoxGeometry(1.7, 0.04, 0.56).translate(bx, 0.455, bz));
  }
  const benchSnow = new THREE.Mesh(
    assets.geometry('servicearea/bench-snow', () => hardenEdges(mergeGeometries(benchSnowParts)!)),
    makeSnowShellMaterial('servicearea/bench-snow'),
  );
  benchSnow.name = 'servicearea/bench-snow';
  benchSnow.userData.noOutline = true;
  benchSnow.visible = false;
  group.add(benchSnow);
  const benchSlatMaterial = toonMaterials.get('wood', { color: '#9a7a52', name: `${benchIdA}/slats` });
  for (const [bx, bz] of [
    [BIN_POS_W.x, BIN_POS_W.z],
    [BIN_POS_E.x, BIN_POS_E.z],
  ] as const) {
    const bin = createTrashBin({ assets, id: 'trashBin/servicearea' });
    bin.name = `servicearea/bin-${bx}`;
    bin.position.set(bx, LOT_Y, bz);
    bin.rotation.y = rng.range(0, Math.PI * 2);
    group.add(bin);
  }

  /* — +早餐餐具（J4 四场景就餐面「服务区长椅」档，docs/00 一.12 J4；Lathe 盘×2+杯×2+壶，
       仅 dawn 出现=离散量 D5——blend≥0.5 切换+0.2s opacity 淡变，§4.3.3-③；不入 named
       以保持 2.4.2 注册表三键口径）— */
  const tablewareSet = buildBreakfastSet(assets);
  tablewareSet.name = 'servicearea/breakfast-set';
  // 布局约束系统重排（本轮）：随东长椅（BENCH_POS_E）座面（座板顶 ≈0.4375，benchSlat.ts:41-42）
  tablewareSet.position.set(BREAKFAST_POS.x, 0.44, BREAKFAST_POS.z);
  tablewareSet.rotation.y = -0.08;
  tablewareSet.scale.setScalar(0.9); // 长椅座深 0.54u——原木凳面档同款缩放（pineforest 口径）
  tablewareSet.visible = false;
  group.add(tablewareSet);
  propsRef.tablewareSet = tablewareSet;
  propsRef.tablewareFadeMats = collectMeshMaterials(tablewareSet);

  /* — ⑪ 洗手池（台+盆+弯管龙头+镜背板；食堂段东侧墙边）— */
  const washBasin = createWashBasin({ assets, id: 'washBasin/servicearea' });
  washBasin.name = 'servicearea/wash-basin';
  washBasin.position.set(WASH_BASIN_POS.x, LOT_Y, WASH_BASIN_POS.z);
  group.add(washBasin);

  /* — ⑫ 旗杆小旗（clothMicro 橙白双色条；ClothHandle stiffness 0.25——7-4-④）— */
  const flagPole = createFlagPole({ assets, id: 'flagPole/servicearea' });
  flagPole.group.name = 'servicearea/flag-pole';
  flagPole.group.position.set(FLAG_POLE_POS.x, LOT_Y, FLAG_POLE_POS.z);
  group.add(flagPole.group);
  const flagTexture = assets.texture('servicearea/tex/flag', () =>
    paintCanvasTexture('servicearea/tex/flag', 128, 96, drawFlagStripes, true),
  );
  const flag = createMicroCloth({
    assets,
    id: 'servicearea/flag',
    width: 0.42,
    height: 0.3,
    color: '#f2efe8',
    stiffness: 0.25, // 7.1.2 布料总表「小旗」（波动幅度最大）
    windFactor: 1.1,
    sagAmp: 0.012, // 五-3「小旗增雨重」
    swayAxes: ['z'],
    preset: null,
    map: flagTexture,
    doubleSided: true,
  });
  flag.mesh.name = 'servicearea/flag';
  // 固定边 uv.x=0（局部 −x）贴杆：旗面自杆向 +x 展开
  flag.mesh.position.set(flagPole.flagAnchor.x + 0.21, flagPole.flagAnchor.y - 0.15, flagPole.flagAnchor.z);
  flagPole.group.add(flag.mesh);
  cloths.push(flag.handle);

  /* — +送货小车（四-1 清晨专属，named deliveryCart；清晨出现/白天收走=离散量 D5）— */
  const cart = createDeliveryCart({ assets, id: 'deliveryCart/servicearea', seed: hashStringToSeed('servicearea/cart') });
  cart.group.name = 'servicearea/delivery-cart';
  cart.group.position.set(DELIVERY_CART_POS.x, LOT_Y, DELIVERY_CART_POS.z); // 便利店侧门（西墙）外
  cart.group.rotation.y = 0.42;
  group.add(cart.group);
  propsRef.deliveryCart = cart.group;
  propsRef.cartFadeMaterials = cart.fadeMaterials;

  /* — 餐饮区排气口（四-3-⑥ 四源之一；几何在店体食堂段屋顶，emitter 锚点随 Director=campAnchor，
       T18-④ 同源限制——rate 固定白天基值 2.6，smokePower 调制待 T33 emitterHandles）— */
  const vent = new THREE.Mesh(
    assets.geometry('servicearea/vent', () => {
      const pipe = new THREE.CylinderGeometry(0.07, 0.07, 0.34, 8);
      pipe.translate(0, 0.17, 0);
      const cap = new THREE.CylinderGeometry(0.1, 0.07, 0.08, 8);
      cap.translate(0, 0.38, 0);
      return hardenEdges(mergeGeometries([pipe, cap])!);
    }),
    toonMaterials.get('metal', { color: '#8a8f94', name: 'servicearea/vent' }),
  );
  vent.name = 'servicearea/vent';
  vent.position.set(2.6, 3.16, -7.9);
  vent.castShadow = true;
  group.add(vent);
  emitters.push({
    kind: 'steam',
    area: new THREE.Vector3(0.5, 0.9, 0.5),
    rate: 2.6, // 白天基值（2.2×smokePower 1.0+0.4）；smokePower 调制归 T33（T18-④ 同源注记）
    lifetime: 3.0,
    size0: 0.05,
    size1: 0.28,
    vel0: new THREE.Vector3(0.02, 0.25, 0.01),
    color: '#e8e4dc',
    opacity: 0.26,
    additive: false,
  });
  // 雨棚檐滴水 ×2（五-3「雨棚檐 drip ×2」；rate 0 占位同 T18 口径——天气门控待 T33 接 emitterHandles）
  emitters.push({
    kind: 'drip',
    area: new THREE.Vector3(1.6, 0.2, 0.3),
    rate: 0,
    lifetime: 0.8,
    size0: 0.015,
    size1: 0.015,
    vel0: new THREE.Vector3(0, -3, 0),
    color: '#b8d4e8',
    opacity: 0.5,
    additive: false,
  });

  /* — 天气作用面（6 面：linePaint 划线 / ground 公路 / roofTop×4）— */
  if (terrainRefs.lotLinesMaterial && terrainRefs.roadMaterial) {
    surfaces.push(
      { material: terrainRefs.lotLinesMaterial, kind: 'linePaint' }, // 划线若隐若现（五-5 特例；uLineFade 乘 alpha）
      { material: terrainRefs.roadMaterial, kind: 'ground' }, // 雨夜湿反光作用面
    );
  }
  surfaces.push(
    { material: gasStation.roofMesh.material as THREE.Material, kind: 'roofTop', snowShell: canopySnow },
    { material: store.roofMesh.material as THREE.Material, kind: 'roofTop', snowShell: storeSnow },
  );
  const railSnow = terrainRefs.railSnow;
  if (railSnow) {
    surfaces.push({
      material: toonMaterials.get('metal', { color: '#b5bcc4', name: 'guardrail/servicearea/beam' }),
      kind: 'roofTop',
      snowShell: railSnow, // 护栏顶雪壳（buildTerrain 预建 ribbon）
    });
  }
  surfaces.push({ material: benchSlatMaterial, kind: 'roofTop', snowShell: benchSnow });

  // 布局约束系统：占位登记（位置常量单一来源 = content/layout/scenes/servicearea.ts）
  layoutGrid.register(SERVICEAREA_SCENE_ID, SERVICEAREA_ITEMS, SERVICEAREA_CAMP_POS);

  /* — 具名道具（2.4.2 注册表口径：named{deliveryCart, storeSign, vendingMachines}）— */
  const signFace = store.group.getObjectByName('store/servicearea/sign-face') ?? store.group;

  propsRef.signLamp = signLamp;
  propsRef.canopyLamp = canopyLamp;
  propsRef.vendingLamp = vendingLamp;
  propsRef.chargingLamp = chargingLamp;
  propsRef.roadSignLamp = roadSignLamp;
  propsRef.vendingStripB = vendingB.stripMaterial;
  propsRef.poleFaceMaterial = poleFaceMaterial;
  propsRef.windowGlowMaterial = toonMaterials.getToon('matteProp', {
    color: '#f2ead8',
    emissive: '#ffd9a0',
    emissiveIntensity: 1.5,
    name: 'store/servicearea/inner-glow',
  }); // 窗内衬独立实例（招牌同色同源——update 按招牌灯输出同步）
  propsRef.canopyHalos = [canopyHaloB];
  propsRef.vendingHalos = [vendingHaloB];

  return {
    group,
    named: { deliveryCart: cart.group, storeSign: signFace, vendingMachines },
    cloths,
    lamps,
    emitters,
    weatherSurfaces: surfaces,
  };
}

/* ============================== ③ createAnimations（7.2.4 服务区 5 项——场景动画仅 ①车流） ============================== */

/** 单车道在飞车辆（streak+halo 实例矩阵槽位）。 */
interface TrafficCar {
  active: boolean;
  x: number;
}

/**
 * 公路主线车流灯光流动（7-4-①：场景 SceneAnimation——独立于灯系统）。
 * 双向光条 InstancedMesh（前灯 #FFEFC8/尾灯 #FF5040 拉伸 quad+halo，2.4.3 色通道 headlightWarm/taillightRed）；
 * 车速 2.8m/s；Poisson 间隔 lerp(3.2s,0.55s,density)——B3：dawn 0.35/day 0.55/dusk 0.8/night 1.0；
 * 天气修正 rain×0.85/fog×0.9/snow×0.8；光流可见度 dawn 0.45/day 0.3/dusk 0.8/night 1.0；雪 α×0.7 防过曝；
 * 夜间前灯拉伸 1.3×（2.4.3）。近道（z 8.25）行 +x→尾灯红可见；远道（z 9.4）行 −x→前灯暖白可见。
 */
function createTrafficAnimation(runtime: SceneRuntime, state: ServiceareaState): SceneAnimation {
  const { assets } = runtime;
  const root = new THREE.Group();
  root.name = 'servicearea/traffic';
  runtime.root.add(root);
  // Poisson 抖动随机源（场景 id 派生——同组合可复现，§3.3.2 rng 纪律）
  const trafficRng = mulberry32(hashString('servicearea/traffic'));

  // —— 光条贴图：头部亮、尾部渐隐（u 向=行进方向）——
  const streakTexture = assets.texture('servicearea/tex/streak', () =>
    paintCanvasTexture('servicearea/tex/streak', 128, 32, (c, w, h) => {
      const grad = c.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0, 'rgba(255,255,255,0)');
      grad.addColorStop(0.55, 'rgba(255,255,255,0.22)');
      grad.addColorStop(0.92, 'rgba(255,255,255,0.85)');
      grad.addColorStop(1, 'rgba(255,255,255,0.95)');
      c.fillStyle = grad;
      c.fillRect(0, 0, w, h);
    }, true),
  );
  const haloTex = assets.texture('servicearea/tex/halo', () =>
    paintCanvasTexture('servicearea/tex/halo', 64, 64, (c, w, h) => {
      const grad = c.createRadialGradient(w / 2, h / 2, 1, w / 2, h / 2, w / 2);
      grad.addColorStop(0, 'rgba(255,255,255,0.9)');
      grad.addColorStop(0.4, 'rgba(255,255,255,0.28)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = grad;
      c.fillRect(0, 0, w, h);
    }, true),
  );
  const streakGeometry = assets.geometry('servicearea/traffic-streak', () =>
    new THREE.PlaneGeometry(0.95, 0.07).rotateX(-Math.PI / 2), // 平铺公路面，长轴 x
  );
  const haloGeometry = assets.geometry('servicearea/traffic-halo', () =>
    new THREE.PlaneGeometry(0.2, 0.2).rotateX(-Math.PI / 2),
  );
  const CAPACITY = 6;
  interface Lane {
    dir: 1 | -1;
    z: number;
    cars: TrafficCar[];
    streakMaterial: THREE.MeshBasicMaterial;
    haloMaterial: THREE.MeshBasicMaterial;
    streaks: THREE.InstancedMesh;
    halos: THREE.InstancedMesh;
    spawnTimer: number;
    isHeadlight: boolean;
  }
  const lanes: Lane[] = [];
  const mkLane = (z: number, dir: 1 | -1, color: string, isHeadlight: boolean): Lane => {
    const streakMaterial = new THREE.MeshBasicMaterial({
      color,
      map: streakTexture,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    streakMaterial.name = `servicearea/traffic-streak-${z}`;
    const haloMaterial = new THREE.MeshBasicMaterial({
      color,
      map: haloTex,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    haloMaterial.name = `servicearea/traffic-halo-${z}`;
    const streaks = new THREE.InstancedMesh(streakGeometry, streakMaterial, CAPACITY);
    streaks.name = `servicearea/traffic-streaks-${z}`;
    streaks.count = CAPACITY;
    streaks.frustumCulled = false;
    streaks.renderOrder = 22;
    streaks.userData.noOutline = true;
    const halos = new THREE.InstancedMesh(haloGeometry, haloMaterial, CAPACITY);
    halos.name = `servicearea/traffic-halos-${z}`;
    halos.count = CAPACITY;
    halos.frustumCulled = false;
    halos.renderOrder = 22;
    halos.userData.noOutline = true;
    root.add(streaks, halos);
    const cars: TrafficCar[] = Array.from({ length: CAPACITY }, () => ({ active: false, x: 0 }));
    return { dir, z, cars, streakMaterial, haloMaterial, streaks, halos, spawnTimer: 0.5, isHeadlight };
  };
  lanes.push(mkLane(LANE_NEAR_Z, 1, CHANNELS.taillightRed, false)); // 近道 +x：尾灯红
  lanes.push(mkLane(LANE_FAR_Z, -1, CHANNELS.headlightWarm, true)); // 远道 −x：前灯暖白

  const matrix = new THREE.Matrix4();
  const rotation = new THREE.Matrix4();
  const tmpObject = new THREE.Object3D();

  return {
    update(dt: number): void {
      const weatherMul = TRAFFIC_WEATHER_MUL[state.weather] ?? 1;
      const density = clamp(state.density * weatherMul, 0, 1); // 天气修正 rain×0.85/fog×0.9/snow×0.8
      const visibility = state.visibility;
      const snowDim = state.weather === 'snow' ? 0.7 : 1; // 雪地 α×0.7 防过曝
      const glow = WEATHER_GLOW[state.weather] ?? 0;
      const baseInterval = THREE.MathUtils.lerp(3.2, 0.55, density); // Poisson 间隔（B3）
      for (const lane of lanes) {
        // —— 发射（Poisson：平均间隔×抖动 0.6..1.4）——
        lane.spawnTimer -= dt;
        if (lane.spawnTimer <= 0) {
          lane.spawnTimer = baseInterval * (0.6 + 0.8 * trafficRng());
          const free = lane.cars.find((car) => !car.active);
          if (free) {
            free.active = true;
            free.x = lane.dir === 1 ? -11.8 : 11.8;
          }
        }
        // —— 行进与回收——
        for (const car of lane.cars) {
          if (!car.active) continue;
          car.x += lane.dir * TRAFFIC_SPEED * dt;
          if (Math.abs(car.x) > 11.8) car.active = false;
        }
        // —— 实例矩阵（旋转对向；夜间前灯拉伸 1.3×）——
        const stretch = lane.isHeadlight ? state.headlightStretch : 1;
        let i = 0;
        for (const car of lane.cars) {
          if (car.active) {
            tmpObject.position.set(car.x, ROAD_Y + 0.02, lane.z);
            tmpObject.rotation.set(0, lane.dir === 1 ? 0 : Math.PI, 0);
            tmpObject.scale.set(stretch, 1, 1);
            tmpObject.updateMatrix();
            matrix.copy(tmpObject.matrix);
          } else {
            matrix.makeScale(0.0001, 0.0001, 0.0001); // 非活跃槽位压点（不置零矩阵防 NaN 包围）
          }
          lane.streaks.setMatrixAt(i, matrix);
          // halo 挂光条头部（局部 +x 端）
          if (car.active) {
            rotation.makeTranslation(lane.dir * 0.42, 0, 0);
            matrix.multiply(rotation);
          }
          lane.halos.setMatrixAt(i, matrix);
          i += 1;
        }
        lane.streaks.instanceMatrix.needsUpdate = true;
        lane.halos.instanceMatrix.needsUpdate = true;
        // —— 可见度（光流可见度表 × 雪地 α×0.7；halo ×(1+0.5×glow) 同 §4.3.3-⑧）——
        const alpha = visibility * snowDim;
        lane.streakMaterial.opacity = alpha;
        lane.streakMaterial.visible = alpha >= 0.02;
        lane.haloMaterial.opacity = alpha * 0.42 * (1 + 0.5 * glow);
        lane.haloMaterial.visible = lane.haloMaterial.opacity >= 0.02;
      }
    },
    dispose(): void {
      root.removeFromParent();
    },
  };
}

function createAnimations(runtime: SceneRuntime): readonly SceneAnimation[] {
  runtimeBreath = runtime.breath; // 结构化可选口（bindChannel/getLampOutput/setLampPower）在 lightHooks 中按需取用
  // shopPower 通道绑定（7.1.4 服务区行逐灯 mul；缺 bindChannel 实现时降级 applyLighting 逐档覆盖）
  const breath = runtimeBreath as BreathSceneExt | null;
  const bound = typeof breath?.bindChannel === 'function';
  if (bound && breath.bindChannel) {
    breath.bindChannel(propsRef.canopyLamp!, 'shop', SHOP_MUL.canopy);
    breath.bindChannel(propsRef.signLamp!, 'shop', SHOP_MUL.sign);
    breath.bindChannel(propsRef.vendingLamp!, 'shop', SHOP_MUL.vending); // floor 0.7 在 params（max(shopPower,0.7)）
    breath.bindChannel(propsRef.chargingLamp!, 'shop', SHOP_MUL.charging);
    breath.bindChannel(propsRef.roadSignLamp!, 'shop', SHOP_MUL.roadSign);
  }
  channelBound = bound;
  // 招牌偶发双闪（7-1.5-5/7.1.4：平均 20s±8s——scheduler.ts signDoubleFlash 预置档，夜间不限）
  runtime.scheduler.add({
    meanIntervalS: SCHEDULED_EVENT_PRESETS.signDoubleFlash.meanIntervalS,
    jitterS: SCHEDULED_EVENT_PRESETS.signDoubleFlash.jitterS,
    fire(): void {
      sceneState.flashRemaining = 1.3; // 双峰包络窗口（update 内消费）
    },
  });
  return [createTrafficAnimation(runtime, sceneState)];
}

/* ============================== ④ palette（2.4.3） ============================== */

const palette: ScenePalette = {
  colorChannels: CHANNELS,
  baseStyle: {
    topTheme: 'asphaltLot', // 沥青+划线区（§4.1.0 差异表；划线由场景 linePaint decal 承担）
    edgeMatId: 'curbStone', // 路缘石剖面
    rimDecal: null,
    skirtLayers: 1, // 公路下沉 −0.12（立裙加层）
    silhouette: null,
  },
  baseFog: 0.08,
};

/* ============================== ⑤ lightHooks（行为表逐行实现） ============================== */

/** 模块级运行态（Director 单场景装配；初值=黄昏档，首帧 applyLighting(blend=1) 对位，§4.3.5）。 */
const sceneState: ServiceareaState = {
  time: 'dusk',
  weather: 'clear',
  shopPower: 0.65,
  smokePower: 0.35,
  flashRemaining: 0,
  density: TRAFFIC_DENSITY.dusk ?? 0.8,
  densityFrom: TRAFFIC_DENSITY.dusk ?? 0.8,
  densityTo: TRAFFIC_DENSITY.dusk ?? 0.8,
  visibility: TRAFFIC_VISIBILITY.dusk ?? 0.8,
  visibilityFrom: TRAFFIC_VISIBILITY.dusk ?? 0.8,
  visibilityTo: TRAFFIC_VISIBILITY.dusk ?? 0.8,
  headlightStretch: 1,
  headlightStretchFrom: 1,
  headlightStretchTo: 1,
  cartVisible: false,
  cartFaded: true,
  cartFade: 0,
  tablewareVisible: false,
  tablewareFaded: true,
  tablewareFade: 0,
  lastKey: 'dusk',
  pendingKey: null,
};

/** Director 运行期注入的 breath 引用（createAnimations 时快照；lightHooks 的场景映射口）。 */
let runtimeBreath: LightBreathSystem | null = null;
/** bindChannel 是否可用（可用=通道绑定；不可用=applyLighting setLampPower 降级路径）。 */
let channelBound = false;

const lightHooks: SceneLightHooks = {
  applyLighting(state: SceneLightState, blend: number): void {
    sceneState.time = state.time;
    sceneState.weather = state.weather;
    sceneState.shopPower = state.shopPower;
    sceneState.smokePower = state.smokePower;

    // —— 连续量：车流密度/可见度/前灯拉伸随 blend 全程插值（§4.3.1 连续量清单）——
    const densityTarget = TRAFFIC_DENSITY[state.time] ?? 0.55;
    const visibilityTarget = TRAFFIC_VISIBILITY[state.time] ?? 0.3;
    const stretchTarget = state.time === 'night' ? TRAFFIC_NIGHT_STRETCH : 1;
    if (sceneState.lastKey !== state.time) {
      // 换档：快照当前插值中间态为新 from（§4.3.5「中途改档不跳变」同口径）
      sceneState.densityFrom = sceneState.density;
      sceneState.visibilityFrom = sceneState.visibility;
      sceneState.headlightStretchFrom = sceneState.headlightStretch;
      sceneState.densityTo = densityTarget;
      sceneState.visibilityTo = visibilityTarget;
      sceneState.headlightStretchTo = stretchTarget;
      sceneState.pendingKey = state.time;
      sceneState.lastKey = state.time;
    }
    const b = clamp(blend, 0, 1);
    const eased = b * b * (3 - 2 * b);
    sceneState.density = THREE.MathUtils.lerp(sceneState.densityFrom, sceneState.densityTo, eased);
    sceneState.visibility = THREE.MathUtils.lerp(sceneState.visibilityFrom, sceneState.visibilityTo, eased);
    sceneState.headlightStretch = THREE.MathUtils.lerp(sceneState.headlightStretchFrom, sceneState.headlightStretchTo, eased);

    // —— 离散量：送货小车+早餐餐具（dawn 出现/其余收走；blend≥0.5 切换+0.2s opacity 淡变，§4.3.1/D5）——
    if (sceneState.pendingKey !== null && b >= 0.5) {
      const targetVisible = sceneState.pendingKey === 'dawn';
      if (targetVisible && !sceneState.cartVisible) {
        sceneState.cartVisible = true;
        sceneState.cartFaded = false;
      } else if (!targetVisible && sceneState.cartVisible) {
        sceneState.cartFaded = true; // update 内 0.2s 淡出后隐藏
      }
      if (targetVisible && !sceneState.tablewareVisible) {
        sceneState.tablewareVisible = true;
        sceneState.tablewareFaded = false;
      } else if (!targetVisible && sceneState.tablewareVisible) {
        sceneState.tablewareFaded = true; // update 内 0.2s 淡出后隐藏
      }
      sceneState.pendingKey = null;
    }

    // —— shopPower 降级路径（实现侧无 bindChannel 时逐档覆盖；通道绑定路径由 Director 每帧下发）——
    if (!channelBound) {
      const breath = runtimeBreath as BreathSceneExt | null;
      if (breath?.setLampPower) {
        breath.setLampPower(propsRef.canopyLamp!, state.shopPower * SHOP_MUL.canopy);
        breath.setLampPower(propsRef.signLamp!, state.shopPower * SHOP_MUL.sign);
        breath.setLampPower(propsRef.vendingLamp!, Math.max(state.shopPower * SHOP_MUL.vending, 0.7));
        breath.setLampPower(propsRef.chargingLamp!, state.shopPower * SHOP_MUL.charging);
        breath.setLampPower(propsRef.roadSignLamp!, state.shopPower * SHOP_MUL.roadSign);
      }
    }
  },

  /** 每帧细粒度驱动（双闪包络/副材质同步/手动 halo 层/送货小车 0.2s 淡变）。 */
  update(dt: number, _elapsed: number): void {
    const breath = runtimeBreath as BreathSceneExt | null;

    // —— 招牌偶发双闪（EventScheduler signDoubleFlash → 1.3s 双峰包络 × shopPower 叠加）——
    if (sceneState.flashRemaining > 0) {
      sceneState.flashRemaining = Math.max(0, sceneState.flashRemaining - dt);
      const t = 1.3 - sceneState.flashRemaining;
      const env = Math.exp(-Math.pow((t - 0.25) / 0.12, 2)) + 0.85 * Math.exp(-Math.pow((t - 0.7) / 0.12, 2));
      if (breath?.setLampPower) breath.setLampPower(propsRef.signLamp!, sceneState.shopPower * (1 + 1.6 * env));
      if (sceneState.flashRemaining === 0 && breath?.clearLampPower && channelBound) {
        breath.clearLampPower(propsRef.signLamp!); // 窗口结束交还通道值
      }
    }

    // —— 副灯材质同步（2 台售货机灯带/单柱牌面：每帧从主灯材质拷贝当前输出）——
    const stripA = propsRef.vendingLamp?.emissiveMat;
    const stripB = propsRef.vendingStripB;
    if (stripA && stripB) {
      stripB.emissiveIntensity = stripA.emissiveIntensity;
      stripB.visible = stripA.visible;
    }
    const gantryFace = propsRef.roadSignLamp?.emissiveMat;
    const poleFace = propsRef.poleFaceMaterial;
    if (gantryFace && poleFace) {
      poleFace.emissiveIntensity = gantryFace.emissiveIntensity;
      poleFace.visible = gantryFace.visible;
    }
    // 窗内衬（餐饮暖光内衬+吊灯 3 点）与招牌灯同源：intensity=1.5×getLampOutput(sign)
    const windowGlow = propsRef.windowGlowMaterial;
    const signOut = breath?.getLampOutput?.(propsRef.signLamp!) ?? sceneState.shopPower;
    if (windowGlow) {
      windowGlow.emissiveIntensity = 1.5 * signOut;
      windowGlow.visible = windowGlow.emissiveIntensity >= 0.02;
    }

    // —— 手动 halo 成对层（op=0.35×out×(1+0.5×glow)，§4.3.3-⑧ 同式；主 halo 由 LightBreath 驱动）——
    const glow = WEATHER_GLOW[sceneState.weather] ?? 0;
    const canopyOut = breath?.getLampOutput?.(propsRef.canopyLamp!) ?? sceneState.shopPower * SHOP_MUL.canopy;
    for (const halo of propsRef.canopyHalos ?? []) {
      const material = halo.material as THREE.SpriteMaterial;
      material.opacity = 0.35 * canopyOut * (1 + 0.5 * glow);
      halo.visible = material.opacity >= 0.02;
    }
    const vendingOut = breath?.getLampOutput?.(propsRef.vendingLamp!) ?? Math.max(sceneState.shopPower, 0.7);
    for (const halo of propsRef.vendingHalos ?? []) {
      const material = halo.material as THREE.SpriteMaterial;
      material.opacity = 0.35 * vendingOut * (1 + 0.5 * glow);
      halo.visible = material.opacity >= 0.02;
    }

    // —— 送货小车/早餐餐具 0.2s 淡入淡出（切换用 opacity 渐变不用 scale 弹跳，§4.3.1）——
    const cart = propsRef.deliveryCart;
    if (cart) {
      const targetOpacity = sceneState.cartVisible && !sceneState.cartFaded ? 1 : 0;
      if (targetOpacity > sceneState.cartFade) {
        sceneState.cartFade = Math.min(1, sceneState.cartFade + dt / 0.2);
      } else if (targetOpacity < sceneState.cartFade) {
        sceneState.cartFade = Math.max(0, sceneState.cartFade - dt / 0.2);
        if (sceneState.cartFade <= 0) sceneState.cartVisible = false;
      }
      cart.visible = sceneState.cartFade > 0.02;
      for (const material of propsRef.cartFadeMaterials ?? []) {
        material.opacity = 0.999 * sceneState.cartFade;
        material.visible = sceneState.cartFade > 0.02;
      }
    }
    const tableware = propsRef.tablewareSet;
    if (tableware) {
      const targetOpacity = sceneState.tablewareVisible && !sceneState.tablewareFaded ? 1 : 0;
      if (targetOpacity > sceneState.tablewareFade) {
        sceneState.tablewareFade = Math.min(1, sceneState.tablewareFade + dt / 0.2);
      } else if (targetOpacity < sceneState.tablewareFade) {
        sceneState.tablewareFade = Math.max(0, sceneState.tablewareFade - dt / 0.2);
        if (sceneState.tablewareFade <= 0) sceneState.tablewareVisible = false;
      }
      tableware.visible = sceneState.tablewareFade > 0.02;
      for (const material of propsRef.tablewareFadeMats ?? []) {
        material.opacity = 0.999 * sceneState.tablewareFade;
        material.visible = sceneState.tablewareFade > 0.02;
      }
    }
  },
};

/* ============================== SceneModule（§3.3.2 五部分） ============================== */

/** 高速路服务区（id/label = 'servicearea'/'服务区'，§4.1.4 模块卡；非默认场景）。 */
export const serviceareaScene: SceneModule = {
  id: 'servicearea',
  label: '服务区',
  isDefault: false,
  buildTerrain,
  buildProps,
  createAnimations,
  palette,
  lightHooks,
};
