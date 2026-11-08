// verify-t35t40.headless.mjs —— T35–T40 UI 层静态/结构无头核验（无 WebGL/DOM 渲染；DOM 行为归内置浏览器实机步）。
// 运行：node verify-t35t40.headless.mjs（自带 module.registerHooks 钩子，Node ≥20.19；同 verify-t23/t28 模式）。
// 断言对：docs/06 §6.1（UI 依赖纪律/枚举通路）、§6.2（21 枚图标/分段按钮契约）、§6.3（标题条格式）、
//   §6.4（玻璃基线四关键词/降级/accent 四值/reduced-motion/性能纪律）、§6.5（260/300ms/H 键/44px/不持久化）、
//   §6.2 响应式（<720px 页签条 class 驱动）、docs/01 §3.1-④（registry 驱动自动出现——按钮顺序=注册顺序静态证据）。
import { registerHooks } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import ts from 'typescript';
import * as THREE from 'three';

const here = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = pathToFileURL(path.join(here, 'src')).href;
const read = (p) => readFileSync(path.join(here, p), 'utf8');

/* ---- 最小 canvas 2D 桩（content 模块 import 期安全；本脚本不真正绘制） ---- */
function makeContext2d(canvas) {
  const gradient = { addColorStop() {} };
  return new Proxy(
    { canvas },
    {
      get(target, prop) {
        if (prop === 'createImageData') return (w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h });
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
/** 去注释源码（块注释+行注释）：后续「禁用 API 扫描」只对真实代码生效，不误伤说明注释。 */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/* ============================== ① icons.ts：21 枚内联 SVG ============================== */
const { ICONS, ICON_NAMES, ICON_FALLBACK, icon } = await import('@/ui/icons');

check('icons 恰好 21 枚（场景4+车型5+时间4+天气5+UI3）', ICON_NAMES.length === 21, `n=${ICON_NAMES.length}`);
check('icons 名单与 docs/06 §6.2 清单一致',
  ['seacliff','pineforest','watchtower','fuelPump','classC','classA','trailerRig','classB','overlandTruck',
   'dawn','day','dusk','night','clear','cloudy','rain','fog','snow','eye','eyeOff','fold']
    .every((k) => ICON_NAMES.includes(k)));
const allIcons = [...Object.values(ICONS), ICON_FALLBACK];
check('全部统一外壳：viewBox 0 0 24 24 / stroke 1.6 / round',
  allIcons.every((s) => s.includes('viewBox="0 0 24 24"') && s.includes('stroke-width="1.6"')
    && s.includes('stroke-linecap="round"') && s.includes('stroke-linejoin="round"')));
check('零外部资产/零图片/零字体（无 <image>、无 href 引用、无 url()、无 @font）',
  allIcons.every((s) => !s.includes('<image') && !s.includes('href') && !s.includes('url(') && !s.includes('font')
    && !s.toLowerCase().includes('person') && !s.includes('http://www.w3.org/1999/xlink')));
check('xmlns 命名空间唯一网络形字符串（协议字面量，非运行时请求）',
  allIcons.every((s) => s.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')));
check('旋转对称循环生成：day 太阳 = 圆盘 + 8 道光芒',
  (ICONS.day.match(/<line /g) || []).length === 8 && (ICONS.day.match(/<circle /g) || []).length === 1);
check('clear 太阳 r=3.6 无光芒（与 day 区分，§6.2）',
  ICONS.clear.includes('r="3.6"') && !(ICONS.clear.includes('<line')));
check('雪花 = 6 臂 × (主线+2 分叉) = 18 线循环',
  (ICONS.snow.match(/<line /g) || []).length === 18);
check('icon() 未知名回退六角点（不抛错——登记即被识别不被装饰件中断）',
  icon('nonexistent') === ICON_FALLBACK && ICON_FALLBACK.includes('<path'));

/* ============================== ② 注册表顺序/图标覆盖（枚举通路静态证据） ============================== */
const { sceneRegistry } = await import('@/content/scenes/registry');
const { vehicleRegistry } = await import('@/content/vehicles/registry');
const { timeRegistry } = await import('@/content/times/registry');
const { weatherRegistry } = await import('@/content/weathers/registry');
const ctrlSrc = read('src/ui/ControlPanel.ts');

const regIds = (reg) => reg.list().map((e) => e.id);
const sceneIds = regIds(sceneRegistry);
const vehicleIds = regIds(vehicleRegistry);
const timeIds = regIds(timeRegistry);
const weatherIds = regIds(weatherRegistry);
check('四注册表行数 4/5/4/5（§6.2 布局）',
  sceneIds.length === 4 && vehicleIds.length === 5 && timeIds.length === 4 && weatherIds.length === 5,
  `${sceneIds.join(',')} | ${vehicleIds.join(',')} | ${timeIds.join(',')} | ${weatherIds.join(',')}`);
// ICON_BY_DIM 字面量覆盖全部登记 id（新登记 id 未配图 → 运行时走 ICON_FALLBACK，仍自动出现）
const ctrlIconBlock = ctrlSrc.slice(ctrlSrc.indexOf('ICON_BY_DIM'), ctrlSrc.indexOf('const DIM_LABEL'));
const missingIcons = [...sceneIds, ...vehicleIds, ...timeIds, ...weatherIds].filter((id) => !new RegExp(`\\b${id}\\s*:`).test(ctrlIconBlock));
check('ControlPanel ICON_BY_DIM 覆盖全部 18 个登记 id', missingIcons.length === 0, missingIcons.join(',') || 'all');
check('ControlPanel 按钮渲染自 registry.list()（枚举通路）',
  /registries\[key\]\.list\(\)/.test(ctrlSrc));
check('同值 no-op 守卫（§6.2 点已选中=no-op）',
  /state\.get\(key\) === entry\.id\) return;/.test(ctrlSrc));
check('真 button + aria-pressed + role=group + aria-label（§6.2 可达性）',
  ctrlSrc.includes('aria-pressed') && ctrlSrc.includes(`'role', 'group'`) && ctrlSrc.includes("'aria-label'"));
check('label 透传（文案=RegistryEntry.label，不缓存副本）',
  /\.label/.test(ctrlSrc) && ctrlSrc.includes('entry.label'));
check('强调色四值联动（dawn 青/day 白/dusk 琥珀/night 月白，§6.4）',
  ['#9fd8ff', '#eaf4ff', '#ffbe6b', '#b9c8ff'].every((c) => ctrlSrc.includes(c)));
check('accent 仅在 time 维变更时联动（§6.4）', /event\.key === 'time'\) applyAccent/.test(ctrlSrc));
check('标题条格式 join(\' · \')（§6.3 逐字）',
  /labels\.join\(' · '\)/.test(ctrlSrc));
check('UI 依赖纪律：ui/*.ts 严禁 import content（§6.1）', ['ControlPanel.ts', 'hiddenMode.ts', 'icons.ts']
  .every((f) => !/@\/content\//.test(read(`src/ui/${f}`))));
check('不持久化（U5）：ui/ 全部无 localStorage/sessionStorage/indexedDB 调用',
  ['ControlPanel.ts', 'hiddenMode.ts', 'icons.ts'].every((f) => !/localStorage|sessionStorage|indexedDB/.test(stripComments(read(`src/ui/${f}`)))));

/* ============================== ③ uiStyle.css：玻璃基线/降级/动效/响应式 ============================== */
const css = read('src/ui/uiStyle.css');
check('玻璃基线 blur 18px + saturate 1.45（§6.4）', css.includes('blur(18px) saturate(1.45)'));
check('半透明渐变基线（165deg 深蓝渐变）', css.includes('linear-gradient(165deg, rgba(40, 47, 78, 0.46), rgba(21, 26, 48, 0.4))'));
check('细描边 1px 白 22%（§6.4）', css.includes('border: 1px solid var(--stroke)') && css.includes('--stroke: rgba(255, 255, 255, 0.22)'));
check('圆角三值 18/9/999（§6.4）', css.includes('border-radius: 18px') && css.includes('border-radius: 9px') && css.includes('border-radius: 999px'));
check('柔和阴影大半径低透明 + 内高光（§6.4）',
  css.includes('0 10px 32px rgba(8, 12, 28, 0.35)') && css.includes('inset 0 1px 0 var(--glass-hi)'));
check('@supports not (backdrop-filter) 降级 rgba(20,25,45,.84)（§6.4）',
  css.includes('@supports not') && css.includes('rgba(20, 25, 45, 0.84)'));
check('深色基线文字色 #eef2ff（§6.4）', css.includes('--ink: #eef2ff'));
check('prefers-reduced-motion 装饰动效全关（§6.4）', css.includes('@media (prefers-reduced-motion: reduce)'));
check('safe-area 兜底（T39）', css.includes('env(safe-area-inset-bottom'));
check('页签条 class 驱动 .panel.compact（§6.2 响应式；JS 只加减 class）',
  css.includes('.panel.compact') && css.includes('.panel.folded'));
check('标题条 max-width 46vw 省略兜底（§6.3）', css.includes('46vw') && css.includes('text-overflow: ellipsis'));
check('隐藏三件 translateY(-8px)+opacity→0；is-off visibility hidden 保留 DOM（§6.5）',
  css.includes('translateY(-8px)') && css.includes('.ui-hideable') && css.includes('visibility: hidden'));
// @keyframes 逐块扫描：只允许 transform/opacity/border-color（§6.2 允许集/§6.4 性能纪律）
const kfBlocks = [...css.matchAll(/@keyframes\s+([\w-]+)\s*\{([\s\S]*?)\n\}/g)];
const banned = ['width', 'height', 'margin', 'padding', 'box-shadow', 'filter', 'backdrop-filter', 'top', 'left', 'right', 'bottom', 'font-size', 'background-position'];
const kfBad = kfBlocks.flatMap(([, name, body]) =>
  banned.filter((prop) => new RegExp(`(^|[;{\\s])${prop}\\s*:`, 'm').test(body)).map((prop) => `${name}:${prop}`));
check('@keyframes 只动 transform/opacity/border-color', kfBad.length === 0, kfBad.join(',') || `${kfBlocks.length} blocks ok`);
check('will-change 仅动画期间（只在 anim-hide/anim-show 两个声明点）',
  (css.match(/will-change\s*:/g) || []).length === 2
  && css.split('will-change:').every((seg, i, arr) => i === arr.length - 1 || /anim-(hide|show)/.test(arr[i].slice(-260))));

/* ============================== ④ hiddenMode.ts：状态机契约 ============================== */
const hmSrc = read('src/ui/hiddenMode.ts');
check('hiding 260ms / showing 300ms（§6.5 定值）', hmSrc.includes('HIDE_MS = 260') && hmSrc.includes('SHOW_MS = 300'));
check('键盘 KeyH + repeat/修饰键/输入控件三重过滤（§6.5）',
  hmSrc.includes("event.code !== 'KeyH'") && hmSrc.includes('event.repeat'));
check('ghost 30×30 + 44×44 命中区（§6.5；尺寸在 CSS，此处查类名接线）',
  hmSrc.includes("className = 'ghost-hit'") && hmSrc.includes("className = 'ghost'")
  && css.includes('.ghost-hit') && /\n  width: 44px/.test(css.slice(css.indexOf('.ghost-hit'))));
check('触屏呼吸提示 2.4s 播一次（会话内一次性）',
  hmSrc.includes('GHOST_HINT_MS = 2400') && hmSrc.includes('ghostHinted'));
check('eyeOff 图标 + eye 图标（21 枚之 UI 2 枚接线）', hmSrc.includes("icon('eyeOff')") && hmSrc.includes("icon('eye')"));
check('相位推进无 setTimeout/setInterval（帧驱动纪律）',
  !/setTimeout|setInterval/.test(stripComments(hmSrc)) && !/setTimeout|setInterval/.test(stripComments(ctrlSrc)));

/* ============================== ⑤ main.ts：UI 接线 + DEV __camp 钩子 ============================== */
const mainSrc = read('src/main.ts');
check('main.ts 接线：uiStyle.css + ControlPanel + hiddenMode + #ui-root',
  mainSrc.includes("import '@/ui/uiStyle.css'") && mainSrc.includes("mountControlPanel") && mainSrc.includes("mountHiddenMode") && mainSrc.includes("id = 'ui-root'"));
const devBlock = mainSrc.slice(mainSrc.indexOf('import.meta.env.DEV'));
check('__camp 钩子 DEV-only 且暴露 setState/getState/ready',
  mainSrc.split('import.meta.env.DEV').length === 3
  && devBlock.includes('__camp') && devBlock.includes('setState') && devBlock.includes('getState') && devBlock.includes('ready'));
check('setState 位置实参 (scene, vehicle, time, weather) + registry.get 校验',
  /setState\(\s*\n\s*scene\?: string \| null,/.test(mainSrc) && devBlock.includes('sceneRegistry.get(scene)'));
check('ready = 首帧渲染后兑现（两帧 rAF）',
  devBlock.includes('requestAnimationFrame(() => requestAnimationFrame(() => readyResolve(true)))'));

/* ============================== ⑥ four registries → UI 顺序快照（回归基线） ============================== */
check('注册顺序快照（UI 按钮顺序=注册顺序，§6.1；新登记条目追加行即追加按钮）',
  JSON.stringify([sceneIds, vehicleIds, timeIds, weatherIds]) === JSON.stringify([
    ['seacliff', 'servicearea', 'wasteland', 'pineforest'],
    ['classC', 'classA', 'trailerRig', 'classB', 'overlandTruck'],
    ['dawn', 'day', 'dusk', 'night'],
    ['clear', 'cloudy', 'rain', 'fog', 'snow'],
  ]),
  `scene=${sceneIds.join('/')} vehicle=${vehicleIds.join('/')} time=${timeIds.join('/')} weather=${weatherIds.join('/')}`);

/* ============================== 汇总 ============================== */
console.log(`\n==== verify-t35t40.headless: pass=${pass} fail=${fail} ====`);
if (fail > 0) {
  console.log('FAILURES:\n' + failures.map((f) => `  - ${f}`).join('\n'));
  process.exit(1);
}
