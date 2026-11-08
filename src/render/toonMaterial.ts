// docs/01-整体架构.md §3.2 render/toonMaterial.ts —— ToonMaterialFactory：卡通材质 + 渐变色阶 ramp（§5.2）。
// T05：12 材质原型（全项目唯一着色路径来源——内容模块禁止私搭 ShaderMaterial，§5.2 原型库）+ ramp×5 档 Canvas 渐变
//      + 玻璃变体 + 共享 uniform 挂点（uSnow/uWet 等接入口，供 T13 WeatherMaterialSystem / T09 WindSystem 注入）。
// T06（风险 R1 先手）：onBeforeCompile 三补丁——①RGB 色阶 ②高光带 ③rim（每个可独立关闭）
//      + customProgramCacheKey 程序缓存隔离 + 补丁失败自动降级纯内建 MeshToonMaterial（§5.2 可选增强补丁）。
// R1 缓解结构（本文件关键设计）：onBeforeCompile 收到的着色器仍是含 #include 行的未展开模板——
//   所有字符串手术都在「工作副本」上进行并逐锚点校验，全部成功才一次性写回 shader.fragmentShader；
//   任一锚点失配（three 版本漂移）即抛错→catch→不写回=纯内建管线（灰度 ramp+冷暖灯光，画面依然成立）。
//   锚点已在 three@0.187.0 实装源码上核对（gradientmap_pars_fragment / lights_fragment_begin / meshtoon 模板）。
import * as THREE from 'three';
import type { WebGLProgramParametersWithUniforms } from 'three';
import {
  buildRampTexture,
  getTexture,
  type RampStop,
} from '@/tex/canvasTex';
import { clamp } from '@/shared/math';

// ---------------------------------------------------------------------------
// ramp 五档（§5.2：工厂预置 ramp3/ramp2/ramp4/rampSoft/rampFar；本体灰度，色相来自灯光与环境光）
// ramp3 使用文档默认三段式；其余档位为按「暗带下限 0.34 / 无死黑」纪律取的实现期校准默认（T43 可调）。
// ---------------------------------------------------------------------------

export type RampId = 'ramp3' | 'ramp2' | 'ramp4' | 'rampSoft' | 'rampFar';

const RAMP_STEPS: Record<RampId, readonly RampStop[]> = {
  // 文档默认三段式（§5.2）
  ramp3: [
    { t: 0, v: 0.34 }, { t: 0.22, v: 0.34 }, { t: 0.24, v: 0.62 },
    { t: 0.52, v: 0.62 }, { t: 0.55, v: 1.0 }, { t: 1.0, v: 1.0 },
  ],
  // 地面/混凝土/柏油/细碎小物：两档，暗带略抬避免大面泥泞
  ramp2: [
    { t: 0, v: 0.4 }, { t: 0.5, v: 0.4 }, { t: 0.54, v: 1.0 }, { t: 1.0, v: 1.0 },
  ],
  // 车漆多一档过渡（四段）
  ramp4: [
    { t: 0, v: 0.34 }, { t: 0.18, v: 0.34 }, { t: 0.21, v: 0.56 }, { t: 0.45, v: 0.56 },
    { t: 0.48, v: 0.8 }, { t: 0.75, v: 0.8 }, { t: 0.78, v: 1.0 }, { t: 1.0, v: 1.0 },
  ],
  // 布料纸张软物：带宽过渡带
  rampSoft: [
    { t: 0, v: 0.42 }, { t: 0.3, v: 0.42 }, { t: 0.45, v: 0.72 },
    { t: 0.7, v: 0.72 }, { t: 0.85, v: 1.0 }, { t: 1.0, v: 1.0 },
  ],
  // 远景剪影压平 0.72/1.0（§5.2）
  rampFar: [
    { t: 0, v: 0.72 }, { t: 0.35, v: 0.72 }, { t: 0.4, v: 1.0 }, { t: 1.0, v: 1.0 },
  ],
};

function getRampTexture(id: RampId): THREE.Texture {
  const key = `ramp:${id}`;
  const existing = getTexture(key);
  if (existing) return existing;
  return buildRampTexture(key, RAMP_STEPS[id]); // permanent 常驻（§5.4 全局常驻层）
}

// ---------------------------------------------------------------------------
// 共享 uniform 单例（§5.6：天气/时间共享 uniform 为模块级单例——切天气改 7 个数字，非遍历材质）
// 写入方：T13 WeatherMaterialSystem（天气七分量）、T09 WindSystem（P2 植被通道）、
//         water 动效由场景动画写 uWaterTime（§5.8：CPU 每帧 2 uniform）。
// 材质侧经 onBeforeCompile 按引用注入（shader.uniforms.uX = sharedUniforms.uX）——改一处全场生效。
// ---------------------------------------------------------------------------

