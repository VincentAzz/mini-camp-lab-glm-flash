// T05/T06 无头校验驱动（开发辅助脚本，不进构建产物：vite 仅打包 index.html 引用图；tsc include 仅 src+vite.config.ts）。
// 用途：①T06 R1 先手——对实装 three@0.187.0 的 ShaderLib.meshtoon 未展开模板做 onBeforeCompile 补丁/降级无头校验；
//      ②T05——工厂 12 原型/缓存、ramp 规格、噪声可复现、primitives、InstancedGroup 成对壳、SharedAssets 引用计数。
// 运行：node verify-t05t06.headless.mjs（项目根）。后续 T06/T43 重跑可用；保留或清理由用户/后续任务决定。
import { rolldown } from './node_modules/.pnpm/rolldown@1.2.16/node_modules/rolldown/dist/index.mjs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));

const testCode = String.raw`
import * as THREE from 'three';
import { applyToonPatches, toonMaterials, sharedUniforms, buildToonSmokeScene, DEV_TOON_SMOKE_NAME } from '@/render/toonMaterial';
import { InstancedGroup, makeShellMaterial } from '@/geom/instanced';
import * as prim from '@/geom/primitives';
import { createSharedAssets } from '@/core/assets';
import { buildBase } from '@/core/baseAssembler';
import { buildRampTexture, createValueNoise2D, createFbm2D, hashStringToSeed, textureCacheStats, getOrCreateTexture, releaseTexture } from '@/tex/canvasTex';

let failed = 0;
function ok(cond, msg) { if (cond) { console.log('PASS ' + msg); } else { failed += 1; console.error('FAIL ' + msg); } }

// ---- 无头 canvas shim：贴图绘制路径无头化（SVG Image/preloadAll 属浏览器路径，不在本轮） ----
let lastImageData = null;
globalThis.document = {
  createElement(_tag) {
    return {
      width: 0, height: 0,
      getContext(kind) {
        if (kind !== '2d') return null;
        return {
          createImageData(w, h) { return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h }; },
          putImageData(img) { lastImageData = img; },
          fillRect() {}, clearRect() {}, drawImage() {},
          set fillStyle(_v) {}
        };
      }
    };
  }
};

(async () => {

  // ============ 1) T06 补丁管线（真实 ShaderLib.meshtoon 未展开模板） ============
  function freshShader() {
    return {
      vertexShader: THREE.ShaderLib.toon.vertexShader,
      fragmentShader: THREE.ShaderLib.toon.fragmentShader,
      uniforms: {}
    };
  }
  const planFull = {
    rgbRamp: true, wetReactive: true,
    specBand: { threshold: 0.92, intensity: 0.85, color: '#ffffff' },
    specStreak: false,
    rim: { power: 2.4, strength: 0.3, color: '#ffffff' },
    snow: 'up', lineFade: true
  };
  const m1 = new THREE.MeshToonMaterial();
  const s1 = freshShader();
  const before = s1.fragmentShader;
  applyToonPatches(s1, planFull, m1);
  ok(s1.fragmentShader !== before, '补丁后 fragmentShader 已更新');
  ok(!s1.fragmentShader.includes('#include <gradientmap_pars_fragment>'), '补丁①/湿面：gradientmap include 已替换为改写块');
  ok(s1.fragmentShader.includes('texture2D( gradientMap, coord ).rgb'), '补丁①：RGB 色阶采样 .rgb');
  ok(s1.fragmentShader.includes('getGradientIrradiance( vec3 normal, vec3 lightDirection )'), 'gradientmap 块本体保留');
  ok(s1.fragmentShader.includes('snowMask') && s1.fragmentShader.includes('worldUpView'), '补丁④：积雪遮罩插桩');
  ok(s1.fragmentShader.includes('rimFactor'), '补丁③：rim 插桩');
  ok(s1.fragmentShader.includes('specBandMask') && s1.fragmentShader.includes('specHalfDir'), '补丁②：高光带插桩');
  const dirLightGuards = s1.fragmentShader.split('#if NUM_DIR_LIGHTS > 0').length - 1;
  ok(dirLightGuards === 2, 'rim/高光带各带 NUM_DIR_LIGHTS 守卫');
  ok(s1.fragmentShader.includes('#include <lights_fragment_end>'), 'lights_fragment_end 锚点保留');
  ok(s1.uniforms.uSnow === sharedUniforms.uSnow, 'uSnow 共享 uniform 按引用注入');
  ok(s1.uniforms.uWet === sharedUniforms.uWet, 'uWet 共享 uniform 按引用注入');
  ok(s1.uniforms.uLineFade === sharedUniforms.uLineFade, 'uLineFade 共享 uniform 按引用注入');
  ok(s1.uniforms.uSpecThreshold.value === 0.92, 'uSpecThreshold 逐材质数值注入');
  ok(m1.userData.patchDegraded !== true, '正常路径未降级');

  // 降级路径：锚点缺失（模拟 three 版本漂移）
  const s2 = freshShader();
  s2.fragmentShader = 'void main() {}';
  const m2 = new THREE.MeshToonMaterial();
  applyToonPatches(s2, planFull, m2);
  ok(s2.fragmentShader === 'void main() {}', '降级：锚点失配不写回 shader');
  ok(m2.userData.patchDegraded === true, '降级：userData.patchDegraded 已标记');

  // 全关 plan：零改动
  const planOff = { rgbRamp: false, wetReactive: false, specBand: null, specStreak: false, rim: null, snow: 'off', lineFade: false };
  const s3 = freshShader();
  applyToonPatches(s3, planOff, new THREE.MeshToonMaterial());
  ok(s3.fragmentShader === THREE.ShaderLib.toon.fragmentShader, '全关 plan：shader 保持原样');

  // ============ 2) T05 工厂：12 原型 + 缓存 + userData ============
  const archetypes = ['paintCar','paintTrim','matteProp','wood','metal','concrete','groundTerrain','foliage','glass','emissiveLamp','water','cloth'];
  const mats = archetypes.map((a) => toonMaterials.get(a, { color: '#c2564a' }));
  ok(mats.length === 12 && mats.every((m) => m.userData.toonArchetype !== undefined), '12 原型全部可产出');
  ok(toonMaterials.get('matteProp', { color: '#c2564a' }) === mats[2], '同参数命中缓存（同一实例）');
  ok(toonMaterials.get('matteProp', { color: '#c2564b' }) !== mats[2], '异参数产出新实例');
  ok(mats[0].userData.outline === true && mats[0].userData.noOutline === false, 'paintCar 描边标记');
  ok(mats[8].userData.noOutline === true, 'glass noOutline 标记（§5.3）');
  ok(mats[8].transparent === true && mats[8].depthWrite === false, 'glass transparent+depthWrite:false');
  ok(mats[9].type === 'MeshBasicMaterial' && mats[9].toneMapped === false, 'emissiveLamp=unlit MeshBasic 系');
  ok(mats[10].type === 'ShaderMaterial', 'water=自定义 shader');
  ok(mats[10].uniforms.uTime === sharedUniforms.uWaterTime, 'water uTime 共享时间相位');
  ok(mats[2].type === 'MeshToonMaterial' && mats[2].gradientMap !== undefined, 'toon 材质带 gradientMap');
  ok(typeof mats[0].customProgramCacheKey === 'function' && mats[0].customProgramCacheKey().startsWith('toon|'), '补丁材质 customProgramCacheKey 隔离');
  ok(mats[6].customProgramCacheKey().includes('wet1') && mats[6].customProgramCacheKey().includes('snow-full'), 'groundTerrain 默认湿面+整面积雪');
  const stats = toonMaterials.stats();
  console.log('factory stats:', JSON.stringify(stats));
  ok(stats.cached >= 13, '材质缓存计数正常');

  // ============ 3) ramp 生成（规格/像素/着色档） ============
  buildRampTexture('test:ramp3', [
    { t: 0, v: 0.34 }, { t: 0.22, v: 0.34 }, { t: 0.24, v: 0.62 },
    { t: 0.52, v: 0.62 }, { t: 0.55, v: 1 }, { t: 1, v: 1 }
  ]);
  ok(lastImageData.width === 256 && lastImageData.height === 4, 'ramp 规格 256x4');
  ok(lastImageData.data[10 * 4] === 87, 'ramp3 暗带 0.34→87');
  ok(lastImageData.data[200 * 4] === 255, 'ramp3 亮带 255');
  ok(lastImageData.data[10 * 4 + 3] === 255, 'ramp alpha 不透明');
  buildRampTexture('test:tint', [{ t: 0, color: '#3a4a8c' }, { t: 1, color: '#ffd9a0' }]);
  const r0 = lastImageData.data[0];
  ok(r0 >= 56 && r0 <= 60, '着色 ramp R≈0x3a（RGB ramp 补丁用）');

  // ============ 4) 噪声库可复现性 ============
  const n1 = createValueNoise2D(hashStringToSeed('seacliff'));
  const n2 = createValueNoise2D(hashStringToSeed('seacliff'));
  const n3 = createValueNoise2D(hashStringToSeed('pineforest'));
  ok(n1(3.7, 1.2) === n2(3.7, 1.2), 'value noise 同种子完全一致（§5.4 ②）');
  ok(n1(3.7, 1.2) !== n3(3.7, 1.2), 'value noise 异种子不同');
  const nv = n1(0.5, 0.5);
  ok(nv >= 0 && nv <= 1, 'value noise 值域 0..1');
  const fb = createFbm2D(7, 4);
  const fv = fb(1.3, 2.4);
  ok(fv >= 0 && fv <= 1, 'fbm 值域 0..1');

  // ============ 5) primitives ============
  const rb = prim.roundedBox({ width: 1, height: 2, depth: 3, radius: 0.1 });
  ok(rb.getAttribute('position').count > 0, 'roundedBox 顶点生成');
  const pe = prim.profileExtrude({ profile: [[-0.5,-0.5],[0.5,-0.5],[0.5,0.5],[-0.5,0.5]], depth: 1 });
  pe.computeBoundingBox();
  ok(pe.getAttribute('position').count > 0 && pe.boundingBox !== null && Math.abs(pe.boundingBox.max.z - 0.5) <= 1e-6, 'profileExtrude 生成且沿 Z 居中');
  const lt = prim.lathe({ profile: [[0,0],[0.5,0.5],[0.2,1]] });
  ok(lt.getAttribute('position').count > 0 && lt.index !== null, 'lathe 生成（索引几何=共享法线）');
  const tb = prim.tube({ pointsOrCurve: [new THREE.Vector3(0,0,0), new THREE.Vector3(1,1,0), new THREE.Vector3(2,0,0)], radius: 0.05 });
  ok(tb.getAttribute('position').count > 0, 'tube 生成');
  const hard = prim.hardenEdges(rb);
  ok(hard.index === null, 'hardenEdges 输出非索引（按面拆分法线，§5.3）');
  ok(typeof prim.mergeGeometries === 'function', 'mergeGeometries 重导出可用（§5.6 合批）');

  // ============ 6) InstancedGroup（§5.6） ============
  const geom = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshToonMaterial();
  const ig = new InstancedGroup(geom, mat, { capacity: 4, withShell: true, name: 'test/rocks' });
  ok(ig.group.children.length === 2, 'withShell 成对创建（本体+壳）');
  ok(ig.shell.instanceMatrix === ig.body.instanceMatrix, '壳共享实例矩阵 buffer（恒 2 DC）');
  ok(ig.shell.renderOrder === 1, '壳 renderOrder=1（§5.6）');
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < 4; i++) { m4.makeTranslation(i, 0, 0); ig.add(m4, '#c2564a'); }
  ok(ig.count === 4 && ig.body.count === 4 && ig.shell.count === 4, 'add 计数本体/壳同步');
  ok(ig.body.instanceColor !== undefined, 'instanceColor 已建（±5% 微差）');
  const c0 = ig.body.instanceColor.array[0] + ig.body.instanceColor.array[1] + ig.body.instanceColor.array[2];
  const c1 = ig.body.instanceColor.array[3] + ig.body.instanceColor.array[4] + ig.body.instanceColor.array[5];
  ok(c0 !== c1, '同基色实例间存在微差（防复印感）');
  let threw = false;
  try { ig.add(m4, '#c2564a'); } catch (e) { threw = true; }
  ok(threw, '容量超限抛错');
  ig.dispose();
  ok(ig.count === 0, 'dispose 后计数清零');
  const ig2 = new InstancedGroup(geom, mat, { capacity: 2, withShell: { shellMaterial: makeShellMaterial({ width: 0.02, color: '#3a2e2a' }) }, jitter: { hue: 0, saturation: 0, lightness: 0 } });
  ok(ig2.group.children.length === 2, '注入壳材质可用');
  ig2.dispose();

  // ============ 7) SharedAssets 引用计数（01 §3.7 #1 / §3.5.3） ============
  const assets = createSharedAssets();
  let geoDisposed = 0;
  let factoryCalls = 0;
  const g1 = assets.geometry.acquire('t/box', () => {
    factoryCalls += 1;
    const g = new THREE.BoxGeometry(1, 1, 1);
    g.addEventListener('dispose', () => { geoDisposed += 1; });
    return g;
  });
  const g2 = assets.geometry.acquire('t/box', () => new THREE.BoxGeometry(1, 1, 1));
  ok(g1 === g2 && factoryCalls === 1, '同 id geometry 共享（工厂只执行一次）');
  ok(assets.geometry.release('t/box') === 1, 'release → 剩 1 引用');
  ok(assets.geometry.release('t/box') === 0, 'release → 归零');
  ok(geoDisposed === 1 && assets.geometry.get('t/box') === undefined, '归零 dispose 并移出缓存');
  const permTex = assets.textures.acquireFactory('t/perm', () => new THREE.DataTexture(new Uint8Array([1, 2, 3, 4]), 1, 1), { permanent: true });
  assets.textures.release('t/perm');
  ok(assets.textures.get('t/perm') === permTex, '常驻层 release 归零不清零（§5.4）');
  let texDisposed = 0;
  const tmpTex = assets.textures.acquireCanvas('t/tmp', 4, 4, () => undefined, {});
  tmpTex.addEventListener('dispose', () => { texDisposed += 1; });
  assets.textures.release('t/tmp');
  ok(texDisposed === 1, '非常驻贴图归零 dispose');
  await assets.preloadAll();
  ok(true, 'preloadAll 空表即决');
  console.log('texture stats:', JSON.stringify(textureCacheStats()));

  // ============ 8) DEV 冒烟挂载点（结构就绪；实机渲染验证留待冒烟阶段） ============
  const smoke = buildToonSmokeScene();
  ok(smoke.name === DEV_TOON_SMOKE_NAME && smoke.userData.devOnly === true, '冒烟挂载点命名/标记');
  ok(smoke.children.length >= 20, '冒烟场景含色带/高光/rim/玻璃/灯/雪湿地面全部检查项');
  console.log('smoke children:', smoke.children.length);

  // ============ 9) T07 BaseAssembler（统一骨架/BaseStyleSpec 消费/剪影板挂点） ============
  // T04 契约适配器：把 T05 实现类（core/assets.ts）适配成 systems/handles.ts 的 SharedAssets 契约
  // ——即 T17 Director 注入时将使用的形态，此处顺带证明契约可被 T05 实现满足。
  const impl = createSharedAssets();
  const contractAssets = {
    geometry(id, build) { return impl.geometry.acquire(id, build); },
    texture(id, build) { return getOrCreateTexture(id, build); },
    releaseGeometry(id) { impl.geometry.release(id); },
    releaseTexture(id) { releaseTexture(id); },
  };
  const specs = {
    seacliff: { topTheme: 'lawn', edgeMatId: 'rockStrata', rimDecal: null, skirtLayers: 1, silhouette: 'coast' },
    pineforest: { topTheme: 'gravel', edgeMatId: 'rootSoil', rimDecal: null, skirtLayers: 1, silhouette: 'mountains' },
    wasteland: { topTheme: 'crackedConcrete', edgeMatId: 'concreteRough', rimDecal: 'hazardStripes', skirtLayers: 0, silhouette: 'bridge+skyline' },
    servicearea: { topTheme: 'asphaltLot', edgeMatId: 'curbStone', rimDecal: null, skirtLayers: 1, silhouette: null },
  };
  const builds = {};
  for (const key of Object.keys(specs)) builds[key] = buildBase(specs[key], contractAssets);
  ok(Object.keys(builds).length === 4, 'T07: 四场景 spec 全部可构建');

  const sc = builds.seacliff;
  const plainMeshes = sc.group.children.filter((c) => c.name !== 'silhouette');
  ok(plainMeshes.length === 3, 'T07: 底座骨架 3 DC（台面+倒角 / 台缘带 / 阶梯+托板）');
  ok(sc.topMaterial.userData.toonArchetype === 'groundTerrain', 'T07: 台面=groundTerrain 原型（04 §5.5）');
  ok(sc.edgeMaterial.userData.toonArchetype === 'concrete', 'T07: 台缘=concrete 原型（04 §5.2）');
  ok(sc.group.children.some((c) => c.name === 'base/top' && c.receiveShadow === true), 'T07: 台面接收阴影');
  ok(sc.silhouetteHolder.children.length === 1 && sc.silhouetteHolder.children[0].name.startsWith('base/silhouette/coast'), 'T07: coast 剪影板 1 片挂点就位');

  const topGeo = sc.group.children.find((c) => c.name === 'base/top').geometry;
  topGeo.computeBoundingBox();
  const tbb = topGeo.boundingBox;
  ok(Math.abs(tbb.max.y) < 1e-6 && Math.abs(tbb.max.x - 10) < 1e-6, 'T07: 台面 y=0、足迹 20×20（max.x=10）');
  const wallGeo = sc.group.children.find((c) => c.name === 'base/wall').geometry;
  wallGeo.computeBoundingBox();
  const wbb = wallGeo.boundingBox;
  ok(Math.abs(wbb.max.y + 0.35) < 1e-6 && Math.abs(wbb.min.y + 1.35) < 1e-6, 'T07: 台缘剖面带 y −0.35..−1.35');
  const trimGeo = sc.group.children.find((c) => c.name === 'base/trim').geometry;
  trimGeo.computeBoundingBox();
  const rbb = trimGeo.boundingBox;
  ok(Math.abs(rbb.min.y + (1.5 + 0.45 + 0.12)) < 1e-4 && Math.abs(rbb.max.x - 9.6) < 1e-6, 'T07: skirtLayers=1 → 阶梯+裙层+托板，托板 19.2 外露');

  ok(builds.wasteland.group.children.some((c) => c.name === 'base/rimDecal'), 'T07: hazardStripes 四角贴花就位');
  ok(builds.wasteland.silhouetteHolder.children.length === 2, 'T07: bridge+skyline 双剪影板');
  ok(builds.pineforest.silhouetteHolder.children.length === 2, 'T07: mountains 层叠双板（h4.5/3.0）');
  ok(builds.servicearea.silhouetteHolder.children.length === 0, 'T07: silhouette=null → 挂点空置');
  const pfTrim = builds.pineforest.group.children.find((c) => c.name === 'base/trim');
  const saTrim = builds.servicearea.group.children.find((c) => c.name === 'base/trim');
  ok(pfTrim.geometry === saTrim.geometry, 'T07: 同 skirtLayers 跨场景共享同一缓存几何');
  const wlTrim = builds.wasteland.group.children.find((c) => c.name === 'base/trim');
  ok(wlTrim.geometry !== pfTrim.geometry, 'T07: 不同 skirtLayers → 不同缓存几何（trim-0/trim-1）');
  ok(builds.seacliff.topMaterial === buildBase(specs.seacliff, contractAssets).topMaterial, 'T07: 同主题材质命中工厂缓存');

  // 未知 id 降级路径
  const weird = buildBase({ topTheme: 'mystery', edgeMatId: 'mysteryEdge', rimDecal: 'mysteryDecal', skirtLayers: 0, silhouette: 'mysteryView' }, contractAssets);
  ok(weird.group.children.filter((c) => c.name !== 'silhouette').length === 3 && weird.silhouetteHolder.children.length === 1,
    'T07: 未知 topTheme/edgeMatId/rimDecal/silhouette 全部走降级不抛错');

  // 契约 release 路径（T17 卸载编排用）：几何归零 dispose
  // （acquire 记账：4 场景 spec + 降级探针 + 同主题重建 = 6 次）
  for (let i = 0; i < 6; i++) contractAssets.releaseGeometry('base/top-chamfer');
  ok(impl.geometry.get('base/top-chamfer') === undefined, 'T07: 契约 releaseGeometry 归零 dispose');

  console.log(failed === 0 ? '==== ALL CHECKS PASSED ====' : '==== CHECKS FAILED: ' + failed + ' ====');
  process.exitCode = failed === 0 ? 0 : 1;

})().catch((e) => { console.error('TEST DRIVER ERROR', e); process.exitCode = 1; });
`;

const bundle = await rolldown({
  input: 'virtual-test',
  plugins: [{
    name: 'virtual-test',
    resolveId(id) { return id === 'virtual-test' ? id : null; },
    load(id) { return id === 'virtual-test' ? testCode : null; },
  }],
  resolve: { alias: { '@': path.join(root, 'src') } },
  external: (id) => id === 'three' || id.startsWith('three/'),
  platform: 'node',
});

const { output } = await bundle.generate({ format: 'cjs' });
const req = createRequire(path.join(root, 'package.json'));
new Function('require', 'module', 'exports', output[0].code)(req, { exports: {} }, {});
