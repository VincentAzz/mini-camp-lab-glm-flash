// docs/01-整体架构.md §3.4-6 systems/weatherMaterial.ts —— WeatherMaterialSystem：天气材质状态。T13 落点。
// 职责（§3.4-6 + docs/08 T13 逐字）：七分量（wetness/puddle/clothSag/snowCover/lineFade/fogMul/cloudShadow）
// 写入共享 uniform 单例（单例本体 = render/toonMaterial.sharedUniforms，T06 落地的接入口；本系统是天气
// 六个 shader 分量的唯一写入方，第 7 分量 fogMul 为本系统持有值，经 get fogMul 供 AtmosphereSystem 的
// D6 单通道合成）——切天气改 7 个数字全场生效，无逐材质遍历。
// 落地面：
//   ① 按引用注入（onBeforeCompile）：对非工厂材质（userData 无 toonArchetype 标记者）把 sharedUniforms
//      的 IUniform 对象按引用挂进 shader.uniforms（shader.uniforms.uX = sharedUniforms.uX），工厂材质
//      的注入已在 T06 建材质时完成——值更新经同一对象引用自动到达，本系统绝不重复声明同名 uniform；
//   ② uSnow 法线朝上遮罩：roofTop/clothTop 用 world normal.y smoothstep(0.25,0.7)（docs/05 §4.4.2 树枝行），
//      ground 用整面 clamp(snowCover×1.4−fbm(worldXZ)×0.3,0,1) 噪声边缘斑驳（五-5 地面薄雪行）；
//   ③ uLineFade：划线层 alpha ×(1−0.85×lineFade)（五-5 特例「若隐若现」，作用于服务区贴花）；
//   ④ uCloudShadow 云影 quad：底座上空一片乘性暗斑 quad，采样 fbm(worldXZ×0.08+windDir×t×0.008)，
//      CPU 每帧只写 1 个 offset uniform（§4.4.2 多云行公式逐字；0.28 强度系数逐字）。贴图以 shader 内
//      程序化 fbm（hash value-noise）实现——文档所述共享 512² fbm 贴图在本实现等效替换为解析噪声：
//      无限域采样永不接缝（Repeat 平铺的 CPU 噪声格点不周期，接缝会随风向滚动暴露），仍是纯程序化
//      生成（八.2 红线不破），视觉公式逐字一致；
//   ⑤ castReflection 镜面反光条（五-3 夜间彩色反光）：每盏近地强灯正下方 0.25×0.5m 竖长贴花 quad，
//      每帧转向相机方位角，颜色=灯色、additive、op=wetness×功率×0.5，op<0.02 时 visible=false；
//      每场景 ≤6 盏（LampHandle.castReflection 注册位，M4）；
//   ⑥ snowShell 雪壳挂点（M4）：visible=snowCover>0.01、材质 opacity=min(1,2×snowCover)、顶点沿法线
//      外推 0.012×snowCover（§4.4.2 roofTop 行）——clothTop 的雪壳由内容侧挂 ClothHandle 之下，
//      风摆/sag 位移链的继承落 T09 WindSystem（见 TASKS/开源问题注记）。
// kind 四分支（docs/08 T13）：ground / roofTop / clothTop / linePaint —— 见 register()。
// 节奏纪律：过渡相位与云影滚动一律取 RhythmClock.elapsed（构造注入；同帧序下确定可复现），
//   严禁 setTimeout/setInterval（docs/05 §7.1.5 标题纪律）。
import * as THREE from 'three';
import type { WebGLProgramParametersWithUniforms } from 'three';
import { clamp } from '@/shared/math';
import { sharedUniforms } from '@/render/toonMaterial';
import type { LampHandle, WeatherSurface } from '@/systems/handles';
import type { WeatherPreset } from '@/content/weathers/types';
import type { RhythmClock } from '@/systems/clock';
import type { TimeChannelSink, TimeChannels } from '@/systems/timeLight';

/** 天气材质七分量（字段名与 WeatherPreset.material 逐字一致，docs/01 §3.3.5）。 */
export type WeatherMaterialComponents = WeatherPreset['material'];

/** 过渡时长缺省（决策 D5：时间/天气切换一律 1500ms；§4.4.3）。 */
const DEFAULT_TRANSITION_MS = 1500;

/** 云影公式定值（docs/05 §4.4.2 多云行逐字）：worldXZ×0.08 采样、风漂 ×t×0.008、强度 0.28。 */
const CLOUD_WORLD_SCALE = 0.08;
const CLOUD_DRIFT_SPEED = 0.008;
const CLOUD_STRENGTH = 0.28;

