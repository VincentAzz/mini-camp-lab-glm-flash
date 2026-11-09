// verify-polish1-fixes.headless.mjs —— 打磨轮次1三问题修复的逻辑级无头核验（无 WebGL；渲染观感归内置浏览器实机步）。
// 对应实机问题（运行时探针证据）：
//   ① 松林锚树冠（anchor-canopy-0/1）复用 tier-m 实例冠材质（基色白、靠 instanceColor 上绿）——
//      单体 Mesh 无 instanceColor 恒显纯白 → 专用 canopyDark 同档绿材（pineforest.ts）
//   ② 海崖雪面「fresnel 闪点 ×snowCover×0.3」（docs/05 五-5）未实现 → 工厂分支
//      （toonMaterial.applyToonPatches snow:'full'）+ raw 分支（weatherMaterial.patchSharedWeather）
//   ③ 调度器「夜间自动静默」未接线（Director 全文无 setNightSilence）→ Director 时间过渡中点/
//      首装/场景重入三路驱动 + 海鸟/松鼠事件 nightSilent 标记（scheduler.ts:249 契约）
// 运行：node verify-polish1-fixes.headless.mjs（主进程跑段①②；Director 集成段经 --director /
//   --director-night 子进程隔离，同 verify-t31 模式——直构与 Director 共用全局工厂缓存）。
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

const DIRECTOR_NIGHT_ONLY = process.argv.includes('--director-night');

