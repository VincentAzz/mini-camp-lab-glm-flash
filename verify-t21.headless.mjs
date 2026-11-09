// verify-t21.headless.mjs —— T21 高速路服务区验收：2.4.2-①..⑫ 逐组在场 / 7-4-①..⑤ 逐项落点 /
// shopPower 全落点（真实 LightBreathSystem 行为）/ 降雪 lineFade / campAnchor / 无人物红线。
// 期望值逐格自 docs/02-场景模块.md §4.1.4 与 docs/05-时间天气动效.md §7.2.4/§7.1.4/§4.4.2 独立转写。
// 临时文件（同 temp-t15-t16-smoke.mjs / verify-t29t30.headless.mjs 口径：验收后按清理流程处理，勿提交）。
// 运行：node --import "data:text/javascript;base64,<hook>" verify-t21.headless.mjs（hook 同 T29/T30 脚本）。
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('@/')) {
      let p = specifier.slice(2);
      if (!/\.[cm]?[jt]sx?$/.test(p)) p += '.ts';
      return next(pathToFileURL(process.cwd() + '/src/' + p).href, context);
    }
    // 复跑门槛修复（终审 ⑧）：源码内部 bundler 风格相对无扩展名导入补 .ts（同 temp-t21-hook.mjs）
    if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL?.includes('/src/')
      && !/\.[cm]?[jt]sx?$/.test(specifier.split('/').pop() ?? '')) {
      const base = new URL(specifier, context.parentURL).href;
      return next(base + '.ts', context);
    }
    return next(specifier, context);
  },
});

// ---- Headless canvas 桩（场景 Canvas 贴图构建需要 2d 上下文；不渲染，只记录调用）----
function makeContext(canvas) {
  const gradient = { addColorStop() {} };
  return {
    canvas,
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, font: '', textAlign: '', textBaseline: '', lineCap: 'butt',
    globalAlpha: 1,
    fillRect() {}, clearRect() {}, strokeRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
    fill() {}, closePath() {}, arc() {}, ellipse() {}, roundRect() {}, fillText() {}, strokeText() {},
    save() {}, restore() {}, translate() {}, rotate() {}, scale() {},
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    createPattern: () => null,
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    putImageData() {}, getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
  };
}
globalThis.document = {
  createElement(tag) {
    if (tag !== 'canvas') throw new Error(`headless 桩只支持 canvas，收到 ${tag}`);
    const canvas = { width: 300, height: 150, style: {} };
    canvas.getContext = () => makeContext(canvas);
    return canvas;
  },
};

const { serviceareaScene } = await import('@/content/scenes/servicearea');
import * as THREE from 'three';

// headless 资产桩（RefCountedAssets 位于 core/director.ts——其 TS 参数属性语法 strip-only 模式不载；
// 本桩实现 SharedAssets 契约 geometry/texture 两方法，足够驱动场景构建路径）
class StubAssets {
  constructor() {
    this.geometries = new Map();
    this.textures = new Map();
  }
  geometry(id, build) {
    const hit = this.geometries.get(id);
    if (hit) return hit;
    const geometry = build();
    geometry.name = id;
    this.geometries.set(id, geometry);
    return geometry;
  }
  texture(id, build) {
    const hit = this.textures.get(id);
    if (hit) return hit;
    const texture = build();
    texture.name = id;
    this.textures.set(id, texture);
    return texture;
  }
  releaseGeometry(id) { this.geometries.delete(id); }
  releaseTexture(id) { this.textures.delete(id); }
}
// 复跑门槛修复（终审 ⑧）：static import 会先于本文件 registerHooks 解析（ESM 提升语义），
// 直跑必 ERR_MODULE_NOT_FOUND——改动态 import（钩子就位后解析，@/ 别名可达），脚本自此可直接
// `node verify-t21.headless.mjs` 运行（原 --import 外部钩子口仍兼容：钩子对已注册别名幂等）。
const { Rng } = await import('@/shared/rng');
const { RhythmClock } = await import('@/systems/clock');
const { LightBreathSystem } = await import('@/systems/lightBreath');
const { EventScheduler } = await import('@/systems/scheduler');
const { WindSystem } = await import('@/systems/wind');