/** 镜面反光条定值（五-3）：0.25×0.5m 贴花、op=wetness×功率×0.5、op<0.02 隐身、每场景 ≤6 盏。 */
const STRIP_SIZE_X = 0.25;
const STRIP_SIZE_Y = 0.5;
const STRIP_OP_GAIN = 0.5;
const STRIP_VISIBLE_MIN = 0.02;
const STRIP_MAX = 6;

/** 雪壳定值（§4.4.2 roofTop 行逐字）：法线外推 0.012×snowCover、visible>0.01、opacity=min(1,2×snowCover)。 */
const SHELL_EXTRUDE_MAX = 0.012;
const SHELL_VISIBLE_MIN = 0.01;
const SHELL_OP_GAIN = 2.0;

/** 雪色（docs/05 五-5 SnowMaterial 白 #EDF2F9；本文件自管补丁用，工厂补丁沿用其自定值）。 */
const SNOW_COLOR_HEX = '#edf2f9';

/** 统一底座足迹（baseAssembler 20×20；云影 quad 覆盖其上，留 0.4 边距防露边）。 */
const BASE_SIZE = 20;
const CLOUD_QUAD_SIZE = BASE_SIZE + 0.4;
const CLOUD_QUAD_Y = 0.02;

/* —— GLSL：程序化 value-noise/fbm（云影 quad 与地面雪缘共用源；无限域、无平铺接缝）—— */
const GLSL_NOISE = /* glsl */ `
float wmHash( vec2 p ) {
  return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453123 );
}
float wmNoise( vec2 p ) {
  vec2 i = floor( p );
  vec2 f = fract( p );
  vec2 u = f * f * ( 3.0 - 2.0 * f );
  float a = wmHash( i );
  float b = wmHash( i + vec2( 1.0, 0.0 ) );
  float c = wmHash( i + vec2( 0.0, 1.0 ) );
  float d = wmHash( i + vec2( 1.0, 1.0 ) );
  return a + ( b - a ) * u.x + ( c - a ) * u.y + ( a - b - c + d ) * u.x * u.y;
}
float wmFbm( vec2 p ) {
  float s = 0.0;
  float amp = 0.5;
  for ( int i = 0; i < 4; i++ ) {
    s += wmNoise( p ) * amp;
    p = p * 2.03 + vec2( 19.7, 7.3 );
    amp *= 0.5;
  }
  return s;
}
`;

const CLOUD_QUAD_VERT = /* glsl */ `
varying vec3 vWmWorld;
void main() {
  vec4 wmWorld = modelMatrix * vec4( position, 1.0 );
  vWmWorld = wmWorld.xyz;
  gl_Position = projectionMatrix * viewMatrix * wmWorld;
}
`;

const CLOUD_QUAD_FRAG = /* glsl */ `
uniform float uCloudShadow;
uniform vec2 uDrift;
uniform float uWorldScale;
uniform float uStrength;
varying vec3 vWmWorld;
${GLSL_NOISE}
void main() {
  // docs/05 §4.4.2：light ×= 1 − 0.28×cloudShadow×fbm(worldXZ×0.08 + windDir×t×0.008)
  float wmN = wmFbm( vWmWorld.xz * uWorldScale + uDrift );
  float wmA = uStrength * clamp( uCloudShadow, 0.0, 1.0 ) * wmN;
  if ( wmA < 0.004 ) discard;
  gl_FragColor = vec4( vec3( 0.0 ), wmA );
}
`;

/** 通用补丁锚点（toon/standard/lambert/phong/basic 模板共有的行；失配即降级不写回）。 */
const ANCHOR_DIFFUSE = 'vec4 diffuseColor = vec4( diffuse, opacity );';
const ANCHOR_NORMAL = '#include <normal_fragment_maps>';
const ANCHOR_DITHER = '#include <dithering_fragment>';
const ANCHOR_BEGIN_VERTEX = '#include <begin_vertex>';

/** 首个锚点替换；锚点缺失返回 null（降级路径，T06 同款纪律：失败不写回）。 */
function replaceFirst(source: string, anchor: string, replacement: string): string | null {
  if (!source.includes(anchor)) return null;
  return source.replace(anchor, replacement);
}

/**
 * onBeforeCompile 链式包装：保留材质既有补丁（工厂补丁/内容私有补丁），并显式给出含注入标记的
 * customProgramCacheKey——包装函数源码逐字相同，若依赖默认 toString 缓存键会把不同注入折叠成
 * 同一 program，必须显式隔离。
 */
function chainOnBeforeCompile(
  material: THREE.Material,
  marker: string,
  inject: (shader: WebGLProgramParametersWithUniforms) => void,
): void {
  const prev = material.onBeforeCompile;
  const prevKey = material.customProgramCacheKey;
  material.onBeforeCompile = (shader, renderer) => {
    prev.call(material, shader, renderer);
    inject(shader);
  };
  material.customProgramCacheKey = () =>
    `${prevKey.call(material)}|${marker}`;
}

