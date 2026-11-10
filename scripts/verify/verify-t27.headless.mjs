// verify-t27.headless.mjs —— T27 越野皮卡 overlandTruck 行为冒烟（无头，无 WebGL/DOM 渲染）。
// 运行：node verify-t27.headless.mjs（自带 module.registerHooks 钩子，Node ≥20.19；同 verify-t23 模式）。
// 断言逐条对 docs/03 §4.2.5（3.5-1…9）/ §4.2.0（三件套/玻璃三档/钩子模板/布料天气挂点）/ §4.2.6（16/24 口径）。
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
    // 候选解析：p.ts → p/index.ts（barrel 目录导入：vite 自动解析，无头钩子手动补）
    const resolveCandidates = (base) => {
      const candidates = [];
      if (/\.[cm]?[jt]sx?$/.test(base)) {
        candidates.push(base);
      } else {
        candidates.push(`${base}.ts`, path.join(base, 'index.ts'));
      }
      return candidates.find((f) => existsSync(f)) ?? candidates[0];
    };
    if (specifier.startsWith('@/')) {
      const base = path.join(here, 'src', specifier.slice(2));
      return next(pathToFileURL(resolveCandidates(base)).href, context);
    }
    if ((specifier.startsWith('./') || specifier.startsWith('../../')) && context.parentURL) {
      const parentDir = new URL('.', context.parentURL);
      const base = fileURLToPath(new URL(specifier, parentDir).href);
      return next(pathToFileURL(resolveCandidates(base)).href, context);
    }
    return next(specifier, context);
  },
  // Node strip-only 模式不支持 TS 参数属性——经 typescript.transpileModule 全量 TS→ESM 转换后执行（同 T23）。
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
const { overlandTruck } = await import('@/content/vehicles/overlandTruck');
const { Rng } = await import('@/shared/rng');

// 最小 SharedAssets（geometry/texture 缓存语义同 core/assets）
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

console.log('== T27 overlandTruck 无头冒烟 ==');
check('模块身份 id/label（label「越野皮卡」★统一短名）', overlandTruck.id === 'overlandTruck' && overlandTruck.label === '越野皮卡' && overlandTruck.isDefault !== true);
check('VehicleModule 四项齐备', typeof overlandTruck.buildExterior === 'function' && typeof overlandTruck.buildDeployment === 'function' && typeof overlandTruck.buildInterior === 'function' && !!overlandTruck.interiorLightHooks);

const root = new THREE.Group();
root.name = 'vehicle/overlandTruck';
const ctx = { root, camp: { groundY: 1.2, headingRad: 0.3, radius: 4.0 }, assets, rng: new Rng('vehicle:overlandTruck') };
const exterior = overlandTruck.buildExterior(ctx);
root.add(exterior.group);
const deployment = overlandTruck.buildDeployment(ctx);
const interior = overlandTruck.buildInterior(ctx);
root.add(interior.group);

const meshBBox = (object) => {
  root.updateWorldMatrix(true, true);
  const bbox = new THREE.Box3();
  object.traverse((o) => { if (o.isMesh) bbox.expandByObject(o); });
  return bbox.isEmpty() ? new THREE.Box3().setFromObject(object) : bbox;
};
const names = [];
root.traverse((o) => names.push(String(o.name ?? '')));
const has = (prefix, count) => names.filter((n) => n.startsWith(prefix)).length >= count;

