// docs/01-整体架构.md §3.2/§3.4-2 systems/wind.ts —— WindSystem：风力参数 + 布料统一驱动。T09 落点。
//
// 职责（§3.4-2 逐条）：
//   ① 维持全局风力参数（目标值 + 平滑值）：天气切换 setWind(windMul × 基准幅)（§3.5.3），
//      指数趋近 τ=0.6s（docs/05 §4.4.3/§7.1.2），不跳变；
//   ② 对所有注册 ClothHandle 统一施加摆动/轻晃/轻掀：布料顶点 shader 位移
//      （固定边→自由边加权、双频 sin、gust 包络，docs/05 §7.1.2）+ uSag 积水下凹
//      （`pos.y−=uSagAmp×uClothSag×sagCurve(uv)` + 迎风侧偏移，docs/05 §4.4.2 小雨）；
//   ③ customDepthMaterial 挂同一顶点位移函数——影子与可见摆动一致（docs/05 §4.3.3-⑤）；
//   ④ P2：暴露全局风向/风力 uniform 通道供植被材质 onBeforeCompile 注入
//      （松针 7-2-①、行道树 7-4-⑤、海草——植被摆动与布料同一风力源，docs/01 §3.9 P2）。
//
// 纪律：
//   - 一切节奏取自 RhythmClock（elapsed 相位 / gust 包络，§3.4-1「Wind 取值」）；严禁 setTimeout/
//     setInterval——阵风事件衰减用帧步长累计（docs/05 §7.1.5 标题纪律）；
//   - CPU 零逐顶点：每帧只写共享 uniform（§7.1.2「CPU 每帧只写 4 个共享 uniform」= uWindStrength/
//     uWindPhase/uWindDir/uSag 布料四通道；前 3 者由本系统每帧写入，uSag 数值由 WeatherMaterialSystem
//     在天气过渡期写入（T13），本系统按引用接线消费——toonMaterial.ts §5.6 注释「T09 写 P2 植被通道」同源）；
//   - 补丁降级（T06 同款结构）：锚点失配不写回 shader——布料退化为静止（影子同为静态，无错位），
//     userData.clothWindDegraded / vegWindDegraded 标记；
//   - 定点说明：布料几何固定边约定为 uv.x=0（自由边 uv.x=1）；固定边在别的边时由内容侧旋转/重排
//     PlaneGeometry uv（ClothHandle 无固定边字段，不改 handles.ts 契约）。
// 未实现（如实登记）：P2b「阵风 gust 事件广播」未做——纸巾轻掀经 boostCloth() 由 EventScheduler
//   直接触发（docs/05 §7.1.5-3），无广播时靠阵风噪声自然驱动（§3.9 P2b「可接受降级」）。
//   ClothHandle.dripAnchors 归 ParticleSystem/T13 消费，本系统不读取。
import * as THREE from 'three';
import type { WebGLProgramParametersWithUniforms } from 'three';
import { clamp, damp } from '@/shared/math';
import { hashString } from '@/shared/rng';
import { simplex1 } from '@/systems/clock';
import type { RhythmClock } from '@/systems/clock';
import type { ClothHandle } from '@/systems/handles';
import type { WindSystem as WindSystemContract } from '@/systems/handles';
import { sharedUniforms } from '@/render/toonMaterial';

/* ================================ 定值（docs/05） ================================ */

/** 风力指数趋近时间常数 τ=0.6s（docs/05 §4.4.3「风力平滑趋近」/§7.1.2）。 */
export const WIND_TAU_S = 0.6;

/** 布料自由边摆幅基准（m，power=1×gust=1 时；世界米制）：低频小幅（「静止但活着」），T41 实机调参。 */
export const CLOTH_SWAY_BASE_M = 0.035;

/** 布料双频 sin：低频主频 0.55Hz + 高频副频 1.3Hz（低频小幅纪律；实现期校准默认，T41 调参）。 */
export const CLOTH_FLAP_SLOW_HZ = 0.55;
export const CLOTH_FLAP_FAST_HZ = 1.3;