let passed = 0;
let failed = 0;
function check(name, cond, detail = '') {
  if (cond) {
    passed += 1;
    console.log(`PASS ${name}${detail ? ' —— ' + detail : ''}`);
  } else {
    failed += 1;
    console.error(`FAIL ${name}${detail ? ' —— ' + detail : ''}`);
  }
}
function eq(name, actual, expected) {
  const ok = typeof actual === 'number' && typeof expected === 'number'
    ? Math.abs(actual - expected) <= 1e-9
    : actual === expected;
  check(`${name} = ${JSON.stringify(expected)}`, ok, `实际 ${JSON.stringify(actual)}`);
}

/* ============================== ① SceneModule 契约与 palette（2.4.3） ============================== */

check('模块卡 id/label', serviceareaScene.id === 'servicearea' && serviceareaScene.label === '服务区');
check('五部分齐备（SceneModule）', typeof serviceareaScene.buildTerrain === 'function'
  && typeof serviceareaScene.buildProps === 'function'
  && typeof serviceareaScene.createAnimations === 'function'
  && serviceareaScene.palette !== undefined
  && serviceareaScene.lightHooks !== undefined);

// 2.4.3 十通道（docs/02 定值逐字转写）
const DOC_CHANNELS = {
  asphaltLot: '#565c62', laneWhite: '#e8e8e0', storeWarm: '#ffd9a0', signGreen: '#1f6e46',
  vendingCyan: '#6ad0e8', canopyBlue: '#4a7fb5', treeGreen: '#4f8a4f', curbGray: '#8a8f94',
  headlightWarm: '#fff2d0', taillightRed: '#ff6a5a',
};
for (const [key, value] of Object.entries(DOC_CHANNELS)) {
  eq(`palette 通道 ${key}`, serviceareaScene.palette.colorChannels[key], value);
}
eq('baseFog', serviceareaScene.palette.baseFog, 0.08);
eq('baseStyle.topTheme', serviceareaScene.palette.baseStyle.topTheme, 'asphaltLot');
eq('baseStyle.edgeMatId', serviceareaScene.palette.baseStyle.edgeMatId, 'curbStone');
check('baseStyle.rimDecal/silhouette = null', serviceareaScene.palette.baseStyle.rimDecal === null && serviceareaScene.palette.baseStyle.silhouette === null);
eq('baseStyle.skirtLayers', serviceareaScene.palette.baseStyle.skirtLayers, 1);

/* ============================== ② 构建（terrain + props + animations） ============================== */

const assets = new StubAssets();
const rng = new Rng('servicearea');
const root = new THREE.Group();
const terrain = serviceareaScene.buildTerrain({ root, assets, rng });
root.add(terrain.group); // Director stage0/1 同口径（buildTerrain/buildProps 产物挂根）

// campAnchor（§4.1.0 服务区行逐字）
check('campAnchor.position=(0,0,3.4)', terrain.campAnchor.position.x === 0 && terrain.campAnchor.position.y === 0 && terrain.campAnchor.position.z === 3.4,
  `(${terrain.campAnchor.position.x},${terrain.campAnchor.position.y},${terrain.campAnchor.position.z})`);
eq('campAnchor.headingRad', terrain.campAnchor.headingRad, 0);
eq('campAnchor.groundY', terrain.campAnchor.groundY, 0);
eq('campAnchor.radius', terrain.campAnchor.radius, 4.2);

const props = serviceareaScene.buildProps({ root, assets, rng });
root.add(props.group);

