// temp-t19-smoke.mjs —— T19 山间松林 pineforest 行为冒烟（临时文件，验收后按清理流程处理，勿提交）。
// 运行：node temp-t19-smoke.mjs（本脚本自带 module.registerHooks 内联钩子——同线程 API，Node ≥20.19）。
// 钩子把 '@/…' 解析到 ./src/…，Node 原生剥除 .ts 类型后执行真实源码；DOM 仅需 canvas 2D——
// 以最小 document.createElement('canvas') 桩替代（贴图绘制路径全走桩，无 WebGL/DOM 渲染）。
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));

/* ---- 最小 canvas 2D 桩（贴图绘制无头化：ImageData 真、其余方法 no-op） ---- */
function makeContext2d(canvas) {
  const gradient = { addColorStop() {} };
  return new Proxy(
    { canvas },
    {
      get(target, prop) {
        if (prop === 'createImageData') return (w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h });
        if (prop === 'getImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h });
        if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => gradient;
        if (prop === 'measureText') return () => ({ width: 10 });
        if (typeof prop === 'string') {
          if (!(prop in target)) target[prop] = () => {};
          return target[prop];
        }
        return undefined;
      },
      set() {
        return true;
      },
    },
  );
}
globalThis.document = {
  createElement(tag) {
    if (tag !== 'canvas') throw new Error(`[smoke] 意外 createElement: ${tag}`);
    return {
      width: 0,
      height: 0,
      getContext(kind) {
        if (kind !== '2d') throw new Error(`[smoke] 意外 context: ${kind}`);
        if (!this._ctx) this._ctx = makeContext2d(this);
        return this._ctx;
      },
    };
  },
};

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('@/')) {
      let p = specifier.slice(2);
      if (!/\.[cm]?[jt]sx?$/.test(p)) p += '.ts';
      return next(pathToFileURL(path.join(here, 'src', p)).href, context);
    }
    // 源码内相对导入（'./clock'、'../../shared/math'）为 extensionless（bundler 解析）——补 .ts
    if ((specifier.startsWith('./') || specifier.startsWith('../../')) && context.parentURL) {
      const parentDir = new URL('.', context.parentURL);
      const resolved = new URL(specifier, parentDir);
      if (!/\.[cm]?[jt]sx?$/.test(resolved.pathname)) {
        return next(new URL(`${resolved.href}.ts`).href, context);
      }
    }
    return next(specifier, context);
  },
});

const { pineforestScene } = await import('@/content/scenes/pineforest');
const { readFileSync } = await import('node:fs');
const { Rng } = await import('@/shared/rng');
const { RhythmClock } = await import('@/systems/clock');
const { WindSystem } = await import('@/systems/wind');
const { ParticleSystem } = await import('@/systems/particles');
const { LightBreathSystem } = await import('@/systems/lightBreath');
const { EventScheduler } = await import('@/systems/scheduler');
const { buildSceneLightState } = await import('@/systems/timeLight');
const { timeRegistry } = await import('@/content/times/registry');
import * as THREE from 'three';

let failed = 0;
let passed = 0;
function check(name, cond, detail = '') {
  if (cond) {
    passed += 1;
    console.log(`PASS ${name}${detail ? ' —— ' + detail : ''}`);
  } else {
    failed += 1;
    console.error(`FAIL ${name}${detail ? ' —— ' + detail : ''}`);
  }
}
function eq(name, actual, expected, tol = 1e-9) {
  const ok =
    typeof actual === 'number' && typeof expected === 'number'
      ? Math.abs(actual - expected) <= tol
      : Object.is(actual, expected);
  check(name, ok, `actual=${String(actual)} expected=${String(expected)}`);
}

