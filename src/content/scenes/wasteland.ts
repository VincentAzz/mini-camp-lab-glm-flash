// docs/01-整体架构.md §3.2 content/scenes/wasteland.ts —— 2.3 末日避难所营地 wasteland（13 组元素 + 7 动效，治愈系末世）。T20 落点。
// docs/02-场景模块.md §4.1.3（模块卡/地形 2.3.1/道具 2.3.2 十三组/palette 2.3.3 九通道/光照钩子行为表 J5·B2 时序/注册与预算）
//   + §4.1.0 campAnchor 避难所行 + §4.0 四域共通（句柄接入/程序化字典/无人物红线）；
// docs/05-时间天气动效.md §7.2.3 避难所 7 动效逐项落点 + §7.1 定值表（唯一参数源）+ §4.3.2 通道定值（场景只解释）
//   + §4.3.4 J5 四档矩阵（清晨换岗快扫→白天灯具全熄→黄昏启动→夜间全亮慢扫）；
// docs/04-三渲二渲染.md §5.5（避难所=ramp2 为主+metal 锈迹蒙版+火光/荧光 emissive+探照灯光束锥——渲染层零场景分支）。
//
// 基调约束（一·5）：干净、有秩序感与生活气息的治愈系末世——锈而不腐、整齐堆放、无血腥无恐怖；
//   残骸无乘员/骸骨（一·6）、警示牌无骷髅图形；锈红/沙黄低饱和、无暗黑底、荧光（青 LED）只做小面积点缀。
// 无人物红线（一·6）：全场景无人形几何（工装=衣物剪影、残骸空车、无 NPC）。
//
// 依赖纪律（§3.3.6）：只 import core 契约（types/handles）+ shared + geom 部件库 + render 工厂；
//   零 import 车型/时间/天气注册表；布料/粒子/灯点只交句柄与参数（docs/01 §3.4 归属裁定）。
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
import { mergeGeometries, hardenEdges, roundedBox, lathe } from '@/geom/primitives';
import { createBunker } from '@/geom/parts/wasteland/bunker';
import { createWatchtower, makeHaloTexture } from '@/geom/parts/wasteland/watchtower';
import { createSandbagWalls } from '@/geom/parts/wasteland/sandbags';
import { createContainer, createCorrugatedWall } from '@/geom/parts/wasteland/containersWall';
import { createWireNet } from '@/geom/parts/wasteland/wireNet';
import { createWreck, createTirePyramid, createBarrelSign } from '@/geom/parts/wasteland/wreckSign';
import { createPurifierGenerator, createSolarArray, createRadarDish } from '@/geom/parts/wasteland/utilities';
import { createBarrelGrill, createClothesline, createCityWindows } from '@/geom/parts/wasteland/living';
import { paintCanvasTexture, drawOilStain, drawSandPatch, drawPuddle } from '@/geom/parts/wasteland/texPaint';
import { clamp } from '@/shared/math';

/* ============================== 场景定值（docs/02 §4.1.3 / docs/05 §7.2.3） ============================== */

/** 色彩通道（2.3.3 九通道，docs/02 定值逐字；锈红/沙黄已按一·5 压低饱和 10–15%）。 */
const CHANNELS = {
  concreteGray: '#9aa0a2',
  sandDust: '#c9a96e',
  rustRed: '#a05238',
  rustDark: '#7c3a28',
  containerBlue: '#4a6a72',
  metalDark: '#4a4a50',
  fireOrange: '#ff8f3d',
  beaconRed: '#ff5a4a',
  cyanGlow: '#5ad8d0',
} satisfies Record<string, RGB>;

/** 探照灯 B2 时序（7-3-①：dawn 6s/55° 换岗快扫「亮」→dusk 10s/45° 0.8→night 14s/40° 慢扫 1.0；白天熄）。 */
interface SweepPhase {
  readonly period: number;
  readonly sweepRad: number;
  readonly power: number;
}
const SWEEP_DAWN: SweepPhase = { period: 6, sweepRad: (55 * Math.PI) / 180, power: 1.0 };
const SWEEP_DAY: SweepPhase = { period: 6, sweepRad: (55 * Math.PI) / 180, power: 0 };
const SWEEP_DUSK: SweepPhase = { period: 10, sweepRad: (45 * Math.PI) / 180, power: 0.8 };
const SWEEP_NIGHT: SweepPhase = { period: 14, sweepRad: (40 * Math.PI) / 180, power: 1.0 };
const SWEEP_PHASES: Record<string, SweepPhase> = { dawn: SWEEP_DAWN, day: SWEEP_DAY, dusk: SWEEP_DUSK, night: SWEEP_NIGHT };

/** 警示红灯功率（7.1.4：dusk 0.7/night 1.0；J5 清晨弱闪 0.3；白天灯具全熄 0——四-2）。 */
const WARN_TARGETS: Record<string, number> = { dawn: 0.3, day: 0, dusk: 0.7, night: 1.0 };
/** 天线指示灯功率（7.1.4 lampPower 场景映射：dawn 弱闪 0.3 / dusk·night 1.0）。 */
const ANTENNA_TARGETS: Record<string, number> = { dawn: 0.3, day: 0, dusk: 1.0, night: 1.0 };
/** 净水 LED 功率（7.1.4 lampPower×0.4 → dusk/night 0.4；J5 清晨 0.4「冷色荧光」；白天 0）。 */
const LED_TARGETS: Record<string, number> = { dawn: 0.4, day: 0, dusk: 0.4, night: 0.4 };
/** 城市窗灯抽样点亮比例（2.3-⑬★统一：dusk 20% / night 35%；dawn 微光沿用 20% 抽样；day 熄）。 */
const WINDOW_FRACS: Record<string, number> = { dawn: 0.2, day: 0, dusk: 0.2, night: 0.35 };
/** 天气 → 光晕增益（§4.4.1 glowBoost 定值同源近似——SceneLightState 不携带 glowBoost，同 T18 口径）。 */
const WEATHER_GLOW: Record<string, number> = { clear: 0, cloudy: 0.15, rain: 0.35, fog: 0.8, snow: 0.25 };

/** 场景内部共享运行态（lightHooks/update/SceneAnimation 三方读写——同一模块闭包）。 */
interface WastelandState {
  time: string;
  weather: string;
  lampPower: number;
  emberPower: number;
  smokePower: number;
  shopPower: number;
  beam: number;
  beamFrom: number;
  beamTo: number;
  warn: number;
  warnFrom: number;
  warnTo: number;
  antenna: number;
  antennaFrom: number;
  antennaTo: number;
  led: number;
  ledFrom: number;
  ledTo: number;
  windowOpacity: number;
  sweep: SweepPhase;
  dew: number;
  dewTo: number;
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
};

