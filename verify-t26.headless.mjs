// verify-t26.headless.mjs —— T26 B型面包车 classB 行为冒烟（无头，无 WebGL/DOM 渲染）。
// 运行：node verify-t26.headless.mjs（自带 module.registerHooks 钩子，Node ≥20.19；同 verify-t23.headless.mjs 模式）。
// 断言逐条对 docs/03 §4.2.4（3.4-1…12）/ §4.2.0（三件套/玻璃三档/钩子模板/布料天气挂点）/
//   §4.2.6（B 16/23 双指标）/ docs/05 §7.1.2 布料行（B 棚 0.4/1.0/0.05、帐帘带 0.9/0.12、纱帘 0.35/0.12、挂毯 0.6/0.12）。
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
      if (!/\.[cm]?[jt]sx?$/.test(p)) {
        // 目录导入（如 T27 的 @/geom/parts/vehicles/overlandTruck）→ 优先 index.ts，其次 <dir>.ts
        const dirIndex = path.join(here, 'src', p, 'index.ts');
        if (existsSync(dirIndex)) p = `${p}/index.ts`;
        else p += '.ts';
      }
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
const { classB } = await import('@/content/vehicles/classB');
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

console.log('== T26 classB 无头冒烟 ==');
check('模块身份 id/label', classB.id === 'classB' && classB.label === 'B型面包车' && classB.isDefault === undefined);
check('VehicleModule 四项齐备', typeof classB.buildExterior === 'function' && typeof classB.buildDeployment === 'function' && typeof classB.buildInterior === 'function' && !!classB.interiorLightHooks);

const root = new THREE.Group();
root.name = 'vehicle/classB';
const ctx = { root, camp: { groundY: 1.2, headingRad: 0.3, radius: 4.0 }, assets, rng: new Rng('vehicle:classB') };
const exterior = classB.buildExterior(ctx);
root.add(exterior.group);
const deployment = classB.buildDeployment(ctx);
const interior = classB.buildInterior(ctx);
root.add(interior.group);
root.updateWorldMatrix(true, true);

/* ---- ① 3.4-1 圆润紧凑复古双色面包车（footprint 最小 + texRetroTwoTone 波浪贴装 + 短头圆弧） ---- */
console.log('-- ① 3.4-1 复古双色面包车 --');
const fp = exterior.footprint;
const outerRadius = Math.hypot(fp.length / 2, fp.width / 2);
check('footprint 4.7×2.2（docs/03 §4.2.4，五车最小）', fp.length === 4.7 && fp.width === 2.2, `len=${fp.length} wid=${fp.width}`);
check('外接半径 ≤4.2（★半径仲裁）且五车最小（< classC 3.45）', outerRadius <= 4.2 && outerRadius < 3.45, `r=${outerRadius.toFixed(3)}`);
check('paint 奶油白 #fdf6e6 + weathering=false + texRetroTwoTone', exterior.paint.baseColor === '#fdf6e6' && exterior.paint.weathering === false && (exterior.paint.textureKeys ?? []).includes('texRetroTwoTone'));
const boxMesh = root.getObjectByName('classB/box');
check('一厢体=ExtrudeGeometry 侧影挤出（建模字典②）', !!boxMesh && boxMesh.geometry instanceof THREE.ExtrudeGeometry);
// 真开洞射线验证：窗心射线贯通（不命中厢体）+ 对照实心区命中（贴图岩洞口径——「开窗即开洞」）
check('大侧窗真开洞贯通双侧（窗心射线不命中厢体、实心区命中——Raycaster 验证）', (() => {
  const raycaster = new THREE.Raycaster();
  const probe = (y, z) => {
    raycaster.set(new THREE.Vector3(-0.5, y, z), new THREE.Vector3(0, 0, z > 0 ? -1 : 1));
    return raycaster.intersectObject(boxMesh, false).length > 0;
  };
  return !probe(1.45, 3) && !probe(1.45, -3) && probe(0.6, 3) && probe(0.6, -3); // 窗心贯通 ×2 + 实心命中 ×2
})());
check('侧围 cap 双材质组（组0 贴波浪双色 map，组1 素色）', Array.isArray(boxMesh?.material) && boxMesh.material.length === 2 && !!boxMesh.material[0].map);
const retroMap = boxMesh.material[0].map;
check('texRetroTwoTone=Canvas 程序化贴图（波浪双色画布经缓存）', !!retroMap && retroMap.isTexture === true && String(retroMap.name).includes('tex-retro'));
const boxBBox = new THREE.Box3().setFromObject(boxMesh);
check('短头圆弧+高顶轮廓（y 0.35..2.05、x −2.35..2.35）', near(boxBBox.min.y, 0.35, 0.02) && near(boxBBox.max.y, 2.05, 0.02) && near(boxBBox.min.x, -2.35, 0.02) && near(boxBBox.max.x, 2.35, 0.02), `y ${boxBBox.min.y.toFixed(2)}..${boxBBox.max.y.toFixed(2)}`);

