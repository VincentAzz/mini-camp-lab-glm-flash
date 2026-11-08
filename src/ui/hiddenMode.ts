// docs/01-整体架构.md §3.2 ui/hiddenMode.ts —— 隐藏/呼出 UI（六.4 → 一.4）；T38 落点。
//
// 状态机（docs/06 §6.5 逐字）：
//   visible --点击右上隐藏钮/按 H--> hiding(260ms, 三件同时 translateY(-8px)+opacity→0) --> hidden
//   hidden --点击 ghost 把手/按 H--> showing(反向 300ms ease-out) --> visible
// hidden 态唯一残留 = 右上 30×30 ghost 把手（opacity .22，eye-off 图标；hover/focus 升至 .8；
// 触屏首次进入播一次呼吸提示 2.4s 解决发现性）；visibility:hidden 保留 DOM（呼出零重建）。
// 键盘 KeyH；触屏 ghost 外包 44×44 命中区。★不持久化（U5）：隐藏偏好与上次组合均不写 localStorage
// ——十一.1「打开即玩」，刷新必回 visible + 默认组合。hiddenMode 独立于 state（§6.8）。
// 纪律：相位推进用 rAF 累积（无 setTimeout/setInterval，同 core 帧驱动纪律）。
import { icon } from '@/ui/icons';

/** 隐藏动画时长（§6.5 定值 260ms）。 */
const HIDE_MS = 260;
/** 呼出动画时长（§6.5 定值 300ms ease-out）。 */
const SHOW_MS = 300;
/** 触屏呼吸提示时长（§6.5 定值 2.4s，动画本体在 uiStyle.css）。 */
const GHOST_HINT_MS = 2400;

type Phase = 'visible' | 'hiding' | 'hidden' | 'showing';

export interface HiddenModeOptions {
  /** 需要被隐藏的目标件（标题条 + 控制面板；隐藏钮/ghost 由本模块自建自管）。 */
  readonly targets: readonly HTMLElement[];
  /** 无头/测试注入口；默认全局 requestAnimationFrame/cancelAnimationFrame。 */
  readonly raf?: (cb: (ts: number) => void) => number;
  readonly cancelRaf?: (id: number) => void;
}

export interface HiddenModeHandle {
  /** 当前是否处于 hidden（供 DEV 钩子/测试断言；不影响 state store）。 */
  isHidden(): boolean;
  destroy(): void;
}

/**
 * 挂载隐藏钮（右上玻璃圆钮，eye 图标）+ ghost 把手（hidden 态唯一残留）到 #ui-root，
 * 并把 opts.targets 纳入隐藏动画（类 .ui-hideable，相位类挂在 #ui-root 上由 CSS 驱动）。
 */