export interface SharedWeatherUniforms {
  uWet: THREE.IUniform<number>;
  uPuddle: THREE.IUniform<number>;
  uSag: THREE.IUniform<number>;
  uSnow: THREE.IUniform<number>;
  uLineFade: THREE.IUniform<number>;
  uCloudShadow: THREE.IUniform<number>;
  /** P2：WindSystem 植被摆动通道注入口 */
  uWindStrength: THREE.IUniform<number>;
  uWindPhase: THREE.IUniform<number>;
  /** water 动效时间相位与天空色（§5.8） */
  uWaterTime: THREE.IUniform<number>;
  uWaterSkyColor: THREE.IUniform<THREE.Color>;
}

export const sharedUniforms: SharedWeatherUniforms = {
  uWet: { value: 0 },
  uPuddle: { value: 0 },
  uSag: { value: 0 },
  uSnow: { value: 0 },
  uLineFade: { value: 0 },
  uCloudShadow: { value: 0 },
  uWindStrength: { value: 0 },
  uWindPhase: { value: 0 },
  uWaterTime: { value: 0 },
  uWaterSkyColor: { value: new THREE.Color('#3a5a8c') },
};

// ---------------------------------------------------------------------------
// 12 材质原型（§5.2 原型库表；新增内容物无原型可用时在本文件评审追加，禁止内容模块私搭）
// ---------------------------------------------------------------------------

export type ToonArchetype =
  | 'paintCar' | 'paintTrim' | 'matteProp' | 'wood' | 'metal' | 'concrete'
  | 'groundTerrain' | 'foliage' | 'glass' | 'emissiveLamp' | 'water' | 'cloth';

interface ArchetypeDefaults {
  ramp: RampId;
  /** 描边参与（§5.2 原型表「描边」列；noOutline 标记写进 userData，OutlineSystem 消费） */
  outline: boolean;
  specBand?: boolean;
  rim?: boolean;
  transparent?: boolean;
  depthWrite?: boolean;
}

const ARCHETYPE_DEFAULTS: Record<ToonArchetype, ArchetypeDefaults> = {
  paintCar:      { ramp: 'ramp4', outline: true, specBand: true },            // 强条状阈值高光
  paintTrim:     { ramp: 'ramp3', outline: true },
  matteProp:     { ramp: 'ramp3', outline: true },                            // 默认原型
  wood:          { ramp: 'ramp3', outline: true },
  metal:         { ramp: 'ramp2', outline: true, specBand: true },            // 硬高光
  concrete:      { ramp: 'ramp2', outline: true },
  groundTerrain: { ramp: 'ramp2', outline: true },                            // uWet/uSnow 默认反应面
  foliage:       { ramp: 'ramp3', outline: true, rim: true },                 // 逆光 rim
  glass:         { ramp: 'ramp2', outline: false, transparent: true, depthWrite: false, specBand: true }, // 斜条高光
  emissiveLamp:  { ramp: 'ramp3', outline: false },                           // MeshBasicMaterial 系（ramp 无用）
  water:         { ramp: 'ramp2', outline: false, transparent: true, depthWrite: false }, // 自定义 shader
  cloth:         { ramp: 'rampSoft', outline: true },                         // 顶点动画归 WindSystem
};

export interface ToonSpecBandParams {
  /** 硬阈值（N·H step 阈值）；车漆强条带默认 0.92、金属 0.86 */
  threshold?: number;
  intensity?: number;
  color?: THREE.ColorRepresentation;
}

export interface ToonRimParams {
  power?: number;
  /** ≤0.35 纪律（§5.2），超限自动钳制 */
  strength?: number;
  color?: THREE.ColorRepresentation;
}

export interface ToonMaterialParams {
  color?: THREE.ColorRepresentation;
  map?: THREE.Texture | null;
  ramp?: RampId;
  /** 直接指定着色 ramp 贴图（RGB ramp 补丁①的着色 ramp：海面/逆光剪影，色档用 canvasTex RampStop.color） */
  rampTexture?: THREE.Texture;
  opacity?: number;
  /** emissive 自发光通道（灯体 toon——LampHandle.emissiveMat 消费方；LightBreath 注册期快照基值后逐帧驱动，§5.2） */
  emissive?: THREE.ColorRepresentation;
  /** emissive 初值强度（内容侧 authored 基值；默认 1 = three 内建默认，不传即与普通 toon 材质无差别） */
  emissiveIntensity?: number;
  /** 描边参与标记（false → userData.noOutline，§5.3） */
  outline?: boolean;
  /** 补丁①：RGB 色阶（getGradientIrradiance 采 .rgb） */
  rgbRamp?: boolean;
  /** 补丁②：高光带（Blinn-Phong 硬阈值一档平涂）；false 可关原型默认 */
  specBand?: boolean | ToonSpecBandParams;
  /** 补丁③：边缘光 rim（受光侧半量）；false 可关原型默认 */
  rim?: boolean | ToonRimParams;
  /** 补丁④积雪遮罩：'up' 法线朝上部位 / 'full' 整面（地面）/'off'（§5.2 uSnow 行；opaque 原型默认 'up'，地面默认 'full'） */
  snow?: 'off' | 'up' | 'full';
  /** uWet 反应面（groundTerrain 默认开）：albedo-10% + 高光×(1+3uWet) + 色带并档（§5.2 uWet 行） */
  wetReactive?: boolean;
  /** uLineFade 划线层 alpha ×(1−uLineFade×0.85)（服务区 linePaint，§5.2 uLineFade 行） */
  lineFadeReactive?: boolean;
  /** water 专用：波光色/波纹密度/流速/菲涅尔幂（§5.8 海面波光） */
  glintColor?: THREE.ColorRepresentation;
  waveScale?: number;
  waveSpeed?: number;
  fresnelPower?: number;
  name?: string;
}

