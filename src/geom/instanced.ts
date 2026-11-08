// docs/01-整体架构.md §3.2 geom/instanced.ts —— InstancedGroup：重复元素实例化帮手（八.3）。
// docs/04-三渲二渲染.md §5.6：
//   - new InstancedGroup(geometry, material, { capacity, withShell })；add(matrix, optionalColor)；
//   - instanceColor 只做同种个体 ±5% 明度/色相微差（防「复印感」）；
//   - withShell:true 成对创建反壳 InstancedMesh（§5.3 实例化成对：共享实例矩阵 buffer，每组恒定 2 DC）；
//   - 判据「同类 ≥3 个必实例化」由 parts/场景层遵守，本类负责容量超限即抛错（尽早暴露）。
import * as THREE from 'three';

// ---------------------------------------------------------------------------
// 反壳默认材质（§5.3 壳材质规格：BackSide + 世界空间法线×uWidth 顶点外扩 + depthWrite:true）
// 注：T16 OutlineSystem 落地后可经 withShell.shellMaterial 注入统一描边系统；本默认实现保持
// InstancedGroup 自立可用（宽度档位见 §5.3 档位表，调用方按物体级传入）。
// ---------------------------------------------------------------------------

export interface ShellMaterialParams {
  /** 描边宽度（世界单位）；道具级默认 0.012，§5.3 上限 0.06 */
  width?: number;
  /** 缺省取全局描边色 #2f2a33（§5.3） */
  color?: THREE.ColorRepresentation;
}