/** 非 lit 材质判定（MeshBasicMaterial 系无 normal_fragment_maps，uSnow 朝上遮罩降级为整面）。 */
function isLitFragment(frag: string): boolean {
  return frag.includes(ANCHOR_NORMAL);
}

/** 天气材质作用分支描述（kind 四分支对 raw 材质的注入开关）。 */
interface SurfacePatchSpec {
  wet: boolean;
  snow: 'up' | 'full' | null;
  lineFade: boolean;
}

/**
 * 对非工厂材质按引用注入共享天气 uniform（uWet/uSnow/uLineFade）。
 * 降级保证（T06 同款）：全部替换在工作副本上完成，任一锚点失配则该块不生效，材质保持纯内建。
 */
function patchSharedWeather(material: THREE.Material, spec: SurfacePatchSpec): void {
  if (material.userData.wmSharedPatched === true) return;

  chainOnBeforeCompile(material, `wm-shared|w${spec.wet ? 1 : 0}|s${spec.snow ?? 'x'}|l${spec.lineFade ? 1 : 0}`, (shader) => {
    try {
      let f = shader.fragmentShader;
      let v = shader.vertexShader;
      const fragDecls: string[] = [];
      const vertDecls: string[] = [];
      const needsWorldPos = spec.snow === 'full';
      const lit = isLitFragment(f);
      const snowMode: 'up' | 'full' | 'flat' | null =
        spec.snow === 'up' && !lit ? 'flat' : spec.snow; // basic 材质朝上遮罩降级整面

      if (spec.wet) fragDecls.push('uniform float uWet;');
      if (snowMode !== null) fragDecls.push('uniform float uSnow;', 'uniform vec3 uSnowColor;');
      if (spec.lineFade) fragDecls.push('uniform float uLineFade;');
      if (snowMode === 'full') fragDecls.push(GLSL_NOISE.trim());
      if (snowMode === 'full' && lit) fragDecls.push('uniform float uWindPhase;'); // ②b 雪面闪点相位
      if (needsWorldPos) {
        vertDecls.push('varying vec3 vWmWorldPos;');
        fragDecls.push('varying vec3 vWmWorldPos;');
      }

      // 声明块插入 main 之前（全局作用域；toon/standard/basic 模板 main 唯一）
      if (fragDecls.length > 0) {
        const patchedF = replaceFirst(f, 'void main(', `${fragDecls.join('\n')}\nvoid main(`);
        if (patchedF === null) throw new Error('fragment main 锚点失配');
        f = patchedF;
      }
      if (vertDecls.length > 0) {
        const patchedV0 = replaceFirst(v, 'void main(', `${vertDecls.join('\n')}\nvoid main(`);
        if (patchedV0 === null) throw new Error('vertex main 锚点失配');
        v = patchedV0;
      }

      // 顶点：世界坐标 varying 写入（地面薄雪噪声边缘用；仅 full 需要）
      if (needsWorldPos) {
        const patchedV = replaceFirst(v, ANCHOR_BEGIN_VERTEX, `${ANCHOR_BEGIN_VERTEX}\n\tvWmWorldPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;`);
        if (patchedV === null) throw new Error('begin_vertex 锚点失配');
        v = patchedV;
      }

      // ① diffuse 层：湿面加深 + 雪（full 整面噪声边缘 / basic 降级整面平涂）
      const modsA: string[] = [];
      if (spec.wet) modsA.push('\tdiffuseColor.rgb *= ( 1.0 - 0.1 * clamp( uWet, 0.0, 1.0 ) );');
      if (snowMode === 'full') {
        modsA.push(
          '\tfloat wmSnowMask = clamp( uSnow * 1.4 - wmFbm( vWmWorldPos.xz * 0.35 ) * 0.3, 0.0, 1.0 );',
          '\tdiffuseColor.rgb = mix( diffuseColor.rgb, uSnowColor, wmSnowMask );',
        );
      } else if (snowMode === 'flat') {
        modsA.push('\tdiffuseColor.rgb = mix( diffuseColor.rgb, uSnowColor, clamp( uSnow, 0.0, 1.0 ) );');
      }
      if (modsA.length > 0) {
        const patchedF = replaceFirst(f, ANCHOR_DIFFUSE, `${ANCHOR_DIFFUSE}\n${modsA.join('\n')}`);
        if (patchedF === null) throw new Error('diffuseColor 锚点失配');
        f = patchedF;
      }

      // ② normal 层：uSnow 法线朝上遮罩（docs/05 §4.4.2：smoothstep(0.25,0.7,normal.y)×snowCover）
      if (snowMode === 'up') {
        const modsB = [
          '{',
          '\tvec3 wmWorldN = normalize( transpose( mat3( viewMatrix ) ) * normal );',
          '\tfloat wmSnowUp = smoothstep( 0.25, 0.7, wmWorldN.y ) * clamp( uSnow, 0.0, 1.0 );',
          '\tdiffuseColor.rgb = mix( diffuseColor.rgb, uSnowColor, wmSnowUp );',
          '}',
        ].join('\n');
        const patchedF = replaceFirst(f, ANCHOR_NORMAL, `${ANCHOR_NORMAL}\n${modsB}`);
        if (patchedF === null) throw new Error('normal_fragment_maps 锚点失配');
        f = patchedF;
      }

      // ②b 五-5 地面薄雪：fresnel 闪点 ×snowCover×0.3（raw 材质分支；工厂分支在
      // toonMaterial.applyToonPatches 同公式）。lit 材质才有 normal/vViewPosition（basic 降级
      // 路径无该变量，不注入）；vWmWorldPos/WMHash 已由 snow==='full' 分支声明。
      if (snowMode === 'full' && lit) {
        const modsB2 = [
          '{',
          '\tfloat wmGlintNV = clamp( dot( normal, normalize( vViewPosition ) ), 0.0, 1.0 );',
          '\tfloat wmGlintFres = pow( 1.0 - wmGlintNV, 4.0 );',
          '\tvec2 wmGlintCell = floor( vWmWorldPos.xz * 18.0 );',
          '\tfloat wmGlintRand = wmHash( wmGlintCell );',
          '\tvec2 wmGlintIn = fract( vWmWorldPos.xz * 18.0 ) - 0.5;',
          '\tfloat wmGlintDot = smoothstep( 0.26, 0.05, length( wmGlintIn ) );',
          '\tfloat wmGlintTw = 0.55 + 0.45 * sin( uWindPhase * 2.7 + wmGlintRand * 6.2831 );',
          '\ttotalEmissiveRadiance += uSnowColor * ( wmGlintFres * wmGlintTw * wmGlintDot * step( 0.78, wmGlintRand ) * clamp( uSnow, 0.0, 1.0 ) * 0.3 );',
          '}',
        ].join('\n');
        const patchedF2 = replaceFirst(f, ANCHOR_NORMAL, `${ANCHOR_NORMAL}\n${modsB2}`);
        if (patchedF2 === null) throw new Error('normal_fragment_maps 锚点失配（雪面闪点）');
        f = patchedF2;
      }

      // ③ 末层：uLineFade 划线 alpha（五-5：opacity=1−0.85×lineFade，以 alpha 乘子等效）
      if (spec.lineFade) {
        const patchedF = replaceFirst(
          f,
          ANCHOR_DITHER,
          `${ANCHOR_DITHER}\n\tgl_FragColor.a *= ( 1.0 - clamp( uLineFade, 0.0, 1.0 ) * 0.85 );`,
        );
        if (patchedF === null) throw new Error('dithering_fragment 锚点失配');
        f = patchedF;
      }

      // ④ uniform 按引用注入（改一处全场生效的机制本体）
      const uniforms = shader.uniforms as Record<string, THREE.IUniform>;
      if (spec.wet) uniforms.uWet = sharedUniforms.uWet;
      if (snowMode !== null) {
        uniforms.uSnow = sharedUniforms.uSnow;
        uniforms.uSnowColor = { value: new THREE.Color(SNOW_COLOR_HEX) };
      }
      if (snowMode === 'full' && lit) uniforms.uWindPhase = sharedUniforms.uWindPhase;
      if (spec.lineFade) uniforms.uLineFade = sharedUniforms.uLineFade;

      shader.fragmentShader = f;
      shader.vertexShader = v;
      material.userData.wmSharedPatched = true;
    } catch (err) {
      // 降级：锚点失配不写回 shader = 纯内建材质（three 版本漂移时可见性优先）
      material.userData.wmSharedDegraded = true;
      console.warn('[weatherMaterial] 共享 uniform 注入降级（锚点失配）：', err);
    }
  });
}

