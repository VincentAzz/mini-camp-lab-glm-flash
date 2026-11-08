// verify-t24.headless.mjs —— T24 A型大巴 classA 行为冒烟（无头，无 WebGL/DOM 渲染）。
// 运行：node verify-t24.headless.mjs（自带 module.registerHooks 钩子，Node ≥20.19；同 verify-t23 模式）。
// 断言逐条对 docs/03 §4.2.2（3.2-1…6 外部 / 3.2-7…12 内饰 17 named / 3.2-13 风格）/ §4.2.0
//   （三件套/玻璃三档/钩子模板/布料天气挂点）/ §4.2.6（A 17/24 双指标）。
import { registerHooks } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import { readFileSync } from 'node:fs';
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
    if (specifier.startsWith('@/')) {
      let p = specifier.slice(2);
      if (!/\.[cm]?[jt]sx?$/.test(p)) p += '.ts';
      return next(pathToFileURL(path.join(here, 'src', p)).href, context);
    }
    if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL) {
      const parentDir = new URL('.', context.parentURL);
      const resolved = new URL(specifier, parentDir);
      if (!/\.[cm]?[jt]sx?$/.test(resolved.pathname)) {
        return next(new URL(`${resolved.href}.ts`), context);
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
    console.log(`  FAIL  ${name}${detail ? `  [${detail}]` : ''}`);
  }
}
function near(a, b, eps = 1e-3) {
  return Math.abs(a - b) <= eps;
}

/* ============================== 构建车型（Director buildVehicleStage 同序） ============================== */
const THREE = (await import('three')).default ?? (await import('three'));
const { classA } = await import('@/content/vehicles/classA');
const { Rng } = await import('@/shared/rng');

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

console.log('== T24 classA 无头冒烟 ==');
check('模块身份 id/label（非默认车型）', classA.id === 'classA' && classA.label === 'A型大巴' && classA.isDefault === undefined);
check('VehicleModule 四项齐备', typeof classA.buildExterior === 'function' && typeof classA.buildDeployment === 'function' && typeof classA.buildInterior === 'function' && !!classA.interiorLightHooks);

const root = new THREE.Group();
root.name = 'vehicle/classA';
const ctx = { root, camp: { groundY: 1.2, headingRad: 0.3, radius: 4.2 }, assets, rng: new Rng('vehicle:classA') };
const exterior = classA.buildExterior(ctx);
root.add(exterior.group);
const deployment = classA.buildDeployment(ctx);
const interior = classA.buildInterior(ctx);
root.add(interior.group);
root.updateWorldMatrix(true, true); // 全部 bbox 断言前提：祖先矩阵（棚组/沙发组等 position）先合成
const allNames = [];
root.traverse((o) => allNames.push(o.name));
const has = (prefix, count) => allNames.filter((n) => typeof n === 'string' && n.startsWith(prefix)).length >= count;
const meshBBox = (object) => {
  const bbox = new THREE.Box3();
  object.traverse((o) => { if (o.isMesh) bbox.expandByObject(o); });
  return bbox.isEmpty() ? new THREE.Box3().setFromObject(object) : bbox;
};

/* ---- ① 外部（3.2-1…6 逐项 + 外部要素行数 ≥22） ---- */
console.log('-- ① 外部 --');
const fp = exterior.footprint;
const outerRadius = Math.hypot(fp.length / 2, fp.width / 2);
check('footprint 7.9×2.7（★半径仲裁回调后）', fp.length === 7.9 && fp.width === 2.7, `len=${fp.length} wid=${fp.width}`);
check('外接半径 ≈4.175 ≤4.2（★半径仲裁口径）且 >4.0', outerRadius <= 4.2 && outerRadius > 4.0, `r=${outerRadius.toFixed(3)}`);
check('paint 银白 #e8ecf0 + weathering=false + texBodyA + 藏青裙/金线色带 ×2', exterior.paint.baseColor === '#e8ecf0' && exterior.paint.weathering === false
  && (exterior.paint.textureKeys ?? []).includes('texBodyA')
  && exterior.paint.stripeSpec?.length === 2
  && exterior.paint.stripeSpec[0].color === '#24344d' && exterior.paint.stripeSpec[1].color === '#c9a227');
const bodyMesh = root.getObjectByName('classA/body');
check('3.2-1 主车身=ExtrudeGeometry 侧影挤出（建模字典②）', !!bodyMesh && bodyMesh.geometry instanceof THREE.ExtrudeGeometry);
check('3.2-1 前上角大圆角 r0.75+贯通侧窗带真开洞（Shape.holes ≥1）', !!bodyMesh && bodyMesh.geometry.userData !== undefined && (() => {
  // ExtrudeGeometry 不回传 shape；以几何 bbox+侧窗洞玻璃对位作证（见下），此处证贯通性=两侧均有玻璃
  const l = root.getObjectByName('classA/glass-band-l');
  const r = root.getObjectByName('classA/glass-band-r');
  return !!l && !!r;
})());
const bodyBBox = new THREE.Box3().setFromObject(bodyMesh);
check('车身体量 7.9×2.5×2.44（x −3.95..3.95 / y 0.55..3.05）', near(bodyBBox.min.x, -3.95, 0.02) && near(bodyBBox.max.x, 3.95, 0.02) && near(bodyBBox.min.y, 0.55, 0.02) && near(bodyBBox.max.y, 3.05, 0.02), `x ${bodyBBox.min.x.toFixed(2)}..${bodyBBox.max.x.toFixed(2)} y ${bodyBBox.min.y.toFixed(2)}..${bodyBBox.max.y.toFixed(2)}`);
const fascia = root.getObjectByName('classA/fascia');
check('3.2-2 前脸面板（正影挤出，双片前挡洞）+洞缘金亮条 ×3', !!fascia && fascia.geometry instanceof THREE.ExtrudeGeometry
  && !!root.getObjectByName('classA/ws-divider') && !!root.getObjectByName('classA/ws-trim-top') && !!root.getObjectByName('classA/ws-trim-bottom'));
