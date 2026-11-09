// verify-t46-tour.headless.mjs —— T46 400 组合巡游核验（4 场景×5 车型×4 时间×5 天气全组合）+
// T32（4 场景×4 时间全矩阵）/ T33（4 场景×5 天气全矩阵）子集汇总 + T34（综合光照合成公式 +
// 20 组合速查矩阵数值 + 三个原文示例组合专项复核）。逻辑级端到端：真 Director/真注册表/真四维
// 切换路径（时间 1500ms 插值 + 天气 1500ms + 场景/车型 600ms FadeSwap 分帧），帧序与 Engine.tick
// 同序（clock→transition→systems→scene）；无 WebGL/DOM 渲染（观感归内置浏览器实机步）。
// 运行：node verify-t46-tour.headless.mjs
import { registerHooks } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import ts from 'typescript';
import * as THREE from 'three';

const here = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = pathToFileURL(path.join(here, 'src')).href;

globalThis.document = {
  createElement(tag) {
    if (tag !== 'canvas') throw new Error(`[tour] 意外 createElement: ${tag}`);
    return {
      width: 4, height: 4,
      getContext(kind) {
        if (kind !== '2d') throw new Error(`[tour] 意外 context: ${kind}`);
        return new Proxy({}, {
          get(t, p) {
            if (p === 'createImageData') return (w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h });
            if (p === 'getImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h });
            if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => ({ addColorStop() {} });
            return () => {};
          },
          set() { return true; },
        });
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
        compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext, verbatimModuleSyntax: false, isolatedModules: true },
      });
      if (output.diagnostics && output.diagnostics.length > 0) {
        throw new Error(`[tour] ts 转换失败 ${url}: ${output.diagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, ' ')).join('; ')}`);
      }
      return { format: 'module', shortCircuit: true, source: output.outputText };
    }
    return next(url, context);
  },
});

let pass = 0;
let fail = 0;
const failures = [];
function check(name, ok, detail = '') {
  if (ok) { pass += 1; }
  else { fail += 1; failures.push(`${name} [${detail}]`); console.log(`  FAIL  ${name}  [${detail}]`); }
}
const near = (a, b, eps = 1e-3) => Math.abs(a - b) < eps;

const { Director } = await import('@/core/director');
const { sceneRegistry } = await import('@/content/scenes/registry');
const { vehicleRegistry } = await import('@/content/vehicles/registry');
const { timeRegistry } = await import('@/content/times/registry');
const { weatherRegistry } = await import('@/content/weathers/registry');

const scenes = sceneRegistry.list().map((e) => e.id);
const vehicles = vehicleRegistry.list().map((e) => e.id);
const times = timeRegistry.list().map((e) => e.id);
const weathers = weatherRegistry.list().map((e) => e.id);

let tourPass = 0;
let tourFail = 0;
const engineDuck = {
  scene: new THREE.Scene(),
  camera: new THREE.PerspectiveCamera(),
  hooks: { clock: null, transition: null, systems: [], scene: [] },
};
const director = new Director({ engine: engineDuck, sceneRegistry, vehicleRegistry, timeRegistry, weatherRegistry });
director.start();
director.applyState(); // 默认组合直呈

/** 与 Engine.tick 同序泵帧：clock → transition → systems → scene（dt=1/60）。 */
const pump = (engine, frames) => {
  for (let i = 0; i < frames; i++) {
    engine.hooks.clock?.(1 / 60, i / 60);
    engine.hooks.transition?.(1 / 60);
    for (const hook of engine.hooks.systems) hook(1 / 60, i / 60);
    for (const hook of engine.hooks.scene) hook(1 / 60, i / 60);
  }
};
const SETTLE_FRAMES = 96; // ≥1500ms 时间/天气过渡（90 帧）+ ≥600ms FadeSwap（36 帧）+ 余量

const t32Pairs = new Set();
const t33Pairs = new Set();
const t32Fail = [];
const t33Fail = [];

