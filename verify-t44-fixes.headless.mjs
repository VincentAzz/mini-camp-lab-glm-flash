// verify-t44-fixes.headless.mjs —— 实机验证三问题修复的逻辑级无头核验（无 WebGL；渲染段归内置浏览器实机步）。
// 对应实机问题：
//   ① 场景重入 injectVegetationWind 对工厂缓存材质二次注入抛异常 → FadeSwap 卡死（wind.ts）
//   ② 雨雪粒子全场景不可见：(a) THREE.Points→gl.POINTS 1px 角点不可见（particles.ts 渲染模式）
//      (b) setWeatherSet 缺 anchor 固定世界原点（director.ts）+ 场景重入不重锚
//      (c) 发射器索引只增不减——多轮场景/天气切换耗尽 MAX_EMITTERS=32 复现同症状卡死
//   ③ FadeSwap 克隆 ShaderMaterial 缺 `uniform float uFade;` 声明 → 编译失败刷屏（transition.ts）
// 运行：node verify-t44-fixes.headless.mjs（module.registerHooks 转译 @/ 别名，同 verify-t35t40 模式）。
import { registerHooks } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import ts from 'typescript';
import * as THREE from 'three';

const read = (p) => readFileSync(path.join(here, p), 'utf8');

const here = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = pathToFileURL(path.join(here, 'src')).href;