export function makeShellMaterial(params: ShellMaterialParams = {}): THREE.ShaderMaterial {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uWidth: { value: params.width ?? 0.012 },
      uColor: { value: new THREE.Color(params.color ?? '#2f2a33') },
    },
    vertexShader: /* glsl */ `
      uniform float uWidth;
      void main() {
        // 实例矩阵：three 对 InstancedMesh 注入 USE_INSTANCING 定义与 instanceMatrix 属性
        mat4 instance = mat4( 1.0 );
        #ifdef USE_INSTANCING
          instance = instanceMatrix;
        #endif
        vec4 worldPos = modelMatrix * instance * vec4( position, 1.0 );
        // 世界空间法线×uWidth：相机推拉时线宽随透视自然变化（近粗远细，§5.3）
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
  material.name = 'shell';
  return material;
}

// ---------------------------------------------------------------------------
// InstancedGroup
// ---------------------------------------------------------------------------

export interface InstancedGroupOptions {
  /** 容量上限（build 期一次性估足；超限 add 抛错） */
  capacity: number;
  /** true 成对创建反壳（共享矩阵 buffer，恒 2 DC/组，§5.6）；可传对象注入壳材质/宽度/颜色 */
  withShell?: boolean | {
    shellMaterial?: THREE.Material;
    width?: number;
    color?: THREE.ColorRepresentation;
  };
  name?: string;
  /** 色相/饱和/明度抖动幅度（§5.6 ±5% 明度/色相微差；0 关闭） */
  jitter?: { hue?: number; saturation?: number; lightness?: number };
}

const JITTER_DEFAULTS = { hue: 0.02, saturation: 0.05, lightness: 0.05 };

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const jitterHsl = { h: 0, s: 0, l: 0 };

export class InstancedGroup {
  readonly group: THREE.Group;
  readonly body: THREE.InstancedMesh;
  readonly shell: THREE.InstancedMesh | null;
  readonly capacity: number;

  private readonly jitter: { hue: number; saturation: number; lightness: number };
  private readonly rng: () => number;
  private readonly ownsShellMaterial: boolean;
  private count_ = 0;

  constructor(geometry: THREE.BufferGeometry, material: THREE.Material, options: InstancedGroupOptions) {
    this.capacity = Math.max(1, Math.floor(options.capacity));
    this.jitter = {
      hue: options.jitter?.hue ?? JITTER_DEFAULTS.hue,
      saturation: options.jitter?.saturation ?? JITTER_DEFAULTS.saturation,
      lightness: options.jitter?.lightness ?? JITTER_DEFAULTS.lightness,
    };
    this.rng = mulberry32(options.name === undefined ? 0x9e3779b9 : hashSeed(options.name));

    this.body = new THREE.InstancedMesh(geometry, material, this.capacity);
    this.body.count = 0;
    // 实例跨底座分布，包围球按容量估会误剔——小场景直接关剔除（Draw Call 预算内可控）
    this.body.frustumCulled = false;
    this.body.name = `${options.name ?? 'instanced'}/body`;

    let shell: THREE.InstancedMesh | null = null;
    this.ownsShellMaterial = false;
    if (options.withShell === true || (typeof options.withShell === 'object' && options.withShell !== null)) {
      const shellOpts = typeof options.withShell === 'object' ? options.withShell : {};
      let shellMaterial: THREE.Material;
      if (shellOpts.shellMaterial) {
        shellMaterial = shellOpts.shellMaterial;
      } else {
        shellMaterial = makeShellMaterial({ width: shellOpts.width, color: shellOpts.color });
        this.ownsShellMaterial = true;
      }
      shell = new THREE.InstancedMesh(geometry, shellMaterial, 1);
      // §5.3 实例化成对：壳与本体共享同一 instanceMatrix attribute（一份上传，恒 2 DC）
      shell.instanceMatrix = this.body.instanceMatrix;
      shell.count = 0;
      shell.frustumCulled = false;
      shell.renderOrder = 1; // §5.6：描边壳 renderOrder=1（本体 0 之后、透明体 10 之前）
      shell.name = `${options.name ?? 'instanced'}/shell`;
    }
    this.shell = shell;

    this.group = new THREE.Group();
    this.group.name = options.name ?? 'instanced';
    this.group.userData.instancedGroup = this;
    this.group.add(this.body);
    if (shell) this.group.add(shell);
  }

  get count(): number {
    return this.count_;
  }

  /**
   * 追加一个实例。color 传入时做 ±5% 明度/色相微差后写入 instanceColor（§5.6 防「复印感」）。
   * 批量 add 结束后矩阵/颜色缓冲在下一渲染帧统一上传（needsUpdate 幂置位）。
   */
  add(matrix: THREE.Matrix4, color?: THREE.ColorRepresentation): void {
    if (this.count_ >= this.capacity) {
      throw new Error(`[instanced] 容量超限 ${this.count_}/${this.capacity}（${this.group.name}）——build 期请估足容量`);
    }
    this.body.setMatrixAt(this.count_, matrix);
    if (color !== undefined) {
      this.body.setColorAt(this.count_, this.jitterColor(color));
      this.body.instanceColor!.needsUpdate = true;
    }
    this.count_ += 1;
    this.body.count = this.count_;
    this.body.instanceMatrix.needsUpdate = true;
    if (this.shell) this.shell.count = this.count_;
  }

  /** 清空实例（重排布时复用同一组 DC 资源）。 */
  clear(): void {
    this.count_ = 0;
    this.body.count = 0;
    if (this.shell) this.shell.count = 0;
  }

  /** 摘除第 i 个之后的实例（容量内收缩）。 */
  truncate(count: number): void {
    const next = Math.max(0, Math.min(count, this.capacity));
    this.count_ = next;
    this.body.count = next;
    if (this.shell) this.shell.count = next;
  }

  /** 释放自身持有的 GPU 侧实例缓冲与壳材质；geometry/material 归 SharedAssets 引用计数管理，此处不动。 */
  dispose(): void {
    this.body.dispose();
    if (this.shell) {
      if (this.ownsShellMaterial) (this.shell.material as THREE.Material).dispose();
      this.shell.dispose();
    }
    this.clear();
  }

  private jitterColor(color: THREE.ColorRepresentation): THREE.Color {
    const c = new THREE.Color(color);
    c.getHSL(jitterHsl, THREE.SRGBColorSpace);
    jitterHsl.h += (this.rng() * 2 - 1) * this.jitter.hue;
    jitterHsl.s = THREE.MathUtils.clamp(jitterHsl.s + (this.rng() * 2 - 1) * this.jitter.saturation, 0, 1);
    jitterHsl.l = THREE.MathUtils.clamp(jitterHsl.l + (this.rng() * 2 - 1) * this.jitter.lightness, 0, 1);
    return new THREE.Color().setHSL(jitterHsl.h, jitterHsl.s, jitterHsl.l, THREE.SRGBColorSpace);
  }
}

function hashSeed(name: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