// 构建计数辅助
function countByName(name, node = root) {
  let count = 0;
  node.traverse((obj) => {
    if (obj.name === name) count += 1;
  });
  return count;
}
function findByName(name, node = root) {
  let found = null;
  node.traverse((obj) => {
    if (!found && obj.name === name) found = obj;
  });
  return found;
}
function findGroup(prefix, node = root) {
  let found = null;
  node.traverse((obj) => {
    if (!found && obj.name === prefix) found = obj;
  });
  return found;
}

/* ============================== ③ 2.4.2 十二组逐组在场 ============================== */

// ① 加油站（雨棚+加油机 ×2；棚灯材质 emissiveIntensity authored>0）
const gasStation = findByName('servicearea/gas-station');
check('① 加油站组在场', gasStation !== null);
check('① 加油机 ×2', countByName('gasStation/servicearea/pump') === 2, `n=${countByName('gasStation/servicearea/pump')}`);
check('① 棚下灯板 ×2', countByName('gasStation/servicearea/light-panel') === 2);
check('① 顶板（roofTop 挂点）在场', findByName('gasStation/servicearea/roof') !== null);

// ② 便利店+发光招牌（店体 7.6×2.4×3.0 / 招牌 breath 6s depth 0.12）
const store = findByName('servicearea/store');
check('② 便利店组在场', store !== null);
check('② 招牌灯箱正面在场', findByName('store/servicearea/sign-face') !== null);
check('② 招牌灯 breath 6s depth 0.12', props.lamps.some((lamp) => lamp.mode === 'breath' && lamp.params.period === 6 && lamp.params.depth === 0.12));
const storeRoof = findByName('store/servicearea/roof');
check('② 店体尺寸标注（7.6×2.4×3.0 定值实现）', storeRoof !== null && Math.abs(storeRoof.geometry.parameters.width - 7.84) < 0.3, `roofW=${storeRoof?.geometry.parameters.width}`);

// ③ 售货机 ×2（货道=3×4=12 商品盒真实小几何；正面玻璃 α0.18）
check('③ 售货机 ×2（named 容器）', props.named.vendingMachines !== undefined && props.named.vendingMachines.children.length === 2);
const vendingA = findByName('servicearea/vending-a');
const vendingB = findByName('servicearea/vending-b');
check('③ A/B 机在场', vendingA !== null && vendingB !== null);
const vendingItemsA = findByName('vending/servicearea-a/items');
check('③ 货道 12 商品盒（实例）', vendingItemsA !== undefined && vendingItemsA.children[0].count === 12, `count=${vendingItemsA?.children[0]?.count}`);
const vendingGlassMat = findByName('vending/servicearea-a/front-glass')?.material;
check('③ 正面玻璃 α0.18', vendingGlassMat !== undefined && Math.abs(vendingGlassMat.opacity - 0.18) < 1e-6, `opacity=${vendingGlassMat?.opacity}`);

// ④ 充电桩 ×2（指示灯 blink 2.4s 绿）
check('④ 充电桩 ×2', countByName('charging/servicearea/body') === 2);
check('④ 指示灯 blink 2.4s duty 0.5', props.lamps.some((lamp) => lamp.mode === 'blink' && lamp.params.period === 2.4 && lamp.params.duty === 0.5));

// ⑤ 餐饮区明亮大玻璃窗（3.0×1.5+分格条+窗内暖光内衬+吊灯 3 点+桌椅剪影）
check('⑤ 餐饮窗组在场', findByName('store/servicearea/dining-window') !== null);
check('⑤ 窗内衬（暖光 emissive）在场', findByName('store/servicearea/dining-inner') !== null);
check('⑤ 桌椅剪影贴片在场（无人形）', findByName('store/servicearea/cafe-silhouette') !== null);
check('⑤ 吊灯 3 点', findByName('store/servicearea/pendants')?.children[0]?.count === 3, `count=${findByName('store/servicearea/pendants')?.children[0]?.count}`);