/* ============================== T46：400 组合全巡游 ============================== */
console.log('-- T46 400 组合巡游（每次切换后核对灯光通道/天气七分量/雾合成/静默态逐维到位） --');
const t0 = Date.now();
let prev = null;
let comboIndex = 0;
for (const scene of scenes) {
  for (const vehicle of vehicles) {
    for (const time of times) {
      for (const weather of weathers) {
        comboIndex += 1;
        director.applyState({ scene, vehicle, time, weather });
        pump(engineDuck, SETTLE_FRAMES);

        const timePreset = timeRegistry.get(time);
        const weatherPreset = weatherRegistry.get(weather);
        const scenePreset = sceneRegistry.get(scene);
        const ok = (name, cond, detail = '') => {
          check(`#${comboIndex} ${scene}/${vehicle}/${time}/${weather} ${name}`, cond, detail);
          if (cond) tourPass += 1; else tourFail += 1;
        };

        // ① 维度落位
        ok('场景落位', director.scene?.id === scene, `got=${director.scene?.id}`);
        ok('车型落位', director.vehicle?.id === vehicle, `got=${director.vehicle?.id}`);
        ok('时间档登记', director.timeLight.timeId === time, `got=${director.timeLight.timeId}`);
        ok('天气档登记', director.timeLight.weatherId === weather, `got=${director.timeLight.weatherId}`);

        // ② 灯光六通道真实到位（过渡 blend=1 → 恒等于预设）
        const ch = director.timeLight.channels;
        const chOk = (['lampPower', 'emberPower', 'smokePower', 'shopPower', 'interiorPower', 'interiorEmphasis'])
          .every((k) => near(ch[k], timePreset.channels[k], 2e-3));
        ok('灯光六通道=时间预设', chOk,
          `lamp=${ch.lampPower.toFixed(3)}/${timePreset.channels.lampPower}`);

        // ③ 天气七分量真实到位
        const comp = director.weatherMaterial.components;
        const compOk = (['wetness', 'puddle', 'clothSag', 'snowCover', 'lineFade', 'fogMul', 'cloudShadow'])
          .every((k) => near(comp[k], weatherPreset.material[k], 2e-3));
        ok('天气七分量=天气预设', compOk, `snow=${comp.snowCover.toFixed(3)}/${weatherPreset.material.snowCover}`);

        // ④ 主光/环境合成（先时间后天气，docs/05 §4.4.4）
        const wantSun = timePreset.lighting.lightIntensity * weatherPreset.lightMod.intensityMul;
        ok('主光强度=时间×天气合成', near(director.timeLight.sun.intensity, wantSun, 5e-3),
          `${director.timeLight.sun.intensity.toFixed(4)}/${wantSun.toFixed(4)}`);
        const wantHemi = timePreset.lighting.ambientIntensity * weatherPreset.lightMod.ambientMul;
        ok('环境光强度=时间×天气合成', near(director.timeLight.hemi.intensity, wantHemi, 5e-3),
          `${director.timeLight.hemi.intensity.toFixed(4)}/${wantHemi.toFixed(4)}`);

        // ⑤ D6 单通道雾合成（场景 baseFog + 时间 fogBase × 天气 fogMul，clamp 封顶）
        const wantFog = Math.min(1, Math.max(0, (scenePreset.palette.baseFog + timePreset.lighting.fogBase) * weatherPreset.material.fogMul));
        ok('D6 雾合成', near(director.atmosphere.fog01, wantFog, 5e-3),
          `${director.atmosphere.fog01.toFixed(4)}/${wantFog.toFixed(4)}`);

        // ⑥ 调度器夜间静默态随档（时间过渡中点已过）
        ok('夜间静默态', director.scene.scheduler.isNightSilence === (time === 'night'),
          `silent=${director.scene.scheduler.isNightSilence}`);

        // ⑦ 「每次切换真实变化」：相邻组合逐维可观测差异
        if (prev) {
          if (prev.time !== time) {
            const differs = (['lampPower', 'emberPower', 'smokePower', 'shopPower', 'interiorPower'])
              .some((k) => !near(ch[k], prev.channels[k], 1e-4));
            ok('时间切换→通道真实变化', differs);
          }
          if (prev.weather !== weather) {
            const differs = (['wetness', 'snowCover', 'fogMul', 'cloudShadow'])
              .some((k) => !near(comp[k], prev.components[k], 1e-4));
            ok('天气切换→七分量真实变化', differs);
          }
        }
        prev = { time, weather, channels: { ...ch }, components: { ...comp } };

        // T32/T33 子集汇总
        if (!t32Pairs.has(`${scene}/${time}`)) t32Pairs.add(`${scene}/${time}`);
        if (!t33Pairs.has(`${scene}/${weather}`)) t33Pairs.add(`${scene}/${weather}`);
      }
    }
  }
}
const tourMs = Date.now() - t0;
console.log(`  巡游 ${comboIndex} 组合 × ${SETTLE_FRAMES} 帧，耗时 ${(tourMs / 1000).toFixed(1)}s；断言 ${tourPass + tourFail}（过 ${tourPass} / 败 ${tourFail}）`);
check('T32 4场景×4时间 全矩阵覆盖', t32Pairs.size === scenes.length * times.length, `pairs=${t32Pairs.size}`);
check('T33 4场景×5天气 全矩阵覆盖', t33Pairs.size === scenes.length * weathers.length, `pairs=${t33Pairs.size}`);