// ---------------------------------------------------------------------------
// 补丁计划（T06）：每个补丁独立开关；plan 决定插桩内容与程序缓存键
// ---------------------------------------------------------------------------

interface ToonPatchPlan {
  rgbRamp: boolean;
  wetReactive: boolean;
  specBand: { threshold: number; intensity: number; color: string } | null;
  specStreak: boolean; // glass 斜条（screen-space 对角条纹）
  rim: { power: number; strength: number; color: string } | null;
  snow: 'off' | 'up' | 'full';
  lineFade: boolean;
}

function resolveSpecBand(archetype: ToonArchetype, params: ToonMaterialParams, d: ArchetypeDefaults): ToonPatchPlan['specBand'] {
  const raw = params.specBand === undefined ? (d.specBand ? {} : null) : (params.specBand === false ? null : (params.specBand === true ? {} : params.specBand));
  if (raw === null) return null;
  const threshold = raw.threshold ?? (archetype === 'paintCar' ? 0.92 : 0.86);
  const intensity = raw.intensity ?? (archetype === 'paintCar' ? 0.85 : 0.5);
  const color = raw.color ?? '#ffffff';
  return { threshold, intensity, color: toHex(color) };
}

function resolveRim(params: ToonMaterialParams, d: ArchetypeDefaults): ToonPatchPlan['rim'] {
  const raw = params.rim === undefined ? (d.rim ? {} : null) : (params.rim === false ? null : (params.rim === true ? {} : params.rim));
  if (raw === null) return null;
  return {
    power: raw.power ?? 2.4,
    strength: clamp(raw.strength ?? 0.3, 0, 0.35), // uRimStrength ≤0.35（§5.2）
    color: toHex(raw.color ?? '#ffffff'),
  };
}

function resolveSnow(archetype: ToonArchetype, params: ToonMaterialParams): ToonPatchPlan['snow'] {
  if (params.snow !== undefined) return params.snow;
  if (archetype === 'groundTerrain') return 'full'; // 地面整面 mix（§5.2 uSnow 行）
  if (archetype === 'emissiveLamp' || archetype === 'water' || archetype === 'glass') return 'off';
  return 'up'; // 屋顶/天幕/树枝/护栏/桌椅顶——法线朝上遮罩一行覆盖（§5.2 uSnow 行）
}

function resolvePlan(archetype: ToonArchetype, params: ToonMaterialParams, d: ArchetypeDefaults): ToonPatchPlan {
  const wetReactive = params.wetReactive ?? (archetype === 'groundTerrain');
  // 湿面高光 ×(1+3uWet) 依赖高光带补丁——反应面未显式关高光时自动补一档弱高光（§5.2 uWet 行）
  const specBand = resolveSpecBand(archetype, params, d)
    ?? (wetReactive ? { threshold: 0.9, intensity: 0.35, color: '#ffffff' } : null);
  return {
    rgbRamp: params.rgbRamp ?? false,
    wetReactive,
    specBand,
    // 玻璃高光带以斜条呈现（§5.2 原型表）；斜条复用高光带 uniform，须与 specBand 同开
    specStreak: archetype === 'glass' && specBand !== null,
    rim: resolveRim(params, d),
    snow: resolveSnow(archetype, params),
    lineFade: params.lineFadeReactive ?? false,
  };
}

function planKey(plan: ToonPatchPlan): string {
  return [
    `rgb${plan.rgbRamp ? 1 : 0}`,
    `wet${plan.wetReactive ? 1 : 0}`,
    `spec${plan.specBand ? 1 : 0}`,
    `streak${plan.specStreak ? 1 : 0}`,
    `rim${plan.rim ? 1 : 0}`,
    `snow-${plan.snow}`,
    `line${plan.lineFade ? 1 : 0}`,
  ].join('|');
}

function toHex(color: THREE.ColorRepresentation): string {
  return `#${new THREE.Color(color).getHexString(THREE.SRGBColorSpace)}`;
}

// ---------------------------------------------------------------------------
// onBeforeCompile 补丁实现（T06）
// 锚点核对基准：three@0.187.0 —— gradientmap_pars_fragment 的
//   `return vec3( texture2D( gradientMap, coord ).r );`
// meshtoon 模板的 `#include <normal_fragment_maps>` / `#include <lights_fragment_end>`，
// 以及 lights_fragment_begin 的 geometryNormal / geometryViewDir 局部变量。
// ---------------------------------------------------------------------------