/** 雪壳外推 uniform：顶点沿法线外推 0.012×snowCover；同一材质重复注册复用同一 IUniform。 */
function patchShellExtrude(material: THREE.Material): THREE.IUniform<number> {
  const existing = material.userData.wmShellExtrude as THREE.IUniform<number> | undefined;
  if (existing) return existing;
  const uni: THREE.IUniform<number> = { value: 0 };
  chainOnBeforeCompile(material, 'wm-shell-extrude', (shader) => {
    const patched = replaceFirst(
      shader.vertexShader,
      ANCHOR_BEGIN_VERTEX,
      // `normal` attribute 在全部顶点模板前缀恒有声明（含 basic）；beginnormal 未必——直接用 attribute
      `${ANCHOR_BEGIN_VERTEX}\n\ttransformed += normal * uSnowShellExtrude;`,
    );
    if (patched === null) {
      material.userData.wmShellDegraded = true;
      console.warn('[weatherMaterial] 雪壳外推注入降级（begin_vertex 锚点失配）');
      return;
    }
    shader.uniforms.uSnowShellExtrude = uni;
    // T44 修复：使用处补 uniform 声明（此前只插表达式 → 雪壳可见时
    // `'uSnowShellExtrude' : undeclared identifier` 编译失败、雪壳该帧渲染失败）。
    // 回调每次编译都从 three 全新模板重推导（无累积），顶部声明幂等安全。
    shader.vertexShader = `uniform float uSnowShellExtrude;\n${patched}`;
  });
  if (!material.transparent) {
    material.transparent = true; // opacity=min(1,2×snowCover) 动画前提；注册期一次重编译
    material.needsUpdate = true;
  }
  material.userData.wmShellExtrude = uni;
  return uni;
}

