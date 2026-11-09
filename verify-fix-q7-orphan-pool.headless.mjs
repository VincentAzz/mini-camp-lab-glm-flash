// verify-fix-q7-orphan-pool.headless.mjs —— 实机验证三问题修复的逻辑级无头核验（无 WebGL；渲染段归内置浏览器实机步）。
// 对应实机问题：
//   ① Q7 FadeSwap 帧率竞争竞态（transition.ts）：低帧率（dt 被 engine MAX_FRAME_DT=0.1 钳制 → 引擎时间
//      每帧至多 100ms）下「激活闸 elapsed≥300ms 即放行」先于分帧装配完成 → activateScene 守卫 throw →
//      新根永久 invisible（FadeSwap 卡死）。修复=闸加「全部分帧 stage 完成」。复现口径：帧步长恒 0.1s
//      （≤13fps 被 MAX_FRAME_DT 钳制后的等效引擎时间线；实机证据「虚拟时钟步长 300ms/帧即 100% 触发」）。
//   ② 崩溃孤儿根回收（transition.ts+director.ts）：激活 throw 后半成品新根已挂 scene 图且 visible=false
//      ——runner 崩溃兜底（discardNewRoot）应摘根+释放 scope，错误如实上抛、runner 不挂起。
//   ③ 粒子池容量不足（particles.ts）：POOL_CAPACITY 2048→4096 + freeRange 相邻空闲段归并——
//      交叉淡化新旧集合共存（雪 want=ceil(180×4.4)=793/套）不再「申请 793 实得 <793」降级。
// 运行：node verify-fix-q7-orphan-pool.headless.mjs（module.registerHooks 转译 @/ 别名，同 verify-t31 模式）。
import { registerHooks } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import ts from 'typescript';
import * as THREE from 'three';

const here = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = pathToFileURL(path.join(here, 'src')).href;

