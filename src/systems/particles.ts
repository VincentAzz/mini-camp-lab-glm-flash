// docs/01-整体架构.md §3.2 systems/particles.ts —— ParticleSystem：统一 GPU 粒子发射器池。T10 落点。
//
// 职责（docs/01 §3.4-3）：雨丝/雪花（天气）与蒸汽/火星/晨雾/微尘/落叶/滴水（场景）共用发射/回收/淡入淡出；
//   每注册 EmitterSpec 返回实例句柄 setRate()（P1，§3.9）；天气双集合交叉淡化（docs/05 §4.4.3）；
//   滴水触地涟漪环（docs/05 五-3「触地 0.25s 扩张环」）。
//
// 节奏纪律：一切相位取自 RhythmClock（clock.elapsed 为唯一时间源、particleJitter 为发射抖动源），
//   严禁 setTimeout/setInterval；update(dt) 的 dt 只作积分步长（Engine 帧序 §3.5.2-③ 注入）。
//   CPU 每帧只写共享 uniform 与出生槽位（§3.7-7「动效 shader 化：CPU 每帧只写 uniform」）——
//   运动/风漂/横摆/生命包络/扩张全部在顶点着色器由 uTime 推导。
//
// Draw call 预算（docs/05 §7.1.3 标题「全场天气+场景粒子 ≤8 draw call」）：发射器池按混合模式只有
//   additive / alpha 两份 InstancedBufferGeometry——任意数量发射器合计 ≤2 draw call，发射器只
//   预留槽位段（连续实例区间），槽位静态属性注册期写一次、出生属性发射期写 7 个浮点。
//
// 贴图纪律（八.2）：粒子精灵图集为运行期纯数学像素生成（DataTexture，零贴图文件、零网络、
//   零 Canvas DOM 依赖——无头可构建）；全部几何为一个 1×1 quad × 实例化，无模型文件。
//
// 槽位循环模型：每发射器占用 [slotStart, slotStart+slotCount) 连续区间，slotCount=ceil(rate×life)
//   （与 §7.1.3「存活峰值」列一致：雨 450×0.53≈240、雪 180×4.4≈800）；发射按游标找 age≥life 的
//   空闲槽写入新出生时间，着色器对 age>life 的槽位自动剔除（gl_Position 退化 + α=0）。
import * as THREE from 'three';
import type { RhythmClock } from './clock';
import { clamp } from '../shared/math';
import { hashString, mulberry32 } from '../shared/rng';
import { createFbm2D } from '../tex/canvasTex';
import type {
  EmitterKind,
  EmitterSpec,
  ParticleEmitterHandle,
  ParticleSystem as ParticleSystemContract,
} from './handles';

/* ============================ 常量（定值出处逐条标注） ============================ */

/** 发射器索引上限（uEmitterFade uniform 数组宽度）：天气 ≤2 + 场景 ≤8 + 余量（docs/01 §3.4-3）。 */
export const MAX_EMITTERS = 32;

/**
 * 每混合池槽位容量（实机修复：交叉淡化双雪集合并存 + 长会话碎片化下 2048 不够）：
 * 交叉淡化 0.5s 内新旧天气集合共存（雪 want=ceil(180×4.4)≈793，×2 共存 ≈1586）+ 场景发射器
 * （每场景 ≤50）+ 多轮场景/天气切换后空闲段碎片余量。2048 时实测「申请 793 槽实得 396」
 * 发射密度降级（console.warn）；4096 ≈ 共存峰值 ×2.5 头寸，每池属性缓冲仅增 ~360KB。
 * （docs/05 §4.4.3 定值只约束交叉淡化行为，不约束池容量。）
 */
export const POOL_CAPACITY = 4096;

/** 单发射器槽位上限（防单发射器独占池）。 */
const MAX_SLOTS_PER_EMITTER = 1024;

/** 单发射器最小槽位（低 rate×life 时保底，如 drip 2.5/s×0.8s=2 → 4）。 */
const MIN_SLOTS_PER_EMITTER = 4;

/** 天气交叉淡化时长：旧发射器 rate 0.5s 降 0 / 新发射器 rate 0.5s 升满（docs/05 §4.4.3）。 */
export const WEATHER_CROSSFADE_S = 0.5;

/** 滴水触地涟漪环：存活 0.25s（docs/05 五-3「水珠 3m/s 下落，触地 0.25s 扩张环」）。 */
export const RIPPLE_LIFETIME_S = 0.25;

/** 涟漪环起始半径（m）。 */
export const RIPPLE_SIZE0_M = 0.02;

/** 涟漪环终半径（m，扩张至约 0.14）。 */
export const RIPPLE_SIZE1_M = 0.14;

/** 涟漪环不透明度相对水珠的倍率。 */
const RIPPLE_OPACITY_MUL = 0.8;

/** 单帧单发射器发射上限（卡顿恢复大 dt 帧不出现粒子尖峰；docs/09 性能纪律同类钳制）。 */
const MAX_SPAWN_PER_FRAME = 96;

/** 出生槽位哨兵值：早于任何 uTime，着色器判定 age≫life 即死亡剔除。 */
const BIRTH_NEVER = -1e9;

/* ============================ 8 种 kind 参数表（docs/05 §7.1.3 单表 + 五-3/五-4/五-5 运动列） ============================ */

export interface ParticleKindParams {
  /** 着色器内 kind 编号（顶点着色器按此分派运动分支）。 */
  readonly id: number;
  /** 风漂系数：uWind × 本系数 × age 叠加（雨「风×0.3」五-3 / 雪「风漂」五-5 / 蒸汽「风漂」四-2）。 */
  readonly windDrift: number;
  /** 横摆幅度 m（雪「横摆 ±0.08m」五-5；其余按 kind 0）。 */
  readonly swayAmpM: number;
  /** 横摆频率 Hz。 */
  readonly swayFreqHz: number;
  /** 自旋角速度 rad/s（落叶「旋转 0.6rad/s」§7.2.2-③；雪缓转）。 */
  readonly spinRadS: number;
  /** 沿速度方向拉伸 quad（雨「0.008×0.14 拉伸」/ 滴水「0.015 拉伸」）。 */
  readonly stretch: boolean;
  /** 死亡时触地涟漪环（drip 专属，五-3）。 */
  readonly rippleOnDeath: boolean;
  /** 精灵图集单元（dot 软圆点 / flake 六瓣雪晶 / blob 雾团 / spark 火星芯 / leaf 叶片 / ring 涟漪环）。 */
  readonly texture: 'dot' | 'flake' | 'blob' | 'spark' | 'leaf' | 'ring';
}