/** 镜面反光条绑定（castReflection 灯 → 地面贴花 quad）。 */
interface ReflectionStrip {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.MeshBasicMaterial;
  readonly lamp: LampHandle;
  /** 无 halo 句柄时的静态落位（注册期显式给定；世界系 x/z） */
  readonly fixedPos: THREE.Vector3 | null;
  readonly groundY: number;
}

/** 雪壳绑定（M4 snowShell）。 */
interface ShellBinding {
  readonly mesh: THREE.Mesh;
  readonly materials: readonly THREE.Material[];
  readonly extrude: THREE.IUniform<number> | null;
}

/**
 * WeatherMaterialSystem：天气材质状态系统（§3.4-6）。
 * 实现内建 TimeChannelSink 结构（applyChannels）——Director 可将其登记进 TimeLightSystem，
 * 反光条功率即随 lampPower/shopPower 六通道下发自动更新（docs/05 五-3「op=wetness×功率×0.5」）。
 */
export class WeatherMaterialSystem implements TimeChannelSink {
  /** 云影 quad（乘性暗斑；Director 可按场景地形高度经 setCloudShadowY 调整） */
  readonly cloudShadowQuad: THREE.Mesh;
  /** 镜面反光条容器（attach 时挂入场景根） */
  readonly reflectionGroup: THREE.Group;

  private readonly clock: RhythmClock;
  private readonly cloudUniforms: {
    uDrift: THREE.IUniform<THREE.Vector2>;
    uWorldScale: THREE.IUniform<number>;
    uStrength: THREE.IUniform<number>;
  };
  private readonly stripsGroup: THREE.Group;
  private readonly strips: ReflectionStrip[] = [];
  private readonly shells: ShellBinding[] = [];
  private readonly registeredMaterials = new Set<string>();
  private readonly registeredLamps = new Set<LampHandle>();

  private current: WeatherMaterialComponents = {
    wetness: 0,
    puddle: 0,
    clothSag: 0,
    snowCover: 0,
    lineFade: 0,
    fogMul: 1,
    cloudShadow: 0,
  };
  private from: WeatherMaterialComponents = { ...this.current };
  private to: WeatherMaterialComponents = { ...this.current };
  private startedAt = 0;
  private transitionS = 0;

  private windDir = new THREE.Vector2(1, 0);
  private camera: THREE.PerspectiveCamera | null = null;
  private reflectionPower = 0;
  private root: THREE.Object3D | null = null;

  constructor(clock: RhythmClock) {
    this.clock = clock;
    this.windDir.normalize();

    // —— uCloudShadow 云影 quad（共享 uniform 按引用；CPU 每帧仅写 uDrift 一个 offset）——
    this.cloudUniforms = {
      uDrift: { value: new THREE.Vector2(0, 0) },
      uWorldScale: { value: CLOUD_WORLD_SCALE },
      uStrength: { value: CLOUD_STRENGTH },
    };
    const cloudMaterial = new THREE.ShaderMaterial({
      name: 'weather/cloudShadow',
      vertexShader: CLOUD_QUAD_VERT,
      fragmentShader: CLOUD_QUAD_FRAG,
      uniforms: {
        uCloudShadow: sharedUniforms.uCloudShadow, // 按引用：七分量插值直达
        uDrift: this.cloudUniforms.uDrift,
        uWorldScale: this.cloudUniforms.uWorldScale,
        uStrength: this.cloudUniforms.uStrength,
      },
      transparent: true,
      depthWrite: false,
      side: THREE.FrontSide,
    });
    this.cloudShadowQuad = new THREE.Mesh(new THREE.PlaneGeometry(CLOUD_QUAD_SIZE, CLOUD_QUAD_SIZE), cloudMaterial);
    this.cloudShadowQuad.name = 'weather/cloudShadow';
    this.cloudShadowQuad.rotation.x = -Math.PI / 2; // 水平铺在底座上空
    this.cloudShadowQuad.position.y = CLOUD_QUAD_Y;
    this.cloudShadowQuad.renderOrder = 2;
    this.cloudShadowQuad.visible = false;
    this.cloudShadowQuad.matrixAutoUpdate = false;
    this.cloudShadowQuad.updateMatrix();

    this.reflectionGroup = new THREE.Group();
    this.reflectionGroup.name = 'weather/reflectionStrips';
    this.stripsGroup = this.reflectionGroup;
  }