export function mountHiddenMode(
  root: HTMLElement,
  opts: HiddenModeOptions,
): HiddenModeHandle {
  const raf = opts.raf ?? ((cb: (ts: number) => void) => requestAnimationFrame(cb));
  const cancelRaf = opts.cancelRaf ?? ((id: number) => cancelAnimationFrame(id));

  // ———————— 固定件之三：隐藏钮（右上） ————————
  const hideBtn = document.createElement('button');
  hideBtn.type = 'button';
  hideBtn.className = 'hide-btn glass ui-hideable';
  hideBtn.title = '隐藏界面（H）';
  hideBtn.setAttribute('aria-label', '隐藏控制界面');
  hideBtn.innerHTML = icon('eye');

  // ———————— 固定件之四：ghost 把手（hidden 态唯一残留；44×44 命中区包 30×30 本体） ————————
  const ghostHit = document.createElement('button');
  ghostHit.type = 'button';
  ghostHit.className = 'ghost-hit';
  ghostHit.title = '显示界面（H）';
  ghostHit.setAttribute('aria-label', '显示控制界面');
  const ghost = document.createElement('span');
  ghost.className = 'ghost';
  ghost.innerHTML = icon('eyeOff');
  ghostHit.appendChild(ghost);

  // ———————— 相位状态机 ————————
  let phase: Phase = 'visible';
  let rafId: number | null = null;
  let phaseStart: number | null = null;
  /** 本次会话是否已播过触屏呼吸提示（「首次进入」只一次；会话态，不落盘）。 */
  let ghostHinted = false;
  /** 最近一次指针输入类型（hide 完成时判定是否播呼吸提示）。 */
  let lastPointerType = 'mouse';

  const applyClasses = (): void => {
    root.classList.toggle('is-dimmed', phase !== 'visible');
    root.classList.toggle('is-off', phase === 'hidden');
    root.classList.toggle('anim-hide', phase === 'hiding');
    root.classList.toggle('anim-show', phase === 'showing');
    for (const t of opts.targets) t.classList.add('ui-hideable');
  };
  applyClasses();
  root.append(hideBtn, ghostHit);

  /** 相位计时：rAF 累积到 ms 后落地（无 setTimeout；中途换相位即重置计时）。 */
  const schedulePhase = (durationMs: number, done: () => void): void => {
    if (rafId !== null) cancelRaf(rafId);
    phaseStart = null;
    const step = (ts: number): void => {
      if (phaseStart === null) phaseStart = ts;
      if (ts - phaseStart >= durationMs) {
        rafId = null;
        done();
        return;
      }
      rafId = raf(step);
    };
    rafId = raf(step);
  };

  let hintRaf: number | null = null;
  let hintStart: number | null = null;
  /** 呼吸提示 2.4s 到期摘类（rAF 累积；animationend 为主路径，本计时为降级兜底）。 */
  const scheduleHintEnd = (): void => {
    if (hintRaf !== null) cancelRaf(hintRaf);
    hintStart = null;
    const step = (ts: number): void => {
      if (hintStart === null) hintStart = ts;
      if (ts - hintStart >= GHOST_HINT_MS) {
        hintRaf = null;
        ghost.classList.remove('ghost-hint');
        return;
      }
      hintRaf = raf(step);
    };
    hintRaf = raf(step);
  };
  const playGhostHintOnce = (): void => {
    if (ghostHinted) return;
    ghostHinted = true;
    ghost.classList.add('ghost-hint');
    scheduleHintEnd();
  };
  // animationend 为主摘类路径（提示动画被 reduced-motion 关闭时由 scheduleHintEnd 兜底）
  ghost.addEventListener('animationend', () => ghost.classList.remove('ghost-hint'));

  const hide = (): void => {
    if (phase === 'hiding' || phase === 'hidden') return;
    phase = 'hiding';
    applyClasses(); // is-dimmed + anim-hide：三件同时位移淡出
    schedulePhase(HIDE_MS, () => {
      if (phase !== 'hiding') return;
      phase = 'hidden';
      applyClasses(); // is-off：visibility hidden（保留 DOM），ghost 显形
      if (lastPointerType === 'touch') playGhostHintOnce();
    });
  };

  const show = (): void => {
    if (phase === 'visible' || phase === 'showing') return;
    phase = 'showing';
    root.classList.remove('is-off'); // ghost 先隐
    applyClasses(); // is-dimmed 保持 + anim-show（时长换 300ms ease-out，样式仍停在隐藏态）
    raf(() => {
      if (phase !== 'showing') return;
      root.classList.remove('is-dimmed'); // 下一帧释放目标态 → CSS 过渡回到可见
    });
    schedulePhase(SHOW_MS, () => {
      if (phase !== 'showing') return;
      phase = 'visible';
      applyClasses();
    });
  };

  const toggle = (): void => {
    if (phase === 'visible' || phase === 'showing') hide();
    else show();
  };

  // 隐藏钮 / ghost 点击
  hideBtn.addEventListener('click', hide);
  ghostHit.addEventListener('click', show);

  // 键盘 KeyH（输入控件聚焦时不劫持）
  const onKey = (event: KeyboardEvent): void => {
    if (event.code !== 'KeyH' || event.repeat) return;
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
      return;
    }
    toggle();
  };
  window.addEventListener('keydown', onKey);

  // 触屏发现性：最近输入为触屏时，进入 hidden 后播一次呼吸；hidden 中首次触屏同样补播
  const onPointerDown = (event: PointerEvent): void => {
    lastPointerType = event.pointerType || 'mouse';
    if (event.pointerType === 'touch' && phase === 'hidden') playGhostHintOnce();
  };
  window.addEventListener('pointerdown', onPointerDown, { passive: true });

  return {
    isHidden: () => phase === 'hidden',
    destroy(): void {
      if (rafId !== null) cancelRaf(rafId);
      rafId = null;
      if (hintRaf !== null) cancelRaf(hintRaf);
      hintRaf = null;
      hideBtn.removeEventListener('click', hide);
      ghostHit.removeEventListener('click', show);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointerDown);
      root.classList.remove('is-dimmed', 'is-off', 'anim-hide', 'anim-show');
      hideBtn.remove();
      ghostHit.remove();
    },
  };
}