const GRADIENT_INCLUDE_ANCHOR = '#include <gradientmap_pars_fragment>';
const GRADIENT_RETURN_ANCHOR = 'return vec3( texture2D( gradientMap, coord ).r );';
const NORMAL_MAPS_ANCHOR = '#include <normal_fragment_maps>';
const LIGHTS_END_ANCHOR = '#include <lights_fragment_end>';

/** 补丁①/湿面并档：重写 gradientmap 块的 return（include 行级替换；锚点失配抛错 → 降级）。 */
function buildGradientChunkReplacement(plan: ToonPatchPlan): string {
  const source = THREE.ShaderChunk.gradientmap_pars_fragment;
  if (!source.includes(GRADIENT_RETURN_ANCHOR)) {
    throw new Error(`gradientmap_pars_fragment 锚点失配（three r${THREE.REVISION}）`);
  }
  const sampleExpr = plan.rgbRamp
    ? 'texture2D( gradientMap, coord ).rgb'
    : 'vec3( texture2D( gradientMap, coord ).r )';
  let body = `vec3 gradientIrradiance = ${sampleExpr};`;
  if (plan.wetReactive) {
    // 湿面「镜面平涂」：色带并档（§5.2 uWet 行）
    body += '\n\t\tgradientIrradiance = mix( gradientIrradiance, vec3( 1.0 ), saturate( uWet ) * 0.65 );';
  }
  body += '\n\t\treturn gradientIrradiance;';
  return source.replace(GRADIENT_RETURN_ANCHOR, body);
}

function replaceFirst(source: string, anchor: string, replacement: string): string {
  if (!source.includes(anchor)) {
    throw new Error(`着色器锚点失配：${anchor}`);
  }
  return source.replace(anchor, replacement);
}

/**
 * 应用三补丁（+积雪/湿面/划线/斜条衍生插桩）。
 * 导出目的：T06 冒烟/单测可对真实 ShaderLib 源做无头校验；渲染路径经 material.onBeforeCompile 调用。
 * 降级保证：所有替换在工作副本上进行，全部成功才写回 shader；任一异常不写回=纯内建 MeshToonMaterial。
 */
