// verify-fix-decals-persist.headless.mjs —— 打磨轮次 1：天气面贴花跨场景持久化 A/B 无头核验（无 WebGL）。
// 实机问题：任意一次场景切换后 weather/cloudShadow（云影 quad）+ weather/reflectionStrips（湿地反光条）
//   永久丢失，仅启动场景持有（t42 反光条/T33 云影在切换后失效）。
// 代码根因（实机申报同源）：buildSceneStage stage0 `weatherMaterial.attach(新根)`（director.ts:754）把
//   weatherMaterial.root 重指新根并移走两容器（weatherMaterial.ts:400-407）→ unloadScene 随后调
//   `detach()`（director.ts:823）按重指后的 this.root 把两容器从新根摘下（weatherMaterial.ts:409-414），
//   activateScene 不补挂；且 clearRegistrations（weatherMaterial.ts:485-487）连带清空反光条注册
//   （registeredLamps/strips），★T20 补偿只重注册 weatherSurfaces。
// 修复口径：activateScene 统一补挂——attach(新根) 幂等归位 + registerReflectionLamps 按新场景灯位重建。
// 运行：node verify-fix-decals-persist.headless.mjs（module.registerHooks 转译 @/ 别名，同 verify-t31 模式）。
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
    if ((specifier.startsWith('./') || specifier.startsWith('../../')) && context.parentURL) {
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

/* ============================== A/B：启动态 vs 切换后（实机同口径） ============================== */
console.log('-- 天气面贴花持久化：启动态在场 → 切换 servicearea·night·rain 后仍须在场 --');
{
  const { Director } = await import('@/core/director');
  const { sceneRegistry } = await import('@/content/scenes/registry');
  const { vehicleRegistry } = await import('@/content/vehicles/registry');
  const { timeRegistry } = await import('@/content/times/registry');
  const { weatherRegistry } = await import('@/content/weathers/registry');

  const engineDuck = {
    scene: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(),
    hooks: { clock: null, transition: null, systems: [], scene: [] },
  };
  const director = new Director({ engine: engineDuck, sceneRegistry, vehicleRegistry, timeRegistry, weatherRegistry });
  director.start();
  const step = (dt) => {
    const e = engineDuck.hooks;
    e.clock?.(dt, 0);
    e.transition?.(dt, 0);
    for (const h of e.systems) h(dt, 0);
    for (const h of e.scene) h(dt, 0);
  };
  const runFrames = (n, dt) => { for (let i = 0; i < n; i++) step(dt); };

  const decalsOf = (rootId) => {
    const root = engineDuck.scene.children.find((o) => o.name === `scene/${rootId}`) ?? null;
    if (!root) return null;
    return {
      cloudShadow: root.children.some((o) => o.name === 'weather/cloudShadow'),
      reflectionStrips: root.children.some((o) => o.name === 'weather/reflectionStrips'),
      childNames: root.children.map((o) => o.name).join(','),
    };
  };

  /* A：启动态（实机 A 组）——seacliff 默认组合，两贴花容器在场 */
  director.applyState(); // 默认 seacliff + classC + dusk + clear
  runFrames(20, 1 / 60);
  const bootDecals = decalsOf('seacliff');
  check('A1 启动态：scene/seacliff 根下 weather/cloudShadow 在场', bootDecals?.cloudShadow === true, bootDecals?.childNames ?? 'root 缺失');
  check('A2 启动态：weather/reflectionStrips 在场', bootDecals?.reflectionStrips === true);
  check('A3 启动态：反光条注册 ≥1（seacliff castReflection 灯）', director.weatherMaterial.strips.length >= 1,
    `strips=${director.weatherMaterial.strips.length}`);

  /* B：切换 servicearea·night·rain（实机 B 组，wetness=1.0）——两贴花必须随新根持久 */
  // 注：applyState 全组合下发（patch 未给维度取 isDefault）——四维显式带上
  director.applyState({ scene: 'servicearea', vehicle: 'classC', time: 'night', weather: 'rain' });
  runFrames(100, 1 / 60); // FadeSwap 600ms + 天气过渡 1500ms + 余量
  const svcDecals = decalsOf('servicearea');
  const wm = director.weatherMaterial;
  check('B1 切换后：scene/servicearea 根下 weather/cloudShadow 在场（修复点①）', svcDecals?.cloudShadow === true, svcDecals?.childNames ?? 'root 缺失');
  check('B2 切换后：weather/reflectionStrips 在场（修复点①）', svcDecals?.reflectionStrips === true);
  check('B3 切换后：weatherMaterial.root 重指 servicearea 根', wm.root === engineDuck.scene.children.find((o) => o.name === 'scene/servicearea') ?? null);
  check('B4 切换后：反光条注册 ≥1（加油机灯重建，修复点②）', wm.strips.length >= 1, `strips=${wm.strips.length}`);
  check('B5 雨天 wetness 收敛 >0.9（功能本体正常性对照）', wm.components.wetness > 0.9, `wetness=${wm.components.wetness.toFixed(2)}`);
  check('B6 当前场景=servicearea（切换本身成功）', director.scene?.id === 'servicearea');

  /* C：再切回 seacliff·night·rain——多轮切换后仍持久（排除「仅首切偶发」） */
  director.applyState({ scene: 'seacliff', vehicle: 'classC', time: 'night', weather: 'rain' });
  runFrames(100, 1 / 60);
  const backDecals = decalsOf('seacliff');
  check('C1 二次切回：seacliff 根下两贴花仍在场', backDecals?.cloudShadow === true && backDecals?.reflectionStrips === true,
    backDecals?.childNames ?? 'root 缺失');
  check('C2 二次切回：反光条注册重建 ≥1', wm.strips.length >= 1, `strips=${wm.strips.length}`);
  check('C3 全程无隐藏孤儿根', engineDuck.scene.children.filter((o) => /^scene\//.test(o.name) && o.visible === false).length === 0);
  // 鬼影/泄漏防护：stripsGroup 内 mesh 数须=注册记录数（clearRegistrations 摘除+释放自建 mesh，
  // 切换残留的旧灯位条以冻结 opacity 重现即鬼影）
  check('C4 反光条 mesh 数=注册数（无跨场景残留鬼影 mesh）',
    wm.stripsGroup.children.length === wm.strips.length,
    `meshes=${wm.stripsGroup.children.length} records=${wm.strips.length}`);

  director.dispose();
}

console.log(`\n== verify-fix-decals-persist: pass=${pass} fail=${fail} ==`);
process.exit(fail > 0 ? 1 : 0);
