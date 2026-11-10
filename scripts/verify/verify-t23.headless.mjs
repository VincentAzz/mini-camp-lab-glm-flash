// verify-t23.headless.mjs —— T23 vehicleKit 首批 + C型房车 classC 行为冒烟（无头，无 WebGL/DOM 渲染）。
// 运行：node verify-t23.headless.mjs（自带 module.registerHooks 钩子，Node ≥20.19；同 temp-t19-smoke.mjs 模式）。
// 断言逐条对 docs/03 §4.2.1（3.1-1…13）/ §4.2.0（三件套/玻璃三档/钩子模板/布料天气挂点）/ §4.2.6（16/22 基准）。
import { registerHooks } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import ts from 'typescript';

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
        if (prop === 'getImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h });
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
    // 候选解析：p.ts → p/index.ts（T27 起部件库出现 barrel 目录导入，vite 可解析、无头钩子手动补）
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
  // Node strip-only 模式不支持 TS 参数属性（core/assets.ts RefCountedAssets 等）——
  // 经 typescript.transpileModule 全量 TS→ESM 转换后执行（与 tsc/vite build 同源工具链）。
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
    console.log(`  FAIL  ${name}${detail ? `  [${detail}]` : ''}`);
  }
}
function near(a, b, eps = 1e-3) {
  return Math.abs(a - b) <= eps;
}

/* ============================== 构建车型（Director buildVehicleStage 同序） ============================== */
const THREE = (await import('three')).default ?? (await import('three'));
const { classC } = await import('@/content/vehicles/classC');
const { Rng } = await import('@/shared/rng');

// 最小 SharedAssets（geometry/texture 缓存语义同 core/assets，release 在无头冒烟中不参与）
const geometryCache = new Map();
const textureCache = new Map();
const assets = {
  geometry(id, build) {
    let g = geometryCache.get(id);
    if (!g) { g = build(); geometryCache.set(id, g); }
    return g;
  },
  texture(id, build) {
    let t = textureCache.get(id);
    if (!t) { t = build(); textureCache.set(id, t); }
    return t;
  },
  releaseGeometry() {},
  releaseTexture() {},
};

console.log('== T23 classC 无头冒烟 ==');
check('模块身份 id/label/isDefault', classC.id === 'classC' && classC.label === 'C型房车' && classC.isDefault === true);
check('VehicleModule 四项齐备', typeof classC.buildExterior === 'function' && typeof classC.buildDeployment === 'function' && typeof classC.buildInterior === 'function' && !!classC.interiorLightHooks);

const root = new THREE.Group();
root.name = 'vehicle/classC';
const ctx = { root, camp: { groundY: 1.2, headingRad: 0.3, radius: 4.0 }, assets, rng: new Rng('vehicle:classC') };
const exterior = classC.buildExterior(ctx);
root.add(exterior.group);
const deployment = classC.buildDeployment(ctx);
const interior = classC.buildInterior(ctx);
root.add(interior.group);