/** 场景灯点句柄缓存（update 的 getLampOutput/降级自驱取用；buildProps 填充）。 */
const lampRefs: { searchlight?: LampHandle; warn?: LampHandle; antenna?: LampHandle; led?: LampHandle } = {};

/* ============================== ① buildTerrain（2.3.1） ============================== */

function buildTerrain(ctx: SceneBuildContext): SceneTerrain {
  const { assets } = ctx;
  const group = new THREE.Group();
  group.name = 'wasteland/terrain';

  // —— 四角沙地补丁（2.3.1；sandDust 中值底 alpha 圆斑，1 DC ×4 共几何）——
  const sandTexture = assets.texture('wasteland/tex/sand-patch', () =>
    paintCanvasTexture('wasteland/tex/sand-patch', 128, 128, drawSandPatch, true),
  );
  const sandMaterial = toonMaterials.get('groundTerrain', { color: CHANNELS.sandDust, map: sandTexture, opacity: 0.999, name: 'wasteland/sand-patch' });
  const sandGeometry = assets.geometry('wasteland/sand-patch', () => new THREE.PlaneGeometry(3.4, 3.2).rotateX(-Math.PI / 2));
  for (const [sx, sz, rot] of [
    [-7.7, 7.1, 0.4],
    [7.6, 6.7, -0.7],
    [7.5, -7.3, 1.2],
    [-7.4, -6.9, 2.1],
  ] as const) {
    const patch = new THREE.Mesh(sandGeometry, sandMaterial);
    patch.name = 'wasteland/sand-patch';
    patch.position.set(sx, 0.006, sz);
    patch.rotation.y = rot;
    patch.receiveShadow = true;
    patch.userData.noOutline = true;
    group.add(patch);
  }

  // —— 2 处浅油渍 decal（2.3.1「干净风：小而淡」；1 DC 共几何）——
  const stainTexture = assets.texture('wasteland/tex/oil-stain', () =>
    paintCanvasTexture('wasteland/tex/oil-stain', 128, 128, drawOilStain, true),
  );
  const stainMaterial = toonMaterials.get('matteProp', { color: '#4a4c50', map: stainTexture, opacity: 0.999, snow: 'off', name: 'wasteland/oil-stain' });
  const stainGeometry = assets.geometry('wasteland/oil-stain', () => new THREE.PlaneGeometry(1.15, 0.85).rotateX(-Math.PI / 2));
  for (const [sx, sz] of [
    [1.75, 0.4],
    [-2.05, 1.55],
  ] as const) {
    const stain = new THREE.Mesh(stainGeometry, stainMaterial);
    stain.name = 'wasteland/oil-stain';
    stain.position.set(sx, 0.009, sz);
    stain.rotation.y = sx > 0 ? 0.5 : -0.3;
    stain.userData.noOutline = true;
    group.add(stain);
  }

  // —— 雨天水洼 decal（05 §五-3「水洼涟漪」预烘区；ground-kind 反应面随 uWet 增深/uPuddle 涟漪）——
  const puddleTexture = assets.texture('wasteland/tex/puddle', () =>
    paintCanvasTexture('wasteland/tex/puddle', 128, 128, drawPuddle, true),
  );
  const puddleMaterial = toonMaterials.get('groundTerrain', { color: '#7e8a90', map: puddleTexture, opacity: 0.999, name: 'wasteland/puddle' });
  const puddle = new THREE.Mesh(
    assets.geometry('wasteland/puddle', () => new THREE.PlaneGeometry(2.1, 1.5).rotateX(-Math.PI / 2)),
    puddleMaterial,
  );
  puddle.name = 'wasteland/puddle';
  puddle.position.set(-1.1, 0.008, 3.3);
  puddle.rotation.y = 0.3;
  puddle.userData.noOutline = true;
  group.add(puddle);

  return {
    group,
    // docs/02 §4.1.0 避难所行 (0, 0, 0)/−0.40（车头朝围墙开口）/groundY 0/radius 4.0——硬化地面开口朝 +z 前侧
    campAnchor: {
      position: new THREE.Vector3(0, 0, 0),
      headingRad: -0.4,
      groundY: 0,
      radius: 4.0,
    },
  };
}

/* ============================== ② buildProps（2.3.2 十三组） ============================== */

/** buildProps 产物登记（lightHooks.update / createAnimations 的取用点）。 */
interface PropRefs {
  yoke: THREE.Group;
  beamMaterial: THREE.MeshBasicMaterial;
  groundSpot: THREE.Mesh;
  warnLeafGroup: THREE.Group;
  warnLeafMaterial: THREE.MeshBasicMaterial;
  cityWindows: { setFraction(frac: number): void; material: THREE.MeshBasicMaterial; total: number };
  radarRotor: THREE.Group;
  coalMaterial: THREE.MeshToonMaterial;
  dewSparkleMaterial: THREE.MeshBasicMaterial;
  tablewareSet: THREE.Group;
  tablewareFadeMats: THREE.MeshToonMaterial[];
  searchlightLamp: LampHandle;
  warnBulbMaterial: THREE.MeshToonMaterial;
  antennaLamp: LampHandle;
  ledLamp: LampHandle;
}

const propsRef: Partial<PropRefs> = {};