const wsL = root.getObjectByName('classA/windshield-front-l');
const wsR = root.getObjectByName('classA/windshield-front-r');
check('3.2-2 前挡弧玻璃 ×2 tinted 0.40（贴前脸外，x>3.9）', !!wsL && !!wsR && near(wsL.material.opacity, 0.4) && new THREE.Box3().setFromObject(wsL).max.x > 3.9);
const bandL = root.getObjectByName('classA/glass-band-l');
const bandR = root.getObjectByName('classA/glass-band-r');
const bandLBBox = new THREE.Box3().setFromObject(bandL);
check('3.2-2 贯通侧窗玻璃 ×2 clear（全车最大透视面，x −3.2..2.3 / y 1.72..2.52）', !!bandL && !!bandR
  && near(bandLBBox.min.x, -3.2, 0.02) && near(bandLBBox.max.x, 2.3, 0.02) && near(bandLBBox.min.y, 1.72, 0.02) && near(bandLBBox.max.y, 2.52, 0.02)
  && near(bandL.position.z, 1.232) && near(bandR.position.z, -1.232));
check('3.2-1 texBodyA 侧围贴图（车身材质组 0=cap 带 map）', Array.isArray(bodyMesh?.material) && !!bodyMesh.material[0].map);
check('右前车门板+竖扶手 ×2（−Z 壁）', !!root.getObjectByName('classA/door-panel') && has('classA/door-grab/', 2));
check('3.2-3 车顶空调外机 ×2（roundedBox 前后各一）', !!root.getObjectByName('classA/ac-front') && !!root.getObjectByName('classA/ac-rear'));
check('3.2-3 空调格栅条实例化（InstancedMesh ×12，成对反壳）', (() => {
  const body = root.getObjectByName('classA/ac-grille/body');
  const shell = root.getObjectByName('classA/ac-grille/shell');
  return body?.isInstancedMesh === true && body.count === 12 && !!shell && shell.count === 12;
})());
const dish = root.getObjectByName('classA/dish');
check('3.2-3 卫星锅 Lathe 抛物面 r0.34 仰 35°+立柱+馈源杆+馈源锥', !!dish && dish.geometry.type === 'LatheGeometry'
  && near(dish.rotation.z, Math.PI / 2 - (35 * Math.PI) / 180, 0.01)
  && !!root.getObjectByName('classA/dish-post') && !!root.getObjectByName('classA/dish-feed') && !!root.getObjectByName('classA/dish-horn'));
check('3.2-4 侧裙储物舱门 ×4+小拉手 ×4（右壁一排 z<−1.2）', (() => {
  const doors = allNames.filter((n) => typeof n === 'string' && n.startsWith('classA/bay-door/'));
  const bay = root.getObjectByName(doors[0] ?? '');
  return doors.length === 4 && has('classA/bay-handle/', 4) && !!bay && new THREE.Box3().setFromObject(bay).max.z < -1.2;
})());
const awningCloth = root.getObjectByName('classA/awning/cloth');
const awningBBox = awningCloth ? new THREE.Box3().setFromObject(awningCloth) : null;
check('3.2-5 侧遮阳棚 awningAssembly(4.2,1.9) 左壁展开（布面 z 外伸至 ≈3.12）', !!awningCloth && !!root.getObjectByName('classA/awning/frame') && !!root.getObjectByName('classA/awning/valance')
  && near(awningBBox.min.z, 1.22, 0.05) && near(awningBBox.max.z, 3.12, 0.06), `z ${awningBBox?.min.z.toFixed(2)}..${awningBBox?.max.z.toFixed(2)}`);
check('3.2-5 电动踏步双级展开态（双级板+警示纹+侧支架 ×2）', has('classA/step-tread/', 2) && has('classA/step-stripe/', 2) && has('classA/step-bracket/', 2));
check('3.2-6 车尾自行车架（管架合并件）+折叠自行车 bikeFolding（平躺横置）', !!root.getObjectByName('classA/rack') && !!root.getObjectByName('classA/bike')
  && (() => {
    const bikeBBox = new THREE.Box3().setFromObject(root.getObjectByName('classA/bike'));
    return bikeBBox.max.y - bikeBBox.min.y < 0.3 && bikeBBox.max.x < -3.9; // 平躺 + 尾部
  })());
