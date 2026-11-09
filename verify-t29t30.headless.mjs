// verify-t29t30.headless.mjs —— T29/T30 验收：timeRegistry 四档 / weatherRegistry 五档 与
// docs/05-时间天气动效.md §4.3.2（四档 GlobalLightParams 定值表 + 六语义通道表）/ §4.4.1（五档定值总表）
// 逐格数值比对（期望值逐格自文档转写，非自预设文件复制，保证独立核对）。
// 临时文件（同 temp-t15-t16-smoke.mjs 口径：验收后按清理流程处理，勿提交；只登记不删除）。
// 运行：node verify-t29t30.headless.mjs（2026-11-10 起自带钩子可直接运行；--import 外部钩子口保留兼容）
//   hook（把 '@/…' 解析到 <cwd>/src/…，Node 24 原生剥除 .ts 类型后直接执行真实源码；inline 钩子须用
//   同线程的 module.registerHooks()——异步版 module.register() 只收模块标识符、不收内联对象）：
//   import { registerHooks } from 'node:module';
//   import { pathToFileURL } from 'node:url';
//   registerHooks({
//     resolve(specifier, context, next) {
//       if (specifier.startsWith('@/')) {
//         let p = specifier.slice(2);
//         if (!/\.[cm]?[jt]sx?$/.test(p)) p += '.ts';
//         return next(pathToFileURL(process.cwd() + '/src/' + p).href, context);
//       }
//       return next(specifier, context);
//     },
//   });

// 复跑门槛修复（终审 ⑧）：内置此前仅存在于注释的 inline 钩子 + 静态 import 改动态（ESM 提升
// 语义下 static import 先于 registerHooks 解析，直跑必 ERR_MODULE_NOT_FOUND）——自此可直接
// `node verify-t29t30.headless.mjs`（原 --import 外部钩子口仍兼容）。
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('@/')) {
      let p = specifier.slice(2);
      if (!/\.[cm]?[jt]sx?$/.test(p)) p += '.ts';
      return next(pathToFileURL(process.cwd() + '/src/' + p).href, context);
    }
    if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL?.includes('/src/')
      && !/\.[cm]?[jt]sx?$/.test(specifier.split('/').pop() ?? '')) {
      const base = new URL(specifier, context.parentURL).href;
      return next(base + '.ts', context);
    }
    return next(specifier, context);
  },
});

const { timeRegistry } = await import('@/content/times/registry');
const { weatherRegistry } = await import('@/content/weathers/registry');

let failed = 0;
let passed = 0;
function check(name, cond, detail = '') {
  if (cond) {
    passed += 1;
    console.log(`PASS ${name}${detail ? ' —— ' + detail : ''}`);
  } else {
    failed += 1;
    console.error(`FAIL ${name}${detail ? ' —— ' + detail : ''}`);
  }
}
function eq(name, actual, expected) {
  const a = typeof actual === 'number' ? Number(actual) : actual;
  const e = typeof expected === 'number' ? Number(expected) : expected;
  const okNum = typeof a === 'number' && typeof e === 'number'
    ? Math.abs(a - e) <= 1e-9
    : a === e;
  check(`${name} = ${e}${typeof e === 'number' && !Number.isInteger(e) ? '' : ''}`, okNum, `实际 ${actual}`);
}

/* ========== §4.3.2 时间档期望值（逐格自文档转写） ========== */
// [id, label, 仰角°, 方位°, 主光色, 主光强度, hemiSky, hemiGround, hemi强度, zenith, horizon, skyExtra, fogBase, radius]
const DOC_TIME = [
  ['dawn', '清晨', 9, 78, '#A9CFE0', 0.85, '#7FA0BC', '#5E6B5A', 1.0, '#4E6E9E', '#EFC9A0', 'dawnBands', 0.18, 4.0],
  ['day', '白天', 62, 168, '#FFF4E0', 1.2, '#BFD9EC', '#8A9478', 1.0, '#3E86C8', '#CBE6F5', 'dayClouds', 0.02, 1.6],
  ['dusk', '黄昏', 11, 262, '#FFB35C', 1.05, '#7B87C4', '#6A5E58', 0.95, '#3C4E96', '#FF8E4F', 'duskBands', 0.06, 3.6],
  ['night', '夜间', 42, 210, '#93A9DC', 0.38, '#35426E', '#1E2438', 0.7, '#0C1531', '#26325C', 'nightStarsMoon', 0.05, 3.0],
];
// 六语义通道 [lampPower, emberPower, smokePower, shopPower, interiorPower, interiorEmphasis]
const DOC_CHANNELS = {
  dawn: [0.15, 0.5, 0.25, 0.35, 0.2, 0.2],
  day: [0, 0, 1.0, 1.0, 0, 0],
  dusk: [1.0, 1.0, 0.35, 0.65, 0.85, 0.7],
  night: [1.0, 1.0, 0.15, 1.0, 1.0, 1.0],
};
const CHANNEL_KEYS = ['lampPower', 'emberPower', 'smokePower', 'shopPower', 'interiorPower', 'interiorEmphasis'];