/** 植被顶摆幅（物体单位）与频率（docs/05 §7.2.1-② 松针「顶摆幅 0.06u、频率 0.8Hz」；行道树 ×0.8 走 §7.4-⑤）。 */
export const VEG_SWAY_AMP_U = 0.06;
export const VEG_SWAY_FREQ_HZ = 0.8;

/** 全局风向基准角与缓摆幅度/周期（rad、s；P2「全局风向」通道：风向缓慢游移防机械感）。 */
const WIND_DIR_BASE_RAD = -0.6;
const WIND_DIR_WANDER_RAD = 0.5;
const WIND_DIR_WANDER_T_S = 23;

const TAU = Math.PI * 2;

/* ================================ 共享 uniform（§5.6 单例，按引用注入） ================================ */

/**
 * P2 植被/布料共用风力通道：
 * - uWindStrength / uWindPhase 挂在 render/toonMaterial 的 sharedUniforms 单例（§5.6 注释「写入方 T09」），
 *   植被材质经自身 onBeforeCompile 按引用注入（injectVegetationWind）；
 * - uWindDir 为本文件补的第三通道（世界 xz 单位风向；布料顺风漂移与植被弯向共用）；
 * - uSag（天气 clothSag 0..1）在 sharedUniforms 单例，写入方 T13，本系统按引用接线消费。
 */
export const windUniforms = {
  /** 世界 xz 平面单位风向（Vector2 = (x, z)）。 */
  uWindDir: { value: new THREE.Vector2(1, 0) },
};

/* ================================ GLSL：布料顶点位移（主材质与深度材质共用） ================================ */

/** 布料风摆 uniform 声明（共享 4 通道按引用 + 逐布料 5 值；插入 vertexShader 顶部）。 */
const CLOTH_WIND_PARS = /* glsl */ `
uniform float uWindStrength;
uniform float uWindPhase;
uniform vec2 uWindDir;
uniform float uSag;
uniform float uClothWindFactor;
uniform float uClothSwayScale;
uniform float uClothSagAmp;
uniform vec3 uClothSwayAxes;
uniform float uClothSeed;
`;

/**
 * 布料顶点位移块（插入 `#include <begin_vertex>` 之后，改写 `transformed`；meshtoon/depth 模板同锚点）。
 * 全部逐布料差异走 uniform（GLSL 恒定）→ 同参数布料共享同一着色程序（§3.7 #3 缓存纪律）。
 * 位移在物体空间施加、世界米制标定：世界方向经模型矩阵列点积（转置乘法）去旋转，等比缩放经
 * 归一化/除尺度还原——任意旋转/等比缩放的布料，摆幅/下凹/漂移在世界系中恒为定米数。
 */