/* ---- ① 外部（3.1-1 经典凸头整体 / 3.1-4 凸头舱 / footprint 口径） ---- */
console.log('-- ① 外部 --');
const fp = exterior.footprint;
const outerRadius = Math.hypot(fp.length / 2, fp.width / 2);
check('footprint 6.4×2.6（docs/03 §4.2.1）', fp.length === 6.4 && fp.width === 2.6, `len=${fp.length} wid=${fp.width}`);
check('外接半径 ≤4.2（★半径仲裁口径）', outerRadius <= 4.2, `r=${outerRadius.toFixed(3)}`);
check('外接半径 ≤海崖营位半径 4.0（不触发越界告警）', outerRadius <= 4.0, `r=${outerRadius.toFixed(3)}`);
check('paint 奶油白 #f3ead8 + weathering=false + texStripeC', exterior.paint.baseColor === '#f3ead8' && exterior.paint.weathering === false && (exterior.paint.textureKeys ?? []).includes('texStripeC') && exterior.paint.stripeSpec?.length === 2);
const boxMesh = root.getObjectByName('classC/box');
check('主厢体=ExtrudeGeometry 侧影挤出（建模字典②）', !!boxMesh && boxMesh.geometry instanceof THREE.ExtrudeGeometry);
check('主厢体双材质组（cap 贴 texStripeC / 侧沿素色）', Array.isArray(boxMesh?.material) && boxMesh.material.length === 2 && !!boxMesh.material[0].map);
const overMesh = root.getObjectByName('classC/cab-over');
check('凸头舱 cab-over 在场（3.1-4）', !!overMesh && overMesh.parent === exterior.group);
const fascia = root.getObjectByName('classC/fascia');
check('前脸面板+前挡洞（正影挤出）', !!fascia && fascia.geometry instanceof THREE.ExtrudeGeometry);
check('轮组 InstancedMesh ×2 组（胎/毂，后双胎 6 位）', (() => {
  const tires = root.getObjectByName('classC/wheel-tires/body');
  const hubs = root.getObjectByName('classC/wheel-hubs/body');
  return tires?.isInstancedMesh === true && hubs?.isInstancedMesh === true && tires.count === 6 && hubs.count === 6;
})());
check('轮眉 ×4 / 排气管 / 设备舱口 ×2 / 水电接驳口 / 尾灯 ×2 / 示廓灯 ×3', (() => {
  const names = [];
  root.traverse((o) => names.push(o.name));
  const has = (prefix, count) => names.filter((n) => typeof n === 'string' && n.startsWith(prefix)).length >= count;
  return has('classC/fender-front/', 2) && has('classC/fender-rear/', 2) && names.includes('classC/exhaust')
    && has('classC/hatch/', 2) && names.includes('classC/hookup') && has('classC/tail-lamp/', 2) && has('classC/marker/', 3);
})());

/* ---- ② 可透视窗与玻璃三档（3.1-5 主透视面；透窗「清楚看到」前提） ---- */
console.log('-- ② 玻璃三档与真开洞 --');
const windows = exterior.windows;
check('windows ≥6（前挡 tinted + 侧/门/滑出 clear）', windows.length >= 6, `n=${windows.length}`);
const byLabel = Object.fromEntries(windows.map((w) => [w.label, w]));
check('前挡 tinted 档 0.40', byLabel.front?.tint === 'tinted' && near(byLabel.front.mesh.material.opacity, 0.4));
const clearMats = new Set(windows.filter((w) => w.tint === 'clear').map((w) => w.mesh.material));
check('clear 档 0.24 且 5 扇 clear 共享同一材质（钩子一次写全场生效）', clearMats.size === 1 && near([...clearMats][0].opacity, 0.24));
const clearMat = [...clearMats][0];
check('玻璃材质：DoubleSide + depthWrite=false（三件套）', clearMat.side === THREE.DoubleSide && clearMat.depthWrite === false);
check('玻璃网格 renderOrder=20 + noOutline（docs/03 §4.2.1 三件套行）', windows.every((w) => w.mesh.renderOrder === 20 && w.mesh.userData.noOutline === true));
const sideL = byLabel['side-l']?.mesh;
const sideLBbox = new THREE.Box3().setFromObject(sideL);
check('侧窗玻璃洞形对位 x −1.9..−0.2 / y 1.5..2.05（真开洞贯通双侧的洞形）', near(sideLBbox.min.x, -1.9, 0.02) && near(sideLBbox.max.x, -0.2, 0.02) && near(sideLBbox.min.y, 1.5, 0.02) && near(sideLBbox.max.y, 2.05, 0.02), `x ${sideLBbox.min.x.toFixed(2)}..${sideLBbox.max.x.toFixed(2)} y ${sideLBbox.min.y.toFixed(2)}..${sideLBbox.max.y.toFixed(2)}`);
const sideR = byLabel['side-r']?.mesh;
check('侧窗 ×2 贯通双侧（z ±1.162 外偏 0.012）', near(sideL.position.z, 1.162) && near(sideR.position.z, -1.162));
const wsBbox = new THREE.Box3().setFromObject(byLabel.front.mesh);
check('前挡弧玻璃弧段在场（贴装于前脸洞外，x 越过 fascia 前沿 2.48）', wsBbox.max.x > 2.44 && wsBbox.max.x < 2.7 && wsBbox.max.y > 2.0, `maxX=${wsBbox.max.x.toFixed(3)} maxY=${wsBbox.max.y.toFixed(3)}`);

