// verify-t31.headless.mjs —— T31 通用装饰物状态 8 项端到端（无头，无 WebGL/DOM 渲染）。
// 运行：node verify-t31.headless.mjs（自带 module.registerHooks 转译钩子；同 verify-t28 模式）。
//   段①-⑥=四场景直构核验（真实 LightBreath/Wind/Scheduler）；段⑥b+⑦经 --director 子进程跑
//   Director 集成（真注册表/真帧序：天空三态/火光点光/发射器调制/离散量真实链）——两段以子进程
//   隔离（直构与 Director 共用全局 ToonMaterialFactory 缓存，同进程二建同场景触发植被风摆守卫）。
// 断言逐条对：docs/05 §4.3.3-①..⑧（8 项清单）+ §4.3.1/D5（离散量 blend≥0.5 中点切换+0.2s opacity 淡变）
//   + docs/00 一.12 J4（四场景就餐面：海崖桌/松林凳面/避难所板条箱面/服务区长椅）+ docs/05 §7.1.4（灯点总表）
//   + §7.1.3（粒子定值公式）/§7.1.6（动效×时间联动矩阵）/docs/01 §3.9 P3（火光点光位）。
// 扩权注记（经审批）：②⑥⑧ 原为「范围外缺口」——本轮经审批扩权由 render/sky.ts+core/director.ts+
//   main.ts+timeLight 最小接线闭环（依据：原文四-4、docs/01 §3.9 P3/P1、R-P3-1④），探针段⑥b 转为闭环断言。
import { registerHooks } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import { readFileSync, existsSync, statSync } from 'node:fs';
import ts from 'typescript';
import * as THREE from 'three';

const here = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = pathToFileURL(path.join(here, 'src')).href;

/* ---- 最小 canvas 2D 桩（同 verify-t28：Proxy no-op + 真 ImageData） ---- */
function makeContext2d(canvas) {
  const gradient = { addColorStop() {} };
  return new Proxy(
    { canvas },
    {
      get(target, prop) {
        if (prop === 'createImageData') return (w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h });
        if (prop === 'getImageData') return (x, y, hh) => ({ data: new Uint8ClampedArray(Math.max(1, w2 * h2 * 4)), width: w2, height: h2 });
        if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => gradient;
        if (prop === 'measureText') return () => ({ width: 10 });
        if (typeof prop === 'string') {
          if (!(prop in target)) target[prop] = () => {};
          return target[prop];
        }
        return undefined;
      },
      set() { return true; },
    },
  );
}
let w2 = 0; let h2 = 0;
globalThis.document = {
  createElement(tag) {
    if (tag !== 'canvas') throw new Error(`[smoke] 意外 createElement: ${tag}`);
    return {
      width: 0,
      height: 0,
      getContext(kind) {
        if (kind !== '2d') throw new Error(`[smoke] 意外 context: ${kind}`);
        w2 = this.width || 4; h2 = this.height || 4;
        if (!this._ctx) this._ctx = makeContext2d(this);
        return this._ctx;
      },
    };
  },
};

registerHooks({
  resolve(specifier, context, next) {
    const resolveCandidates = (base) => {
      if (/\.[cm]?[jt]sx?$/.test(base)) return base;
      for (const f of [`${base}.ts`, path.join(base, 'index.ts')]) {
        if (existsSync(f)) return f;
      }
      return `${base}.ts`;
    };
    if (specifier.startsWith('@/')) {
      return next(pathToFileURL(resolveCandidates(path.join(here, 'src', specifier.slice(2)))).href, context);
    }
    if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL) {
      const parentDir = new URL('.', context.parentURL);
      const resolved = new URL(specifier, parentDir);
      if (!/\.[cm]?[jt]sx?$/.test(resolved.pathname)) {
        return next(pathToFileURL(resolveCandidates(fileURLToPath(resolved.href))).href, context);
      }
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.startsWith(srcRoot) && url.endsWith('.ts')) {
      const source = readFileSync(fileURLToPath(url), 'utf8');
      const output = ts.transpileModule(source, {
        fileName: url,
        compilerOptions: {
          target: ts.ScriptTarget.ES2020,
          module: ts.ModuleKind.ESNext,
          verbatimModuleSyntax: false,
          isolatedModules: true,
        },
      });
      if (output.diagnostics && output.diagnostics.length > 0) {
        throw new Error(`[smoke] ts 转换失败 ${url}: ${output.diagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, ' ')).join('; ')}`);
      }
      return { format: 'module', shortCircuit: true, source: output.outputText };
    }
    return next(url, context);
  },
});

/* ============================== 断言基础设施 ============================== */
let pass = 0;
let fail = 0;
function check(name, ok, detail = '') {
  if (ok) {
    pass += 1;
    console.log(`  PASS  ${name}${detail ? `  [${detail}]` : ''}`);
  } else {
    fail += 1;
    console.log(`  FAIL  ${name}  [${detail}]`);
  }
}
const near = (a, b, eps = 0.001) => Math.abs(a - b) < eps;