if (!DIRECTOR_NIGHT_ONLY) {
  const { Rng } = await import('@/shared/rng');
  const { RhythmClock } = await import('@/systems/clock');
  const { pineforestScene } = await import('@/content/scenes/pineforest');
  const { ToonMaterialFactory, sharedUniforms } = await import('@/render/toonMaterial');
  const { WeatherMaterialSystem } = await import('@/systems/weatherMaterial');

  /** headless 资产桩（同 verify-t31）。 */
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

  /* ============================== 段① 松林锚树冠专用绿材 ============================== */
  console.log('-- ① 松林锚树冠（anchor-canopy-0/1）不再纯白（专用 canopyDark 同档绿材） --');
  {
    const assets = new StubAssets();
    const rng = new Rng('pineforest');
    const root = new THREE.Group();
    const terrain = pineforestScene.buildTerrain({ root, assets, rng });
    root.add(terrain.group);
    const props = pineforestScene.buildProps({ root, assets, rng });
    root.add(props.group);
    const find = (name) => { let f = null; root.traverse((o) => { if (!f && o.name === name) f = o; }); return f; };

    for (const i of [0, 1]) {
      const canopy = find(`pineforest/anchor-canopy-${i}`);
      check(`① anchor-canopy-${i} 在场`, canopy !== undefined && canopy !== null);
      if (canopy) {
        const mat = canopy.material;
        check(`① anchor-canopy-${i} 材质=专用 pineforest/canopy-anchor（不再共用实例冠 canopy-m）`,
          mat.name === 'pineforest/canopy-anchor', `name=${mat.name}`);
        check(`① anchor-canopy-${i} 基色=canopyDark #2f5e40（绿，非白）`,
          mat.color.getHexString() === '2f5e40', `hex=${mat.color.getHexString()}`);
        check(`① anchor-canopy-${i} 绿通道占优（g>r 且 g>b，松林同族）`,
          mat.color.g > mat.color.r && mat.color.g > mat.color.b,
          `rgb=${mat.color.r.toFixed(2)}/${mat.color.g.toFixed(2)}/${mat.color.b.toFixed(2)}`);
        check(`① anchor-canopy-${i} 已注入植被风摆（与实例冠同动效链）`,
          mat.userData.vegWindInjected === true);
      }
    }
    // 实例冠材质保持原口径（基色白 × instanceColor 上绿）——锚树修复不得动实例路径
    const canopyGroup = find('pineforest/pine-canopy-m');
    const canopyBody = canopyGroup?.children.find((c) => c.name.endsWith('/body'));
    const canopyMat = canopyBody?.material;
    check('① tier-m 实例冠材质仍为 canopy-m 基色白（instanceColor 上绿路径未动）',
      canopyMat !== undefined && canopyMat.name === 'pineforest/canopy-m'
      && canopyMat.color.getHexString() === 'ffffff',
      `hex=${canopyMat?.color?.getHexString()}`);
    const anchor0 = find('pineforest/anchor-canopy-0');
    check('① 锚树冠与实例冠不是同一材质实例', anchor0.material !== canopyMat);

    // 树冠剪影 canopyTint 逐帧驱动覆盖锚树（canopyMaterials 数组追加项被 update 循环消费）
    const hooks = pineforestScene.lightHooks;
    hooks.applyLighting({ time: 'dusk', weather: 'clear', fogDensity: 0.05, global: {},
      lampPower: 1, emberPower: 1, smokePower: 0.35, shopPower: 0.65, interiorGlow: 0.85 }, 1);
    hooks.update?.(1 / 60, 1);
    const mat0 = anchor0.material;
    check('① dusk 剪影 tint 到达锚树冠（颜色离开 #2f5e40 静态值，随档插值）',
      mat0.color.getHexString() !== '2f5e40', `hex=${mat0.color.getHexString()}`);
    check('① dusk 锚树冠仍绿系非白（g 通道仍为三者最大）',
      mat0.color.g > mat0.color.r && mat0.color.g >= mat0.color.b);
  }

  /* ============================== 段② 雪面 fresnel 闪点（工厂分支 + raw 分支） ============================== */
  console.log('-- ② 雪面闪点：fresnel ×snowCover×0.3 注入（五-5 地面薄雪行） --');
  const probeShader = (libKey) => ({
    fragmentShader: THREE.ShaderLib[libKey].fragmentShader,
    vertexShader: THREE.ShaderLib[libKey].vertexShader,
    uniforms: {},
  });
  {
    const factory = new ToonMaterialFactory(); // 独立工厂实例，避免污染/命中全局缓存
    // ②a 工厂 groundTerrain（snow:'full'）——海崖草坪/沙地/松林碎石地同原型
    const ground = factory.get('groundTerrain', { color: '#8fa070', name: 'probe/ground-snow' });
    const shaderA = probeShader('toon');
    ground.onBeforeCompile(shaderA, {});
    const fragA = shaderA.fragmentShader;
    check('②a 工厂地面分支：闪点块注入（snowGlintFres fresnel 项在场）',
      fragA.includes('snowGlintFres') && fragA.includes('pow( 1.0 - snowGlintNV, 4.0 )'));
    check('②a 增益项 ×snowCover×0.3 逐字（saturate( uSnow ) × 0.3）',
      /saturate\( uSnow \) \* 0\.3 \)/.test(fragA));
    check('②a 稀疏闪点格点（hash 阈值 step 0.78 + 18 格/单位）',
      fragA.includes('step( 0.78, snowGlintRand )') && fragA.includes('vSnowWorld.xz * 18.0'));
    check('②a uWindPhase 相位声明 + 按引用注入（WindSystem 每帧写=elapsed）',
      fragA.includes('uniform float uWindPhase;') && shaderA.uniforms.uWindPhase === sharedUniforms.uWindPhase);
    check('②a uSnow/uSnowColor 按引用注入（雪量插值直达）',
      shaderA.uniforms.uSnow === sharedUniforms.uSnow && shaderA.uniforms.uSnowColor instanceof Object);
    check('②a 顶点：vSnowWorld varying 声明恰一次 + begin_vertex 后写世界坐标',
      (shaderA.vertexShader.match(/varying vec3 vSnowWorld;/g) || []).length === 1
      && shaderA.vertexShader.includes('vSnowWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;'));
    check('②a 加到 totalEmissiveRadiance（rim/specStreak 同口径，不受漫反射暗部钳制）',
      fragA.includes('totalEmissiveRadiance += uSnowColor'));

    // ②b 工厂非地面（snow:'up'）——闪点不越界（docs 只给地面薄雪行）
    const roof = factory.get('matteProp', { color: '#888888', name: 'probe/up-snow' });
    const shaderB = probeShader('toon');
    roof.onBeforeCompile(shaderB, {});
    check('②b 非地面（up 遮罩）不含闪点块/世界坐标 varying（越界防呆）',
      !shaderB.fragmentShader.includes('snowGlintFres')
      && !shaderB.fragmentShader.includes('vSnowWorld')
      && !shaderB.vertexShader.includes('vSnowWorld'));

    // ②c raw lit 材质（weatherMaterial.patchSharedWeather 分支；服务区路面等 raw ground 同路径）
    const wms = new WeatherMaterialSystem(new RhythmClock());
    const rawGround = new THREE.MeshStandardMaterial({ color: 0x666666 });
    wms.register([{ material: rawGround, kind: 'ground' }]);
    const shaderC = probeShader('standard');
    rawGround.onBeforeCompile(shaderC, {});
    const fragC = shaderC.fragmentShader;
    check('②c raw 地面分支：闪点块注入（wmGlintFres + ×0.3）',
      fragC.includes('wmGlintFres') && /clamp\( uSnow, 0\.0, 1\.0 \) \* 0\.3 \)/.test(fragC));
    check('②c raw 分支 uWindPhase 声明 + 按引用注入',
      fragC.includes('uniform float uWindPhase;') && shaderC.uniforms.uWindPhase === sharedUniforms.uWindPhase);
    check('②c raw 分支复用已声明的 vWmWorldPos/GLSL 噪声（不重复声明）',
      (fragC.match(/varying vec3 vWmWorldPos;/g) || []).length === 1
      && (fragC.match(/float wmHash\(/g) || []).length === 1);

    // ②d raw 非 lit（basic）地面——闪点静默降级（无 normal/vViewPosition 可用）
    const rawBasic = new THREE.MeshBasicMaterial({ color: 0x666666 });
    wms.register([{ material: rawBasic, kind: 'ground' }]);
    const shaderD = probeShader('basic');
    rawBasic.onBeforeCompile(shaderD, {});
    check('②d basic 地面（非 lit）：不注入闪点块/uWindPhase（降级不编译失败）',
      !shaderD.fragmentShader.includes('wmGlintFres')
      && !shaderD.fragmentShader.includes('uniform float uWindPhase;'));

    wms.dispose();
  }
} /* —— 直构段结束 —— */

