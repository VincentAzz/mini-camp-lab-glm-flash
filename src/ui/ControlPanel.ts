// docs/01-整体架构.md §3.2 ui/ControlPanel.ts —— 四组分段按钮 + 组合标题条（六.1/六.2）；T35/T36 落点。
//
// 职责边界（docs/06 §6.8 逐字）：只更新选中态/标题条/--accent（禁止触发过渡）——
// 切换编排完全在 Director 订阅 'state:changed' 的路径里，本文件只经 AppStateStore.set() 下发意图。
// 内容信息只走两条通路（§6.1）：①枚举通路——四套 registry.list()（保持注册顺序）驱动分段按钮，
// 注册表新增一行按钮自动出现（§3.1-④ 登记即被识别；未配图标的 id 回退中性六角点）；
// ②状态通路——AppState+事件总线驱动选中态/标题条/过渡触发（触发在 core，UI 只发 set）。
// 依赖纪律：UI 向下只依赖 core/（state/events/registry/transition 常量）与自身文件，严禁 import content/。
import type { RegistryEntry } from '@/core/registry';
import type { AppStateKey, AppStateStore } from '@/core/state';
import { FADE_SWAP_MS, TIME_TRANSITION_MS, WEATHER_TRANSITION_MS } from '@/core/transition';
import { icon } from '@/ui/icons';

/** UI 侧注册表视图（只读面：list()/get()；不暴露 register——UI 无登记权）。 */
export interface UIRegistryView {
  list(): readonly RegistryEntry[];
  get(id: string): RegistryEntry;
}

/** 维度 → 图标名映射（D7 固定 21 枚；未列出的登记 id 走 ICON_FALLBACK）。 */
const ICON_BY_DIM: Record<AppStateKey, Record<string, string>> = {
  scene: {
    seacliff: 'seacliff',
    pineforest: 'pineforest',
    wasteland: 'watchtower',
    servicearea: 'fuelPump',
  },
  vehicle: {
    classC: 'classC',
    classA: 'classA',
    trailerRig: 'trailerRig',
    classB: 'classB',
    overlandTruck: 'overlandTruck',
  },
  time: { dawn: 'dawn', day: 'day', dusk: 'dusk', night: 'night' },
  weather: { clear: 'clear', cloudy: 'cloudy', rain: 'rain', fog: 'fog', snow: 'snow' },
};

/** 组名标签（§6.2 分组行左侧）。 */
const DIM_LABEL: Record<AppStateKey, string> = {
  scene: '场景',
  vehicle: '车型',
  time: '时间',
  weather: '天气',
};

/** 过渡时长（D5 定值，常量唯一来源 core/transition.ts——UI 只读常量，不复制数值）。 */
const BUSY_MS: Record<AppStateKey, number> = {
  scene: FADE_SWAP_MS,
  vehicle: FADE_SWAP_MS,
  time: TIME_TRANSITION_MS,
  weather: WEATHER_TRANSITION_MS,
};

/**
 * 强调色四值联动（§6.4 ★）：dawn 青 / day 白 / dusk 琥珀 / night 月白。
 * JS 预计算 rgba 字符串（不用 color-mix）；与 times 预设数据无 import 关系（依赖纪律），色值对齐由评审把关。
 */
const ACCENT: Record<string, { base: string; soft: string }> = {
  dawn: { base: '#9fd8ff', soft: 'rgba(159, 216, 255, 0.30)' },
  day: { base: '#eaf4ff', soft: 'rgba(234, 244, 255, 0.30)' },
  dusk: { base: '#ffbe6b', soft: 'rgba(255, 190, 107, 0.30)' },
  night: { base: '#b9c8ff', soft: 'rgba(185, 200, 255, 0.30)' },
};