/* ---- 四场景构建（Director stage0/1/2 同口径直构；lightHooks 直调以精确控制 blend） ---- */
const { Rng } = await import('@/shared/rng');
const { RhythmClock } = await import('@/systems/clock');
const { LightBreathSystem } = await import('@/systems/lightBreath');
const { WindSystem } = await import('@/systems/wind');
const { EventScheduler } = await import('@/systems/scheduler');
const { seacliffScene } = await import('@/content/scenes/seacliff');
const { pineforestScene } = await import('@/content/scenes/pineforest');
const { wastelandScene } = await import('@/content/scenes/wasteland');
const { serviceareaScene } = await import('@/content/scenes/servicearea');
const { timeRegistry } = await import('@/content/times/registry');

/** headless 资产桩（SharedAssets 契约 geometry/texture；同 verify-t21）。 */
class StubAssets {
  constructor() { this.geometries = new Map(); this.textures = new Map(); }
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

/** 场景灯状态便捷构造（§4.3.2 通道定值逐档转写）。 */
function lightState(time, channels) {
  return {
    time, weather: 'clear', fogDensity: 0.05, global: {},
    lampPower: channels.lampPower, emberPower: channels.emberPower, smokePower: channels.smokePower,
    shopPower: channels.shopPower, interiorGlow: channels.interiorPower,
  };
}
const CH = {
  dawn: { lampPower: 0.15, emberPower: 0.5, smokePower: 0.25, shopPower: 0.35, interiorPower: 0.2 },
  day: { lampPower: 0, emberPower: 0, smokePower: 1.0, shopPower: 1.0, interiorPower: 0 },
  dusk: { lampPower: 1.0, emberPower: 1.0, smokePower: 0.35, shopPower: 0.65, interiorPower: 0.85 },
  night: { lampPower: 1.0, emberPower: 1.0, smokePower: 0.15, shopPower: 1.0, interiorPower: 1.0 },
};

/** 四场景档案：J4 就餐面组名 / 炭堆材质（无则 null）/ 露水探针 / 灯通道口径注记。 */
const SCENES = [
  { id: 'seacliff', module: seacliffScene, tableware: 'seacliff/breakfast-set', ember: true, dew: 'sparkle', dewMatName: 'seacliff/dew-sparkles' },
  { id: 'pineforest', module: pineforestScene, tableware: 'pineforest/breakfast-set', ember: true, dew: 'towelEmissive' },
  { id: 'wasteland', module: wastelandScene, tableware: 'wasteland/tableware', ember: true, dew: 'sparkle', dewMatName: 'wasteland/dew-sparkles' },
  { id: 'servicearea', module: serviceareaScene, tableware: 'servicearea/breakfast-set', ember: false, dew: null },
];

function buildScene(entry) {
  const assets = new StubAssets();
  const rng = new Rng(entry.id);
  const root = new THREE.Group();
  const terrain = entry.module.buildTerrain({ root, assets, rng });
  root.add(terrain.group);
  const props = entry.module.buildProps({ root, assets, rng });
  root.add(props.group);
  const clock = new RhythmClock();
  const breath = new LightBreathSystem(clock);
  const wind = new WindSystem(clock);
  const scheduler = new EventScheduler(`scene:${entry.id}`);
  breath.register(props.lamps);
  const animations = entry.module.createAnimations({
    root, assets, rng, wind, particles: { add: () => ({ setRate() {}, dispose() {} }) },
    breath, scheduler, camera: new THREE.PerspectiveCamera(),
  });
  const find = (name) => { let f = null; root.traverse((o) => { if (!f && o.name === name) f = o; }); return f; };
  return { entry, assets, root, terrain, props, clock, breath, animations, find, scene: entry.module };
}

/* —— 运行模式：--director 子进程只跑段⑥b+⑦。直构段与 Director 段共用全局 ToonMaterialFactory 缓存，
   同进程二建同场景会触发植被风摆重复注入守卫（wind.ts:255，T28 起为单建口径）——分段进程隔离。 —— */
const DIRECTOR_ONLY = process.argv.includes('--director');

if (!DIRECTOR_ONLY) {
/* ============================== 段 ① J4 四场景就餐面（§4.3.3-③） ============================== */
console.log('-- ① J4 四场景就餐面（早餐餐具仅 dawn） --');
const built = SCENES.map(buildScene);

for (const b of built) {
  const set = b.find(b.entry.tableware);
  check(`${b.entry.id} 就餐面餐具组在场（${b.entry.tableware}）`, set !== null);
  if (set) {
    const meshes = [];
    set.traverse((o) => { if (o.isMesh) meshes.push(o); });
    check(`${b.entry.id} 餐具网格在场（Lathe 盘/杯/壶）`, meshes.length >= 4, `n=${meshes.length}`);
    check(`${b.entry.id} 餐具 authored visible=false（仅 dawn 出现）`, set.visible === false);
  }
}
// 服务区长椅档落点（J4「服务区长椅」）：东侧长椅 (2.6,6.55) 座面顶 ≈0.4375（benchSlat.ts:41-42）
{
  const b = built[3];
  const set = b.find('servicearea/breakfast-set');
  check('servicearea 餐具落点=东侧长椅座面 (2.6, 0.44, 6.55)',
    set && near(set.position.x, 2.6) && near(set.position.y, 0.44, 0.01) && near(set.position.z, 6.55),
    set ? `pos=(${set.position.x},${set.position.y},${set.position.z})` : 'missing');
  check('servicearea named 三键口径未被破坏（2.4.2 注册表）',
    ['deliveryCart', 'storeSign', 'vendingMachines'].every((k) => b.props.named[k] !== undefined));
}

/* ============================== 段 ② 离散量中点切换 + 0.2s 淡变（D5/§4.3.1） ============================== */
console.log('-- ② 离散量中点切换+0.2s 淡变（四场景逐景） --');
for (const b of built) {
  const set = b.find(b.entry.tableware);
  if (!set) continue;
  const hooks = b.scene.lightHooks;
  const fadeMat = set.traverse && (() => { const m = []; set.traverse((o) => { if (o.isMesh && o.material && o.material.transparent) m.push(o.material); }); return m; })();
  // day → 收起
  hooks.applyLighting(lightState('day', CH.day), 1);
  hooks.update?.(0.3, 1);
  check(`${b.entry.id} day 餐具收起（0.2s 淡出后 visible=false）`, set.visible === false);
  // 中点前（blend=0.4）：尚未切换
  hooks.applyLighting(lightState('dawn', CH.dawn), 0.4);
  hooks.update?.(1 / 60, 1);
  check(`${b.entry.id} blend=0.4（<0.5）餐具未出现（中点门控）`, set.visible === false);
  // 中点后（blend=0.6）：淡入启动
  hooks.applyLighting(lightState('dawn', CH.dawn), 0.6);
  hooks.update?.(1 / 60, 1);
  const fadeInProgress = set.visible === true;
  hooks.update?.(0.3, 1);
  const matFull = fadeMat.length > 0 && near(fadeMat[0].opacity, 0.999, 0.01);
  check(`${b.entry.id} blend=0.6（≥0.5）餐具出现且 0.2s 淡入完成（op≈0.999）`, fadeInProgress && matFull,
    `visible=${set.visible} op=${fadeMat[0]?.opacity}`);
  // day 收起（淡出）
  hooks.applyLighting(lightState('day', CH.day), 0.6);
  hooks.update?.(0.3, 1);
  check(`${b.entry.id} 回 day 餐具 0.2s 淡出隐藏（opacity 渐变非 scale 弹跳）`, set.visible === false);
}

/* ============================== 段 ③ 篝火余烬（§4.3.3-②：emissive #FF5A20 × emberPower） ============================== */
console.log('-- ③ 篝火余烬（海崖/松林/避难所；服务区无火堆） --');
const collectCoal = (root) => {
  const mats = new Set();
  root.traverse((o) => {
    if (o.isMesh && o.material && o.material.isMeshToonMaterial && o.material.emissive
      && o.material.emissive.getHexString() === 'ff5a20') mats.add(o.material);
  });
  return [...mats];
};
for (const b of built) {
  if (!b.entry.ember) { check('servicearea 无火堆（7.1.4 表无篝火行，口径正确）', collectCoal(b.root).length === 0); continue; }
  const coals = collectCoal(b.root);
  check(`${b.entry.id} 炭堆材质在场（emissive #FF5A20）`, coals.length > 0, `n=${coals.length}`);
  b.scene.lightHooks.applyLighting(lightState('night', CH.night), 1);
  b.scene.lightHooks.update?.(1 / 60, 1);
  const iN = coals[0]?.emissiveIntensity ?? 0;
  check(`${b.entry.id} night（ember=1.0）炭火亮起（intensity∈(0.75,1.7) 噪声闪烁带）`, iN > 0.75 && iN < 1.7, `i=${iN.toFixed(3)}`);
  b.scene.lightHooks.applyLighting(lightState('dawn', CH.dawn), 1);
  b.scene.lightHooks.update?.(1 / 60, 1);
  const iD = coals[0]?.emissiveIntensity ?? 0;
  check(`${b.entry.id} dawn（ember=0.5）只剩余烬（intensity≈半亮）`, iD > 0.3 && iD < 0.9, `i=${iD.toFixed(3)}`);
  b.scene.lightHooks.applyLighting(lightState('day', CH.day), 1);
  b.scene.lightHooks.update?.(1 / 60, 1);
  check(`${b.entry.id} day（ember=0）炭火熄灭 visible=false（§7.1.6「篝火 0（炊烟代替）」）`,
    coals[0]?.visible === false && (coals[0]?.emissiveIntensity ?? 1) < 0.02);
}

/* ============================== 段 ④ 晾晒物露水高光（§4.3.3-④：dawn=1 白天晒干） ============================== */
console.log('-- ④ 露水高光（海崖 sparkle/松林毛巾/避难所工装；服务区行为表无露水行） --');
{
  const b = built[0];
  b.scene.lightHooks.applyLighting(lightState('dawn', CH.dawn), 1);
  b.scene.lightHooks.update?.(1 / 60, 1);
  const sparkle = b.find('seacliff/dew-sparkles');
  const mat = sparkle?.material;
  check('seacliff dawn 露水 sparkle 可见（52 实例 1 DC）', sparkle !== null && mat.opacity > 0.1 && sparkle.visible === true,
    `op=${mat?.opacity?.toFixed(3)}`);
  b.scene.lightHooks.applyLighting(lightState('day', CH.day), 1);
  for (let i = 0; i < 20; i++) b.scene.lightHooks.update?.(0.1, i * 0.1); // 晒干（0.6s 常数衰减）
  check('seacliff day 露水晒干（opacity<0.02 → visible=false）', mat.visible === false || mat.opacity < 0.02, `op=${mat.opacity.toFixed(3)}`);
}
{
  const b = built[1];
  const towels = [];
  b.root.traverse((o) => {
    if (o.isMesh && o.material && o.material.isMeshToonMaterial && o.material.emissive
      && o.material.emissive.getHexString() === '7fd8cc') towels.push(o.material);
  });
  check('pineforest 毛巾露水材质在场（微青 #7fd8cc emissive 近似——R-P3-1⑤ 口径）', towels.length >= 3, `n=${towels.length}`);
  b.scene.lightHooks.applyLighting(lightState('dawn', CH.dawn), 1);
  let iDawn = 0;
  for (let i = 0; i < 150; i++) { // 收敛 dew→1（0.6s 常数）并跨 twinkle 周期取峰
    b.scene.lightHooks.update?.(1 / 60, i / 60);
    iDawn = Math.max(iDawn, towels[0]?.emissiveIntensity ?? 0);
  }
  check('pineforest dawn 毛巾露水亮起（峰值 emissiveIntensity>0.2，twinkle 包络 0.5×[0.4,1.0]）', iDawn > 0.2, `peak=${iDawn.toFixed(3)}`);
  b.scene.lightHooks.applyLighting(lightState('day', CH.day), 1);
  for (let i = 0; i < 20; i++) b.scene.lightHooks.update?.(0.1, i * 0.1);
  check('pineforest day 毛巾晒干（emissiveIntensity≈0）', (towels[0]?.emissiveIntensity ?? 1) < 0.02);
}
{
  const b = built[2];
  b.scene.lightHooks.applyLighting(lightState('dawn', CH.dawn), 1);
  b.scene.lightHooks.update?.(1 / 60, 1);
  const sparkle = b.find('wasteland/dew-sparkles');
  const mat = sparkle?.material;
  check('wasteland dawn 工装露水 sparkle 可见（30 实例 1 DC）', sparkle !== null && mat.opacity > 0.1 && sparkle.visible === true,
    `op=${mat?.opacity?.toFixed(3)}`);
  b.scene.lightHooks.applyLighting(lightState('day', CH.day), 1);
  for (let i = 0; i < 20; i++) b.scene.lightHooks.update?.(0.1, i * 0.1);
  check('wasteland day 露水晒干', mat.visible === false || mat.opacity < 0.02);
}
{
  const b = built[3];
  check('servicearea 无露水落点（§4.3.4 服务区行无露水，口径正确）', b.find('servicearea/dew-sparkles') === null);
}

/* ============================== 段 ⑤ 灯具全熄 / ⑦ 黄昏点灯 / ⑧ 夜间全亮（§4.3.3-⑤⑦⑧，真实 LightBreath） ============================== */
console.log('-- ⑤⑦⑧ 灯具三态（blink 占空灯按整周期采样；海崖串灯 halo=场景手动层一并核） --');
/** 整周期采样：返回每灯「周期内曾亮/曾带 halo」与 halo 最大 opacity（blink duty 灯不可只取瞬时值）。 */
function sampleLamps(b, frames, channels, time) {
  b.scene.lightHooks.applyLighting(lightState(time, channels), 1);
  const manualHaloMats = (b.manualHaloMats ??= collectManualHaloMats(b.root));
  // stat[0..n-1]=LampHandle 条目；其后为场景手动 halo 层伪条目（海崖串灯成对层，非 LampHandle.halo）
  const stat = [...b.props.lamps.map(() => ({ everLit: false, everHalo: false, maxHaloOp: 0 })),
    ...manualHaloMats.map(() => ({ everLit: false, everHalo: false, maxHaloOp: 0 }))];
  for (let i = 0; i < frames; i++) {
    b.clock.update(1 / 60);
    b.scene.lightHooks.update?.(1 / 60, i / 60);
    b.breath.update(1 / 60);
    b.props.lamps.forEach((l, li) => {
      if (l.emissiveMat?.visible === true && l.emissiveMat.emissiveIntensity > 0.02) stat[li].everLit = true;
      if (l.halo && l.halo.visible === true) stat[li].everHalo = true;
      stat[li].maxHaloOp = Math.max(stat[li].maxHaloOp, l.halo ? l.halo.material.opacity : 0);
    });
    manualHaloMats.forEach((m, mi) => {
      if (m.visible === true && m.opacity > 0.02) stat[b.props.lamps.length + mi].everHalo = true;
    });
  }
  return stat;
}
/** 海崖串灯的成对 halo 是场景手动层（seacliff.ts:618-630 InstancedMesh 'seacliff/string-halo'），非 LampHandle.halo。 */
function collectManualHaloMats(root) {
  const mats = [];
  root.traverse((o) => {
    const mat = o.material;
    if (mat && mat.name === 'seacliff/string-halo' && !mats.includes(mat)) mats.push(mat);
  });
  return mats;
}
for (const b of built) {
  const lamps = b.props.lamps;
  check(`${b.entry.id} 灯点已注册真实 LightBreath（n=${lamps.length}）`, lamps.length > 0);
  const shop = b.entry.id === 'servicearea';
  const chDay = shop ? { ...CH.day, shopPower: 1.0 } : CH.day;
  // day：lampPower=0（§4.3.3-⑤ 灯具全熄）；D8 分流——servicearea 商业灯走 shopPower（B5 售货机 floor 0.7 常亮）
  b.breath.setChannelPower('lamp', 0);
  b.breath.setChannelPower('ember', 0);
  b.breath.setChannelPower('shop', chDay.shopPower);
  let stat = sampleLamps(b, 210, chDay, 'day'); // 210 帧=3.5s ≥ 最长 blink 周期 3s（海崖串灯）整周期
  if (shop) {
    const vending = lamps.findIndex((l) => l.params.floor === 0.7);
    check('servicearea day 商业灯常亮（D8 分流：售货机 floor 0.7 在 day 仍亮——§7.1.6 商业灯行）',
      vending >= 0 && stat[vending].everLit);
  } else {
    const dayLit = stat.slice(0, lamps.length).filter((s) => s.everLit || s.everHalo || s.maxHaloOp > 0.02)
      .concat(stat.slice(lamps.length).filter((s) => s.everHalo));
    check(`${b.entry.id} day 全熄（整周期采样：emissive+halo 均不可见，§4.3.3-⑤）`, dayLit.length === 0,
      dayLit.length ? `仍亮 idx=${dayLit.map((s, i) => i).join(',')}` : '');
  }
  // dusk（点灯时刻）：lampPower 1.0 / shop 0.65 / ember 1.0
  b.breath.setChannelPower('lamp', 1);
  b.breath.setChannelPower('ember', 1);
  b.breath.setChannelPower('shop', 0.65);
  stat = sampleLamps(b, 210, CH.dusk, 'dusk');
  const duskLit = stat.slice(0, lamps.length).filter((s) => s.everLit).length;
  const duskHalo = stat.filter((s) => s.everHalo).length;
  check(`${b.entry.id} dusk 点灯（整周期：灯体 ${duskLit}/${lamps.length}，halo 同步 ${duskHalo}——§4.3.3-⑦）`,
    duskLit === lamps.length && duskHalo > 0);
  // night（全亮+halo 主角档）：全 1.0
  b.breath.setChannelPower('shop', 1.0);
  stat = sampleLamps(b, 210, CH.night, 'night');
  const nightLit = stat.slice(0, lamps.length).filter((s) => s.everLit).length;
  const nightHalo = stat.filter((s) => s.everHalo).length;
  const haloExpect = lamps.filter((l) => l.halo).length + (b.manualHaloMats?.length ?? 0);
  check(`${b.entry.id} night 全亮（整周期：灯体 ${nightLit}/${lamps.length}，additive halo ${nightHalo}/${haloExpect}——§4.3.3-⑧）`,
    nightLit === lamps.length && nightHalo === haloExpect);
}

/* ============================== 段 ⑥ 将熄未熄 + 8 枚举灯映射 + 范围外缺口探针 ============================== */
console.log('-- ⑥ 将熄未熄 / 8 枚举灯落点 / 范围外缺口探针 --');
{
  // ① 将熄未熄：海崖小营地灯 breath 1.5s depth 0.55，dawn 0.15 → 亮度 0.07~0.23（§4.3.3-①/lightBreath.ts:205）
  const b = built[0];
  const campLamp = b.props.lamps.find((l) => l.mode === 'breath' && l.params.period === 1.5 && l.params.depth === 0.55);
  check('seacliff 小营地灯 breath 1.5s depth 0.55（7.1.4「四-1」行）', campLamp !== undefined);
  b.breath.setChannelPower('lamp', 0.15);
  let minOut = 1; let maxOut = 0;
  for (let i = 0; i < 100; i++) {
    b.clock.update(1 / 60);
    b.breath.update(1 / 60);
    const out = campLamp.emissiveMat.emissiveIntensity / 1.5; // authored 基值 1.5（seacliff.ts:781）
    if (out < minOut) minOut = out;
    if (out > maxOut) maxOut = out;
  }
  check('seacliff dawn 将熄未熄：亮度起伏 ∈[0.0675,0.2325]（0.15×(1±0.55)）',
    minOut > 0.065 && minOut < 0.075 && maxOut > 0.22 && maxOut < 0.24,
    `min=${minOut.toFixed(3)} max=${maxOut.toFixed(3)}`);

  // 四-4 枚举 8 项灯落点映射（§4.3.3-⑧→7.1.4 总表；车内灯走 interiorPower×D2，归车型钩子链）
  check('枚举①串灯（海崖 blink 3s stagger）', b.props.lamps.some((l) => l.mode === 'blink'));
  check('枚举②营地灯（海崖 breath 1.5s）', campLamp !== undefined);
  check('枚举④灯塔光束（海崖 rotate speed 0.25rad/s ≈25s/圈）', b.props.lamps.some((l) => l.mode === 'rotate' && l.params.speed === 0.25));
  const w = built[2];
  check('枚举⑦探照灯（避难所 rotate sweep）', w.props.lamps.some((l) => l.mode === 'rotate' && l.params.pattern === 'sweep'));
  check('枚举⑧警示红灯（避难所 rotate rev）', w.props.lamps.some((l) => l.mode === 'rotate' && l.params.pattern === 'rev'));
  const s = built[3];
  check('枚举⑤便利店灯箱（服务区 breath 6s depth 0.12）', s.props.lamps.some((l) => l.mode === 'breath' && l.params.period === 6));
  check('枚举⑥售货机灯带（服务区 floor 0.7 常亮）', s.props.lamps.some((l) => l.params.floor === 0.7));
  const night = timeRegistry.get('night');
  check('枚举③车内灯=interiorPower night 1.0（applyInteriorLight D2 链，T23–T28 已验）',
    night.channels.interiorPower === 1.0 && night.channels.interiorEmphasis === 1.0);
  check('night 通道四项全 1.0（四-4「所有灯光道具点亮」）',
    night.channels.lampPower === 1.0 && night.channels.emberPower === 1.0 && night.channels.shopPower === 1.0);

  // 炊烟四源发射器在场（§4.3.3-⑥；rate 调制见缺口探针）
  check('炊烟四源：海崖烧烤炉 steam', built[0].props.emitters.some((e) => e.kind === 'steam'));
  check('炊烟四源：松林篝火 steam', built[1].props.emitters.some((e) => e.kind === 'steam'));
  check('炊烟四源：避难所发电机 steam（常转 base 1.5）', built[2].props.emitters.some((e) => e.kind === 'steam' && e.rate === 1.5));
  check('炊烟四源：服务区餐饮排气口 steam', built[3].props.emitters.some((e) => e.kind === 'steam'));
}

} /* —— 直构段结束（--director 子进程跳过） —— */

console.log('-- ⑥b 范围外缺口探针（T31 扩权后应已闭环；如仍缺失则如实 FAIL） --');
{
  const skySrc = readFileSync(path.join(here, 'src', 'render', 'sky.ts'), 'utf8');
  const skyLines = skySrc.split('\n').filter((l) => l.trim() && !l.trim().startsWith('//')).length;
  check('⑧ render/sky.ts 已实现（非 T01 占位：≥150 有效行）', skyLines >= 150, `lines=${skyLines}`);
  const directorSrc = readFileSync(path.join(here, 'src', 'core', 'director.ts'), 'utf8');
  check('② director 已接 acquireFireLight（P3 火光位领取）', (directorSrc.match(/acquireFireLight/g) ?? []).length >= 1);
  check('⑥ director 已接 emitter setRate 调制（§7.1.3 公式）', directorSrc.includes('setRate') && directorSrc.includes('smokePower'));
  const mainSrc = readFileSync(path.join(here, 'src', 'main.ts'), 'utf8');
  check('⑧ main.ts 纯色背景已移除（background 选项不再传 #0e1520）', !mainSrc.includes("background: '#0e1520'"));
}

/* ============================== 段 ⑦ Director 集成（真注册表+真帧序钩子：②⑥⑧ 端到端；仅 --director 子进程） ============================== */
if (DIRECTOR_ONLY) {
console.log('-- ⑦ Director 集成（真注册表/真帧序：天空三态+火光点光+发射器调制） --');
{
  const { Director } = await import('@/core/director');
  const { sceneRegistry } = await import('@/content/scenes/registry');
  const { vehicleRegistry } = await import('@/content/vehicles/registry');
  const { weatherRegistry } = await import('@/content/weathers/registry');
  const engineDuck = {
    scene: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(),
    hooks: { clock: null, transition: null, systems: [], scene: [] },
  };
  const director = new Director({ engine: engineDuck, sceneRegistry, vehicleRegistry, timeRegistry, weatherRegistry });
  director.start();
  director.applyState(); // 默认：seacliff + classC + dusk + clear

  const runFrames = (frames) => {
    for (let i = 0; i < frames; i++) {
      engineDuck.hooks.transition?.(1 / 60);
      for (const hook of engineDuck.hooks.systems) hook(1 / 60);
      for (const hook of engineDuck.hooks.scene) hook(1 / 60, i / 60); // lightHooks.update/SceneAnimation（餐具淡变等）
    }
  };
  const waitTransition = () => runFrames(230); // ≥1500ms 过渡 + 0.2s 天空淡变 + ⑥调制 τ0.4s 收敛余量
  const find = (name) => { let f = null; engineDuck.scene.traverse((o) => { if (!f && o.name === name) f = o; }); return f; };

  // ⑧ 天空系统挂载与首帧（dusk 默认档：穹顶在场、夜间组隐藏、晚霞+蓝调带模式）
  const skyRoot = find('render/sky');
  check('⑧ 天空系统挂载（render/sky 组在 engine.scene）', skyRoot !== null);
  const dome = find('sky/dome');
  const domeMode = () => dome?.material.uniforms.uBandModeCurr?.value;
  check('⑧ 首帧 dusk：穹顶在场 + 晚霞/蓝调带模式（uBandModeCurr=2）', dome !== undefined && domeMode() === 2);
  check('⑧ 首帧 dusk：夜间组隐藏（星/月未点亮）', find('sky/stars-900')?.visible === false && find('sky/moon')?.visible === false);

  // ② 火光点光（seacliff 烧烤炉申报锚点 → rig/fireSlot 领取；dusk ember=1 → intensity=0.6）
  runFrames(10);
  const fireSlot = find('rig/fireSlot');
  check('② seacliff 火光点光领取（rig/fireSlot visible）', fireSlot !== null && fireSlot.visible === true);
  check('② dusk 火光强度=emberPower×0.6=0.6（§4.3.3-②）', fireSlot !== null && Math.abs(fireSlot.intensity - 0.6) < 0.01,
    `i=${fireSlot?.intensity}`);

  // ⑥ 发射器调制（spy setRate——seacliff steam 2 通道端点：day 2.6 / night 0.73；
  //   applyState 为全组合下发（patch 未给维度取 isDefault，docs/01 §3.5.1）——时间补丁须带 scene）
  const sceneRec = director.scene; // TS private 经 strip 后运行期可达（句柄 spy 用）
  const steamBinding = sceneRec?.emitterBindings?.find((b) => b.kind === 'steam');
  let steamRate = -1;
  if (steamBinding) { const orig = steamBinding.handle.setRate.bind(steamBinding.handle); steamBinding.handle.setRate = (r) => { steamRate = r; orig(r); }; }
  director.applyState({ scene: 'seacliff', time: 'day' });
  waitTransition();
  check('⑥ seacliff day 蒸汽 rate→2.6（2.2×1.0+0.4，§4.3.3-⑥）', steamRate > 2.5 && steamRate < 2.7, `rate=${steamRate.toFixed(3)}`);
  check('② day 火光熄（ember=0 → intensity 0/visible=false，§7.1.6）', fireSlot !== null && fireSlot.visible === false);
  check('⑧ day 天空：白云条带模式（uBandModeCurr=1）+ 夜间组隐藏', domeMode() === 1 && find('sky/stars-900')?.visible === false);
  director.applyState({ scene: 'seacliff', time: 'night' });
  waitTransition();
  check('⑥ seacliff night 蒸汽 rate→0.73（2.2×0.15+0.4）', steamRate > 0.72 && steamRate < 0.74, `rate=${steamRate.toFixed(3)}`);
  // ⑧ night：星空/银河/月面/月晕点亮 + 月向=主光方向 + 月晕 ×2.4
  const stars = find('sky/stars-900'); const galaxy = find('sky/galaxy-300');
  const moon = find('sky/moon'); const moonHalo = find('sky/moon-halo');
  check('⑧ night 星空 900 主星点亮（Points visible，op≈0.95）', stars?.visible === true && Math.abs(stars?.material.opacity - 0.95) < 0.01);
  check('⑧ night 银河 300 暗点点亮', galaxy?.visible === true && Math.abs(galaxy?.material.opacity - 0.85) < 0.01);
  check('⑧ night 月面 billboard 点亮 + 月晕 ×2.4（halo.scale=moon.scale×2.4）',
    moon?.visible === true && moonHalo?.visible === true
    && Math.abs(moonHalo.scale.x / moon.scale.x - 2.4) < 0.001,
    `halo/moon=${(moonHalo.scale.x / moon.scale.x).toFixed(2)}`);
  const nightPreset = timeRegistry.get('night');
  const moonDist = moon ? moon.position.length() : -1;
  check('⑧ 月向=主光方向（night lightDir 仰角 42°/方位 210° → 月位≈dir×83.7）',
    moonDist > 80 && moonDist < 88
    && Math.abs(moon.position.x - nightPreset.lighting.lightDir.x * 83.7) < 0.1
    && Math.abs(moon.position.y - nightPreset.lighting.lightDir.y * 83.7) < 0.1, `dist=${moonDist.toFixed(1)}`);
  check('⑧ night 穹顶星空模式（uBandModeCurr=3，条带收）', domeMode() === 3);
  check('② night 火光 0.6（ember=1.0）', fireSlot !== null && Math.abs(fireSlot.intensity - 0.6) < 0.01);
  // 离散量真实链（timeId 接线修复验证）：dawn 经 Director 全链路 → 海崖餐具 blend≥0.5 淡入出现
  director.applyState({ scene: 'seacliff', time: 'dawn' });
  waitTransition();
  const breakfast = find('seacliff/breakfast-set');
  check('② 真实链 dawn：海崖早餐餐具出现（Director→TimeLight→lightHooks 离散量中点切换）',
    breakfast !== null && breakfast.visible === true);
  check('② 真实链 timeId 随档更新（dawn 露水 sparkle 亮起）',
    find('seacliff/dew-sparkles')?.material.opacity > 0.02);
  director.applyState({ scene: 'seacliff', time: 'day' });
  waitTransition();
  check('② 真实链 day：餐具收起（0.2s 淡出）', breakfast !== null && breakfast.visible === false);
  check('② 真实链 day：露水晒干（opacity<0.02）', find('seacliff/dew-sparkles')?.material.opacity < 0.02);

  // 换场（FadeSwap）：wasteland——发电机 steam B6 常转 floor（night 0.73<1.5 → 1.5）+ 火星/火堆锚点申报
  director.applyState({ scene: 'wasteland', time: 'night' });
  runFrames(40); // FadeSwap 600ms 分帧构建
  waitTransition();
  const wlRec = director.scene;
  const wlSteam = wlRec?.emitterBindings?.find((b) => b.kind === 'steam');
  const wlSpark = wlRec?.emitterBindings?.find((b) => b.kind === 'spark');
  let wlSteamRate = -1; let sparkRate = -1;
  if (wlSteam) { const orig = wlSteam.handle.setRate.bind(wlSteam.handle); wlSteam.handle.setRate = (r) => { wlSteamRate = r; orig(r); }; }
  if (wlSpark) { const orig = wlSpark.handle.setRate.bind(wlSpark.handle); wlSpark.handle.setRate = (r) => { sparkRate = r; orig(r); }; }
  runFrames(30);
  check('⑥ wasteland night 蒸汽 rate→1.5（B6 常转 base floor，高于公式 0.73）', wlSteamRate > 1.45 && wlSteamRate < 1.55, `rate=${wlSteamRate.toFixed(3)}`);
  check('⑥ wasteland night 火星 rate→6（6×emberPower，§7.1.3 spark 行）', sparkRate > 5.9, `rate=${sparkRate.toFixed(3)}`);
  check('② wasteland 火堆锚点申报（fire-light-anchor 在场 → fireSlot 续持）',
    wlRec?.fireAnchor !== null && fireSlot !== null && fireSlot.visible === true);
  const wlDust = wlRec?.emitterBindings?.find((b) => b.kind === 'dust');
  check('⑥ wasteland night 微尘 rate→6（§7.1.3「仅 beam>0.3」——night 探照灯亮）', wlDust !== null && wlDust.rate > 5.9);
  // day 切回：dust 置 0（J5 白天探照灯熄）+ 火星 0（B8）
  director.applyState({ scene: 'wasteland', time: 'day' });
  waitTransition();
  check('⑥ wasteland day 微尘 rate→0（探照灯熄档）', wlDust !== null && wlDust.rate < 0.05, `rate=${wlDust?.rate.toFixed(3)}`);
  check('⑥ wasteland day 火星 rate→0（6×0=0，B8 白天火熄）', sparkRate < 0.05, `rate=${sparkRate.toFixed(3)}`);
  // mist（pineforest）逐档（§7.1.6：day 0.4）
  director.applyState({ scene: 'pineforest', time: 'day' });
  runFrames(40);
  waitTransition();
  const pfMist = director.scene?.emitterBindings?.find((b) => b.kind === 'mist');
  check('⑥ pineforest day 晨雾 rate→0.4（§7.1.6 晨雾行）', pfMist !== null && Math.abs(pfMist.rate - 0.4) < 0.05, `rate=${pfMist?.rate.toFixed(3)}`);

  director.dispose();
  check('Director dispose 无异常（sky.dispose/fireSlot 归还在内）', true);
}
} /* —— 段⑦ 子进程守卫结束 —— */

if (DIRECTOR_ONLY) {
  console.log(`\n== verify-t31: pass=${pass} fail=${fail} ==`);
  process.exit(fail > 0 ? 1 : 0);
}

/* —— 主进程：直构段已跑完；再以 --director 子进程跑 Director 集成段（进程隔离），汇总两侧计数 —— */
{
  const { spawnSync } = await import('node:child_process');
  const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--director'], { encoding: 'utf8' });
  process.stdout.write(child.stdout ?? '');
  if (child.stderr) process.stderr.write(child.stderr);
  const matches = [...(child.stdout ?? '').matchAll(/pass=(\d+) fail=(\d+)/g)];
  const last = matches[matches.length - 1];
  if (child.status !== 0 || !last) {
    fail += 1;
    console.log(`  FAIL  Director 集成子进程（--director）退出码 ${child.status}`);
  } else {
    pass += Number(last[1]);
    fail += Number(last[2]);
  }
}

console.log(`\n== verify-t31: pass=${pass} fail=${fail} ==`);
process.exit(fail > 0 ? 1 : 0);