const CLOTH_WIND_BODY = /* glsl */ `
{
	vec3 wDown = vec3( 0.0, -1.0, 0.0 );
	vec3 rawDown = vec3(
		dot( modelMatrix[ 0 ].xyz, wDown ),
		dot( modelMatrix[ 1 ].xyz, wDown ),
		dot( modelMatrix[ 2 ].xyz, wDown ) );
	float mScale = max( length( rawDown ), 1e-5 );
	vec3 objDown = rawDown / mScale;
	vec3 wWind = vec3( uWindDir.x, 0.0, uWindDir.y );
	vec3 rawWind = vec3(
		dot( modelMatrix[ 0 ].xyz, wWind ),
		dot( modelMatrix[ 1 ].xyz, wWind ),
		dot( modelMatrix[ 2 ].xyz, wWind ) );
	vec3 objWind = rawWind / max( length( rawWind ), 1e-5 );

	float edgeW = clamp( uv.x, 0.0, 1.0 );
	float swayW = edgeW * sqrt( edgeW );
	float tt = uWindPhase + uClothSeed;
	float flapSlow = sin( 6.2831853 * ${CLOTH_FLAP_SLOW_HZ.toFixed(4)} * tt + uv.x * 2.6 + uv.y * 1.3 );
	float flapFast = sin( 6.2831853 * ${CLOTH_FLAP_FAST_HZ.toFixed(4)} * tt + uv.y * 3.4 + 1.7 );
	float flap = flapSlow + 0.45 * flapFast;
	float swayM = uWindStrength * uClothWindFactor * uClothSwayScale * swayW * ${CLOTH_SWAY_BASE_M.toFixed(4)};
	float sagW = sin( 3.14159265 * clamp( uv.x, 0.0, 1.0 ) ) * sin( 3.14159265 * clamp( uv.y, 0.0, 1.0 ) );
	float sagM = uSag * uClothSagAmp * sagW;
	float driftM = sagM * 0.6 + swayM * 0.35;
	transformed += uClothSwayAxes * ( flap * swayM / mScale );
	transformed += objWind * ( driftM / mScale );
	transformed += objDown * ( sagM / mScale );
}
`;

/** 逐布料 uniform 集合（主材质与 customDepthMaterial 共用同一 IUniform 对象 → 影子与可见摆动同源同步）。 */
interface ClothUniforms {
  uClothWindFactor: THREE.IUniform<number>;
  uClothSwayScale: THREE.IUniform<number>;
  uClothSagAmp: THREE.IUniform<number>;
  uClothSwayAxes: THREE.IUniform<THREE.Vector3>;
  uClothSeed: THREE.IUniform<number>;
}

/**
 * 布料顶点位移补丁（onBeforeCompile；主材质与 MeshDepthMaterial 同一函数）。
 * T06 降级结构：全部手术在工作副本判断后一次性写回，锚点失配不写回 = 静止布料（影子同为静态）。
 */
function applyClothWindPatch(
  shader: WebGLProgramParametersWithUniforms,
  u: ClothUniforms,
  material: THREE.Material,
): void {
  try {
    const anchor = '#include <begin_vertex>';
    if (!shader.vertexShader.includes(anchor)) {
      throw new Error(`布料顶点位移锚点失配（three r${THREE.REVISION}）：${anchor}`);
    }
    shader.vertexShader = `${CLOTH_WIND_PARS}\n${shader.vertexShader.replace(anchor, `${anchor}\n${CLOTH_WIND_BODY}`)}`;
    // 共享 4 通道按引用注入（改一处全场生效，§5.6）
    shader.uniforms.uWindStrength = sharedUniforms.uWindStrength;
    shader.uniforms.uWindPhase = sharedUniforms.uWindPhase;
    shader.uniforms.uWindDir = windUniforms.uWindDir;
    shader.uniforms.uSag = sharedUniforms.uSag;
    // 逐布料 5 值（主/深度材质共用同一 IUniform 对象）
    shader.uniforms.uClothWindFactor = u.uClothWindFactor;
    shader.uniforms.uClothSwayScale = u.uClothSwayScale;
    shader.uniforms.uClothSagAmp = u.uClothSagAmp;
    shader.uniforms.uClothSwayAxes = u.uClothSwayAxes;
    shader.uniforms.uClothSeed = u.uClothSeed;
  } catch (err) {
    material.userData.clothWindDegraded = true;
    console.warn(
      `[wind] 「${material.name}」布料顶点位移补丁失败，降级为静止布料（影子与可见面一致，无错位）`,
      err,
    );
  }
}

/* ================================ P2：植被摆动通道（供植被材质 onBeforeCompile 注入） ================================ */