function buildProps(ctx: SceneBuildContext): SceneProps {
  const { assets } = ctx;
  const group = new THREE.Group();
  group.name = 'wasteland/props';
  const rng = ctx.rng.fork('props');
  const cloths: ClothHandle[] = [];
  const lamps: LampHandle[] = [];
  const emitters: EmitterSpec[] = [];
  const surfaces: WeatherSurface[] = [];

  /* —— 共用材质 —— */
  const snowShellMaterial = toonMaterials.get('matteProp', { color: '#edf2f9', snow: 'off', opacity: 0.999, name: 'wasteland/snow-shell' });

  /* — ① 混凝土掩体+防爆门（后缘中央，门面朝 +z 开口侧）— */
  const bunker = createBunker({ assets, id: 'wasteland/bunker' });
  bunker.group.name = 'wasteland/bunker';
  bunker.group.position.set(0.35, 0, -8.3);
  group.add(bunker.group);
  // 掩体顶雪壳（roofTop——五-5 枚举「掩体顶」）
  const bunkerSnow = new THREE.Mesh(
    assets.geometry('wasteland/snow-bunker', () =>
      new THREE.BoxGeometry(bunker.roofSize.w, 0.05, bunker.roofSize.d).rotateX(-0.105).translate(0, 0.06, 0),
    ),
    snowShellMaterial,
  );
  bunkerSnow.name = 'wasteland/snow-bunker';
  bunkerSnow.position.set(0.35, bunker.roofY, -8.3);
  bunkerSnow.userData.noOutline = true;
  bunkerSnow.visible = false;
  group.add(bunkerSnow);
  surfaces.push({ material: bunker.material, kind: 'roofTop', snowShell: bunkerSnow });

  /* — ② 铁架瞭望塔+探照灯（后左角；named searchlightYoke）— */
  const tower = createWatchtower({ assets, id: 'wasteland/watchtower', platformH: 3.0 });
  tower.group.name = 'wasteland/watchtower';
  tower.group.position.set(-7.35, 0, -6.1);
  // 云台基向：local −z 指向营位中心（0,0,0）——φ=atan2(−dx,−dz)
  const baseYaw = Math.atan2(-(0 - -7.35), -(0 - -6.1));
  tower.yoke.rotation.y = baseYaw;
  tower.yoke.userData.baseYaw = baseYaw;
  group.add(tower.group);
  propsRef.yoke = tower.yoke;
  propsRef.beamMaterial = tower.beamMaterial;
  propsRef.groundSpot = tower.groundSpot;

  /* — ④ 锈蚀集装箱 ×2 + 波纹铁皮围墙（×14 实例化；后缘 + 左右围墙段，前侧留开口）— */
  const containerA = createContainer({ assets, id: 'wasteland/container-a' });
  containerA.group.name = 'wasteland/container-a';
  containerA.group.position.set(-4.55, 0, -8.45);
  containerA.group.rotation.y = 0.04;
  group.add(containerA.group);
  const containerB = createContainer({ assets, id: 'wasteland/container-b' });
  containerB.group.name = 'wasteland/container-b';
  containerB.group.position.set(5.35, 0, -8.55);
  containerB.group.rotation.y = -0.05;
  group.add(containerB.group);
  // 波纹铁皮围墙：左段（x≈−8.5，z −5.4→+3.0）+ 右段（x≈8.45，z −5.0→+1.3）——开口朝 +z
  const wall = createCorrugatedWall(assets, 'wasteland/wall', [
    { x: -8.5, z: -5.4, dirRad: -Math.PI / 2, length: 8.4 },
    { x: 8.45, z: -5.0, dirRad: -Math.PI / 2, length: 6.3 },
  ]);
  wall.group.name = 'wasteland/wall';
  group.add(wall.group);

  // 锈铁面（箱顶+墙顶）雪壳（roofTop：2 箱顶 + 2 墙顶合并 1 壳；箱/墙各自材质面共挂同一壳）
  const rustSnow = new THREE.Mesh(
    assets.geometry('wasteland/snow-rust', () => {
      const parts: THREE.BufferGeometry[] = [];
      const boxA = new THREE.BoxGeometry(5.3, 0.05, 2.25);
      boxA.rotateY(0.04);
      boxA.translate(-4.55, containerA.roofY + 0.05, -8.45);
      parts.push(boxA);
      const boxB = new THREE.BoxGeometry(5.3, 0.05, 2.25);
      boxB.rotateY(-0.05);
      boxB.translate(5.35, containerB.roofY + 0.05, -8.55);
      parts.push(boxB);
      const wallL = new THREE.BoxGeometry(8.3, 0.05, 0.16);
      wallL.translate(-8.5, 1.96, -0.9);
      parts.push(wallL);
      const wallR = new THREE.BoxGeometry(6.2, 0.05, 0.16);
      wallR.translate(8.45, 1.96, -1.85);
      parts.push(wallR);
      const merged = mergeGeometries(parts);
      if (!merged) throw new Error('[wasteland] 锈铁顶雪壳合并失败');
      return merged;
    }),
    snowShellMaterial,
  );
  rustSnow.name = 'wasteland/snow-rust';
  rustSnow.userData.noOutline = true;
  rustSnow.visible = false;
  group.add(rustSnow);
  surfaces.push({ material: containerA.material, kind: 'roofTop', snowShell: rustSnow });
  surfaces.push({ material: wall.panelMaterial, kind: 'roofTop', snowShell: rustSnow });

  /* — ⑤ 缠绕铁丝网（guardNet alpha 网面 + 卷网筒 ×3 + 支桩 ×6：3 网段 ×2 桩）— */
  const wireNet = createWireNet(assets, 'wasteland/net', [
    { x: -7.85, z: -4.7, dirRad: -Math.PI / 2, length: 6.6 }, // 左墙内侧
    { x: 7.75, z: -3.4, dirRad: -Math.PI / 2, length: 4.4 }, // 右墙内侧
    { x: -6.3, z: -6.9, dirRad: 0.06, length: 3.2 }, // 后缘集装箱前
  ]);
  wireNet.group.name = 'wasteland/net';
  group.add(wireNet.group);

  /* — ③ 沙袋工事（Sphere 压扁 ×30 错缝 2 段矮墙；全实例化；门口两翼）— */
  const sandbags = createSandbagWalls(assets, 'wasteland/sandbags', [
    { x: -2.9, z: 4.55, rotY: 0.42 },
    { x: 3.1, z: 4.75, rotY: -0.38 },
  ]);
  sandbags.group.name = 'wasteland/sandbags';
  group.add(sandbags.group);
  const sandbagSnow = new THREE.Mesh(
    assets.geometry('wasteland/snow-sandbags', () => {
      const a = new THREE.BoxGeometry(2.69, 0.05, 0.66).rotateY(0.42).translate(-2.9, 0.92, 4.55);
      const b = new THREE.BoxGeometry(2.69, 0.05, 0.66).rotateY(-0.38).translate(3.1, 0.92, 4.75);
      const merged = mergeGeometries([a, b]);
      if (!merged) throw new Error('[wasteland] 沙袋顶雪壳合并失败');
      return merged;
    }),
    snowShellMaterial,
  );
  sandbagSnow.name = 'wasteland/snow-sandbags';
  sandbagSnow.userData.noOutline = true;
  sandbagSnow.visible = false;
  group.add(sandbagSnow);
  surfaces.push({ material: sandbags.material, kind: 'roofTop', snowShell: sandbagSnow });

  /* — ⑥ 废旧汽车残骸+轮胎堆（无乘员/骸骨——一·6；缺 1 轮；轮胎 ×5 金字塔）— */
  const wreck = createWreck(assets, 'wasteland/wreck');
  wreck.group.name = 'wasteland/wreck';
  wreck.group.position.set(6.15, 0, 2.1);
  wreck.group.rotation.y = 0.55;
  group.add(wreck.group);
  const tires = createTirePyramid(assets, 'wasteland/tire-pyramid', wreck.tireMaterial);
  tires.group.name = 'wasteland/tire-pyramid';
  tires.group.position.set(7.3, 0, 0.4);
  tires.group.rotation.y = 0.3;
  group.add(tires.group);
  // 残骸顶雪壳（roofTop——五-5「残骸顶」）
  const wreckSnow = new THREE.Mesh(
    assets.geometry('wasteland/snow-wreck', () => {
      const roof = new THREE.BoxGeometry(1.7, 0.04, 1.66).rotateY(0.55).translate(6.15, wreck.roofY + 0.04, 2.1);
      const hood = new THREE.BoxGeometry(1.0, 0.04, 1.6).rotateY(0.55).translate(6.72, 0.9, 2.36);
      const merged = mergeGeometries([roof, hood]);
      if (!merged) throw new Error('[wasteland] 残骸顶雪壳合并失败');
      return merged;
    }),
    snowShellMaterial,
  );
  wreckSnow.name = 'wasteland/snow-wreck';
  wreckSnow.userData.noOutline = true;
  wreckSnow.visible = false;
  group.add(wreckSnow);
  surfaces.push({ material: wreck.material, kind: 'roofTop', snowShell: wreckSnow });
  // 轮胎堆顶（同 tireMaterial 面）
  const tireSnow = new THREE.Mesh(
    assets.geometry('wasteland/snow-tires', () => new THREE.CylinderGeometry(0.52, 0.56, 0.05, 10).translate(7.3, tires.topY + 0.03, 0.4)),
    snowShellMaterial,
  );
  tireSnow.name = 'wasteland/snow-tires';
  tireSnow.userData.noOutline = true;
  tireSnow.visible = false;
  group.add(tireSnow);
  surfaces.push({ material: wreck.tireMaterial, kind: 'roofTop', snowShell: tireSnow });

  /* — ⑦ 油桶+手写警示牌（立3倒1；白底红字手写；无骷髅——一·5；板微歪 4°）— */
  const barrelSign = createBarrelSign(assets, 'wasteland/barrel-sign');
  barrelSign.group.name = 'wasteland/barrel-sign';
  barrelSign.group.position.set(-5.7, 0, 3.35);
  barrelSign.group.rotation.y = 0.6;
  group.add(barrelSign.group);

  /* — ⑧ 净水装置+发电机（滤瓶 blink 2.4s 青 + 蒸汽 EmitterSpec steam 常转 base 1.5/s）— */
  const purifier = createPurifierGenerator(assets, 'wasteland/purifier', CHANNELS.cyanGlow);
  purifier.group.name = 'wasteland/purifier';
  purifier.group.position.set(-2.35, 0, -2.75);
  purifier.group.rotation.y = 0.5;
  group.add(purifier.group);
  const ledLamp: LampHandle = {
    emissiveMat: purifier.ledMaterial,
    halo: purifier.ledHalo,
    mode: 'blink', // docs/05 §7.1.4：blink 2.4s（青 cyanGlow，2.3.3「冷色荧光」小面积点缀）
    params: { period: 2.4, duty: 0.5 },
    castReflection: true, // M4：近地强灯雨天反光（每场景 ≤6）
  };
  lamps.push(ledLamp);
  lampRefs.led = ledLamp;

  /* — ⑨ 太阳能板阵列 ×4（倾角 28°，实例化，板面 roofTop）— */
  const solar = createSolarArray(assets, 'wasteland/solar');
  solar.group.name = 'wasteland/solar';
  solar.group.position.set(-4.7, 0, -4.6);
  solar.group.rotation.y = 0.12;
  group.add(solar.group);
  const solarSnow = new THREE.Mesh(
    assets.geometry('wasteland/snow-solar', () => {
      const tilt = (28 * Math.PI) / 180;
      const parts: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 4; i++) {
        // 与板同倾角薄壳，随阵列组旋转（挂 solar.group 内，局部坐标=板位）
        const quad = new THREE.BoxGeometry(1.04, 0.04, 0.7);
        quad.rotateX(-tilt);
        quad.translate(-1.65 + i * 1.1, 0.5 + 0.045, -0.02);
        parts.push(quad);
      }
      const merged = mergeGeometries(parts);
      if (!merged) throw new Error('[wasteland] 太阳能板雪壳合并失败');
      return merged;
    }),
    snowShellMaterial,
  );
  solarSnow.rotation.y = 0.12; // 随阵列组同向（挂场景层，位置/yaw 对齐阵列组）
  solarSnow.position.set(-4.7, 0, -4.6);
  solarSnow.name = 'wasteland/snow-solar';
  solarSnow.userData.noOutline = true;
  solarSnow.visible = false;
  group.add(solarSnow);
  surfaces.push({ material: solar.panelMaterial, kind: 'roofTop', snowShell: solarSnow });

  /* — ⑩ 旋转雷达天线（Lathe 抛物面+背筋+馈源；LampHandle blink 1.2s；named radar）— */
  const radar = createRadarDish(assets, 'wasteland/radar');
  radar.group.name = 'wasteland/radar';
  radar.group.position.set(6.9, 0, -5.7);
  radar.group.rotation.y = -0.5;
  group.add(radar.group);
  propsRef.radarRotor = radar.rotor;
  const antennaLamp: LampHandle = {
    emissiveMat: radar.indicatorMaterial,
    halo: radar.indicatorHalo,
    mode: 'blink', // 7-3-③：blink 1.2s duty 0.5，红点+微 halo
    params: { period: 1.2, duty: 0.5 },
  };
  lamps.push(antennaLamp);
  lampRefs.antenna = antennaLamp;
  propsRef.antennaLamp = antennaLamp;
  propsRef.ledLamp = ledLamp;

  /* — ⑪ 油桶改造烧烤架火堆（campfire 变体；火光点光 P3 归点光池，场景交 emberPower）— */
  const grill = createBarrelGrill(assets, 'wasteland/grill');
  grill.group.name = 'wasteland/grill';
  grill.group.position.set(2.35, 0, 2.45);
  grill.group.rotation.y = -0.35;
  group.add(grill.group);
  propsRef.coalMaterial = grill.coalMaterial;

  /* — ⑫ 晾衣绳工装 ×3（ClothHandle ×3，stiffness 0.45 / windFactor 1.0 / sagAmp 0.02）— */
  const clothesline = createClothesline(assets, 'wasteland/clothesline', 3.4);
  clothesline.group.name = 'wasteland/clothesline';
  clothesline.group.position.set(-5.9, 0, 0.35);
  clothesline.group.rotation.y = 0.2;
  group.add(clothesline.group);
  for (const cloth of clothesline.cloths) cloths.push(cloth);

  // 工装露水 sparkle（J5 清晨「工装露水」——dawn 出现白天淡出；1 DC）
  const dewTexture = makeHaloTexture(assets, 'wasteland/tex/dew-halo');
  const dewSparkleMaterial = new THREE.MeshBasicMaterial({
    color: '#e8f4ff',
    map: dewTexture,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  });
  dewSparkleMaterial.name = 'wasteland/dew-sparkles';
  const dewSparkles = new THREE.InstancedMesh(
    assets.geometry('wasteland/dew-sparkle', () => new THREE.PlaneGeometry(0.07, 0.07)),
    dewSparkleMaterial,
    30,
  );
  dewSparkles.name = 'wasteland/dew-sparkles';
  dewSparkles.count = 30;
  dewSparkles.frustumCulled = false;
  dewSparkles.renderOrder = 20;
  dewSparkles.userData.noOutline = true;
  const dewObj = new THREE.Object3D();
  const cosL = Math.cos(0.2);
  const sinL = Math.sin(0.2);
  for (let i = 0; i < 30; i++) {
    const lx = -1.5 + rng.next() * 3.0;
    const lz = (rng.next() - 0.5) * 0.9;
    // 绳局部系（绳沿局部 x）→ 世界系（绳组位 (−5.9,0.35) rotY 0.2 同变换）
    dewObj.position.set(-5.9 + lx * cosL + lz * sinL, 1.15 + rng.next() * 0.45, 0.35 - lx * sinL + lz * cosL);
    dewObj.rotation.set(-Math.PI / 2 + 0.2, 0, rng.next() * Math.PI);
    dewObj.scale.setScalar(0.6 + rng.next() * 0.8);
    dewObj.updateMatrix();
    dewSparkles.setMatrixAt(i, dewObj.matrix);
  }
  dewSparkles.instanceMatrix.needsUpdate = true;
  group.add(dewSparkles);
  propsRef.dewSparkleMaterial = dewSparkleMaterial;

  /* — 板条箱 + 早餐餐具（J5 清晨「餐具（板条箱面）」——仅 dawn 出现，§4.3.3-③/D5 离散切换）— */
  const crate = new THREE.Mesh(
    assets.geometry('wasteland/crate', () => {
      const parts: THREE.BufferGeometry[] = [];
      const box = roundedBox({ width: 0.72, height: 0.56, depth: 0.72, radius: 0.015 });
      box.translate(0, 0.28, 0);
      parts.push(hardenEdges(box));
      for (const oy of [0.1, 0.46]) {
        const slat = roundedBox({ width: 0.74, height: 0.07, depth: 0.015, radius: 0.004 });
        slat.translate(0, oy, 0.365);
        parts.push(hardenEdges(slat));
        const slatBack = slat.clone();
        slatBack.translate(0, 0, -0.73);
        parts.push(hardenEdges(slatBack));
      }
      const merged = mergeGeometries(parts);
      if (!merged) throw new Error('[wasteland] 板条箱合并失败');
      return merged;
    }),
    toonMaterials.get('wood', { color: '#8a6f4d', name: 'wasteland/crate' }),
  );
  crate.name = 'wasteland/crate';
  crate.position.set(0.5, 0, 2.9);
  crate.rotation.y = 0.35;
  crate.castShadow = true;
  group.add(crate);
  const tablewareSet = buildCampTableware(assets);
  tablewareSet.name = 'wasteland/tableware';
  tablewareSet.position.set(0.5, 0.56, 2.9);
  tablewareSet.rotation.y = 0.35;
  tablewareSet.visible = false;
  group.add(tablewareSet);
  propsRef.tablewareSet = tablewareSet;
  propsRef.tablewareFadeMats = collectMeshMaterials(tablewareSet);

  /* — ⑬ 高架桥+城市剪影（剪影板归 BaseAssembler silhouette='bridge+skyline'；窗灯 shopPower×0.6 抽样）— */
  const cityWindows = createCityWindows(assets, 'wasteland/city-windows', -9.16);
  cityWindows.group.name = 'wasteland/city-windows';
  group.add(cityWindows.group);
  propsRef.cityWindows = cityWindows;
  // 初态=黄昏档（首帧 applyLighting(blend=1) 前的占位；抽样 20%）
  cityWindows.setFraction(WINDOW_FRACS.dusk ?? 0.2);
  cityWindows.material.opacity = 0.21;

  /* — 警示红灯（7-3-②：罩体装掩体顶前角；rotate 0.4rev/s 双叶对置 + halo）— */
  buildWarningBeacon(assets, group, lamps);

  /* — 探照灯 LampHandle（rotate 'sweep'；亮度/周期/摆幅由 lightHooks 场景映射，B2 时序）— */
  const searchlightLamp: LampHandle = {
    emissiveMat: tower.lensMaterial,
    halo: tower.halo,
    mode: 'rotate', // 7-3-①：rotate sweep（B2 dawn 6s/55°→dusk 10s/45°→night 14s/40°）
    params: { pattern: 'sweep', period: SWEEP_DUSK.period, sweepRad: SWEEP_DUSK.sweepRad },
  };
  lamps.push(searchlightLamp);
  propsRef.searchlightLamp = searchlightLamp;
  lampRefs.searchlight = searchlightLamp;

  /* — 发射器 ×4（docs/05 §7.1.3 定值表；rate 逐帧调制归 Director/T33 emitterHandles——场景无 setRate 通路，
       锚点=campAnchor（director.ts:669），发射区只能以营位中心近似，见 openIssues）— */
  // ⑧ 发电机蒸汽：7-3-④ 常转 base 1.5/s + smokePower 增密（B6；白天 2.6/s=2.2×1.0+0.4 归 Director 公式）
  emitters.push({
    kind: 'steam',
    area: new THREE.Vector3(2.2, 1.4, 2.2),
    rate: 1.5,
    lifetime: 3.5,
    size0: 0.05,
    size1: 0.25,
    vel0: new THREE.Vector3(0.02, 0.22, 0.01),
    color: '#e8e4dc',
    opacity: 0.34,
    additive: false,
  });
  // ⑤ 火堆火星：7.1.3 spark 行 rate=6×emberPower（白天火熄无火星——B8）
  emitters.push({
    kind: 'spark',
    area: new THREE.Vector3(1.0, 0.6, 1.0),
    rate: 6,
    lifetime: 1.4,
    size0: 0.02,
    size1: 0.0,
    vel0: new THREE.Vector3(0, 0.5, 0),
    color: '#ffb26e',
    opacity: 0.9,
    additive: true,
  });
  // ⑦ 光柱微尘：7.1.3 dust 行 rate 6（仅 beam>0.3；7-3-⑦ rate=beamPower×2/s 归 T33 逐帧调制）
  emitters.push({
    kind: 'dust',
    area: new THREE.Vector3(5.6, 2.8, 5.6),
    rate: 6,
    lifetime: 6,
    size0: 0.012,
    size1: 0.012,
    vel0: new THREE.Vector3(0.03, 0.02, -0.03),
    color: '#d8e2ea',
    opacity: 0.35,
    additive: true,
  });
  // 檐口滴水（天气作用面「檐口滴水 drip ×2」——rate 0 基值待 T33 天气门控，同 T18 占位口径）
  emitters.push({
    kind: 'drip',
    area: new THREE.Vector3(2.2, 0.15, 0.3),
    rate: 0,
    lifetime: 0.8,
    size0: 0.015,
    size1: 0.015,
    vel0: new THREE.Vector3(0, -3, 0),
    color: '#b8d4e8',
    opacity: 0.5,
    additive: false,
  });

  return {
    group,
    named: { searchlightYoke: tower.yoke, radar: radar.rotor },
    cloths,
    lamps,
    emitters,
    weatherSurfaces: surfaces,
  };
}