/* ============================== 段③ Director 夜间自动静默（--director 子进程） ============================== */
if (process.argv.includes('--director')) {
  console.log('-- ③ Director 夜间静默接线（真注册表/真帧序；scheduler.ts:249 契约） --');
  const { Director } = await import('@/core/director');
  const { sceneRegistry } = await import('@/content/scenes/registry');
  const { vehicleRegistry } = await import('@/content/vehicles/registry');
  const { weatherRegistry } = await import('@/content/weathers/registry');
  const { timeRegistry } = await import('@/content/times/registry');
  const engineDuck = {
    scene: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(),
    hooks: { clock: null, transition: null, systems: [], scene: [] },
  };
  const director = new Director({ engine: engineDuck, sceneRegistry, vehicleRegistry, timeRegistry, weatherRegistry });
  director.start();
  director.applyState(); // 默认组合：seacliff + classC + dusk + clear
  const sched = () => director.scene?.scheduler;
  const runFrames = (frames) => {
    for (let i = 0; i < frames; i++) {
      engineDuck.hooks.transition?.(1 / 60);
      for (const hook of engineDuck.hooks.systems) hook(1 / 60);
      for (const hook of engineDuck.hooks.scene) hook(1 / 60, i / 60);
    }
  };

  check('③a 首装 dusk：不静默（dusk 非夜）', sched()?.isNightSilence === false);
  check('③a 海崖海鸟事件带 nightSilent 标记（排程在册）', (sched()?.size ?? 0) >= 1);

  // night 切换：过渡 1500ms，blend≥0.5（≈750ms）中点生效
  director.applyState({ scene: 'seacliff', time: 'night' });
  runFrames(30); // 500ms < 750ms
  check('③b night 过渡中点前：静默未生效（不再「破晓重入即刻出鸟」的旧路径）',
    sched()?.isNightSilence === false && sched()?.suspendedCount === 0);
  runFrames(30); // 累计 1000ms > 750ms
  check('③b night 过渡中点后：isNightSilence=true（Director 驱动，非 fire() 门控）',
    sched()?.isNightSilence === true);
  check('③b nightSilent 事件倒计时冻结（suspendedCount=海鸟 1）', sched()?.suspendedCount === 1,
    `suspended=${sched()?.suspendedCount}`);

  // 破晓：中点解除
  director.applyState({ scene: 'seacliff', time: 'dawn' });
  runFrames(30);
  check('③c dawn 过渡中点前：仍静默（不提前解冻）', sched()?.isNightSilence === true);
  runFrames(30);
  check('③c dawn 过渡中点后：解除静默（接续原节奏，纸巾事件不受影响仍在册）',
    sched()?.isNightSilence === false && sched()?.suspendedCount === 0 && (sched()?.size ?? 0) >= 2);

  // 夜间换场景：新 scheduler（全新实例默认不静默）按当前生效态立即接管
  director.applyState({ scene: 'seacliff', time: 'night' });
  runFrames(60); // 过渡完成 → 静默
  check('③d 再次入夜静默生效', sched()?.isNightSilence === true);
  const schedBeforeSwap = director.scene?.scheduler;
  director.applyState({ scene: 'wasteland' });
  runFrames(45); // FadeSwap 600ms=36 帧 + 余量
  check('③d 夜间换场景：新 scheduler（全新实例）按当前生效态立即接管静默',
    director.scene?.id === 'wasteland'
    && director.scene?.scheduler !== undefined
    && director.scene.scheduler !== schedBeforeSwap
    && director.scene.scheduler.isNightSilence === true,
    `scene=${director.scene?.id} silent=${director.scene?.scheduler?.isNightSilence}`);

  director.dispose();
  check('③ Director dispose 无异常', true);
  console.log(`\n== --director 段: pass=${pass} fail=${fail} ==`);
  if (failures.length > 0) failures.forEach((f) => console.log(`  FAILED: ${f}`));
  process.exit(fail > 0 ? 1 : 0);
}

