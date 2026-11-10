// temp-polish1-glslcheck.mjs —— 打磨轮次1雪面闪点补丁的 GLSL 静态校验（临时文件，勿提交）。
// 校验：补丁后 toon/standard 着色器经 #include 全解析 → 括号平衡 + 引用标识符声明齐全。
// 浏览器实机步被宿主窗口遮挡（rAF=0 无 BeginFrame）时的替代保底；运行：node temp-polish1-glslcheck.mjs
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const here = process.cwd();
const srcRoot = pathToFileURL(here + '/src').href;
globalThis.document = {
  createElement(tag) {
    if (tag !== 'canvas') throw new Error('unexpected ' + tag);
    return {
      width: 4, height: 4,
      getContext(kind) {
        if (kind !== '2d') throw new Error('unexpected ' + kind);
        return new Proxy({}, {
          get(t, p) {
            if (p === 'createImageData') return (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h });
            if (p === 'getImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h });
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
    if (specifier.startsWith('@/')) {
      let p = specifier.slice(2);
      if (!/\.[cm]?[jt]sx?$/.test(p)) p += '.ts';
      return next(pathToFileURL(here + '/src/' + p).href, context);
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.startsWith(srcRoot) && url.endsWith('.ts')) {
      const source = readFileSync(new URL(url), 'utf8');
      const out = ts.transpileModule(source, {
        fileName: url,
        compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext, verbatimModuleSyntax: false, isolatedModules: true },
      });
      return { format: 'module', shortCircuit: true, source: out.outputText };
    }
    return next(url, context);
  },
});

const THREE = await import('three');
const { ToonMaterialFactory } = await import('@/render/toonMaterial');
const { WeatherMaterialSystem } = await import('@/systems/weatherMaterial');
const { RhythmClock } = await import('@/systems/clock');

const resolveIncludes = (src) => {
  // three 的 includeReplacer 对 chunk 内容递归解析（three.module.js:6241）——此处同口径迭代至不动点
  let out = src;
  for (let pass = 0; pass < 8; pass++) {
    const next = out.replace(/^[ \t]*#include +<([\w[\]/.]+)>/gm, (m, ch) => {
      const chunk = THREE.ShaderChunk[ch];
      if (chunk === undefined) throw new Error('missing chunk ' + ch);
      return typeof chunk === 'string' ? chunk : String(chunk);
    });
    if (next === out) break;
    out = next;
  }
  return out;
};
const balance = (src) => {
  let d = 0;
  for (const c of src) { if (c === '{') d++; if (c === '}') d--; if (d < 0) return 'unbalanced-close'; }
  return d === 0 ? 'balanced' : 'unbalanced-' + d;
};
/** 打补丁前后括号差（补丁块自身须平衡；原生模板的预处理相关不均衡为基线噪声）。 */
const balanceDelta = (patched, baseline) => {
  const num = (s) => {
    const m = /-?\d+/.exec(s);
    return m ? parseInt(m[0], 10) : 0;
  };
  return num(balance(patched)) - num(balance(baseline));
};
const missing = (src, decls) => decls.filter((d) => !src.includes(d));

let ok = 0; let bad = 0;
const report = (name, cond, detail = '') => {
  if (cond) { ok++; console.log(`  PASS  ${name}${detail ? `  [${detail}]` : ''}`); }
  else { bad++; console.log(`  FAIL  ${name}  [${detail}]`); }
};

// ① 工厂 toon 全雪地面（海崖草坪/沙地/松林碎石地原型）：完整解析后静态检查
{
  const factory = new ToonMaterialFactory();
  const ground = factory.get('groundTerrain', { color: '#8fa070', name: 'glslcheck/ground' });
  const baseFrag = resolveIncludes(THREE.ShaderLib.toon.fragmentShader);
  const baseVert = resolveIncludes(THREE.ShaderLib.toon.vertexShader);
  const sh = { fragmentShader: THREE.ShaderLib.toon.fragmentShader, vertexShader: THREE.ShaderLib.toon.vertexShader, uniforms: {} };
  ground.onBeforeCompile(sh, {});
  try {
    const fragF = resolveIncludes(sh.fragmentShader);
    const vertF = resolveIncludes(sh.vertexShader);
    report('toon-full 片元 include 全解析（含 chunk 内嵌套 include，同 three 递归口径）', !/#include/.test(fragF));
    report('toon-full 片元括号差=0（补丁块自身平衡）', balanceDelta(fragF, baseFrag) === 0, `delta=${balanceDelta(fragF, baseFrag)}`);
    report('toon-full 顶点括号差=0', balanceDelta(vertF, baseVert) === 0, `delta=${balanceDelta(vertF, baseVert)}`);
    const missF = missing(fragF, [
      'uniform float uWindPhase;', 'uniform float uSnow;', 'uniform vec3 uSnowColor;',
      'varying vec3 vSnowWorld;', 'vec3 totalEmissiveRadiance', 'varying vec3 vViewPosition;',
    ]);
    report('toon-full 片元引用标识符声明齐全（normal 由 normal_fragment_begin 定义）',
      missF.length === 0 && fragF.includes('vec3 normal = normalize'),
      `missing=${JSON.stringify(missF)}`);
    const missV = missing(vertF, ['varying vec3 vSnowWorld;']);
    report('toon-full 顶点 varying 声明齐全（modelMatrix 系 three 程序前缀内置）', missV.length === 0, `missing=${JSON.stringify(missV)}`);
    report('toon-full 顶点含 vSnowWorld 世界坐标赋值', vertF.includes('vSnowWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;'));
  } catch (e) { report('toon-full include 解析', false, String(e)); }
}

// ② raw standard 地面（weatherMaterial.patchSharedWeather 分支）
{
  const wms = new WeatherMaterialSystem(new RhythmClock());
  const raw = new THREE.MeshStandardMaterial({ color: 0x666666 });
  wms.register([{ material: raw, kind: 'ground' }]);
  const baseFrag = resolveIncludes(THREE.ShaderLib.standard.fragmentShader);
  const sh2 = { fragmentShader: THREE.ShaderLib.standard.fragmentShader, vertexShader: THREE.ShaderLib.standard.vertexShader, uniforms: {} };
  raw.onBeforeCompile(sh2, {});
  try {
    const fragF = resolveIncludes(sh2.fragmentShader);
    report('standard-raw 片元括号差=0（原生模板预处理基线噪声已抵消）', balanceDelta(fragF, baseFrag) === 0, `delta=${balanceDelta(fragF, baseFrag)}`);
    const missF = missing(fragF, [
      'uniform float uWindPhase;', 'varying vec3 vWmWorldPos;', 'float wmHash(',
      'vec3 totalEmissiveRadiance', 'varying vec3 vViewPosition;',
    ]);
    report('standard-raw 片元引用标识符声明齐全', missF.length === 0, `missing=${JSON.stringify(missF)}`);
  } catch (e) { report('standard-raw include 解析', false, String(e)); }
  wms.dispose();
}

console.log(`glsl static check: ok=${ok} bad=${bad}`);
process.exit(bad > 0 ? 1 : 0);