registerHooks({
  resolve(specifier, context, next) {
    const resolveCandidates = (base) => {
      if (/\.[cm]?[jt]sx?$/.test(base)) return base;
      for (const f of [`${base}.ts`, path.join(base, 'index.ts'), `${base}.tsx`, `${base}.js`, `${base}.mjs`, `${base}.css`]) {
        if (existsSync(f)) return f;
      }
      return base;
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
    console.log(`  FAIL  ${name}${detail ? `  [${detail}]` : ''}`);
  }
}

const { RhythmClock } = await import('@/systems/clock');
const { injectVegetationWind } = await import('@/systems/wind');
const { ParticleSystem } = await import('@/systems/particles');
const { createFadeSet } = await import('@/core/transition');
const { makeOutlineShellMaterial } = await import('@/render/outline');

/* ============================== ① injectVegetationWind 幂等（场景重入不抛） ============================== */
{
  const mat = new THREE.MeshToonMaterial({ color: 0x3f6e4e });
  mat.name = 'seacliff/seaweed';
  const wrapCount = () => {
    let calls = 0;
    const probe = mat.onBeforeCompile;
    mat.onBeforeCompile = (shader, renderer) => { calls += 1; probe(shader, renderer); };
    return { restore: () => { mat.onBeforeCompile = probe; }, getCalls: () => calls };
  };

  let firstThrew = null;
  const first = injectVegetationWind(mat, { ampU: 0.05, freqHz: 0.8, heightU: 0.52, phase: 1.3 });
  check('首次注入正常返回材质', first === mat);
  const patchedSource = { got: null };
  const probeShader = {
    vertexShader: '#include <begin_vertex>\nvoid main(){}',
    fragmentShader: 'void main(){}',
    uniforms: {},
  };
  try {
    mat.onBeforeCompile(probeShader, {});
    patchedSource.got = probeShader.vertexShader;
  } catch (err) { firstThrew = err; }
  check('首次注入后 onBeforeCompile 补丁含 VEG_WIND_PARS（uniform 声明恰一次）',
    firstThrew === null && patchedSource.got !== null
    && (patchedSource.got.match(/uniform float uVegAmp;/g) || []).length === 1,
    firstThrew ? String(firstThrew) : 'ok');

  // 场景重入：工厂缓存同实例再次 injectVegetationWind（修复前此处 throw → FadeSwap 卡死）
  let reentryThrew = null;
  try {
    const again = injectVegetationWind(mat, { ampU: 0.05, freqHz: 0.8, heightU: 0.52, phase: 1.3 });
    check('重入注入幂等返回同一材质', again === mat);
    const probe2 = { vertexShader: '#include <begin_vertex>\nvoid main(){}', fragmentShader: 'void main(){}', uniforms: {} };
    mat.onBeforeCompile(probe2, {});
    const decls = (probe2.vertexShader.match(/uniform float uVegAmp;/g) || []).length;
    const bodies = (probe2.vertexShader.match(/uVegHeight/g) || []).length;
    check('重入后补丁不重复包裹（uniform 声明仍恰一次）', decls === 1, `decls=${decls}`);
    check('重入后补丁体不被二倍注入（位移块仍一份）', bodies === 2, `uVegHeight refs=${bodies}`); // 声明+使用
  } catch (err) { reentryThrew = err; }
  check('重入注入不再抛「重复注入」异常', reentryThrew === null, reentryThrew ? String(reentryThrew) : 'ok');
}

/* ============================== ②a 粒子承载=Mesh（TRIANGLES 实例化 quad） ============================== */
{
  const clock = new RhythmClock();
  const ps = new ParticleSystem(clock, { capacity: 64 });
  const spec = {
    kind: 'rain', area: new THREE.Vector3(3.4, 3.4, 2.4), rate: 10, lifetime: 0.53,
    size0: 0.008, size1: 0.14, vel0: new THREE.Vector3(0, -4.5, 0), color: '#A8C8E8', opacity: 0.35, additive: true,
  };
  ps.add(spec, { anchor: new THREE.Vector3(1, 2, 3), group: 'weather' });
  const meshes = ps.root.children.filter((c) => c.isMesh);
  const points = ps.root.children.filter((c) => c.isPoints);
  check('粒子池承载对象为 THREE.Mesh（TRIANGLES 光栅化 billboard quad）', meshes.length === 2, `mesh=${meshes.length}`);
  check('粒子池不再使用 THREE.Points（gl.POINTS 1px 角点=屏幕零粒子根因）', points.length === 0, `points=${points.length}`);
  check('Mesh 使用 InstancedBufferGeometry 且实例段已分配（承载发射器的池 instanceCount>0）',
    meshes.every((m) => m.geometry.isInstancedBufferGeometry) && meshes.some((m) => m.geometry.instanceCount > 0),
    `instanceCount=${meshes.map((m) => m.geometry.instanceCount).join('/')}`);
  ps.dispose();
}

/* ============================== ②b reanchorWeather：场景重入重锚定 ============================== */
{
  const clock = new RhythmClock();
  const ps = new ParticleSystem(clock, { capacity: 64 });
  const spec = {
    kind: 'rain', area: new THREE.Vector3(3.4, 3.4, 2.4), rate: 0, lifetime: 0.53,
    size0: 0.008, size1: 0.14, vel0: new THREE.Vector3(0, -4.5, 0), color: '#A8C8E8', opacity: 0.35, additive: true,
  };
  // 场景 A（原点营位）：先以 rate=0 注册（不发射），再重锚到新场景营位后开闸——全部出生粒子
  // 都来自新锚点，均值不受存量/死亡槽位污染（发射期取值、存量不跟随语义见 particles.ts 注记）。
  const handle = ps.add(spec, { anchor: new THREE.Vector3(0, 0, 0), group: 'weather' });
  ps.reanchorWeather(new THREE.Vector3(10, 1.2, -6));
  handle.setRate(120);
  clock.update(1);
  ps.update(0.5);
  const mesh = ps.root.children.find((c) => c.isMesh && c.geometry.instanceCount > 0);
  const pos0 = mesh.geometry.getAttribute('aPos0');
  const birth = mesh.geometry.getAttribute('aBirth');
  // 只统计本发射器占用槽（writeEmitterStatics 写 BIRTH_NEVER 哨兵 / 出生写 now>0；未分配槽 aBirth=0）
  let sx = 0, sy = 0, sz = 0, n = 0;
  for (let i = 0; i < pos0.count; i++) {
    if (birth.array[i] === 0) continue;
    const x = pos0.array[i * 3], y = pos0.array[i * 3 + 1], z = pos0.array[i * 3 + 2];
    sx += x; sy += y; sz += z; n += 1;
  }
  const mean = n > 0 ? [sx / n, sy / n, sz / n] : null;
  // 发射区 3.4×3.4×2.4 → 均值应落在锚点 ±(1.7, 1.2, 1.2) 内
  check('reanchorWeather 后发射粒子围绕新营位锚点',
    mean !== null && Math.abs(mean[0] - 10) <= 1.7 && Math.abs(mean[1] - 1.2) <= 1.2 && Math.abs(mean[2] - -6) <= 1.2,
    `n=${n} mean=[${mean?.map((v) => v.toFixed(2)).join(',')}]`);
  ps.dispose();
}

/* ============================== ②c 发射器索引回收（多轮切换不耗尽 MAX_EMITTERS） ============================== */
{
  const clock = new RhythmClock();
  const ps = new ParticleSystem(clock, { capacity: 64 });
  const spec = {
    kind: 'drip', area: new THREE.Vector3(0.2, 0.2, 0.2), rate: 2, lifetime: 0.8,
    size0: 0.015, size1: 0.015, vel0: new THREE.Vector3(0, -3, 0), color: '#A8C8E8', opacity: 0.5, additive: false,
  };
  let exhaustedThrew = null;
  for (let i = 0; i < 40; i++) {
    // 模拟 40 轮「场景构建注册 → 卸载 dispose」/「天气 setWeatherSet 交叉淡化回收」
    const h = ps.add(spec, { anchor: new THREE.Vector3(0, 0, 0), group: i % 2 === 0 ? 'weather' : 'scene' });
    ps.update(0.016);
    h.dispose();
    ps.update(0.016);
  }
  try {
    for (let i = 0; i < 40; i++) {
      const h = ps.add(spec, { group: 'scene' });
      ps.update(0.016);
      h.dispose();
      ps.update(0.016);
    }
  } catch (err) { exhaustedThrew = err; }
  check('80 轮注册/回收不触发「发射器索引已满」（索引随 dispose 回收复用）', exhaustedThrew === null,
    exhaustedThrew ? String(exhaustedThrew) : `emitterCount=${ps.emitterCount}`);
  ps.dispose();
}

/* ============================== ②d 渲染链静态检查（colorspace/窄列采样/雪壳声明） ============================== */
{
  const particlesSrc = read('src/systems/particles.ts');
  check('粒子片元着色器含 colorspace_fragment 输出编码（线性直出≈3.4×偏暗=雨雪不可见根因之一）',
    /const FRAGMENT_SHADER = [\s\S]*?#include <colorspace_fragment>/.test(particlesSrc));
  check('粒子承载池为 THREE.Mesh（TRIANGLES 实例化 quad；THREE.Points=gl.POINTS 1px 角点不可见根因）',
    particlesSrc.includes('new THREE.Mesh(geo, material)') && !particlesSrc.includes('new THREE.Points(geo, material)'));
  check('拉伸类（雨/滴水）vUv 取图集单元中心窄列（整列映射把径向点精灵中心强度平均掉）',
    particlesSrc.includes('(0.5 + (uv.x - 0.5) * 0.125) * 0.33333334'));
  const wmSrc = read('src/systems/weatherMaterial.ts');
  check('雪壳外推注入含 uniform 声明（此前 uSnowShellExtrude undeclared identifier 编译失败）',
    /transformed \+= normal \* uSnowShellExtrude;/u.test(wmSrc)
    && wmSrc.includes('`uniform float uSnowShellExtrude;\\n${patched}`'));
  const directorSrc = read('src/core/director.ts');
  check('天气粒子 setWeatherSet 传入悬空发射锚点条目（两处 liftedWeatherEntries；缺省 anchorPos=(0,0,0) 雨雪固定世界原点）',
    (directorSrc.match(/setWeatherSet\(this\.liftedWeatherEntries\(/g) || []).length === 2);
  check('悬空锚点抬升 = area.y/2 + |vel0.y|×lifetime（发射盒悬于营位上空，存活末端恰触地；原锚定地面=半数埋入台面+车体遮挡 91%）',
    /area\.y \/ 2 \+ Math\.abs\(spec\.vel0\.y\) \* spec\.lifetime/.test(directorSrc));
  check('场景激活路径 reanchorWeather（FadeSwap 不重挂天气集合 → 按新场景营位重算悬空锚点）',
    directorSrc.includes('this.particles.reanchorWeather(this.weatherAnchorBase(this.activeWeatherPreset))'));
  check('天气 lightMod 直写后立即重应用（lightMod 仅 applyParams 合成生效——天气唯一切换路径此前只存不算）',
    /setWeatherLightMod\(this\.currentLightMod\);[\s\S]{0,80}setGlowBoost[\s\S]{0,80}this\.applyLightingNow\(this\.lastSnapshot\.global/.test(directorSrc));
  check('天空端点经 AtmosphereSystem 压缩消费（§4.4.4 sky 向灰 lerp 此前无消费方）',
    directorSrc.includes('zenith: this.atmosphere.skyZenithCompressed')
    && directorSrc.includes('horizon: this.atmosphere.skyHorizonCompressed'));
  const atmosphereSrc = read('src/systems/atmosphere.ts');
  check('天空压缩含 §4.4.4 灰调项 0.5×cloudiness（雨 0.5×0.7=35% 逐字）',
    /lerp\(this\.fogColor, compressFog\)\.lerp\(this\.fogGray, compressGray\)/.test(atmosphereSrc)
    && /compressGray = 0\.5 \* this\.cloudiness/.test(atmosphereSrc));
}

/* ============================== ③ FadeSet 克隆体 uFade 声明（反壳壳材质代餐） ============================== */
{
  const shellMat = makeOutlineShellMaterial({ width: 0.012, color: '#2f2a33', name: 'outlineShell/shell' });
  const quadMat = new THREE.ShaderMaterial({
    uniforms: { uOpacity: { value: 1 } },
    vertexShader: 'void main(){ gl_Position = vec4(position, 1.0); }',
    fragmentShader: 'uniform float uOpacity;\nvoid main(){ gl_FragColor = vec4(1.0, 0.0, 0.0, uOpacity); #include <colorspace_fragment> }',
  });
  const root = new THREE.Group();
  const a = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), shellMat);
  const b = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), quadMat);
  root.add(a, b);
  const fade = createFadeSet(root);
  const clonedShell = a.material;
  const clonedQuad = b.material;
  const declBeforeUse = (src) => {
    const decls = (src.match(/uniform float uFade;/g) || []).length;
    const atDecl = src.indexOf('uniform float uFade;');
    const atUse = src.indexOf('gl_FragColor.a *= uFade;');
    return decls === 1 && atDecl >= 0 && atUse > atDecl; // 恰一次声明且先于使用
  };
  check('克隆反壳 ShaderMaterial 含 uFade 声明且先于使用（修复前 undeclared identifier 编译失败）',
    declBeforeUse(clonedShell.fragmentShader), clonedShell.fragmentShader.split('\n')[0]);
  check('克隆自定 quad ShaderMaterial 同样含声明（seacliff/bay/water 同构修复）',
    declBeforeUse(clonedQuad.fragmentShader), clonedQuad.fragmentShader.split('\n')[0]);
  check('uFade uniform 已挂克隆体且初值 1', clonedShell.uniforms.uFade?.value === 1);
  fade.setOpacity(0.5);
  check('setOpacity 驱动 uFade=0.5（淡出路径走 uniform 而非可见性兜底）',
    clonedShell.uniforms.uFade.value === 0.5 && a.visible === true, `uFade=${clonedShell.uniforms.uFade.value}`);
  check('原生材质不被就地改动', shellMat.fragmentShader === undefined || !`${shellMat.fragmentShader}`.includes('uFade'));
  fade.restore();
  check('restore 还原原生材质', a.material === shellMat && b.material === quadMat);
  fade.dispose();
}

/* ============================== 汇总 ============================== */
console.log(`\n==== verify-t44-fixes.headless: pass=${pass} fail=${fail} ====`);
if (fail > 0) {
  console.log('FAILURES:\n' + failures.map((f) => `  - ${f}`).join('\n'));
  process.exit(1);
}