export function applyToonPatches(
  shader: WebGLProgramParametersWithUniforms,
  plan: ToonPatchPlan,
  material: THREE.Material,
): void {
  const decls = new Set<string>();
  let frag = shader.fragmentShader;
  try {
    // —— ① RGB 色阶 / 湿面色带并档：重写 gradientmap 块 ——
    if (plan.rgbRamp || plan.wetReactive) {
      frag = replaceFirst(frag, GRADIENT_INCLUDE_ANCHOR, buildGradientChunkReplacement(plan));
      if (plan.wetReactive) {
        decls.add('uniform float uWet;');
        shader.uniforms.uWet = sharedUniforms.uWet;
      }
    }

    // —— diffuse/emissive 层插桩（#include <normal_fragment_maps> 之后：normal/vViewPosition/
    //     totalEmissiveRadiance 已就位，且早于 lights_* 的插桩不冲突）——
    const surfaceMods: string[] = [];

    if (plan.snow !== 'off') {
      decls.add('uniform float uSnow;');
      decls.add('uniform vec3 uSnowColor;');
      shader.uniforms.uSnow = sharedUniforms.uSnow;
      shader.uniforms.uSnowColor = { value: new THREE.Color('#f2f5fa') };
      const mask = plan.snow === 'full'
        ? '1.0'
        : 'smoothstep( 0.55, 0.8, dot( normal, worldUpView ) )';
      surfaceMods.push(
        '{',
        '\tvec3 worldUpView = normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz );',
        `\tfloat snowMask = ${mask};`,
        '\tdiffuseColor.rgb = mix( diffuseColor.rgb, uSnowColor, saturate( uSnow ) * snowMask );',
        '}',
      );
    }

    if (plan.wetReactive) {
      // albedo 加深 10%（§5.2 uWet 行）
      surfaceMods.push('{ diffuseColor.rgb *= ( 1.0 - 0.1 * saturate( uWet ) ); }');
    }

    if (plan.lineFade) {
      decls.add('uniform float uLineFade;');
      shader.uniforms.uLineFade = sharedUniforms.uLineFade;
      surfaceMods.push('{ diffuseColor.a *= ( 1.0 - saturate( uLineFade ) * 0.85 ); }');
    }

    if (plan.rim) {
      decls.add('uniform float uRimPower;');
      decls.add('uniform float uRimStrength;');
      decls.add('uniform vec3 uRimColor;');
      shader.uniforms.uRimPower = { value: plan.rim.power };
      shader.uniforms.uRimStrength = { value: plan.rim.strength };
      shader.uniforms.uRimColor = { value: new THREE.Color(plan.rim.color) };
      // 边缘光：pow(1−saturate(N·V), uRimPower)，仅受光侧半量（§5.2 补丁③）
      surfaceMods.push(
        '{',
        '\tfloat rimNV = saturate( dot( normal, normalize( vViewPosition ) ) );',
        '\tfloat rimLitSide = 0.0;',
        '\t#if NUM_DIR_LIGHTS > 0',
        '\t\trimLitSide = saturate( dot( normal, directionalLights[ 0 ].direction ) );',
        '\t#endif',
        '\tfloat rimFactor = pow( 1.0 - rimNV, uRimPower ) * uRimStrength * rimLitSide * 0.5;',
        '\ttotalEmissiveRadiance += uRimColor * rimFactor;',
        '}',
      );
    }

    if (plan.specStreak) {
      decls.add('uniform float uStreakScale;');
      shader.uniforms.uStreakScale = { value: 260.0 };
      // 玻璃斜条高光：屏幕空间对角细条纹（§5.2 原型表 glass「✓斜条」）
      surfaceMods.push(
        '{',
        '\tfloat streakCoord = ( gl_FragCoord.x + gl_FragCoord.y * 1.6 ) / max( uStreakScale, 1.0 );',
        '\tfloat streak = step( 0.965, fract( streakCoord ) );',
        '\ttotalEmissiveRadiance += uSpecColor * uSpecIntensity * streak;',
        '}',
      );
    }

    if (surfaceMods.length > 0) {
      frag = replaceFirst(frag, NORMAL_MAPS_ANCHOR, `${NORMAL_MAPS_ANCHOR}\n${surfaceMods.join('\n')}`);
    }

    // —— ② 高光带：Blinn-Phong 硬阈值一档平涂（lights_fragment_end 之前，geometry* 变量已就位）——
    if (plan.specBand) {
      decls.add('uniform float uSpecThreshold;');
      decls.add('uniform float uSpecIntensity;');
      decls.add('uniform vec3 uSpecColor;');
      shader.uniforms.uSpecThreshold = { value: plan.specBand.threshold };
      shader.uniforms.uSpecIntensity = { value: plan.specBand.intensity };
      shader.uniforms.uSpecColor = { value: new THREE.Color(plan.specBand.color) };
      const boost = plan.wetReactive
        ? 'uSpecIntensity * ( 1.0 + 3.0 * saturate( uWet ) )' // 高光带 ×(1+3uWet)（§5.2 uWet 行）
        : 'uSpecIntensity';
      const specBlock = [
        '#if NUM_DIR_LIGHTS > 0',
        '{',
        '\tvec3 specHalfDir = normalize( directionalLights[ 0 ].direction + geometryViewDir );',
        '\tfloat specDot = saturate( dot( geometryNormal, specHalfDir ) );',
        '\tfloat specBandMask = step( uSpecThreshold, specDot );',
        `\tfloat specBoost = ${boost};`,
        '\treflectedLight.directDiffuse += directionalLights[ 0 ].color * uSpecColor * specBoost * specBandMask;',
        '}',
        '#endif',
      ].join('\n');
      frag = replaceFirst(frag, LIGHTS_END_ANCHOR, `${specBlock}\n${LIGHTS_END_ANCHOR}`);
    }

    if (decls.size > 0) {
      frag = `${[...decls].join('\n')}\n${frag}`;
    }

    shader.fragmentShader = frag; // ← 全部锚点手术成功才落盘；否则保持原样（纯内建）
  } catch (err) {
    material.userData.patchDegraded = true;
    console.warn(
      `[toonMaterial] 「${material.name}」onBeforeCompile 补丁失败，自动降级纯内建 MeshToonMaterial（灰度 ramp+冷暖灯光，§5.2）`,
      err,
    );
  }
}

// ---------------------------------------------------------------------------
// water 原型（自定义 shader：1 平面 + 时间相位，无顶点波动，§5.2 原型表 #11 / §5.8）
// 波光=两层 value noise 阈值高光带、uv 反向滚动；菲涅尔混天空色；噪声内联 GLSL 自写。
// ---------------------------------------------------------------------------

const WATER_VERT = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
varying vec2 vUv;
varying vec3 vWorldPos;
void main() {
  vUv = uv;
  vec4 worldPos = modelMatrix * vec4( position, 1.0 );
  vWorldPos = worldPos.xyz;
  vec4 mvPosition = viewMatrix * worldPos;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const WATER_FRAG = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
uniform float uTime;
uniform vec3 uColor;
uniform vec3 uSkyColor;
uniform vec3 uGlintColor;
uniform float uWaveScale;
uniform float uWaveSpeed;
uniform float uFresnelPower;
uniform float uOpacity;
varying vec2 vUv;
varying vec3 vWorldPos;

float waterHash( vec2 p ) {
  return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 );
}
float waterNoise( vec2 p ) {
  vec2 ip = floor( p );
  vec2 fp = fract( p );
  vec2 u = fp * fp * ( 3.0 - 2.0 * fp );
  float a = waterHash( ip );
  float b = waterHash( ip + vec2( 1.0, 0.0 ) );
  float c = waterHash( ip + vec2( 0.0, 1.0 ) );
  float d = waterHash( ip + vec2( 1.0, 1.0 ) );
  return mix( mix( a, b, u.x ), mix( c, d, u.x ), u.y );
}