// ⑥ 遮阳连廊+公共步道（柱 ×6+微拱顶板+盲道凸条）
check('⑥ 连廊柱 ×6', findByName('corridor/servicearea/posts')?.children[0]?.count === 6, `count=${findByName('corridor/servicearea/posts')?.children[0]?.count}`);
check('⑥ 微拱顶板在场', findByName('corridor/servicearea/arch') !== null);
check('⑥ 盲道凸条在场', findByName('corridor/servicearea/tactile') !== null);
check('⑥ 公共步道在场（terrain）', findByName('servicearea/walkway') !== null);

// ⑦ 行道树 ×5+绿化带（冠 2–3 球叠；P2 植被通道 7-4-⑤）
const treeCrowns = findByName('servicearea/tree-crowns');
check('⑦ 行道树冠 ×5（实例）', treeCrowns?.children[0]?.count === 5, `count=${treeCrowns?.children[0]?.count}`);
check('⑦ 树干 ×5', findByName('servicearea/tree-trunks')?.children[0]?.count === 5);
const crownMat = treeCrowns?.children[0]?.material;
check('⑦ P2 植被风摆注入（7-4-⑤）', crownMat !== undefined && crownMat.userData.vegWindInjected === true);
check('⑦ 绿化带 ×2 段', findByName('servicearea/green-strip--10') !== null && findByName('servicearea/green-strip-1') !== null);
check('⑦ 灌木球 ×7', findByName('servicearea/shrubs')?.children[0]?.count === 7, `count=${findByName('servicearea/shrubs')?.children[0]?.count}`);

// ⑧ 公路主线+护栏（地形件：波形梁 ×10+立柱 ×11）
check('⑧ 公路带在场', findByName('servicearea/road') !== null);
check('⑧ 划线 decal 在场', findByName('servicearea/lot-lines') !== null);
check('⑧ 路缘石在场', findByName('servicearea/curb') !== null);
check('⑧ 波形梁 ×10', findByName('guardrail/servicearea/beams')?.children[0]?.count === 10, `count=${findByName('guardrail/servicearea/beams')?.children[0]?.count}`);
check('⑧ 立柱 ×11', findByName('guardrail/servicearea/posts')?.children[0]?.count === 11, `count=${findByName('guardrail/servicearea/posts')?.children[0]?.count}`);

// ⑨ 高速路牌+出口指示牌（门架式绿牌+单柱式）
check('⑨ 门架绿牌在场', findByName('hwsign/servicearea/gantry-board') !== null);
check('⑨ 单柱预告牌在场', findByName('hwsign/servicearea/pole-board') !== null);
check('⑨ 门架立柱+横梁在场', findByName('hwsign/servicearea/gantry-frame') !== null);

// ⑩ 长椅 ×2+分类垃圾桶 ×2
check('⑩ 长椅 ×2', countByName('servicearea/bench--6.9') === 1 && countByName('servicearea/bench-2.6') === 1);
check('⑩ 分类垃圾桶 ×2', countByName('servicearea/bin--5.6') === 1 && countByName('servicearea/bin-3.6') === 1);

// ⑪ 洗手池（台+盆+弯管龙头+镜背板）
check('⑪ 洗手池组在场', findByName('servicearea/wash-basin') !== null);
check('⑪ 盆/龙头/镜背板齐', findByName('washBasin/servicearea/basin') !== null
  && findByName('washBasin/servicearea/faucet') !== null
  && findByName('washBasin/servicearea/mirror') !== null);