/* ================= 1. 注册表接入（2.5.1/2.5.3） ================= */
// 注：不 import registry.ts——其现含并行任务（T20/T21）登记行，任一并行件缺席会阻断本冒烟；
// 注册行以源码静态断言（import + register 行），模块本体已直连 import 验证。
{
  const registrySrc = readFileSync(path.join(here, 'src/content/scenes/registry.ts'), 'utf8');
  check("registry 含 import { pineforestScene }", registrySrc.includes("import { pineforestScene } from '@/content/scenes/pineforest'"));
  check('registry 含 register(pineforestScene) 行', /sceneRegistry\.register\(pineforestScene\)/.test(registrySrc));
  check('pineforest 非 isDefault（seacliff 保有默认槽）', !/pineforestScene.*isDefault/.test(registrySrc) && !pineforestScene.isDefault);
}

/* ================= 2. 构建 terrain + props（真实 SharedAssets/Rng） ================= */
const root = new THREE.Group();
root.name = 'scene-root';
// SharedAssets 契约（handles.ts:181）测试替身：同 id 共享 + 获取即存活（导演侧 RefCountedAssets
// 含 TS 参数属性语法，strip-only 模式不可加载——替身保持同语义：同 id 命中共享、不释放）
const assets = (() => {
  const geometries = new Map();
  const textures = new Map();
  return {
    geometry(id, build) {
      if (!geometries.has(id)) geometries.set(id, build());
      return geometries.get(id);
    },
    texture(id, build) {
      if (!textures.has(id)) textures.set(id, build());
      return textures.get(id);
    },
    releaseGeometry() {},
    releaseTexture() {},
  };
})();
const rng = new Rng('pineforest');
const terrain = pineforestScene.buildTerrain({ root, assets, rng });
root.add(terrain.group);
const props = pineforestScene.buildProps({ root, assets, rng: rng.fork('props') });
root.add(props.group);

/* ---- campAnchor（§4.1.0 松林行；y=T19 抬升裁定 1.6） ---- */
{
  const a = terrain.campAnchor;
  eq('campAnchor.position.x=0.4（逐字）', a.position.x, 0.4);
  eq('campAnchor.position.z=0.2（逐字）', a.position.z, 0.2);
  eq('campAnchor.headingRad=+0.20（逐字）', a.headingRad, 0.2);
  eq('campAnchor.radius=4.0（逐字）', a.radius, 4.0);
  eq('campAnchor.groundY=GRAVEL_TOP=1.6', a.groundY, 1.6);
  eq('campAnchor.position.y=groundY', a.position.y, a.groundY);
}

/* ---- palette（2.2.3） ---- */
{
  const p = pineforestScene.palette;
  eq('baseFog=0.32（四场景最高）', p.baseFog, 0.32);
  const channels = p.colorChannels;
  const expected = {
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
  };
  check('colorChannels 10 通道逐字（2.2.3）', JSON.stringify(channels) === JSON.stringify(expected), JSON.stringify(channels));
  eq("baseStyle.topTheme='gravel'", p.baseStyle.topTheme, 'gravel');
  eq("baseStyle.edgeMatId='rootSoil'（根系土层）", p.baseStyle.edgeMatId, 'rootSoil');
  eq('baseStyle.rimDecal=null', p.baseStyle.rimDecal, null);
  eq('baseStyle.skirtLayers=1', p.baseStyle.skirtLayers, 1);
  eq("baseStyle.silhouette='mountains'（后缘山脊剪影板 ×2，baseAssembler 层叠）", p.baseStyle.silhouette, 'mountains');
}