/* ---- ③ 升顶机构（3.1-2；布料挂点/收拢卷帘） ---- */
console.log('-- ③ 升顶 + 布料挂点 --');
const popTop = root.getObjectByName('classC/pop-top');
check('升顶楔+帐帘带+收拢卷帘合组在场（3.1-2）', !!popTop && popTop.parent === exterior.group
  && !!popTop.getObjectByName('classC/pop-top/wedge') && !!popTop.getObjectByName('classC/pop-top/band')
  && !!popTop.getObjectByName('classC/pop-top/roll/-0.6') && !!popTop.getObjectByName('classC/pop-top/roll/0.6'));
check('cloths=帐帘带 ×1：stiffness 0.9 / windFactor 0.12 / swayAxes y（docs/05 §7.1.2 C 行）', exterior.cloths.length === 1
  && exterior.cloths[0].stiffness === 0.9 && exterior.cloths[0].windFactor === 0.12
  && exterior.cloths[0].swayAxes.length === 1 && exterior.cloths[0].swayAxes[0] === 'y');
const bandMat = exterior.cloths[0].mesh.material;
check('帐帘带 opacity 0.85 + 透光 emissive #ffb066（authored 0，钩子写入）', near(bandMat.opacity, 0.85) && bandMat.transparent === true && bandMat.emissiveIntensity === 0 && `#${bandMat.emissive.getHexString()}` === '#ffb066');
const bandBbox = new THREE.Box3().setFromObject(exterior.cloths[0].mesh);
check('帐帘带环形围合楔底与车顶之间（y 2.35..2.77 带 h0.42）', near(bandBbox.min.y, 2.35, 0.03) && near(bandBbox.max.y, 2.79, 0.03), `y ${bandBbox.min.y.toFixed(2)}..${bandBbox.max.y.toFixed(2)}`);

/* ---- ④ 滑出舱（3.1-3） ---- */
console.log('-- ④ 侧拓展舱 --');
const slideOut = root.getObjectByName('classC/slide-out');
const slidePanel = root.getObjectByName('classC/slide-out/panel');
const slideBbox = new THREE.Box3().setFromObject(slideOut);
check('滑出舱合组在场（外移至 z 外沿 −2.10）', !!slideOut && near(slideBbox.min.z, -2.11, 0.02), `minZ=${slideBbox.min.z.toFixed(3)}`);
check('风琴套 + 滑轨 ×2（舱体与车身接缝读法）', !!slideOut.getObjectByName('classC/slide-out/bellow') && !!slideOut.getObjectByName('classC/slide-out/rail-bottom') && !!slideOut.getObjectByName('classC/slide-out/rail-top'));
check('滑出舱外板真窗洞 + clear 玻璃（沙发透窗可见）', !!root.getObjectByName('classC/glass-slideout') && slidePanel.geometry instanceof THREE.ExtrudeGeometry);

/* ---- ⑤ 展开机构（2 个 DeploymentPart，默认已展开） ---- */
console.log('-- ⑤ 展开机构 --');
check('buildDeployment 恰 2 项', deployment.length === 2, `n=${deployment.length}`);
check('kinds = [popTop, slideOut] 且 deployAmount 均 1', deployment.map((p) => p.kind).join(',') === 'popTop,slideOut' && deployment.every((p) => p.deployAmount === 1));
check('DeploymentPart node 挂 exterior 组（不重复接管）', deployment.every((p) => p.node.parent === exterior.group));