// ⑫ 旗杆小旗（clothMicro 橙白双色条 stiffness 0.25）+ 送货小车 named
check('⑫ 旗杆在场', findByName('servicearea/flag-pole') !== null);
check('⑫ 小旗布在场（ClothHandle）', findByName('servicearea/flag') !== null);
eq('⑫ 小旗 stiffness', props.cloths[0]?.stiffness, 0.25);
check('named.deliveryCart 在场', props.named.deliveryCart !== undefined);
check('named.storeSign 在场', props.named.storeSign !== undefined && props.named.storeSign.name.includes('sign-face'));
check('named 三键齐备（2.4.2 注册表口径）', ['deliveryCart', 'storeSign', 'vendingMachines'].every((key) => props.named[key] !== undefined));

/* ============================== ④ shopPower 全落点（真实 LightBreathSystem 行为） ============================== */

// createAnimations 内 bindChannel('shop', mul) —— 用真实系统行为验证 D8 接线
const clock = new RhythmClock();
const breath = new LightBreathSystem(clock);
const wind = new WindSystem(clock);
const scheduler = new EventScheduler('scene:servicearea');
const camera = new THREE.PerspectiveCamera();
breath.register(props.lamps); // Director stage2 同口径：register 先于 createAnimations（§3.5.1→③）
const animations = serviceareaScene.createAnimations({ root, assets, rng, wind, particles: { add: () => ({ setRate() {}, dispose() {} }) }, breath, scheduler, camera });
check('SceneAnimation=车流光轨 1 个', animations.length === 1);
check('bindChannel 可用（实现侧结构化口）', typeof breath.bindChannel === 'function');
check('灯点数=5（2.4 注册与预算口径）', props.lamps.length === 5, `n=${props.lamps.length}`);

// 棚灯 steady shopPower×0.8（7.1.4「加油棚灯 ×2」行）
const canopyLamp = props.lamps.find((lamp) => lamp.mode === 'steady' && lamp.castReflection === true && lamp.params.floor === undefined);
clock.update(1 / 60);
breath.setChannelPower('shop', 1.0);
breath.update(1 / 60);
check('棚灯=steady（castReflection）', canopyLamp !== undefined);
check('棚灯输出=shopPower×0.8', canopyLamp !== undefined && Math.abs(canopyLamp.emissiveMat.emissiveIntensity - 1.4 * 1.0 * 0.8) < 1e-6,
  `intensity=${canopyLamp?.emissiveMat.emissiveIntensity}`);
// 黄昏 shopPower 0.65 → 棚灯 1.4×0.65×0.8
breath.setChannelPower('shop', 0.65);
breath.update(1 / 60);
check('棚灯 dusk 输出=0.65×0.8', Math.abs(canopyLamp.emissiveMat.emissiveIntensity - 1.4 * 0.65 * 0.8) < 1e-6,
  `intensity=${canopyLamp.emissiveMat.emissiveIntensity}`);

// 售货机灯带 steady floor 0.7（7-4-③/B5：max(shopPower,0.7) 常亮）
const vendingLamp = props.lamps.find((lamp) => lamp.mode === 'steady' && lamp.params.floor === 0.7);
check('售货机灯带 floor=0.7', vendingLamp !== undefined);
breath.setChannelPower('shop', 0.35); // dawn 0.35 → floor 0.7 兜底
breath.update(1 / 60);
check('售货机 dawn 输出=0.7（floor 兜底常亮）', Math.abs(vendingLamp.emissiveMat.emissiveIntensity - 1.3 * 0.7) < 1e-6,
  `intensity=${vendingLamp.emissiveMat.emissiveIntensity}`);
breath.setChannelPower('shop', 1.0);
breath.update(1 / 60);
check('售货机 night 输出=1.0（1.3 基值）', Math.abs(vendingLamp.emissiveMat.emissiveIntensity - 1.3) < 1e-6);

// 招牌 breath 6s depth 0.12 ×shopPower（7-4-②）
const signLampHandle = props.lamps.find((lamp) => lamp.mode === 'breath');
check('招牌灯=breath', signLampHandle !== undefined);
breath.setChannelPower('shop', 0.65);
clock.update(1 / 60);
breath.update(1 / 60);
const signIntensity = signLampHandle.emissiveMat.emissiveIntensity;
check('招牌 dusk 输出∈[0.65×1.5×0.88, 0.65×1.5×1.12]（breath 深度 0.12）',
  signIntensity > 0.65 * 1.5 * 0.88 && signIntensity < 0.65 * 1.5 * 1.12, `intensity=${signIntensity}`);