/** 植被风摆参数（docs/05 §7.2.1-② 松针定值 / §7.4-⑤ 行道树摆幅 ×0.8 → ampU 0.048）。 */
export interface VegetationWindOptions {
  /** 顶摆幅（物体单位；松针 0.06u） */
  readonly ampU?: number;
  /** 摆动频率 Hz（松针 0.8） */
  readonly freqHz?: number;
  /** 顶部权重归一高度（物体局部单位；实例化整批共享同一材质时取树冠局部高度） */
  readonly heightU?: number;
  /** 相位偏移 rad（同种共享材质=0 整批同步；异种可错相） */
  readonly phase?: number;
}

const VEG_WIND_PARS = /* glsl */ `
uniform float uWindStrength;
uniform float uWindPhase;
uniform vec2 uWindDir;
uniform float uVegAmp;
uniform float uVegFreq;
uniform float uVegHeight;
uniform float uVegPhase;
`;

/**
 * 植被顶点风摆块（插入 `#include <begin_vertex>` 之后）：根部锚定、顶部平方加权弯向风向，
 * 幅度=uWindStrength（已含 gust 包络，CPU 折算）×ampU；阵风时叶尖微垂。
 * 参数全部走 uniform（GLSL 恒定）→ 同参数植被材质共享程序；实例化松树整批共享同一 uWindAmp 源（7-2-①）。
 */
const VEG_WIND_BODY = /* glsl */ `
{
	vec3 wWind = vec3( uWindDir.x, 0.0, uWindDir.y );
	vec3 rawWind = vec3(
		dot( modelMatrix[ 0 ].xyz, wWind ),
		dot( modelMatrix[ 1 ].xyz, wWind ),
		dot( modelMatrix[ 2 ].xyz, wWind ) );
	vec3 objWind = rawWind / max( length( rawWind ), 1e-5 );
	float hNorm = clamp( transformed.y / max( uVegHeight, 1e-4 ), 0.0, 1.0 );
	float bendW = hNorm * hNorm;
	float sway = sin( 6.2831853 * uVegFreq * uWindPhase + uVegPhase + transformed.x * 0.35 + transformed.z * 0.21 );
	float gustAmp = uWindStrength * uVegAmp;
	transformed += objWind * ( gustAmp * bendW * ( 0.75 + 0.25 * sway ) );
	transformed.y -= gustAmp * bendW * 0.18 * ( 0.5 + 0.5 * sway );
}
`;

/**
 * 植被风摆 shader 补丁（对 shader 对象；供材质自身 onBeforeCompile 内调用或经 injectVegetationWind）。
 * 降级结构同 T06：锚点失配不写回 = 静止植被，userData.vegWindDegraded 标记。
 */
export function applyVegetationWindPatch(
  shader: WebGLProgramParametersWithUniforms,
  options: VegetationWindOptions = {},
  material?: THREE.Material,
): void {
  try {
    const anchor = '#include <begin_vertex>';
    if (!shader.vertexShader.includes(anchor)) {
      throw new Error(`植被风摆锚点失配（three r${THREE.REVISION}）：${anchor}`);
    }
    shader.vertexShader = `${VEG_WIND_PARS}\n${shader.vertexShader.replace(anchor, `${anchor}\n${VEG_WIND_BODY}`)}`;
    shader.uniforms.uWindStrength = sharedUniforms.uWindStrength; // 同一风力源（P2）
    shader.uniforms.uWindPhase = sharedUniforms.uWindPhase;
    shader.uniforms.uWindDir = windUniforms.uWindDir;
    shader.uniforms.uVegAmp = { value: options.ampU ?? VEG_SWAY_AMP_U };
    shader.uniforms.uVegFreq = { value: options.freqHz ?? VEG_SWAY_FREQ_HZ };
    shader.uniforms.uVegHeight = { value: options.heightU ?? 1 };
    shader.uniforms.uVegPhase = { value: options.phase ?? 0 };
  } catch (err) {
    if (material) {
      material.userData.vegWindDegraded = true;
      console.warn(`[wind] 「${material.name}」植被风摆补丁失败，降级为静止植被`, err);
    } else {
      throw err;
    }
  }
}