/* ---- ⑥ 天气挂点 roofTop ×3（T17 遗留②对齐） ---- */
console.log('-- ⑥ weatherSurfaces --');
check('weatherSurfaces=3 且全为 roofTop', exterior.weatherSurfaces.length === 3 && exterior.weatherSurfaces.every((s) => s.kind === 'roofTop'));
check('M4 snowShell ×3 预建（visible=false，挂 exterior 子树随车体变换）', exterior.weatherSurfaces.every((s) => s.snowShell instanceof THREE.Mesh && s.snowShell.visible === false && root.getObjectByName(s.snowShell.name) === s.snowShell));
check('雪壳材质互不重复（同材质重复注册会被 WeatherMaterialSystem 去重丢壳）', new Set(exterior.weatherSurfaces.map((s) => s.material.uuid)).size === 3);

/* ---- ⑦ 透视内饰三件套 + 16 named（3.1-6…12） ---- */
console.log('-- ⑦ 内饰 --');
const NAMED_KEYS = ['dashScreen', 'gaugeCluster', 'dinetteTable', 'dinetteBenchL', 'dinetteBenchR', 'kitchenSink', 'stove', 'fridge', 'overheadCabinets', 'bed', 'nightLamp', 'slideoutSofa', 'bookshelf', 'books', 'interiorFloor', 'ceilLamp'];
const namedKeys = Object.keys(interior.named);
check('named 恰 16 键且逐项对应 3.1 内部清单', namedKeys.length === 16 && NAMED_KEYS.every((k) => namedKeys.includes(k)) && namedKeys.every((k) => NAMED_KEYS.includes(k)), namedKeys.join(','));
check('named 对象全部在场于内饰组子树', NAMED_KEYS.every((k) => {
  let node = interior.named[k];
  while (node && node !== interior.group) node = node.parent;
  return node === interior.group;
}));
check('内饰组 noOutline（物体级硬开关，§5.3）', interior.group.userData.noOutline === true);
const innerShells = [];
interior.group.traverse((o) => { if (typeof o.name === 'string' && o.name.startsWith('classC/interior/inner-shell')) innerShells.push(o); });
check('三件套 ①innerShell：缩放 0.94 圆角盒 ×2（主厢+驾驶舱）BackSide 暖色', innerShells.length === 2 && innerShells.every((m) => m.material.side === THREE.BackSide));
const floorMesh = interior.named.interiorFloor;
check('三件套 ②地板 texWoodFloor oak（奶油木 #d9b98c 基调）', !!floorMesh && !!floorMesh.material.map && floorMesh.position.y === 0.66);
check('三件套 ③内饰不投影不接收阴影', (() => {
  let ok = true;
  interior.group.traverse((o) => { if (o.isMesh && (o.castShadow !== false || o.receiveShadow !== false)) ok = false; });
  return ok;
})());
root.updateWorldMatrix(true, true);
// 家具 bbox 只取 Mesh（halo 精灵为光晕贴花，不计入陈设体量）
const meshBBox = (object) => {
  const bbox = new THREE.Box3();
  object.traverse((o) => { if (o.isMesh) bbox.expandByObject(o); });
  return bbox.isEmpty() ? new THREE.Box3().setFromObject(object) : bbox;
};
const furnitureOutsideFloorOrCeil = NAMED_KEYS.filter((k) => {
  const bbox = meshBBox(interior.named[k]);
  return bbox.min.y < 0.63 || bbox.max.y > 2.32;
});
check('家具落位连贯（地板 0.66 以上 / 顶 2.30 以下，无穿模地面天花板）', furnitureOutsideFloorOrCeil.length === 0, furnitureOutsideFloorOrCeil.join(','));
const bandX = [ -1.9, -0.2 ];
const windowZoneNamed = ['fridge', 'kitchenSink', 'stove', 'overheadCabinets', 'bed', 'bookshelf', 'books'];
const inWindowZone = windowZoneNamed.filter((k) => {
  const bbox = meshBBox(interior.named[k]);
  return bbox.max.x > bandX[0] && bbox.min.x < bandX[1];
});
check('侧窗带（x −1.9..−0.2）视域内陈设在≥5 组（透窗「清楚看到」）', inWindowZone.length >= 5, inWindowZone.join(','));
check('高柜贴远墙（fridge/吊柜贴 −Z 墙，不堵 +Z 侧窗带）', (() => {
  const fb = meshBBox(interior.named.fridge);
  const cb = meshBBox(interior.named.overheadCabinets);
  return fb.max.z < 0 && cb.max.z < 0;
})());