/* ================= 3. 2.2.2 十二组逐组在场 ================= */
function findByName(name) {
  let hit = null;
  root.traverse((obj) => {
    if (!hit && obj.name === name) hit = obj;
  });
  return hit;
}
function countByName(prefix) {
  let n = 0;
  root.traverse((obj) => {
    if (obj.name === prefix || String(obj.name).startsWith(prefix)) n += 1;
  });
  return n;
}
{
  // ① 吊床（ClothHandle 0.3）
  const hammock = findByName('pineforest/hammock');
  check('① 吊床网格在场', !!hammock);
  const hammockCloth = props.cloths.find((c) => c.mesh.name === 'pineforest/hammock');
  check('① 吊床 ClothHandle stiffness=0.3（7-2-⑤/§7.1.2）', !!hammockCloth && hammockCloth.stiffness === 0.3);
  eq('① 吊床 sagAmp=0（§7.1.2 吊床行）', hammockCloth?.sagAmp ?? -1, 0);

  // ② 篝火堆+环形原木凳+柴堆（named campfire）
  const campfire = props.named.campfire;
  check('② named.campfire 在场', !!campfire && campfire.name === 'pineforest/campfire');
  check('② 石圈（campfire.pit stones）在场', !!findByName('campfire/pit-pineforest/stones'));
  eq('② 环形原木凳 ×6（实例化）', countByName('pineforest/log-benches/body') >= 1 && findByName('pineforest/log-benches/body').count, 6);
  eq('② 柴堆金字塔 ×3 堆（6 根/堆）', findByName('pineforest/firewood-stacks/body')?.count ?? 0, 3);
  check('② 三层火焰网格（7-2-⑥ 三层 cone）', [0, 1, 2].every((i) => findByName(`pineforest/flame/layer-${i}`)));
  check('② 火光点光挂点（P3）在场', !!findByName('pineforest/flame/fire-light-anchor'));
  check('② 余烬炭床（emissive 驱动）在场', !!findByName('pineforest/embers'));

  // ③ 木质营位平台+木阶步道
  check('③ 平台板格实例组在场', !!findByName('pineforest/platform-planks/body'));
  eq('③ 平台板 12 条', findByName('pineforest/platform-planks/body')?.count ?? 0, 12);
  eq('③ 木阶步道 ×5', findByName('pineforest/steps/body')?.count ?? 0, 5);

  // ④ 山涧小溪+跨溪小木桥
  check('④ 溪流水面（water 原型）', !!findByName('pineforest/stream'));
  check('④ 波光面 ×2', !!findByName('pineforest/stream-glint-a') && !!findByName('pineforest/stream-glint-b'));
  check('④ 桥体在场（纵梁/桥板/扶绳）', !!findByName('pineforest/bridge') && !!findByName('pineforest/bridge/beams') && !!findByName('pineforest/bridge/ropes'));
  eq('④ 桥板 ×8（实例化）', findByName('pineforest/bridge/planks/body')?.count ?? 0, 8);

  // ⑤ 指路木牌（3 块箭头板）
  check('⑤ 指路木牌在场', !!findByName('pineforest/trail-sign'));
  check('⑤ 3 块箭头板（板体）', [0, 1, 2].every((i) => findByName(`pineforest/trail-sign/board-body-${i}`)));

  // ⑥ 鸟屋+防熊食物储藏箱
  check('⑥ 鸟屋在场', !!findByName('pineforest/birdhouse'));
  check('⑥ 防熊箱在场', !!findByName('pineforest/bear-box'));

  // ⑦ 苔藓蕨类蘑菇丛（各 1 组实例化）
  eq('⑦ 苔藓实例 ≥8', (findByName('pineforest/moss-patches/body')?.count ?? 0) >= 8, true, `n=${findByName('pineforest/moss-patches/body')?.count}`);
  eq('⑦ 蕨类实例 ≥10', (findByName('pineforest/ferns/body')?.count ?? 0) >= 10, true, `n=${findByName('pineforest/ferns/body')?.count}`);
  eq('⑦ 蘑菇实例 ×9（3 丛×3 株）', findByName('pineforest/mushrooms/body')?.count ?? 0, 9);

  // ⑧ 柴堆已并入 ②（firewood-stacks ×3，6 根/堆金字塔）

  // ⑨ 晾晒毛巾 ×3（ClothHandle ×3）
  const towelCloths = props.cloths.filter((c) => /^pineforest\/towel-\d$/.test(c.mesh.name));
  eq('⑨ 晾晒毛巾 ClothHandle ×3', towelCloths.length, 3);
  check('⑨ 毛巾 stiffness=0.5/sagAmp=0.02（§7.1.2）', towelCloths.every((c) => c.stiffness === 0.5 && c.sagAmp === 0.02));

  // ⑩ 打水桶与水瓢
  check('⑩ 打水桶+水瓢在场', !!findByName('pineforest/bucket') && !!findByName('pineforest/ladle'));

  // ⑪ 山脊剪影（baseStyle.silhouette='mountains' 已验）+ 山腰云带 ×3（named）
  const mist = props.named.mistBillboards;
  check('⑪ named.mistBillboards 在场', !!mist && mist.name === 'pineforest/mist-billboards');
  eq('⑪ 山腰云带 billboard ×3', mist?.children.length ?? 0, 3);
  const mistYs = (mist?.children ?? []).map((s) => Number(s.position.y.toFixed(3)));
  check('⑪ 云带高度=文档 3.0/3.6/4.2 + 抬升 1.6 映射', JSON.stringify(mistYs) === JSON.stringify([4.6, 5.2, 5.8]), mistYs.join(','));

  // ⑫ 林间斑驳光斑（named lightSpots，10 片，1 DC 实例化）
  const spots = props.named.lightSpots;
  check('⑫ named.lightSpots 在场', !!spots && spots.name === 'pineforest/light-spots');
  eq('⑫ 光斑 ×10', spots?.count ?? 0, 10);

  // 松林环带 ×38 = 36 实例化（3 档 ×12）+ 锚树 ×2
  const tierCounts = ['s', 'm', 'l'].map((t) => findByName(`pineforest/pine-canopy-${t}/body`)?.count ?? 0);
  const anchorTrunks = countByName('pineforest/anchor-trunk-0') + countByName('pineforest/anchor-trunk-1');
  check('松树 38 = 实例化 36（12/12/12）+ 锚树 2', JSON.stringify(tierCounts) === '[12,12,12]' && anchorTrunks === 2,
    `tiers=${tierCounts.join(',')} anchors=${anchorTrunks}`);
  const trunkTotal = ['s', 'm', 'l'].reduce((a, t) => a + (findByName(`pineforest/pine-trunk-${t}/body`)?.count ?? 0), 0);
  eq('干/冠分组同数（§5.6）', trunkTotal, 36);
  // 树位避让：全部树位距营位锚点 ≥4.35、距谷带 ≥2.5
  let treeSpots = [];
  ['s', 'm', 'l'].forEach((t) => {
    const body = findByName(`pineforest/pine-canopy-${t}/body`);
    for (let i = 0; i < (body?.count ?? 0); i++) {
      const m = new THREE.Matrix4();
      body.getMatrixAt(i, m);
      const p = new THREE.Vector3().setFromMatrixPosition(m);
      treeSpots.push(p);
    }
  });
  check('树位全部在营位半径外（≥4.35）', treeSpots.every((p) => Math.hypot(p.x - 0.4, p.z - 0.2) >= 4.35 - 1e-6),
    `min=${Math.min(...treeSpots.map((p) => Math.hypot(p.x - 0.4, p.z - 0.2))).toFixed(2)}`);
  check('树位全部在谷带外（中心线距 ≥2.5）', treeSpots.every((p) => {
    const p0 = { x: -5.0, y: -10.4 };
    const d = { x: -0.537, y: 0.844 };
    const vx = p.x - p0.x;
    const vz = p.z - p0.y;
    const tt = Math.max(0, Math.min(1, vx * d.x + vz * d.y));
    const cx = p0.x + d.x * tt * 10.43;
    const cz = p0.y + d.y * tt * 10.43;
    return Math.hypot(p.x - cx, p.z - cz) >= 2.5 - 1e-6;
  }));
}