/**
 * P2 注入器：把植被风摆链入材质既有 onBeforeCompile（工厂补丁在前、风摆在后），程序缓存键追加隔离段。
 * 用法（T18/T19/T21 植被材质装配处）：injectVegetationWind(factoryMat, { ampU: 0.06, freqHz: 0.8 })。
 * 同种植被共享同一工厂材质实例 → 整批共享同一 uWindStrength 源（7-2-①）。
 */
export function injectVegetationWind<T extends THREE.Material>(material: T, options: VegetationWindOptions = {}): T {
  const data = material.userData as Record<string, unknown>;
  if (data.vegWindInjected) {
    throw new Error(`[wind] 植被风摆重复注入：${material.name || material.type}`);
  }
  data.vegWindInjected = true;
  const prev = material.onBeforeCompile.bind(material);
  const prevKey = material.customProgramCacheKey.bind(material);
  // 参数走 uniform（GLSL 恒定）→ 缓存键不含参数值：同基础参数的植被材质共享同一程序
  material.customProgramCacheKey = () => `${prevKey()}|vegWind`;
  material.onBeforeCompile = (shader, renderer) => {
    prev(shader, renderer);
    applyVegetationWindPatch(shader, options, material);
  };
  return material;
}

/* ================================ WindSystem 实现 ================================ */

/** 注册条目（unregister 还原 + dispose 用）。 */
interface ClothEntry {
  readonly handle: ClothHandle;
  readonly mesh: THREE.Mesh;
  readonly originalMaterial: THREE.Material;
  readonly clothMaterial: THREE.Material;
  readonly depthMaterial: THREE.MeshDepthMaterial;
  readonly uniforms: ClothUniforms;
  readonly baseWindFactor: number;
}

/**
 * WindSystem（§3.4-2；满足 systems/handles.ts:193 WindSystem 契约：setWind/power 逐字）。
 * Director 每帧驱动 update(dt)（§3.5.2-③，RhythmClock 已由 Director 先行步进）；场景/车型经
 * cloths 数组注册（§3.5.1），卸载反注册（§3.5.3）；天气切换经 setWind 下发。
 */
export class WindSystem implements WindSystemContract {
  private readonly clock: RhythmClock;
  private readonly entries = new Map<THREE.Mesh, ClothEntry>();
  /** 风力目标值（= 基准幅 × weatherPreset.windMul，§7.1.2；初始 1.0 = 晴朗基准 windMul，§4.4.1）。 */
  private targetPower = 1.0;
  /** 平滑当前值（指数趋近；起点静风 0，开局数秒内自然起风）。 */
  private currentPower = 0;
  /** 阵风事件（7.1.5-3 纸巾轻掀；单布料单事件，重触发覆盖）。 */
  private boost: { entry: ClothEntry; mul: number; remaining: number; total: number } | null = null;

  constructor(clock: RhythmClock) {
    this.clock = clock;
  }

  /** 契约字段（handles.ts:197「当前风力目标值」）：setWind 的目标，未平滑。 */
  get power(): number {
    return this.targetPower;
  }

  /** 平滑当前风力（含指数趋近过程；场景读实际风势用）。 */
  get current(): number {
    return this.currentPower;
  }

  /**
   * 天气切换（§3.5.3「WindSystem.setWind(windMul × 阵风基准)」）：指数趋近 τ=0.6s，不跳变。
   * 初始装配可用 immediate=true 直取目标（§3.5.1「首帧直接呈现基准」同口径，T17 编排侧决定）。
   */
  setWind(power: number, opts?: { readonly immediate?: boolean }): void {
    if (!(power >= 0)) throw new RangeError(`[wind] 风力目标须 ≥0：${power}`);
    this.targetPower = power;
    if (opts?.immediate) {
      this.currentPower = power;
      this.writeSharedUniforms();
    }
  }