/**
 * 8 种 kind 参数表（docs/05 §7.1.3 总表「运动」列的落地；rate/life/size0/size1/vel0/color/opacity/
 * additive 八列由 EmitterSpec 逐发射器给出，本表只承担 kind 固有的运动/形变/精灵参数）：
 * | kind  | 运动（§7.1.3）                  | 本表对应                                       |
 * | rain  | 4.5m/s↓+风×0.3                  | windDrift 0.3 + stretch                        |
 * | snow  | 0.55m/s↓+摆±0.08+风             | windDrift 1.0 + sway 0.08m/0.35Hz + spin 0.3   |
 * | steam | 0.22m/s↑+风漂                   | windDrift 0.45 + spin 0.15                     |
 * | spark | 0.5m/s↑+横向噪声                | windDrift 0.25 + shader 横向噪声               |
 * | mist  | 0.12m/s 水平漂                  | windDrift 0.6 + spin 0.05                      |
 * | dust  | 0.03m/s 随机游走                | windDrift 0.3 + shader 游走                    |
 * | leaf  | 顺溪 0.14m/s+旋转               | windDrift 0.8 + spin 0.6                       |
 * | drip  | 3m/s↓→触地涟漪环                | windDrift 0.15 + stretch + rippleOnDeath       |
 */
export const PARTICLE_KIND_PARAMS: Readonly<Record<EmitterKind, ParticleKindParams>> = {
  rain: { id: 0, windDrift: 0.3, swayAmpM: 0, swayFreqHz: 0, spinRadS: 0, stretch: true, rippleOnDeath: false, texture: 'dot' },
  snow: { id: 1, windDrift: 1.0, swayAmpM: 0.08, swayFreqHz: 0.35, spinRadS: 0.3, stretch: false, rippleOnDeath: false, texture: 'dot' },
  steam: { id: 2, windDrift: 0.45, swayAmpM: 0, swayFreqHz: 0, spinRadS: 0.15, stretch: false, rippleOnDeath: false, texture: 'blob' },
  spark: { id: 3, windDrift: 0.25, swayAmpM: 0, swayFreqHz: 0, spinRadS: 0, stretch: false, rippleOnDeath: false, texture: 'spark' },
  mist: { id: 4, windDrift: 0.6, swayAmpM: 0, swayFreqHz: 0, spinRadS: 0.05, stretch: false, rippleOnDeath: false, texture: 'blob' },
  dust: { id: 5, windDrift: 0.3, swayAmpM: 0, swayFreqHz: 0, spinRadS: 0, stretch: false, rippleOnDeath: false, texture: 'dot' },
  leaf: { id: 6, windDrift: 0.8, swayAmpM: 0, swayFreqHz: 0, spinRadS: 0.6, stretch: false, rippleOnDeath: false, texture: 'leaf' },
  drip: { id: 7, windDrift: 0.15, swayAmpM: 0, swayFreqHz: 0, spinRadS: 0, stretch: true, rippleOnDeath: true, texture: 'dot' },
};

/** 涟漪环着色器 kind 编号（内部精灵，不经 EmitterSpec 注册，drip 死亡时自动发射）。 */
const KIND_ID_RIPPLE = 8;

/** 雪花：六瓣雪晶占比（docs/05 五-5「70% 软圆点+30% 六瓣雪晶」）。 */
const SNOW_CRYSTAL_FRACTION = 0.3;

/** 发射锚点：静态点或跟随 Object3D（如车型排气口；发射期取世界位置，存量粒子不跟随）。 */
export type ParticleAnchor = THREE.Vector3 | THREE.Object3D;

export interface ParticleEmitterOptions {
  /** 发射区中心（EmitterSpec 按 §3.4 只有 area 尺寸无原点字段——锚点由此可选传入，缺省世界原点） */
  anchor?: ParticleAnchor;
  /** 发射器组：'scene'（场景 emitters，默认）不参与天气交叉淡化；'weather' 参与 setWeatherSet 交叉淡化 */
  group?: 'scene' | 'weather';
}

export interface WeatherEmitterInput {
  readonly spec: EmitterSpec;
  readonly anchor?: ParticleAnchor;
}

/* ============================ 着色器（运动/包络全在 GPU，CPU 只写 uTime/uWind/uEmitterFade） ============================ */

