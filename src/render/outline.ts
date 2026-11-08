// docs/01-整体架构.md §3.2 render/outline.ts —— OutlineSystem：反壳描边为主（八.2「反壳描边或后期描边均可」），
// 物体级开关；T16 落点。规格：docs/04 §5.3「描边方案」实现细则 + §5.6 renderOrder 表（描边壳=1）。
// 要点逐条（docs/04 §5.3）：
//   反壳 = BackSide + 顶点 pos + 世界空间法线×uWidth（相机推拉线宽随透视自然变化）、depthWrite:true、
//   renderOrder=1（本体 0 之后、透明体 10 之前）；壳几何直接引用本体 geometry（SharedAssets 共享缓存，
//   零克隆）；宽度上限 0.06；实例化成对——本体 InstancedMesh 时壳同样 InstancedMesh 共享实例矩阵 buffer
//   （每组恒定 2 DC）；noOutline 物体零成本。
//   宽度档位（1u≈1m 标定）：车辆 0.020–0.025 / 建筑 0.030–0.050 / 道具 0.010–0.016 / 小件 0.008（可选）/
//   底座 0.050（「陈列盒」边线）；描边色三选一：全局 #2f2a33（深暖灰紫）、暖色主导 #3a2e2a、冷色主导
//   #2a3040（按 albedo 色相自动选）。
//   关闭清单（默认无壳）：远景剪影板（D1，本身就是轮廓）、玻璃本体、emissive 灯面、halo/粒子/贴花、
//   内饰组、水面——原型档由 ToonMaterialFactory userData.outline/noOutline 表达（toonMaterial.ts），
//   非工厂材质自动路径默认不开，内饰组经物体级 userData.noOutline 硬开关。
//   后期描边仅留备选接口（PostOutlinePass），不实现（§5.3 选型结论①反壳为主）。
// 帧序落点（§3.5.2 ⑤）：反壳随本体在主 pass 内绘制（壳即场景对象），无独立全屏 pass；InstancedMesh
// 实例数运行期变化时由 update() 对账（Director 可选接入 systems 钩子，静态计数时可零接入）。
import * as THREE from 'three';
import { clamp } from '@/shared/math';

/* ============================== 宽度档位表（docs/04 §5.3） ============================== */

/** 描边宽度上限（世界单位，docs/04 §5.3「描边宽度上限 0.06 单位」）。 */
export const OUTLINE_WIDTH_MAX = 0.06;

/** 宽度档位条目：min/max 为档位区间（docs/04 §5.3 定值），default 为实现期取值（T43 可校准）。 */
export interface OutlineWidthTierSpec {
  readonly min: number;
  readonly max: number;
  readonly default: number;
  readonly note: string;
}

/**
 * 宽度档位表（docs/04 §5.3「宽度档位」行逐字；★按 20×20 底座、1u≈1m 标定，1080p 常态观察距离约 2–3px）。
 */
export const OUTLINE_WIDTH_TIERS = {
  vehicle: { min: 0.02, max: 0.025, default: 0.022, note: '车辆级（视觉主角）' },
  building: { min: 0.03, max: 0.05, default: 0.04, note: '建筑级' },
  prop: { min: 0.01, max: 0.016, default: 0.012, note: '道具级' },
  small: { min: 0.008, max: 0.008, default: 0.008, note: '小件级（可选）' },
  base: { min: 0.05, max: 0.05, default: 0.05, note: '底座级「陈列盒」边线' },
} as const satisfies Readonly<Record<string, OutlineWidthTierSpec>>;

export type OutlineTier = keyof typeof OUTLINE_WIDTH_TIERS;

/* ============================== 描边色三选一（docs/04 §5.3） ============================== */

/**
 * 描边色三选一（docs/04 §5.3）：全局默认 #2f2a33（深暖灰紫，不用纯黑）、暖色主导 #3a2e2a、
 * 冷色主导 #2a3040；六.3 UI 细描边取同一色系（ui 侧自取，不经本表）。
 */
export const OUTLINE_COLORS = {
  default: '#2f2a33',
  warm: '#3a2e2a',
  cool: '#2a3040',
} as const;