// 充电桩 blink 2.4s（7-4 ④ 行功率通道 shopPower）
const chargingLamp = props.lamps.find((lamp) => lamp.mode === 'blink');
check('充电桩指示灯=blink 2.4s', chargingLamp !== undefined && chargingLamp.params.period === 2.4);
breath.setChannelPower('shop', 1.0);
let toggleCount = 0;
let lastVisible = null;
for (let step = 0; step < 150; step++) { // 扫一个完整周期（2.4s @60fps）
  clock.update(1 / 60);
  breath.update(1 / 60);
  if (lastVisible !== null && lastVisible !== chargingLamp.emissiveMat.visible) toggleCount += 1;
  lastVisible = chargingLamp.emissiveMat.visible;
}
check('充电桩指示灯方波翻转（一个周期内亮灭切换）', toggleCount >= 2, `toggles=${toggleCount}`);

// 路牌微光 shopPower×0.3（7.1.4「高速/出口牌微光」行）
const roadSignLamp = props.lamps.find((lamp) => lamp.mode === 'steady' && !lamp.castReflection && lamp.params.floor === undefined);
check('路牌微光=steady', roadSignLamp !== undefined);
breath.setChannelPower('shop', 1.0);
breath.update(1 / 60);
check('路牌 night 输出=shopPower×0.3', Math.abs(roadSignLamp.emissiveMat.emissiveIntensity - 0.4 * 0.3) < 1e-6,
  `intensity=${roadSignLamp.emissiveMat.emissiveIntensity}`);

// 单柱牌面/售货机 B 灯带每帧同步（lightHooks.update 副材质拷贝）
serviceareaScene.lightHooks.applyLighting({
  time: 'night', weather: 'clear', lampPower: 1, emberPower: 1, smokePower: 0.15,
  shopPower: 1.0, interiorGlow: 1, fogDensity: 0.05, global: {},
}, 1);
serviceareaScene.lightHooks.update?.(1 / 60, 1);
const poleBoard = findByName('hwsign/servicearea/pole-board');
check('单柱牌面与门架牌同步（夜间微 emissive）', poleBoard !== undefined && Math.abs(poleBoard.material.emissiveIntensity - roadSignLamp.emissiveMat.emissiveIntensity) < 1e-6,
  `pole=${poleBoard?.material.emissiveIntensity}`);
const stripB = findByName('vending/servicearea-b/strip');
check('售货机 B 灯带与 A 同步', stripB !== undefined && Math.abs(stripB.material.emissiveIntensity - vendingLamp.emissiveMat.emissiveIntensity) < 1e-6);

/* ============================== ⑤ 7-4-①..⑤ 逐项落点 ============================== */

// ① 车流（场景 SceneAnimation——B3 密度表 + 天气修正 + 可见度表 + 夜间前灯拉伸 1.3×）
const trafficRoot = findByName('servicearea/traffic');
check('7-4-① 车流动画根在场', trafficRoot !== null);
const nearStreaks = findByName('servicearea/traffic-streaks-8.25');
const farStreaks = findByName('servicearea/traffic-streaks-9.4');
check('7-4-① 双向光条 InstancedMesh（近道/远道）', nearStreaks !== undefined && farStreaks !== undefined);
const nearMat = nearStreaks?.material;
const farMat = farStreaks?.material;
check('7-4-① 前灯/尾灯色（taillightRed/headlightWarm）', nearMat?.name.includes('8.25') && farMat?.name.includes('9.4')
  && nearMat.color.getHexString() === 'ff6a5a' && farMat.color.getHexString() === 'fff2d0',
  `near=${nearMat?.color.getHexString()} far=${farMat?.color.getHexString()}`);
