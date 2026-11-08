// docs/01-整体架构.md §3.2 core/controls.ts —— 轨道相机：拖拽旋转、滚轮/双指缩放，鼠标+触屏
// （一.1/八.5；docs/06 §6.7 自研 U4，不引 OrbitControls）。T03 落点。
import * as THREE from 'three';
import { clamp, damp } from '@/shared/math';

/** 俯仰约束（docs/06 §6.7：phi∈[0.35,1.42]rad ≈20°俯视~81°贴地平，永不钻到底座下方） */
const PHI_MIN = 0.35;
const PHI_MAX = 1.42;
/** 距离约束（docs/06 §6.7：radius∈[5.5,20]，按 20×20 底座重标定） */
const RADIUS_MIN = 5.5;
const RADIUS_MAX = 20;

/**
 * 默认机位（按 20×20 底座重标定，docs/06 §6.7 ★项）：theta −0.62rad(−35.5°，沿用 10×10 方位角基线)、
 * phi 1.05rad(极角 60°，仰角 30°，比 10×10 的 1.13 略高以纳入放大的底座布局)、radius 18
 * （16:9 / fov40 下底座远景两角入画且保留拉远余量；近缘扫出画底为既定构图）、target(0, 0.8, 0)。
 * 实现期初标值，T39/T45 截图终校（docs/08 L106/L117）。
 */
const DEFAULT_THETA = -0.62;
const DEFAULT_PHI = 1.05;
const DEFAULT_RADIUS = 18;
const DEFAULT_TARGET_Y = 0.8;

/** 旋转灵敏度 rad/px（1080p 手感定值，docs/06 §6.7）；小窗整体乘 min(1, 720/视口宽) 自动放缓 */
const ROTATE_SENS_THETA = 0.0055;
const ROTATE_SENS_PHI = 0.0045;
const SMALL_VIEWPORT_WIDTH = 720;
/** 滚轮乘性缩放系数（docs/06 §6.7：goal.radius·e^(deltaY·0.0011)） */
const WHEEL_SENS = 0.0011;
/** 指数阻尼速率（docs/06 §6.7：k=1−e^(−9·dt)，松手 ~0.35s 缓停、无过冲无回弹） */
const DAMPING_LAMBDA = 9;
/** 活动指针表容量：双指纯缩放，第三指忽略（docs/06 §6.7） */
const MAX_POINTERS = 2;
/** 行模式滚轮（Firefox deltaMode=1）按 16px/行归一为像素口径 */
const WHEEL_LINE_HEIGHT = 16;

export interface OrbitPose {
  theta: number;
  phi: number;
  radius: number;
}

interface PointerPos {
  x: number;
  y: number;
}

export interface OrbitCameraOptions {
  /** 固定注视点（无平移——微缩陈列盒构图由固定 target 保证，docs/06 §6.7）；默认 (0, 0.8, 0) */
  target?: THREE.Vector3;
}

/**
 * 自研轨道相机：球坐标 {theta, phi, radius, target} 双份（goal 用户意图 / view 阻尼实际），
 * Pointer Events 统一鼠标+触屏：单指拖拽=旋转、滚轮=乘性缩放、双指=纯缩放（中点位移不映射旋转）、
 * 边界夹取、touch-action:none。target 固定；reset 仅初始化——初始机位只在构造时落位，
 * 不提供运行期 reset 入口（docs/08 T03；docs/06 §6.10-⑨ 切换前后相机参数逐位相等）。
 */
export class OrbitCameraControls {
  private readonly camera: THREE.PerspectiveCamera;
  private readonly el: HTMLElement;
  private readonly target: THREE.Vector3;
  private readonly goal: OrbitPose;
  private readonly view: OrbitPose;

  private readonly pointers = new Map<number, PointerPos>();
  private pinchPrevDist = 0;

  constructor(camera: THREE.PerspectiveCamera, el: HTMLElement, options: OrbitCameraOptions = {}) {
    this.camera = camera;
    this.el = el;
    this.target = options.target ? options.target.clone() : new THREE.Vector3(0, DEFAULT_TARGET_Y, 0);
    // 球坐标 → 直角坐标与 three.js Spherical 同口径：x=r·sinφ·sinθ / y=r·cosφ / z=r·sinφ·cosθ
    this.goal = { theta: DEFAULT_THETA, phi: DEFAULT_PHI, radius: DEFAULT_RADIUS };
    this.view = { ...this.goal };
    this.applyView();

    el.style.touchAction = 'none'; // docs/06 §6.7（index.html 基线 CSS 未含，由控件自设兜底）
    el.addEventListener('pointerdown', this.onPointerDown);
    el.addEventListener('pointermove', this.onPointerMove);
    el.addEventListener('pointerup', this.onPointerUp);
    el.addEventListener('pointercancel', this.onPointerCancel);
    el.addEventListener('wheel', this.onWheel, { passive: false });
    el.addEventListener('contextmenu', this.onContextMenu);
  }