/** 模块级 HSL 复用对象（零分配热路径；同 geom/instanced.ts jitterHsl 手法）。 */
const hslScratch = { h: 0, s: 0, l: 0 };

/**
 * 按 albedo 色相自动三选一（docs/04 §5.3「工厂按 albedo 色相自动三选一」）。
 * 色带划分（实现期校准值，T43 可调）：红/橙/黄（0–75°、330–360°）→ 暖；青/蓝/紫（165–285°）→ 冷；
 * 绿/黄绿/品红过渡带与近中性色（s<0.15）→ 全局默认深暖灰紫。
 */
export function pickOutlineColor(albedo: THREE.ColorRepresentation): string {
  new THREE.Color(albedo).getHSL(hslScratch, THREE.SRGBColorSpace);
  if (hslScratch.s < 0.15) return OUTLINE_COLORS.default;
  const deg = hslScratch.h * 360;
  if (deg <= 75 || deg >= 330) return OUTLINE_COLORS.warm;
  if (deg >= 165 && deg <= 285) return OUTLINE_COLORS.cool;
  return OUTLINE_COLORS.default;
}

/* ============================== 反壳材质（docs/04 §5.3 壳材质规格） ============================== */

export interface OutlineShellMaterialParams {
  /** 描边宽度（世界单位，超 OUTLINE_WIDTH_MAX 钳制） */
  width?: number;
  /** 描边色（缺省全局 #2f2a33） */
  color?: THREE.ColorRepresentation;
  name?: string;
}

/**
 * 反壳材质：ShaderMaterial{ side:BackSide, 顶点 pos+世界空间法线×uWidth, depthWrite:true }（§5.3 逐字）。
 * 顶点外扩取世界空间法线——相机推拉时线宽随透视自然变化（近粗远细，与实物模型勾线一致）。
 * 法线经 mat3(modelMatrix)（含实例矩阵）变换：与 geom/instanced.ts 壳同假设——部件用近均匀缩放；
 * #ifdef USE_INSTANCING 兼容裸 Mesh 与 InstancedMesh 双用（同一材质可同时服务两类壳，程序按物体分编译）。
 * 不接 fog：描边是结构线，重雾下本体淡出而线保持恒色（§5.3 未列 fog，与 InstancedGroup 壳一致）。
 */
export function makeOutlineShellMaterial(params: OutlineShellMaterialParams = {}): THREE.ShaderMaterial {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uWidth: { value: clamp(params.width ?? OUTLINE_WIDTH_TIERS.prop.default, 0, OUTLINE_WIDTH_MAX) },
      uColor: { value: new THREE.Color(params.color ?? OUTLINE_COLORS.default) },
    },
    vertexShader: /* glsl */ `
      uniform float uWidth;
      void main() {
        mat4 instance = mat4( 1.0 );
        #ifdef USE_INSTANCING
          instance = instanceMatrix;
        #endif
        vec4 worldPos = modelMatrix * instance * vec4( position, 1.0 );
        vec3 worldNormal = normalize( mat3( modelMatrix ) * mat3( instance ) * normal );
        worldPos.xyz += worldNormal * uWidth;
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      void main() {
        gl_FragColor = vec4( uColor, 1.0 );
        #include <colorspace_fragment>
      }
    `,
    side: THREE.BackSide,
    depthWrite: true,
  });
  material.name = params.name ?? 'outlineShell';
  return material;
}

/**
 * 硬边处理帮手（§5.3「需要描边的部件在工厂里按面拆分顶点法线」）：toNonIndexed 拆分后重算法线，
 * 使共面三角各自携带面法线 → 反壳外扩沿面方向，硬边转折处描边不断线。平滑曲面（Lathe/球类）保持
 * 共享法线，无需调用本帮手。返回新几何（不就地改写入参，可安全用于 SharedAssets 缓存几何的变体）。
 */
export function splitHardEdgesForOutline(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const split = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  split.computeVertexNormals();
  return split;
}