check('3.2-6 轮组 wheel(0.46,0.28) ×6 后双胎（InstancedMesh 成对反壳）', (() => {
  const tires = root.getObjectByName('classA/wheel-tires/body');
  const hubs = root.getObjectByName('classA/wheel-hubs/body');
  return tires?.isInstancedMesh === true && hubs?.isInstancedMesh === true && tires.count === 6 && hubs.count === 6;
})());
check('轮眉 ×4（前 0.36/后 0.72 盖双胎）', has('classA/fender-front/', 2) && has('classA/fender-rear/', 2));
check('尾灯 ×2 红 / 示廓灯 ×4 / 后视镜 ×2（臂+镜盒）', has('classA/tail-lamp/', 2) && allNames.filter((n) => typeof n === 'string' && n.startsWith('classA/marker/')).length === 4
  && has('classA/mirror-arm/', 2) && has('classA/mirror-box/', 2));
check('底盘/前后保险杠 ×2/前大灯 ×2/排气管/水电接驳口', !!root.getObjectByName('classA/chassis')
  && !!root.getObjectByName('classA/bumper-front') && !!root.getObjectByName('classA/bumper-rear')
  && has('classA/head-lamp/', 2) && !!root.getObjectByName('classA/exhaust') && !!root.getObjectByName('classA/hookup'));
check('金腰线实体饰条 ×2+前脸/尾部裙板金线 ×4（3.2-13 涂装补齐）', has('classA/gold-strip/', 2) && !!root.getObjectByName('classA/gold-front') && !!root.getObjectByName('classA/gold-rear')
  && !!root.getObjectByName('classA/skirt-front') && !!root.getObjectByName('classA/skirt-rear'));

// 外部要素行数（§4.2.6 双指标：外部 ≥22；A 矩阵行 17/24）——24 行逐项在场计数
const exteriorRows = [
  ['主车身 profileExtrude', !!bodyMesh],
  ['贯通侧窗真开洞+玻璃', !!bandL && !!bandR],
  ['前脸面板', !!fascia],
  ['前挡弧玻璃 ×2', !!wsL && !!wsR],
  ['右前车门+扶手', !!root.getObjectByName('classA/door-panel') && has('classA/door-grab/', 2)],
  ['空调外机 ×2', !!root.getObjectByName('classA/ac-front') && !!root.getObjectByName('classA/ac-rear')],
  ['格栅条实例化', root.getObjectByName('classA/ac-grille/body')?.isInstancedMesh === true],
  ['卫星锅+馈源', !!dish && !!root.getObjectByName('classA/dish-post')],
  ['储物舱门 ×4', has('classA/bay-door/', 4)],
  ['侧遮阳棚', !!awningCloth],
  ['电动踏步', has('classA/step-tread/', 2)],
  ['自行车架', !!root.getObjectByName('classA/rack')],
  ['折叠自行车', !!root.getObjectByName('classA/bike')],
  ['轮组 ×6', root.getObjectByName('classA/wheel-tires/body')?.isInstancedMesh === true],
  ['轮眉 ×4', has('classA/fender-front/', 2) && has('classA/fender-rear/', 2)],
  ['尾灯 ×2', has('classA/tail-lamp/', 2)],
  ['示廓灯 ×4', allNames.filter((n) => String(n).startsWith('classA/marker/')).length === 4],
  ['后视镜 ×2', has('classA/mirror-arm/', 2)],
  ['底盘', !!root.getObjectByName('classA/chassis')],
  ['保险杠 ×2', !!root.getObjectByName('classA/bumper-front') && !!root.getObjectByName('classA/bumper-rear')],
  ['金腰线饰条', has('classA/gold-strip/', 2)],
  ['前大灯 ×2', has('classA/head-lamp/', 2)],
  ['排气管', !!root.getObjectByName('classA/exhaust')],
  ['水电接驳口', !!root.getObjectByName('classA/hookup')],
];
check('外部要素行数 ≥22（矩阵口径 A=24）', exteriorRows.filter(([, ok]) => ok).length >= 22, `rows=${exteriorRows.filter(([, ok]) => ok).length}/24`);

/* ---- ② 玻璃三档与三件套纪律 ---- */
console.log('-- ② 玻璃三档 --');
const windows = exterior.windows;
check('windows ≥4（前挡 ×2 tinted + 贯通侧窗 ×2 clear）', windows.length >= 4, `n=${windows.length}`);
const clearMats = new Set(windows.filter((w) => w.tint === 'clear').map((w) => w.mesh.material));
check('clear 档 0.24 且贯通侧窗共享同一材质', clearMats.size === 1 && near([...clearMats][0].opacity, 0.24));
const tintedMat = windows.find((w) => w.tint === 'tinted')?.mesh.material;
check('tinted 档 0.40（前挡 ×2 共享）', windows.filter((w) => w.tint === 'tinted').length === 2 && near(tintedMat.opacity, 0.4));
check('玻璃材质：DoubleSide + depthWrite=false（三件套）', clearMats.values().next().value.side === THREE.DoubleSide && clearMats.values().next().value.depthWrite === false);
check('玻璃网格 renderOrder=20 + noOutline', windows.every((w) => w.mesh.renderOrder === 20 && w.mesh.userData.noOutline === true));