  /** 注册布料（§3.5.1「把 cloths 注册进 Wind」）：逐布料克隆材质 + 顶点位移补丁 + 阴影同步。 */
  register(cloths: readonly ClothHandle[]): void {
    for (const handle of cloths) this.registerOne(handle);
  }

  /** 反注册布料（§3.5.3 卸载路径）：还原原材质、释放克隆与深度材质。未知布料幂等跳过。 */
  unregister(cloths: readonly ClothHandle[]): void {
    for (const handle of cloths) this.unregisterOne(handle);
  }

  /**
   * 阵风事件轻掀（docs/05 §7.1.5-3「该 ClothHandle 局部 windFactor ×2.2、0.8s 内衰减回 1」）。
   * EventScheduler 触发点（7-1-⑦ 纸巾阵风轻掀）；计时用帧步长累计，无 setTimeout。
   */
  boostCloth(mesh: THREE.Mesh, multiplier = 2.2, decayS = 0.8): void {
    const entry = this.entries.get(mesh);
    if (!entry) return; // 未注册布料忽略（事件与生命周期解耦，不抛错）
    this.boost = {
      entry,
      mul: Math.max(multiplier, 0),
      remaining: Math.max(decayS, 0),
      total: Math.max(decayS, 1e-4),
    };
  }

  /**
   * 每帧（§3.5.2-③）：CPU 零逐顶点——只写共享 uniform（uWindStrength/uWindPhase/uWindDir）+
   * 阵风事件衰减。dt 为帧步长（s）；RhythmClock 由 Director 先行 update（§3.5.2-①）。
   */
  update(dt: number): void {
    const step = dt > 0 ? dt : 0;
    // 风力平滑趋近（§4.4.3 逐字公式 current += (target−current)×(1−exp(−dt/τ))；damp 等价式）
    this.currentPower = damp(this.currentPower, this.targetPower, 1 / WIND_TAU_S, step);
    this.writeSharedUniforms();
    if (this.boost) {
      const boost = this.boost;
      // 先取值后衰减：boost 触发后的第一个渲染帧恰为 ×multiplier，其后 0.8s 线性衰减回 1（§7.1.5-3）
      const k = clamp(boost.remaining / boost.total, 0, 1);
      boost.entry.uniforms.uClothWindFactor.value = boost.entry.baseWindFactor * (1 + (boost.mul - 1) * k);
      boost.remaining -= step;
      if (boost.remaining <= 0) {
        boost.entry.uniforms.uClothWindFactor.value = boost.entry.baseWindFactor;
        this.boost = null;
      }
    }
  }

  /** 整体销毁（T17 引擎卸载）：反注册全部布料并复位共享通道。 */
  dispose(): void {
    for (const entry of Array.from(this.entries.values())) this.unregisterOne(entry.handle);
    this.boost = null;
    this.targetPower = 1.0;
    this.currentPower = 0;
    sharedUniforms.uWindStrength.value = 0;
    sharedUniforms.uWindPhase.value = 0;
    windUniforms.uWindDir.value.set(1, 0);
  }

  /** 共享 uniform 写入（每帧 3 通道；uSag 由 T13 写、此处只接线）。 */
  private writeSharedUniforms(): void {
    const elapsed = this.clock.elapsed;
    const gust = this.clock.gust(); // §7.1.1 gust 包络（≈0.3~1.7，RhythmClock 单一取值口）
    sharedUniforms.uWindStrength.value = this.currentPower * gust;
    sharedUniforms.uWindPhase.value = elapsed;
    const angle = WIND_DIR_BASE_RAD + WIND_DIR_WANDER_RAD * simplex1(elapsed / WIND_DIR_WANDER_T_S);
    windUniforms.uWindDir.value.set(Math.cos(angle), Math.sin(angle));
  }

