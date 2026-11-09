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
  const rc = (b) => { if (/\.[cm]?[jt]sx?$/.test(b)) return b; for (const f of [b + '.ts', path.join(b, 'index.ts')]) if (existsSync(f)) return f; return b + '.ts'; };
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
const { Director } = await import('@/core/director');
const { sceneRegistry } = await import('@/content/scenes/registry');
const { vehicleRegistry } = await import('@/content/vehicles/registry');
const { timeRegistry } = await import('@/content/times/registry');
const { weatherRegistry } = await import('@/content/weathers/registry');
const { seacliffScene } = await import('@/content/scenes/seacliff');
const engineDuck = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), hooks: { clock: null, transition: null, systems: [], scene: [] } };
const director = new Director({ engine: engineDuck, sceneRegistry, vehicleRegistry, timeRegistry, weatherRegistry });
director.start();
const seen = [];
const orig = seacliffScene.lightHooks.applyLighting.bind(seacliffScene.lightHooks);
seacliffScene.lightHooks.applyLighting = (state, blend) => { if (seen.length < 6 || seen[seen.length-1] !== state.time) seen.push(state.time); orig(state, blend); };
director.applyState(); // dusk
const runFrames = (n) => { for (let i = 0; i < n; i++) { engineDuck.hooks.transition?.(1/60); for (const h of engineDuck.hooks.systems) h(1/60); for (const h of engineDuck.hooks.scene) h(1/60, i/60); } };
runFrames(140);
console.log('after initial dusk, timeId=', director.timeLight.timeId, 'seen=', seen.join(','));
seacliffScene.lightHooks.applyLighting = orig;
director.applyState({ scene: 'seacliff', time: 'dawn' });
runFrames(230);
console.log('after dawn, timeId=', director.timeLight.timeId, 'appliedTimeId=', director.appliedTimeId);