/** 顶点着色器：实例化 quad 按槽位属性与 uTime 推导位置/尺寸/朝向/透明度；kind 分支常量与 PARTICLE_KIND_PARAMS 同源。 */
const VERTEX_SHADER = /* glsl */ `
#define MAX_EMITTERS ${MAX_EMITTERS}
uniform float uTime;
uniform vec3 uWind;
uniform float uEmitterFade[MAX_EMITTERS];

attribute vec3 aPos0;    // 出生位置（发射区锚点+抖动）
attribute vec3 aVel;     // 初速度（含方向）
attribute float aBirth;  // 出生时刻（RhythmClock.elapsed）
attribute float aSeed;   // 槽位确定随机 0..1
attribute vec2 aSize;    // (size0, size1)；拉伸 kind 为 (宽, 长)
attribute vec4 aColor;   // (rgb 线性, 基础不透明度)
attribute vec4 aMeta;    // (life, kind, emitterIndex, spinRadS)
attribute vec2 aMotion;  // (swayAmpM, swayFreqHz)
attribute vec2 aUvSel;   // 图集单元左下角 uv

varying vec2 vUv;
varying vec4 vColor;

void main() {
  float life = aMeta.x;
  float kind = aMeta.y;
  float age = uTime - aBirth;
  float alive = (age >= 0.0 && age <= life) ? 1.0 : 0.0;
  float ageT = clamp(age / max(life, 1e-4), 0.0, 1.0);

  // —— 位移：初速度积分 + 风漂（windDrift 按 kind，与 PARTICLE_KIND_PARAMS 表同源）——
  vec3 pos = aPos0;
  float drift = 0.0;
  if (kind < 0.5)      drift = 0.3;   // rain 风×0.3（五-3）
  else if (kind < 1.5) drift = 1.0;   // snow 风漂（五-5）
  else if (kind < 2.5) drift = 0.45;  // steam 风漂
  else if (kind < 3.5) drift = 0.25;  // spark
  else if (kind < 4.5) drift = 0.6;   // mist
  else if (kind < 5.5) drift = 0.3;   // dust
  else if (kind < 6.5) drift = 0.8;   // leaf
  else if (kind < 7.5) drift = 0.15;  // drip
  pos += aVel * age + uWind * drift * age;

  // —— 横摆（aMotion 来自参数表：雪 ±0.08m 等）——
  if (aMotion.x > 0.0001) {
    float w = 6.2831853 * aMotion.y;
    pos.x += aMotion.x * sin(age * w + aSeed * 6.2831853);
    pos.z += aMotion.x * 0.6 * cos(age * w * 0.83 + aSeed * 12.9);
  }
  // —— spark 横向噪声（§7.1.3「0.5m/s↑+横向噪声」）——
  if (kind > 2.5 && kind < 3.5) {
    pos.x += sin(age * 7.0 + aSeed * 43.0) * 0.05 * age;
    pos.z += cos(age * 6.1 + aSeed * 31.0) * 0.05 * age;
  }
  // —— dust 随机游走（§7.1.3「0.03m/s 随机游走」）——
  if (kind > 4.5 && kind < 5.5) {
    pos += 0.03 * vec3(
      sin(age * 0.9 + aSeed * 17.0),
      sin(age * 0.7 + aSeed * 23.0) * 0.5,
      cos(age * 1.1 + aSeed * 29.0));
  }

  // —— 尺寸：拉伸 kind 用 (宽,长) 直读；其余 size0→size1 渐变（§7.1.3「尺寸」列）——
  float width;
  float height;
  bool stretch = (kind < 0.5) || (kind > 6.5 && kind < 7.5);
  if (stretch) {
    width = aSize.x;
    height = aSize.y;
  } else {
    width = mix(aSize.x, aSize.y, ageT);
    height = width;
  }

  // —— 视空间 billboard：拉伸类沿速度方向拉伸，其余按槽位自旋角旋转 ——
  vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
  vec2 corner = position.xy;
  vec2 offset;
  if (stretch) {
    vec2 dv = (modelViewMatrix * vec4(aVel, 0.0)).xy;
    float dl = length(dv);
    vec2 dir = dl > 1e-5 ? dv / dl : vec2(0.0, 1.0);
    vec2 side = vec2(-dir.y, dir.x);
    offset = side * (corner.x * width) + dir * (corner.y * height);
  } else {
    float ang = aSeed * 6.2831853 + aMeta.w * age;
    float cs = cos(ang);
    float sn = sin(ang);
    vec2 c = vec2(corner.x * cs - corner.y * sn, corner.x * sn + corner.y * cs);
    offset = c * vec2(width, height);
  }
  mvPos.xy += offset;
  gl_Position = projectionMatrix * mvPos;

  // —— 生命两端淡入淡出（分率与 PARTICLE_KIND_PARAMS 注释一致；涟漪环满程平方衰减）——
  float fadeInF;
  float fadeOutF;
  if (kind < 0.5)      { fadeInF = 0.10; fadeOutF = 0.15; } // rain
  else if (kind < 1.5) { fadeInF = 0.10; fadeOutF = 0.20; } // snow
  else if (kind < 2.5) { fadeInF = 0.15; fadeOutF = 0.35; } // steam
  else if (kind < 3.5) { fadeInF = 0.05; fadeOutF = 0.45; } // spark（尺寸→0 之外再加速淡出）
  else if (kind < 4.5) { fadeInF = 0.20; fadeOutF = 0.30; } // mist
  else if (kind < 5.5) { fadeInF = 0.10; fadeOutF = 0.30; } // dust
  else if (kind < 6.5) { fadeInF = 0.10; fadeOutF = 0.30; } // leaf
  else if (kind < 7.5) { fadeInF = 0.05; fadeOutF = 0.10; } // drip
  else                 { fadeInF = 0.00; fadeOutF = 1.00; } // ripple ring
  float env = smoothstep(0.0, max(life * fadeInF, 1e-4), age)
            * (1.0 - smoothstep(max(life * (1.0 - fadeOutF), 0.0), life, age));
  float groupFade = uEmitterFade[int(clamp(aMeta.z + 0.5, 0.0, float(MAX_EMITTERS - 1)))];
  float alpha = aColor.a * env * groupFade;
  if (kind > 7.5) alpha *= (1.0 - ageT) * (1.0 - ageT);
  vColor = vec4(aColor.rgb, alpha);
  // T33 不可见修复④：拉伸类（雨/滴水）quad 宽度亚像素（0.008m），水平方向映射整个图集单元
  // 会把径向点精灵的中心强度沿宽度平均掉（tex.a 有效值≈0.57→叠加后雨丝低于可见阈值）。
  // 改取单元中心 1/8 窄列：亚像素宽度本就不可呈现水平剖面，窄列保住 sprite 竖向形状与强度；
  // 非拉伸类（雪/雾团/火星/叶/涟漪环）仍取整单元。
  if (stretch) {
    vUv = vec2(aUvSel.x + (0.5 + (uv.x - 0.5) * 0.125) * 0.33333334, aUvSel.y + uv.y * 0.5);
  } else {
    vUv = aUvSel + uv * vec2(0.33333334, 0.5);
  }

  // —— 死亡/未发射槽位剔除（槽位循环回收的 GPU 侧终点）——
  if (alive < 0.5) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    vColor = vec4(0.0);
  }
}
`;

/** 片元着色器：图集 alpha 形状 × 槽位色 × 槽位 α；输出经 colorspace_fragment 编码（T33 不可见修复③）。 */
const FRAGMENT_SHADER = /* glsl */ `
uniform sampler2D uMap;
varying vec2 vUv;
varying vec4 vColor;

void main() {
  vec4 tex = texture2D(uMap, vUv);
  float a = tex.a * vColor.a;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vColor.rgb * tex.rgb, a);
  #include <colorspace_fragment>
}
`;

/* ============================ 程序化精灵图集（DataTexture，纯数学像素） ============================ */

const ATLAS_CELL = 64;
const ATLAS_COLS = 3;
const ATLAS_ROWS = 2;