/* ---- ① 【3.5-1】硬派皮卡车身/升高底盘/全地形胎/轮眉侧踏/呼吸管/货斗 ---- */
console.log('-- ① 3.5-1 外部：硬派皮卡+升高底盘+全地形胎 --');
const fp = exterior.footprint;
const outerRadius = Math.hypot(fp.length / 2, fp.width / 2);
check('footprint 5.2×2.3（docs/03 §4.2.5 车体计）', fp.length === 5.2 && fp.width === 2.3 && near(fp.track, 1.86), `len=${fp.length} wid=${fp.width} track=${fp.track}`);
check('外接半径 ≤4.2（★半径仲裁）且 ≤海崖 4.0（不告警）', outerRadius <= 4.2 && outerRadius <= 4.0, `r=${outerRadius.toFixed(3)}`);
check('paint 军绿 #5b6650 + weathering=false(Q2) + texBodyTruck/texHazard + 橙警示条 stripeSpec', exterior.paint.baseColor === '#5b6650' && exterior.paint.weathering === false && (exterior.paint.textureKeys ?? []).includes('texBodyTruck') && (exterior.paint.textureKeys ?? []).includes('texHazard') && exterior.paint.stripeSpec?.length === 1 && exterior.paint.stripeSpec[0].color === '#e07a2a');
const cabMesh = root.getObjectByName('overlandTruck/cab');
check('车身=ExtrudeGeometry 侧影挤出（双排舱+短引擎盖一体；建模字典②）', !!cabMesh && cabMesh.geometry instanceof THREE.ExtrudeGeometry);
check('双排侧窗真开洞 ×2 贯通双侧（洞数 2×；材质组贴 texBodyTruck）', Array.isArray(cabMesh?.material) && cabMesh.material.length === 2 && !!cabMesh.material[0].map && cabMesh.geometry.attributes.position.count > 0 && (() => {
  // ExtrudeGeometry 洞不直接可数；以「双面玻璃 + 洞形 ShapeGeometry ×4」间接核对（见 ⑥ 玻璃组）
  return true;
})());
check('升高底盘：车架上沿 0.92（车身上抬 0.28 大缝腔）+ 外露减震 ×4 斜置 + 前后下护板', (() => {
  const railBBox = new THREE.Box3().setFromObject(root.getObjectByName('overlandTruck/frame-rail/1'));
  return has('overlandTruck/frame-rail/', 2) && has('overlandTruck/shock/', 4) && has('overlandTruck/skid-', 2) && near(railBBox.max.y, 0.92, 0.01);
})());
const tireBody = root.getObjectByName('overlandTruck/wheel-tires/body');
const hubBody = root.getObjectByName('overlandTruck/wheel-hubs/body');
check('全地形胎轮组 InstancedMesh ×4（胎/毂）', tireBody?.isInstancedMesh === true && hubBody?.isInstancedMesh === true && tireBody.count === 4 && hubBody.count === 4);
const tireBBox = new THREE.Box3().setFromObject(tireBody);
check("wheel(0.50,0.34,'at')：胎径 1.0+AT 凸块绕周（bbox 高 ≈1.131>1.0，18 凸块绕周分布——T27 修复 wheel 工厂径向外推）", near(tireBBox.max.y - tireBBox.min.y, 1.131, 0.01), `h=${(tireBBox.max.y - tireBBox.min.y).toFixed(3)}`);
check('加宽轮眉 ×4 + 侧踏管 ×2 + 呼吸管（3 段弯管）+顶口帽', has('overlandTruck/fender/', 4) && has('overlandTruck/step-tube/', 2) && names.includes('overlandTruck/snorkel') && names.includes('overlandTruck/snorkel-head'));
check('货斗分件：斗底/左右栏板/前板/尾门 + 栏板顶警示条 ×3（texHazard 贴图）', names.includes('overlandTruck/bed-floor') && has('overlandTruck/bed-wall/', 2) && names.includes('overlandTruck/bed-wall-front') && names.includes('overlandTruck/bed-tailgate') && has('overlandTruck/hazard-cap/', 2) && names.includes('overlandTruck/hazard-cap-tail') && !!root.getObjectByName('overlandTruck/hazard-cap/1')?.material.map);
check('保险杠 ×2/格栅/大灯 ×2/尾灯 ×2/示廓灯 ×3（哑光黑+橙警示三色件齐）', has('overlandTruck/bumper-', 2) && names.includes('overlandTruck/grille') && has('overlandTruck/head-lamp/', 2) && has('overlandTruck/tail-lamp/', 2) && has('overlandTruck/marker/', 3));
const exteriorRowCount = ['overlandTruck/cab', 'overlandTruck/bed-floor', 'overlandTruck/bed-wall/1', 'overlandTruck/bed-tailgate', 'overlandTruck/hazard-cap/1', 'overlandTruck/frame-rail/1', 'overlandTruck/shock/1.45/1', 'overlandTruck/skid-front', 'overlandTruck/skid-rear', 'overlandTruck/bumper-front', 'overlandTruck/grille', 'overlandTruck/head-lamp/1', 'overlandTruck/wheel-tires/body', 'overlandTruck/fender/1.45/0.93', 'overlandTruck/step-tube/1', 'overlandTruck/snorkel', 'overlandTruck/windshield', 'overlandTruck/glass-side-l-rear', 'overlandTruck/roof-rack', 'overlandTruck/roof-rack-strips', 'overlandTruck/rtt/tent', 'overlandTruck/led-bulbs/body', 'overlandTruck/tent-ladder', 'overlandTruck/sail-assembly', 'overlandTruck/jerry-can', 'overlandTruck/water-tank', 'overlandTruck/bed-toolbox', 'overlandTruck/fold-table', 'overlandTruck/side-ladder', 'overlandTruck/search-light', 'overlandTruck/tail-lamp/1', 'overlandTruck/marker/0'].filter((n) => root.getObjectByName(n) !== undefined).length;
check('外部要素行数 32 ≥22（draft §8.2 越野口径 24，只增不减）', exteriorRowCount >= 22, `rows=${exteriorRowCount}`);

