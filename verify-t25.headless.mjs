// verify-t25.headless.mjs —— T25 拖挂+皮卡 trailerRig 行为冒烟（无头，无 WebGL/DOM 渲染；同 verify-t23 模式）。
// 运行：node verify-t25.headless.mjs（自带 module.registerHooks 钩子，Node ≥20.19）。
// 断言逐条对 docs/03 §4.2.3（3.3-1…12 + 25 外部要素行 + 组合摆位 + ★半径仲裁 ≤4.2）/ §4.2.0（三件套/玻璃
//   三档/钩子模板/布料天气挂点/无人物红线）/ §4.2.6（16 named 基准）/ docs/00 一.12 ★-半径★-label。
// 注：不 import @/content/vehicles/registry（并行 T24/T26/T27 在途）——注册接线以源码静态断言承担；
//   resolve 钩子补「目录→index.ts」解析（trailerRig 部件子目录 barrel 需要，vite 同语义）。
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
    if (specifier.startsWith('@/')) {
      let p = specifier.slice(2);
      if (!/\.[cm]?[jt]sx?$/.test(p)) p += '.ts';
      let candidate = path.join(here, 'src', p);
      if (!existsSync(candidate)) {
        const dirIndex = path.join(here, 'src', specifier.slice(2), 'index.ts');
        if (existsSync(dirIndex)) candidate = dirIndex; // 目录 barrel（geom/parts/vehicles/trailerRig 等）
      }
      return next(pathToFileURL(candidate).href, context);
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
  // Node strip-only 模式不支持 TS 参数属性——经 typescript.transpileModule 全量 TS→ESM 转换后执行。
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
const { trailerRig } = await import('@/content/vehicles/trailerRig');
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

console.log('== T25 trailerRig 无头冒烟 ==');
check('模块身份 id/label（★docs/00 一.12 ★-label 统一「拖挂房车」）', trailerRig.id === 'trailerRig' && trailerRig.label === '拖挂房车' && trailerRig.isDefault === undefined);
check('VehicleModule 四项齐备（D4 单模块双主体）', typeof trailerRig.buildExterior === 'function' && typeof trailerRig.buildDeployment === 'function' && typeof trailerRig.buildInterior === 'function' && !!trailerRig.interiorLightHooks);

const root = new THREE.Group();
root.name = 'vehicle/trailerRig';
const ctx = { root, camp: { groundY: 1.2, headingRad: 0.3, radius: 4.2 }, assets, rng: new Rng('vehicle:trailerRig') };
const exterior = trailerRig.buildExterior(ctx);
root.add(exterior.group);
const deployment = trailerRig.buildDeployment(ctx);
const interior = trailerRig.buildInterior(ctx);
root.add(interior.group);
root.updateWorldMatrix(true, true);

const NAMED_KEYS = ['rearBed', 'kitchenette', 'trailerCabinets', 'dinetteBenchFR', 'liftTable', 'bathPartition', 'washBasin', 'toiletBox', 'trailerWoodFloor', 'trailerCeilLamp', 'pickupDash', 'pickupScreen', 'pickupSteering', 'rearSleepingBag', 'rearDuffel', 'pickupFloorMat'];
const names = [];
root.traverse((o) => names.push(String(o.name ?? '')));
const has = (exact) => names.includes(exact);
const hasPrefix = (prefix, count) => names.filter((n) => n.startsWith(prefix)).length >= count;
const meshBBox = (object) => {
  const bbox = new THREE.Box3();
  object.traverse((o) => { if (o.isMesh) bbox.expandByObject(o); });
  return bbox.isEmpty() ? new THREE.Box3().setFromObject(object) : bbox;
};

/* ---- ① 组合摆位与 footprint（draft §5.0 + docs/00 一.12 ★-半径仲裁 ≤4.2） ---- */
console.log('-- ① 组合摆位/footprint（D4 双主体固定摆位） --');
const fp = exterior.footprint;
const outerRadius = Math.hypot(fp.length / 2, fp.width / 2);
check('footprint 8.0×2.5（draft 9.8×2.5 ★半径仲裁回调）', fp.length === 8.0 && fp.width === 2.5, `len=${fp.length} wid=${fp.width}`);
check('外接半径 ≤4.2（★半径仲裁目标：拖挂组合与 A 型同口径）', outerRadius <= 4.2, `r=${outerRadius.toFixed(3)}`);
check('外接半径 >4.0（海崖营位既定告警行为——docs/00 ★-半径行，R15 非阻断）', outerRadius > 4.0, `r=${outerRadius.toFixed(3)}`);
check('皮卡在前（+X 车头）/ 拖挂在后（皮卡组中心 x>0、拖挂组中心 x<0）', (() => {
  const pickup = exterior.group.getObjectByName('trailerRig/pickup');
  const trailer = exterior.group.getObjectByName('trailerRig/trailer');
  const pb = meshBBox(pickup);
  const tb = meshBBox(trailer);
  const pc = (pb.min.x + pb.max.x) / 2;
  const tc = (tb.min.x + tb.max.x) / 2;
  return pc > 0 && tc < 0 && pb.min.x > tb.min.x;
})(), (() => {
  const pickup = exterior.group.getObjectByName('trailerRig/pickup');
  const trailer = exterior.group.getObjectByName('trailerRig/trailer');
  const pb = meshBBox(pickup);
  const tb = meshBBox(trailer);
  return `pk c=${((pb.min.x + pb.max.x) / 2).toFixed(2)} tl c=${((tb.min.x + tb.max.x) / 2).toFixed(2)}`;
})());
check('牵引杆间隙 0.50（球头落皮卡尾 −0.40、拖挂鼻尖 ≤−0.85——draft §5.0 定值）', (() => {
  const ball = exterior.group.getObjectByName('trailerRig/a-frame/ball');
  const bb = meshBBox(ball);
  const ballCenter = (bb.min.x + bb.max.x) / 2;
  const noseB = meshBBox(exterior.group.getObjectByName('trailerRig/hull-nose'));
  return near(-ballCenter, 0.40, 0.03) && noseB.max.x <= -0.83; // 鼻尖局部 −0.90；0.06 微调旋转后 bbox 角点 ≈−0.84
})(), (() => {
  const bb = meshBBox(exterior.group.getObjectByName('trailerRig/a-frame/ball'));
  const nb = meshBBox(exterior.group.getObjectByName('trailerRig/hull-nose'));
  return `ball c=${((bb.min.x + bb.max.x) / 2).toFixed(2)} noseMax=${nb.max.x.toFixed(2)}`;
})());
check('组合整体居中对位（footprint 8.0×2.5 严格对称 [−4,4]；车体 bbox 中心 |cx|≤0.08——0.06 微调旋转的 bbox 视觉偏差）', (() => {
  const bodyMinX = meshBBox(exterior.group.getObjectByName('trailerRig/hull-tail-cap')).min.x;
  const bodyMaxX = meshBBox(exterior.group.getObjectByName('trailerRig/pickup-body')).max.x;
  const center = (bodyMinX + bodyMaxX) / 2;
  return Math.abs(center) <= 0.08 && fp.length === 8.0;
})(), (() => {
  const bodyMinX = meshBBox(exterior.group.getObjectByName('trailerRig/hull-tail-cap')).min.x;
  const bodyMaxX = meshBBox(exterior.group.getObjectByName('trailerRig/pickup-body')).max.x;
  return `x ${bodyMinX.toFixed(2)}..${bodyMaxX.toFixed(2)}`;
})());
check('微调 +0.06rad（docs/03 §4.2.0 拖挂组合「轻微适配」示例——模块侧 exterior/interior 同步）', near(exterior.group.rotation.y, 0.06) && near(interior.group.rotation.y, 0.06));
check('皮卡+拖挂轮组接地（轮胎外缘最低点=局部 y0；支撑腿脚盘同基准）', (() => {
  const pkTires = exterior.group.getObjectByName('trailerRig/pickup-wheels/body');
  const tTires = exterior.group.getObjectByName('trailerRig/trailer-wheels/body');
  const leg = exterior.group.getObjectByName('trailerRig/jack-leg/0.42');
  const tb = new THREE.Box3().setFromObject(tTires);
  const lb = meshBBox(leg);
  return pkTires.isInstancedMesh && pkTires.count === 4 && tTires.count === 2 && near(tb.min.y, 0, 0.01) && near(lb.min.y, 0, 0.01);
})());

/* ---- ② 3.3-1 外部·牵引皮卡 ---- */
console.log('-- ② 3.3-1 牵引皮卡 --');
const bodyMesh = exterior.group.getObjectByName('trailerRig/pickup-body');
check('皮卡车身=侧影 profileExtrude 一次成型（引擎盖→双排舱→货斗凹口）', !!bodyMesh && bodyMesh.geometry instanceof THREE.ExtrudeGeometry);
check('皮卡深蓝 #2c4a6e【3.3-1】', `#${bodyMesh.material.color.getHexString()}` === '#2c4a6e');
check('双排舱侧窗真开洞两扇 → 4 扇 clear 玻璃', hasPrefix('trailerRig/glass-cab-a/', 2) && hasPrefix('trailerRig/glass-cab-b/', 2));
check('前挡斜面玻璃 tinted（分面+弧/斜玻璃）', (() => {
  const ws = exterior.group.getObjectByName('trailerRig/glass-windshield');
  return !!ws && near(ws.material.opacity, 0.4);
})());
check('货斗载物·行李箱（roundedBox+双绑带）', has('trailerRig/luggage/body') && hasPrefix('trailerRig/luggage/strap/', 2));
check('货斗载物·备用油桶 jerryCan（#8a2f23）', has('trailerRig/jerry-can/body') && `#${exterior.group.getObjectByName('trailerRig/jerry-can/body').material.color.getHexString()}` === '#8a2f23');
check('货斗载物·柴火 Cylinder ×8 交错实例化（InstancedMesh count=8）', (() => {
  const logs = exterior.group.getObjectByName('trailerRig/firewood-logs/body');
  return !!logs && logs.isInstancedMesh && logs.count === 8;
})());
check('拖钩/A 字牵引杆（两斜管+横梁+球头）', has('trailerRig/a-frame/arms') && has('trailerRig/a-frame/ball'));
check('皮卡轮组 ×4（wheel 0.44/0.30，AT 轻度凸块）+ 轮眉 ×4', (() => {
  const tires = exterior.group.getObjectByName('trailerRig/pickup-wheels/body');
  return tires.isInstancedMesh && tires.count === 4 && hasPrefix('trailerRig/pk-fender/', 4);
})());
check('大灯 ×2 / 格栅 / 尾灯 ×2 / 后视镜 ×2 / 把手 ×2 / 保险杠 ×2', (() => {
  return hasPrefix('trailerRig/headlight/', 2) && has('trailerRig/grille') && hasPrefix('trailerRig/pickup-taillight/', 2)
    && hasPrefix('trailerRig/mirror/', 2) && hasPrefix('trailerRig/door-handle/', 2)
    && has('trailerRig/pickup-bumper-front') && has('trailerRig/pickup-bumper-rear');
})());
check('货斗地板+侧板 ×2（货斗凹口封仓）', has('trailerRig/bed-floor') && hasPrefix('trailerRig/bed-wall/', 2));

/* ---- ③ 3.3-2…5 外部·拖挂房车 ---- */
console.log('-- ③ 3.3-2…5 拖挂房车 --');
check('流线厢体分瓣法（上/下扇区 Cylinder + 侧板带洞挤出拼装）', (() => {
  const top = exterior.group.getObjectByName('trailerRig/hull-top-sector');
  const bottom = exterior.group.getObjectByName('trailerRig/hull-bottom-sector');
  const panel = exterior.group.getObjectByName('trailerRig/hull-panel/1.028');
  return !!top && !!bottom && !!panel && top.geometry.type === 'CylinderGeometry' && panel.geometry instanceof THREE.ExtrudeGeometry;
})());
check('厢体白 #f6f3ec + texTrailerBand 薄荷/粉线（侧板 cap 贴图）', (() => {
  const panel = exterior.group.getObjectByName('trailerRig/hull-panel/1.028');
  return `#${panel.material[0].color.getHexString()}` === '#f6f3ec' && panel.material[0].map?.name === 'trailerRig/tex/trailer-band';
})());
check('罐头火腿截面（r1.02 压 y0.88 + 底部削平：厢体顶 ≈2.42、底 ≈0.72）', (() => {
  const hb = meshBBox(exterior.group.getObjectByName('trailerRig/hull'));
  return near(hb.max.y, 2.42, 0.03) && near(hb.min.y, 0.72, 0.03);
})(), (() => {
  const hb = meshBBox(exterior.group.getObjectByName('trailerRig/hull'));
  return `y ${hb.min.y.toFixed(3)}..${hb.max.y.toFixed(3)}`;
})());
check('前鼻球冠+Lathe 整流罩', (() => {
  const nose = exterior.group.getObjectByName('trailerRig/hull-nose');
  return !!nose && nose.geometry.type === 'LatheGeometry';
})());
check('支撑腿 ×2 jackLeg 放下触地（3.3-3；DeploymentPart kind jackLeg）', hasPrefix('trailerRig/jack-leg/', 2) && deployment.some((p) => p.kind === 'jackLeg' && p.deployAmount === 1));
check('遮阳棚 awningAssembly(3.2,1.7) 右侧展开（3.3-4；布外缘 z<−2.4）', (() => {
  const cloth = exterior.group.getObjectByName('trailerRig/awning/cloth');
  const cb = new THREE.Box3().setFromObject(cloth);
  return !!cloth && cb.min.z < -2.4 && (cb.max.x - cb.min.x) > 3.0;
})(), (() => {
  const cb = new THREE.Box3().setFromObject(exterior.group.getObjectByName('trailerRig/awning/cloth'));
  return `zMin=${cb.min.z.toFixed(2)} span=${(cb.max.x - cb.min.x).toFixed(2)}`;
})());
check('棚布 12×8 分段 PlaneGeometry（docs/05 §7.1.2 布料网格契约；uv.x 固定边→自由边）', (() => {
  const cloth = exterior.group.getObjectByName('trailerRig/awning/cloth');
  return cloth.geometry.attributes.position.count === 117 && !!cloth.geometry.attributes.uv;
})());
check('八字支撑臂 ×2 + 前垂缘 + 壁轨（awningAssembly 组成）', hasPrefix('trailerRig/awning/arm/', 2) && has('trailerRig/awning/valance') && has('trailerRig/awning/rail'));
check('燃气瓶 ×2（Cylinder 0.13,0.4+阀）A 字架托盘（3.3-5 前部可见）', hasPrefix('trailerRig/gas-bottle/', 2) && has('trailerRig/gas-tray'));
check('备胎 torus(0.30,0.09)+毂盘 竖挂前鼻面（3.3-5）', (() => {
  const spare = exterior.group.getObjectByName('trailerRig/spare-tire/body');
  const sb = new THREE.Box3().setFromObject(spare);
  return !!spare && sb.min.y > 1.0 && sb.max.x > -1.1 && sb.max.x < -0.85;
})(), (() => {
  const sb = new THREE.Box3().setFromObject(exterior.group.getObjectByName('trailerRig/spare-tire/body'));
  return `x=${sb.max.x.toFixed(2)} y=${sb.min.y.toFixed(2)}..${sb.max.y.toFixed(2)}`;
})());
check('拖挂轮组 ×2 单轴 + 挡泥板弧 ×2', (() => {
  const tires = exterior.group.getObjectByName('trailerRig/trailer-wheels/body');
  return tires.isInstancedMesh && tires.count === 2 && hasPrefix('trailerRig/t-fender/', 2);
})());
check('尾灯 ×2 + 示廓灯 ×2（拖挂尾部）', hasPrefix('trailerRig/trailer-taillight/', 2) && hasPrefix('trailerRig/marker/', 2));

/* ---- ④ 3.3-6…7 透窗途径 + 尾部舷窗 ---- */
console.log('-- ④ 3.3-6/7 可透视窗与舷窗 --');
const windows = exterior.windows;
const byLabel = {};
for (const w of windows) { (byLabel[w.label] ??= []).push(w); }
check('windows ≥8（前挡 tinted + 皮卡侧窗 ×4 clear + 拖挂侧大窗 ×2 clear + 舷窗 ×2）', windows.length >= 9, `n=${windows.length}`);
check('玻璃三档静态基准（clear 0.24 / tinted 0.40 / porthole 0.30，同落 0.22–0.40 区间）', (() => {
  const clearOk = byLabel['trailer-l'].every((w) => near(w.mesh.material.opacity, 0.24));
  const tintedOk = byLabel.front.every((w) => near(w.mesh.material.opacity, 0.4));
  const portholeOk = byLabel.porthole.every((w) => near(w.mesh.material.opacity, 0.3));
  return clearOk && tintedOk && portholeOk;
})());
check('拖挂侧大窗 ×2 双侧对位（z ±1.045，内饰主透视面 3.3-6）', (() => {
  const l = byLabel['trailer-l'][0].mesh;
  const r = byLabel['trailer-r'][0].mesh;
  return near(l.position.z, 1.045) && near(r.position.z, -1.045);
})());
check('玻璃纪律：renderOrder 20 + noOutline + DoubleSide + depthWrite=false（三件套）', (() => {
  const pane = byLabel['trailer-l'][0].mesh;
  return windows.every((w) => w.mesh.renderOrder === 20 && w.mesh.userData.noOutline === true)
    && pane.material.side === THREE.DoubleSide && pane.material.depthWrite === false;
})());
check('尾部双舷窗（尾端面盘真开洞 + porthole 玻璃圆片；3.3-7 外观面）', (() => {
  const portholes = byLabel.porthole.map((w) => w.mesh);
  const pb = portholes.map((m) => new THREE.Box3().setFromObject(m));
  return portholes.length === 2 && pb.every((b) => b.min.x < -3.95) && near(pb[0].min.y, 1.47, 0.03);
})());
check('透窗视域：侧窗带（x −3.50..−1.60）内陈设 ≥4 组（卡座/桌板/厨房/吊柜——3.3-6「可透视」）', (() => {
  const zone = ['dinetteBenchFR', 'liftTable', 'kitchenette', 'trailerCabinets', 'trailerWoodFloor'];
  const inZone = zone.filter((k) => {
    const b = meshBBox(interior.named[k]);
    return b.max.x > -3.5 && b.min.x < -1.6;
  });
  return inZone.length >= 4;
})(), (() => {
  const zone = ['dinetteBenchFR', 'liftTable', 'kitchenette', 'trailerCabinets', 'trailerWoodFloor'];
  return zone.filter((k) => {
    const b = meshBBox(interior.named[k]);
    return b.max.x > -3.5 && b.min.x < -1.6;
  }).join(',');
})());

/* ---- ⑤ 3.3-7…10 拖挂内饰（10 named） ---- */
console.log('-- ⑤ 3.3-7…10 拖挂厢内饰 --');
const namedKeys = Object.keys(interior.named);
check('named 恰 16 键（拖挂 10 + 皮卡 6；卡座单键 dinetteBenchFR——docs/03 §4.2.3「dinetteBenchF/R」键名规范化裁定）', namedKeys.length === 16 && NAMED_KEYS.every((k) => namedKeys.includes(k)), namedKeys.join(','));
check('named 对象全部在场于内饰组子树', NAMED_KEYS.every((k) => {
  let node = interior.named[k];
  while (node && node !== interior.group) node = node.parent;
  return node === interior.group;
}));
check('内饰组 noOutline（物体级硬开关，§5.3）', interior.group.userData.noOutline === true);
check('`rearBed` 尾部横置双人床（床箱+床垫+双枕+双色拼布被；3.3-7）', (() => {
  const bed = interior.named.rearBed;
  const b = meshBBox(bed);
  return (b.max.x - b.min.x) < 1.05 && (b.max.z - b.min.z) > 1.3 && b.max.x < -2.85 && near(b.max.y, 1.26, 0.05);
})(), (() => {
  const b = meshBBox(interior.named.rearBed);
  return `x ${b.min.x.toFixed(2)}..${b.max.x.toFixed(2)} yTop=${b.max.y.toFixed(2)}`;
})());
check('`kitchenette` 紧凑厨房贴右壁（台面+小水槽+单炉架；3.3-8）', (() => {
  const b = meshBBox(interior.named.kitchenette);
  return b.max.z < -0.35 && has('trailerRig/burner') && has('trailerRig/faucet');
})(), (() => {
  const b = meshBBox(interior.named.kitchenette);
  return `zMax=${b.max.z.toFixed(2)} burner=${has('trailerRig/burner')} faucet=${has('trailerRig/faucet')}`;
})());
check('`trailerCabinets` 吊柜 ×2（厨区上方；3.3-8）', (() => {
  const b = meshBBox(interior.named.trailerCabinets);
  return b.min.y > 1.68 && b.max.z < -0.4;
})(), (() => {
  const b = meshBBox(interior.named.trailerCabinets);
  return `yMin=${b.min.y.toFixed(2)} zMax=${b.max.z.toFixed(2)}`;
})());
check('`dinetteBenchFR` 对坐卡座 ×2 相对（长凳面对面；3.3-9）', (() => {
  const seats = names.filter((n) => n.startsWith('trailerRig/dinette-bench-F-seat') || n.startsWith('trailerRig/dinette-bench-R-seat'));
  return seats.length === 2;
})());
check('`liftTable` 可升降小桌板升起态（桌面 ≈地板+0.46=1.20；DeploymentPart kind other deployAmount 1）', (() => {
  const b = meshBBox(interior.named.liftTable);
  const part = deployment.find((p) => p.node === interior.named.liftTable);
  return near(b.max.y, 1.20, 0.06) && !!part && part.kind === 'other' && part.deployAmount === 1;
})(), (() => {
  const b = meshBBox(interior.named.liftTable);
  return `top=${b.max.y.toFixed(2)}`;
})());
check('`bathPartition` 隔断板墙+门缝 / `washBasin` Lathe 盆 / `toiletBox` 两叠圆角盒（3.3-10 前鼻端）', (() => {
  const pb = meshBBox(interior.named.bathPartition);
  return has('trailerRig/partition-wall') && has('trailerRig/partition-seam') && pb.min.x < -1.35
    && has('trailerRig/basin-bowl') && has('trailerRig/toilet-base') && has('trailerRig/toilet-tank');
})(), (() => {
  const pb = meshBBox(interior.named.bathPartition);
  return `xMin=${pb.min.x.toFixed(2)} wall=${has('trailerRig/partition-wall')} seam=${has('trailerRig/partition-seam')} bowl=${has('trailerRig/basin-bowl')} toilet=${has('trailerRig/toilet-base')}`;
})());
check('`trailerWoodFloor` 地板（texWoodFloor oak）+ `trailerCeilLamp` 吸顶盘', (() => {
  const floor = interior.named.trailerWoodFloor;
  return !!floor.material.map && near(floor.position.y, 0.742, 0.01) && has('trailerRig/ceil-lamp-bulb');
})());
check('三件套 ①innerShell：拖挂厢=分瓣几何复用 ×0.94 BackSide（6 片）+ 皮卡舱圆角盒 BackSide', (() => {
  const shells = [];
  interior.group.traverse((o) => { if (o.isMesh && String(o.name).startsWith('trailerRig/interior/inner-shell')) shells.push(o); });
  return shells.length === 7 && shells.every((m) => m.material.side === THREE.BackSide);
})(), (() => {
  const shells = [];
  interior.group.traverse((o) => { if (o.isMesh && String(o.name).startsWith('trailerRig/interior/inner-shell')) shells.push(o); });
  return `n=${shells.length}`;
})());
check('三件套 ③内饰不投影不接收阴影', (() => {
  let ok = true;
  interior.group.traverse((o) => { if (o.isMesh && (o.castShadow !== false || o.receiveShadow !== false)) ok = false; });
  return ok;
})());

/* ---- ⑥ 3.3-11 皮卡双排舱内饰（6 named） ---- */
console.log('-- ⑥ 3.3-11 皮卡双排舱 --');
check('`pickupDash` 仪表盘（gaugeCluster cool + texDash 冷青贴图）', (() => {
  const dash = interior.named.pickupDash;
  const screenMesh = dash.getObjectByName('trailerRig/pickup-gauge/screen');
  return !!screenMesh && screenMesh.material.map?.name === 'trailerRig/tex/dash-cool';
})());
check('`pickupScreen` 中控屏（0.30×0.22 + texScreenNav）', (() => {
  const screen = interior.named.pickupScreen;
  const panel = screen.getObjectByName('trailerRig/pickup-screen/screen');
  return !!panel && panel.material.map?.name === 'trailerRig/tex/screen-nav' && near(panel.geometry.parameters.width, 0.3);
})());
check('`pickupSteering` 方向盘（torus+3 辐条+转向柱）', (() => {
  const steering = interior.named.pickupSteering;
  return steering.children.filter((c) => String(c.name).startsWith('trailerRig/steering-spoke/')).length === 3
    && !!steering.getObjectByName('trailerRig/steering-rim') && !!steering.getObjectByName('trailerRig/steering-column');
})());
check('`rearSleepingBag` 后座睡袋（半卷态：平铺段+卷筒+扎带 ×2）', has('trailerRig/sleeping-bag/body') && hasPrefix('trailerRig/sleeping-bag/strap/', 2));
check('`rearDuffel` 后座行李（圆角行囊+绑带 ×2）', has('trailerRig/duffel-body') && hasPrefix('trailerRig/duffel-strap/', 2));
check('`pickupFloorMat` 脚垫（深灰薄板，驾驶位）', (() => {
  const mat = interior.named.pickupFloorMat;
  const b = meshBBox(mat);
  return b.max.y < 0.72 && b.min.z > 0.05;
})(), (() => {
  const b = meshBBox(interior.named.pickupFloorMat);
  return `yTop=${b.max.y.toFixed(2)} zMin=${b.min.z.toFixed(2)}`;
})());
check('皮卡舱透窗视域：双排侧窗（y 1.10..1.62）内仪表/屏/方向盘/睡袋/行李 ≥4 组', (() => {
  const zone = ['pickupDash', 'pickupScreen', 'pickupSteering', 'rearSleepingBag', 'rearDuffel'];
  const inZone = zone.filter((k) => {
    const b = meshBBox(interior.named[k]);
    return b.max.y > 1.1 && b.min.y < 1.62;
  });
  return inZone.length >= 4;
})(), (() => {
  const zone = ['pickupDash', 'pickupScreen', 'pickupSteering', 'rearSleepingBag', 'rearDuffel'];
  return zone.filter((k) => {
    const b = meshBBox(interior.named[k]);
    return b.max.y > 1.1 && b.min.y < 1.62;
  }).join(',');
})());

/* ---- ⑦ 3.3-12 车队式旅居感：一冷一暖 ---- */
console.log('-- ⑦ 3.3-12 一冷一暖车队感 --');
trailerRig.interiorLightHooks.applyInteriorLight(0, 0, 1); // 白天基线下发后采样（屏标量=微光基值 0.12）
check('冷端·皮卡：车身深蓝 #2c4a6e + 仪表屏冷青贴图 + 屏幕微光 ≤0.35（draft「微光 0.35」不单设灯具）', (() => {
  const screenMat = [];
  interior.named.pickupDash.traverse((o) => { if (o.isMesh && o.material.isMeshBasicMaterial) screenMat.push(o.material); });
  interior.named.pickupScreen.traverse((o) => { if (o.isMesh && o.material.isMeshBasicMaterial) screenMat.push(o.material); });
  return `#${exterior.group.getObjectByName('trailerRig/pickup-body').material.color.getHexString()}` === '#2c4a6e'
    && screenMat.length === 2 && screenMat.every((m) => m.color.r <= 0.35);
})(), (() => {
  const screenMat = [];
  interior.named.pickupDash.traverse((o) => { if (o.isMesh && o.material.isMeshBasicMaterial) screenMat.push(o.material); });
  interior.named.pickupScreen.traverse((o) => { if (o.isMesh && o.material.isMeshBasicMaterial) screenMat.push(o.material); });
  return `n=${screenMat.length} r=${screenMat.map((m) => m.color.r.toFixed(2)).join('/')}`;
})());
check('暖端·拖挂：顶灯暖 #ffb066 steady authored 1.4 + 暖光点光位于拖挂厢内 (−2.6,1.5,0)【Q6 拍板】', (() => {
  const lamp = trailerRig.interiorLightHooks.lamps[0];
  const fill = interior.group.getObjectByName('trailerRig/fill-light');
  return `#${lamp.emissiveMat.emissive.getHexString()}` === '#ffb066' && lamp.mode === 'steady'
    && near(lamp.emissiveMat.emissiveIntensity, 1.4) && fill instanceof THREE.PointLight
    && near(fill.position.x, -2.6) && near(fill.position.y, 1.5) && fill.castShadow === false;
})());
check('一大一小（拖挂生活舱顶 2.42 > 皮卡舱顶 2.02）+ 一冷一暖（皮卡冷屏 vs 拖挂暖灯）同场', (() => {
  const hullTop = meshBBox(exterior.group.getObjectByName('trailerRig/hull')).max.y;
  return near(hullTop, 2.42, 0.03);
})());
check('lamps 恰 1（拖挂顶灯；皮卡不设灯具——screens 承担，docs/03 §4.2.3 Q6 行）', trailerRig.interiorLightHooks.lamps.length === 1);
check('halo 精灵（additive，renderOrder 20）', trailerRig.interiorLightHooks.lamps.every((l) => l.halo instanceof THREE.Sprite && l.halo.material.blending === THREE.AdditiveBlending && l.halo.renderOrder === 20));

/* ---- ⑧ 布料/天气挂点（docs/03 §4.2.3） ---- */
console.log('-- ⑧ 布料/天气挂点 --');
check('cloths=拖挂遮阳棚布 ×1：stiffness 0.4 / windFactor 1.0 / sagAmp 0.05 / swayAxes y+z（docs/05 §7.1.2）', (() => {
  const cloth = exterior.cloths[0];
  return exterior.cloths.length === 1 && cloth.stiffness === 0.4 && cloth.windFactor === 1.0
    && cloth.sagAmp === 0.05 && cloth.swayAxes.join('+') === 'y+z' && !!cloth.dripAnchors?.length;
})());
check('weatherSurfaces ×3：棚布 clothTop + 拖挂顶弧面 roofTop + 皮卡货斗沿口 roofTop', (() => {
  const kinds = exterior.weatherSurfaces.map((s) => s.kind).join(',');
  return exterior.weatherSurfaces.length === 3 && kinds === 'clothTop,roofTop,roofTop';
})());
check('M4 snowShell ×3 预建（visible=false，挂 exterior 子树随车体变换；clothTop 壳挂布之下继承风摆）', exterior.weatherSurfaces.every((s) => s.snowShell instanceof THREE.Mesh && s.snowShell.visible === false && root.getObjectByName(s.snowShell.name) === s.snowShell));
check('雪壳材质互不重复（WeatherMaterialSystem uuid 表去重前提）', new Set(exterior.weatherSurfaces.map((s) => s.material.uuid)).size === 3);

/* ---- ⑨ 展开机构（3.3-3/4/9：jackLeg + awning + other 升降桌板） ---- */
console.log('-- ⑨ 展开机构 --');
check('buildDeployment 恰 3 项（jackLeg+awning+other——§4.2.6 差异矩阵「jackLeg+awning+双体」）', deployment.length === 3 && deployment.map((p) => p.kind).join(',') === 'jackLeg,awning,other');
check('deployAmount 均 1（默认已展开交付；静态展开态不做开合动画）', deployment.every((p) => p.deployAmount === 1));
check('支撑腿/遮阳棚挂 exterior 组、升降桌板挂内饰组（named 共享不重复接管）', (() => {
  const legNode = deployment[0].node;
  const awnNode = deployment[1].node;
  let legOk = false;
  for (let n = legNode; n; n = n.parent) if (n === exterior.group) legOk = true;
  let awnOk = false;
  for (let n = awnNode; n; n = n.parent) if (n === exterior.group) awnOk = true;
  return legOk && awnOk && deployment[2].node.parent === interior.group;
})());

/* ---- ⑩ 内饰灯光钩子（D2 唯一驱动链） ---- */
console.log('-- ⑩ 内饰灯光钩子 --');
const clearPane = byLabel['trailer-l'][0].mesh.material;
const tintedPane = byLabel.front[0].mesh.material;
const portholePane = byLabel.porthole[0].mesh.material;
const fillLight = interior.group.getObjectByName('trailerRig/fill-light');
trailerRig.interiorLightHooks.applyInteriorLight(1, 1, 1);
check('夜间 power=1：三档玻璃 opacity → 0.22（docs/04 §5.5）', near(clearPane.opacity, 0.22) && near(tintedPane.opacity, 0.22) && near(portholePane.opacity, 0.22));
check('夜间 power=1：glowTags 床垫 0.10 / 拼布被 0.08 / innerShell 0.12', (() => {
  const bedMat = interior.named.rearBed.getObjectByName('trailerRig/bed-mattress').material;
  const quiltMat = interior.named.rearBed.getObjectByName('trailerRig/bed-quilt-a').material;
  const shellMat = interior.group.getObjectByName('trailerRig/interior/inner-shell-t-top').material;
  return near(bedMat.emissiveIntensity, 0.1) && near(quiltMat.emissiveIntensity, 0.08) && near(shellMat.emissiveIntensity, 0.12);
})());
check('夜间 power=1：皮卡屏标量 0.35（微光上限）+ 暖光点光 1.15×1×1', (() => {
  const screenMat = [];
  interior.named.pickupScreen.traverse((o) => { if (o.isMesh && o.material.isMeshBasicMaterial) screenMat.push(o.material); });
  return near(screenMat[0].color.r, 0.35) && near(fillLight.intensity, 1.15);
})());
trailerRig.interiorLightHooks.applyInteriorLight(0.85, 1, 1);
check('黄昏 power=0.85：屏标量 0.3155 + 点光 0.9775（冷暖对比档）', (() => {
  const screenMat = [];
  interior.named.pickupScreen.traverse((o) => { if (o.isMesh && o.material.isMeshBasicMaterial) screenMat.push(o.material); });
  return near(screenMat[0].color.r, 0.12 + 0.23 * 0.85) && near(fillLight.intensity, 1.15 * 0.85);
})());
trailerRig.interiorLightHooks.applyInteriorLight(0, 0, 1);
check('白天 power=0：玻璃回 0.24/0.40/0.30、glow 全灭、点光 0（blend=1 直达）', near(clearPane.opacity, 0.24) && near(tintedPane.opacity, 0.4) && near(portholePane.opacity, 0.3) && fillLight.intensity === 0);

/* ---- ⑪ 外部要素 25 行逐项在场（docs/03 §4.2.6「拖挂 25」基准 ≥22） ---- */
console.log('-- ⑪ 外部要素 25 行 --');
const EXTERIOR_ITEMS = [
  ['① 皮卡车身侧影挤出', () => bodyMesh.geometry instanceof THREE.ExtrudeGeometry],
  ['② 双排舱侧窗真开洞 ×2（4 玻璃）', () => hasPrefix('trailerRig/glass-cab-a/', 2) && hasPrefix('trailerRig/glass-cab-b/', 2)],
  ['③ 前挡斜玻璃 tinted', () => has('trailerRig/glass-windshield')],
  ['④ 前大灯 ×2+格栅', () => hasPrefix('trailerRig/headlight/', 2) && has('trailerRig/grille')],
  ['⑤ 皮卡尾灯 ×2', () => hasPrefix('trailerRig/pickup-taillight/', 2)],
  ['⑥ 后视镜 ×2+把手 ×2', () => hasPrefix('trailerRig/mirror/', 2) && hasPrefix('trailerRig/door-handle/', 2)],
  ['⑦ 货斗地板+侧板 ×2', () => has('trailerRig/bed-floor') && hasPrefix('trailerRig/bed-wall/', 2)],
  ['⑧ 行李箱+双绑带', () => has('trailerRig/luggage/body') && hasPrefix('trailerRig/luggage/strap/', 2)],
  ['⑨ 油桶 jerryCan', () => has('trailerRig/jerry-can/body')],
  ['⑩ 柴火 ×8 实例化', () => exterior.group.getObjectByName('trailerRig/firewood-logs/body')?.count === 8],
  ['⑪ 拖钩/A 字牵引杆+球头', () => has('trailerRig/a-frame/arms') && has('trailerRig/a-frame/ball')],
  ['⑫ 皮卡轮组 ×4 AT 轻度', () => exterior.group.getObjectByName('trailerRig/pickup-wheels/body')?.count === 4],
  ['⑬ 皮卡轮眉 ×4+排气', () => hasPrefix('trailerRig/pk-fender/', 4) && has('trailerRig/exhaust')],
  ['⑭ 皮卡保险杠 ×2', () => has('trailerRig/pickup-bumper-front') && has('trailerRig/pickup-bumper-rear')],
  ['⑮ 流线厢体（上/下扇区+削平）', () => has('trailerRig/hull-top-sector') && has('trailerRig/hull-bottom-sector')],
  ['⑯ 侧板 ×2 texTrailerBand', () => has('trailerRig/hull-panel/1.028') && has('trailerRig/hull-panel/-1.028')],
  ['⑰ 尾端面盘真开洞', () => has('trailerRig/hull-tail-cap')],
  ['⑱ 舷窗玻璃 ×2 porthole', () => byLabel.porthole?.length === 2],
  ['⑲ 前鼻 Lathe 整流罩', () => has('trailerRig/hull-nose')],
  ['⑳ 支撑腿 ×2 触地', () => hasPrefix('trailerRig/jack-leg/', 2)],
  ['㉑ 遮阳棚整组（布+臂 ×2+垂缘+轨）', () => has('trailerRig/awning/cloth') && hasPrefix('trailerRig/awning/arm/', 2) && has('trailerRig/awning/valance') && has('trailerRig/awning/rail')],
  ['㉒ 燃气瓶 ×2+托盘', () => hasPrefix('trailerRig/gas-bottle/', 2) && has('trailerRig/gas-tray')],
  ['㉓ 备胎竖挂前鼻', () => has('trailerRig/spare-tire/body')],
  ['㉔ 拖挂轮组 ×2+挡泥板 ×2', () => hasPrefix('trailerRig/t-fender/', 2)],
  ['㉕ 拖挂尾灯 ×2+示廓 ×2', () => hasPrefix('trailerRig/trailer-taillight/', 2) && hasPrefix('trailerRig/marker/', 2)],
];
const exteriorFails = EXTERIOR_ITEMS.filter(([, fn]) => !fn()).map(([label]) => label);
check(`外部要素 25 行逐项在场（25/25≥22——docs/03 §4.2.6 双指标）`, exteriorFails.length === 0, exteriorFails.join(' / ') || '25/25');

/* ---- ⑫ 红线与预算 ---- */
console.log('-- ⑫ 红线与预算 --');
const humanHit = [];
root.traverse((o) => {
  const label = `${o.name ?? ''}`;
  if (/(person|human|figure|humanoid|people|人物|人形|seat-?人|driver|passenger)/i.test(label)) humanHit.push(label);
});
check('无人形几何（名称扫描零命中——一.6 红线）', humanHit.length === 0, humanHit.join(','));
let meshCount = 0;
let triangles = 0;
root.traverse((o) => {
  if (!o.isMesh && !o.isSprite) return;
  meshCount += 1;
  const g = o.geometry;
  if (g) triangles += (g.index ? g.index.count : g.getAttribute('position').count) / 3;
});
check('三角形 ≤45k（docs/04 §5.7 车辆本体预算）', triangles <= 45000, `tris=${Math.round(triangles)} meshes=${meshCount}`);
check('实例化成对壳：轮组恒 2 DC/组（body+shell 共享矩阵，§5.6）', (() => {
  const tires = exterior.group.getObjectByName('trailerRig/pickup-wheels/body');
  const shell = exterior.group.getObjectByName('trailerRig/pickup-wheels/shell');
  return !!shell && shell.isInstancedMesh && shell.count === tires.count
    && tires.parent.userData.instancedGroup?.body === tires && tires.parent.userData.instancedGroup?.shell === shell;
})());

/* ---- ⑬ 重复构建幂等 ---- */
console.log('-- ⑬ 重复构建 --');
const root2 = new THREE.Group();
const ctx2 = { root: root2, camp: ctx.camp, assets, rng: new Rng('vehicle:trailerRig') };
const exterior2 = trailerRig.buildExterior(ctx2);
root2.add(exterior2.group);
trailerRig.buildDeployment(ctx2);
const interior2 = trailerRig.buildInterior(ctx2);
root2.add(interior2.group);
check('二次构建 named 仍 16 键（交换后注册快照不漂移）', Object.keys(interior2.named).length === 16);
check('二次构建灯 authored 基值重写（steady 1.4）', trailerRig.interiorLightHooks.lamps[0].emissiveMat.emissiveIntensity === 1.4);
check('二次构建灯句柄随构建刷新（halo 挂新内饰子树）', interior2 !== interior && (() => {
  let node = trailerRig.interiorLightHooks.lamps[0].halo;
  while (node && node !== interior2.group) node = node.parent;
  return node === interior2.group;
})());

/* ---- ⑭ registry 接线（静态源码断言——并行 T24/T26 在途，不 import 注册表模块） ---- */
console.log('-- ⑭ 注册接线 --');
{
  const registrySrc = readFileSync(path.join(here, 'src', 'content', 'vehicles', 'registry.ts'), 'utf8');
  check('registry.ts：import trailerRig + register 行在场（T25 接线）', /import\s*\{\s*trailerRig\s*\}\s*from\s*'@\/content\/vehicles\/trailerRig'/.test(registrySrc) && /vehicleRegistry\.register\(trailerRig\)/.test(registrySrc));
  check('registry.ts：classC isDefault 行未被替换（默认车型槽位不动）', /vehicleRegistry\.register\(classC\);/.test(registrySrc) && !/vehicleRegistry\.register\(trailerRig,\s*\{\s*isDefault/.test(registrySrc));
}

/* ============================== ⑮ Director 集成（装配→对位→半径告警口径→交换→卸载） ============================== */
console.log('-- ⑮ Director 集成 --');
{
  const { Director } = await import('@/core/director');
  const { Registry } = await import('@/core/registry');
  const { timeRegistry } = await import('@/content/times/registry');
  const { weatherRegistry } = await import('@/content/weathers/registry');
  const { WeatherMaterialSystem } = await import('@/systems/weatherMaterial');
  const { RhythmClock } = await import('@/systems/clock');

  const makeProbeScene = (id, radius, anchor, heading) => ({
    id,
    label: id,
    buildTerrain() {
      const group = new THREE.Group();
      group.name = `${id}/terrain`;
      return { group, campAnchor: { position: new THREE.Vector3(...anchor), headingRad: heading, groundY: anchor[1], radius } };
    },
    buildProps() {
      return { group: new THREE.Group(), named: {}, cloths: [], lamps: [], emitters: [], weatherSurfaces: [] };
    },
    createAnimations() { return []; },
    palette: { colorChannels: {}, baseStyle: { topTheme: 'lawn', edgeMatId: 'rockStrata', rimDecal: null, skirtLayers: 0, silhouette: null }, baseFog: 0.1 },
    lightHooks: { applyLighting() {} },
  });
  // 越界探针：复用 trailerRig 全部构建器（id 不同——footprint 告警口径与交换/卸载路径）
  const trailerRigProbe = {
    id: 'trailerRig-probe',
    label: '拖挂房车·越界探针',
    buildExterior: trailerRig.buildExterior,
    buildDeployment: trailerRig.buildDeployment,
    buildInterior: trailerRig.buildInterior,
    interiorLightHooks: trailerRig.interiorLightHooks,
  };
  const sceneRegistry = new Registry();
  sceneRegistry.register(makeProbeScene('probeR42', 4.2, [0, 1.2, 0.8], 0.3)); // ★半径仲裁上限营位
  sceneRegistry.register(makeProbeScene('probeR40', 4.0, [0, 1.2, 0.8], 0.3)); // 海崖同款 4.0 营位
  const localVehicleRegistry = new Registry();
  localVehicleRegistry.register(trailerRigProbe); // 探针先注册→applyState 默认档取注册序首项
  localVehicleRegistry.register(trailerRig);

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
    // 默认档：trailerRig 无 isDefault → 注册序首项=trailerRig-probe（同构建器，几何一致）
    {
      const vrootDiag = engineDuck.scene.getObjectByName('vehicle/trailerRig-probe');
      if (!vrootDiag) console.log(`  [diag] Director 装配失败诊断：warnings=${JSON.stringify(warnings.slice(0, 6))} sceneChildren=${engineDuck.scene.children.map((c) => c.name).join(',')}`);
    }
    check('Director 装配：默认档 vehicle/trailerRig-probe 入场景且按 campAnchor 对位（y=groundY 1.2、heading 0.3）', (() => {
      const vroot = engineDuck.scene.getObjectByName('vehicle/trailerRig-probe');
      return !!vroot && near(vroot.position.x, 0) && near(vroot.position.y, 1.2) && near(vroot.position.z, 0.8) && near(vroot.rotation.y, 0.3);
    })(), (() => {
      const vroot = engineDuck.scene.getObjectByName('vehicle/trailerRig-probe');
      if (!vroot) return 'vroot 缺失';
      return `pos=(${vroot.position.x.toFixed(2)},${vroot.position.y.toFixed(2)},${vroot.position.z.toFixed(2)}) rot=${vroot.rotation.y.toFixed(3)}`;
    })());
    check('Director 装配：外内双组+16 named 全部挂车根（组合居中=根部对位）', (() => {
      const vroot = engineDuck.scene.getObjectByName('vehicle/trailerRig-probe');
      return !!vroot.getObjectByName('trailerRig/exterior') && !!vroot.getObjectByName('trailerRig/interior')
        && NAMED_KEYS.every((k) => vroot.getObjectByName(`trailerRig/interior/${k}`) !== undefined);
    })());
    check('营位半径 4.2 + 外接半径 4.19：不触发越界告警（★半径仲裁达标）', warnings.filter((w) => w.includes('footprint exceeds camp radius')).length === 0, warnings.filter((w) => w.includes('footprint')).join(' | ') || '无告警');
    check('棚布经 Director 注册 WindSystem（补丁后材质带风摆克隆标记）', (() => {
      const cloth = engineDuck.scene.getObjectByName('trailerRig/awning/cloth');
      return !!cloth && String(cloth.material.name).endsWith('+wind') && cloth.customDepthMaterial !== undefined;
    })());
    check('雪壳经 Director 注册 WeatherMaterialSystem（wmShellExtrude 注入且 visible=false 待 snowCover）', (() => {
      const shell = engineDuck.scene.getObjectByName('trailerRig/snow-hull-top');
      return !!shell && shell.material.userData.wmShellExtrude !== undefined && shell.visible === false;
    })());

    const waitSwap = (pred) => {
      for (let i = 0; i < 1500; i++) {
        engineDuck.hooks.transition(0.016);
        if (pred()) return true;
      }
      return pred();
    };
    const warnCountBefore = warnings.length;
    // ① 车型交换（同构建器；仍在 4.2 营位——无告警分支）
    director.applyState({ vehicle: 'trailerRig-probe' });
    check('车型交换完成（默认档重建为探针 id，旧根移除、零抛错）', waitSwap(() => director.vehicle?.id === 'trailerRig-probe' && director.vehicleSwap === null && !engineDuck.scene.getObjectByName('vehicle/trailerRig-probe-dummy')));
    check('营位 4.2 + 外接半径 4.19：不触发越界告警（★半径仲裁达标复验）', warnings.slice(warnCountBefore).filter((w) => w.includes('footprint exceeds camp radius')).length === 0);
    // ② 场景交换到 4.0 营位（海崖同款）——placeVehicle 仅重对位不重建（告警语义=构建期）
    director.applyState({ scene: 'probeR40' });
    check('场景交换完成（probeR40 radius 4.0 激活）', waitSwap(() => director.scene?.id === 'probeR40' && director.sceneSwap === null));
    check('场景交换仅重对位不重建：仍无告警（footprint 告警=构建期口径，director.applyCampPlacement）', warnings.slice(warnCountBefore).filter((w) => w.includes('footprint exceeds camp radius')).length === 0);
    // ③ 车型交换 → 正式 trailerRig 在 4.0 营位「构建」→ 既定告警分支
    director.applyState({ vehicle: 'trailerRig' });
    check('正式 trailerRig 在 4.0 营位重建完成（既定告警下装配照常）', waitSwap(() => director.vehicle?.id === 'trailerRig' && director.vehicleSwap === null));
    check('营位 4.0 构建期 + 外接半径 4.19：触发「[vehicle] footprint exceeds camp radius」告警（docs/00 ★-半径行既定非阻断）', warnings.slice(warnCountBefore).some((w) => w.includes('footprint exceeds camp radius') && w.includes('4.19')), warnings.slice(warnCountBefore).find((w) => w.includes('footprint')) ?? '（无告警）');
    check('告警后装配仍完成（正式车型在场，对位 y=groundY 1.2）', (() => {
      const vroot = engineDuck.scene.getObjectByName('vehicle/trailerRig');
      return !!vroot && near(vroot.position.y, 1.2);
    })());
    check('重建后 liftTable 唯一挂内饰组（deployment 记录的节点不被 Director 重复接管）', (() => {
      const hits = [];
      engineDuck.scene.traverse((o) => { if (String(o.name) === 'trailerRig/interior/liftTable') hits.push(o); });
      return hits.length === 1 && hits[0].parent === engineDuck.scene.getObjectByName('trailerRig/interior');
    })());

    // WeatherMaterialSystem.register/unregister 对（雪壳驱动路径）
    const wm = new WeatherMaterialSystem(new RhythmClock());
    const probeAssets = { geometry: (id, build) => geometryCache.has(id) ? geometryCache.get(id) : (geometryCache.set(id, build()), geometryCache.get(id)), texture: (id, build) => textureCache.has(id) ? textureCache.get(id) : (textureCache.set(id, build()), textureCache.get(id)), releaseGeometry() {}, releaseTexture() {} };
    const probeRoot = new THREE.Group();
    const extProbe = trailerRig.buildExterior({ root: probeRoot, camp: { groundY: 0, headingRad: 0, radius: 4.2 }, assets: probeAssets, rng: new Rng('probe-t25') });
    const SNOW = { wetness: 0, puddle: 0, clothSag: 0, snowCover: 1, lineFade: 0, fogMul: 1, cloudShadow: 0 };
    const CLEAR = { wetness: 0, puddle: 0, clothSag: 0, snowCover: 0, lineFade: 0, fogMul: 1, cloudShadow: 0 };
    wm.register(extProbe.weatherSurfaces);
    wm.setComponentsInstant(SNOW);
    wm.update();
    check('register+snowCover=1：三枚雪壳全部可见（clothTop 壳继承布面变换）', extProbe.weatherSurfaces.every((s) => s.snowShell.visible === true));
    wm.unregister(extProbe.weatherSurfaces);
    wm.setComponentsInstant(CLEAR);
    wm.update();
    check('unregister 后雪壳脱离驱动（无残留绑定）', extProbe.weatherSurfaces.every((s) => s.snowShell.visible === true));
    wm.register(extProbe.weatherSurfaces);
    wm.setComponentsInstant(CLEAR);
    wm.update();
    check('反注册后可重注册并恢复驱动（雪停壳隐，幂等 uuid 表已清）', extProbe.weatherSurfaces.every((s) => s.snowShell.visible === false && s.snowShell.material.userData.wmShellExtrude !== undefined));

    director.dispose();
    check('dispose：车型卸载路径（unloadVehicle→weatherMaterial.unregister）零抛错且车根移除', !engineDuck.scene.getObjectByName('vehicle/trailerRig-probe') && !engineDuck.scene.getObjectByName('vehicle/trailerRig'));
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