/** 图集单元名 → (列, 行)。 */
const ATLAS_CELLS: Record<ParticleKindParams['texture'], readonly [number, number]> = {
  dot: [0, 0],
  flake: [1, 0],
  blob: [2, 0],
  spark: [0, 1],
  leaf: [1, 1],
  ring: [2, 1],
};

function cellUv(cell: readonly [number, number]): [number, number] {
  return [(cell[0] as number) / ATLAS_COLS, (cell[1] as number) / ATLAS_ROWS];
}

/** 生成 192×128 精灵图集：软圆点/六瓣雪晶/雾团/火星/叶片/涟漪环（纯数学，进程内确定）。 */
function buildSpriteAtlas(): THREE.DataTexture {
  const w = ATLAS_COLS * ATLAS_CELL;
  const h = ATLAS_ROWS * ATLAS_CELL;
  const data = new Uint8Array(w * h * 4);
  const fbm = createFbm2D(0x9a7b_c0de, 3);
  const put = (px: number, py: number, r: number, g: number, b: number, a: number): void => {
    const i = (py * w + px) * 4;
    data[i] = Math.round(clamp(r, 0, 1) * 255);
    data[i + 1] = Math.round(clamp(g, 0, 1) * 255);
    data[i + 2] = Math.round(clamp(b, 0, 1) * 255);
    data[i + 3] = Math.round(clamp(a, 0, 1) * 255);
  };
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const cx = ((px % ATLAS_CELL) + 0.5) / ATLAS_CELL * 2 - 1; // 单元内 -1..1
      const cy = ((py % ATLAS_CELL) + 0.5) / ATLAS_CELL * 2 - 1;
      const row = Math.floor(py / ATLAS_CELL);
      const col = Math.floor(px / ATLAS_CELL);
      const d = Math.sqrt(cx * cx + cy * cy);
      let r = 1;
      let g = 1;
      let b = 1;
      let a = 0;
      if (row === 0 && col === 0) {
        // dot 软圆点：高斯衰减
        a = Math.exp(-d * d * 6.0);
      } else if (row === 0 && col === 1) {
        // flake 六瓣雪晶：盘形 × 六瓣调制 + 中心芯
        const th = Math.atan2(cy, cx);
        const petal = Math.pow(Math.abs(Math.cos(th * 3.0)), 2.0);
        const disk = 1 - smoothstep(0.55, 0.92, d);
        a = d < 0.24 ? 1 : disk * (0.30 + 0.70 * petal);
        a *= d < 0.92 ? 1 : 0;
      } else if (row === 0 && col === 2) {
        // blob 雾团：径向衰减 × fbm 破边（蒸汽/晨雾大团）
        const n = fbm(px * 0.055 + 7.3, py * 0.055 + 3.1);
        a = smoothstep(0.30, 0.78, (1 - d) * 0.72 + n * 0.55);
      } else if (row === 1 && col === 0) {
        // spark 火星：白热芯 + 暖色衰减晕（additive）
        const core = Math.exp(-d * d * 10.0);
        const halo = Math.exp(-d * d * 2.6) * 0.4;
        a = Math.min(1, core + halo);
        const warm = 1 - core;
        r = 1;
        g = 0.92 - 0.28 * warm;
        b = 0.78 - 0.52 * warm;
      } else if (row === 1 && col === 1) {
        // leaf 叶片：竖长椭圆收尖 + 中脉亮线（着色由 aColor tint）
        const ex = cx * 2.1;
        const ey = cy;
        const body = Math.max(0, 1 - (ex * ex + ey * ey));
        a = body > 0 ? Math.min(1, body * 1.6) : 0;
        const vein = Math.exp(-Math.abs(cx) * 14.0) * (1 - Math.abs(ey)) * 0.55;
        a = Math.max(a * 0.82, vein);
      } else if (row === 1 && col === 2) {
        // ring 涟漪环：环形软边（触地扩张环，五-3）
        a = smoothstep(0.28, 0.44, d) * (1 - smoothstep(0.52, 0.82, d));
      }
      put(px, py, r, g, b, a);
    }
  }
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

/* ============================ 池与发射器记录 ============================ */

interface PoolRange {
  start: number;
  count: number;
}

interface Pool {
  blending: 'additive' | 'alpha';
  geo: THREE.InstancedBufferGeometry;
  /** 实例化 quad 的承载网格：顶点着色器做视空间 billboard 扩边，须按三角形光栅化（见 createPool 注记）。 */
  mesh: THREE.Mesh;
  attrs: {
    pos0: THREE.InstancedBufferAttribute;
    vel: THREE.InstancedBufferAttribute;
    birth: THREE.InstancedBufferAttribute;
    seed: THREE.InstancedBufferAttribute;
    size: THREE.InstancedBufferAttribute;
    color: THREE.InstancedBufferAttribute;
    meta: THREE.InstancedBufferAttribute;
    motion: THREE.InstancedBufferAttribute;
    uvSel: THREE.InstancedBufferAttribute;
  };
  top: number;
  free: PoolRange[];
  warnedShrink: boolean;
}

type FadeState = 'steady' | 'in' | 'out';

interface EmitterRecord {
  spec: EmitterSpec;
  kind: EmitterKind;
  kp: ParticleKindParams;
  index: number;
  group: 'scene' | 'weather';
  pool: Pool;
  anchor: ParticleAnchor | undefined;
  /** 发射锚点世界坐标缓存（Object3D 锚点每帧 getWorldPosition 刷新一次） */
  anchorPos: THREE.Vector3;
  slotStart: number;
  slotCount: number;
  life: number;
  cursor: number;
  accum: number;
  births: Float32Array;
  jitter: number;
  rateTarget: number;
  fadeState: FadeState;
  fadeT: number;
  fade: number;
  spawnSeq: number;
  /** drip 专属：涟漪环槽段与标记 */
  ringStart: number;
  ringCount: number;
  ringCursor: number;
  ringAccum: number;
  ringBirths: Float32Array;
  ringed: Uint8Array;
  disposed: boolean;
}

/* ============================ ParticleSystem ============================ */

/**
 * 统一 GPU 粒子发射器池（docs/01 §3.4-3 契约实现；Director 以类实例注入并接入帧序 ③）。
 * 内容/天气侧只经 add() 注册 EmitterSpec（P1：返回 setRate() 实例句柄），不 import 本文件以外实现细节。
 */
export class ParticleSystem implements ParticleSystemContract {
  /** 挂入场景的根组（两份混合池 Points）。 */
  readonly root = new THREE.Group();