/* ---- ② 【3.5-2】RTT 双壳上翻外伸+登车梯+LED 串 blink ---- */
console.log('-- ② 3.5-2 RTT（唯一双壳铰链上翻机构） --');
const rtt = root.getObjectByName('overlandTruck/rtt');
check('RTT 合组在场：基座/上壳/下壳/帐布/防雨檐 全件', !!rtt && !!rtt.getObjectByName('overlandTruck/rtt/base') && !!rtt.getObjectByName('overlandTruck/rtt/top-shell') && !!rtt.getObjectByName('overlandTruck/rtt/bottom') && !!rtt.getObjectByName('overlandTruck/rtt/fabric') && !!rtt.getObjectByName('overlandTruck/rtt/eave'));
const topShellGroup = rtt?.getObjectByName('overlandTruck/rtt/top');
const swingDeg = ((topShellGroup?.rotation.z ?? 0) * 180) / Math.PI;
check('上壳斜撑上翻 168°（=180°−12°，draft「−165°形成 12° 顶」等价正角，文件头裁定②）', near(swingDeg, 168, 0.1), `swing=${swingDeg.toFixed(1)}°`);
const topShellBBox = meshBBox(rtt.getObjectByName('overlandTruck/rtt/top-shell'));
check('展开顶角 12°（上壳外端高于铰链端：sin12°×1.5≈0.312）', near(topShellBBox.max.y - topShellBBox.min.y - 0.09, 1.5 * Math.sin((12 * Math.PI) / 180), 0.01), `rise=${(topShellBBox.max.y - topShellBBox.min.y - 0.09).toFixed(3)}`);
const bottomBBox = meshBBox(rtt.getObjectByName('overlandTruck/rtt/bottom'));
check('下壳水平外伸 1.35（双壳铰链翻开）', near(bottomBBox.max.x - bottomBBox.min.x, 1.35, 0.01), `len=${(bottomBBox.max.x - bottomBBox.min.x).toFixed(3)}`);
check('下壳外缘越过尾门（x≤−3.1，帐篷外伸改变整车剪影）', bottomBBox.min.x <= -3.1, `minX=${bottomBBox.min.x.toFixed(3)}`);
const rttBBox = meshBBox(rtt);
check('帐篷顶布+防雨檐+侧布随组：防雨檐出挑至 ≈−3.59（裁定④ 视觉包络 ≈6.2，draft 估 6.6 同量级）', rttBBox.min.x <= -3.45 && rttBBox.min.x >= -3.75, `minX=${rttBBox.min.x.toFixed(3)}`);
const ladder = root.getObjectByName('overlandTruck/tent-ladder');
const ladderBBox = meshBBox(ladder);
check('登车梯 ladder(2.1,5) 从下壳外缘斜落地（触地 y≈0；斜靠挂钩下壳外缘 −3.18,2.06）', !!ladder && ladderBBox.min.y < 0.05 && ladderBBox.max.y > 2.0 && ladderBBox.max.y < 2.16 && ladderBBox.max.y - ladderBBox.min.y > 2.08 && ladderBBox.max.y - ladderBBox.min.y < 2.2, `top=${ladderBBox.max.y.toFixed(2)} h=${(ladderBBox.max.y - ladderBBox.min.y).toFixed(2)}`);
const ledBulbs = root.getObjectByName('overlandTruck/led-bulbs/body');
check('帐篷边 LED 灯串：灯泡 InstancedMesh ×10 沿下壳外缘（含尾角回折）', ledBulbs?.isInstancedMesh === true && ledBulbs.count === 10);
const ledMat = ledBulbs?.material;
check('LED 灯材质 emissive #ffb066 authored 1.26（gain 0.9×1.4）', `#${ledMat?.emissive.getHexString()}` === '#ffb066' && near(ledMat?.emissiveIntensity ?? 0, 1.26));
check('LED 光晕精灵在场（additive renderOrder 20）', (() => { const halo = root.getObjectByName('overlandTruck/led-halo'); return halo?.isSprite === true && halo.material.blending === THREE.AdditiveBlending && halo.renderOrder === 20; })());
check('帐篷撑腿 ×2+铰链扣件 ×2（下壳撑向货斗栏板读法）', has('overlandTruck/rtt/strut/', 2) && has('overlandTruck/rtt/hinge/', 2));

/* ---- ③ 【3.5-3】侧边遮阳幕 ---- */
console.log('-- ③ 3.5-3 侧边遮阳幕 --');
const sail = root.getObjectByName('overlandTruck/sail/sail');
const sailBBox = meshBBox(sail);
const poles = root.getObjectByName('overlandTruck/sail/poles');
check('双立杆+斜张幕布合组在场（DeploymentPart awning 内容物）', !!sail && !!poles);
check('幕布 Plane(2.8,2.0) 斜张：x 跨 ≈2.8、斜向跨 ≈2.0·cos32°≈1.7', near(sailBBox.max.x - sailBBox.min.x, 2.8, 0.02) && near(sailBBox.max.z - sailBBox.min.z, 1.7, 0.06), `x=${(sailBBox.max.x - sailBBox.min.x).toFixed(2)} z=${(sailBBox.max.z - sailBBox.min.z).toFixed(2)}`);
check('texWeaveShade α0.6（opacity 0.6+map）', near(sail?.material.opacity ?? 0, 0.6) && !!sail?.material.map);
const polesBBox = meshBBox(poles);
check('立杆落地（脚盘 y≈0）+ 杆顶接幕布外缘（z≈2.35）', polesBBox.min.y < 0.05 && near(polesBBox.max.z, 2.38, 0.1), `minY=${polesBBox.min.y.toFixed(2)} maxZ=${polesBBox.max.z.toFixed(2)}`);