void main() {
  // 两层噪声 uv 反向滚动 + 阈值高光带（§5.8 海面波光粼粼）
  vec2 uvA = vUv * uWaveScale + vec2( uTime * uWaveSpeed, uTime * uWaveSpeed * 0.6 );
  vec2 uvB = vUv * uWaveScale * 1.7 - vec2( uTime * uWaveSpeed * 0.8, uTime * uWaveSpeed * 0.3 );
  float n = waterNoise( uvA ) * 0.65 + waterNoise( uvB ) * 0.35;
  float glint = step( 0.78, n );
  vec3 viewDir = normalize( cameraPosition - vWorldPos );
  float fresnel = pow( 1.0 - saturate( dot( viewDir, vec3( 0.0, 1.0, 0.0 ) ) ), uFresnelPower );
  vec3 color = mix( uColor, uSkyColor, fresnel );
  color = mix( color, uGlintColor, glint * 0.5 );
  gl_FragColor = vec4( color, uOpacity );
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

// ---------------------------------------------------------------------------
// ToonMaterialFactory
// ---------------------------------------------------------------------------

export class ToonMaterialFactory {
  private cache = new Map<string, THREE.Material>();

  /** 取材质：同原型+同参数命中缓存（01 §3.7 #3「同参数命中缓存」；每组合 ≤28 材质实例，§5.6）。 */
  get(archetype: ToonArchetype, params: ToonMaterialParams = {}): THREE.Material {
    const d = ARCHETYPE_DEFAULTS[archetype];
    const plan = resolvePlan(archetype, params, d);
    const rampKey = params.rampTexture ? params.rampTexture.uuid : `ramp:${params.ramp ?? d.ramp}`;
    const colorKey = params.color === undefined ? '-' : toHex(params.color);
    const mapKey = params.map ? params.map.uuid : '-';
    // emissive 参与缓存键（同原型同色不同自发光不得共串——两桩灯体 emissive 色不同即靠此区分）
    const emissiveKey =
      params.emissive === undefined
        ? '-'
        : `e${toHex(params.emissive)},${(params.emissiveIntensity ?? 1).toFixed(3)}`;
    const opacity = params.opacity ?? (d.transparent ? 0.24 : 1);
    const key = [
      archetype, rampKey, colorKey, mapKey, emissiveKey,
      `o${opacity === undefined ? '-' : opacity.toFixed(3)}`,
      `ol${params.outline === undefined ? '-' : (params.outline ? 1 : 0)}`,
      planKey(plan),
      plan.specBand ? `${plan.specBand.threshold.toFixed(3)},${plan.specBand.intensity.toFixed(3)},${plan.specBand.color}` : '',
      plan.rim ? `${plan.rim.power.toFixed(2)},${plan.rim.strength.toFixed(3)},${plan.rim.color}` : '',
      archetype === 'water'
        ? `w${(params.waveScale ?? 9).toFixed(2)},${(params.waveSpeed ?? 0.06).toFixed(4)},${(params.fresnelPower ?? 2.2).toFixed(2)},${params.glintColor === undefined ? '-' : toHex(params.glintColor)}`
        : '',
      params.name ?? '',
    ].join('|');
    const hit = this.cache.get(key);
    if (hit) return hit;
    const material = this.build(archetype, params, plan, key);
    this.cache.set(key, material);
    return material;
  }

  /**
   * get() 的 MeshToonMaterial 收窄版：灯体等 LampHandle.emissiveMat 消费方需要该具体类型
   * （LightBreath 逐帧写 emissiveIntensity）。water/emissiveLamp 两原型返回类型不同，编译期即排除。
   */
  getToon(
    archetype: Exclude<ToonArchetype, 'water' | 'emissiveLamp'>,
    params: ToonMaterialParams = {},
  ): THREE.MeshToonMaterial {
    const material = this.get(archetype, params);
    if (!(material instanceof THREE.MeshToonMaterial)) {
      throw new Error(`[toonMaterial] getToon：「${archetype}」未返回 MeshToonMaterial`);
    }
    return material;
  }

  private build(
    archetype: ToonArchetype,
    params: ToonMaterialParams,
    plan: ToonPatchPlan,
    key: string,
  ): THREE.Material {
    switch (archetype) {
      case 'emissiveLamp':
        return this.buildEmissive(params, key);
      case 'water':
        return this.buildWater(params, key);
      default:
        return this.buildToon(archetype, params, plan, key);
    }
  }

  private buildToon(
    archetype: ToonArchetype,
    params: ToonMaterialParams,
    plan: ToonPatchPlan,
    key: string,
  ): THREE.MeshToonMaterial {
    const d = ARCHETYPE_DEFAULTS[archetype];
    const gradientMap = params.rampTexture ?? getRampTexture(params.ramp ?? d.ramp);
    const opacity = params.opacity ?? (d.transparent ? 0.24 : 1);
    const transparent = params.opacity !== undefined ? params.opacity < 1 : (d.transparent ?? false);
    const material = new THREE.MeshToonMaterial({
      color: params.color ?? '#b8b8c0',
      map: params.map ?? null,
      gradientMap,
      emissive: params.emissive ?? '#000000', // 默认黑 = three 内建默认，既有调用方行为不变
      emissiveIntensity: params.emissiveIntensity ?? 1,
      transparent,
      opacity,
      fog: true,
    });
    material.depthWrite = d.depthWrite ?? !transparent; // 玻璃 depthWrite:false（§5.2）
    material.name = params.name ?? archetype;
    const outline = params.outline ?? d.outline;
    material.userData = {
      toonArchetype: archetype,
      toonKey: key,
      outline,
      noOutline: !outline, // §5.3：材质工厂接受 noOutline 标记
    };
    const patched = plan.rgbRamp || plan.wetReactive || plan.specBand !== null
      || plan.specStreak || plan.rim !== null || plan.snow !== 'off' || plan.lineFade;
    if (patched) {
      material.customProgramCacheKey = () => `toon|${planKey(plan)}`; // 程序缓存隔离（§5.2）
      material.onBeforeCompile = (shader) => applyToonPatches(shader, plan, material);
    }
    return material;
  }

  private buildEmissive(params: ToonMaterialParams, key: string): THREE.MeshBasicMaterial {
    // 灯的唯一真理：unlit + halo sprite（§5.2 原型表 #10）；不接收 ramp/补丁/阴影
    const material = new THREE.MeshBasicMaterial({
      color: params.color ?? '#ffd9a0',
      map: params.map ?? null,
      fog: true,
    });
    material.toneMapped = false;
    material.name = params.name ?? 'emissiveLamp';
    material.userData = { toonArchetype: 'emissiveLamp', toonKey: key, outline: false, noOutline: true };
    return material;
  }

  private buildWater(params: ToonMaterialParams, key: string): THREE.ShaderMaterial {
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: sharedUniforms.uWaterTime,
        uSkyColor: sharedUniforms.uWaterSkyColor,
        uColor: { value: new THREE.Color(params.color ?? '#2e6f8e') },
        uGlintColor: { value: new THREE.Color(params.glintColor ?? '#ffd9a0') },
        uWaveScale: { value: params.waveScale ?? 9 },
        uWaveSpeed: { value: params.waveSpeed ?? 0.06 },
        uFresnelPower: { value: params.fresnelPower ?? 2.2 },
        uOpacity: { value: params.opacity ?? 0.88 },
      },
      vertexShader: WATER_VERT,
      fragmentShader: WATER_FRAG,
      transparent: true,
      depthWrite: false,
      fog: true,
    });
    material.name = params.name ?? 'water';
    material.userData = { toonArchetype: 'water', toonKey: key, outline: false, noOutline: true };
    return material;
  }

  /** 清空材质缓存并 dispose（仅整体销毁时调用；材质实例归本工厂管理，不经 SharedAssets）。 */
  disposeAll(): void {
    for (const material of this.cache.values()) material.dispose();
    this.cache.clear();
  }

  stats(): { cached: number; byArchetype: Record<string, number> } {
    const byArchetype: Record<string, number> = {};
    for (const material of this.cache.values()) {
      const id = String(material.userData.toonArchetype ?? 'other');
      byArchetype[id] = (byArchetype[id] ?? 0) + 1;
    }
    return { cached: this.cache.size, byArchetype };
  }
}