  /** 共享 uniforms（uTime/uWind/uEmitterFade/uMap 两池同一引用，Director/测试可直读）。 */
  readonly uniforms = {
    uTime: { value: 0 } as THREE.IUniform<number>,
    uWind: { value: new THREE.Vector3(0, 0, 0) } as THREE.IUniform<THREE.Vector3>,
    uEmitterFade: { value: new Float32Array(MAX_EMITTERS) } as THREE.IUniform<Float32Array>,
    uMap: { value: null as THREE.Texture | null } as THREE.IUniform<THREE.Texture | null>,
  };

  private readonly clock: RhythmClock;
  private readonly capacity: number;
  private readonly records: (EmitterRecord | null)[] = new Array<EmitterRecord | null>(MAX_EMITTERS).fill(null);
  private readonly order: EmitterRecord[] = [];
  private readonly pools: Pool[] = [];
  private nextIndex = 0;
  /** 已回收的发射器索引（dispose 后复用；发射器索引与槽位段同样循环回收，长会话不耗尽 MAX_EMITTERS）。 */
  private readonly freeIndices: number[] = [];
  private disposed = false;

  constructor(clock: RhythmClock, opts: { capacity?: number } = {}) {
    this.clock = clock;
    this.capacity = opts.capacity ?? POOL_CAPACITY;
    const atlas = buildSpriteAtlas();
    this.uniforms.uMap.value = atlas;
    this.root.name = 'particles';
    this.pools.push(this.createPool('additive', atlas));
    this.pools.push(this.createPool('alpha', atlas));
  }

  /* —— 契约入口（P1）：天气粒子与场景发射器同入口 —— */

  add(spec: EmitterSpec, options: ParticleEmitterOptions = {}): ParticleEmitterHandle {
    if (this.disposed) throw new Error('[particles] 系统已 dispose，禁止再注册发射器');
    if (!(spec.lifetime > 0)) throw new RangeError(`[particles] lifetime 必须为正：${spec.lifetime}`);
    if (spec.rate < 0) throw new RangeError(`[particles] rate 不能为负：${spec.rate}`);
    const kp = PARTICLE_KIND_PARAMS[spec.kind];
    if (!kp) throw new RangeError(`[particles] 未知 kind：${String(spec.kind)}`);
    // 发射器索引：优先复用已回收索引（场景重入/天气交叉淡化常态产生 dispose）；耗尽才取新号，
    // 上限 MAX_EMITTERS 时才拒绝注册（原实现只增不减——多轮场景切换后误触上限抛错）。
    const reused = this.freeIndices.pop();
    const index = reused ?? (this.nextIndex < MAX_EMITTERS ? this.nextIndex++ : -1);
    if (index < 0) {
      throw new RangeError(`[particles] 发射器索引已满（${MAX_EMITTERS}）：先 dispose 再注册`);
    }
    const pool = spec.additive ? this.pools[0]! : this.pools[1]!;
    const want = clamp(Math.ceil(spec.rate * spec.lifetime), MIN_SLOTS_PER_EMITTER, MAX_SLOTS_PER_EMITTER);
    const range = this.allocRange(pool, want);
    if (!range) throw new RangeError(`[particles] 粒子池容量不足（capacity=${this.capacity}），无法注册 ${spec.kind}`);
    if (range.count < want) this.warnShrink(pool, want, range.count);

    const ringCount = kp.rippleOnDeath
      ? clamp(Math.ceil(spec.rate * RIPPLE_LIFETIME_S * 1.5) + 2, MIN_SLOTS_PER_EMITTER, 32)
      : 0;
    const ringRange = ringCount > 0 ? this.allocRange(pool, ringCount) : null;

    const rec: EmitterRecord = {
      spec,
      kind: spec.kind,
      kp,
      index,
      group: options.group ?? 'scene',
      pool,
      anchor: options.anchor,
      anchorPos: new THREE.Vector3(0, 0, 0),
      slotStart: range.start,
      slotCount: range.count,
      life: spec.lifetime,
      cursor: 0,
      accum: 0,
      births: new Float32Array(range.count).fill(BIRTH_NEVER),
      jitter: this.clock.particleJitter(index), // docs/05 §7.1.1：发射相位 jitter ±20%，按发射器序号确定
      rateTarget: spec.rate,
      fadeState: options.group === 'weather' ? 'in' : 'steady',
      fadeT: options.group === 'weather' ? 0 : WEATHER_CROSSFADE_S,
      fade: options.group === 'weather' ? 0 : 1,
      spawnSeq: 0,
      ringStart: ringRange ? ringRange.start : -1,
      ringCount: ringRange ? ringRange.count : 0,
      ringCursor: 0,
      ringAccum: 0,
      ringBirths: ringRange ? new Float32Array(ringRange.count).fill(BIRTH_NEVER) : new Float32Array(0),
      ringed: kp.rippleOnDeath ? new Uint8Array(range.count) : new Uint8Array(0),
      disposed: false,
    };
    if (options.anchor instanceof THREE.Vector3) rec.anchorPos.copy(options.anchor);
    this.records[index] = rec;
    this.order.push(rec);
    this.writeEmitterStatics(rec);
    return this.createHandle(rec);
  }

  /**
   * 天气双集合交叉淡化（docs/05 §4.4.3；T33/T30 由 Director 调用）：
   * 旧天气集合 rate 0.5s 降 0 + 组 opacity 反向淡出（存量靠组 opacity 兜底），0.5s 后回收槽位；
   * 新集合 rate 0.5s 升满 + 组 opacity 淡入。重复调用即重定向，不跳变。
   */
  setWeatherSet(entries: readonly (WeatherEmitterInput | EmitterSpec)[], setAnchor?: ParticleAnchor): void {
    if (this.disposed) throw new Error('[particles] 系统已 dispose，禁止切换天气集合');
    for (const rec of this.order) {
      if (rec.group === 'weather' && rec.fadeState !== 'out') {
        rec.fadeState = 'out';
        rec.fadeT = 0;
      }
    }
    for (const entry of entries) {
      const spec = 'spec' in entry ? entry.spec : entry;
      const anchor = 'spec' in entry ? (entry.anchor ?? setAnchor) : setAnchor;
      this.add(spec, { anchor, group: 'weather' });
    }
  }