/** 文案进 innerHTML 前转义（label 虽为受控内容，防御性处理）。 */
function esc(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export interface ControlPanelOptions {
  readonly state: AppStateStore;
  readonly sceneRegistry: UIRegistryView;
  readonly vehicleRegistry: UIRegistryView;
  readonly timeRegistry: UIRegistryView;
  readonly weatherRegistry: UIRegistryView;
}

export interface ControlPanelHandle {
  /** 标题条（左上；hiddenMode 的目标件之一）。 */
  readonly titleBar: HTMLElement;
  /** 控制面板（底部居中；hiddenMode 的目标件之一）。 */
  readonly panel: HTMLElement;
  destroy(): void;
}

/**
 * 挂载 UI 到容器（#ui-root）。DOM 固定件之二：标题条 + 控制面板（隐藏钮/ghost 由 hiddenMode 负责）。
 * 行结构：每行 = 组名标签 + 分段按钮组（role=group + aria-label；真 button + aria-pressed）。
 */
export function mountControlPanel(
  container: HTMLElement,
  opts: ControlPanelOptions,
): ControlPanelHandle {
  const { state } = opts;
  const registries: Record<AppStateKey, UIRegistryView> = {
    scene: opts.sceneRegistry,
    vehicle: opts.vehicleRegistry,
    time: opts.timeRegistry,
    weather: opts.weatherRegistry,
  };
  const dims = Object.keys(DIM_LABEL) as AppStateKey[];

  // 类型收敛：AppStateStore.set 的泛型键 → 单点 switch（string 不能直接喂四联合型）
  const setDim = (key: AppStateKey, id: string): boolean => {
    switch (key) {
      case 'scene':
        return state.set('scene', id);
      case 'vehicle':
        return state.set('vehicle', id);
      case 'time':
        return state.set('time', id);
      case 'weather':
        return state.set('weather', id);
    }
  };

  // ———————— 标题条（§6.3） ————————
  const titleBar = el('div', 'title-bar glass ui-hideable');
  const titleDot = el('span', 'title-dot');
  const titleSwap = el('span', 'title-swap');
  const tbA = el('span', 'tb');
  const tbB = el('span', 'tb');
  titleSwap.append(tbA, tbB);
  titleBar.append(titleDot, titleSwap);
  let activeTb = 0;
  let titleText = '';
  const tbs = [tbA, tbB];
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  /** 当前组合文案 = 四注册表 label 按 [scene, vehicle, time, weather] join(' · ')（§6.3 逐字格式）。 */
  const composeTitle = (): { text: string; html: string } => {
    const labels = dims.map((key) => registries[key].get(state.get(key)).label);
    return { text: labels.join(' · '), html: labels.map(esc).join(' <i class="sep">·</i> ') };
  };

  /** 双 span 交替：旧文本上移淡出 140ms + 新文本淡入 180ms；reduced-motion 直写不加动画。 */
  const renderTitle = (): void => {
    const next = composeTitle();
    if (next.text === titleText) return;
    titleText = next.text;
    titleBar.setAttribute('aria-label', `当前组合 ${next.text}`);
    if (reduceMotion.matches) {
      const keep = tbs[activeTb]!;
      keep.innerHTML = next.html;
      keep.classList.add('t-still');
      tbs[1 - activeTb]!.classList.remove('t-still', 't-in', 't-out');
      return;
    }
    const out = tbs[activeTb]!;
    const inc = tbs[1 - activeTb]!;
    inc.innerHTML = next.html;
    inc.classList.remove('t-in', 't-out', 't-still');
    out.classList.remove('t-in', 't-out', 't-still');
    void inc.offsetWidth; // 强制重排：同帧重启动画
    inc.classList.add('t-in');
    out.classList.add('t-out');
    activeTb = 1 - activeTb;
  };

  // ———————— 控制面板（§6.2） ————————
  const panel = el('div', 'panel glass ui-hideable');
  const rows = el('div', 'rows');
  const tabs = el('div', 'tabs');
  tabs.setAttribute('role', 'tablist');
  const segByDim = new Map<AppStateKey, HTMLElement>();
  const rowByDim = new Map<AppStateKey, HTMLElement>();
  const buttonsByDim = new Map<AppStateKey, HTMLButtonElement[]>();
  let expandedDim: AppStateKey = 'scene'; // 页签模式展开组（会话内状态，不落盘）

  for (const key of dims) {
    const row = el('div', 'row');
    row.dataset.dim = key;
    row.append(el('span', 'row-label', DIM_LABEL[key]));
    const seg = el('div', 'seg');
    seg.setAttribute('role', 'group');
    seg.setAttribute('aria-label', DIM_LABEL[key]);
    const buttons: HTMLButtonElement[] = [];
    for (const entry of registries[key].list()) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'seg-btn';
      btn.dataset.id = entry.id;
      btn.title = entry.label;
      btn.setAttribute(
        'aria-pressed',
        entry.id === state.get(key) ? 'true' : 'false',
      );
      btn.innerHTML =
        `<span class="seg-ico">${icon(ICON_BY_DIM[key][entry.id] ?? '')}</span>` +
        `<span class="seg-label">${esc(entry.label)}</span>`;
      // 点击 → AppState.set（registry 校验/同值 no-op 在 core；此处同值守卫双保险，§6.2）
      btn.addEventListener('click', () => {
        if (state.get(key) === entry.id) return;
        setDim(key, entry.id);
      });
      seg.appendChild(btn);
      buttons.push(btn);
    }
    row.appendChild(seg);
    rows.appendChild(row);
    segByDim.set(key, seg);
    rowByDim.set(key, row);
    buttonsByDim.set(key, buttons);

    // 页签（<720px 页签条模式，§6.2 响应式）
    const tab = el('button', 'tab', DIM_LABEL[key]);
    tab.type = 'button';
    tab.dataset.dim = key;
    tab.setAttribute('aria-pressed', key === expandedDim ? 'true' : 'false');
    tab.addEventListener('click', () => {
      expandedDim = key;
      for (const [k, r] of rowByDim) r.classList.toggle('expanded', k === key);
      for (const t of tabs.children) {
        (t as HTMLElement).setAttribute('aria-pressed', (t as HTMLElement).dataset.dim === key ? 'true' : 'false');
      }
    });
    tabs.appendChild(tab);
  }
  rowByDim.get(expandedDim)!.classList.add('expanded');

  // 折角钮：面板可收起为页签条（§6.2 ②；会话内记忆不落盘）
  const foldBtn = el('button', 'fold-btn');
  foldBtn.type = 'button';
  foldBtn.title = '收起/展开面板';
  foldBtn.setAttribute('aria-label', '收起或展开控制面板');
  foldBtn.setAttribute('aria-expanded', 'false');
  foldBtn.innerHTML = icon('fold');
  foldBtn.addEventListener('click', () => {
    const folded = panel.classList.toggle('folded');
    foldBtn.setAttribute('aria-expanded', folded ? 'true' : 'false');
  });
  panel.append(foldBtn, rows, tabs);

  // ———————— 选中态/标题条/accent/busy 对账（state:change 唯一入口） ————————
  const syncSelection = (key: AppStateKey): void => {
    const current = state.get(key);
    for (const btn of buttonsByDim.get(key) ?? []) {
      btn.setAttribute('aria-pressed', btn.dataset.id === current ? 'true' : 'false');
    }
  };

  const applyAccent = (): void => {
    const tone = ACCENT[state.get('time')] ?? null;
    if (!tone) return; // 未登记时间档（理论上不可达）：保留上次值
    container.style.setProperty('--accent', tone.base);
    container.style.setProperty('--accent-soft', tone.soft);
  };

  // 过渡进行中的维度行 data-busy（§6.6 U6）：rAF 到期摘除，无 setTimeout（帧驱动纪律同 core）
  const busyUntil = new Map<AppStateKey, number>();
  let busyRaf: number | null = null;
  const busyStep = (): void => {
    const now = performance.now();
    for (const [key, until] of busyUntil) {
      if (now >= until) {
        segByDim.get(key)?.removeAttribute('data-busy');
        busyUntil.delete(key);
      }
    }
    busyRaf = busyUntil.size > 0 ? requestAnimationFrame(busyStep) : null;
  };
  const markBusy = (key: AppStateKey): void => {
    segByDim.get(key)?.setAttribute('data-busy', '');
    busyUntil.set(key, performance.now() + BUSY_MS[key]);
    if (busyRaf === null) busyRaf = requestAnimationFrame(busyStep);
  };

  const unsubChange = state.onChange((event) => {
    syncSelection(event.key);
    renderTitle();
    if (event.key === 'time') applyAccent();
    markBusy(event.key);
  });

  // 初始对账（applyState 已在 main.ts 先行：首帧即默认组合，不播 UI 动画外的过渡）
  for (const key of dims) syncSelection(key);
  renderTitle();
  applyAccent();

  // ———————— 响应式（§6.2 <720px 页签条；§6.7 极小窗高<560px 同折叠） ————————
  const mqNarrow = window.matchMedia('(max-width: 720px)');
  const syncCompact = (): void => {
    const compact = mqNarrow.matches || window.innerHeight < 560;
    panel.classList.toggle('compact', compact);
    if (compact) panel.classList.remove('folded'); // 页签条即收起形态
  };
  const onMqChange = (): void => syncCompact();
  const onWinResize = (): void => syncCompact();
  if (typeof mqNarrow.addEventListener === 'function') mqNarrow.addEventListener('change', onMqChange);
  else mqNarrow.addListener(onMqChange); // 旧实现兜底
  window.addEventListener('resize', onWinResize);
  syncCompact();

  container.append(titleBar, panel);

  return {
    titleBar,
    panel,
    destroy(): void {
      unsubChange();
      if (busyRaf !== null) cancelAnimationFrame(busyRaf);
      busyRaf = null;
      busyUntil.clear();
      if (typeof mqNarrow.removeEventListener === 'function') {
        mqNarrow.removeEventListener('change', onMqChange);
      } else {
        mqNarrow.removeListener(onMqChange);
      }
      window.removeEventListener('resize', onWinResize);
      titleBar.remove();
      panel.remove();
    },
  };
}