/* ============================== 段④ 首装即夜（--director-night 子进程） ============================== */
if (DIRECTOR_NIGHT_ONLY) {
  console.log('-- ④ 首装即夜（applyState({time:"night"}) 为首次调用 → 装配档直接静默） --');
  const { Director } = await import('@/core/director');
  const { sceneRegistry } = await import('@/content/scenes/registry');
  const { vehicleRegistry } = await import('@/content/vehicles/registry');
  const { weatherRegistry } = await import('@/content/weathers/registry');
  const { timeRegistry } = await import('@/content/times/registry');
  const engineDuck = {
    scene: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(),
    hooks: { clock: null, transition: null, systems: [], scene: [] },
  };
  const director = new Director({ engine: engineDuck, sceneRegistry, vehicleRegistry, timeRegistry, weatherRegistry });
  director.start();
  director.applyState({ time: 'night' }); // 首装即夜（默认场景 seacliff）
  const sched = director.scene?.scheduler;
  check('④ 首装即夜：装配后立即静默（无过渡可走中点，scheduler.ts:249「首装」分支）',
    sched?.isNightSilence === true, `silent=${sched?.isNightSilence}`);
  check('④ 首装即夜：海鸟事件挂起（suspendedCount=1）', sched?.suspendedCount === 1,
    `suspended=${sched?.suspendedCount}`);
  director.dispose();
  console.log(`\n== --director-night 段: pass=${pass} fail=${fail} ==`);
  if (failures.length > 0) failures.forEach((f) => console.log(`  FAILED: ${f}`));
  process.exit(fail > 0 ? 1 : 0);
}

/* —— 主进程：直构段已跑完；再以子进程跑 Director 集成段（进程隔离），汇总计数 —— */
if (!process.argv.includes('--director') && !DIRECTOR_NIGHT_ONLY) {
  const { spawnSync } = await import('node:child_process');
  let childFail = 0;
  for (const flag of ['--director', '--director-night']) {
    const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), flag], { encoding: 'utf8' });
    process.stdout.write(child.stdout ?? '');
    if (child.status !== 0) {
      childFail += 1;
      console.log(`  FAIL  子进程（${flag}）退出码 ${child.status}`);
      if (child.stderr) process.stderr.write(child.stderr);
    }
  }
  console.log(`\n== verify-polish1: 直构段 pass=${pass} fail=${fail}；子进程失败数=${childFail} ==`);
  if (failures.length > 0) failures.forEach((f) => console.log(`  FAILED: ${f}`));
  process.exit(fail + childFail > 0 ? 1 : 0);
}