  /** 风漂向量（WindSystem/T09 经 Director 每帧下发；粒子侧只读）。 */
  setWindDrift(x: number, y: number, z: number): void {
    this.uniforms.uWind.value.set(x, y, z);
  }

  /**
   * 天气组发射器锚点原地重定位（场景 FadeSwap 激活路径调用；T33 修复）：
   * 天气粒子集合跨场景持续（FadeSwap 不重挂 setWeatherSet），锚点仍指旧场景营位——场景切换后
   * 按新场景 campAnchor 重锚。发射期取值、存量粒子不跟随（与 Object3D 锚点同一语义，见
   * ParticleAnchor 注记）；不重注册 → 无交叉淡化抖动、无发射器索引消耗。
   */
  reanchorWeather(anchor: THREE.Vector3): void {
    if (this.disposed) return;
    for (const rec of this.order) {
      if (rec.group === 'weather') rec.anchorPos.copy(anchor);
    }
  }

  /** 当前活跃发射器数（测试/编排用）。 */
  get emitterCount(): number {
    return this.order.length;
  }

  /** 当前天气组活跃发射器数（测试用）。 */
  get weatherEmitterCount(): number {
    return this.order.filter((r) => r.group === 'weather').length;
  }

  /** 当前 uEmitterFade 值（测试用）。 */
  getEmitterFade(index: number): number {
    return this.uniforms.uEmitterFade.value[index] ?? 0;
  }

  /** 帧驱动（docs/01 §3.5.2-③）：淡化推进 → 发射 → 涟漪环 → uniform 下发。 */
  update(dt: number): void {
    if (this.disposed) return;
    const now = this.clock.elapsed;
    this.uniforms.uTime.value = now;
    const step = dt > 0 ? dt : 0;

    const toDispose: EmitterRecord[] = [];
    for (const rec of this.order) {
      if (rec.anchor instanceof THREE.Object3D) {
        rec.anchor.getWorldPosition(rec.anchorPos);
      }
      if (rec.fadeState === 'in' || rec.fadeState === 'out') {
        rec.fadeT += step;
        const ramp = clamp(rec.fadeT / WEATHER_CROSSFADE_S, 0, 1);
        rec.fade = rec.fadeState === 'in' ? ramp : 1 - ramp;
        if (rec.fadeT >= WEATHER_CROSSFADE_S) {
          if (rec.fadeState === 'out') toDispose.push(rec);
          else { rec.fadeState = 'steady'; rec.fade = 1; }
        }
      }
    }
    for (const rec of toDispose) this.disposeEmitter(rec);

    for (const rec of this.order) {
      const rateEff = rec.rateTarget * rec.fade * rec.jitter;
      if (step > 0 && rateEff > 0) {
        rec.accum += rateEff * step;
        let n = Math.floor(rec.accum);
        rec.accum = Math.min(rec.accum - n, 4);
        n = Math.min(n, MAX_SPAWN_PER_FRAME);
        for (let i = 0; i < n; i++) this.spawnParticle(rec, now);
      } else if (rateEff <= 0) {
        rec.accum = 0; // 停发期间不积欠（恢复发射不爆发）
      }
      if (rec.kp.rippleOnDeath && rec.ringCount > 0) this.emitRipples(rec, now);
    }

    const fades = this.uniforms.uEmitterFade.value;
    for (let i = 0; i < MAX_EMITTERS; i++) {
      fades[i] = this.records[i]?.fade ?? 0;
    }
    const anyEmitter = this.order.length > 0;
    for (const pool of this.pools) pool.mesh.visible = anyEmitter;
  }

