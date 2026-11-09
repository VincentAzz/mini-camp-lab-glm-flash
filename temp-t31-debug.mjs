import { registerHooks } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import ts from 'typescript';
import * as THREE from 'three';
const here = process.cwd();
const srcRoot = pathToFileURL(path.join(here, 'src')).href;
function makeContext2d(canvas) {
  const gradient = { addColorStop() {} };
  return new Proxy({ canvas }, { get(t, p) {
    if (p === 'createImageData') return (w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w*h*4)), width: w, height: h });
    if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => gradient;
    if (p === 'measureText') return () => ({ width: 10 });
    if (typeof p === 'string') { if (!(p in t)) t[p] = () => {}; return t[p]; }
  }, set() { return true; } });
}
globalThis.document = { createElement(tag) {
  if (tag !== 'canvas') throw new Error(tag);
  return { width: 0, height: 0, getContext(kind) { if (!this._ctx) this._ctx = makeContext2d(this); return this._ctx; } };
} };
registerHooks({ resolve(specifier, context, next) {
  const rc = (b) => /\.[cm]?[jt]sx?$/.test(b) ? b : (existsSync(b + '.ts') ? b + '.ts' : b + '.ts');
  if (specifier.startsWith('@/')) return next(pathToFileURL(rc(path.join(here, 'src', specifier.slice(2)))).href, context);
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL) {
    const resolved = new URL(specifier, new URL('.', context.parentURL));
    if (!/\.[cm]?[jt]sx?$/.test(resolved.pathname)) return next(pathToFileURL(rc(fileURLToPath(resolved.href))).href, context);
  }
  return next(specifier, context);
}, load(url, context, next) {
  if (url.startsWith(srcRoot) && url.endsWith('.ts')) {
    const out = ts.transpileModule(readFileSync(fileURLToPath(url), 'utf8'), { fileName: url, compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext, verbatimModuleSyntax: false, isolatedModules: true } });
    return { format: 'module', shortCircuit: true, source: out.outputText };
  }
  return next(url, context);
} });
const { Rng } = await import('@/shared/rng');
const { RhythmClock } = await import('@/systems/clock');
const { LightBreathSystem } = await import('@/systems/lightBreath');
const { WindSystem } = await import('@/systems/wind');
const { EventScheduler } = await import('@/systems/scheduler');
const { seacliffScene } = await import('@/content/scenes/seacliff');
class StubAssets { constructor(){this.g=new Map();this.t=new Map();}
  geometry(id,b){const h=this.g.get(id);if(h)return h;const x=b();x.name=id;this.g.set(id,x);return x;}
  texture(id,b){const h=this.t.get(id);if(h)return h;const x=b();x.name=id;this.t.set(id,x);return x;}
  releaseGeometry(id){this.g.delete(id)} releaseTexture(id){this.t.delete(id)} }
const assets = new StubAssets(); const rng = new Rng('seacliff');
const root = new THREE.Group();
root.add(seacliffScene.buildTerrain({ root, assets, rng }).group);
const props = seacliffScene.buildProps({ root, assets, rng });
root.add(props.group);
const clock = new RhythmClock(); const breath = new LightBreathSystem(clock);
breath.register(props.lamps);
seacliffScene.createAnimations({ root, assets, rng, wind: new WindSystem(clock), particles: { add: () => ({ setRate(){}, dispose(){} }) }, breath, scheduler: new EventScheduler('x'), camera: new THREE.PerspectiveCamera() });
const st = { time: 'night', weather: 'clear', fogDensity: 0.05, global: {}, lampPower: 1, emberPower: 1, smokePower: 0.15, shopPower: 1, interiorGlow: 1 };
seacliffScene.lightHooks.applyLighting(st, 1);
seacliffScene.lightHooks.update?.(1/60, 1);
clock.update(1/60); breath.update(1/60);
for (const l of props.lamps) {
  console.log('lamp', l.emissiveMat?.name, 'mode', l.mode,
    'vis', l.emissiveMat?.visible, 'i', l.emissiveMat?.emissiveIntensity?.toFixed(3),
    'haloVis', l.halo?.visible, 'haloOp', l.halo?.material?.opacity?.toFixed(3));
}
