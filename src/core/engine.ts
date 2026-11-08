// docs/01-整体架构.md §3.2 core/engine.ts —— renderer/scene/camera/渲染循环/resize（八.5）。
// 固定帧序（docs/01 §3.5.2）：Clock → Transition → 公共系统 → 场景动画 → render；
// 画布自适应（docs/06 §6.7）：applySize 合并到 rAF，一帧最多一次，四路触发源；
// 色彩输出（docs/04 L25）：SRGBColorSpace + NoToneMapping（色带平涂禁 tone mapping）。T02 落点。
import * as THREE from 'three';
import { OrbitCameraControls } from '@/core/controls';
import { clamp } from '@/shared/math';

/** 帧钩子签名：dt 为钳制后的帧间隔（秒）；elapsed 为启动以来累计秒 */
export type FrameHook = (dt: number, elapsed: number) => void;

/**
 * 可注入的阶段钩子（docs/01 §3.5.2 帧序 ①–④；T17 Director/TransitionController 接线落点）：
 * ① clock —— RhythmClock.update（T08）
 * ② transition —— TransitionController.update（T17）
 * ③ systems —— 公共系统数组：Wind/Particles/LightBreath/Atmosphere/Scheduler（T09–T15），按注册顺序执行
 * ④ scene —— 场景帧驱动数组：lightHooks.update + SceneAnimation[]（T17 装配注入）
 * ⑤ render 由 Engine 固定执行；OutlineSystem 反壳 pass / 可选 postfx 于 T16 起在此阶段扩展。
 */
export interface EngineStageHooks {
  clock: FrameHook | null;
  transition: FrameHook | null;
  systems: FrameHook[];
  scene: FrameHook[];
}

/** DEV 专属渲染计数（docs/08 T02：仅 DEV，计数器不进产物） */
export interface EngineStats {
  drawCalls: number;
  triangles: number;
  materials: number;
  geometries: number;
  textures: number;
}

/**
 * DEV 专属 DrawCall/材质计数器（docs/08 T02）。置于模块作用域而非类字段：类属性名不参与混淆，
 * 模块级绑定在非 DEV 构建下经静态折叠 + 未引用树摇后从产物零残留；main.ts 仅在 DEV 把它挂到调试句柄上。
 */
export const devStats: EngineStats | null = import.meta.env.DEV
  ? { drawCalls: 0, triangles: 0, materials: 0, geometries: 0, textures: 0 }
  : null;

export interface EngineOptions {
  /** 场景底色（正式程序化渐变天空由 render/sky.ts 接管） */
  background?: THREE.ColorRepresentation;
}

/** 视锥（docs/06 §6.7：fov 40 / near 0.1 / far 200，★覆盖 20×20 底座+底座内远景，T39 截图终校） */
const CAMERA_FOV = 40;
const CAMERA_NEAR = 0.1;
const CAMERA_FAR = 200;
/** DPR 钳制上限（docs/08 T02） */
const MAX_PIXEL_RATIO = 2;
/** 单帧 dt 钳制上限（秒）：后台切回/断点大步长不冲垮阻尼与动画 */
const MAX_FRAME_DT = 0.1;