/** 全项目唯一着色路径来源（§5.2 原型库）。 */
export const toonMaterials = new ToonMaterialFactory();

// ---------------------------------------------------------------------------
// DEV 冒烟挂载点（T06）：色带 + 高光带 + rim 同屏；实机验证由后续冒烟阶段挂载执行。
// 用法（后续冒烟阶段）：scene.add(buildToonSmokeScene()) → 截图核对 → scene.remove + disposeAll 由调用方处理。
// ---------------------------------------------------------------------------

export const DEV_TOON_SMOKE_NAME = 'DEV_TOON_SMOKE';

export function buildToonSmokeScene(): THREE.Group {
  const root = new THREE.Group();
  root.name = DEV_TOON_SMOKE_NAME;
  root.userData = { devOnly: true, smokeChecks: ['ramp5', 'rampStrips', 'specBand', 'rim', 'rgbRamp', 'glassStreak', 'emissive', 'snow', 'wet'] };

  // 冒烟灯光：暖方向光 + 冷 hemisphere（§5.2 冷暖分离机制最小复现）
  const hemi = new THREE.HemisphereLight('#8fa3c8', '#3a3244', 0.9);
  const dir = new THREE.DirectionalLight('#ffd9a0', 2.4);
  dir.position.set(6, 10, 4);
  root.add(hemi, dir);

  const ground = new THREE.Mesh(
    new THREE.BoxGeometry(26, 0.2, 12),
    toonMaterials.get('matteProp', { color: '#6f7a86', snow: 'off', name: 'smoke/ground' }),
  );
  ground.position.y = -0.1;
  root.add(ground);

  const ballGeometry = new THREE.SphereGeometry(0.8, 20, 14);

  // A. 色带 5 档：同 albedo 不同 ramp——暗带宽度/层次一眼可辨；下方 ramp 贴图直读条供 T43 调参
  const ramps: RampId[] = ['ramp2', 'ramp3', 'ramp4', 'rampSoft', 'rampFar'];
  ramps.forEach((ramp, i) => {
    const ball = new THREE.Mesh(ballGeometry, toonMaterials.get('matteProp', { color: '#d08a4e', ramp, name: `smoke/ramp-${ramp}` }));
    ball.position.set(-9 + i * 2, 1.1, -3);
    root.add(ball);
    const strip = new THREE.Mesh(
      new THREE.PlaneGeometry(1.6, 0.36),
      toonMaterials.get('emissiveLamp', { color: '#ffffff', map: getRampTexture(ramp), name: `smoke/strip-${ramp}` }),
    );
    strip.rotation.x = -Math.PI / 2;
    strip.position.set(-9 + i * 2, 0.02, -3);
    root.add(strip);
  });

  // B. 高光带：metal 硬高光 / paintCar 强条带 / glass 斜条（透明）
  const metalBall = new THREE.Mesh(ballGeometry, toonMaterials.get('metal', { color: '#8f9aa6', name: 'smoke/metal' }));
  metalBall.position.set(-6, 1.1, 1);
  const carBox = new THREE.Mesh(
    new THREE.BoxGeometry(2.4, 1, 1.2),
    toonMaterials.get('paintCar', { color: '#c2564a', name: 'smoke/paintCar' }),
  );
  carBox.position.set(-2.5, 1.3, 1);
  const glassPane = new THREE.Mesh(
    new THREE.PlaneGeometry(1.8, 1.2),
    toonMaterials.get('glass', { color: '#9fd8e8', opacity: 0.3, name: 'smoke/glass' }),
  );
  glassPane.position.set(1.5, 1.4, 1);
  root.add(metalBall, carBox, glassPane);

  // C. rim 对照 + RGB ramp：foliage(rim on) vs matteProp(rim off)；RGB ramp 用着色 ramp（金橙/蓝紫）
  const rimOn = new THREE.Mesh(ballGeometry, toonMaterials.get('foliage', { color: '#4e7a4a', name: 'smoke/rim-on' }));
  rimOn.position.set(-6, 1.1, 4);
  const rimOff = new THREE.Mesh(ballGeometry, toonMaterials.get('matteProp', { color: '#4e7a4a', name: 'smoke/rim-off' }));
  rimOff.position.set(-3.5, 1.1, 4);
  const tintedRamp = buildRampTexture('ramp:smokeTinted', [
    { t: 0, color: '#3a4a8c' }, { t: 0.22, color: '#3a4a8c' },
    { t: 0.24, color: '#e8a04e' }, { t: 1, color: '#ffd9a0' },
  ]);
  const rgbRampBall = new THREE.Mesh(
    ballGeometry,
    toonMaterials.get('matteProp', { color: '#8898a8', rampTexture: tintedRamp, rgbRamp: true, name: 'smoke/rgb-ramp' }),
  );
  rgbRampBall.position.set(-1, 1.1, 4);
  root.add(rimOn, rimOff, rgbRampBall);

  // D. 其余原型抽查：emissiveLamp / cloth / wood / concrete / groundTerrain(雪+湿反应)
  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 12, 8),
    toonMaterials.get('emissiveLamp', { color: '#ffb26e', name: 'smoke/emissive' }),
  );
  lamp.position.set(1.5, 0.5, 4);
  const clothBall = new THREE.Mesh(ballGeometry, toonMaterials.get('cloth', { color: '#c8a06a', name: 'smoke/cloth' }));
  clothBall.position.set(3.5, 1.1, 4);
  const woodBox = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 0.9, 0.9),
    toonMaterials.get('wood', { color: '#8a6f4d', name: 'smoke/wood' }),
  );
  woodBox.position.set(6, 1.2, 4);
  const concreteBox = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 1.2, 1.2),
    toonMaterials.get('concrete', { color: '#9aa0a6', name: 'smoke/concrete' }),
  );
  concreteBox.position.set(8, 1.4, 4);
  const terrain = new THREE.Mesh(
    new THREE.PlaneGeometry(6, 3),
    toonMaterials.get('groundTerrain', { color: '#7d8a6e', name: 'smoke/groundTerrain' }),
  );
  terrain.rotation.x = -Math.PI / 2;
  terrain.position.set(6, 0.02, 1);
  root.add(lamp, clothBall, woodBox, concreteBox, terrain);

  // 运行期驱动演示：天气量写共享 uniform 单例即可全场生效（T13 接管后由 WeatherMaterialSystem 写）
  sharedUniforms.uWet.value = 0.4;
  sharedUniforms.uSnow.value = 0.45;

  return root;
}