  /** 挂入场景根（幂等；quad + 反光条容器）。 */
  attach(root: THREE.Object3D): void {
    if (this.root === root) return;
    this.detach();
    root.add(this.cloudShadowQuad);
    root.add(this.reflectionGroup);
    this.root = root;
  }

  detach(): void {
    if (!this.root) return;
    this.root.remove(this.cloudShadowQuad);
    this.root.remove(this.reflectionGroup);
    this.root = null;
  }

  /* ============================ 七分量状态入口 ============================ */

  /**
   * 天气切换（§4.4.3）：七分量以 smoothstep 在 transitionMs 内插值写入共享 uniform；
   * 中途改档先快照当前插值中间态为新起点（不跳变，docs/05 §4.3.5 同款纪律）。
   */
  setWeather(target: WeatherMaterialComponents, transitionMs = DEFAULT_TRANSITION_MS): void {
    this.from = { ...this.current };
    this.to = { ...target };
    this.startedAt = this.clock.elapsed;
    this.transitionS = Math.max(transitionMs, 0) / 1000;
  }

  /** 直接置值（T17 过渡器逐帧插值路径：外部每帧插好喂进来，系统内不再二次过渡）。 */
  setComponentsInstant(values: WeatherMaterialComponents): void {
    this.current = { ...values };
    this.from = { ...this.current };
    this.to = { ...this.current };
    this.transitionS = 0;
  }

  /** 当前七分量（含插值中间态；副本返回防外部改写）。 */
  get components(): WeatherMaterialComponents {
    return { ...this.current };
  }

  /** 第 7 分量 fogMul（D6 输入；AtmosphereSystem.setWeatherFogMul 由 Director 每帧转接）。 */
  get fogMul(): number {
    return this.current.fogMul;
  }

  /* ============================ 注册面（kind 四分支） ============================ */

  /**
   * WeatherSurface 注册（§3.5.1「把 weatherSurfaces 注册进 Material」）。
   * 分支：ground→湿面+整面雪（噪声边缘）；roofTop/clothTop→法线朝上雪遮罩+雪壳驱动；
   * linePaint→划线 alpha。工厂材质（userData.toonArchetype 存在）已由 T06 按原型默认注入
   * （opaque 默认 snow:'up'、groundTerrain 默认 wet+full、lineFadeReactive 显式开启）——值经
   * 共享单例自动到达，本系统跳过其 shader 注入以避免同名 uniform 重复声明。
   */
  register(surfaces: readonly WeatherSurface[]): void {
    for (const surface of surfaces) {
      const material = surface.material;
      if (this.registeredMaterials.has(material.uuid)) continue;
      this.registeredMaterials.add(material.uuid);

      const isFactory = material.userData.toonArchetype !== undefined;
      if (!isFactory) {
        const spec: SurfacePatchSpec =
          surface.kind === 'ground'
            ? { wet: true, snow: 'full', lineFade: false }
            : surface.kind === 'roofTop' || surface.kind === 'clothTop'
              ? { wet: false, snow: 'up', lineFade: false }
              : { wet: false, snow: null, lineFade: true }; // linePaint
        patchSharedWeather(material, spec);
      }

      // M4 snowShell 雪壳挂点：roofTop/clothTop 均驱动（ground/linePaint 的 shell 亦接受，按同规则）
      const shell = surface.snowShell;
      if (shell && !this.shells.some((binding) => binding.mesh === shell)) {
        const materials = Array.isArray(shell.material) ? shell.material : [shell.material];
        const extrude = materials.length === 1 ? patchShellExtrude(materials[0]!) : null;
        this.shells.push({ mesh: shell, materials, extrude });
      }
    }
  }