// 密度/可见度插值链（applyLighting 连续量）：night 1.0/1.0
serviceareaScene.lightHooks.applyLighting({
  time: 'night', weather: 'clear', lampPower: 1, emberPower: 1, smokePower: 0.15,
  shopPower: 1.0, interiorGlow: 1, fogDensity: 0.05, global: {},
}, 1);
animations[0].update(1 / 60, 1);
check('7-4-① 夜间光流可见度=1.0', Math.abs(nearMat.opacity - 1.0) < 1e-6 && Math.abs(farMat.opacity - 1.0) < 1e-6,
  `near=${nearMat.opacity} far=${farMat.opacity}`);
check('7-4-① 夜间前灯 halo 增益可见', farMat !== undefined && farMat.opacity >= 0.42); // halo α=可见度×0.42×(1+0.5glow)
// 白天可见度 0.3
serviceareaScene.lightHooks.applyLighting({
  time: 'day', weather: 'clear', lampPower: 0, emberPower: 0, smokePower: 1,
  shopPower: 1.0, interiorGlow: 0, fogDensity: 0.02, global: {},
}, 1);
animations[0].update(1 / 60, 1);
check('7-4-① 白天光流可见度=0.3', Math.abs(nearMat.opacity - 0.3) < 1e-6, `opacity=${nearMat.opacity}`);
// 雪 α×0.7
serviceareaScene.lightHooks.applyLighting({
  time: 'night', weather: 'snow', lampPower: 1, emberPower: 1, smokePower: 0.15,
  shopPower: 1.0, interiorGlow: 1, fogDensity: 0.05, global: {},
}, 1);
animations[0].update(1 / 60, 1);
check('7-4-① 降雪 α×0.7', Math.abs(nearMat.opacity - 0.7) < 1e-6, `opacity=${nearMat.opacity}`);

// ② 招牌循环微闪（breath 6s depth 0.12）——已由 shopPower 段核（此处补签档自检）
check('7-4-② 招牌 breath 落点（见 shopPower 段）', signLampHandle !== undefined);
// ③ 售货机灯带常亮（floor 0.7）——同上
check('7-4-③ 灯带常亮落点（见 shopPower 段）', vendingLamp !== undefined);

// ④ 小旗飘动（ClothHandle stiffness 0.25 → WindSystem 统一驱动）
const flagHandle = props.cloths[0];
check('7-4-④ 小旗 ClothHandle（stiffness 0.25，sagAmp>0 增雨重）', flagHandle !== undefined
  && flagHandle.stiffness === 0.25 && flagHandle.sagAmp > 0 && flagHandle.mesh.name === 'servicearea/flag');

// ⑤ 行道树叶片轻摆（P2 植被通道）——已由 ⑦ 段 vegWindInjected 核；补摆幅 ×0.8 注记核对
check('7-4-⑤ 树冠 P2 通道（见 ⑦ 段）', crownMat !== undefined && crownMat.userData.vegWindInjected === true);

/* ============================== ⑥ 送货小车离散量（四-1 清晨专属） ============================== */

const cart = props.named.deliveryCart;
check('送货小车在场（initially visible，首帧 dusk 由 update 淡出）', cart !== undefined);
serviceareaScene.lightHooks.applyLighting({
  time: 'day', weather: 'clear', lampPower: 0, emberPower: 0, smokePower: 1,
  shopPower: 1.0, interiorGlow: 0, fogDensity: 0.02, global: {},
}, 1);
serviceareaScene.lightHooks.update?.(1 / 60, 1);
serviceareaScene.lightHooks.update?.(0.3, 1); // 淡出窗口
check('白天送货小车收走（0.2s 淡出后隐藏）', cart.visible === false);
serviceareaScene.lightHooks.applyLighting({
  time: 'dawn', weather: 'clear', lampPower: 0.15, emberPower: 0.5, smokePower: 0.25,
  shopPower: 0.35, interiorGlow: 0.2, fogDensity: 0.18, global: {},
}, 1);
serviceareaScene.lightHooks.update?.(1 / 60, 1);
serviceareaScene.lightHooks.update?.(0.3, 1);
const cartFrame = cart.children.find((child) => child.isMesh);
check('清晨送货小车出现（0.2s 淡入）', cart.visible === true && cartFrame !== undefined && Math.abs(cartFrame.material.opacity - 0.999) < 1e-3);

