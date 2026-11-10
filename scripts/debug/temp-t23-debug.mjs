// temp-t23-debug.mjs —— T23 期临时调试件（FadeSwap 车型交换 root.y 沉底缺陷定位用；★待清理项：
//   按无删除红线保留入库，T48 收尾时移入回收站处置，勿删除勿复用；正式冒烟请用 verify-t23.headless.mjs）。
// 运行：node temp-t23-debug.mjs（registerHooks + ts.transpileModule 钩子，Node ≥22.15）。
import { registerHooks } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const here = process.cwd();
const srcRoot = pathToFileURL(path.join(here, 'src')).href;
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('@/')) { let p = specifier.slice(2); if (!/\.[cm]?[jt]sx?$/.test(p)) p += '.ts'; return next(pathToFileURL(path.join(here, 'src', p)).href, context); }
    if ((specifier.startsWith('./') || specifier.startsWith('../../')) && context.parentURL) {
      const resolved = new URL(specifier, new URL('.', context.parentURL));
      if (!/\.[cm]?[jt]sx?$/.test(resolved.pathname)) return next(new URL(resolved.href + '.ts'), context);
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.startsWith(srcRoot) && url.endsWith('.ts')) {
      const output = ts.transpileModule(readFileSync(fileURLToPath(url), 'utf8'), { fileName: url, compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext, verbatimModuleSyntax: false, isolatedModules: true } });
      return { format: 'module', shortCircuit: true, source: output.outputText };
    }
    return next(url, context);
  },
});
function makeContext2d(canvas){ const g={addColorStop(){}}; return new Proxy({canvas},{get(t,p){ if(p==='createImageData')return (w,h)=>({data:new Uint8ClampedArray(w*h*4),width:w,height:h}); if(p==='createLinearGradient'||p==='createRadialGradient')return()=>g; if(p==='measureText')return()=>({width:10}); if(typeof p==='string'){ if(!(p in t)) t[p]=()=>{}; return t[p];} },set(){return true;}}); }
globalThis.document = { createElement(tag){ return { width:0, height:0, getContext(k){ if(!this._c) this._c = makeContext2d(this); return this._c; } }; } };
const THREE = await import('three');
const { Director } = await import('@/core/director');
const { Registry } = await import('@/core/registry');
const { vehicleRegistry } = await import('@/content/vehicles/registry');
const { timeRegistry } = await import('@/content/times/registry');
const { weatherRegistry } = await import('@/content/weathers/registry');
const { classC } = await import('@/content/vehicles/classC');
const makeProbeScene = (id, radius, anchor) => ({
  id, label: id,
  buildTerrain() { const group = new THREE.Group(); return { group, campAnchor: { position: new THREE.Vector3(...anchor), headingRad: 0.3, groundY: anchor[1], radius } }; },
  buildProps() { return { group: new THREE.Group(), named: {}, cloths: [], lamps: [], emitters: [], weatherSurfaces: [] }; },
  createAnimations() { return []; },
  palette: { colorChannels: {}, baseStyle: { topTheme: 'lawn', edgeMatId: 'rockStrata', rimDecal: null, skirtLayers: 0, silhouette: null }, baseFog: 0.1 },
  lightHooks: { applyLighting() {} },
});
const probeVehicle = { id: 'classC-probe', label: 'probe', buildExterior: classC.buildExterior, buildDeployment: classC.buildDeployment, buildInterior: classC.buildInterior, interiorLightHooks: classC.interiorLightHooks };
const sceneRegistry = new Registry();
sceneRegistry.register(makeProbeScene('probeA', 4.0, [0, 1.2, 0.8]));
sceneRegistry.register(makeProbeScene('probeB', 4.2, [1.5, 0.6, -0.5]));
const vr = new Registry();
vr.register(probeVehicle);
vr.register(vehicleRegistry.get('classC'));
const engine = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), hooks: { clock: null, transition: null, systems: [], scene: [] } };
const warnings = [];
console.warn = (...a) => warnings.push(a.map(String).join(' '));
const director = new Director({ engine, sceneRegistry, vehicleRegistry: vr, timeRegistry, weatherRegistry });
director.start();
director.applyState();
const roots = () => engine.scene.children.filter(c=>String(c.name).startsWith('vehicle')).map(c=>`${c.name}@y${c.position.y.toFixed(2)}`);
console.log('init vehicle=', director.vehicle?.id, 'swap=', !!director.vehicleSwap, roots());
const waitSwap = (pred) => { let ok=false; for (let i = 0; i < 1500; i++) { engine.hooks.transition(0.016); if (pred()) { ok=true; break; } } return ok || pred(); };
console.log('A: pred(classC & swap null & no probe root) =', director.vehicle?.id === 'classC' && director.vehicleSwap === null && engine.scene.getObjectByName('vehicle/classC-probe') === null);
director.applyState({ vehicle: 'classC' });
console.log('B waitSwap1 =', waitSwap(() => director.vehicle?.id === 'classC' && director.vehicleSwap === null && engine.scene.getObjectByName('vehicle/classC-probe') === null), 'vehicle=', director.vehicle?.id, 'swap=', !!director.vehicleSwap, roots());
sceneRegistry.register({ ...makeProbeScene('probeTiny', 3.0, [0, 1.2, 0.8]) });
director.applyState({ scene: 'probeTiny' });
console.log('C waitScene =', waitSwap(() => director.scene?.id === 'probeTiny' && director.sceneSwap === null), 'scene=', director.scene?.id, roots());
director.applyState({ vehicle: 'classC-probe' });
console.log('D waitSwap2 =', waitSwap(() => director.vehicle?.id === 'classC-probe' && director.vehicleSwap === null), 'vehicle=', director.vehicle?.id, roots(), 'warnings=', warnings.filter(w=>w.includes('footprint')));
director.dispose();
console.log('E after dispose roots=', engine.scene.children.filter(c=>String(c.name).startsWith('vehicle')).map(c=>c.name));