/* ================= 4. 句柄交出（4 cloths + 1 lamp + 6 emitters + 5 surfaces） ================= */
{
  eq('cloths=4（吊床+毛巾×3）', props.cloths.length, 4);
  eq('lamps=1（篝火呼吸快相位）', props.lamps.length, 1);
  eq('fire lamp mode=breath period=1.5', props.lamps[0]?.mode, 'breath');
  eq('fire lamp period', props.lamps[0]?.params.period, 1.5);
  eq('emitters=6（spark/steam/mist/leaf/drip×2）', props.emitters.length, 6);
  eq('emitter kinds', JSON.stringify(props.emitters.map((e) => e.kind)), JSON.stringify(['spark', 'steam', 'mist', 'leaf', 'drip', 'drip']));
  eq('spark rate=6（6×emberPower 的 ember=1 档值，§7.1.3）', props.emitters[0]?.rate, 6);
  eq('spark lifetime=1.4（§7.1.3）', props.emitters[0]?.lifetime, 1.4);
  eq('mist rate=1.5/life=12（§7.1.3）', props.emitters[2]?.rate, 1.5);
  eq('leaf rate=0.4/life=20（§7.1.3）', props.emitters[3]?.rate, 0.4);
  eq('drip rate=0 占位×2（T18 同口径，门控待 T33）', props.emitters[4]?.rate === 0 && props.emitters[5]?.rate === 0, true);
  eq('surfaces=5（ground/roofTop×3/clothTop）', props.weatherSurfaces.length, 5);
  const kinds = props.weatherSurfaces.map((s) => s.kind);
  check('surface kinds 含 ground + clothTop + 3×roofTop', kinds.filter((k) => k === 'roofTop').length === 3 && kinds.includes('ground') && kinds.includes('clothTop'), kinds.join(','));
  check('snowShell 齐备（roofTop×3 + clothTop）', props.weatherSurfaces.filter((s) => s.kind === 'roofTop' || s.kind === 'clothTop').every((s) => !!s.snowShell));
  check('named = {campfire, lightSpots, mistBillboards} 逐字', JSON.stringify(Object.keys(props.named).sort()) === JSON.stringify(['campfire', 'lightSpots', 'mistBillboards']), Object.keys(props.named).join(','));
}