/* ============================== 后期描边备选接口（只留接口，不实现） ============================== */

/**
 * 后期描边备选接口（docs/04 §5.3 选型结论：反壳为主，后期描边仅留备选接口不实现）。
 * 备选实现（如 Sobel 全屏 pass）日后落地时满足本接口即可替换/并存；当前项目取反壳，
 * 理由见 §5.3 五条（观感/性能结构/400 组合零分支/依赖可靠/内结构线用不上）。
 */
export interface PostOutlinePass {
  readonly enabled: boolean;
  setSize(width: number, height: number): void;
  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): void;
  dispose(): void;
}

/* ============================== OutlineSystem ============================== */

export interface OutlineOptions {
  /** 宽度档位（与 width 二选一；同时给出时 width 优先） */
  tier?: OutlineTier;
  /** 显式宽度（世界单位，超 OUTLINE_WIDTH_MAX 钳制） */
  width?: number;
  /** 显式描边色（给出后不再按 albedo 三选一） */
  color?: THREE.ColorRepresentation;
  /** albedo → 三选一自动取色（enable 手动路径默认不启用；applyTo 默认启用） */
  albedo?: THREE.ColorRepresentation;
}

export interface OutlineApplyDefaults {
  /** 整批默认档位（缺省 'prop' 道具级；车辆/底座由 Director 分模块显式传入） */
  defaultTier?: OutlineTier;
  /** 按材质 albedo 色相自动三选一（默认 true，docs/04 §5.3） */
  colorFromAlbedo?: boolean;
}

interface ShellRecord {
  readonly shell: THREE.Mesh;
  readonly body: THREE.Mesh;
  readonly instanced: boolean;
}

interface InstancedGroupDuck {
  body?: THREE.Object3D;
  shell?: THREE.Object3D | null;
}

/**
 * OutlineSystem：反壳描边系统（§3.4-7「ToonMaterialFactory 建材质时自动配置描边壳，物体级开关」；T16）。
 *
 * - enable(obj, opts)：给 Mesh/InstancedMesh 建反壳（壳=子对象继承宿主变换「随父级变换」；renderOrder=1；
 *   geometry 直接引用本体，零克隆）。显式指令：可越过材质档标记，但不可越过物体级 userData.noOutline 硬开关。
 * - disable(obj)：摘壳。壳/材质/几何均共享缓存，摘壳零 dispose（§3.5.3 卸载路径由 T17 逐场景 removeFrom）。
 * - applyTo(root, defaults)：装配后整批自动开壳——仅对「材质 userData.outline === true 且无 noOutline」的
 *   网格生效（工厂档标记）；物体级 userData.noOutline 子树整体跳过；已带 InstancedGroup 成对壳的本体跳过。
 *   非工厂材质默认不开（§3.7-4「轮廓强物体开描边，细碎小物关闭」），例外走 enable()。
 * - update()：实例化壳 count 对账（InstancedMesh 实例数运行期变化时共享矩阵 buffer 的壳需同步）。
 *
 * 阴影/拾取：壳不投影不接收阴影、不参与 raycast（纯视觉结构线）。
 */
export class OutlineSystem {
  private readonly shells = new Map<THREE.Object3D, ShellRecord>();
  private readonly shellMaterials = new Map<string, THREE.ShaderMaterial>();

  /** 当前壳数（= 增量 draw call 对数；§3.7 #8 DC 预算含描边壳）。 */
  get count(): number {
    return this.shells.size;
  }

  /** 显式开壳（幂等：已启用则维持现状；改参先 disable 再 enable）。 */
  enable(obj: THREE.Object3D, opts: OutlineOptions = {}): void {
    if (this.shells.has(obj)) return;
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) {
      throw new TypeError(`[outline] enable() 仅接受 Mesh/InstancedMesh：${obj.name || obj.type}`);
    }
    if (obj.userData.noOutline === true) {
      throw new Error(
        `[outline] 「${obj.name || obj.type}」已标记 noOutline（物体级硬开关，§3.7-4）——如需描边请先摘除标记`,
      );
    }
    const instanced = (mesh as THREE.InstancedMesh).isInstancedMesh === true;
    if (instanced && this.hasPairedGroupShell(mesh as THREE.InstancedMesh)) {
      throw new Error(
        `[outline] 「${obj.name || obj.type}」已由 InstancedGroup(withShell) 成对建壳——双壳会加倍 DC，请二选一`,
      );
    }