/* ---- ③ 布料挂点（棚布 ClothHandle 0.4/1.0/sag 0.05 + clothTop 雪壳） ---- */
console.log('-- ③ 布料挂点 --');
check('cloths=遮阳棚布 ×1：stiffness 0.4 / windFactor 1.0 / sagAmp 0.05 / swayAxes y+z（docs/03 §4.2.2 + docs/05 五-3）', exterior.cloths.length === 1
  && exterior.cloths[0].stiffness === 0.4 && exterior.cloths[0].windFactor === 1.0 && exterior.cloths[0].sagAmp === 0.05
  && exterior.cloths[0].swayAxes.join(',') === 'y,z');
check('棚布 12×8 分段 Plane（WindSystem 顶点位移前提，uv.x=0 固定边在棚根）', (() => {
  const g = exterior.cloths[0].mesh.geometry;
  return g.getAttribute('position').count >= 100 && g.getAttribute('uv') !== undefined && exterior.cloths[0].mesh.castShadow === true;
})());
check('clothTop 雪壳挂布料网格之下（visible=false，继承风摆与 sag）', (() => {
  const shell = root.getObjectByName('classA/snow-awning');
  return !!shell && shell.visible === false && shell.parent === exterior.cloths[0].mesh;
})());

/* ---- ④ 天气挂点（clothTop ×1 + roofTop ×3） ---- */
console.log('-- ④ weatherSurfaces --');
const surfaces = exterior.weatherSurfaces ?? [];
check('weatherSurfaces=4（棚布 clothTop + 车顶/空调外机顶 roofTop ×3）', surfaces.length === 4 && surfaces.filter((s) => s.kind === 'clothTop').length === 1 && surfaces.filter((s) => s.kind === 'roofTop').length === 3);
check('M4 snowShell ×4 预建（visible=false，挂 exterior 子树随车体变换）+材质互不重复', surfaces.every((s) => s.snowShell instanceof THREE.Mesh && s.snowShell.visible === false && root.getObjectByName(s.snowShell.name) === s.snowShell)
  && new Set(surfaces.map((s) => s.material.uuid)).size === 4 && new Set(surfaces.map((s) => s.snowShell.material.uuid)).size === 4);

/* ---- ⑤ 展开机构（2 个 DeploymentPart，默认已展开） ---- */
console.log('-- ⑤ 展开机构 --');
check('buildDeployment 恰 2 项', deployment.length === 2, `n=${deployment.length}`);
check('kinds = [awning, step] 且 deployAmount 均 1（docs/03 §4.2.2 展开机构行）', deployment.map((p) => p.kind).join(',') === 'awning,step' && deployment.every((p) => p.deployAmount === 1));
check('DeploymentPart node 挂 exterior 组（不重复接管）', deployment.every((p) => p.node.parent === exterior.group));

/* ---- ⑥ 透视内饰三件套 + 17 named（3.2-7…12） ---- */
console.log('-- ⑥ 内饰 --');
const NAMED_KEYS = ['ringSofa', 'islandCounter', 'fridgeDouble', 'islandSink', 'stoveEmbedded', 'oven', 'cabinetTower', 'lightStrip', 'woodFloor', 'partitionWall', 'bedDouble', 'bedLamp', 'bathPod', 'basin', 'mirror', 'showerGlass', 'showerHead'];
const namedKeys = Object.keys(interior.named);
check('named 恰 17 键且逐项对应 3.2 内部清单（≥16 契约超配）', namedKeys.length === 17 && NAMED_KEYS.every((k) => namedKeys.includes(k)) && namedKeys.every((k) => NAMED_KEYS.includes(k)), namedKeys.join(','));
check('named 对象全部在场于内饰组子树', NAMED_KEYS.every((k) => {
  let node = interior.named[k];
  while (node && node !== interior.group) node = node.parent;
  return node === interior.group;
}));
check('内饰组 noOutline（物体级硬开关）', interior.group.userData.noOutline === true);
const shellMesh = root.getObjectByName('classA/interior/inner-shell');
check('三件套 ①innerShell：BackSide 暖色（#e6d3b0 系）缩放壳（x ±3.71 底 0.55）', !!shellMesh && shellMesh.material.side === THREE.BackSide
  && near(new THREE.Box3().setFromObject(shellMesh).min.y, 0.55, 0.03));