  /** 清空注册（场景卸载 §3.5.3；不 dispose 内容侧材质/网格）。 */
  clearRegistrations(): void {
    this.registeredMaterials.clear();
    this.registeredLamps.clear();
    this.shells.length = 0;
    // 打磨轮次1：反光条 mesh 为本系统自建（registerReflectionLamps 逐灯新建），须随记录一并摘除
    // 并释放——原实现只清 records，mesh 滞留 stripsGroup：材质 opacity 冻结在卸载瞬值，容器一旦
    // 重新 attach 即以旧灯位鬼影重现，且每次场景切换泄漏 mesh/geometry/material。
    for (const strip of this.strips) {
      strip.mesh.geometry.dispose();
      strip.material.dispose();
    }
    this.stripsGroup.clear();
    this.strips.length = 0;
  }

  /**
   * 反注册（车型卸载 §3.5.3；T23 对齐：VehicleExterior.weatherSurfaces 生命周期随车型交换/卸载）。
   * 按 mesh/material 引用摘除，未知项幂等跳过；不 dispose 内容侧材质/网格（同 clearRegistrations 纪律）。
   */
  unregister(surfaces: readonly WeatherSurface[]): void {
    for (const surface of surfaces) {
      this.registeredMaterials.delete(surface.material.uuid);
      const shell = surface.snowShell;
      if (shell) {
        const at = this.shells.findIndex((binding) => binding.mesh === shell);
        if (at >= 0) this.shells.splice(at, 1);
      }
    }
  }

  /* ============================ 镜面反光条（castReflection） ============================ */