/* ---- 最小 canvas 2D 桩（同 verify-t31：Proxy no-op + 真 ImageData 尺寸） ---- */
function makeContext2d(canvas) {
  const gradient = { addColorStop() {} };
  return new Proxy(
    { canvas },
    {
      get(target, prop) {
        if (prop === 'createImageData') return (w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h });
        if (prop === 'getImageData') return (x, y, hh) => ({ data: new Uint8ClampedArray(Math.max(1, hh * y * 4)), width: y, height: hh });
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

/* ---- console.warn 捕获（池容量降级告警观测） ---- */
function captureWarns() {
  const warns = [];
  const orig = console.warn;
  console.warn = (...args) => { warns.push(args.map(String).join(' ')); orig(...args); };
  return { warns, restore: () => { console.warn = orig; } };
}

/* ============================== 段 A：粒子池容量（systems/particles.ts 直构） ============================== */
console.log('-- 段 A 粒子池：交叉淡化共存容量 + freeRange 归并（实机证据「申请 793 实得 396」） --');
{
  const { ParticleSystem, POOL_CAPACITY } = await import('@/systems/particles');
  const { RhythmClock } = await import('@/systems/clock');

  // 逐字规格（content/weathers/presets.ts snowSpec：want=ceil(180×4.4)=793，实机告警同源数字）
  const snowSpec = {
    kind: 'snow', area: new THREE.Vector3(3.4, 3.4, 2.4), rate: 180, lifetime: 4.4,
    size0: 0.02, size1: 0.045, vel0: new THREE.Vector3(0, -0.55, 0),
    color: '#EDF2F9', opacity: 0.85, additive: false,
  };
  const steamSpec = {
    kind: 'steam', area: new THREE.Vector3(0.5, 0.3, 0.5), rate: 2.6, lifetime: 3.5,
    size0: 0.05, size1: 0.25, vel0: new THREE.Vector3(0, 0.22, 0),
    color: '#E8E8E8', opacity: 0.35, additive: false,
  };
  const dripSpec = {
    kind: 'drip', area: new THREE.Vector3(1, 0.1, 1), rate: 0, lifetime: 0.8,
    size0: 0.015, size1: 0.02, vel0: new THREE.Vector3(0, -3, 0),
    color: '#BFD8E8', opacity: 0.5, additive: false,
  };
  const v = (s) => new THREE.Vector3(s.area.x, s.area.y, s.area.z);
  const weather = (ps, spec) => ps.setWeatherSet([{ spec, anchor: new THREE.Vector3(0, 1, 0) }]);

  /* A1 旧容量复现：cap=2048（修复前定值）三雪集合共存 → 第三套拿残段 → 容量告警 */
  {
    const cap = captureWarns();
    const ps = new ParticleSystem(new RhythmClock(), { capacity: 2048 });
    ps.add(steamSpec, { anchor: new THREE.Vector3(0, 0, 0) }); // 场景发射器（seacliff steam，alpha 10 槽）
    ps.add(dripSpec, { anchor: new THREE.Vector3(0, 0, 0) }); // drip 4 槽 + 涟漪环 4 槽
    weather(ps, snowSpec); // 第 1 套雪（793）
    weather(ps, snowSpec); // 第 2 套雪（共存 793×2）
    weather(ps, snowSpec); // 第 3 套雪：2048 已满 → tail 残段
    const hit = cap.warns.find((w) => w.includes('粒子池容量不足'));
    check('A1 cap=2048（旧容量）：三雪共存触发「粒子池容量不足」告警（复现缺陷）',
      hit !== undefined && hit.includes('申请 793'), hit ?? '无告警');
    cap.restore();
    ps.dispose();
  }

  /* A2 修复后默认容量 4096：同样的共存 + 场景发射器穿插 → 全程无告警 */
  {
    const cap = captureWarns();
    const ps = new ParticleSystem(new RhythmClock()); // 默认 capacity=POOL_CAPACITY
    check('A2a POOL_CAPACITY=4096（实装值）', POOL_CAPACITY === 4096, `POOL_CAPACITY=${POOL_CAPACITY}`);
    ps.add(steamSpec, { anchor: new THREE.Vector3(0, 0, 0) });
    ps.add(dripSpec, { anchor: new THREE.Vector3(0, 0, 0) });
    weather(ps, snowSpec);
    for (let i = 0; i < 30; i++) ps.update(0.01); // 交叉淡化中途
    weather(ps, snowSpec); // 快速 retarget：新旧共存（793×2）
    weather(ps, snowSpec); // 三套共存（793×3=2379 + 场景 18 < 4096）
    for (let i = 0; i < 60; i++) ps.update(0.01); // 淡化收尾回收
    const poolWarns = cap.warns.filter((w) => w.includes('[particles]'));
    check('A2b 4096 容量 + 三雪共存 + 排帧回收：零池告警', poolWarns.length === 0, poolWarns.join(' | ') || '无');
    cap.restore();
    ps.dispose();
  }

  /* A3 freeRange 相邻段归并（cap=2048 下可判定的单元断言）：两相邻 793 段释放后，
     want=1024 的申请应命中归并大段而非尾部 452 残段（无归并时必告警降级） */
  {
    const cap = captureWarns();
    const ps = new ParticleSystem(new RhythmClock(), { capacity: 2048 });
    const a = ps.add(snowSpec, { anchor: new THREE.Vector3(0, 1, 0) }); // 793（top 0→793）
    const b = ps.add(snowSpec, { anchor: new THREE.Vector3(0, 1, 0) }); // 793（793→1586，相邻）
    const c = ps.add(steamSpec, { anchor: new THREE.Vector3(0, 0, 0) }); // 10（1586→1596）
    a.dispose(); b.dispose(); c.dispose(); // free：{0,793}{793,793}{1586,10} → 归并 {0,1596}
    const big = ps.add(
      { ...snowSpec, rate: 250 }, // want=ceil(250×4.4)=1100 → 钳到 1024
      { anchor: new THREE.Vector3(0, 1, 0) },
    );
    const hit = cap.warns.find((w) => w.includes('粒子池容量不足'));
    check('A3 相邻空闲段归并：释放 793×2+10 后 want=1024 申请整段命中（无降级告警）',
      hit === undefined && ps.emitterCount === 1, hit ?? `emitters=${ps.emitterCount}`);
    cap.restore();
    big.dispose();
    ps.dispose();
  }
}

/* ============================== 段 B/C/D：Director 全链（真注册表/真帧序钩子） ============================== */
console.log('-- 段 B/C/D Director 全链：低帧率 FadeSwap / 崩溃兜底 / 高帧率对照 --');
{
  const { Director } = await import('@/core/director');
  const { sceneRegistry } = await import('@/content/scenes/registry');
  const { vehicleRegistry } = await import('@/content/vehicles/registry');
  const { timeRegistry } = await import('@/content/times/registry');
  const { weatherRegistry } = await import('@/content/weathers/registry');

  const makeDirector = () => {
    const engineDuck = {
      scene: new THREE.Scene(),
      camera: new THREE.PerspectiveCamera(),
      hooks: { clock: null, transition: null, systems: [], scene: [] },
    };
    const director = new Director({ engine: engineDuck, sceneRegistry, vehicleRegistry, timeRegistry, weatherRegistry });
    director.start();
    return { director, engineDuck };
  };
  // 帧步（engine.tick 同序 ①-④，无 render；dt 为「引擎钳制后帧间隔」——低帧率=0.1 恒步）
  const step = (engineDuck, dt) => {
    const e = engineDuck.hooks;
    e.clock?.(dt, 0);
    e.transition?.(dt, 0);
    for (const h of e.systems) h(dt, 0);
    for (const h of e.scene) h(dt, 0);
  };
  const runFrames = (engineDuck, n, dt) => { for (let i = 0; i < n; i++) step(engineDuck, dt); };
  const sceneRoot = (engineDuck, id) => engineDuck.scene.children.find((o) => o.name === `scene/${id}`) ?? null;
  const vehicleRoot = (engineDuck, id) => engineDuck.scene.children.find((o) => o.name === `vehicle/${id}`) ?? null;
  // 孤儿根=仍挂 scene 图且 visible=false 的 scene/vehicle 根（崩溃残留特征；过渡中半成品根由断言上下文区分）
  const hiddenRoots = (engineDuck) =>
    engineDuck.scene.children.filter((o) => /^(scene|vehicle)\//.test(o.name) && o.visible === false).map((o) => o.name);

  const spyActivation = (director) => {
    const calls = [];
    const orig = director.activateScene;
    director.activateScene = function (...args) { calls.push(orig.apply(this, args)); return calls[calls.length - 1]; };
    return { calls, restore: () => { director.activateScene = orig; } };
  };

  /* 段 B：Q7 复现口径（dt 恒 0.1）低帧率场景切换 seacliff→pineforest */
  console.log('  -- 段 B 低帧率（dt=0.1 恒步，≤13fps 被 MAX_FRAME_DT 钳制的等效引擎时间线） --');
  {
    const cap = captureWarns();
    const { director: d, engineDuck: eng } = makeDirector();
    d.applyState(); // 默认 seacliff + classC + dusk + clear（同步装配）
    runFrames(eng, 5, 1 / 60);

    const spy = spyActivation(d);
    let err = null;
    try {
      d.applyState({ scene: 'pineforest' });
      runFrames(eng, 3, 0.1); // 帧 1-3：引擎时间 300ms（旧代码在此处必 throw——stage2 未建即激活）
    } catch (e) { err = e; }
    check('B1 低帧率前 3 帧（300ms）无 throw（修复前此处 100% 抛「装配未完成」）', err === null, err?.message ?? '');
    check('B2 第 3 帧时未提前卸载/激活（仍 seacliff——闸等待 stage2 完成）', d.scene?.id === 'seacliff', `scene=${d.scene?.id}`);

    let err2 = null;
    try { runFrames(eng, 4, 0.1); } catch (e) { err2 = e; } // 帧 4-7：激活+淡入+完成
    check('B3 激活恰好一次且发生在全部 3 stage 完成后（第 4 帧=400ms）', err2 === null && spy.calls.length === 1, `calls=${spy.calls.length} err=${err2?.message ?? ''}`);
    check('B4 切换完成：pineforest 在场且 visible=true（不再「车浮在纯色底上」）',
      d.scene?.id === 'pineforest' && d.scene.root.visible === true && sceneRoot(eng, 'pineforest') !== null);
    check('B5 旧根已卸载（scene/seacliff 摘出）', sceneRoot(eng, 'seacliff') === null);
    check('B6 无隐藏孤儿根（完成态 scene 图干净）', hiddenRoots(eng).length === 0, hiddenRoots(eng).join(','));
    check('B7 无悬挂装配作用域（openScopes=0，资源账目闭合）', d.assets.stats().openScopes === 0, JSON.stringify(d.assets.stats()));
    const poolWarns = cap.warns.filter((w) => w.includes('[particles]'));
    check('B8 全程零粒子池告警', poolWarns.length === 0, poolWarns.join(' | ') || '无');
    cap.restore();
    spy.restore();
    d.dispose();
  }

  /* 段 C：激活崩溃兜底（placeVehicle 注入 throw）——孤儿根回收 + 错误如实上抛 + runner 不挂起 */
  console.log('  -- 段 C 激活崩溃兜底（placeVehicle 注入 throw，模拟任意激活期崩溃） --');
  {
    const { director: d, engineDuck: eng } = makeDirector();
    d.applyState();
    runFrames(eng, 5, 1 / 60);

    const origPlace = d.placeVehicle;
    d.placeVehicle = () => { throw new Error('simulated-activation-crash'); };
    d.applyState({ scene: 'wasteland' });
    let thrown = null;
    try { runFrames(eng, 8, 0.1); } catch (e) { thrown = e; }
    check('C1 激活崩溃错误如实上抛（不吞错，冒泡到帧循环）', thrown?.message === 'simulated-activation-crash', thrown?.message ?? '未抛错');
    d.placeVehicle = origPlace;
    check('C2 半成品新根已摘出 scene 图（无隐藏 scene/* 孤儿）', hiddenRoots(eng).length === 0, hiddenRoots(eng).join(','));
    check('C3 旧根已按卸载路径移除（scene/seacliff 不在）', sceneRoot(eng, 'seacliff') === null);
    check('C4 director.scene 不指向已丢弃会话（=null，激活中途崩溃）', d.scene === null, `scene=${d.scene?.id ?? 'null'}`);
    check('C5 无悬挂装配作用域（scope 已释放，openScopes=0）', d.assets.stats().openScopes === 0, JSON.stringify(d.assets.stats()));
    let again = null;
    try { runFrames(eng, 10, 0.1); } catch (e) { again = e; }
    check('C6 后续帧不再重复抛错（runner 作废清零、不挂起）', again === null, again?.message ?? '');
    check('C7 sceneSwap 已清空（下次切换可正常发起）', d.sceneSwap === null);
    d.dispose();
  }

  /* 段 D：高帧率对照（行为不变）+ 低帧率车型切换 + 天气快速三连 retarget（实机证据组合） */
  console.log('  -- 段 D 高帧率对照 + 车型低帧率 + 天气三连 retarget --');
  {
    const cap = captureWarns();
    const { director: d, engineDuck: eng } = makeDirector();
    d.applyState();
    runFrames(eng, 10, 1 / 60);

    const spy = spyActivation(d);
    let err = null;
    try { d.applyState({ scene: 'pineforest' }); runFrames(eng, 60, 1 / 60); } catch (e) { err = e; }
    check('D1 高帧率（60fps）场景切换无 throw、行为不变', err === null && d.scene?.id === 'pineforest', err?.message ?? '');
    check('D2 高帧率激活时机不变（首个 elapsed≥300ms 帧即激活，不再推迟）', spy.calls.length === 1);
    spy.restore();

    let errV = null;
    // 注：applyState 为全组合下发（patch 未给维度取 isDefault）——场景须随补丁显式带上（同 verify-t31 注记）
    try { d.applyState({ scene: 'pineforest', vehicle: 'classA' }); runFrames(eng, 8, 0.1); } catch (e) { errV = e; }
    check('D3 低帧率车型切换（2 stage）无 throw、完成在场', errV === null && d.vehicle?.id === 'classA'
      && d.vehicle.root.visible === true, errV?.message ?? '');
    check('D4 无隐藏孤儿根（车型切换后）', hiddenRoots(eng).length === 0, hiddenRoots(eng).join(','));

    // 天气快速连点（雨→雪→雨→雪：交叉淡化新旧集合共存，实机告警组合的加强复现）
    let errW = null;
    try {
      d.applyState({ scene: 'pineforest', weather: 'rain' });
      runFrames(eng, 5, 0.1);
      d.applyState({ scene: 'pineforest', weather: 'snow' });
      runFrames(eng, 1, 0.1);
      d.applyState({ scene: 'pineforest', weather: 'rain' });
      d.applyState({ scene: 'pineforest', weather: 'snow' });
      runFrames(eng, 60, 0.1);
    } catch (e) { errW = e; }
    const poolWarns = cap.warns.filter((w) => w.includes('[particles]'));
    check('D5 天气雨⇄雪快速连点（共存期加强复现）无 throw、零池告警', errW === null && poolWarns.length === 0,
      `${errW?.message ?? ''} ${poolWarns.join(' | ')}`);
    check('D6 收敛后场景保持在场且无孤儿根', d.scene?.id === 'pineforest' && hiddenRoots(eng).length === 0,
      `scene=${d.scene?.id} hidden=${hiddenRoots(eng).join(',')}`);
    cap.restore();
    d.dispose();
  }
}

console.log(`\n== verify-fix-q7-orphan-pool: pass=${pass} fail=${fail} ==`);
process.exit(fail > 0 ? 1 : 0);