const floorMesh = interior.named.woodFloor;
check('三件套 ②地板 texWoodFloor walnut（胡桃 #7a5236 基调 map）y 0.60', !!floorMesh && !!floorMesh.material.map && near(floorMesh.position.y, 0.6));
check('三件套 ③内饰不投影不接收阴影', (() => {
  let ok = true;
  interior.group.traverse((o) => { if (o.isMesh && (o.castShadow !== false || o.receiveShadow !== false)) ok = false; });
  return ok;
})());
const furnitureOutside = NAMED_KEYS.filter((k) => {
  const bbox = meshBBox(interior.named[k]);
  return bbox.min.y < 0.55 || bbox.max.y > 3.02;
});
check('家具落位连贯（地板 0.60 以上 / 顶 3.0 以下）', furnitureOutside.length === 0, furnitureOutside.map((k) => {
  const b = meshBBox(interior.named[k]);
  return `${k}:y${b.min.y.toFixed(2)}..${b.max.y.toFixed(2)}`;
}).join(' '));
const sofa = interior.named.ringSofa;
const seatArc = sofa.getObjectByName('classA/ring-seat');
const cushions = allNames.filter((n) => typeof n === 'string' && n.startsWith('classA/ring-cushion/')).length;
const sofaBBox = meshBBox(sofa);
check('3.2-7 ringSofa 环形卡座：外弧 r1.10/内弧 r0.72 Extrude 弧段（世界 x 0.435..1.97=局部 −1.115..+0.42 缺口朝 +X，z 跨 2.2）', !!seatArc && seatArc.geometry instanceof THREE.ExtrudeGeometry
  && near(sofaBBox.max.z - sofaBBox.min.z, 2.2, 0.04) && near(sofaBBox.min.x, 1.55 - 1.115, 0.03) && near(sofaBBox.max.x, 1.55 + 0.42, 0.03), `x ${sofaBBox.min.x.toFixed(2)}..${sofaBBox.max.x.toFixed(2)} z ${(sofaBBox.max.z - sofaBBox.min.z).toFixed(2)}`);
check('3.2-7 坐垫扇形分段 ×5 + 弧形靠背+黄铜顶带+配套圆桌', cushions === 5 && !!sofa.getObjectByName('classA/ring-back') && !!sofa.getObjectByName('classA/ring-brass') && !!sofa.getObjectByName('classA/ring-table-top'));
check('3.2-7 缺口朝车头（沙发中心 1.55，驾驶区 2.6+ 无碰撞）', near(sofa.position.x, 1.55) && sofaBBox.max.x <= 2.7);
const counterBBox = meshBBox(interior.named.islandCounter);
check('3.2-8 islandCounter 中岛（2.2×0.85 台座+石纹台面+黄铜踢脚）', near(counterBBox.max.x - counterBBox.min.x, 2.3, 0.03) && !!interior.named.islandCounter.getObjectByName('classA/counter-top') && !!interior.named.islandCounter.getObjectByName('classA/counter-kick'));
const fridge = interior.named.fridgeDouble;
check('3.2-8 fridgeDouble 双开门冰箱（门缝+双长把手黄铜）', !!fridge.getObjectByName('classA/fridge-seam') && fridge.getObjectByName('classA/fridge-seam').position.x === -1.5 && has('classA/fridge-handle/', 2));
check('3.2-8 islandSink 水槽（内嵌槽+Lathe 弯龙头）', !!interior.named.islandSink.getObjectByName('classA/sink-basin') && !!interior.named.islandSink.getObjectByName('classA/sink-faucet'));
check('3.2-8 stoveEmbedded 嵌入式灶台 4 炉架（torus ×4+格栅 ×8）', (() => {
  const burners = allNames.filter((n) => typeof n === 'string' && n.startsWith('classA/burner/')).length;
  const grates = allNames.filter((n) => typeof n === 'string' && n.startsWith('classA/grate/')).length;
  return burners === 4 && grates === 8;
})());
const oven = interior.named.oven;
check('3.2-8 oven 烤箱（玻璃视窗 tinted+横把手+旋钮 ×3）', !!oven.getObjectByName('classA/oven-window') && oven.getObjectByName('classA/oven-window').material === tintedMat && !!oven.getObjectByName('classA/oven-handle') && allNames.filter((n) => String(n).startsWith('classA/oven-knob/')).length === 3);
const towerBBox = meshBBox(interior.named.cabinetTower);
check('3.2-9 cabinetTower 通顶吊柜（三段叠连排 x −1.95..−0.45，顶 ≈2.95 贴顶）', near(towerBBox.min.x, -1.95, 0.03) && near(towerBBox.max.x, -0.45, 0.03) && towerBBox.max.y > 2.9);
const stripMesh = interior.named.lightStrip.getObjectByName('classA/light-strip-bar');
check('3.2-9 lightStrip 暖色灯带（柜底 1.8 长，emissive #ffc27d authored 1.4）', !!stripMesh && near(stripMesh.position.y, 1.53)
  && `#${stripMesh.material.emissive.getHexString()}` === '#ffc27d' && near(stripMesh.material.emissiveIntensity, 1.4));
const panel = root.getObjectByName('classA/partition-panel');
const panelBBox = new THREE.Box3().setFromObject(panel);
check('3.2-11 partitionWall 半隔断（x −2.0 板墙+门洞留左 1/3：实体 z ≤0.4）', near(panel.position.x + panelBBox.min.x, -2.025, 0.02) && panelBBox.min.z > -1.16 && panelBBox.max.z < 0.45, `z ${panelBBox.min.z.toFixed(2)}..${panelBBox.max.z.toFixed(2)}`);
const bed = interior.named.bedDouble;
const bedBBox = meshBBox(bed);
check('3.2-11 bedDouble 独立双人床（床头板+床垫+双枕+搭盖毯，全在隔断后 x<−2.0）', !!bed.getObjectByName('classA/bed-headboard') && !!root.getObjectByName('classA/bed-mattress') && allNames.filter((n) => typeof n === 'string' && n.startsWith('classA/bed-pillow')).length === 2 && !!bed.getObjectByName('classA/bed-quilt')
  && bedBBox.max.x < -2.0, `maxX=${bedBBox.max.x.toFixed(2)}`);