/* ============================== 警示红灯（7-3-②） ============================== */

/**
 * 警示红灯：掩体顶前角。罩体（座+罩）+ 红光双叶对置（additive，物理旋转归场景 update——
 * 与 Breath 'rev' 同式 angle=speed×elapsed）+ LampHandle（rotate rev 0.4rev/s；罩内灯珠 emissive）。
 */
function buildWarningBeacon(assets: SceneBuildContext['assets'], group: THREE.Group, lamps: LampHandle[]): void {
  const beacon = new THREE.Group();
  beacon.name = 'wasteland/warn-beacon';
  beacon.position.set(-1.55, 0, -8.3); // 掩体顶左前角（掩体顶 y≈2.2）
  const housingMaterial = toonMaterials.get('metal', { color: '#4a4a50', name: 'wasteland/warn-housing' });
  const housing = new THREE.Mesh(
    assets.geometry('wasteland/warn-housing', () => {
      const parts: THREE.BufferGeometry[] = [];
      const base = new THREE.CylinderGeometry(0.11, 0.13, 0.08, 10);
      base.translate(0, 0.04, 0);
      parts.push(hardenEdges(base));
      const dome = new THREE.CylinderGeometry(0.1, 0.11, 0.2, 10, 1, true);
      dome.translate(0, 0.18, 0);
      parts.push(hardenEdges(dome)); // hardenEdges 与 base 同为非索引后合并（否则 mergeGeometries 返回 null）
      const merged = mergeGeometries(parts);
      if (!merged) throw new Error('[wasteland] 警示灯罩合并失败');
      return merged;
    }),
    housingMaterial,
  );
  housing.name = 'wasteland/warn-housing';
  housing.castShadow = true;
  beacon.add(housing);
  // 罩内灯珠（LampHandle.emissiveMat——rotate 模式亮度恒定，功率场景映射）
  const bulbMaterial = toonMaterials.getToon('matteProp', {
    color: '#4a3230',
    emissive: CHANNELS.beaconRed,
    emissiveIntensity: 1.4,
    name: 'wasteland/warn-bulb',
  });
  const bulb = new THREE.Mesh(
    assets.geometry('wasteland/warn-bulb', () => new THREE.SphereGeometry(0.075, 8, 6)),
    bulbMaterial,
  );
  bulb.name = 'wasteland/warn-bulb';
  bulb.position.y = 0.18;
  beacon.add(bulb);
  // 红光双叶对置（additive；物理旋转归场景 update）
  const leafMaterial = new THREE.MeshBasicMaterial({
    color: CHANNELS.beaconRed,
    map: makeHaloTexture(assets, 'wasteland/tex/warn-leaf'),
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  });
  leafMaterial.name = 'wasteland/warn-leaves';
  const leafGroup = new THREE.Group();
  leafGroup.name = 'wasteland/warn-leaves';
  leafGroup.position.y = 0.18;
  const leafGeometry = assets.geometry('wasteland/warn-leaf', () => new THREE.PlaneGeometry(0.42, 0.2));
  for (const dir of [1, -1]) {
    const leaf = new THREE.Mesh(leafGeometry, leafMaterial);
    leaf.name = `wasteland/warn-leaf-${dir}`;
    leaf.position.x = (dir * 0.42) / 2;
    leaf.userData.noOutline = true;
    leaf.renderOrder = 20;
    leafGroup.add(leaf);
  }
  beacon.add(leafGroup);
  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      color: CHANNELS.beaconRed,
      map: makeHaloTexture(assets, 'wasteland/tex/warn-halo'),
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  halo.name = 'wasteland/warn-halo';
  halo.scale.setScalar(0.5);
  halo.position.y = 0.2;
  halo.renderOrder = 20;
  beacon.add(halo);
  beacon.position.y = 2.2; // 掩体顶面（body 2.1 + 斜板）
  group.add(beacon);
  propsRef.warnLeafGroup = leafGroup;
  propsRef.warnLeafMaterial = leafMaterial;
  propsRef.warnBulbMaterial = bulbMaterial;
  const warnLamp: LampHandle = {
    emissiveMat: bulbMaterial,
    halo,
    mode: 'rotate', // 7-3-②：rotate 0.4rev/s（双叶对置）+罩体 blink
    params: { pattern: 'rev', speed: 0.4 * Math.PI * 2 },
    castReflection: true, // M4：近地强灯雨天反光（湿地拉出红色反光——五-3）
  };
  lamps.push(warnLamp);
  lampRefs.warn = warnLamp;
}