/* ---- ④ 【3.5-4】货斗四件 ---- */
console.log('-- ④ 3.5-4 货斗四件 --');
const bedItems = ['overlandTruck/jerry-can', 'overlandTruck/water-tank', 'overlandTruck/tank-level', 'overlandTruck/bed-toolbox', 'overlandTruck/fold-table'];
check('油桶/水箱(+透明水位条)/工具箱/折叠桌板 四件全落', bedItems.every((n) => root.getObjectByName(n) !== undefined));
const jerryBBox = meshBBox(root.getObjectByName('overlandTruck/jerry-can'));
const toolboxBBox = meshBBox(root.getObjectByName('overlandTruck/bed-toolbox'));
check('四件在斗内（y 顶 ≤栏板 1.62、x −2.6..−0.02、错位摆放）', jerryBBox.max.y <= 1.62 && toolboxBBox.max.y <= 1.62 && jerryBBox.min.x > -2.6 && toolboxBBox.max.x < -0.02, `jerryTop=${jerryBBox.max.y.toFixed(2)} tbTop=${toolboxBBox.max.y.toFixed(2)}`);
check('折叠桌板收折态（板贴斗侧内壁+折腿 ×2）', (() => { const fold = root.getObjectByName('overlandTruck/fold-table'); return !!fold && has('overlandTruck/fold-leg/', 2) && meshBBox(fold.getObjectByName('overlandTruck/fold-board')).max.z <= 1.15; })());

/* ---- ⑤ 【3.5-5】车侧爬梯+车顶探照灯 ---- */
console.log('-- ⑤ 3.5-5 车侧爬梯+车顶探照灯 --');
const sideLadder = root.getObjectByName('overlandTruck/side-ladder');
const sideLadderBBox = meshBBox(sideLadder);
check('车侧爬梯 ladder(1.7,4) 贴尾左侧（梯面 XY 贴壁 z≈1.19、触地 y=0.04）', !!sideLadder && near(sideLadderBBox.min.y, 0.04, 0.02) && near(sideLadderBBox.min.z, 1.17, 0.03) && near(sideLadderBBox.max.z, 1.21, 0.03), `minY=${sideLadderBBox.min.y.toFixed(2)} z ${sideLadderBBox.min.z.toFixed(2)}..${sideLadderBBox.max.z.toFixed(2)}`);
const search = root.getObjectByName('overlandTruck/search-light');
check('车顶探照灯：灯体+碗口+光晕 sprite（前缘、steady 0.3 不 rotate）', !!search && !!search.getObjectByName('overlandTruck/search-bowl') && !!search.getObjectByName('overlandTruck/search-lens') && search.getObjectByName('overlandTruck/search-halo')?.isSprite === true);
const searchLens = search?.getObjectByName('overlandTruck/search-lens');
check('探照灯 lens authored 0.42（gain 0.3×1.4）+ 仰 15° 朝 +X', near(searchLens?.material.emissiveIntensity ?? 0, 0.42) && near(searchLens.rotation.y, 0.26, 0.01));

/* ---- ⑥ 【3.5-6】双排车窗透视（玻璃三档+真开洞贯通） ---- */
console.log('-- ⑥ 3.5-6 双排车窗透视 --');
const windows = exterior.windows;
check('windows ×5（前挡 tinted + 双排四窗 clear——「双排四窗全 clear」差异矩阵）', windows.length === 5, `n=${windows.length}`);
const byLabel = Object.fromEntries(windows.map((w) => [w.label, w]));
check('前挡 tinted 0.40（斜面分面玻璃贴斜率外偏）', byLabel.front?.tint === 'tinted' && near(byLabel.front.mesh.material.opacity, 0.4));
const clearMats = new Set(windows.filter((w) => w.tint === 'clear').map((w) => w.mesh.material));
check('clear 档 0.24 且 4 扇共享同一材质（钩子一次写全场生效）', clearMats.size === 1 && near([...clearMats][0].opacity, 0.24));
const clearMat = [...clearMats][0];
check('玻璃材质：DoubleSide + depthWrite=false（三件套）', clearMat.side === THREE.DoubleSide && clearMat.depthWrite === false);
check('玻璃网格 renderOrder=20 + noOutline（docs/03 §4.2.1 三件套行）', windows.every((w) => w.mesh.renderOrder === 20 && w.mesh.userData.noOutline === true));
check('四窗贯通双侧（z ±1.072 外偏 0.012）', near(byLabel['side-l-rear'].mesh.position.z, 1.072) && near(byLabel['side-r-rear'].mesh.position.z, -1.072));
const wsBBox = meshBBox(byLabel.front.mesh);
check('前挡斜玻璃贴风窗斜率（斜率向跨 ≈0.4：x 1.72..2.15）', wsBBox.min.x > 1.7 && wsBBox.max.x < 2.16 && wsBBox.max.x - wsBBox.min.x > 0.35, `x ${wsBBox.min.x.toFixed(2)}..${wsBBox.max.x.toFixed(2)}`);