    const width = this.resolveWidth(opts);
    const color = opts.color
      ?? (opts.albedo !== undefined ? pickOutlineColor(opts.albedo) : OUTLINE_COLORS.default);
    const material = this.getShellMaterial(width, color);

    let shell: THREE.Mesh;
    if (instanced) {
      // §5.3 实例化成对：壳与本体共享同一 instanceMatrix buffer（一份上传，恒 2 DC/组）
      const body = mesh as THREE.InstancedMesh;
      const shellInst = new THREE.InstancedMesh(body.geometry, material, body.instanceMatrix.count);
      shellInst.instanceMatrix = body.instanceMatrix;
      shellInst.count = body.count;
      shellInst.frustumCulled = false; // 实例跨底座分布，同 geom/instanced.ts 取舍
      shell = shellInst;
    } else {
      shell = new THREE.Mesh(mesh.geometry, material);
    }
    shell.renderOrder = 1; // §5.6：描边壳=1（本体 0 之后、玻璃 10/halo 20/粒子 30 之前）
    shell.castShadow = false;
    shell.receiveShadow = false;
    shell.raycast = () => undefined; // 纯视觉结构线，不参与拾取
    shell.name = `${mesh.name || 'mesh'}/outlineShell`;
    shell.userData.isOutlineShell = true; // 本系统壳标记（applyTo/removeFrom 遍历豁免）