/* ============================== 早餐餐具（J4/J5；Lathe 盘/杯/壶，docs/05 §4.3.3-③） ============================== */

function buildCampTableware(assets: SceneBuildContext['assets']): THREE.Group {
  const group = new THREE.Group();
  group.name = 'wasteland/tableware-inner';
  const uniqueMat = (color: string, name: string): THREE.MeshToonMaterial =>
    toonMaterials.getToon('matteProp', { color, opacity: 0.999, name }); // opacity<1 → transparent 开（0.2s 淡变）
  const plateMat = uniqueMat('#d8d2c4', 'wasteland/tableware-plate');
  const cupMat = uniqueMat('#6a7a88', 'wasteland/tableware-cup');
  const potMat = uniqueMat('#8a6f4d', 'wasteland/tableware-pot');
  const plateGeometry = assets.geometry('wasteland/tableware-plate', () =>
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
    [-0.22, 0.1],
    [0.12, 0.16],
  ] as const) {
    const plate = new THREE.Mesh(plateGeometry, plateMat);
    plate.name = 'wasteland/tableware-plate';
    plate.position.set(px, 0, pz);
    group.add(plate);
  }
  const cupGeometry = assets.geometry('wasteland/tableware-cup', () =>
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
  const cup = new THREE.Mesh(cupGeometry, cupMat);
  cup.name = 'wasteland/tableware-cup';
  cup.position.set(0.02, 0.01, -0.14);
  group.add(cup);
  const potGeometry = assets.geometry('wasteland/tableware-pot', () =>
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
  pot.name = 'wasteland/tableware-pot';
  pot.position.set(0.26, 0, -0.06);
  group.add(pot);
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

/* ============================== ③ createAnimations（7.2.3-① 探照灯云台） ============================== */

/**
 * 探照灯云台（7-3-①：rotate sweep + 地面光斑 sprite 沿轨迹同步 + 光柱可见度）。
 * 角度式与 LightBreath 'sweep' 同式（sweepRad×sin(2π·elapsed/period)）保证 halo/云台同相；
 * 周期/摆幅由 lightHooks 按 B2 时序写入 lamp.params（lightBreath.ts 注记「dusk 10s/45°、
 * night 14s/40° 由场景 lightHooks 调制」）。
 */
function createSearchlightAnimation(state: WastelandState): SceneAnimation {
  let elapsedLocal = 0;
  return {
    update(dt: number): void {
      elapsedLocal += dt;
      const yoke = propsRef.yoke;
      const beamMaterial = propsRef.beamMaterial;
      const spot = propsRef.groundSpot;
      if (!yoke || !beamMaterial || !spot) return;
      const phase = state.sweep;
      const angle = phase.sweepRad * Math.sin((elapsedLocal * Math.PI * 2) / phase.period);
      const baseYaw = yoke.userData.baseYaw as number;
      yoke.rotation.y = baseYaw + angle;
      const glow = WEATHER_GLOW[state.weather] ?? 0;
      const opacity = clamp(state.beam * 0.85 * (1 + 0.6 * glow), 0, 1); // 五-4 光束锥 α×(1+0.6×glow)
      beamMaterial.opacity = opacity;
      beamMaterial.visible = opacity >= 0.02;
      const spotMaterial = spot.material as THREE.MeshBasicMaterial;
      spotMaterial.opacity = state.beam * 0.5 * (1 + 0.4 * glow); // 地面光斑沿轨迹同步
      spot.visible = spotMaterial.opacity >= 0.02;
    },
    dispose(): void {
      /* 云台/光束/光斑归场景卸载统一释放 */
    },
  };
}

function createAnimations(_runtime: SceneRuntime): readonly SceneAnimation[] {
  return [createSearchlightAnimation(sceneState)];
}

/* ============================== ④ palette（2.3.3） ============================== */

const palette: ScenePalette = {
  colorChannels: CHANNELS,
  baseStyle: {
    topTheme: 'crackedConcrete', // 裂纹混凝土（§4.1.0 差异表）
    edgeMatId: 'concreteRough', // 混凝土毛面
    rimDecal: 'hazardStripes', // 黄黑警示斜纹（四角）
    skirtLayers: 0,
    silhouette: 'bridge+skyline', // 高架桥+城市剪影（J7）
  },
  baseFog: 0.14,
};

/* ============================== ⑤ lightHooks（J5/B2 时序逐行实现） ============================== */

/** 模块级运行态（Director 单场景装配；初值=黄昏档，首帧 applyLighting(blend=1) 对位，§4.3.5）。 */
const sceneState: WastelandState = {
  time: 'dusk',
  weather: 'clear',
  lampPower: 1.0,
  emberPower: 1.0,
  smokePower: 0.35,
  shopPower: 0.65,
  beam: 0.8,
  beamFrom: 0.8,
  beamTo: 0.8,
  warn: 0.7,
  warnFrom: 0.7,
  warnTo: 0.7,
  antenna: 1.0,
  antennaFrom: 1.0,
  antennaTo: 1.0,
  led: 0.4,
  ledFrom: 0.4,
  ledTo: 0.4,
  windowOpacity: 0.21,
  sweep: SWEEP_DUSK,
  dew: 0,
  dewTo: 0,
  tablewareVisible: false,
  tablewareFaded: true,
  tablewareFade: 0,
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
    sceneState.shopPower = state.shopPower;

    // —— 连续量：beam/warn/antenna/led 随 blend 全程插值；窗灯 opacity=shopPower×0.6 实时随通道（§4.3.1）——
    const phase = SWEEP_PHASES[state.time] ?? SWEEP_DUSK;
    const beamTarget = phase.power;
    const warnTarget = WARN_TARGETS[state.time] ?? 0;
    const antennaTarget = ANTENNA_TARGETS[state.time] ?? 0;
    const ledTarget = LED_TARGETS[state.time] ?? 0;
    if (sceneState.lastKey !== state.time) {
      // 换档：快照当前插值中间态为新 from（§4.3.5「中途改档不跳变」同口径）
      sceneState.beamFrom = sceneState.beam;
      sceneState.warnFrom = sceneState.warn;
      sceneState.antennaFrom = sceneState.antenna;
      sceneState.ledFrom = sceneState.led;
      sceneState.beamTo = beamTarget;
      sceneState.warnTo = warnTarget;
      sceneState.antennaTo = antennaTarget;
      sceneState.ledTo = ledTarget;
      sceneState.sweep = phase; // B2 扫速/摆幅随档切换（云台与 Breath params 同步，见下）
      sceneState.pendingKey = state.time;
      sceneState.lastKey = state.time;
    }
    const b = clamp(blend, 0, 1);
    const eased = b * b * (3 - 2 * b);
    sceneState.beam = THREE.MathUtils.lerp(sceneState.beamFrom, sceneState.beamTo, eased);
    sceneState.warn = THREE.MathUtils.lerp(sceneState.warnFrom, sceneState.warnTo, eased);
    sceneState.antenna = THREE.MathUtils.lerp(sceneState.antennaFrom, sceneState.antennaTo, eased);
    sceneState.led = THREE.MathUtils.lerp(sceneState.ledFrom, sceneState.ledTo, eased);
    // ⑬★统一：窗灯功率=shopPower×0.6——shopPower 由过渡器逐帧插值，直接实时映射
    sceneState.windowOpacity = 0.55 * state.shopPower * 0.6;

    // —— B2 扫速/摆幅写入 lamp.params（lightBreath.ts 注记「dusk 10s/45°、night 14s/40° 由场景
    //     lightHooks 调制」——本场景 authored params 对象，逐帧被 Breath 读取）——
    const searchlightParams = lampRefs.searchlight?.params as { period?: number; sweepRad?: number } | undefined;
    if (searchlightParams) {
      const blendPhase = SWEEP_PHASES[sceneState.lastKey ?? state.time] ?? SWEEP_DUSK;
      // 过渡期间目标档参数直写（角度式连续 sin，切档相位连续性由 sin 共享 elapsed 保证）
      searchlightParams.period = blendPhase.period;
      searchlightParams.sweepRad = blendPhase.sweepRad;
    }

    // —— 离散量（blend≥0.5 切换 + 0.2s 淡变，D5）：窗灯抽样比例（20%/35%）+ 早餐餐具（仅 dawn）——
    if (sceneState.pendingKey !== null && b >= 0.5) {
      const windows = propsRef.cityWindows;
      windows?.setFraction(WINDOW_FRACS[sceneState.pendingKey] ?? 0);
      const targetVisible = sceneState.pendingKey === 'dawn';
      if (targetVisible && !sceneState.tablewareVisible) {
        sceneState.tablewareVisible = true;
        sceneState.tablewareFaded = false;
      } else if (!targetVisible && sceneState.tablewareVisible) {
        sceneState.tablewareFaded = true; // update 内 0.2s 淡出后隐藏
      }
      sceneState.pendingKey = null;
    }
    sceneState.dewTo = state.time === 'dawn' ? 1 : 0;

    // —— 场景映射灯功率（实现侧 setLampPower 结构化可选口：探照灯/警示红灯/天线灯/净水 LED
    //     四灯全部走场景映射——J5 档位定值 ≠ lampPower 通道值，见各 *_TARGETS 表）——
    const breath = runtimeBreath as BreathSceneExt | null;
    if (breath?.setLampPower) {
      const searchlight = lampRefs.searchlight;
      if (searchlight) breath.setLampPower(searchlight, sceneState.beam);
      const warn = lampRefs.warn;
      if (warn) breath.setLampPower(warn, sceneState.warn);
      const antenna = lampRefs.antenna;
      if (antenna) breath.setLampPower(antenna, sceneState.antenna);
      const led = lampRefs.led;
      if (led) breath.setLampPower(led, sceneState.led);
    }
  },

  /** 每帧细粒度驱动（雷达旋转/警示红灯双叶/ember 闪烁/窗灯 opacity/露水/餐具淡变）。 */
  update(dt: number, elapsed: number): void {
    // —— ⑩ 雷达天线匀速旋转（2.3.2-⑩「旋转雷达」；速率自定 0.35rad/s——原文未定值，见 openIssues）——
    const rotor = propsRef.radarRotor;
    if (rotor) rotor.rotation.y += dt * 0.35;

    // —— ② 警示红灯双叶物理旋转（与 Breath 'rev' 同式 angle=speed×elapsed，7.1.4）——
    const leafGroup = propsRef.warnLeafGroup;
    const leafMaterial = propsRef.warnLeafMaterial;
    if (leafGroup && leafMaterial) {
      leafGroup.rotation.y = 0.4 * Math.PI * 2 * elapsed;
      const warn = lampRefs.warn;
      const output =
        (runtimeBreath as BreathSceneExt | null)?.getLampOutput?.(warn as LampHandle) ?? sceneState.warn; // 双叶透明度随灯输出
      leafMaterial.opacity = 0.75 * output;
      leafMaterial.visible = leafMaterial.opacity >= 0.02;
    }

    // —— 灯功率自驱降级路径（实现侧无 setLampPower 时：四灯按插值态直写 emissiveIntensity）——
    const breath = runtimeBreath as BreathSceneExt | null;
    if (!breath?.setLampPower) {
      const lensMat = lampRefs.searchlight?.emissiveMat;
      if (lensMat) {
        lensMat.emissiveIntensity = 1.6 * sceneState.beam;
        lensMat.visible = lensMat.emissiveIntensity >= 0.02;
      }
      const bulbMat = propsRef.warnBulbMaterial;
      if (bulbMat) {
        bulbMat.emissiveIntensity = 1.4 * sceneState.warn;
        bulbMat.visible = bulbMat.emissiveIntensity >= 0.02;
      }
      const antennaMat = lampRefs.antenna?.emissiveMat;
      if (antennaMat) {
        antennaMat.emissiveIntensity = 1.5 * sceneState.antenna;
        antennaMat.visible = antennaMat.emissiveIntensity >= 0.02;
      }
      const ledMat = lampRefs.led?.emissiveMat;
      if (ledMat) {
        ledMat.emissiveIntensity = 1.4 * sceneState.led;
        ledMat.visible = ledMat.emissiveIntensity >= 0.02;
      }
    }

    // —— 炭火余烬（docs/05 §4.3.3-②：emissive × emberPower 噪声闪烁；白天火熄 B8）——
    const coalMat = propsRef.coalMaterial;
    if (coalMat) {
      const flicker = 0.72 + 0.18 * Math.sin(7.3 * elapsed) + 0.1 * Math.sin(3.1 * elapsed + 1.7);
      coalMat.emissiveIntensity = 1.7 * sceneState.emberPower * flicker;
      coalMat.visible = coalMat.emissiveIntensity >= 0.02;
    }

    // —— 城市窗灯 opacity（连续插值；抽样比例由 applyLighting 离散切换）——
    const windows = propsRef.cityWindows;
    if (windows) {
      const glow = WEATHER_GLOW[sceneState.weather] ?? 0;
      windows.material.opacity = clamp(sceneState.windowOpacity * (1 + 0.3 * glow), 0, 1);
      windows.material.visible = windows.material.opacity >= 0.02;
    }

    // —— 露水（dawn=1 → 白天晒干淡出，§4.3.3-④；工装 sparkle 层随 dew 起伏）——
    const k = 1 - Math.exp(-dt / 0.6);
    sceneState.dew += (sceneState.dewTo - sceneState.dew) * k;
    const sparkleMat = propsRef.dewSparkleMaterial;
    if (sparkleMat) {
      const twinkle = 0.55 + 0.45 * Math.sin(1.3 * elapsed);
      sparkleMat.opacity = 0.55 * sceneState.dew * twinkle;
      sparkleMat.visible = sparkleMat.opacity >= 0.02;
    }

    // —— 早餐餐具 0.2s 淡入淡出（切换用 opacity 渐变不用 scale 弹跳，§4.3.1）——
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

/** 末日避难所营地（id/label = 'wasteland'/'末日避难所'，§4.1.3 模块卡）。 */
export const wastelandScene: SceneModule = {
  id: 'wasteland',
  label: '末日避难所',
  buildTerrain,
  buildProps,
  createAnimations(runtime: SceneRuntime): readonly SceneAnimation[] {
    runtimeBreath = runtime.breath; // 结构化可选口（getLampOutput/setLampPower）在 lightHooks 中按需取用
    return createAnimations(runtime);
  },
  palette,
  lightHooks,
};