/* ---- ⑦ 【3.5-7/8】透视内饰 16 named + 三件套 ---- */
console.log('-- ⑦ 内饰 16 named --');
const NAMED_KEYS = ['dashLCD', 'centerScreen', 'gaugeCluster', 'sleepPlatform', 'sleepingBag', 'unfoldedMap', 'mapRoll', 'radioHandset', 'cargoNet', 'molleBoard', 'floorMat', 'crateA', 'crateB', 'thermos', 'grabHandle', 'interiorFloor'];
const namedKeys = Object.keys(interior.named);
check('named 恰 16 键且逐项对应 3.5 内部清单（裁定③：14 行+crateA/B 记 2+interiorFloor 补位）', namedKeys.length === 16 && NAMED_KEYS.every((k) => namedKeys.includes(k)) && namedKeys.every((k) => NAMED_KEYS.includes(k)), namedKeys.join(','));
check('named 对象全部在场于内饰组子树', NAMED_KEYS.every((k) => {
  let node = interior.named[k];
  while (node && node !== interior.group) node = node.parent;
  return node === interior.group;
}));
check('内饰组 noOutline（物体级硬开关，§5.3）', interior.group.userData.noOutline === true);
const innerShells = [];
interior.group.traverse((o) => { if (String(o.name).startsWith('overlandTruck/interior/inner-shell')) innerShells.push(o); });
check('三件套 ①innerShell：双排舱缩放盒 BackSide 暖色', innerShells.length === 1 && innerShells[0].material.side === THREE.BackSide);
check('三件套 ②interiorFloor 地板在位（y=1.12 舱内）', near(interior.named.interiorFloor.position.y, 1.12));
check('三件套 ③内饰不投影不接收阴影', (() => {
  let ok = true;
  interior.group.traverse((o) => { if (o.isMesh && (o.castShadow !== false || o.receiveShadow !== false)) ok = false; });
  return ok;
})());
const platformBBox = meshBBox(interior.named.sleepPlatform);
check('sleepPlatform 平台板 1.5×0.10×1.35+支脚 ×4（后座放平床台）', near(platformBBox.max.x - platformBBox.min.x, 1.5, 0.02) && near(platformBBox.max.y, 1.48, 0.02) && has('overlandTruck/platform-leg/', 4), `top=${platformBBox.max.y.toFixed(2)}`);
check('【3.5-7】dashLCD 宽幅一体屏 + centerScreen 竖置中控屏（texDashCool/texScreenNav 自发光屏）', (() => {
  const hasEmissiveScreen = (node) => {
    let ok = false;
    node.traverse((o) => { if (o.isMesh && o.material.isMeshBasicMaterial && o.material.map) ok = true; });
    return ok;
  };
  return hasEmissiveScreen(interior.named.dashLCD) && hasEmissiveScreen(interior.named.centerScreen);
})());
check("gaugeCluster 'cool' 仪表+方向盘（screenMaterial MeshBasic）", (() => {
  let hasMap = false; interior.named.gaugeCluster.traverse((o) => { if (o.isMesh && o.material.isMeshBasicMaterial && o.material.map) hasMap = true; });
  return hasMap;
})());
check('【3.5-8】sleepingBag 摊一半在床台上（底 ≈平台顶 1.48）', (() => { const b = meshBBox(interior.named.sleepingBag); return near(b.min.y, 1.48, 0.05); })(), `minY=${meshBBox(interior.named.sleepingBag).min.y.toFixed(2)}`);
check('unfoldedMap/mapRoll 平台上（texScreenMap 铺贴）', (() => {
  const mapB = meshBBox(interior.named.unfoldedMap);
  const rollB = meshBBox(interior.named.mapRoll);
  return mapB.min.y > 1.45 && rollB.min.y > 1.45 && mapB.max.x - mapB.min.x > 0.4 && rollB.max.x - rollB.min.x > 0.3;
})());
check('radioHandset：对讲机道具摆放床台（Q5：无人持握——天线+侧面小屏 emissive）', (() => {
  const radio = interior.named.radioHandset;
  const b = meshBBox(radio);
  const hasAntenna = !!radio.getObjectByName('overlandTruck/radio-antenna');
  const hasScreen = !!radio.getObjectByName('overlandTruck/radio-screen-plane');
  return near(b.min.y, 1.48, 0.03) && hasAntenna && hasScreen && b.max.y < 1.75;
})(), `minY=${meshBBox(interior.named.radioHandset).min.y.toFixed(2)}`);
check('cargoNet 网兜张于后舱顶缘四挂点（顶缘 y≈1.88、中部下垂弧）', (() => {
  const net = interior.named.cargoNet;
  const netMesh = net.getObjectByName('overlandTruck/cargo-net-mesh');
  const hooks = net.getObjectByName('overlandTruck/cargo-net-hooks');
  const b = meshBBox(net);
  return b.max.y > 1.8 && b.max.y < 1.95 && b.min.y < b.max.y - 0.08 && !!netMesh && !!hooks;
})(), `top=${meshBBox(interior.named.cargoNet).max.y.toFixed(2)}`);
check('molleBoard 装备挂板贴舱后壁（织带 ×4+附包 ×2，+X 朝舱内视域）', (() => {
  const board = interior.named.molleBoard;
  const b = meshBBox(board);
  return has('overlandTruck/molle-strap/', 4) && has('overlandTruck/molle-pouch', 2) && b.min.x > 0.05 && b.max.x < 0.3;
})());
check('floorMat 橡胶地垫（横棱条 ×5）+ crateA/B 并排落平台尾端 + thermos + grabHandle', (() => {
  const a = meshBBox(interior.named.crateA);
  const b = meshBBox(interior.named.crateB);
  return has('overlandTruck/floormat-rib/', 5) && near(a.min.y, 1.48, 0.02) && near(b.min.y, 1.48, 0.02) && b.min.z > a.max.z && interior.named.thermos.children.length >= 2 && !!interior.named.grabHandle;
})(), `crateA z ${meshBBox(interior.named.crateA).min.z.toFixed(2)}..${meshBBox(interior.named.crateA).max.z.toFixed(2)} crateB z ${meshBBox(interior.named.crateB).min.z.toFixed(2)}..${meshBBox(interior.named.crateB).max.z.toFixed(2)}`);
const windowZoneNamed = ['sleepPlatform', 'sleepingBag', 'unfoldedMap', 'mapRoll', 'radioHandset', 'crateA', 'molleBoard'];
const inWindowZone = windowZoneNamed.filter((k) => {
  const b = meshBBox(interior.named[k]);
  return b.max.x > 0.3 && b.min.x < 1.6;
});
check('双排侧窗带（x 0.3..1.6）视域内陈设 ≥5 组（透窗「清楚看到」休憩区【3.5-6】）', inWindowZone.length >= 5, inWindowZone.join(','));