  /** 每帧阻尼推进并写回相机；由 Engine 帧序调用（Clock 之后、render 之前，docs/06 §6.7） */
  update(dt: number): void {
    this.view.theta = damp(this.view.theta, this.goal.theta, DAMPING_LAMBDA, dt);
    this.view.phi = damp(this.view.phi, this.goal.phi, DAMPING_LAMBDA, dt);
    this.view.radius = damp(this.view.radius, this.goal.radius, DAMPING_LAMBDA, dt);
    this.applyView();
  }

  /** 阻尼后的实际位姿（供 HUD/校准与 §6.10-⑨「切换前后相机参数逐位相等」核验） */
  get pose(): OrbitPose {
    return { ...this.view };
  }

  /** 用户意图位姿（未阻尼） */
  get goalPose(): OrbitPose {
    return { ...this.goal };
  }

  dispose(): void {
    this.el.removeEventListener('pointerdown', this.onPointerDown);
    this.el.removeEventListener('pointermove', this.onPointerMove);
    this.el.removeEventListener('pointerup', this.onPointerUp);
    this.el.removeEventListener('pointercancel', this.onPointerCancel);
    this.el.removeEventListener('wheel', this.onWheel);
    this.el.removeEventListener('contextmenu', this.onContextMenu);
  }

  private applyView(): void {
    const sinPhi = Math.sin(this.view.phi);
    this.camera.position.set(
      this.target.x + this.view.radius * sinPhi * Math.sin(this.view.theta),
      this.target.y + this.view.radius * Math.cos(this.view.phi),
      this.target.z + this.view.radius * sinPhi * Math.cos(this.view.theta),
    );
    this.camera.lookAt(this.target);
  }

  private readonly onPointerDown = (e: PointerEvent): void => {
    if (this.pointers.size >= MAX_POINTERS) return; // 第三指忽略（指针表容量 2）
    try {
      this.el.setPointerCapture(e.pointerId); // 鼠标出窗续跟；合成/已失效指针安全跳过（同 three OrbitControls 做法）
    } catch {
      /* 忽略：pointerdown 时指针必活跃，此分支仅为防御 */
    }
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === MAX_POINTERS) this.pinchPrevDist = this.pinchDistance();
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    const prev = this.pointers.get(e.pointerId);
    if (!prev) return; // 未按下的指针（悬停移动）不参与
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    prev.x = e.clientX;
    prev.y = e.clientY;

    if (this.pointers.size === 1) {
      // 单指/鼠标拖拽 = 旋转；小窗按 min(1, 720/视口宽) 自动放缓；phi 边界夹取
      const sens = Math.min(1, SMALL_VIEWPORT_WIDTH / Math.max(1, this.el.clientWidth));
      this.goal.theta -= dx * ROTATE_SENS_THETA * sens;
      this.goal.phi = clamp(this.goal.phi - dy * ROTATE_SENS_PHI * sens, PHI_MIN, PHI_MAX);
      return;
    }
    // 双指 = 纯缩放：goal.radius·dPrev/dNow；双指中点位移不映射旋转（防误旋，docs/06 §6.7）
    const dist = this.pinchDistance();
    if (this.pinchPrevDist > 0 && dist > 0) {
      this.goal.radius = clamp(this.goal.radius * (this.pinchPrevDist / dist), RADIUS_MIN, RADIUS_MAX);
    }
    this.pinchPrevDist = dist;
  };

  private readonly onPointerUp = (e: PointerEvent): void => {
    this.pointers.delete(e.pointerId);
    this.pinchPrevDist = 0;
  };

  private readonly onPointerCancel = (): void => {
    // 来电/系统手势打断：清空指针表不残留（docs/06 §6.7）
    this.pointers.clear();
    this.pinchPrevDist = 0;
  };

  private readonly onWheel = (e: WheelEvent): void => {
    e.preventDefault(); // wheel passive:false + preventDefault（docs/06 §6.7）
    const deltaY = e.deltaMode === 1 ? e.deltaY * WHEEL_LINE_HEIGHT : e.deltaY;
    this.goal.radius = clamp(this.goal.radius * Math.exp(deltaY * WHEEL_SENS), RADIUS_MIN, RADIUS_MAX);
  };

  private readonly onContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
  };

  private pinchDistance(): number {
    const pts = Array.from(this.pointers.values());
    const a = pts[0];
    const b = pts[1];
    if (!a || !b) return 0;
    return Math.hypot(a.x - b.x, a.y - b.y);
  }
}