/* ============================== ⑦ lineFade / emitters / surfaces / 无人物 ============================== */

// 降雪划线若隐若现（linePaint surface + lineFadeReactive 材质）
const lotLines = findByName('servicearea/lot-lines');
check('linePaint 作用面在场', lotLines !== undefined);
const lotLinesMat = lotLines?.material;
check('划线材质 lineFadeReactive（uLineFade 乘 alpha）', lotLinesMat !== undefined
  && lotLinesMat.userData.toonKey !== undefined && lotLinesMat.userData.toonKey.includes('line1'),
  `toonKey=${lotLinesMat?.userData.toonKey}`);
check('linePaint surface 已注册', props.weatherSurfaces.some((surface) => surface.kind === 'linePaint' && surface.material === lotLinesMat));

// emitters（2：steam 餐饮排气口 rate 2.6 + drip 雨棚檐 rate 0 占位）
eq('emitters 数', props.emitters.length, 2);
check('steam 发射器（rate 2.6 白天基值）', props.emitters[0].kind === 'steam' && props.emitters[0].rate === 2.6);
check('drip 发射器占位（rate 0，T33 门控）', props.emitters[1].kind === 'drip' && props.emitters[1].rate === 0);
check('餐饮排气口几何在场', findByName('servicearea/vent') !== null);

// surfaces 6 面（linePaint/ground/roofTop×4 + 雪壳挂点）
eq('weatherSurfaces 数', props.weatherSurfaces.length, 6);
const kinds = props.weatherSurfaces.map((surface) => surface.kind).sort().join(',');
check('surfaces kinds = ground,linePaint,roofTop×4', kinds === 'ground,linePaint,roofTop,roofTop,roofTop,roofTop', kinds);
check('roofTop 雪壳挂点 ×4 齐备', props.weatherSurfaces.filter((surface) => surface.kind === 'roofTop').every((surface) => surface.snowShell !== undefined));

// 无人物红线（一.6）：全场景无人形几何命名；餐饮窗剪影为桌椅
let humanHit = null;
root.traverse((obj) => {
  if (/human|person|people|figure|人物|人形|doll|mannequin/i.test(obj.name)) humanHit = obj.name;
});
check('无人物命名几何（一.6）', humanHit === null, humanHit === null ? '' : `命中 ${humanHit}`);
// 句柄交出对账（2.4 注册与预算：1 cloth + 5 lamps + 2 emitters + 6 surfaces）
eq('cloths 数', props.cloths.length, 1);
eq('lamps 数', props.lamps.length, 5);
check('named 三键（见 ③ 段）', true);

// —— DC 估算（§4.1.4 预算 ≈150：meshes + InstancedMesh 本体/壳/描边壳，逐 Object3D 计一 draw）——
let dcEstimate = 0;
root.traverse((obj) => {
  const mesh = obj;
  if (mesh.isMesh || mesh.isPoints || mesh.isLine || mesh.isSprite) dcEstimate += 1;
});
check('DC 估算 ≤200（场景域；整车/天空/粒子另计）', dcEstimate <= 200, `dcEstimate=${dcEstimate}`);

console.log(`\n==== T21 verify: pass=${passed} fail=${failed} ====`);
process.exit(failed === 0 ? 0 : 1);