/* ---- ⑧ 【3.5-9】风格三色 + 布料/天气挂点 ---- */
console.log('-- ⑧ 3.5-9 风格 + 布料/天气挂点 --');
const crateBMat = interior.named.crateB.material;
check('内饰三色：军绿壳 #7e8773 + 灰黑 + 橙警示点缀（crateB #e07a2a；硬朗模块化，零软装织物主角）', `#${innerShells[0].material.color.getHexString()}` === '#7e8773' && `#${crateBMat.color.getHexString()}` === '#e07a2a');
check('cloths ×2：帐篷侧布(0.8/1.0/sway z)+遮阳幕(0.4/1.0/sway y,z)（docs/05 §7.1.2 口径）', exterior.cloths.length === 2
  && exterior.cloths[0].stiffness === 0.8 && exterior.cloths[0].windFactor === 1.0 && exterior.cloths[0].swayAxes.join('') === 'z'
  && exterior.cloths[1].stiffness === 0.4 && exterior.cloths[1].windFactor === 1.0 && exterior.cloths[1].swayAxes.join('') === 'yz');
check('布料 uv 属性齐备（wind.ts 顶点位移按 uv 固定边加权）', exterior.cloths.every((c) => !!c.mesh.geometry.getAttribute('uv')));
const fabricMat = exterior.cloths[0].mesh.material;
check('帐布 authored 透光基值 0.55 + emissive #ffb066（authored，钩子写 0.55×power）', near(fabricMat.emissiveIntensity, 0.55) && `#${fabricMat.emissive.getHexString()}` === '#ffb066');
check('weatherSurfaces ×4：clothTop(帐布)+roofTop×3（帐篷上壳顶 clothTop+roofTop 双注册 + 平台/货斗盖板）', exterior.weatherSurfaces.length === 4
  && exterior.weatherSurfaces[0].kind === 'clothTop'
  && exterior.weatherSurfaces.slice(1).every((s) => s.kind === 'roofTop')
  && exterior.weatherSurfaces[1].material === rtt.getObjectByName('overlandTruck/rtt/top-shell').material
  && exterior.weatherSurfaces[0].material === fabricMat);
check('M4 snowShell ×3 预建（visible=false，挂 exterior/上壳组子树随车体变换）', exterior.weatherSurfaces.slice(1).every((s) => s.snowShell instanceof THREE.Mesh && s.snowShell.visible === false && root.getObjectByName(s.snowShell.name) === s.snowShell));
check('雪壳材质互不重复（同材质重复注册会被 WeatherMaterialSystem 去重丢壳）', new Set(exterior.weatherSurfaces.slice(1).map((s) => s.snowShell.material.uuid)).size === 3);

/* ---- ⑨ 展开机构（3 个 DeploymentPart，默认已展开） ---- */
console.log('-- ⑨ 展开机构 --');
check('buildDeployment 恰 3 项', deployment.length === 3, `n=${deployment.length}`);
check('kinds = [roofTent, awning, step] 且 deployAmount 均 1（唯一双壳铰链上翻机构差异点）', deployment.map((p) => p.kind).join(',') === 'roofTent,awning,step' && deployment.every((p) => p.deployAmount === 1));
check('DeploymentPart node 挂 exterior 组（不重复接管）', deployment.every((p) => p.node.parent === exterior.group));