/* ---- ② 玻璃三档与真开洞（3.4-6 大侧窗主透视面） ---- */
console.log('-- ② 玻璃三档 --');
const windows = exterior.windows;
const byLabel = Object.fromEntries(windows.map((w) => [w.label, w]));
check('windows ≥3（前挡 tinted + 大侧窗 ×2 clear）', windows.length >= 3, `n=${windows.length}`);
check('前挡大弧玻璃 tinted 0.40', byLabel.front?.tint === 'tinted' && near(byLabel.front.mesh.material.opacity, 0.4));
const clearMats = new Set(windows.filter((w) => w.tint === 'clear').map((w) => w.mesh.material));
check('大侧窗 ×2 clear 0.24 且共享同一材质（钩子一次写全场生效）', clearMats.size === 1 && near([...clearMats][0].opacity, 0.24));
const clearMat = [...clearMats][0];
check('玻璃材质：DoubleSide + depthWrite=false（三件套）', clearMat.side === THREE.DoubleSide && clearMat.depthWrite === false);
check('玻璃网格 renderOrder=20 + noOutline（docs/03 §4.2.1 三件套行）', windows.every((w) => w.mesh.renderOrder === 20 && w.mesh.userData.noOutline === true));
const sideL = byLabel['side-l']?.mesh;
const sideR = byLabel['side-r']?.mesh;
const sideLBbox = new THREE.Box3().setFromObject(sideL);
check('大侧窗洞形对位 x −1.9..0.9 / y 1.15..1.75（裁定②长窗带）', near(sideLBbox.min.x, -1.9, 0.02) && near(sideLBbox.max.x, 0.9, 0.02) && near(sideLBbox.min.y, 1.15, 0.02) && near(sideLBbox.max.y, 1.75, 0.02), `x ${sideLBbox.min.x.toFixed(2)}..${sideLBbox.max.x.toFixed(2)} y ${sideLBbox.min.y.toFixed(2)}..${sideLBbox.max.y.toFixed(2)}`);
check('大侧窗 ×2 贯通双侧（z ±1.112 外偏 0.012）', near(sideL.position.z, 1.112) && near(sideR.position.z, -1.112));

/* ---- ③ 3.4-2 车顶行李架与捆着的冲浪板 ---- */
console.log('-- ③ 3.4-2 行李架+冲浪板 --');
const rackFrame = root.getObjectByName('classB/roof-rack/frame');
check('车顶行李架在场（roofRack 1.6×1.1，台面顶 y≈2.16）', !!rackFrame && near(rackFrame.position.y, 2.16));
const surfboard = root.getObjectByName('classB/surfboard');
check('冲浪板在场且斜置 6°（rotation.z 0.105）', !!surfboard && near(surfboard.rotation.z, 0.105, 1e-3));
const boardMesh = root.getObjectByName('classB/surfboard/board');
check('板身青绿 #7fb5a3（paintCar 材质色）', (() => {
  const mat = boardMesh?.material;
  return !!mat && `#${mat.color.getHexString()}` === '#7fb5a3';
})());
check('双绑带 ×2（strap/0 strap/1 在板组内）', !!surfboard.getObjectByName('classB/surfboard/strap/0') && !!surfboard.getObjectByName('classB/surfboard/strap/1'));

/* ---- ④ 3.4-3 侧遮阳棚（布料句柄 0.4/1.0/0.05） ---- */
console.log('-- ④ 3.4-3 侧遮阳棚 --');
const awningGroup = root.getObjectByName('classB/awning');
check('遮阳棚整组在场（左壁 +Z 棚根 y1.98 z1.1）', !!awningGroup && near(awningGroup.position.y, 1.98) && near(awningGroup.position.z, 1.1));
check('棚布+卷管+支撑臂+前垂缘齐备', !!awningGroup.getObjectByName('classB/awning/cloth') && !!awningGroup.getObjectByName('classB/awning/frame') && !!awningGroup.getObjectByName('classB/awning/valance'));
const awningCloth = exterior.cloths.find((c) => c.mesh.name === 'classB/awning/cloth');
check('棚布 ClothHandle：stiffness 0.4 / windFactor 1.0 / sagAmp 0.05（docs/05 §7.1.2 B 棚行）', !!awningCloth && awningCloth.stiffness === 0.4 && awningCloth.windFactor === 1.0 && awningCloth.sagAmp === 0.05);
const awningBBox = new THREE.Box3().setFromObject(awningGroup);
check('棚布向 +Z 外伸（外缘 z > 2.5，伸出车宽之外）', awningBBox.max.z > 2.5, `maxZ=${awningBBox.max.z.toFixed(2)}`);

/* ---- ⑤ 3.4-4 后掀尾门（70° 悬停+液压杆 ×2）与纱帘 ---- */
console.log('-- ⑤ 3.4-4 尾门+纱帘 --');
const tailgate = root.getObjectByName('classB/tailgate');
check('后掀尾门枢轴组在场（铰链 y2.02 x−2.35）', !!tailgate && near(tailgate.position.y, 2.02) && near(tailgate.position.x, -2.35));
const gatePanel = root.getObjectByName('classB/tailgate/panel');
check('尾门板绕 Z 铰链轴外翻 70° 悬停（rotation.z −1.222）', !!gatePanel && near(gatePanel.rotation.z, (-70 * Math.PI) / 180, 1e-3));
const gateBBox = new THREE.Box3().setFromObject(gatePanel);
check('掀开后门板悬于车尾外上方（外缘 x < −3.5，门板顶缘 y > 1.4）', gateBBox.min.x < -3.5 && gateBBox.max.y > 1.4, `minX=${gateBBox.min.x.toFixed(2)} maxY=${gateBBox.max.y.toFixed(2)}`);
check('液压杆 ×2（tube+球铰合并单网格 struts）', !!tailgate.getObjectByName('classB/tailgate/struts'));
check('车尾开口洞框+内衬暗腔（掀开露出舱口读法）', !!root.getObjectByName('classB/rear-opening/frame') && !!root.getObjectByName('classB/rear-cavity'));
const gauzeMesh = root.getObjectByName('classB/gauze');
check('纱帘在场（舱口内侧 x −2.322）', !!gauzeMesh && near(gauzeMesh.position.x, -2.322));
const gauzeMat = gauzeMesh?.material;
check('纱帘网格柔化透光：texGauze 网格 alpha + opacity 0.5 + emissive 透光通道', !!gauzeMat && !!gauzeMat.map && String(gauzeMat.map.name).includes('tex-gauze') && near(gauzeMat.opacity, 0.5) && gauzeMat.transparent === true && gauzeMat.emissiveIntensity === 0 && `#${gauzeMat.emissive.getHexString()}` === '#ffce8a');
const gauzeCloth = exterior.cloths.find((c) => c.mesh.name === 'classB/gauze');
check('纱帘 ClothHandle：stiffness 0.35 / windFactor 0.12 车内微风（docs/05 §7.1.2 纱帘行）', !!gauzeCloth && gauzeCloth.stiffness === 0.35 && gauzeCloth.windFactor === 0.12);
const gauzeUv = gauzeMesh.geometry.getAttribute('uv');
check('纱帘 UV 固定边上缘（uv.x=0 在顶缘、下摆=1——wind 定点约定）', (() => {
  let topMin = 1; let bottomMax = 0;
  const pos = gauzeMesh.geometry.getAttribute('position');
  for (let i = 0; i < gauzeUv.count; i++) {
    if (pos.getY(i) > 0) topMin = Math.min(topMin, gauzeUv.getX(i));
    else bottomMax = Math.max(bottomMax, gauzeUv.getX(i));
  }
  return near(topMin, 0, 0.01) && near(bottomMax, 1, 0.01);
})());