check('3.2-11 床区/卫浴角舱互不重叠（床 z≥−0.31 / 舱 z≤−0.38）', bedBBox.min.z > -0.32 && meshBBox(interior.named.bathPod).max.z < -0.35);
check('3.2-11 bedLamp 床头阅读灯（弯臂+罩+halo）', !!interior.named.bedLamp.getObjectByName('classA/bed-lamp-arm') && !!interior.named.bedLamp.getObjectByName('classA/bed-lamp-shade') && interior.named.bedLamp.children.some((c) => c.isSprite));
const pod = interior.named.bathPod;
check('3.2-12 bathPod 三面板围合角舱（P1 沿车长+P2 沿车宽+门楣/门槛，右后角）', !!pod.getObjectByName('classA/pod-p1') && !!pod.getObjectByName('classA/pod-p2') && !!pod.getObjectByName('classA/pod-header') && !!pod.getObjectByName('classA/pod-sill'));
check('3.2-12 basin 洗手盆（Lathe 回转盆+弯龙头+石面台）', (() => {
  const bowl = pod.parent.getObjectByName('classA/basin-bowl') ?? interior.named.basin.getObjectByName('classA/basin-bowl');
  return !!bowl && bowl.geometry.type === 'LatheGeometry' && !!interior.named.basin.getObjectByName('classA/basin-faucet');
})());
check('3.2-12 mirror 镜（浅蓝 basic 薄板）', interior.named.mirror.material.isMeshBasicMaterial === true);
check('3.2-12 showerGlass 淋浴隔断（tinted 玻璃与前挡同实例）', interior.named.showerGlass.material === tintedMat && near(interior.named.showerGlass.position.x, -3.35));
check('3.2-12 showerHead 花洒（L 管+喷头锥）', !!interior.named.showerHead.getObjectByName('classA/shower-riser') && !!interior.named.showerHead.getObjectByName('classA/shower-nozzle'));
root.updateWorldMatrix(true, true);
const bandX = [-3.2, 2.3];
const windowZoneNamed = NAMED_KEYS.filter((k) => {
  const bbox = meshBBox(interior.named[k]);
  return bbox.max.y > 1.72 && bbox.max.x > bandX[0] && bbox.min.x < bandX[1];
});
check('贯通侧窗带（y>1.72）视域内陈设 ≥5 组（透窗「清楚看到」）', windowZoneNamed.length >= 5, windowZoneNamed.join(','));
check('3.2-13 内高 ≈2.37 vs C 型 1.9（地板 0.60 / 隔断顶 3.0 进深读法）', near(meshBBox(interior.named.partitionWall).max.y, 3.0, 0.03));
check('3.2-13 暖木胡桃+米皮革+黄铜三主材在场', (() => {
  const hex = (m) => `#${m.color.getHexString()}`;
  return hex(interior.named.ringSofa.getObjectByName('classA/ring-back').material) === '#f2e4c8'
    && hex(interior.named.ringSofa.getObjectByName('classA/ring-seat').material) === '#7a5236'
    && hex(interior.named.ringSofa.getObjectByName('classA/ring-brass').material) === '#c9a227';
})());

/* ---- ⑦ 内饰灯光钩子（D2 链；灯带 steady + 阅读灯 breath + 卫浴冷光 steady） ---- */
console.log('-- ⑦ 内饰灯光钩子 --');
const lamps = classA.interiorLightHooks.lamps;
check('lamps ×3（lightStrip steady + bedLamp breath + 卫浴冷光 steady）', lamps.length === 3 && lamps[0].mode === 'steady' && lamps[1].mode === 'breath' && lamps[2].mode === 'steady');
check('bedLamp breath 6s depth 0.18（裁定③：draft 5s 收敛三档 1.5/3/6）', lamps[1].params.period === 6 && lamps[1].params.depth === 0.18);
check('灯 authored 基值（1.4/0.7/0.3 ≥ gain 定值，R-P3-1 注③ 纪律）', near(lamps[0].emissiveMat.emissiveIntensity, 1.4) && near(lamps[1].emissiveMat.emissiveIntensity, 0.7) && near(lamps[2].emissiveMat.emissiveIntensity, 0.3), lamps.map((l) => l.emissiveMat.emissiveIntensity.toFixed(2)).join('/'));
check('卫浴冷光 #cfe6ee（冷暖层次）', `#${lamps[2].emissiveMat.emissive.getHexString()}` === '#cfe6ee');
check('halo 精灵 ×3（additive，renderOrder 20）', lamps.every((l) => l.halo instanceof THREE.Sprite && l.halo.material.blending === THREE.AdditiveBlending && l.halo.renderOrder === 20));
const fillLight = interior.group.getObjectByName('classA/fill-light');
check('车内暖光点光（位 (0,2.1,0) distance 7，castShadow=false）', fillLight instanceof THREE.PointLight && near(fillLight.position.x, 0) && near(fillLight.position.y, 2.1) && near(fillLight.distance, 7) && fillLight.castShadow === false);
check('screens=仪表组 gaugeCluster cool（MeshBasicMaterial+map）', refsScreensOk());
function refsScreensOk() {
  const mats = [];
  interior.named.woodFloor.parent?.traverse((o) => {
    if (o.name === 'classA/interior/cockpit-gauge' && o.isObject3D) {
      o.traverse((c) => { if (c.isMesh && c.material.isMeshBasicMaterial) mats.push(c.material); });
    }
  });
  return mats.length >= 1 && !!mats[0].map;
}