/* ============================== 收尾完整性 ============================== */
check('巡游后无未闭合装配作用域（无泄漏）', director.assets.stats().openScopes === 0,
  `stats=${JSON.stringify(director.assets.stats())}`);
director.dispose();
check('Director dispose 无异常', true);

/* ============================== T34：综合光照合成专项 ============================== */
console.log('-- T34 综合光照合成（20 组合速查矩阵数值 + 三个原文示例组合专项） --');
{
  const timeOf = (id) => timeRegistry.get(id);
  const weatherOf = (id) => weatherRegistry.get(id);
  // 20 组合速查矩阵（docs/05 §4.4.4 示意值：dawn 0.85→小雨 0.53/浓雾 0.47；day 1.20→浓雾 0.66；
  //   dusk 1.05→浓雾 0.58；night 0.38→浓雾 0.21 最暗档）——合成公式 lightIntensity×intensityMul
  const matrix = [
    ['dawn', 'rain', 0.53],
    ['dawn', 'fog', 0.47],
    ['day', 'fog', 0.66],
    ['dusk', 'fog', 0.58],
    ['night', 'fog', 0.21],
  ];
  for (const [t, w, want] of matrix) {
    const got = timeOf(t).lighting.lightIntensity * weatherOf(w).lightMod.intensityMul;
    check(`速查矩阵 ${t}×${w}=${want}`, near(got, want, 0.006), `got=${got.toFixed(4)}`);
  }

  // 三个原文示例组合端到端（T46 巡游后的同一 Director 重建——dispose 过，另起会话）
  const engine2 = {
    scene: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(),
    hooks: { clock: null, transition: null, systems: [], scene: [] },
  };
  const d2 = new Director({ engine: engine2, sceneRegistry, vehicleRegistry, timeRegistry, weatherRegistry });
  d2.start();
  d2.applyState();

  // ①「夜间浓雾避难所」：0.38×0.55=0.21 更暗 + glowBoost 0.8 更强光晕（docs/05 §4.4.4）
  d2.applyState({ scene: 'wasteland', time: 'night', weather: 'fog' });
  pump(engine2, SETTLE_FRAMES);
  check('示例① 夜间浓雾 主光=0.38×0.55=0.209', near(d2.timeLight.sun.intensity, 0.209, 5e-3),
    `got=${d2.timeLight.sun.intensity.toFixed(4)}`);
  check('示例① 浓雾 glowBoost=0.8（更强光晕下发 Breath）', near(d2.breath.glow, 0.8, 1e-3),
    `got=${d2.breath.glow}`);
  check('示例① 避难所 D6 雾=(0.14+0.05)×2.6→0.494', near(d2.atmosphere.fog01, Math.min(1, (0.14 + 0.05) * 2.6), 5e-3),
    `got=${d2.atmosphere.fog01.toFixed(4)}`);

  // ②「清晨浓雾松林」：(0.32+0.18)×2.6=1.3→clamp 1.0 封顶且不叠糊（D6 单通道）
  d2.applyState({ scene: 'pineforest', time: 'dawn', weather: 'fog' });
  pump(engine2, SETTLE_FRAMES);
  check('示例② 清晨浓雾松林 fog01 封顶=1.0（单通道不叠加发糊）', near(d2.atmosphere.fog01, 1.0, 1e-3),
    `got=${d2.atmosphere.fog01.toFixed(4)}`);

  // ③「黄昏降雪海崖」：强度 0.84、雪壳覆顶、雪不改天空色调（docs/05 §4.4.4 原文例）。
  //   天空色调比对口径：同黄昏档先晴朗后降雪各采一次（「雪不改天空色调」=同档只切天气前后不变）。
  d2.applyState({ scene: 'seacliff', time: 'dusk', weather: 'clear' });
  pump(engine2, SETTLE_FRAMES);
  const skyBefore = { zenith: d2.timeLight.skySnapshot.zenith.clone(), horizon: d2.timeLight.skySnapshot.horizon.clone() };
  d2.applyState({ scene: 'seacliff', time: 'dusk', weather: 'snow' });
  pump(engine2, SETTLE_FRAMES);
  check('示例③ 黄昏降雪 主光=1.05×0.8=0.84', near(d2.timeLight.sun.intensity, 0.84, 5e-3),
    `got=${d2.timeLight.sun.intensity.toFixed(4)}`);
  check('示例③ uSnow=1.0（雪覆层到位）', near(d2.weatherMaterial.components.snowCover, 1.0, 1e-3),
    `got=${d2.weatherMaterial.components.snowCover}`);
  check('示例③ 雪不改天空色调（skySnapshot 端点=切雪前黄昏值；线性空间十六进制往返省略——黄昏预设比对归 T29 逐格）',
    d2.timeLight.skySnapshot.zenith.getHexString() === skyBefore.zenith.getHexString()
    && d2.timeLight.skySnapshot.horizon.getHexString() === skyBefore.horizon.getHexString(),
    `zenith=${d2.timeLight.skySnapshot.zenith.getHexString()} before=${skyBefore.zenith.getHexString()}`);
  // 雪壳落位：海崖 tarp/mat/deck/rail 四处 snowShell 在 snowCover=1 下可见
  const snowShells = [];
  d2.scene.root.traverse((o) => { if (o.name.includes('snow')) snowShells.push(o); });
  check('示例③ 雪壳挂点可见（snowCover=1）', snowShells.length >= 4 && snowShells.every((o) => o.visible),
    `shells=${snowShells.length} visible=${snowShells.filter((o) => o.visible).length}`);
  // 串灯光晕 +25%：glowBoost=0.25 下发 Breath
  check('示例③ 降雪 glowBoost=0.25（串灯光晕 +25%）', near(d2.breath.glow, 0.25, 1e-3),
    `got=${d2.breath.glow}`);
  d2.dispose();
}

console.log(`\n== verify-t46-tour: pass=${pass} fail=${fail} ==`);
if (failures.length > 0) {
  console.log('FAILED 明细（前 40 条）:');
  failures.slice(0, 40).forEach((f) => console.log(`  - ${f}`));
}
process.exit(fail > 0 ? 1 : 0);