  /**
   * 反光条注册：只认 castReflection===true 的灯（M4 注册位），每场景 ≤6 盏（超出告警并截断）。
   * 落位优先取 lamp.halo 世界坐标（灯体即灯位）；无 halo 时用 opts.positions[i]；两者皆无则该条不落位。
   */
  registerReflectionLamps(
    lamps: readonly LampHandle[],
    opts: { groundY?: number; positions?: readonly (THREE.Vector3 | undefined)[] } = {},
  ): void {
    const groundY = opts.groundY ?? 0;
    let slot = 0;
    for (const lamp of lamps) {
      if (lamp.castReflection !== true) continue;
      if (this.registeredLamps.has(lamp)) continue;
      if (this.strips.length >= STRIP_MAX) {
        console.warn(`[weatherMaterial] castReflection 反光条超出每场景 ${STRIP_MAX} 盏上限，已截断（五-3）`);
        break;
      }
      this.registeredLamps.add(lamp);
      const emissive = lamp.emissiveMat?.emissive;
      const material = new THREE.MeshBasicMaterial({
        color: emissive ? emissive.clone() : '#ffffff',
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: false,
        toneMapped: false,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(STRIP_SIZE_X, STRIP_SIZE_Y), material);
      mesh.name = `weather/reflection/${slot}`;
      mesh.renderOrder = 3;
      mesh.visible = false;
      this.stripsGroup.add(mesh);
      this.strips.push({
        mesh,
        material,
        lamp,
        fixedPos: opts.positions?.[slot] ?? null,
        groundY,
      });
      slot += 1;
    }
  }

  /** 反光条功率直写（未走 TimeChannelSink 时手动路径；语义 = 该灯驱动通道的当前功率 0..1）。 */
  setReflectionPower(power: number): void {
    this.reflectionPower = clamp(power, 0, 1);
  }

  /** TimeChannelSink：六通道下发路径——反光条功率 = max(lampPower, shopPower)（营地灯与商业灯皆可近地强灯）。 */
  applyChannels(channels: TimeChannels, _blend: number): void {
    this.reflectionPower = clamp(Math.max(channels.lampPower, channels.shopPower), 0, 1);
  }

  /* ============================ 运行期注入 ============================ */

  /** 风向（世界系 x/z，来自 WindSystem 经 Director 转接；内部归一）。 */
  setWindDir(x: number, z: number): void {
    const len = Math.hypot(x, z);
    if (len > 1e-6) this.windDir.set(x / len, z / len);
  }

  /** 相机（反光条每帧转向相机方位角，五-3；SceneRuntime.camera / engine.camera 经 Director 注入）。 */
  setCamera(camera: THREE.PerspectiveCamera | null): void {
    this.camera = camera;
  }

  /** 云影 quad 高度（场景地形台面高度适配；默认 0.02 即统一底座台面 y=0 之上）。 */
  setCloudShadowY(y: number): void {
    this.cloudShadowQuad.position.y = y;
    this.cloudShadowQuad.updateMatrix();
  }

  /* ============================ 每帧更新 ============================ */

  /**
   * 每帧更新（Engine 帧序 §3.5.2 ③）：七分量插值→共享 uniform 写入；云影滚动相位、反光条朝向、
   * 雪壳外推/显隐全部取 RhythmClock.elapsed 或当前分量值，零定时器。
   */
  update(): void {
    if (this.transitionS > 0) {
      const p = clamp((this.clock.elapsed - this.startedAt) / this.transitionS, 0, 1);
      const b = p * p * (3 - 2 * p); // smoothstep easeInOut（§4.4.3 同一 smoothstep 机制）
      this.current = lerpComponents(this.from, this.to, b);
      if (p >= 1) this.transitionS = 0;
    }

    // 七分量 → 共享 uniform 单例（fogMul 不入 shader，经 getter 供 AtmosphereSystem）
    const c = this.current;
    sharedUniforms.uWet.value = clamp(c.wetness, 0, 1);
    sharedUniforms.uPuddle.value = clamp(c.puddle, 0, 1);
    sharedUniforms.uSag.value = clamp(c.clothSag, 0, 1);
    sharedUniforms.uSnow.value = clamp(c.snowCover, 0, 1);
    sharedUniforms.uLineFade.value = clamp(c.lineFade, 0, 1);
    sharedUniforms.uCloudShadow.value = clamp(c.cloudShadow, 0, 1);

    // 云影滚动：uDrift = windDir × elapsed × 0.008（§4.4.2 公式逐字；CPU 每帧 1 个 offset uniform）
    const drift = this.clock.elapsed * CLOUD_DRIFT_SPEED;
    this.cloudUniforms.uDrift.value.set(this.windDir.x * drift, this.windDir.y * drift);
    this.cloudShadowQuad.visible = c.cloudShadow > 0.004;

    this.updateReflectionStrips();
    this.updateSnowShells();
  }

  private updateReflectionStrips(): void {
    const wetness = clamp(this.current.wetness, 0, 1);
    const opacity = wetness * this.reflectionPower * STRIP_OP_GAIN;
    const camera = this.camera;
    const wp = new THREE.Vector3(); // 每帧一个临时向量，量小可接受；如需严格零 GC 可改成员暂存
    for (const strip of this.strips) {
      let x: number | null = null;
      let z: number | null = null;
      if (strip.lamp.halo) {
        strip.lamp.halo.getWorldPosition(wp);
        x = wp.x;
        z = wp.z;
      } else if (strip.fixedPos) {
        x = strip.fixedPos.x;
        z = strip.fixedPos.z;
      }
      if (x === null || z === null || opacity <= STRIP_VISIBLE_MIN) {
        strip.mesh.visible = false;
        strip.material.opacity = 0;
        continue;
      }
      strip.mesh.position.set(x, strip.groundY + STRIP_SIZE_Y / 2, z);
      if (camera) {
        // 竖长贴花每帧转向相机方位角（标准假反光手法，五-3）
        strip.mesh.rotation.y = Math.atan2(camera.position.x - x, camera.position.z - z);
      }
      strip.material.opacity = opacity;
      strip.mesh.visible = true;
    }
  }

  private updateSnowShells(): void {
    const snowCover = clamp(this.current.snowCover, 0, 1);
    const visible = snowCover > SHELL_VISIBLE_MIN;
    const opacity = Math.min(1, SHELL_OP_GAIN * snowCover);
    for (const shell of this.shells) {
      shell.mesh.visible = visible;
      if (shell.extrude) shell.extrude.value = SHELL_EXTRUDE_MAX * snowCover;
      for (const material of shell.materials) material.opacity = opacity;
    }
  }

  /** 释放自持资源（quad/反光条几何与材质；内容侧雪壳/材质不 dispose）。 */
  dispose(): void {
    this.detach();
    this.clearRegistrations();
    this.cloudShadowQuad.geometry.dispose();
    (this.cloudShadowQuad.material as THREE.Material).dispose();
    for (const strip of this.strips) {
      strip.mesh.geometry.dispose();
      strip.material.dispose();
    }
    this.stripsGroup.clear();
    this.strips.length = 0;
  }
}

/** 七分量逐字段线性插值（全部为数值分量）。 */
function lerpComponents(
  a: WeatherMaterialComponents,
  b: WeatherMaterialComponents,
  t: number,
): WeatherMaterialComponents {
  return {
    wetness: a.wetness + (b.wetness - a.wetness) * t,
    puddle: a.puddle + (b.puddle - a.puddle) * t,
    clothSag: a.clothSag + (b.clothSag - a.clothSag) * t,
    snowCover: a.snowCover + (b.snowCover - a.snowCover) * t,
    lineFade: a.lineFade + (b.lineFade - a.lineFade) * t,
    fogMul: a.fogMul + (b.fogMul - a.fogMul) * t,
    cloudShadow: a.cloudShadow + (b.cloudShadow - a.cloudShadow) * t,
  };
}