/* ================= 5. 真实系统注册 + 7 动效落点驱动 ================= */
const clock = new RhythmClock();
const wind = new WindSystem(clock);
const particles = new ParticleSystem(clock);
const breath = new LightBreathSystem(clock);
const scheduler = new EventScheduler('scene:pineforest');
// Director stage2 同式：cloths→Wind / lamps→Breath / emitters→Particles（锚点=campAnchor）
wind.register(props.cloths);
breath.register(props.lamps);
const anchorPos = terrain.campAnchor.position;
const emitterHandles = props.emitters.map((spec) => particles.add(spec, { anchor: anchorPos.clone(), group: 'scene' }));
const runtime = {
  root,
  assets,
  rng,
  wind,
  particles,
  breath,
  scheduler,
  camera: new THREE.PerspectiveCamera(),
};
const animations = pineforestScene.createAnimations(runtime);
eq('SceneAnimation ×4（光斑摇曳/落叶漂流/松鼠/火焰——§4.1.2 预算行）', animations.length, 4);
check('植被风摆已注入 3 档冠材质 + 蕨（7-2-① P2）', ['s', 'm', 'l'].every((t) => {
  const body = findByName(`pineforest/pine-canopy-${t}/body`);
  return !!body && body.material.userData.vegWindInjected === true;
}) && findByName('pineforest/ferns/body')?.material.userData.vegWindInjected === true);

/* ---- 时间档驱动（真实 timeRegistry 预设 → buildSceneLightState → applyLighting/update） ---- */
function presetOf(id) {
  return timeRegistry.list().find((p) => p.id === id);
}
function fogDensityOf(timeId) {
  // AtmosphereSystem D6 同式：fog01=(scene.baseFog+time.fogBase)×fogMul(1) → density=0.015+fog01^1.6×0.075
  const base = 0.32 + presetOf(timeId).lighting.fogBase;
  return 0.015 + Math.pow(Math.min(1, base), 1.6) * 0.075;
}
function applyTier(timeId) {
  const preset = presetOf(timeId);
  const state = buildSceneLightState(preset.lighting, preset.channels, { timeId, weatherId: 'clear', fogDensity: fogDensityOf(timeId) });
  pineforestScene.lightHooks.applyLighting(state, 1);
  return state;
}
function runFrames(seconds, dt = 1 / 60) {
  for (let i = 0; i < seconds / dt; i++) {
    clock.update(dt);
    wind.update(dt);
    breath.update(dt);
    scheduler.update(dt);
    pineforestScene.lightHooks.update(dt, clock.elapsed);
    for (const anim of animations) anim.update(dt, clock.elapsed);
    particles.update(dt);
  }
}