  /** 系统整体回收（T17 场景卸载路径；材质/几何/图集一次性释放）。 */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.records.fill(null);
    this.order.length = 0;
    for (const pool of this.pools) {
      this.root.remove(pool.mesh);
      pool.geo.dispose();
      (pool.mesh.material as THREE.Material).dispose();
    }
    this.pools.length = 0;
    this.uniforms.uMap.value?.dispose();
    this.uniforms.uMap.value = null;
  }

  /* —— 内部：池与槽位 —— */

  private createPool(blending: 'additive' | 'alpha', atlas: THREE.Texture): Pool {
    const cap = this.capacity;
    const quad = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = quad.index;
    geo.setAttribute('position', quad.getAttribute('position'));
    geo.setAttribute('uv', quad.getAttribute('uv'));
    const mk = (itemSize: number): THREE.InstancedBufferAttribute =>
      new THREE.InstancedBufferAttribute(new Float32Array(cap * itemSize), itemSize);
    const attrs = {
      pos0: mk(3),
      vel: mk(3),
      birth: mk(1),
      seed: mk(1),
      size: mk(2),
      color: mk(4),
      meta: mk(4),
      motion: mk(2),
      uvSel: mk(2),
    };
    geo.setAttribute('aPos0', attrs.pos0);
    geo.setAttribute('aVel', attrs.vel);
    geo.setAttribute('aBirth', attrs.birth);
    geo.setAttribute('aSeed', attrs.seed);
    geo.setAttribute('aSize', attrs.size);
    geo.setAttribute('aColor', attrs.color);
    geo.setAttribute('aMeta', attrs.meta);
    geo.setAttribute('aMotion', attrs.motion);
    geo.setAttribute('aUvSel', attrs.uvSel);
    geo.instanceCount = 0;
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: this.uniforms.uTime,
        uWind: this.uniforms.uWind,
        uEmitterFade: this.uniforms.uEmitterFade,
        uMap: { value: atlas },
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      blending: blending === 'additive' ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    // ★渲染模式（T33 不可见修复）：承载对象必须是 Mesh（TRIANGLES）而非 Points。
    //   本几何是「1×1 quad（4 顶点+索引）× 实例」、顶点着色器在视空间扩边成 billboard 面——
    //   若走 THREE.Points（gl.POINTS），每个角顶点只画 1px 且 quad 内部不被光栅化（片元在
    //   图集单元角点 α≈0 直接 discard）→ 数值上一切正常而屏幕零粒子。Mesh + InstancedBufferGeometry
    //   = drawElementsInstanced(TRIANGLES)，quad 实体面正确呈现（sky.ts 星空用 PointsMaterial 属
    //   真点精灵，与本池无关，勿混淆）。
    const mesh = new THREE.Mesh(geo, material);
    mesh.frustumCulled = false; // 全场粒子（docs/01 §3.7-7）
    mesh.renderOrder = 25;
    mesh.name = `particles-${blending}`;
    mesh.visible = false;
    this.root.add(mesh);
    return { blending, geo, mesh, attrs, top: 0, free: [], warnedShrink: false };
  }

  private allocRange(pool: Pool, want: number): PoolRange | null {
    for (let i = 0; i < pool.free.length; i++) {
      const r = pool.free[i]!;
      if (r.count >= want) {
        pool.free.splice(i, 1);
        if (r.count > want) pool.free.push({ start: r.start + want, count: r.count - want });
        return { start: r.start, count: want };
      }
    }
    if (pool.top + want <= this.capacity) {
      const r = { start: pool.top, count: want };
      pool.top += want;
      pool.geo.instanceCount = pool.top;
      return r;
    }
    const tail = this.capacity - pool.top;
    if (tail >= 1) {
      const r = { start: pool.top, count: tail };
      pool.top = this.capacity;
      pool.geo.instanceCount = pool.top;
      return r;
    }
    let biggest = -1;
    for (let i = 0; i < pool.free.length; i++) {
      if (biggest < 0 || pool.free[i]!.count > pool.free[biggest]!.count) biggest = i;
    }
    if (biggest >= 0) {
      const r = pool.free[biggest]!;
      pool.free.splice(biggest, 1);
      return { start: r.start, count: r.count };
    }
    return null;
  }

  private warnShrink(pool: Pool, want: number, got: number): void {
    if (pool.warnedShrink) return;
    pool.warnedShrink = true;
    console.warn(`[particles] 粒子池容量不足：申请 ${want} 槽实得 ${got}（池 ${pool.blending}），发射密度降级`);
  }

  private freeRange(pool: Pool, range: PoolRange): void {
    const free = pool.free;
    free.push({ ...range });
    // 相邻空闲段归并（实机修复：池容量不足第二因）：交叉淡化反复分配/释放 793 槽大段，场景
    // 发射器小段又穿插其间——不归并则「最大连续段」随长会话单调萎缩，allocRange 首个
    // ≥want 探测失败后只能拿残段（申请 793 实得 396 的直接来源）。按 start 排序一次线性
    // 归并；重叠段（防御）取并集。
    if (free.length > 1) {
      free.sort((a, b) => a.start - b.start);
      let last = 0;
      for (let i = 1; i < free.length; i++) {
        const prev = free[last]!;
        const cur = free[i]!;
        const prevEnd = prev.start + prev.count;
        const curEnd = cur.start + cur.count;
        if (cur.start <= prevEnd) {
          prev.count = Math.max(prevEnd, curEnd) - prev.start; // 相邻/重叠 → 并入 prev（就地扩展）
        } else {
          last += 1;
          if (last !== i) free[last] = cur;
        }
      }
      free.length = last + 1;
    }
  }

  /** 注册期一次性写槽位静态属性（seed/size/color/meta/motion/uvSel/birth 哨兵）。 */
  private writeEmitterStatics(rec: EmitterRecord): void {
    const pool = rec.pool;
    const a = pool.attrs;
    const color = new THREE.Color(rec.spec.color); // ColorManagement：'#rrggbb' → 线性空间（docs/05 §4.3.5）
    const statics = (gi: number, seed: number, size: readonly [number, number], rgba: readonly number[], meta: readonly number[], motion: readonly [number, number], uv: readonly [number, number], birth: number): void => {
      a.seed.array[gi] = seed;
      a.size.array[gi * 2] = size[0]!;
      a.size.array[gi * 2 + 1] = size[1]!;
      for (let k = 0; k < 4; k++) a.color.array[gi * 4 + k] = rgba[k]!;
      for (let k = 0; k < 4; k++) a.meta.array[gi * 4 + k] = meta[k]!;
      a.motion.array[gi * 2] = motion[0]!;
      a.motion.array[gi * 2 + 1] = motion[1]!;
      a.uvSel.array[gi * 2] = uv[0]!;
      a.uvSel.array[gi * 2 + 1] = uv[1]!;
      a.birth.array[gi] = birth;
    };
    const size: [number, number] = [rec.spec.size0, rec.spec.size1];
    const rgba = [color.r, color.g, color.b, rec.spec.opacity];
    const meta: [number, number, number, number] = [rec.life, rec.kp.id, rec.index, rec.kp.spinRadS];
    const motion: [number, number] = [rec.kp.swayAmpM, rec.kp.swayFreqHz];
    for (let s = 0; s < rec.slotCount; s++) {
      const gi = rec.slotStart + s;
      const rng = mulberry32(hashString(`emitter:${rec.index}:${s}`));
      const seed = rng();
      // 雪花 70% 软圆点 + 30% 六瓣雪晶（docs/05 五-5）；其余按 kind 参数表取单元
      const cell = rec.kind === 'snow' && rng() < SNOW_CRYSTAL_FRACTION
        ? ATLAS_CELLS.flake
        : ATLAS_CELLS[rec.kp.texture];
      const spin = rec.kp.spinRadS * (rng() < 0.5 ? -1 : 1) * (0.75 + 0.5 * rng());
      statics(gi, seed, size, rgba, [meta[0]!, meta[1]!, meta[2]!, spin], motion, cellUv(cell), BIRTH_NEVER);
    }
    // 涟漪环槽段静态属性（kind=RIPPLE，0.25s 扩张 0.02→0.14，五-3）
    if (rec.ringCount > 0) {
      const ringRgba = [color.r, color.g, color.b, rec.spec.opacity * RIPPLE_OPACITY_MUL];
      const ringCell = cellUv(ATLAS_CELLS.ring);
      for (let s = 0; s < rec.ringCount; s++) {
        const gi = rec.ringStart + s;
        const seed = mulberry32(hashString(`ripple:${rec.index}:${s}`))();
        statics(gi, seed, [RIPPLE_SIZE0_M, RIPPLE_SIZE1_M], ringRgba,
          [RIPPLE_LIFETIME_S, KIND_ID_RIPPLE, rec.index, 0], [0, 0], ringCell, BIRTH_NEVER);
      }
    }
    for (const attr of [a.seed, a.size, a.color, a.meta, a.motion, a.uvSel, a.birth]) {
      attr.needsUpdate = true;
    }
  }

  /** 发射一枚粒子：发射区内确定性随机落点 + 初速 ±10% 抖动 + 出生时间（RhythmClock.elapsed）。 */
  private spawnParticle(rec: EmitterRecord, now: number): void {
    const pool = rec.pool;
    const a = pool.attrs;
    let slot = -1;
    for (let i = 0; i < rec.slotCount; i++) {
      const s = (rec.cursor + i) % rec.slotCount;
      const b = rec.births[s]!;
      if (!(now - b < rec.life)) { // b==BIRTH_NEVER 或已死亡
        slot = s;
        rec.cursor = (s + 1) % rec.slotCount;
        break;
      }
    }
    if (slot < 0) slot = rec.cursor++; // 满载：覆写游标位（密度超配时的降级）
    if (rec.cursor >= rec.slotCount) rec.cursor = 0;
    const gi = rec.slotStart + slot;
    rec.spawnSeq += 1;
    const rng = mulberry32(hashString(`spawn:${rec.index}:${rec.spawnSeq}`));
    const area = rec.spec.area;
    const px = rec.anchorPos.x + (rng() - 0.5) * area.x;
    const py = rec.anchorPos.y + (rng() - 0.5) * area.y;
    const pz = rec.anchorPos.z + (rng() - 0.5) * area.z;
    // 防机械感：初速 ±10%（§7.1.1 同源意图）；drip 除外——水珠落点必须精确触地
    //（lifetime=落差/3m/s 由发射方按五-3 定值，速度抖动会让涟漪环悬空/入地）
    const speedMul = rec.kp.rippleOnDeath ? 1 : 1 + (rng() - 0.5) * 0.2;
    const vel = rec.spec.vel0;
    const vx = vel.x * speedMul;
    const vy = vel.y * speedMul;
    const vz = vel.z * speedMul;
    a.pos0.array[gi * 3] = px;
    a.pos0.array[gi * 3 + 1] = py;
    a.pos0.array[gi * 3 + 2] = pz;
    a.vel.array[gi * 3] = vx;
    a.vel.array[gi * 3 + 1] = vy;
    a.vel.array[gi * 3 + 2] = vz;
    a.birth.array[gi] = now;
    rec.births[slot] = now;
    if (rec.ringed.length > 0) rec.ringed[slot] = 0;
    a.pos0.addUpdateRange(gi * 3, 3);
    a.vel.addUpdateRange(gi * 3, 3);
    a.birth.addUpdateRange(gi, 1);
    a.pos0.needsUpdate = true;
    a.vel.needsUpdate = true;
    a.birth.needsUpdate = true;
  }

  /** drip 槽位生命到期 → 在死亡落点（与顶点着色器位移公式镜像）发射 0.25s 扩张涟漪环（五-3）。 */
  private emitRipples(rec: EmitterRecord, now: number): void {
    const a = rec.pool.attrs;
    const life = rec.life;
    const drift = rec.kp.windDrift;
    const wind = this.uniforms.uWind.value;
    for (let s = 0; s < rec.slotCount; s++) {
      const b = rec.births[s]!;
      if (rec.ringed[s] === 1 || now - b < life) continue;
      rec.ringed[s] = 1;
      if (b <= BIRTH_NEVER + 1) continue; // 从未发射的哨兵槽不触发
      const gi = rec.slotStart + s;
      const px = a.pos0.array[gi * 3] as number;
      const py = a.pos0.array[gi * 3 + 1] as number;
      const pz = a.pos0.array[gi * 3 + 2] as number;
      const vx = a.vel.array[gi * 3] as number;
      const vy = a.vel.array[gi * 3 + 1] as number;
      const vz = a.vel.array[gi * 3 + 2] as number;
      // 与顶点着色器一致：pos = pos0 + vel×age + uWind×drift×age（drip 无横摆/噪声）
      this.spawnRipple(rec, px + vx * life + wind.x * drift * life,
        py + vy * life + wind.y * drift * life,
        pz + vz * life + wind.z * drift * life, now);
    }
  }

  private spawnRipple(rec: EmitterRecord, x: number, y: number, z: number, now: number): void {
    const a = rec.pool.attrs;
    let slot = -1;
    for (let i = 0; i < rec.ringCount; i++) {
      const s = (rec.ringCursor + i) % rec.ringCount;
      if (!(now - rec.ringBirths[s]! < RIPPLE_LIFETIME_S)) { slot = s; rec.ringCursor = (s + 1) % rec.ringCount; break; }
    }
    if (slot < 0) slot = rec.ringCursor++;
    if (rec.ringCursor >= rec.ringCount) rec.ringCursor = 0;
    const gi = rec.ringStart + slot;
    rec.ringBirths[slot] = now;
    a.pos0.array[gi * 3] = x;
    a.pos0.array[gi * 3 + 1] = y;
    a.pos0.array[gi * 3 + 2] = z;
    a.vel.array[gi * 3] = 0;
    a.vel.array[gi * 3 + 1] = 0;
    a.vel.array[gi * 3 + 2] = 0;
    a.birth.array[gi] = now;
    a.pos0.addUpdateRange(gi * 3, 3);
    a.vel.addUpdateRange(gi * 3, 3);
    a.birth.addUpdateRange(gi, 1);
    a.pos0.needsUpdate = true;
    a.vel.needsUpdate = true;
    a.birth.needsUpdate = true;
  }

  private createHandle(rec: EmitterRecord): ParticleEmitterHandle {
    return {
      // P1（§3.9）：炊烟/蒸汽/火星/微尘强度随语义通道逐帧调制（rate=2.2×smokePower+0.4 等）
      setRate: (ratePerSecond: number): void => {
        rec.rateTarget = Math.max(0, ratePerSecond);
      },
      dispose: (): void => {
        if (!rec.disposed) this.disposeEmitter(rec);
      },
    };
  }

  private disposeEmitter(rec: EmitterRecord): void {
    if (rec.disposed) return;
    rec.disposed = true;
    rec.fade = 0;
    const at = this.order.indexOf(rec);
    if (at >= 0) this.order.splice(at, 1);
    if (this.records[rec.index] === rec) {
      this.records[rec.index] = null;
      this.freeIndices.push(rec.index); // 索引回收复用（发射器池与槽位段同一循环哲学）
    }
    this.freeRange(rec.pool, { start: rec.slotStart, count: rec.slotCount });
    if (rec.ringCount > 0) this.freeRange(rec.pool, { start: rec.ringStart, count: rec.ringCount });
  }
}