check('timeRegistry 登记 4 档且顺序 = dawn/day/dusk/night',
  JSON.stringify(timeRegistry.list().map((p) => p.id)) === '["dawn","day","dusk","night"]');
check('timeRegistry label = 清晨/白天/黄昏/夜间（docs/06 §六.3 短名约定）',
  JSON.stringify(timeRegistry.list().map((p) => p.label)) === '["清晨","白天","黄昏","夜间"]');
check('timeRegistry 默认档唯一且为 dusk',
  timeRegistry.list().filter((p) => p.isDefault).map((p) => p.id).join(',') === 'dusk');

for (const [id, label, elev, az, lc, li, as_, ag, ai, zen, hor, extra, fogB, radius] of DOC_TIME) {
  const p = timeRegistry.get(id);
  check(`${id} · ${label} 取档成功`, p.id === id && p.label === label);
  const L = p.lighting;
  // 主光源行：仰角/方位 → 反解自 lightDir（换算正确性即「逐格一致」的数值面）
  const d = L.lightDir;
  const len = d.length();
  const invElev = (Math.asin(d.y) * 180) / Math.PI;
  let invAz = (Math.atan2(d.x, -d.z) * 180) / Math.PI;
  if (invAz < 0) invAz += 360;
  check(`${id} lightDir 单位向量 |d|=1`, Math.abs(len - 1) <= 1e-9, `|d|=${len}`);
  check(`${id} 仰角 ${elev}°（反解 ${invElev.toFixed(4)}°）`, Math.abs(invElev - elev) <= 1e-6);
  check(`${id} 方位 ${az}°（反解 ${invAz.toFixed(4)}°）`, Math.abs(invAz - az) <= 1e-6,
    `${id} 主光源：仰角 ${elev}°/方位 ${az}° 换算一致`);
  eq(`${id} 主光色`, L.lightColor, lc);
  eq(`${id} 主光强度`, L.lightIntensity, li);
  eq(`${id} hemi 天空色`, L.ambientSky, as_);
  eq(`${id} hemi 地面色`, L.ambientGround, ag);
  eq(`${id} hemi 强度`, L.ambientIntensity, ai);
  eq(`${id} 天空 zenith`, L.zenith, zen);
  eq(`${id} 天空 horizon`, L.horizon, hor);
  eq(`${id} 额外天空元素`, L.skyExtra, extra);
  eq(`${id} fogBase（D6 入参）`, L.fogBase, fogB);
  eq(`${id} 阴影 radius（map 2048）`, L.shadowRadius, radius);
  eq(`${id} 阴影 bias（docs/04 定值）`, L.shadowBias, -0.0005);
  for (let i = 0; i < CHANNEL_KEYS.length; i++) {
    eq(`${id} 通道 ${CHANNEL_KEYS[i]}`, p.channels[CHANNEL_KEYS[i]], DOC_CHANNELS[id][i]);
  }
  eq(`${id} transitionMs（D5）`, p.transitionMs, 1500);
}
check('六语义通道键名与 TimePreset.channels 契约逐字一致',
  timeRegistry.list().every((p) => JSON.stringify(Object.keys(p.channels)) === JSON.stringify(CHANNEL_KEYS)));

/* ========== §4.4.1 天气档期望值（逐格自文档转写） ========== */
// [id, label, intensityMul, ambientMul, glowBoost, wetness, puddle, clothSag, snowCover, lineFade, fogMul, cloudShadow, windMul, 粒子数]
const DOC_WEATHER = [
  ['clear', '晴朗', 1.0, 1.0, 0, 0, 0, 0, 0, 0, 1.0, 0, 1.0, 0],
  ['cloudy', '多云', 0.82, 1.12, 0.15, 0, 0, 0, 0, 0, 1.15, 1.0, 1.3, 0],
  ['rain', '小雨', 0.62, 0.9, 0.35, 1.0, 1.0, 1.0, 0, 0, 1.35, 0.7, 1.45, 1],
  ['fog', '浓雾', 0.55, 1.05, 0.8, 0.15, 0.2, 0.1, 0, 0, 2.6, 0.5, 0.85, 0],
  ['snow', '降雪', 0.8, 1.1, 0.25, 0.1, 0.15, 0.35, 1.0, 1.0, 1.4, 0.6, 1.1, 1],
];
const MAT_KEYS = ['wetness', 'puddle', 'clothSag', 'snowCover', 'lineFade', 'fogMul', 'cloudShadow'];
const MOD_KEYS = ['intensityMul', 'ambientMul', 'glowBoost'];