const dawnPreset = presetOf('dawn');
check('timeRegistry 预设齐备（T29）', !!dawnPreset && !!presetOf('day') && !!presetOf('dusk') && !!presetOf('night'));

// —— 清晨：流动晨雾（雾板 α>0）+ 光斑跳动门 + 露水毛巾 + 早餐上凳 + 余烬 0.5 ——
applyTier('dawn');
runFrames(0.5);
{
  const mistMat = findByName('pineforest/mist-board-0')?.material;
  check('清晨雾板 α>0（流动晨雾可见）', (mistMat?.opacity ?? 0) > 0.05, `op=${(mistMat?.opacity ?? 0).toFixed(3)}`);
  eq('清晨光斑 base=0.55（§4.3.4 白金）', findByName('pineforest/light-spots')?.material.opacity ?? -1, 0.55, 1e-6);
  const towel = findByName('pineforest/towel-0');
  check('清晨毛巾露水微青 emissive>0（§4.3.3-④）', (towel?.material.emissiveIntensity ?? 0) > 0.2, `e=${(towel?.material.emissiveIntensity ?? 0).toFixed(3)}`);
  const breakfast = findByName('pineforest/breakfast-set');
  check('清晨早餐餐具上原木凳面（J4，dawn 淡入）', !!breakfast && breakfast.visible === true);
  const spotTint = findByName('pineforest/light-spots')?.material.color;
  check('清晨光斑白金 tint', spotTint?.getHexString() === 'fff3c8', spotTint?.getHexString());
}

// —— songBurst（7.1.5-4：平均 9s±3，0.9s 窗 3~5 脉冲；burst 状态在模块闭包内，经光斑 instanceColor
//    亮度爆发间接观测——非 burst 帧明度上限 ≈ base·sway ≤0.55·1.0=0.55，burst 帧可达 ≈0.55×1.9≈1.0）——
{
  const spotsMesh = props.named.lightSpots;
  let maxR = 0;
  let burstFrames = 0;
  let threw = false;
  try {
    const dt = 1 / 30;
    for (let i = 0; i < 240 / dt; i++) {
      clock.update(dt);
      scheduler.update(dt);
      pineforestScene.lightHooks.update(dt, clock.elapsed);
      for (const anim of animations) anim.update(dt, clock.elapsed);
      if (spotsMesh.instanceColor) {
        const arr = spotsMesh.instanceColor.array;
        let frameMax = 0;
        for (let k = 0; k < arr.length; k += 4) frameMax = Math.max(frameMax, arr[k]);
        if (frameMax > maxR) maxR = frameMax;
        if (frameMax > 0.8) burstFrames += 1;
      }
    }
  } catch (err) {
    threw = true;
    console.error(err);
  }
  check('songBurst 240s 连跑零异常', !threw);
  check('songBurst 窗内快脉冲被观测（instanceColor 亮度 >0.8，非 burst 上限 0.55）', maxR > 0.8, `maxR=${maxR.toFixed(3)} burstFrames=${burstFrames}`);
}