/* ---- ⑧ 内饰灯光钩子（D2 链；小夜灯 breath + 顶灯 steady） ---- */
console.log('-- ⑧ 内饰灯光钩子 --');
const lamps = classC.interiorLightHooks.lamps;
check('lamps ×2（nightLamp breath + ceilLamp steady）', lamps.length === 2 && lamps[0].mode === 'breath' && lamps[1].mode === 'steady');
check('小夜灯 breath 6s depth 0.18（docs/05 §7.1.4★定值）', lamps[0].params.period === 6 && lamps[0].params.depth === 0.18);
check('灯 authored 基值 ≥1（R-P3-1 注③ 纪律：注册期快照 authored）', lamps[0].emissiveMat.emissiveIntensity >= 1.3 && lamps[1].emissiveMat.emissiveIntensity >= 0.7, lamps.map((l) => l.emissiveMat.emissiveIntensity.toFixed(2)).join('/'));
check('halo 精灵 ×2（additive，renderOrder 20）', lamps.every((l) => l.halo instanceof THREE.Sprite && l.halo.material.blending === THREE.AdditiveBlending && l.halo.renderOrder === 20));
const fillLight = interior.group.getObjectByName('classC/fill-light');
check('车内暖光点光（#ffb066 位 (−0.9,1.8,0)，castShadow=false）', fillLight instanceof THREE.PointLight && `#${fillLight.color.getHexString()}` === '#ffb066' && near(fillLight.position.x, -0.9) && near(fillLight.position.y, 1.8) && fillLight.castShadow === false);

// 钩子驱动链（TimeLightSystem 下发 power/emphasis/blend 的消费面）
classC.interiorLightHooks.applyInteriorLight(1, 1, 1);
check('夜间 power=1：可透视窗 opacity → 0.22（docs/04 §5.5）', near(clearMat.opacity, 0.22) && near(byLabel.front.mesh.material.opacity, 0.22), `${clearMat.opacity.toFixed(3)}/${byLabel.front.mesh.material.opacity.toFixed(3)}`);
check('夜间 power=1：帐帘带透光 0.55 / 床垫 0.10 / innerShell 0.12（glowTags 定值）', (() => {
  const bedMat = interior.named.bed.getObjectByName('classC/bed-mattress').material;
  const shellMat = innerShells[0].material;
  return near(bandMat.emissiveIntensity, 0.55) && near(bedMat.emissiveIntensity, 0.10) && near(shellMat.emissiveIntensity, 0.12);
})());
check('夜间 power=1：屏幕自发光标量 → 1.0 + 暖光点光 1.15×1×1', (() => {
  const screenMat = [];
  interior.named.dashScreen.traverse((o) => { if (o.isMesh && o.material.isMeshBasicMaterial) screenMat.push(o.material); });
  return near(screenMat[0].color.r, 1.0) && near(fillLight.intensity, 1.15);
})());
classC.interiorLightHooks.applyInteriorLight(0.85, 1, 1);
check('黄昏 power=0.85：屏幕标量 0.895（接近全亮【3.1-13】冷暖对比）+ 点光 0.9775', (() => {
  const screenMat = [];
  interior.named.dashScreen.traverse((o) => { if (o.isMesh && o.material.isMeshBasicMaterial) screenMat.push(o.material); });
  return near(screenMat[0].color.r, 0.3 + 0.7 * 0.85) && near(fillLight.intensity, 1.15 * 0.85);
})());
classC.interiorLightHooks.applyInteriorLight(0, 0, 1);
check('白天 power=0：玻璃回到 0.24/0.40、glow 全灭、点光 0（blend=1 直达）', near(clearMat.opacity, 0.24) && near(byLabel.front.mesh.material.opacity, 0.4) && bandMat.emissiveIntensity === 0 && fillLight.intensity === 0);