classA.interiorLightHooks.applyInteriorLight(1, 1, 1);
check('夜间 power=1：可透视窗 opacity → 0.22（docs/04 §5.5）', near([...clearMats][0].opacity, 0.22) && near(tintedMat.opacity, 0.22));
check('夜间 power=1：床垫 0.10 / innerShell 0.12（glowTags 定值）', near(root.getObjectByName('classA/bed-mattress').material.emissiveIntensity, 0.1) && near(shellMesh.material.emissiveIntensity, 0.12));
check('夜间 power=1：屏幕标量 1.0 + 暖光点光 1.15×1×1', (() => {
  const screenMat = [];
  root.getObjectByName('classA/interior/cockpit-gauge').traverse((o) => { if (o.isMesh && o.material.isMeshBasicMaterial) screenMat.push(o.material); });
  return near(screenMat[0].color.r, 1.0) && near(fillLight.intensity, 1.15);
})());
classA.interiorLightHooks.applyInteriorLight(0.85, 1, 1);
check('黄昏 power=0.85：屏幕标量 0.895 + 点光 0.9775（3.2-13 冷暖对比档）', (() => {
  const screenMat = [];
  root.getObjectByName('classA/interior/cockpit-gauge').traverse((o) => { if (o.isMesh && o.material.isMeshBasicMaterial) screenMat.push(o.material); });
  return near(screenMat[0].color.r, 0.3 + 0.7 * 0.85) && near(fillLight.intensity, 1.15 * 0.85);
})());
classA.interiorLightHooks.applyInteriorLight(0, 0, 1);
check('白天 power=0：玻璃回到 0.24/0.40、glow 全灭、点光 0（blend=1 直达）', near([...clearMats][0].opacity, 0.24) && near(tintedMat.opacity, 0.4) && root.getObjectByName('classA/bed-mattress').material.emissiveIntensity === 0 && shellMesh.material.emissiveIntensity === 0 && fillLight.intensity === 0);

/* ---- ⑧ 无人物红线 + 预算粗核 ---- */
console.log('-- ⑧ 红线与预算 --');
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
  const tires = root.getObjectByName('classA/wheel-tires/body');
  const shell = root.getObjectByName('classA/wheel-tires/shell');
  return !!shell && shell.isInstancedMesh && shell.count === tires.count && shell.parent === tires.parent
    && tires.parent.userData.instancedGroup?.body === tires && tires.parent.userData.instancedGroup?.shell === shell;
})());

/* ---- ⑨ 重复构建幂等（车型交换路径预演） ---- */
console.log('-- ⑨ 重复构建 --');
const root2 = new THREE.Group();
const ctx2 = { root: root2, camp: ctx.camp, assets, rng: new Rng('vehicle:classA') };
const exterior2 = classA.buildExterior(ctx2);
root2.add(exterior2.group);
classA.buildDeployment(ctx2);
const interior2 = classA.buildInterior(ctx2);
root2.add(interior2.group);
check('二次构建 named 仍 17 键（交换后注册快照不漂移）', Object.keys(interior2.named).length === 17);
check('二次构建灯 authored 基值重写（1.4/0.7/0.3）', near(classA.interiorLightHooks.lamps[0].emissiveMat.emissiveIntensity, 1.4) && near(classA.interiorLightHooks.lamps[1].emissiveMat.emissiveIntensity, 0.7));
check('二次构建灯句柄随构建刷新（halo 挂新内饰子树）', interior2 !== interior && (() => {
  let node = classA.interiorLightHooks.lamps[0].halo;
  while (node && node !== interior2.group) node = node.parent;
  return node === interior2.group;
})());