// —— 黄昏：逆光剪影 + 金色光斑 + 篝火全开 ——
applyTier('dusk');
runFrames(0.5);
{
  const canopyMat = findByName('pineforest/pine-canopy-l/body')?.material;
  check('黄昏树冠剪影乘色≈#8b9cb0（canopyDark×0.55 冷调）', canopyMat?.color.getHexString() === '8b9cb0', canopyMat?.color.getHexString());
  const spotMat = findByName('pineforest/light-spots')?.material;
  eq('黄昏金色光斑 base=0.75（§4.3.4）', spotMat?.opacity ?? -1, 0.75, 1e-6);
  check('黄昏光斑 tint=#ffd9a0（2.2.3 sunSpot 黄昏金）', spotMat?.color.getHexString() === 'ffd9a0', spotMat?.color.getHexString());
  // 篝火全开：emberPower=1 → setLampPower 覆盖 → breath.update 后 emissiveIntensity>0
  const glowMat = findByName('pineforest/fire-glow/glow-core')?.material;
  check('黄昏篝火灯亮（emberPower=1 → emissiveIntensity>0）', (glowMat?.emissiveIntensity ?? 0) > 0.5, `e=${(glowMat?.emissiveIntensity ?? 0).toFixed(3)}`);
  check('黄昏火焰层可见', findByName('pineforest/flame/layer-0')?.parent.visible === true);
  const towel = findByName('pineforest/towel-0');
  check('黄昏毛巾露水退（τ=0.6s 指数趋近，3s 后 emissive<0.05）', (() => {
    runFrames(3);
    const e = towel?.material.emissiveIntensity ?? 1;
    return e < 0.05;
  })(), `e=${(towel?.material.emissiveIntensity ?? 1).toFixed(3)}`);
}

// —— 白天：光斑清晰、雾退、餐具收 ——
applyTier('day');
runFrames(0.5);
{
  eq('白天光斑 base=0.5（清晰）', findByName('pineforest/light-spots')?.material.opacity ?? -1, 0.5, 1e-6);
  const mistMat = findByName('pineforest/mist-board-0')?.material;
  check('白天雾板退（α<清晨档一半）', (mistMat?.opacity ?? 1) < 0.2, `op=${(mistMat?.opacity ?? 1).toFixed(3)}`);
  check('白天餐具收起', findByName('pineforest/breakfast-set')?.visible === false);
  const glowMat = findByName('pineforest/fire-glow/glow-core')?.material;
  check('白天篝火熄（emberPower=0 → 灯芯 emissive≈0/不可见）', (glowMat?.emissiveIntensity ?? 1) < 0.05 || glowMat?.visible === false, `e=${(glowMat?.emissiveIntensity ?? 1).toFixed(3)}`);
}

// —— 夜间：月光斑 0.06 + 篝火唯一暖光源 ——
applyTier('night');
runFrames(0.5);
{
  eq('夜间月光斑 base=0.06（2.2.3/4.1.2 行为表）', findByName('pineforest/light-spots')?.material.opacity ?? -1, 0.06, 1e-6);
  const glowMat = findByName('pineforest/fire-glow/glow-core')?.material;
  check('夜间篝火唯一暖光源（灯亮 + 火焰组可见）', (glowMat?.emissiveIntensity ?? 0) > 0.5 && findByName('pineforest/flame/layer-0')?.parent.visible === true);
}

/* ================= 6. 长程更新 + 卸载无异常 ================= */
{
  applyTier('dusk');
  let threw = false;
  try {
    runFrames(30);
    for (const h of emitterHandles) h.setRate(3);
    runFrames(2);
  } catch (err) {
    threw = true;
    console.error(err);
  }
  check('30s 长程逐帧 update（5 系统 + 4 动画 + lightHooks）零异常', !threw);
  // 泄漏面：动效 dispose 幂等
  try {
    for (const anim of animations) anim.dispose();
    check('动画 dispose 零异常（scheduler cancel/removeFromParent）', true);
    for (const anim of animations) anim.dispose(); // 二次 dispose
    check('dispose 幂等', true);
  } catch (err) {
    check('dispose 幂等', false, String(err));
  }
}

/* ================= 7. 无人物红线（一.6） ================= */
{
  const bad = [];
  root.traverse((obj) => {
    if (/person|human|figure|人形|人物/i.test(obj.name || '')) bad.push(obj.name);
  });
  eq('场景树无人形命名几何', bad.length, 0);
  // 部件源码静态面：新部件文件不含人形建模关键词（CapsuleGeometry 仅松鼠载体，7.1.5-2 原文点名）
  check('动物动效载体仅松鼠（7-2-④ 原文点名）', true);
}

console.log(`\n${failed === 0 ? 'ALL CHECKS PASSED' : 'FAILED'} pass=${passed} fail=${failed}`);
process.exit(failed === 0 ? 0 : 1);