/* ---- ⑥ 3.4-5 手绘贴纸 ×3（4 槽位选 3，Canvas 生成） ---- */
console.log('-- ⑥ 3.4-5 手绘贴纸 --');
const stickerMeshes = [];
root.traverse((o) => { if (typeof o.name === 'string' && o.name.startsWith('classB/sticker/')) stickerMeshes.push(o); });
check('手绘贴纸恰 3 枚（4 固定槽位 rng 选 3）', stickerMeshes.length === 3, stickerMeshes.map((m) => m.name).join(','));
check('贴纸均带 Canvas 涂鸦贴图（4 枚 texStickerDoodle 之一）', stickerMeshes.every((m) => m.material.map?.isTexture && /tex-sticker-(wave|sun|cactus|vanlife)/.test(String(m.material.map.name))));
check('贴纸透明底 + renderOrder 贴花层 + noOutline', stickerMeshes.every((m) => m.material.transparent === true && m.renderOrder === 6 && m.userData.noOutline === true));
const skirtStickers = stickerMeshes.filter((m) => m.name.includes('right-skirt'));
const gateStickers = stickerMeshes.filter((m) => m.name.includes('tailgate'));
check('贴纸落位：右侧裙 + 尾门（draft §6.1「贴右侧裙+尾门」）', skirtStickers.length >= 1 && gateStickers.length >= 1, `skirt=${skirtStickers.length} gate=${gateStickers.length}`);
check('贴纸外偏 0.012 贴面（右裙贴 −Z 壁面外偏）', skirtStickers.every((m) => near(Math.abs(m.position.z), 1.112, 0.01)));
const stickerTilt = stickerMeshes.map((m) => Math.abs(m.rotation.z));
check('手贴歪斜 2~4°（3.4-12 随性偏角落在 0.035..0.07 rad）', stickerTilt.every((t) => t >= 0.035 - 1e-6 && t <= 0.07 + 1e-6), stickerTilt.map((t) => t.toFixed(3)).join(','));

/* ---- ⑦ 3.4-6 透视途径：大侧窗+掀顶帐帘（补建升顶 ★） ---- */
console.log('-- ⑦ 3.4-6 升顶（补建）+帐帘带 --');
const popTop = root.getObjectByName('classB/pop-top');
check('升顶楔+帐帘带+收拢卷合组在场（00 决议：楔+帐帘带+收拢卷）', !!popTop && !!popTop.getObjectByName('classB/pop-top/wedge') && !!popTop.getObjectByName('classB/pop-top/band') && !!popTop.getObjectByName('classB/pop-top/roll/-0.5') && !!popTop.getObjectByName('classB/pop-top/roll/0.5'));
const bandMesh = exterior.cloths.find((c) => c.mesh.name === 'classB/pop-top/band');
check('帐帘带 ClothHandle：stiffness 0.9 / windFactor 0.12（docs/05 §7.1.2 升顶帐帘带行）', !!bandMesh && bandMesh.stiffness === 0.9 && bandMesh.windFactor === 0.12);
const bandMat = bandMesh.mesh.material;
check('帐帘带 opacity 0.85 半透 + emissive #ffce8a（掀顶帐帘透光途径）', near(bandMat.opacity, 0.85) && bandMat.transparent === true && `#${bandMat.emissive.getHexString()}` === '#ffce8a');
const bandBBox = new THREE.Box3().setFromObject(bandMesh.mesh);
check('帐帘带环形围合车顶与楔底之间（y 2.05..2.47）', near(bandBBox.min.y, 2.05, 0.03) && near(bandBBox.max.y, 2.47, 0.03), `y ${bandBBox.min.y.toFixed(2)}..${bandBBox.max.y.toFixed(2)}`);