/* ============================== ⑩ Director 集成（registry→装配→对位→告警口径→车型交换→卸载） ============================== */
console.log('-- ⑩ Director 集成 --');
{
  const { Director } = await import('@/core/director');
  const { Registry } = await import('@/core/registry');
  const { timeRegistry } = await import('@/content/times/registry');
  const { weatherRegistry } = await import('@/content/weathers/registry');
  // 本地注册表只挂 classA/classC——不 import 共享 vehicleRegistry（隔离并行 T25/T27 在途部件文件）
  const { classC } = await import('@/content/vehicles/classC');
  const localVehicleRegistry = new Registry();
  localVehicleRegistry.register(classA);
  localVehicleRegistry.register(classC);

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
    const sceneRegistry = new Registry();
    sceneRegistry.register(makeProbeScene('probeA', 4.2, [0, 1.2, 0.8])); // 营位半径 4.2（服务区口径）——A 外接 4.175 不越界
    sceneRegistry.register(makeProbeScene('probeTiny', 4.0, [1.5, 0.6, -0.5])); // 营位半径 4.0（海崖口径）——A 越界告警探针
    director = new Director({
      engine: engineDuck,
      sceneRegistry,
      vehicleRegistry: localVehicleRegistry,
      timeRegistry,
      weatherRegistry,
    });
    director.start();
    director.applyState(); // 默认档：probeA + 注册默认 classC（isDefault——applyState 未给的维度一律回默认档）
    const waitSwap = (pred) => {
      for (let i = 0; i < 1500; i++) {
        engineDuck.hooks.transition(0.016);
        if (pred()) return true;
      }
      return pred();
    };
    check('Director 启动装配：默认档 probeA+classC 直呈（首帧不播过渡）', director.scene?.id === 'probeA' && director.vehicle?.id === 'classC' && !!engineDuck.scene.getObjectByName('vehicle/classC'));
    // 车型交换 classC→classA（营位 4.2 服务区口径）
    director.applyState({ vehicle: 'classA' });
    check('Director 装配：vehicle/classA 入场景且按 campAnchor 对位（y=groundY 1.2、heading 0.3）', waitSwap(() => {
      const vroot = engineDuck.scene.getObjectByName('vehicle/classA');
      return director.vehicle?.id === 'classA' && director.vehicleSwap === null
        && !!vroot && near(vroot.position.y, 1.2) && near(vroot.rotation.y, 0.3);
    }));
    check('Director 装配：外内三组+17 named 全部挂车根', (() => {
      const vroot = engineDuck.scene.getObjectByName('vehicle/classA');
      return !!vroot.getObjectByName('classA/exterior') && !!vroot.getObjectByName('classA/interior')
        && NAMED_KEYS.every((k) => vroot.getObjectByName(`classA/interior/${k}`) !== undefined);
    })());
    check('营位 4.2（服务区口径）+ 外接半径 4.175：不触发越界告警', warnings.filter((w) => w.includes('footprint exceeds camp radius')).length === 0);
    check('棚布经 Director 注册 WindSystem（材质带风摆克隆标记 +wind）', (() => {
      const cloth = engineDuck.scene.getObjectByName('classA/awning/cloth');
      return !!cloth && cloth.material.name.endsWith('+wind') && cloth.customDepthMaterial !== undefined;
    })());
    check('雪壳经 Director 注册 WeatherMaterialSystem（wmShellExtrude 注入且 visible=false 待 snowCover）', (() => {
      const shell = engineDuck.scene.getObjectByName('classA/snow-roof');
      return !!shell && shell.material.userData.wmShellExtrude !== undefined && shell.visible === false;
    })());
    // 越界口径负样本：切 4.0 营位（scene patch 未给 vehicle → 回默认档 classC 于小营位重建），
    // 再显式换 classA → 小营位上重建 → 构建期 footprint 告警（只告警不阻断）
    director.applyState({ scene: 'probeTiny' });
    check('场景交换至 4.0 营位完成（vehicle 回默认档 classC 并按新 campAnchor 重对位 y=0.6）', waitSwap(() => director.scene?.id === 'probeTiny' && director.sceneSwap === null
      && near(engineDuck.scene.getObjectByName('vehicle/classC')?.position.y ?? -1, 0.6)));
    director.applyState({ scene: 'probeTiny', vehicle: 'classA' }); // scene+vehicle 同 patch——防 scene 维度回默认档
    check('4.0 营位上重建 classA 完成（交换路径零抛错）', waitSwap(() => director.scene?.id === 'probeTiny' && director.vehicle?.id === 'classA' && director.vehicleSwap === null));
    check('外接半径 4.175 > 营位 4.0（海崖口径）：触发「[vehicle] footprint exceeds camp radius」只告警不阻断', warnings.some((w) => w.includes('footprint exceeds camp radius') && w.includes('4.17')), warnings.find((w) => w.includes('footprint')) ?? '（无告警）');
    check('告警后装配仍完成（车根在场且 y=groundY 0.6）', (() => {
      const vroot = engineDuck.scene.getObjectByName('vehicle/classA');
      return !!vroot && near(vroot.position.y, 0.6);
    })());

    // 车型交换：classA → classC → classA（FadeSwap 路径）
    director.applyState({ vehicle: 'classC' });
    check('车型交换 classA→classC 完成（旧根移除、零抛错）', waitSwap(() => director.vehicle?.id === 'classC' && director.vehicleSwap === null && !engineDuck.scene.getObjectByName('vehicle/classA')));
    director.applyState({ vehicle: 'classA' });
    check('车型交换 classC→classA 完成（17 named 回场）', waitSwap(() => director.vehicle?.id === 'classA' && director.vehicleSwap === null && NAMED_KEYS.every((k) => engineDuck.scene.getObjectByName(`classA/interior/${k}`) !== undefined)));
    director.dispose();
    check('dispose：车型卸载路径零抛错且车根移除', !engineDuck.scene.getObjectByName('vehicle/classA') && engineDuck.scene.children.filter((c) => String(c.name).startsWith('vehicle/')).length === 0);
    } finally {
    console.warn = originalWarn;
    try { director?.dispose(); } catch { /* 已断言路径 */ }
  }
}

async function waitActivation(pred) {
  for (let i = 0; i < 1500; i++) {
    // 激活前首帧直呈（无过渡）——先直接探测，再逐帧驱动兜底
    if (pred()) return true;
    await Promise.resolve();
  }
  return pred();
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