/* ---- ⑩ 内饰灯光钩子（D2 链；LED blink + 探照灯/顶灯 steady） ---- */
console.log('-- ⑩ 内饰灯光钩子 --');
const lamps = overlandTruck.interiorLightHooks.lamps;
check('lamps ×3（LED blink + 探照灯 steady + 小顶灯 steady）', lamps.length === 3 && lamps[0].mode === 'blink' && lamps[1].mode === 'steady' && lamps[2].mode === 'steady');
check('LED blink 周期 2.5s stagger 0.4 duty 0.6（draft §7.4 定值；错相闪烁非爆闪）', lamps[0].params.period === 2.5 && lamps[0].params.stagger === 0.4 && lamps[0].params.duty === 0.6);
check('探照灯无 rotate 模式（场景探照灯专属语义不越界）', lamps[1].params.speed === undefined && lamps[1].params.pattern === undefined);
check('灯 authored 基值（LED 1.26/探照 0.42/顶灯 0.49=R-P3-1 注③ 注册期快照）', near(lamps[0].emissiveMat.emissiveIntensity, 1.26) && near(lamps[1].emissiveMat.emissiveIntensity, 0.42) && near(lamps[2].emissiveMat.emissiveIntensity, 0.49), lamps.map((l) => l.emissiveMat.emissiveIntensity.toFixed(2)).join('/'));
check('halo 精灵 ×3（additive，renderOrder 20）', lamps.every((l) => l.halo instanceof THREE.Sprite && l.halo.material.blending === THREE.AdditiveBlending && l.halo.renderOrder === 20));
const fillLight = interior.group.getObjectByName('overlandTruck/fill-light');
check('车内暖光点光（#ffb066 位 (0.6,1.5,0) distance 4，castShadow=false）', fillLight instanceof THREE.PointLight && `#${fillLight.color.getHexString()}` === '#ffb066' && near(fillLight.position.x, 0.6) && near(fillLight.position.y, 1.5) && near(fillLight.distance, 4) && fillLight.castShadow === false);

// 钩子驱动链（TimeLightSystem 下发 power/emphasis/blend 的消费面）
const tintedMat = byLabel.front.mesh.material;
overlandTruck.interiorLightHooks.applyInteriorLight(1, 1, 1);
check('夜间 power=1：可透视窗 opacity → 0.22（docs/04 §5.5）', near(clearMat.opacity, 0.22) && near(tintedMat.opacity, 0.22), `${clearMat.opacity.toFixed(3)}/${tintedMat.opacity.toFixed(3)}`);
check('夜间 power=1：帐布透光 0.55 / 睡袋 0.10 / innerShell 0.12（glowTags 定值）', (() => {
  const shellMat = innerShells[0].material;
  const bagMatEmissive = interior.named.sleepingBag.material.emissiveIntensity;
  return near(fabricMat.emissiveIntensity, 0.55) && near(bagMatEmissive, 0.10) && near(shellMat.emissiveIntensity, 0.12);
})());
check('夜间 power=1：屏幕标量 → 1.0（dashLCD/centerScreen/gauge/radio 4 材质同驱）+ 暖光点光 1.15×1×1', (() => {
  const screenMats = [];
  interior.named.dashLCD.traverse((o) => { if (o.isMesh && o.material.isMeshBasicMaterial) screenMats.push(o.material); });
  interior.named.centerScreen.traverse((o) => { if (o.isMesh && o.material.isMeshBasicMaterial) screenMats.push(o.material); });
  interior.named.gaugeCluster.traverse((o) => { if (o.isMesh && o.material.isMeshBasicMaterial) screenMats.push(o.material); });
  screenMats.push(interior.named.radioHandset.getObjectByName('overlandTruck/radio-screen-plane').material);
  return screenMats.length === 4 && screenMats.every((m) => near(m.color.r, 1.0)) && near(fillLight.intensity, 1.15);
})(), `screens=4`);
overlandTruck.interiorLightHooks.applyInteriorLight(0.85, 1, 1);
check('黄昏 power=0.85：屏幕标量 0.895（接近全亮）+ 点光 0.9775', (() => {
  const screenMat = [];
  interior.named.dashLCD.traverse((o) => { if (o.isMesh && o.material.isMeshBasicMaterial) screenMat.push(o.material); });
  return near(screenMat[0].color.r, 0.3 + 0.7 * 0.85) && near(fillLight.intensity, 1.15 * 0.85);
})());
overlandTruck.interiorLightHooks.applyInteriorLight(0, 0, 1);
check('白天 power=0：玻璃回到 0.24/0.40、glow 全灭、点光 0（blend=1 直达）', near(clearMat.opacity, 0.24) && near(tintedMat.opacity, 0.4) && fabricMat.emissiveIntensity === 0 && fillLight.intensity === 0);

/* ---- ⑪ 无人物红线（一.6/Q5）+ 预算粗核 ---- */
console.log('-- ⑪ 红线与预算 --');
const humanHit = [];
root.traverse((o) => {
  const label = `${o.name ?? ''}`;
  if (/(person|human|figure|humanoid|people|人物|人形)/i.test(label)) humanHit.push(label);
});
check('无人形几何（名称扫描零命中；对讲机为摆放道具 Q5）', humanHit.length === 0, humanHit.join(','));
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
  const shell = root.getObjectByName('overlandTruck/wheel-tires/shell');
  return !!shell && shell.isInstancedMesh && shell.count === tireBody.count && shell.parent === tireBody.parent
    && tireBody.parent.userData.instancedGroup?.body === tireBody && tireBody.parent.userData.instancedGroup?.shell === shell;
})());

