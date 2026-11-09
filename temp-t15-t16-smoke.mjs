// temp-t15-t16-smoke.mjs —— T15/T16 行为冒烟（临时文件，验收后按清理流程处理，勿提交）。
// 运行：node temp-t15-t16-smoke.mjs（2026-11-10 起自带钩子可直接运行）
// （hook 把 '@/…' 解析到 ./src/…，Node 24 原生剥除 .ts 类型后直接执行真实源码，不经构建产物。）
// 复跑门槛修复（终审 ⑧）：内置 inline 钩子 + 静态 import 改动态（static import 先于钩子解析，
// 直跑必 ERR_MODULE_NOT_FOUND）——自此可直接 `node temp-t15-t16-smoke.mjs`。
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
const {
  EventScheduler, SCHEDULED_EVENT_PRESETS, SCHEDULED_EVENT_PRESET_LIST,
} = await import('@/systems/scheduler');
const {
  OutlineSystem, OUTLINE_WIDTH_TIERS, OUTLINE_WIDTH_MAX, OUTLINE_COLORS,
  pickOutlineColor, splitHardEdgesForOutline,
} = await import('@/render/outline');
const { InstancedGroup } = await import('@/geom/instanced');
const THREE = await import('three');

let failed = 0;
function check(name, cond, detail = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${detail ? ' —— ' + detail : ''}`);
  if (!cond) failed += 1;
}
function expectThrow(name, fn) {
  let threw = false;
  try { fn(); } catch { threw = true; }
  check(name, threw);
}

/* ===== T15 scheduler ===== */
check('预置表 5 事件', SCHEDULED_EVENT_PRESET_LIST.length === 5);
check('平均间隔 16/26/11/9/20', JSON.stringify(SCHEDULED_EVENT_PRESET_LIST.map((p) => p.meanIntervalS)) === '[16,26,11,9,20]');
check('随机窗 ±6/±10/±4/±3/±8', JSON.stringify(SCHEDULED_EVENT_PRESET_LIST.map((p) => p.jitterS)) === '[6,10,4,3,8]');
check('夜间静默=海鸟/松鼠', SCHEDULED_EVENT_PRESETS.seagull.nightSilent === true
  && SCHEDULED_EVENT_PRESETS.squirrel.nightSilent === true
  && SCHEDULED_EVENT_PRESETS.napkinGust.nightSilent === false
  && SCHEDULED_EVENT_PRESETS.lightspotChirp.nightSilent === false
  && SCHEDULED_EVENT_PRESETS.signDoubleFlash.nightSilent === false);
expectThrow('meanIntervalS≤0 抛错', () => new EventScheduler().add({ meanIntervalS: 0, fire() {} }));
expectThrow('probability>1 抛错', () => new EventScheduler().add({ meanIntervalS: 1, probability: 1.5, fire() {} }));

{ // 间隔界与长程平均
  let t = 0; const times = [];
  const s = new EventScheduler('gaps');
  s.add({ meanIntervalS: 10, jitterS: 2, fire: () => times.push(t) });
  while (t < 600) { s.update(1 / 60); t += 1 / 60; }
  const gaps = times.slice(1).map((v, i) => v - times[i]);
  const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  check('间隔∈[8,12]', gaps.every((g) => g >= 8 - 1e-6 && g <= 12 + 1e-6),
    `min=${Math.min(...gaps).toFixed(2)} max=${Math.max(...gaps).toFixed(2)} n=${gaps.length}`);
  check('长程平均≈10', avg > 9.5 && avg < 10.5, `avg=${avg.toFixed(3)}`);
}
{ // minIntervalS 下限保护
  let t = 0; const times = [];
  const s = new EventScheduler('minclamp');
  s.add({ meanIntervalS: 5, jitterS: 5, minIntervalS: 6, fire: () => times.push(t) });
  while (t < 200) { s.update(1 / 60); t += 1 / 60; }
  const gaps = times.slice(1).map((v, i) => v - times[i]);
  check('minIntervalS 下限生效（全部 ≥6）', gaps.length > 5 && gaps.every((g) => g >= 6 - 1e-6), `min=${Math.min(...gaps).toFixed(2)}`);
}
{ // 夜间自动静默：事件对象鸭子字段 nightSilent（冻结→解除恢复）
  let t = 0; const times = [];
  const s = new EventScheduler('smoke-night');
  s.add({ meanIntervalS: 1, jitterS: 0, nightSilent: true, fire: () => times.push(t) });
  s.setNightSilence(true);
  for (let i = 0; i < 120; i++) { s.update(1 / 60); t += 1 / 60; }
  check('夜间静默冻结（2s 零触发）', times.length === 0 && s.suspendedCount === 1);
  s.setNightSilence(false);
  for (let i = 0; i < 180; i++) { s.update(1 / 60); t += 1 / 60; }
  check('解除后恢复触发', times.length >= 2, `times=${times.map((v) => v.toFixed(2)).join(',')}`);
}
{ // options.nightSilent 路径（未标记事件不受静默影响）
  let t = 0; let gated = 0; let free = 0;
  const s = new EventScheduler('smoke-opt');
  s.add({ meanIntervalS: 0.5, jitterS: 0, fire: () => (gated += 1) }, { nightSilent: true });
  s.add({ meanIntervalS: 0.5, jitterS: 0, fire: () => (free += 1) });
  s.setNightSilence(true);
  for (let i = 0; i < 120; i++) { s.update(1 / 60); t += 1 / 60; }
  check('options.nightSilent 生效且不影响未标记事件', gated === 0 && free >= 3 && s.suspendedCount === 1, `gated=${gated} free=${free}`);
}
{ // probability / cancel / fire 抛错韧性
  let fires = 0; let t = 0;
  const s = new EventScheduler('prob');
  s.add({ meanIntervalS: 1, jitterS: 0, probability: 0.5, fire: () => (fires += 1) });
  while (t < 100) { s.update(1 / 60); t += 1 / 60; }
  check('概率 0.5 显著降频', fires > 20 && fires < 80, `fires=${fires}/100`);

  let canc = 0;
  const s2 = new EventScheduler('cancel');
  const h = s2.add({ meanIntervalS: 0.5, jitterS: 0, fire: () => (canc += 1) });
  check('句柄含 cancel', typeof h.cancel === 'function' && s2.size === 1);
  for (let i = 0; i < 60; i++) s2.update(1 / 60);
  const before = canc;
  h.cancel();
  for (let i = 0; i < 120; i++) s2.update(1 / 60);
  check('cancel 后不再触发', s2.size === 0 && canc === before, `before=${before} after=${canc}`);

  const origErr = console.error; console.error = () => {};
  let booms = 0;
  const s3 = new EventScheduler('throw');
  s3.add({ meanIntervalS: 0.5, jitterS: 0, fire: () => { booms += 1; throw new Error('boom'); } });
  for (let i = 0; i < 180; i++) s3.update(1 / 60);
  console.error = origErr;
  check('fire 抛错不终止排程', booms >= 3, `booms=${booms}`);
}
{ // 同种子可复现
  const run = () => {
    let t = 0; const times = [];
    const s = new EventScheduler('det');
    s.add({ meanIntervalS: 3, jitterS: 1, fire: () => times.push(+t.toFixed(4)) });
    while (t < 20) { s.update(1 / 60); t += 1 / 60; }
    return times;
  };
  const a = run(); const b = run();
  check('同种子触发序列可复现', JSON.stringify(a) === JSON.stringify(b) && a.length >= 5, `n=${a.length}`);
}

/* ===== T16 outline ===== */
check('宽度档 5 档定值', Object.keys(OUTLINE_WIDTH_TIERS).length === 5
  && OUTLINE_WIDTH_TIERS.vehicle.default === 0.022 && OUTLINE_WIDTH_TIERS.vehicle.max === 0.025
  && OUTLINE_WIDTH_TIERS.building.min === 0.03 && OUTLINE_WIDTH_TIERS.prop.default === 0.012
  && OUTLINE_WIDTH_TIERS.small.default === 0.008 && OUTLINE_WIDTH_TIERS.base.default === 0.05);
check('描边色三选一（暖/冷/中性）',
  pickOutlineColor('#c2564a') === OUTLINE_COLORS.warm
  && pickOutlineColor('#4a6ac2') === OUTLINE_COLORS.cool
  && pickOutlineColor('#b8b8c0') === OUTLINE_COLORS.default);
check('描边色定值 #2f2a33/#3a2e2a/#2a3040', OUTLINE_COLORS.default === '#2f2a33'
  && OUTLINE_COLORS.warm === '#3a2e2a' && OUTLINE_COLORS.cool === '#2a3040');
{ // Mesh 反壳：随父级/renderOrder=1/BackSide+depthWrite/几何零克隆/宽度档
  const sys = new OutlineSystem();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshToonMaterial());
  sys.enable(mesh, { tier: 'vehicle' });
  const shell = mesh.children[0];
  const mat = shell.material;
  check('Mesh 壳挂载+renderOrder=1', mesh.children.length === 1 && shell.renderOrder === 1 && shell.userData.isOutlineShell === true);
  check('壳材质 BackSide+depthWrite+宽度档', mat.side === THREE.BackSide && mat.depthWrite === true && mat.uniforms.uWidth.value === OUTLINE_WIDTH_TIERS.vehicle.default);
  check('壳几何直接引用本体', shell.geometry === mesh.geometry);
  mesh.position.set(3, 2, 1);
  mesh.updateMatrixWorld(true);
  check('壳随父级变换', shell.matrixWorld.equals(mesh.matrixWorld));
  sys.disable(mesh);
  check('disable 摘壳零残留', mesh.children.length === 0 && sys.count === 0);
}
{ // 实例化成对：共享矩阵 buffer + 宽度上限钳制 + count 对账
  const sys = new OutlineSystem();
  const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshToonMaterial(), 4);
  inst.count = 3;
  sys.enable(inst, { width: 0.3 });
  const shell = inst.children[0];
  check('实例化壳共享 instanceMatrix', shell.instanceMatrix === inst.instanceMatrix && shell.count === 3 && shell.renderOrder === 1);
  check('宽度上限钳制 0.06', shell.material.uniforms.uWidth.value === OUTLINE_WIDTH_MAX);
  inst.count = 2;
  sys.update();
  check('update() count 对账', shell.count === 2);
  sys.disable(inst);
  check('disable 摘除实例壳', inst.children.length === 0 && sys.count === 0);
}
{ // applyTo：工厂档/albedo 三选一/物体级开关/非工厂材质默认不开/子树跳过
  const sys = new OutlineSystem();
  const root = new THREE.Group();
  const outlined = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8), new THREE.MeshToonMaterial());
  outlined.material.userData.outline = true;
  outlined.material.color = new THREE.Color('#c2564a');
  const fine = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), new THREE.MeshBasicMaterial());
  const marked = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), new THREE.MeshToonMaterial());
  marked.material.userData.outline = true;
  marked.userData.noOutline = true;
  const interior = new THREE.Group();
  interior.userData.noOutline = true;
  const interiorChild = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), new THREE.MeshToonMaterial());
  interiorChild.material.userData.outline = true;
  interior.add(interiorChild);
  root.add(outlined, fine, marked, interior);
  const applied = sys.applyTo(root, { defaultTier: 'prop' });
  check('applyTo 仅工厂档开壳 1 个', applied === 1 && sys.isEnabled(outlined) && sys.count === 1);
  const shell = outlined.children[0];
  const col = shell.material.uniforms.uColor.value;
  check('albedo 三选一=暖 #3a2e2a', col.getHexString() === '3a2e2a');
  expectThrow('noOutline 硬开关拒绝 enable', () => sys.enable(marked));
  sys.removeFrom(root);
  check('removeFrom 清空子树', sys.count === 0 && outlined.children.length === 0 && !sys.isEnabled(outlined));
}
{ // InstancedGroup(withShell) 成对壳互斥
  const sys = new OutlineSystem();
  const mat = new THREE.MeshToonMaterial();
  mat.userData.outline = true;
  const ig = new InstancedGroup(new THREE.BoxGeometry(1, 1, 1), mat, { capacity: 3, withShell: true, name: 'smoke-ig' });
  ig.add(new THREE.Matrix4());
  expectThrow('withShell 本体 enable 拒绝双壳', () => sys.enable(ig.body, { tier: 'prop' }));
  const applied = sys.applyTo(ig.group, { defaultTier: 'prop' });
  check('withShell 本体 applyTo 跳过', applied === 0 && sys.count === 0);
}
check('硬边拆分=非索引 36 顶点', (() => {
  const hardened = splitHardEdgesForOutline(new THREE.BoxGeometry(1, 1, 1));
  return hardened.index === null && hardened.attributes.position.count === 36;
})());

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
if (failed > 0) throw new Error('smoke failed');