/* ---- ⑨ 无人物红线 + 预算粗核 ---- */
console.log('-- ⑨ 红线与预算 --');
const humanHit = [];
root.traverse((o) => {
  const label = `${o.name ?? ''}`;
  if (/(person|human|figure|humanoid|people|人物|人形)/i.test(label)) humanHit.push(label);
});
check('无人形几何（名称扫描零命中）', humanHit.length === 0, humanHit.join(','));
let meshCount = 0;
let triangles = 0;
root.traverse((o) => {
  if (!o.isMesh && !o.isSprite) return;
  meshCount += 1;
  const g = o.geometry;
  if (g) triangles += (g.index ? g.index.count : g.getAttribute('position').count) / 3;
});
check('三角形 ≤45k（docs/04 §5.7 车辆本体预算）', triangles <= 45000, `tris=${Math.round(triangles)} meshes=${meshCount}`);
check('实例化成对壳：轮组恒 2 DC/组（body+shell 共享矩阵）', (() => {
  const tires = root.getObjectByName('classC/wheel-tires/body');
  const shell = root.getObjectByName('classC/wheel-tires/shell');
  return !!shell && shell.isInstancedMesh && shell.count === tires.count && shell.parent === tires.parent
    && tires.parent.userData.instancedGroup?.body === tires && tires.parent.userData.instancedGroup?.shell === shell;
})());

/* ---- ⑩ 重复构建幂等（车型交换路径预演：材质单例重写 authored 基值） ---- */
console.log('-- ⑩ 重复构建 --');
const root2 = new THREE.Group();
const ctx2 = { root: root2, camp: ctx.camp, assets, rng: new Rng('vehicle:classC') };
const exterior2 = classC.buildExterior(ctx2);
root2.add(exterior2.group);
classC.buildDeployment(ctx2);
const interior2 = classC.buildInterior(ctx2);
root2.add(interior2.group);
check('二次构建 named 仍 16 键（交换后注册快照不漂移）', Object.keys(interior2.named).length === 16);
check('二次构建灯 authored 基值重写（1.4/0.77）', classC.interiorLightHooks.lamps[0].emissiveMat.emissiveIntensity === 1.4);
check('二次构建灯句柄随构建刷新（halo 挂新内饰子树——wind/breath 重复注册不冲突）', interior2 !== interior && (() => {
  let node = classC.interiorLightHooks.lamps[0].halo;
  while (node && node !== interior2.group) node = node.parent;
  return node === interior2.group;
})());