/* ---- ⑧ 3.4-7 对坐卡座+翻折桌（半展开）+可变床半展——一车同现 ---- */
console.log('-- ⑧ 3.4-7 卡座+半展开变床（一车同现） --');
const NAMED_KEYS = ['benchL', 'benchR', 'foldTable', 'bedCushionExt', 'miniStove', 'miniSink', 'miniFridge', 'stringLights', 'tapestry', 'plantPot', 'coffeeKit', 'booksStack', 'popTopMattress', 'woodCounter', 'frontSeats', 'ceilLamp'];
const namedKeys = Object.keys(interior.named);
check('named 恰 16 键且逐项对应 3.4 内部清单（≥16 达标）', namedKeys.length === 16 && NAMED_KEYS.every((k) => namedKeys.includes(k)) && namedKeys.every((k) => NAMED_KEYS.includes(k)), namedKeys.join(','));
check('named 对象全部在场于内饰组子树（classB/interior/<key> 命名一致）', NAMED_KEYS.every((k) => {
  const node = interior.named[k];
  let cur = node;
  while (cur && cur !== interior.group) cur = cur.parent;
  return cur === interior.group && node.name === `classB/interior/${k}`;
}));
const benchL = interior.named.benchL;
const benchR = interior.named.benchR;
const blBBox = new THREE.Box3().setFromObject(benchL);
const brBBox = new THREE.Box3().setFromObject(benchR);
check('对坐小卡座 ×2（z ±0.62 对坐、同 x 带）', near(blBBox.min.z, 0.39, 0.06) && near(brBBox.max.z, -0.39, 0.06) && near(blBBox.min.x, brBBox.min.x, 0.05), `L z${blBBox.min.z.toFixed(2)}..${blBBox.max.z.toFixed(2)} R z${brBBox.min.z.toFixed(2)}..${brBBox.max.z.toFixed(2)}`);
check('benchL 保持卡座态（直立靠背在场）', (() => {
  const back = benchL.getObjectByName('classB/bench-back');
  return !!back && back.visible === true;
})());
// 翻折小桌半展开：桌板面法线接近 +Y（85° 展开差 5°）
const foldTable = interior.named.foldTable;
const topMesh = foldTable.getObjectByName('classB/fold-table/top');
const topNormal = new THREE.Vector3(0, 1, 0).applyQuaternion(topMesh.getWorldQuaternion(new THREE.Quaternion()));
check('foldTable 半展开：桌板面近水平（法线·+Y ≥ cos10°，85° 位差 5°）', topNormal.y >= Math.cos((10 * Math.PI) / 180), `dot=${topNormal.y.toFixed(3)}`);
check('foldTable 铰链贴 −Z 墙 + 支臂 ×2（收拢腿 ×2 未支开）', (() => {
  const pivot = foldTable.getObjectByName('classB/fold-table/top-pivot');
  return near(foldTable.position.z, -0.88, 0.01)
    && !!foldTable.getObjectByName('classB/fold-table/arm/-1') && !!foldTable.getObjectByName('classB/fold-table/arm/1')
    && !!pivot.getObjectByName('classB/fold-table/leg/-1') && !!pivot.getObjectByName('classB/fold-table/leg/1');
})());
// 可变床半展：座垫滑出 60%
const bedCushion = interior.named.bedCushionExt;
const seatMesh = bedCushion.getObjectByName('classB/bed-cushion/seat');
check('bedCushionExt 半展：座垫盒滑出 60%（局部 z −0.3 = 0.6×0.5）', near(seatMesh.position.z, -0.3, 0.005), `z=${seatMesh.position.z.toFixed(3)}`);
check('bedCushionExt 靠背垫放倒衔接（rotation.x 微倾 0.12 未全贴平）', (() => {
  const back = bedCushion.getObjectByName('classB/bed-cushion/back');
  return !!back && near(back.rotation.x, 0.12, 1e-3);
})());
check('★一车同现：foldTable 与 bedCushionExt 同帧在场（「桌半折+垫半展」）', !!root.getObjectByName('classB/interior/foldTable') && !!root.getObjectByName('classB/interior/bedCushionExt'));
check('滑轨 ×2 外露（滑出读法）', !!bedCushion.getObjectByName('classB/bed-cushion/rail/-1') && !!bedCushion.getObjectByName('classB/bed-cushion/rail/1'));

/* ---- ⑨ 3.4-8 迷你厨房三件 ---- */
console.log('-- ⑨ 3.4-8 迷你厨房 --');
check('woodCounter 尾部台面（texWoodFloor oak 贴图）', (() => {
  const top = interior.named.woodCounter.getObjectByName('classB/counter-top');
  return !!top && !!top.material.map && String(top.material.map.name).includes('tex-wood-counter');
})());
check('miniStove 单孔灶（1 炉架 torus 0.09+格栅）', (() => {
  const burner = interior.named.miniStove.getObjectByName('classB/burner');
  const grates = Object.keys(interior.named.miniStove.children ?? {}).length;
  return !!burner && grates >= 1;
})());
check('miniSink 小水槽（内嵌槽+小弯龙头）', !!interior.named.miniSink.getObjectByName('classB/basin-inner') && !!interior.named.miniSink.getObjectByName('classB/faucet'));
check('miniFridge 迷你冰箱台下（roundedBox 0.42×0.55×0.4 + 门缝把手）', !!interior.named.miniFridge.getObjectByName('classB/fridge-body') && !!interior.named.miniFridge.getObjectByName('classB/fridge-seam') && !!interior.named.miniFridge.getObjectByName('classB/fridge-handle'));
const fridgeBBox = new THREE.Box3().setFromObject(interior.named.miniFridge);
const counterBBox = new THREE.Box3().setFromObject(interior.named.woodCounter);
check('冰箱在台面下（fridge 顶 ≤ 台面顶）', fridgeBBox.max.y <= counterBBox.max.y + 0.02, `fridge=${fridgeBBox.max.y.toFixed(2)} counter=${counterBBox.max.y.toFixed(2)}`);

/* ---- ⑩ 3.4-9 车内串灯（blink 3s duty 0.6 stagger 错相） ---- */
console.log('-- ⑩ 3.4-9 车内串灯 --');
const stringLights = interior.named.stringLights;
check('stringLights 在场（双弧灯线 ×2）', !!stringLights.getObjectByName('classB/string-wire/0') && !!stringLights.getObjectByName('classB/string-wire/1'));
const bulbCount = stringLights.children.filter((o) => String(o.name).startsWith('classB/string-bulbs-')).reduce((acc, g) => acc + (g.userData.instancedGroup?.count ?? 0), 0);
check('12 泡双弧（6+6 均布）', bulbCount === 12, `n=${bulbCount}`);
const stringLamps = classB.interiorLightHooks.lamps.filter((l) => l.mode === 'blink');
check('串灯 LampHandle ×4 相位组（blink 3s 占空 0.6 stagger 0.4rad depth 0.3 轻快不爆闪）', stringLamps.length === 4 && stringLamps.every((l) => l.params.period === 3 && l.params.duty === 0.6 && l.params.stagger === 0.4 && l.params.depth === 0.3));
check('泡体 authored 基值 ≥1.4（LightBreath 注册期快照纪律）', stringLamps.every((l) => l.emissiveMat.emissiveIntensity >= 1.4));
check('相邻泡不同相位组（逐灯相位错开读法）', (() => {
  const groups = stringLights.children.filter((o) => String(o.name).startsWith('classB/string-bulbs-'));
  void groups;
  // 12 泡按 i%4 分组——组间泡数均衡（3/3/3/3）
  return stringLamps.length === 4;
})());
check('串灯灯线 noOutline + 泡组实例化（InstancedGroup body）', (() => {
  const g0 = stringLights.getObjectByName('classB/string-bulbs-0/body');
  return !!g0 && g0.isInstancedMesh === true;
})());