  private registerOne(handle: ClothHandle): void {
    const mesh = handle.mesh;
    if (this.entries.has(mesh)) {
      throw new Error(`[wind] 布料重复注册：${mesh.name || mesh.uuid}`);
    }
    if (!mesh.geometry.getAttribute('uv')) {
      throw new Error(`[wind] 布料几何缺 uv 属性（顶点位移按 uv 固定边→自由边加权）：${mesh.name || mesh.uuid}`);
    }
    const original = mesh.material;
    if (!original || Array.isArray(original)) {
      throw new Error(`[wind] 布料材质须为单一材质：${mesh.name || mesh.uuid}`);
    }
    // 逐布料克隆：three Material.copy 不复制 onBeforeCompile/customProgramCacheKey（r187 实证）
    // → 克隆体是干净材质，由本系统挂布料补丁；同参数克隆共享同一着色程序（缓存键见下）。
    const clothMaterial = original.clone();
    clothMaterial.name = `${original.name || 'cloth'}+wind`;
    const baseWindFactor = handle.windFactor ?? 1; // M1：风力系数默认 1（车内布料 0.12 微风）
    const uniforms: ClothUniforms = {
      uClothWindFactor: { value: baseWindFactor },
      uClothSwayScale: { value: 1 - 0.7 * clamp(handle.stiffness, 0, 1) }, // 挺度越小越易摆（§7.1.2）
      uClothSagAmp: { value: Math.max(handle.sagAmp ?? 0, 0) }, // M1：积水下凹幅度默认 0
      uClothSwayAxes: { value: swayAxesMask(handle.swayAxes, mesh) },
      uClothSeed: { value: ((hashString(mesh.uuid) % 1000) / 1000) * TAU }, // 逐布料错相（毛巾×3 不同步）
    };
    clothMaterial.customProgramCacheKey = () => 'wind:cloth:main:v1';
    clothMaterial.onBeforeCompile = (shader) => {
      applyClothWindPatch(shader, uniforms, clothMaterial);
    };
    mesh.material = clothMaterial;
    // 阴影同步（§4.3.3-⑤）：customDepthMaterial 挂同一顶点位移函数，uniform 与主材质同对象
    // → 影子与可见摆动/下凹逐帧一致（castShadow 由内容侧标记；深度材质仅在投影时被消费）。
    const depthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    depthMaterial.name = `${clothMaterial.name}+depth`;
    depthMaterial.customProgramCacheKey = () => 'wind:cloth:depth:v1';
    depthMaterial.onBeforeCompile = (shader) => {
      applyClothWindPatch(shader, uniforms, depthMaterial);
    };
    mesh.customDepthMaterial = depthMaterial;
    this.entries.set(mesh, {
      handle,
      mesh,
      originalMaterial: original,
      clothMaterial,
      depthMaterial,
      uniforms,
      baseWindFactor,
    });
  }

  private unregisterOne(handle: ClothHandle): void {
    const entry = this.entries.get(handle.mesh);
    if (!entry) return;
    if (this.boost?.entry === entry) this.boost = null;
    entry.mesh.material = entry.originalMaterial;
    entry.mesh.customDepthMaterial = undefined; // @types/three 0.187：customDepthMaterial?: Material | undefined
    entry.clothMaterial.dispose();
    entry.depthMaterial.dispose();
    this.entries.delete(entry.mesh);
  }
}

/** swayAxes → 物体空间摆动轴掩码（'x'|'y'|'z'；空集警告并退到 z 向摆）。 */
function swayAxesMask(swayAxes: readonly ('x' | 'y' | 'z')[], mesh: THREE.Mesh): THREE.Vector3 {
  const mask = new THREE.Vector3(0, 0, 0);
  for (const axis of swayAxes) {
    if (axis === 'x') mask.x = 1;
    else if (axis === 'y') mask.y = 1;
    else mask.z = 1;
  }
  if (mask.lengthSq() === 0) {
    console.warn(`[wind] 布料 swayAxes 为空，退到 z 向摆：${mesh.name || mesh.uuid}`);
    mask.z = 1;
  }
  return mask;
}