/* ============================== ⑪ Director 集成（registry→装配→对位→告警口径→车型交换→卸载） ============================== */
console.log('-- ⑪ Director 集成 --');
{
  const { Director } = await import('@/core/director');
  const { Registry } = await import('@/core/registry');
  const { vehicleRegistry } = await import('@/content/vehicles/registry');
  const { timeRegistry } = await import('@/content/times/registry');
  const { weatherRegistry } = await import('@/content/weathers/registry');
  const { WeatherMaterialSystem } = await import('@/systems/weatherMaterial');
  const { RhythmClock } = await import('@/systems/clock');

  // 最小探针场景（campAnchor 仿海崖行：x/z/heading 逐字；radius 为探针变量）
  const makeProbeScene = (id, radius, anchor) => ({
    id,
    label: id,
    buildTerrain() {
      const group = new THREE.Group();
      group.name = `${id}/terrain`;
      return { group, campAnchor: { position: new THREE.Vector3(...anchor), headingRad: 0.3, groundY: anchor[1], radius } };
    },
    buildProps() {
      return { group: new THREE.Group(), named: {}, cloths: [], lamps: [], emitters: [], weatherSurfaces: [] };
    },
    createAnimations() { return []; },
    palette: { colorChannels: {}, baseStyle: { topTheme: 'lawn', edgeMatId: 'rockStrata', rimDecal: null, skirtLayers: 0, silhouette: null }, baseFog: 0.1 },
    lightHooks: { applyLighting() {} },
  });
  // 越界探针车型：复用 classC 全部构建器（id 不同——验证 footprint 告警口径与车型交换卸载路径）
  const classCProbe = {
    id: 'classC-probe',
    label: 'C型房车·越界探针',
    buildExterior: classC.buildExterior,
    buildDeployment: classC.buildDeployment,
    buildInterior: classC.buildInterior,
    interiorLightHooks: classC.interiorLightHooks,
  };
  const sceneRegistry = new Registry();
  sceneRegistry.register(makeProbeScene('probeA', 4.0, [0, 1.2, 0.8]));
  sceneRegistry.register(makeProbeScene('probeB', 4.2, [1.5, 0.6, -0.5]));
  const localVehicleRegistry = new Registry();
  localVehicleRegistry.register(classCProbe); // 探针先注册→applyState 默认档取注册序首项
  localVehicleRegistry.register(vehicleRegistry.get('classC'));

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
    director = new Director({
      engine: engineDuck,
      sceneRegistry,
      vehicleRegistry: localVehicleRegistry,
      timeRegistry,
      weatherRegistry,
    });
    director.start();
    director.applyState();
    check('Director 装配：vehicle/classC 入场景且按 campAnchor 对位（y=groundY 1.2、heading 0.3）', (() => {
      const vroot = engineDuck.scene.getObjectByName('vehicle/classC');
      return !!vroot && near(vroot.position.x, 0) && near(vroot.position.y, 1.2) && near(vroot.position.z, 0.8) && near(vroot.rotation.y, 0.3);
    })());
    check('Director 装配：外内三组+16 named 全部挂车根', (() => {
      const vroot = engineDuck.scene.getObjectByName('vehicle/classC');
      const keys = Object.keys(interior.named);
      return !!vroot.getObjectByName('classC/exterior') && !!vroot.getObjectByName('classC/interior')
        && keys.every((k) => vroot.getObjectByName(`classC/interior/${k}`) !== undefined);
    })());
    check('footprint 3.454 ≤ 营位 4.0：不触发越界告警', warnings.filter((w) => w.includes('footprint exceeds camp radius')).length === 0);
    check('车内布料经 Director 注册 WindSystem（帐帘带补丁后材质带风摆克隆标记）', (() => {
      const band = engineDuck.scene.getObjectByName('classC/pop-top/band');
      return !!band && band.material.name.endsWith('+wind') && band.customDepthMaterial !== undefined;
    })());
    check('雪壳经 Director 注册 WeatherMaterialSystem（wmShellExtrude 注入且 visible=false 待 snowCover）', (() => {
      const shell = engineDuck.scene.getObjectByName('classC/snow-roof');
      return !!shell && shell.material.userData.wmShellExtrude !== undefined && shell.visible === false;
    })());

    // 越界口径负样本：逐段等待交换**激活完成**（FadeSwapRunner 收尾，vehicleSwap=null）后再下发下一段
    const waitSwap = (pred) => {
      for (let i = 0; i < 1500; i++) {
        engineDuck.hooks.transition(0.016);
        if (pred()) return true;
      }
      return pred();
    };
    const vehicleRoots = () => engineDuck.scene.children.filter((c) => String(c.name).startsWith('vehicle/')).map((c) => c.name);
    const warnCountBefore = warnings.length;
    // ① 正常交换：classC → 探针（同 geometry 复用构建器；营位 4.0 不越界）
    director.applyState({ vehicle: 'classC-probe' });
    check('车型交换完成（classC 卸载 → 探针激活，交换路径零抛错、旧根移除）', waitSwap(() => director.vehicle?.id === 'classC-probe' && director.vehicleSwap === null && !engineDuck.scene.getObjectByName('vehicle/classC')));
    check('营位 4.0 + 外接半径 3.454：仍无越界告警', warnings.slice(warnCountBefore).filter((w) => w.includes('footprint exceeds camp radius')).length === 0);
    // ② 小半径场景 + 探针重建：告警口径分支
    sceneRegistry.register({ ...makeProbeScene('probeTiny', 3.0, [0, 1.2, 0.8]) });
    director.applyState({ scene: 'probeTiny' });
    check('小半径场景交换完成（radius 3.0 激活）', waitSwap(() => director.scene?.id === 'probeTiny' && director.sceneSwap === null));
    check('场景交换后车型天气面重注册（activateScene 重注册路径零抛错，雪壳仍挂车根）', engineDuck.scene.getObjectByName('classC/snow-roof') !== undefined);
    director.applyState({ vehicle: 'classC' });
    check('探针营位上重建正式 classC 完成', waitSwap(() => director.vehicle?.id === 'classC' && director.vehicleSwap === null));
    director.applyState({ vehicle: 'classC-probe' });
    check('越界探针车型在小半径营位重建完成（只告警不阻断）', waitSwap(() => director.vehicle?.id === 'classC-probe' && director.vehicleSwap === null));
    check('半径 3.0 营位 + 外接半径 3.454：触发「[vehicle] footprint exceeds camp radius」告警', warnings.slice(warnCountBefore).some((w) => w.includes('footprint exceeds camp radius') && w.includes('3.45')), warnings.slice(warnCountBefore).find((w) => w.includes('footprint')) ?? '（无告警）');
    check('告警后装配仍完成（探针车型在场，交换收尾按 campAnchor 复位 y=groundY 1.2）', (() => {
      const vroot = engineDuck.scene.getObjectByName('vehicle/classC-probe');
      return !!vroot && near(vroot.position.y, 1.2);
    })());

    // WeatherMaterialSystem.register/unregister 对（T23 新增）：注册→雪可见；反注册→脱离驱动；重注册→恢复
    const wm = new WeatherMaterialSystem(new RhythmClock());
    const probeAssets = { geometry: (id, build) => geometryCache.has(id) ? geometryCache.get(id) : (geometryCache.set(id, build()), geometryCache.get(id)), texture: (id, build) => textureCache.has(id) ? textureCache.get(id) : (textureCache.set(id, build()), textureCache.get(id)), releaseGeometry() {}, releaseTexture() {} };
    const probeRoot = new THREE.Group();
    const extProbe = classC.buildExterior({ root: probeRoot, camp: { groundY: 0, headingRad: 0, radius: 4 }, assets: probeAssets, rng: new Rng('probe') });
    const SNOW = { wetness: 0, puddle: 0, clothSag: 0, snowCover: 1, lineFade: 0, fogMul: 1, cloudShadow: 0 };
    const CLEAR = { wetness: 0, puddle: 0, clothSag: 0, snowCover: 0, lineFade: 0, fogMul: 1, cloudShadow: 0 };
    wm.register(extProbe.weatherSurfaces);
    wm.setComponentsInstant(SNOW);
    wm.update();
    check('register+snowCover=1：三枚雪壳全部可见（shell 驱动路径）', extProbe.weatherSurfaces.every((s) => s.snowShell.visible === true));
    wm.unregister(extProbe.weatherSurfaces);
    wm.setComponentsInstant(CLEAR);
    wm.update();
    check('unregister 后雪壳脱离驱动（雪停后壳保持原状不被复位——无残留绑定）', extProbe.weatherSurfaces.every((s) => s.snowShell.visible === true));
    wm.register(extProbe.weatherSurfaces);
    wm.setComponentsInstant(CLEAR);
    wm.update();
    check('反注册后可重注册并恢复驱动（雪停壳隐，幂等 uuid 表已清）', extProbe.weatherSurfaces.every((s) => s.snowShell.visible === false && s.snowShell.material.userData.wmShellExtrude !== undefined));

    director.dispose();
    check('dispose：车型卸载路径（unloadVehicle→weatherMaterial.unregister）零抛错且车根移除', !engineDuck.scene.getObjectByName('vehicle/classC-probe') && vehicleRoots().length === 0);
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