export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  /** 轨道相机（docs/01 §3.5.1：new Engine 即含 Controls/resize） */
  readonly controls: OrbitCameraControls;
  /** 阶段钩子（T17 接线：clock/transition 赋值单钩，systems/scene push 数组） */
  readonly hooks: EngineStageHooks = { clock: null, transition: null, systems: [], scene: [] };

  private readonly container: HTMLElement;
  private readonly resizeObserver: ResizeObserver;
  private resizeDirty = false;
  private lastFrameMs: number | null = null;
  private elapsed = 0;

  constructor(container: HTMLElement | string = '#app', options: EngineOptions = {}) {
    const el =
      typeof container === 'string' ? document.querySelector<HTMLElement>(container) : container;
    if (!el) throw new Error(`Engine：找不到容器 ${String(container)}`);
    this.container = el;

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace; // docs/04 L25
    this.renderer.toneMapping = THREE.NoToneMapping; // 色带平涂，任何 tone mapping 都会压出灰阶（docs/04 L25）
    el.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    if (options.background !== undefined) {
      this.scene.background = new THREE.Color(options.background);
    }

    const w = el.clientWidth || window.innerWidth;
    const h = el.clientHeight || window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(CAMERA_FOV, w / h, CAMERA_NEAR, CAMERA_FAR);
    this.controls = new OrbitCameraControls(this.camera, this.renderer.domElement);

    // 画布自适应四路触发源（docs/06 §6.7）：ResizeObserver（容器级）+ window resize + orientationchange + visualViewport resize
    this.resizeObserver = new ResizeObserver(this.onResizeRequested);
    this.resizeObserver.observe(el);
    window.addEventListener('resize', this.onResizeRequested);
    window.addEventListener('orientationchange', this.onResizeRequested);
    window.visualViewport?.addEventListener('resize', this.onResizeRequested);

    this.applySize();
  }

  /** 启动渲染循环（幂等）；正式天空/装配由 main.ts 组装后调用 */
  start(): void {
    this.renderer.setAnimationLoop(this.tick);
  }

  stop(): void {
    this.renderer.setAnimationLoop(null);
    this.lastFrameMs = null;
  }

  dispose(): void {
    this.stop();
    this.resizeObserver.disconnect();
    window.removeEventListener('resize', this.onResizeRequested);
    window.removeEventListener('orientationchange', this.onResizeRequested);
    window.visualViewport?.removeEventListener('resize', this.onResizeRequested);
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private readonly tick = (timeMs: number): void => {
    if (this.resizeDirty) this.applySize(); // applySize 合并到 rAF：一帧最多一次（docs/06 §6.7）

    const dt =
      this.lastFrameMs === null ? 0 : clamp((timeMs - this.lastFrameMs) / 1000, 0, MAX_FRAME_DT);
    this.lastFrameMs = timeMs;
    this.elapsed += dt;

    // ① RhythmClock（T08 接线）
    this.hooks.clock?.(dt, this.elapsed);
    // 相机阻尼：Clock 之后、render 之前（docs/06 §6.7）
    this.controls.update(dt);
    // ② TransitionController（T17 接线）
    this.hooks.transition?.(dt, this.elapsed);
    // ③ 公共系统
    for (const hook of this.hooks.systems) hook(dt, this.elapsed);
    // ④ 场景帧驱动
    for (const hook of this.hooks.scene) hook(dt, this.elapsed);
    // ⑤ 主 pass（OutlineSystem 反壳 pass → 可选 postfx，T16 起扩展）
    this.renderer.render(this.scene, this.camera);

    // DEV 计数（docs/08 T02）：非 DEV 构建下整块静态剔除
    if (import.meta.env.DEV && devStats) {
      const info = this.renderer.info;
      devStats.drawCalls = info.render.calls;
      devStats.triangles = info.render.triangles;
      devStats.geometries = info.memory.geometries;
      devStats.textures = info.memory.textures;
      let materials = 0;
      const seen = new Set<string>();
      this.scene.traverse((obj) => {
        const material = (obj as THREE.Mesh).material;
        if (!material) return;
        for (const m of Array.isArray(material) ? material : [material]) {
          if (!seen.has(m.uuid)) {
            seen.add(m.uuid);
            materials += 1;
          }
        }
      });
      devStats.materials = materials;
    }
  };

  private readonly onResizeRequested = (): void => {
    this.resizeDirty = true;
  };

  private applySize(): void {
    this.resizeDirty = false;
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    // devicePixelRatio 随浏览器缩放/跨屏迁移变化，每次一并重钳
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
    this.renderer.setSize(w, h, false); // updateStyle=false：CSS 全权负责（docs/06 §6.7，index.html 已定 100%）
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}