check('weatherRegistry 登记 5 档且顺序 = clear/cloudy/rain/fog/snow',
  JSON.stringify(weatherRegistry.list().map((p) => p.id)) === '["clear","cloudy","rain","fog","snow"]');
check('weatherRegistry label = 晴朗/多云/小雨/浓雾/降雪（docs/06 §六.3 短名约定）',
  JSON.stringify(weatherRegistry.list().map((p) => p.label)) === '["晴朗","多云","小雨","浓雾","降雪"]');
check('weatherRegistry 默认档唯一且为 clear',
  weatherRegistry.list().filter((p) => p.isDefault).map((p) => p.id).join(',') === 'clear');

for (const [id, label, im, am, gb, wet, pud, sag, snowC, line, fogM, cs, wm, nParts] of DOC_WEATHER) {
  const p = weatherRegistry.get(id);
  check(`${id} · ${label} 取档成功`, p.id === id && p.label === label);
  for (let i = 0; i < MOD_KEYS.length; i++) {
    eq(`${id} lightMod.${MOD_KEYS[i]}`, p.lightMod[MOD_KEYS[i]], [im, am, gb][i]);
  }
  check(`${id} 粒子数 = ${nParts}`, p.particles.length === nParts, `实际 ${p.particles.length}`);
  for (let i = 0; i < MAT_KEYS.length; i++) {
    eq(`${id} material.${MAT_KEYS[i]}`, p.material[MAT_KEYS[i]], [wet, pud, sag, snowC, line, fogM, cs][i]);
  }
  eq(`${id} windMul（→WindSystem）`, p.windMul, wm);
  eq(`${id} transitionMs（D5）`, p.transitionMs, 1500);
}
check('material 七分量键名与 WeatherPreset.material 契约逐字一致',
  weatherRegistry.list().every((p) => JSON.stringify(Object.keys(p.material)) === JSON.stringify(MAT_KEYS)));
check('clear = 全中性基准（五-1：粒子空 + 七分量全中性 + lightMod 全 1/0 + windMul 1）',
  (() => {
    const p = weatherRegistry.get('clear');
    return p.particles.length === 0
      && p.lightMod.intensityMul === 1 && p.lightMod.ambientMul === 1 && p.lightMod.glowBoost === 0
      && MAT_KEYS.every((k) => p.material[k] === (k === 'fogMul' ? 1 : 0))
      && p.windMul === 1;
  })());

/* ========== 粒子规格逐格（§4.4.2 五-3/五-5 + §7.1.3 总表） ========== */
const rain = weatherRegistry.get('rain').particles[0];
check('rain kind', rain.kind === 'rain');
check('rain 发射区 3.4×3.4×2.4', rain.area.x === 3.4 && rain.area.y === 3.4 && rain.area.z === 2.4);
eq('rain rate', rain.rate, 450);
eq('rain life', rain.lifetime, 0.53);
check('rain 存活峰值 ≈240（450×0.53）', Math.abs(rain.rate * rain.lifetime - 238.5) <= 1e-9, `=${rain.rate * rain.lifetime}`);
check('rain 拉伸 quad (size0,size1)=(宽0.008, 长0.14)', rain.size0 === 0.008 && rain.size1 === 0.14);
check('rain vel0 = 4.5m/s↓', rain.vel0.x === 0 && rain.vel0.y === -4.5 && rain.vel0.z === 0);
eq('rain 色', rain.color, '#A8C8E8');
eq('rain op', rain.opacity, 0.35);
check('rain additive', rain.additive === true);

const snow = weatherRegistry.get('snow').particles[0];
check('snow kind', snow.kind === 'snow');
check('snow 发射区 3.4×3.4×2.4（表未单列，注记②自洽口径）', snow.area.x === 3.4 && snow.area.y === 3.4 && snow.area.z === 2.4);
eq('snow rate', snow.rate, 180);
eq('snow life', snow.lifetime, 4.4);
check('snow 存活峰值 ≈800（180×4.4=792）', Math.abs(snow.rate * snow.lifetime - 792) <= 1e-9, `=${snow.rate * snow.lifetime}`);
check('snow quad size0→size1 = 0.02→0.045', snow.size0 === 0.02 && snow.size1 === 0.045);
check('snow vel0 = 0.55m/s↓', snow.vel0.x === 0 && snow.vel0.y === -0.55 && snow.vel0.z === 0);
eq('snow 色（雪白，注记③）', snow.color, '#EDF2F9');
eq('snow op', snow.opacity, 0.85);
check('snow 非 additive', snow.additive === false);

/* ========== 汇总 ========== */
console.log(`\n${failed === 0 ? 'ALL CHECKS PASSED' : 'CHECKS FAILED'} —— pass=${passed} fail=${failed}`);
if (failed > 0) process.exit(1);