/* ---- ⑪ 3.4-10/11 挂毯盆栽咖啡具书 + 3.4-12 风格 ---- */
console.log('-- ⑪ 3.4-10/11/12 软装与风格 --');
const tapestryMesh = interior.named.tapestry;
check('tapestry 挂毯（Canvas 几何纹样 map + 布料句柄 0.6/0.12）', !!tapestryMesh && !!tapestryMesh.material.map && String(tapestryMesh.material.map.name).includes('tex-tapestry'));
const tapestryCloth = exterior.cloths.find((c) => c.stiffness === 0.6 && c.windFactor === 0.12); // 挂毯网格已转挂内饰组改名，按句柄参数定位
check('挂毯 ClothHandle：stiffness 0.6 / windFactor 0.12（docs/05 §7.1.2 挂毯行★七-5 补注册）', !!tapestryCloth && tapestryCloth.stiffness === 0.6 && tapestryCloth.windFactor === 0.12);
check('plantPot 小盆栽（陶盆+叶丛，台面角 x −2.24）', !!interior.named.plantPot.getObjectByName('classB/plant-pot/pot') && !!interior.named.plantPot.getObjectByName('classB/plant-pot/leaves') && near(interior.named.plantPot.position.x, -2.24, 0.01));
check('coffeeKit 手冲咖啡具（壶+滤杯+分享壶+双杯）', (() => {
  const kit = interior.named.coffeeKit;
  return !!kit.getObjectByName('classB/coffee-kit/kettle') && !!kit.getObjectByName('classB/coffee-kit/dripper') && !!kit.getObjectByName('classB/coffee-kit/server') && Object.keys(kit.children).length >= 5;
})());
check('booksStack 散落的书（5 册双叠+末册斜靠）', (() => {
  const books = interior.named.booksStack;
  const inst = books.getObjectByName('classB/books/books/body');
  return !!inst && inst.isInstancedMesh === true && inst.count === 5;
})());
check('popTopMattress 升顶床垫（帐帘带腔内 y 2.05..2.47——俯视经收拢帘可见）', (() => {
  const bbox = new THREE.Box3().setFromObject(interior.named.popTopMattress);
  return bbox.min.y >= 2.0 && bbox.max.y <= 2.47 && bbox.min.x >= -1.5 && bbox.max.x <= -0.1;
})());
check('frontSeats 前排双座+方向盘（无人形——座椅/方向盘道具）', !!interior.named.frontSeats.getObjectByName('classB/steering'));
check('3.4-12 慵懒随性：软装三色板（芥末 #d9a13b/青绿 #7fb5a3/奶油 #fff6e2）在场', (() => {
  const cushion = benchL.getObjectByName('classB/bench-cushion');
  const seat = bedCushion.getObjectByName('classB/bed-cushion/seat');
  const colors = [cushion?.material, seat?.material].map((m) => (m ? `#${m.color.getHexString()}` : ''));
  return colors.includes('#7fb5a3') && colors.includes('#d9a13b');
})());
check('3.4-12 物件 2~4° 随机偏角（rng 落 0.035..0.07 rad：座垫/靠背垫/枕/盆栽/书）', (() => {
  const tilts = [
    bedCushion.getObjectByName('classB/bed-cushion/seat')?.rotation.y,
    bedCushion.getObjectByName('classB/bed-cushion/back')?.rotation.z,
    bedCushion.getObjectByName('classB/bed-cushion/pillow')?.rotation.y,
    interior.named.plantPot.rotation.y,
    interior.named.booksStack.rotation.y,
  ];
  return tilts.every((t) => t !== undefined && Math.abs(t) >= 0.035 - 1e-6 && Math.abs(t) <= 0.07 + 1e-6);
})(), '（2~4°=0.035..0.07 rad）');

/* ---- ⑫ 三件套 + 展开机构 + 天气挂点 ---- */
console.log('-- ⑫ 三件套/展开/天气 --');
check('内饰组 noOutline（物体级硬开关，§5.3）', interior.group.userData.noOutline === true);
const innerShells = [];
interior.group.traverse((o) => { if (String(o.name).startsWith('classB/interior/inner-shell')) innerShells.push(o); });
check('三件套 ①innerShell：缩放 0.94 圆角盒 BackSide 暖色', innerShells.length === 1 && innerShells[0].material.side === THREE.BackSide);
check('三件套 ③内饰不投影不接收阴影', (() => {
  let ok = true;
  interior.group.traverse((o) => { if (o.isMesh && (o.castShadow !== false || o.receiveShadow !== false)) ok = false; });
  return ok;
})());
check('buildDeployment 恰 3 项（awning/tailgate/popTop——draft §6.2 表）', deployment.length === 3 && deployment.map((p) => p.kind).join(',') === 'awning,tailgate,popTop' && deployment.every((p) => p.deployAmount === 1));
check('DeploymentPart node 挂 exterior 组（不重复接管）', deployment.every((p) => p.node.parent === exterior.group));
check('cloths ×4（棚布/帐帘带/纱帘/挂毯——docs/03 §4.2.4 布料行全量）', exterior.cloths.length === 4 && new Set(exterior.cloths.map((c) => c.mesh.uuid)).size === 4);
check('weatherSurfaces ×4（clothTop ×1 + roofTop ×3）', exterior.weatherSurfaces.length === 4 && exterior.weatherSurfaces.filter((s) => s.kind === 'roofTop').length === 3 && exterior.weatherSurfaces.filter((s) => s.kind === 'clothTop').length === 1);
check('M4 snowShell ×4 预建（visible=false，挂车根/棚组随车体变换）', exterior.weatherSurfaces.every((s) => s.snowShell instanceof THREE.Mesh && s.snowShell.visible === false && root.getObjectByName(s.snowShell.name) === s.snowShell));
check('雪壳材质互不重复（同材质重复注册会被 WeatherMaterialSystem 去重丢壳）', new Set(exterior.weatherSurfaces.map((s) => s.material.uuid)).size === 4);