    mesh.add(shell); // 子对象继承宿主变换：场景动画改 body 位移/旋转时壳同步（§5.3「随父级变换」）
    this.shells.set(obj, { shell, body: mesh, instanced });
  }

  /** 摘壳（幂等；几何/材质共享缓存不 dispose）。 */
  disable(obj: THREE.Object3D): void {
    const record = this.shells.get(obj);
    if (!record) return;
    record.shell.removeFromParent();
    this.shells.delete(obj);
  }

  /** 是否已开壳。 */
  isEnabled(obj: THREE.Object3D): boolean {
    return this.shells.has(obj);
  }

  /**
   * 装配后整批自动开壳（§3.4-7「ToonMaterialFactory 建材质时自动配置描边壳」的批量入口；T17 装配期调用）。
   * 规则：材质档 userData.outline === true 且无任何 noOutline/关闭档 → 开；物体级 userData.noOutline
   * 子树整体跳过；描边色默认按材质 albedo 三选一。返回本次新开壳数。
   */
  applyTo(root: THREE.Object3D, defaults: OutlineApplyDefaults = {}): number {
    const colorFromAlbedo = defaults.colorFromAlbedo ?? true;
    let applied = 0;
    const visit = (obj: THREE.Object3D): void => {
      if (obj.userData.isOutlineShell === true) return; // 本系统壳不再套壳
      if (obj.userData.noOutline === true) return; // 物体级硬开关：子树整体跳过（内饰组/细碎小物等）
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh && mesh.geometry && !this.shells.has(obj)) {
        const decision = this.autoDecision(mesh);
        if (decision.eligible) {
          this.enable(obj, {
            tier: defaults.defaultTier ?? 'prop',
            color:
              colorFromAlbedo && decision.albedo !== undefined
                ? pickOutlineColor(decision.albedo)
                : undefined,
          });
          applied += 1;
        }
      }
      for (const child of obj.children) visit(child);
    };
    visit(root);
    return applied;
  }

  /** 摘除 root 子树内本系统所开全部壳（场景/车型卸载，§3.5.3）；返回摘除数。 */
  removeFrom(root: THREE.Object3D): number {
    const targets: THREE.Object3D[] = [];
    root.traverse((obj) => {
      if (obj.userData.isOutlineShell === true) return; // 壳随宿主一并摘除
      if (this.shells.has(obj)) targets.push(obj);
    });
    for (const obj of targets) this.disable(obj);
    return targets.length;
  }

  /**
   * 每帧对账（可选接入 §3.5.2 ③ 公共系统钩子）：实例化壳 count 跟随本体（实例数运行期增减时保持
   * 「恒 2 DC/组」且不绘制空实例）。纯 Mesh 壳零工作。
   */
  update(): void {
    for (const record of this.shells.values()) {
      if (!record.instanced) continue;
      (record.shell as THREE.InstancedMesh).count = (record.body as THREE.InstancedMesh).count;
    }
  }

  /** 释放缓存的壳材质（仅整体销毁时调用，同 ToonMaterialFactory.disposeAll 约定；几何归 SharedAssets）。 */
  disposeAll(): void {
    for (const material of this.shellMaterials.values()) material.dispose();
    this.shellMaterials.clear();
    this.shells.clear();
  }

  /* —— 内部 —— */

  private resolveWidth(opts: OutlineOptions): number {
    if (opts.width !== undefined) return clamp(opts.width, 0, OUTLINE_WIDTH_MAX);
    const tier = opts.tier ?? 'prop';
    return clamp(OUTLINE_WIDTH_TIERS[tier].default, 0, OUTLINE_WIDTH_MAX);
  }

  private getShellMaterial(width: number, color: THREE.ColorRepresentation): THREE.ShaderMaterial {
    const key = `w${width.toFixed(4)}|c${new THREE.Color(color).getHexString(THREE.SRGBColorSpace)}`;
    const hit = this.shellMaterials.get(key);
    if (hit) return hit;
    const material = makeOutlineShellMaterial({ width, color });
    this.shellMaterials.set(key, material);
    return material;
  }

  /** InstancedGroup(withShell) 成对壳侦测（geom/instanced.ts 在宿主 parent.userData 记 instancedGroup）。 */
  private hasPairedGroupShell(inst: THREE.InstancedMesh): boolean {
    const owner = inst.parent?.userData.instancedGroup as InstancedGroupDuck | undefined;
    return owner !== undefined && owner.body === inst && owner.shell != null;
  }

  /**
   * 自动开壳判定（applyTo 专用）：工厂档 outline === true 且无关闭标记才开；玻璃/水面/灯面档与
   * userData.noOutline 在上游已拦，此处兜底（§5.3 关闭清单）；返回 albedo 供三选一取色。
   */
  private autoDecision(mesh: THREE.Mesh): { eligible: boolean; albedo?: THREE.Color } {
    // 已由 InstancedGroup(withShell) 成对建壳的本体自动跳过（applyTo 不抛错，双壳路径只在 enable 手动触发）
    if (
      (mesh as THREE.InstancedMesh).isInstancedMesh === true
      && this.hasPairedGroupShell(mesh as THREE.InstancedMesh)
    ) {
      return { eligible: false };
    }
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    if (materials.length === 0) return { eligible: false };
    let markedOutline = false;
    let albedo: THREE.Color | undefined;
    for (const material of materials) {
      const ud = material.userData as {
        outline?: boolean;
        noOutline?: boolean;
        toonArchetype?: string;
      };
      if (ud.noOutline === true || ud.outline === false) return { eligible: false };
      if (
        ud.toonArchetype === 'glass' || ud.toonArchetype === 'water'
        || ud.toonArchetype === 'emissiveLamp'
      ) {
        return { eligible: false }; // §5.3 关闭清单兜底（玻璃本体/水面/emissive 灯面）
      }
      if (ud.outline === true) markedOutline = true;
      if (!albedo && 'color' in material) albedo = (material as THREE.MeshStandardMaterial).color;
    }
    // 非工厂材质（贴花/剪影板/光斑等裸 BasicMaterial）默认不开——细碎小物零成本（§3.7-4）
    if (!markedOutline) return { eligible: false };
    return { eligible: true, albedo };
  }
}

/** 全局描边系统单例（同 toonMaterials 单例约定；T17 渲染管线/装配期取用）。 */
export const outlineSystem = new OutlineSystem();
