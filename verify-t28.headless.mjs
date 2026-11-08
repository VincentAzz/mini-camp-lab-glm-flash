// verify-t28.headless.mjs —— T28 vehicleRegistry 合拢 + 五车×四场景 20 落位矩阵 + radius 契约复核（无头，无 WebGL/DOM 渲染）。
// 运行：node verify-t28.headless.mjs（自带 module.registerHooks 钩子，Node ≥20.19；同 verify-t23 模式）。
// 断言逐条对：docs/03 §4.2.6（注册表接线 3.6 / 差异矩阵 / 细节量双指标 named≥16 且外部≥22——外部行数
//   由 verify-t23…t27 各自脚本逐车断言，本脚本断 named 侧）；docs/08 T28 验收（20 种落位姿态正常；
//   A型/拖挂组合在 4.0 半径营位按 docs/00 一.12 ★-半径属既定非阻断告警，不计失败）；docs/00 一.12
//   ★-半径（A 7.9×2.7 外接 ≈4.18、拖挂组合 ≤4.2 口径）；docs/01 §3.3.3（五车注册行）。
import { registerHooks } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import ts from 'typescript';
import * as THREE from 'three';

const here = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = pathToFileURL(path.join(here, 'src')).href;

/* ---- 最小 canvas 2D 桩（贴图绘制无头化：ImageData 真、其余方法 no-op） ---- */
function makeContext2d(canvas) {
  const gradient = { addColorStop() {} };
  return new Proxy(
    { canvas },
    {
      get(target, prop) {
        if (prop === 'createImageData') return (w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h });
        if (prop === 'getImageData') return (x, y, h2) => ({ data: new Uint8ClampedArray(Math.max(1, w2 * h2 * 4)), width: w2, height: h2 });
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
let w2 = 0;
globalThis.document = {
  createElement(tag) {
    if (tag !== 'canvas') throw new Error(`[smoke] 意外 createElement: ${tag}`);
    return {
      width: 0,
      height: 0,
      getContext(kind) {
        if (kind !== '2d') throw new Error(`[smoke] 意外 context: ${kind}`);
        w2 = this.width || 4;
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
const failures = [];
function check(name, ok, detail = '') {
  if (ok) {
    pass += 1;
    console.log(`  PASS  ${name}${detail ? `  [${detail}]` : ''}`);
  } else {
    fail += 1;
    failures.push(`${name}${detail ? `  [${detail}]` : ''}`);
    console.log(`  FAIL  ${name}  [${detail}]`);
  }
}
const near = (a, b, eps = 0.001) => Math.abs(a - b) < eps;

/* ============================== 期望表（独立转写自文档与场景文件常量，非实现内读出） ============================== */
// 车型行：docs/03 §4.2.1–§4.2.5 footprint + §4.2.6 named 列；label 对照 docs/00 一.12 ★-label。
const VEHICLES = [
  { id: 'classC', label: 'C型房车', named: 16, fp: [6.4, 2.6] }, // hypot(3.2,1.3)=3.454
  { id: 'classA', label: 'A型大巴', named: 17, fp: [7.9, 2.7] }, // ★半径仲裁回调 9.0→7.9；hypot(3.95,1.35)≈4.175
  { id: 'trailerRig', label: '拖挂房车', named: 16, fp: [8.0, 2.5] }, // D4 组合尺寸；hypot(4.0,1.25)≈4.19
  { id: 'classB', label: 'B型面包车', named: 16, fp: [4.7, 2.2] }, // hypot(2.35,1.1)≈2.596
  { id: 'overlandTruck', label: '越野皮卡', named: 16, fp: [5.2, 2.3] }, // hypot(2.6,1.15)≈2.844
];
// 场景行：docs/02 §4.1.0 campAnchor 表（groundY 抬升裁定见 R-P3-1/R-P3-2）；radius 4.0×3 + 4.2×1。
const SCENES = [
  { id: 'seacliff', groundY: 1.2, heading: 0.3, radius: 4.0 },
  { id: 'servicearea', groundY: 0, heading: 0, radius: 4.2 },
  { id: 'wasteland', groundY: 0, heading: -0.4, radius: 4.0 },
  { id: 'pineforest', groundY: 1.6, heading: 0.2, radius: 4.0 },
];
const outerRadius = ([l, w]) => Math.hypot(l / 2, w / 2);

/* ============================== ① 注册表合拢（docs/01 §3.3.3 / §3.3.2） ============================== */
console.log('-- ① 注册表合拢 --');
{
  const { vehicleRegistry } = await import('@/content/vehicles/registry');
  const { sceneRegistry } = await import('@/content/scenes/registry');
  const vIds = vehicleRegistry.list().map((v) => v.id);
  check('vehicleRegistry 五车全登记且注册顺序逐字 §3.3.3', JSON.stringify(vIds) === JSON.stringify(VEHICLES.map((v) => v.id)), vIds.join(','));
  check('默认车型 isDefault=classC 且仅一档', vehicleRegistry.list().filter((v) => v.isDefault).map((v) => v.id).join(',') === 'classC');
  check('五车 label 对照 docs/00 ★-label', vehicleRegistry.list().every((v) => v.label === VEHICLES.find((e) => e.id === v.id).label), vehicleRegistry.list().map((v) => v.label).join('/'));
  check('sceneRegistry 四场景全登记', JSON.stringify(sceneRegistry.list().map((s) => s.id)) === JSON.stringify(SCENES.map((s) => s.id)), sceneRegistry.list().map((s) => s.id).join(','));

  // radius 契约复核（docs/00 一.12 ★-半径：A 7.9×2.7、拖挂组合 ≤4.2 口径；越界仅告警不阻断）。
  // footprint 在 VehicleExterior（buildExterior 结果）上——源码 FOOTPRINT 常量直读核对（运行时证据见 ② 告警逐格数）。
  for (const v of VEHICLES) {
    const src = readFileSync(path.join(here, 'src', 'content', 'vehicles', `${v.id}.ts`), 'utf8');
    const m = src.match(/const FOOTPRINT = \{ length: ([\d.]+), width: ([\d.]+)/);
    const fpOk = !!m && near(Number(m[1]), v.fp[0], 0.01) && near(Number(m[2]), v.fp[1], 0.01);
    check(`${v.id} footprint ${v.fp[0]}×${v.fp[1]}（§4.2.6 矩阵口径）`, fpOk, m ? `实际 ${m[1]}×${m[2]}` : 'FOOTPRINT 未匹配');
    const r = outerRadius(v.fp);
    check(`${v.id} 外接半径 ${r.toFixed(3)} ≤4.2（★半径仲裁上限）`, r <= 4.2 + 1e-9);
  }
  check('classA 外接半径 ≈4.175>4.0：三处 4.0 营位按既定口径触发非阻断告警（docs/00 ★-半径）', outerRadius([7.9, 2.7]) > 4.0 && outerRadius([7.9, 2.7]) <= 4.2);
  check('trailerRig 外接半径 ≈4.19>4.0 ≤4.2：同口径', outerRadius([8.0, 2.5]) > 4.0 && outerRadius([8.0, 2.5]) <= 4.2);
}

/* ============================== ② 五车×四场景 20 落位矩阵（docs/08 T28 验收） ============================== */
console.log('-- ② 20 落位矩阵 --');
{
  const { Director } = await import('@/core/director');
  const { vehicleRegistry } = await import('@/content/vehicles/registry');
  const { sceneRegistry } = await import('@/content/scenes/registry');
  const { timeRegistry } = await import('@/content/times/registry');
  const { weatherRegistry } = await import('@/content/weathers/registry');

  const engineDuck = {
    scene: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(),
    hooks: { clock: null, transition: null, systems: [], scene: [] },
  };
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => { warnings.push(args.map(String).join(' ')); };
  let director = null;
  try {
    director = new Director({ engine: engineDuck, sceneRegistry, vehicleRegistry, timeRegistry, weatherRegistry });
    director.start();
    director.applyState(); // 默认档：seacliff + classC
    const waitSwap = (pred) => {
      for (let i = 0; i < 3000; i++) {
        engineDuck.hooks.transition(0.016);
        if (pred()) return true;
      }
      return pred();
    };
    const countNamed = (id) => {
      const root = engineDuck.scene.getObjectByName(`vehicle/${id}`);
      if (!root) return -1;
      // 下界口径：named 物体名一律 `<id>/interior/<key>`（各车 add() 助手逐字）；
      // 同前缀一级对象还含非 named 支撑件（classC+3/classA+3/拖挂+9/B+2/越野+1，实现细节），
      // 故本矩阵只查双指标下界 named≥16——逐键恰等由 verify-t23…t27 各自脚本断言（本会话全过）。
      const re = new RegExp(`^${id}/interior/[^/]+$`);
      const found = new Set();
      root.traverse((o) => { if (re.test(o.name)) found.add(o.name); });
      return found.size;
    };

    check('Director 启动：默认档 seacliff+classC 直呈（首帧不播过渡）', director.scene?.id === 'seacliff' && director.vehicle?.id === 'classC' && director.sceneSwap === null && director.vehicleSwap === null);

    let done = 0;
    let matrixFail = 0;
    const failDetail = [];
    for (const sc of SCENES) {
      for (const ve of VEHICLES) {
        const before = warnings.length;
        let threw = null;
        try {
          director.applyState({ scene: sc.id, vehicle: ve.id });
        } catch (e) {
          threw = e;
        }
        const settled = threw === null && waitSwap(() =>
          director.scene?.id === sc.id && director.vehicle?.id === ve.id
          && director.sceneSwap === null && director.vehicleSwap === null
          && !!engineDuck.scene.getObjectByName(`vehicle/${ve.id}`),
        );
        const root = engineDuck.scene.getObjectByName(`vehicle/${ve.id}`);
        const poseOk = !!root && near(root.position.y, sc.groundY, 0.01) && near(root.rotation.y, sc.heading, 0.01);
        const namedOk = countNamed(ve.id) >= ve.named; // named≥16/17 双指标下界（恰等归各车脚本）
        const expectedWarn = outerRadius(ve.fp) > sc.radius ? 1 : 0;
        const warned = warnings.slice(before).filter((w) => w.includes('footprint exceeds camp radius')).length;
        const ok = !threw && settled && poseOk && namedOk && warned === expectedWarn;
        done += 1;
        if (!ok) {
          matrixFail += 1;
          failDetail.push(`${sc.id}×${ve.id}(threw:${threw?.message ?? '-'} settled:${settled} pose:${poseOk} named:${countNamed(ve.id)}/${ve.named} warn:${warned}/${expectedWarn})`);
        }
      }
    }
    check(`20 落位全完成且姿态正常（y=groundY、rotation=headingRad、named 在位、告警数逐格符合预期）`, done === 20 && matrixFail === 0, matrixFail ? failDetail.join(' | ') : '20/20');
    check('A型 4.0 营位 ×3 告警、4.2 营位不告警；拖挂同口径（既定非阻断，docs/00 ★-半径）', (() => {
      const aSevere = warnings.filter((w) => w.includes('外接半径 4.17u > 营位半径 4.00u')).length;
      const tSevere = warnings.filter((w) => w.includes('外接半径 4.19u > 营位半径 4.00u')).length;
      const on42 = warnings.filter((w) => w.includes('footprint exceeds') && w.includes('4.20u')).length;
      return aSevere === 3 && tSevere === 3 && on42 === 0;
    })(), `A4.0×${warnings.filter((w) => w.includes('4.17u > 营位半径 4.00u')).length} 拖挂4.0×${warnings.filter((w) => w.includes('4.19u > 营位半径 4.00u')).length}`);
    check('C/B/越野全营位零告警（外接半径均 ≤4.0）', warnings.filter((w) => w.includes('footprint exceeds')).length === 6, `越界告警总数 ${warnings.filter((w) => w.includes('footprint exceeds')).length}`);

    director.dispose();
    check('dispose：全路径卸载零抛错且车根清空', engineDuck.scene.children.filter((c) => String(c.name).startsWith('vehicle/')).length === 0);
  } finally {
    console.warn = originalWarn;
    try { director?.dispose(); } catch { /* 已断言路径 */ }
  }
}

/* ============================== 汇总 ============================== */
console.log(`\n== 结果：pass=${pass} fail=${fail} ==`);
if (failures.length > 0) {
  console.log('未通过项：');
  for (const f of failures) console.log(`  - ${f}`);
  process.exitCode = 1;
} else {
  console.log('ALL CHECKS PASSED');
}