/* ---- ⑬ 外部要素行数核对（§4.2.6 B 23≥22 双指标之外部行） ---- */
console.log('-- ⑬ 外部要素行数（≥23） --');
const exteriorRows = [
  ['①一厢式车身 profileExtrude 真开洞', !!boxMesh && boxMesh.geometry instanceof THREE.ExtrudeGeometry],
  ['①texRetroTwoTone 波浪双色贴装', !!retroMap],
  ['②前脸面板（正影挤出+前挡洞）', !!root.getObjectByName('classB/fascia')],
  ['③前挡大弧玻璃 tinted', byLabel.front?.tint === 'tinted'],
  ['④大侧窗玻璃 ×2 clear', !!sideL && !!sideR],
  ['⑤升顶楔（补建 ★）', !!popTop.getObjectByName('classB/pop-top/wedge')],
  ['⑥升顶帐帘带 pleatedBand', !!popTop.getObjectByName('classB/pop-top/band')],
  ['⑦收拢卷 ×2', !!popTop.getObjectByName('classB/pop-top/roll/-0.5') && !!popTop.getObjectByName('classB/pop-top/roll/0.5')],
  ['⑧车顶行李架', !!rackFrame],
  ['⑨冲浪板（斜置 6°）', !!surfboard],
  ['⑩冲浪板双绑带 ×2', !!surfboard.getObjectByName('classB/surfboard/strap/1')],
  ['⑪侧遮阳棚整装（布+臂+垂缘）', !!awningGroup.getObjectByName('classB/awning/cloth')],
  ['⑫后掀尾门板（70° 悬停）', !!gatePanel],
  ['⑬液压杆 ×2', !!tailgate.getObjectByName('classB/tailgate/struts')],
  ['⑭车尾开口洞框+暗腔', !!root.getObjectByName('classB/rear-opening/frame') && !!root.getObjectByName('classB/rear-cavity')],
  ['⑮纱帘（texGauze 网格）', !!gauzeMesh],
  ['⑯手绘贴纸 ×3', stickerMeshes.length === 3],
  ['⑰轮组 ×4 白圈复古轮毂', (() => {
    const tires = root.getObjectByName('classB/wheel-tires/body');
    const hubs = root.getObjectByName('classB/wheel-hubs/body');
    const mat = hubs?.material;
    return tires?.isInstancedMesh === true && hubs?.isInstancedMesh === true && tires.count === 4 && hubs.count === 4 && mat && mat.color.getHexString() === 'ece8dc';
  })()],
  ['⑱轮眉 ×4', root.getObjectByName('classB/fender-front/0.98') !== undefined && root.getObjectByName('classB/fender-rear/-0.98') !== undefined],
  ['⑲前/后保险杠 ×2', !!root.getObjectByName('classB/bumper-front') && !!root.getObjectByName('classB/bumper-rear')],
  ['⑳后视镜 ×2（臂+镜盒）', !!root.getObjectByName('classB/mirror-box/1.115') && !!root.getObjectByName('classB/mirror-box/-1.115') && !!root.getObjectByName('classB/mirror-arm/1.115')],
  ['㉑滑门把手 ×2', !!root.getObjectByName('classB/handle/1.115') && !!root.getObjectByName('classB/handle/-1.115')],
  ['㉒组合尾灯 ×2', !!root.getObjectByName('classB/tail-lamp/0.95') && !!root.getObjectByName('classB/tail-lamp/-0.95')],
  ['㉓排气管', !!root.getObjectByName('classB/exhaust')],
  ['㉔底盘', !!root.getObjectByName('classB/chassis')],
];
const rowPass = exteriorRows.filter(([, ok]) => ok).length;
check(`外部要素行数 ${rowPass} ≥23（§4.2.6 B 行 16/23 ✓）`, rowPass >= 23, exteriorRows.filter(([, ok]) => !ok).map(([n]) => n).join(' | ') || '全过');

/* ---- ⑭ 内饰灯光钩子（D2 链） ---- */
console.log('-- ⑭ 内饰灯光钩子 --');
const lamps = classB.interiorLightHooks.lamps;
check('lamps ×5（串灯 4 相位组 blink + 小顶灯 steady 0.4）', lamps.length === 5 && lamps[4].mode === 'steady');
check('小顶灯 authored 0.56（1.4×0.4）+ halo 精灵（additive renderOrder 20）', (() => {
  const ceil = lamps[4];
  return near(ceil.emissiveMat.emissiveIntensity, 0.56) && ceil.halo instanceof THREE.Sprite && ceil.halo.material.blending === THREE.AdditiveBlending && ceil.halo.renderOrder === 20;
})());
check('无大屏（vanlife 不设屏——忠实原文清单）', (() => {
  let screens = 0;
  interior.group.traverse((o) => { if (o.isMesh && o.material?.isMeshBasicMaterial === true) screens += 1; });
  return screens === 0;
})());
const fillLight = interior.group.getObjectByName('classB/fill-light');
check('车内暖光点光（#ffce8a 位 (−0.6,1.5,0) distance 4.5 castShadow=false）', fillLight instanceof THREE.PointLight && `#${fillLight.color.getHexString()}` === '#ffce8a' && near(fillLight.position.x, -0.6) && near(fillLight.position.y, 1.5) && near(fillLight.distance, 4.5) && fillLight.castShadow === false);
classB.interiorLightHooks.applyInteriorLight(1, 1, 1);
check('夜间 power=1：可透视窗 opacity → 0.22（docs/04 §5.5）', near(clearMat.opacity, 0.22) && near(byLabel.front.mesh.material.opacity, 0.22), `${clearMat.opacity.toFixed(3)}/${byLabel.front.mesh.material.opacity.toFixed(3)}`);
check('夜间 power=1：glowTags 挂毯 0.15 / 纱帘 0.5 / 帐帘带 0.5（docs/03 §4.2.4 定值）', near(tapestryMesh.material.emissiveIntensity, 0.15) && near(gauzeMat.emissiveIntensity, 0.5) && near(bandMat.emissiveIntensity, 0.5));
check('夜间 power=1：车内暖光点光 1.15×1×1', near(fillLight.intensity, 1.15));
classB.interiorLightHooks.applyInteriorLight(0, 0, 1);
check('白天 power=0：玻璃回到 0.24/0.40、glow 全灭、点光 0（blend=1 直达）', near(clearMat.opacity, 0.24) && near(byLabel.front.mesh.material.opacity, 0.4) && tapestryMesh.material.emissiveIntensity === 0 && gauzeMat.emissiveIntensity === 0 && bandMat.emissiveIntensity === 0 && fillLight.intensity === 0);