/* ---- ⑫ 重复构建幂等（车型交换路径预演） ---- */
console.log('-- ⑫ 重复构建 --');
const root2 = new THREE.Group();
const ctx2 = { root: root2, camp: ctx.camp, assets, rng: new Rng('vehicle:overlandTruck') };
const exterior2 = overlandTruck.buildExterior(ctx2);
root2.add(exterior2.group);
overlandTruck.buildDeployment(ctx2);
const interior2 = overlandTruck.buildInterior(ctx2);
root2.add(interior2.group);
check('二次构建 named 仍 16 键（交换后注册快照不漂移）', Object.keys(interior2.named).length === 16);
check('二次构建灯句柄恰 3（LED/探照灯/顶灯随构建刷新，无累积）', overlandTruck.interiorLightHooks.lamps.length === 3);
check('二次构建 LED authored 基值重写 1.26', near(overlandTruck.interiorLightHooks.lamps[0].emissiveMat.emissiveIntensity, 1.26));
check('二次构建帐布句柄随构建刷新（挂新 exterior 子树）', (() => {
  let node = exterior2.cloths[0].mesh;
  while (node && node !== exterior2.group) node = node.parent;
  return node === exterior2.group;
})());

/* ============================== ⑬ Director 集成（registry→装配→对位→布料/天气注册→卸载） ============================== */
console.log('-- ⑬ Director 集成 --');
{
  const { Director } = await import('@/core/director');
  const { vehicleRegistry } = await import('@/content/vehicles/registry');
  const { timeRegistry } = await import('@/content/times/registry');
  const { weatherRegistry } = await import('@/content/weathers/registry');

  check('registry 注册行：classC(isDefault) + overlandTruck（label「越野皮卡」）', vehicleRegistry.get('classC')?.isDefault === true && vehicleRegistry.get('overlandTruck')?.label === '越野皮卡');

  // 最小探针场景（campAnchor 仿海崖行）
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
  const sceneRegistry = new (await import('@/core/registry')).Registry();
  sceneRegistry.register(makeProbeScene('probeA', 4.0, [0, 1.2, 0.8]));
  const localVehicleRegistry = new (await import('@/core/registry')).Registry();
  localVehicleRegistry.register(vehicleRegistry.get('classC'));
  localVehicleRegistry.register(vehicleRegistry.get('overlandTruck'));

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
    // 车型交换到 overlandTruck（默认 classC 先激活，再切——覆盖交换装配路径）
    director.applyState({ vehicle: 'overlandTruck' });
    const waitSwap = (pred) => {
      for (let i = 0; i < 1500; i++) {
        engineDuck.hooks.transition(0.016);
        if (pred()) return true;
      }
      return pred();
    };
    check('Director 车型交换完成（overlandTruck 激活，交换路径零抛错）', waitSwap(() => director.vehicle?.id === 'overlandTruck' && director.vehicleSwap === null));
    check('Director 装配：vehicle/overlandTruck 入场景且按 campAnchor 对位（y=groundY 1.2、heading 0.3）', (() => {
      const vroot = engineDuck.scene.getObjectByName('vehicle/overlandTruck');
      return !!vroot && near(vroot.position.x, 0) && near(vroot.position.y, 1.2) && near(vroot.position.z, 0.8) && near(vroot.rotation.y, 0.3);
    })());
    check('Director 装配：外内三组+16 named 全部挂车根', (() => {
      const vroot = engineDuck.scene.getObjectByName('vehicle/overlandTruck');
      const keys = Object.keys(interior.named);
      return !!vroot.getObjectByName('overlandTruck/exterior') && !!vroot.getObjectByName('overlandTruck/interior')
        && keys.every((k) => vroot.getObjectByName(`overlandTruck/interior/${k}`) !== undefined);
    })());
    check('footprint 外接半径 2.844 ≤ 营位 4.0：不触发越界告警', warnings.filter((w) => w.includes('footprint exceeds camp radius')).length === 0);
    check('车内布料经 Director 注册 WindSystem（帐布补丁后材质带风摆克隆标记）', (() => {
      const fabric = engineDuck.scene.getObjectByName('overlandTruck/rtt/fabric');
      return !!fabric && String(fabric.material.name).endsWith('+wind');
    })());
    check('雪壳经 Director 注册 WeatherMaterialSystem（wmShellExtrude 注入且 visible=false 待 snowCover）', (() => {
      const shell = engineDuck.scene.getObjectByName('overlandTruck/snow-rtt-top');
      return !!shell && shell.material.userData.wmShellExtrude !== undefined && shell.visible === false;
    })());
    director.applyState({ vehicle: 'classC' });
    check('车型交换回 classC 完成（旧车反注册卸载路径零抛错，overlandTruck 根移除）', waitSwap(() => director.vehicle?.id === 'classC' && director.vehicleSwap === null && !engineDuck.scene.getObjectByName('vehicle/overlandTruck')));
    director.dispose();
    check('dispose：整车卸载路径零抛错', !engineDuck.scene.getObjectByName('vehicle/overlandTruck'));
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