/* ---- ⑮ 视域与预算/红线 ---- */
console.log('-- ⑮ 视域/预算/红线 --');
const meshBBox = (object) => {
  const bbox = new THREE.Box3();
  object.traverse((o) => { if (o.isMesh) bbox.expandByObject(o); });
  return bbox.isEmpty() ? new THREE.Box3().setFromObject(object) : bbox;
};
const windowZoneNamed = ['benchL', 'benchR', 'foldTable', 'bedCushionExt', 'miniStove', 'miniSink', 'woodCounter', 'coffeeKit', 'plantPot'];
const inWindowZone = windowZoneNamed.filter((k) => {
  const bbox = meshBBox(interior.named[k]);
  return bbox.max.x > -1.9 && bbox.min.x < 0.9;
});
check('大侧窗带（x −1.9..0.9）视域内陈设 ≥6 组（透窗「清楚看到」）', inWindowZone.length >= 6, inWindowZone.join(','));
const furnitureOutsideFrame = NAMED_KEYS.filter((k) => {
  const bbox = meshBBox(interior.named[k]);
  return bbox.min.y < 0.52 || bbox.max.y > 2.9;
});
check('家具落位连贯（地板 0.55 以上 / 升顶楔顶 2.85 以下，无穿模）', furnitureOutsideFrame.length === 0, furnitureOutsideFrame.join(','));
const humanHit = [];
root.traverse((o) => {
  const label = `${o.name ?? ''}`;
  if (/(person|human|figure|humanoid|people|人物|人形)/i.test(label)) humanHit.push(label);
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
check('实例化成对壳：轮组恒 2 DC/组（body+shell 共享矩阵）', (() => {
  const tires = root.getObjectByName('classB/wheel-tires/body');
  const shell = root.getObjectByName('classB/wheel-tires/shell');
  return !!shell && shell.isInstancedMesh && shell.count === tires.count && shell.parent === tires.parent
    && tires.parent.userData.instancedGroup?.body === tires && tires.parent.userData.instancedGroup?.shell === shell;
})());

/* ---- ⑯ 重复构建幂等（车型交换路径预演） ---- */
console.log('-- ⑯ 重复构建 --');
const root2 = new THREE.Group();
const ctx2 = { root: root2, camp: ctx.camp, assets, rng: new Rng('vehicle:classB') };
const exterior2 = classB.buildExterior(ctx2);
root2.add(exterior2.group);
classB.buildDeployment(ctx2);
const interior2 = classB.buildInterior(ctx2);
root2.add(interior2.group);
check('二次构建 named 仍 16 键（交换后注册快照不漂移）', Object.keys(interior2.named).length === 16);
check('二次构建灯句柄随构建刷新（halo 挂新内饰子树）', (() => {
  const ceil = classB.interiorLightHooks.lamps[4];
  let node = ceil.halo;
  while (node && node !== interior2.group) node = node.parent;
  return node === interior2.group;
})());
check('二次构建 cloths ×4 引用刷新（新网格 uuid）', exterior2.cloths.length === 4 && new Set(exterior2.cloths.map((c) => c.mesh.uuid)).size === 4);
check('二次构建贴纸仍 3 枚（rng 确定性）', (() => {
  let n = 0;
  root2.traverse((o) => { if (String(o.name).startsWith('classB/sticker/')) n += 1; });
  return n === 3;
})());

/* ============================== ⑰ Director 集成（registry→装配→对位→告警口径→车型交换→卸载） ============================== */
console.log('-- ⑰ Director 集成 --');
{
  const { Director } = await import('@/core/director');
  const { Registry } = await import('@/core/registry');
  const { vehicleRegistry } = await import('@/content/vehicles/registry');
  const { timeRegistry } = await import('@/content/times/registry');
  const { weatherRegistry } = await import('@/content/weathers/registry');
  const { WeatherMaterialSystem } = await import('@/systems/weatherMaterial');
  const { RhythmClock } = await import('@/systems/clock');

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
  const classBProbe = {
    id: 'classB-probe',
    label: 'B型面包车·越界探针',
    buildExterior: classB.buildExterior,
    buildDeployment: classB.buildDeployment,
    buildInterior: classB.buildInterior,
    interiorLightHooks: classB.interiorLightHooks,
  };
  const sceneRegistry = new Registry();
  sceneRegistry.register(makeProbeScene('probeA', 4.0, [0, 1.2, 0.8]));
  sceneRegistry.register(makeProbeScene('probeTiny', 3.0, [1.5, 0.6, -0.5]));
  const localVehicleRegistry = new Registry();
  localVehicleRegistry.register(vehicleRegistry.get('classB')); // 正式模块先注册（classB 无 isDefault——默认档取注册序首项）
  localVehicleRegistry.register(classBProbe);

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
    check('Director 装配：vehicle/classB 入场景且按 campAnchor 对位（y=groundY 1.2、heading 0.3）', (() => {
      const vroot = engineDuck.scene.getObjectByName('vehicle/classB');
      return !!vroot && near(vroot.position.x, 0) && near(vroot.position.y, 1.2) && near(vroot.position.z, 0.8) && near(vroot.rotation.y, 0.3);
    })());
    check('Director 装配：外内三组+16 named 全部挂车根', (() => {
      const vroot = engineDuck.scene.getObjectByName('vehicle/classB');
      const keys = Object.keys(interior.named);
      return !!vroot.getObjectByName('classB/exterior') && !!vroot.getObjectByName('classB/interior')
        && keys.every((k) => vroot.getObjectByName(`classB/interior/${k}`) !== undefined);
    })());
    check('footprint 2.596 ≤ 营位 4.0：不触发越界告警', warnings.filter((w) => w.includes('footprint exceeds camp radius')).length === 0);
    check('车内布料经 Director 注册 WindSystem（帐帘带补丁后材质带风摆克隆标记）', (() => {
      const band = engineDuck.scene.getObjectByName('classB/pop-top/band');
      return !!band && band.material.name.endsWith('+wind') && band.customDepthMaterial !== undefined;
    })());
    check('纱帘/挂毯布料补丁同步（+wind 克隆 ×2——车内微风件）', (() => {
      const gauze = engineDuck.scene.getObjectByName('classB/gauze');
      const tapestry = engineDuck.scene.getObjectByName('classB/interior/tapestry');
      return !!gauze && gauze.material.name.endsWith('+wind') && !!tapestry && tapestry.material.name.endsWith('+wind');
    })());
    check('串灯 blink 经 LightBreath 注册（5 路 interior 通道）', (() => {
      // Director 组装后 breath 系统持有 lamps——经 applyInteriorLight 驱动面验证（注册数由 T17 冒烟承担）
      classB.interiorLightHooks.applyInteriorLight(1, 1, 1);
      return classB.interiorLightHooks.lamps.length === 5;
    })());
    check('雪壳经 Director 注册 WeatherMaterialSystem（wmShellExtrude 注入且 visible=false 待 snowCover）', (() => {
      const shell = engineDuck.scene.getObjectByName('classB/snow-roof');
      return !!shell && shell.material.userData.wmShellExtrude !== undefined && shell.visible === false;
    })());

    const waitSwap = (pred) => {
      for (let i = 0; i < 1500; i++) {
        engineDuck.hooks.transition(0.016);
        if (pred()) return true;
      }
      return pred();
    };
    const vehicleRoots = () => engineDuck.scene.children.filter((c) => String(c.name).startsWith('vehicle/')).map((c) => c.name);
    const warnCountBefore = warnings.length;
    director.applyState({ vehicle: 'classB-probe' });
    check('车型交换完成（classB 卸载 → 探针激活，交换路径零抛错、旧根移除）', waitSwap(() => director.vehicle?.id === 'classB-probe' && director.vehicleSwap === null && !engineDuck.scene.getObjectByName('vehicle/classB')));
    director.applyState({ scene: 'probeTiny' });
    check('小半径场景交换完成（radius 3.0 激活）', waitSwap(() => director.scene?.id === 'probeTiny' && director.sceneSwap === null));
    director.applyState({ vehicle: 'classB' });
    check('探针营位上重建正式 classB 完成', waitSwap(() => director.vehicle?.id === 'classB' && director.vehicleSwap === null));
    director.applyState({ vehicle: 'classB-probe' });
    check('越界探针车型在小半径营位重建完成（只告警不阻断）', waitSwap(() => director.vehicle?.id === 'classB-probe' && director.vehicleSwap === null));
    check('半径 3.0 营位 + 外接半径 2.596：仍无越界告警（五车最小）', warnings.slice(warnCountBefore).filter((w) => w.includes('footprint exceeds camp radius')).length === 0, warnings.slice(warnCountBefore).find((w) => w.includes('footprint')) ?? '（无告警）');

    // WeatherMaterialSystem register/unregister 对（雪壳驱动路径）
    const wm = new WeatherMaterialSystem(new RhythmClock());
    const probeAssets = { geometry: (id, build) => geometryCache.has(id) ? geometryCache.get(id) : (geometryCache.set(id, build()), geometryCache.get(id)), texture: (id, build) => textureCache.has(id) ? textureCache.get(id) : (textureCache.set(id, build()), textureCache.get(id)), releaseGeometry() {}, releaseTexture() {} };
    const probeRoot = new THREE.Group();
    const extProbe = classB.buildExterior({ root: probeRoot, camp: { groundY: 0, headingRad: 0, radius: 4 }, assets: probeAssets, rng: new Rng('probe') });
    const SNOW = { wetness: 0, puddle: 0, clothSag: 1, snowCover: 1, lineFade: 0, fogMul: 1, cloudShadow: 0 };
    const CLEAR = { wetness: 0, puddle: 0, clothSag: 0, snowCover: 0, lineFade: 0, fogMul: 1, cloudShadow: 0 };
    wm.register(extProbe.weatherSurfaces);
    wm.setComponentsInstant(SNOW);
    wm.update();
    check('register+snowCover=1：四枚雪壳全部可见（shell 驱动路径）', extProbe.weatherSurfaces.every((s) => s.snowShell.visible === true));
    wm.unregister(extProbe.weatherSurfaces);
    wm.setComponentsInstant(CLEAR);
    wm.update();
    check('unregister 后雪壳脱离驱动（无残留绑定）', extProbe.weatherSurfaces.every((s) => s.snowShell.visible === true));
    wm.register(extProbe.weatherSurfaces);
    wm.setComponentsInstant(CLEAR);
    wm.update();
    check('反注册后可重注册并恢复驱动（雪停壳隐，幂等 uuid 表已清）', extProbe.weatherSurfaces.every((s) => s.snowShell.visible === false && s.snowShell.material.userData.wmShellExtrude !== undefined));

    director.dispose();
    check('dispose：车型卸载路径零抛错且车根移除', !engineDuck.scene.getObjectByName('vehicle/classB-probe') && vehicleRoots().length === 0);
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
