// docs/01-整体架构.md §3.2 render/sky.ts —— 程序化渐变天空/背景板：晚霞渐变、星空、月面（全局背景，
// 不计入底座元素）。T31 落点（扩权接线：需求原文四-4「夜间：月光与星空主导」+ docs/05 §4.3.2
// 「额外天空元素」列 + §4.3.3-⑧「星空 900 主星/银河 300 暗星+月面 billboard+月晕 ×2.4」）。
//
// 结构（全程序化，零外部资产；DC 预算 5：穹顶 1 + 主星 1 + 银河 1 + 月面 1 + 月晕 1）：
//   ① 渐变穹顶：BackSide 大球 ShaderMaterial，zenith→horizon 按「地平线以上高度」渐变（线性 Color，
//      经 Director 帧汇取自 TimeLightFrame.sky——过渡全程连续插值，§4.3.5）；
//   ② 额外天空元素（离散量 skyExtra，MidpointGate 中点切换值由 Director 透传，transition.ts:286-290）：
//      - dawnBands  朝霞条带 ×3（金 #ffd9a8 系，低空 h≈0.05/0.10/0.17）
//      - dayClouds  少量白云条带 op 0.25（§4.3.2 day 列）
//      - duskBands  晚霞条带（橙）+「蓝调带」=horizon 之上 15%~40% 高度带插 #5A6AA8（§4.3.2 注）
//      - nightStarsMoon 星空 900 主星 + 银河带 300 暗点 + 月面 billboard（随主光方向=月向）+ 月晕 ×2.4
//   ③ 离散切换 0.2s 短淡入（D5 同款）：条带层/夜间组各自 opacity 渐变，不用 scale 弹跳；
//   ④ 相机纪律：穹顶以世界原点为心（相机 radius≤20、far 200——docs/06 §6.7/-engine.ts:49，恒在罩内），
//      Director 不触碰相机（§6.6）；月面用 Sprite 自公告板。
// 纪律：本文件无自有时钟、无 setTimeout——update(dt) 由 Director 帧序驱动；fog:false（穹顶不吃 FogExp2，
//      雾色压缩归 AtmosphereSystem 天空向雾色路径）；确定性随机（mulberry32 固定种子，同构可复现）。
import * as THREE from 'three';
import type { SkyExtra } from '@/systems/handles';
import { mulberry32, hashString } from '@/shared/rng';

/** 穹顶半径（相机 radius∈[5.5,20] + far 200——engine.ts:49 视锥覆盖口径）。 */
const DOME_RADIUS = 90;
/** 夜间组淡变时长（D5 离散量 0.2s 短淡入同款，§4.3.1）。 */
const SKY_FADE_S = 0.2;
/** 月面直径（world u；月晕=×2.4，§4.3.3-⑧）。 */
const MOON_SIZE = 7;
/** 银河带平面法线（倾斜于天轴——银河斜贯夜空观感）。 */
const GALAXY_BAND_NORMAL = new THREE.Vector3(0.42, 0.78, 0.46).normalize();

/** 天空帧（Director 帧汇转接：TimeLightFrame.sky + 主光方向=月向）。 */
export interface SkyFrame {
  readonly zenith: THREE.Color;
  readonly horizon: THREE.Color;
  readonly skyExtra: SkyExtra;
  readonly lightDir: THREE.Vector3;
}

/** skyExtra → 条带 shader 模式（0 dawn/1 day/2 dusk/3 night=无条带）。 */
const BAND_MODE: Record<SkyExtra, number> = {
  dawnBands: 0,
  dayClouds: 1,
  duskBands: 2,
  nightStarsMoon: 3,
};

const DOME_VERTEX = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const DOME_FRAGMENT = /* glsl */ `
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform float uBandModePrev;
  uniform float uBandModeCurr;
  uniform float uBandFade;   // 0..1 条带层淡变（0.2s，D5）
  uniform float uTime;
  varying vec3 vDir;

  // 高斯条带（h=地平线上高度 0..1；c 中心/w 半宽/a 强度）
  float stripe(float h, float c, float w, float a) {
    float d = (h - c) / w;
    return a * exp(-d * d);
  }

  // 单模式条带贡献（返回叠加色；mode 3=night 无条带）
  vec3 bandContribution(float mode, float h, float t) {
    if (mode < 0.5) {
      // dawnBands：朝霞条带 ×3（金，低空；uTime 微漂——「静止但活着」）
      float b1 = stripe(h, 0.050 + 0.004 * sin(uTime * 0.13), 0.020, 0.50);
      float b2 = stripe(h, 0.100 + 0.003 * sin(uTime * 0.11 + 2.1), 0.016, 0.40);
      float b3 = stripe(h, 0.170 + 0.003 * sin(uTime * 0.09 + 4.2), 0.013, 0.30);
      vec3 gold = vec3(1.0, 0.851, 0.658); // #ffd9a8 朝霞金
      return gold * clamp(b1 + b2 + b3, 0.0, 1.0);
    } else if (mode < 1.5) {
      // dayClouds：少量白云条带 op 0.25（§4.3.2 day 列）
      float c1 = stripe(h, 0.160, 0.050, 0.25);
      float c2 = stripe(h, 0.300, 0.030, 0.15);
      return vec3(1.0) * clamp(c1 + c2, 0.0, 0.25);
    } else if (mode < 2.5) {
      // duskBands：晚霞条带（橙）+ 蓝调带（horizon 之上 15%~40% 插 #5A6AA8）
      float o1 = stripe(h, 0.045, 0.020, 0.45);
      float o2 = stripe(h, 0.090, 0.016, 0.35);
      float o3 = stripe(h, 0.150, 0.012, 0.25);
      vec3 dusk = vec3(1.0, 0.620, 0.345) * clamp(o1 + o2 + o3, 0.0, 1.0); // #ff9e58 系
      float bandLo = smoothstep(0.11, 0.15, h);
      float bandHi = 1.0 - smoothstep(0.40, 0.44, h);
      float blueBand = bandLo * bandHi;
      return dusk + vec3(0.353, 0.416, 0.659) * blueBand * 0.55; // #5A6AA8 蓝调带
    }
    return vec3(0.0);
  }

  void main() {
    float h = max(vDir.y, 0.0);            // 地平线以上高度 0..1
    float t = pow(h, 0.62);                // 渐变曲线（低空压 horizon 色）
    vec3 col = mix(uHorizon, uZenith, t);
    if (vDir.y < 0.0) col = uHorizon;      // 地平线以下维持 horizon（底座遮挡，仅兜底）
    // 条带（prev→curr 按 uBandFade 0.2s 淡变——skyExtra 离散切换用 opacity 渐变，稳态=curr）
    vec3 prev = bandContribution(uBandModePrev, h, t);
    vec3 curr = bandContribution(uBandModeCurr, h, t);
    col += mix(prev, curr, uBandFade);
    gl_FragColor = vec4(col, 1.0);
    // T45 修复（showcase-1 观感疑点②根因）：线性 uniform（uZenith/uHorizon 经 ColorManagement
    // 转 linear）直写帧缓冲缺输出转换——linear 被当 sRGB 显示（#ff8e4f 显示为 #ff4514 刺眼橙红、
    // zenith 端近黑），渐变层次全灭读作均匀色。补线性→sRGB 输出转换（water 原型同款，
    // toonMaterial.ts WATER_FRAG 同位），authored 渐变/条带按文档色值呈现。NoToneMapping 下
    // tonemapping_fragment 为恒等，无需插入。
    #include <colorspace_fragment>
  }
`;

/** 程序化月面贴图：灰盘+月海斑+临边昏暗（Canvas，128px，无外部资产）。 */
function paintMoonTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('[sky] 无法获取月面 2d 上下文');
  const base = ctx.createRadialGradient(56, 52, 8, 64, 64, 62);
  base.addColorStop(0, '#f4f6fa');
  base.addColorStop(0.72, '#dfe4ee');
  base.addColorStop(1, '#b9c2d4');
  ctx.fillStyle = base;
  ctx.beginPath();
  ctx.arc(64, 64, 62, 0, Math.PI * 2);
  ctx.fill();
  // 月海斑（确定性排布）
  const rng = mulberry32(hashString('sky/moon'));
  ctx.fillStyle = 'rgba(146,156,180,0.55)';
  for (let i = 0; i < 7; i++) {
    const a = rng() * Math.PI * 2;
    const r = 10 + rng() * 34;
    const cx = 64 + Math.cos(a) * r * 0.7;
    const cy = 64 + Math.sin(a) * r * 0.7;
    ctx.beginPath();
    ctx.arc(cx, cy, 4 + rng() * 9, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(120,130,155,0.35)';
  for (let i = 0; i < 12; i++) {
    const a = rng() * Math.PI * 2;
    const r = 18 + rng() * 38;
    ctx.beginPath();
    ctx.arc(64 + Math.cos(a) * r * 0.72, 64 + Math.sin(a) * r * 0.72, 1.5 + rng() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.name = 'sky/moon';
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** 径向渐变光晕贴图（月晕；与场景 halo 同形程序化）。 */
function paintHaloTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('[sky] 无法获取月晕 2d 上下文');
  const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
  grad.addColorStop(0, 'rgba(226,233,248,0.85)');
  grad.addColorStop(0.4, 'rgba(210,222,244,0.30)');
  grad.addColorStop(1, 'rgba(200,214,240,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.name = 'sky/halo';
  return texture;
}

/** 上半球均匀方向（拒绝采样；y≥yMin 保地平线上）。 */
function hemisphereDirection(rng: () => number, yMin: number): THREE.Vector3 {
  for (let i = 0; i < 64; i++) {
    const u = rng() * 2 - 1;
    const a = rng() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    const dir = new THREE.Vector3(s * Math.cos(a), u, s * Math.sin(a));
    if (dir.y >= yMin) return dir;
  }
  return new THREE.Vector3(0, 1, 0);
}

/**
 * SkySystem：程序化渐变天空/背景板（docs/01 §3.2 render/sky.ts 职责落点）。
 * Director 持有并每帧喂 SkyFrame（帧汇转接）；本类只写材质/uniform/可见性，不碰相机、无时钟。
 */
export class SkySystem {
  readonly root = new THREE.Group();

  private readonly domeMaterial: THREE.ShaderMaterial;
  private readonly starMaterial: THREE.PointsMaterial;
  private readonly galaxyMaterial: THREE.PointsMaterial;
  private readonly moonMaterial: THREE.SpriteMaterial;
  private readonly haloMaterial: THREE.SpriteMaterial;
  private readonly moon: THREE.Sprite;
  private readonly halo: THREE.Sprite;
  private readonly moonPos = new THREE.Vector3();

  private attachedScene: THREE.Scene | null = null;
  /** 穹顶 uniforms（类型化索引——shader 参数直读写，免 noUncheckedIndexedAccess 兜底） */
  private readonly domeUniforms: {
    uZenith: THREE.IUniform<THREE.Color>;
    uHorizon: THREE.IUniform<THREE.Color>;
    uBandModePrev: THREE.IUniform<number>;
    uBandModeCurr: THREE.IUniform<number>;
    uBandFade: THREE.IUniform<number>;
    uTime: THREE.IUniform<number>;
  };
  private currMode: number = BAND_MODE.duskBands; // 首帧由 apply 呈现默认组合（dusk，§4.3.5）
  private prevMode: number = this.currMode;
  private fadeT = 1; // 1=稳定（无淡变进行）
  private nightFade = 0; // 夜间组（星/银河/月/晕）opacity 因子
  private lastFrame: SkyFrame | null = null;

  constructor() {
    this.root.name = 'render/sky';

    // ① 渐变穹顶
    this.domeUniforms = {
      uZenith: { value: new THREE.Color('#3c4e96') },
      uHorizon: { value: new THREE.Color('#ff8e4f') },
      uBandModePrev: { value: this.prevMode },
      uBandModeCurr: { value: this.currMode },
      uBandFade: { value: 1 },
      uTime: { value: 0 },
    };
    this.domeMaterial = new THREE.ShaderMaterial({
      vertexShader: DOME_VERTEX,
      fragmentShader: DOME_FRAGMENT,
      uniforms: this.domeUniforms as unknown as Record<string, THREE.IUniform>,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(DOME_RADIUS, 48, 32), this.domeMaterial);
    dome.name = 'sky/dome';
    dome.renderOrder = -50;
    dome.frustumCulled = false;
    this.root.add(dome);

    // ② 星空 900 主星 + 银河带 300 暗点（确定性；Points 屏幕空间定径）
    const starRng = mulberry32(hashString('sky/stars'));
    const starPositions: number[] = [];
    const starColors: number[] = [];
    for (let i = 0; i < 900; i++) {
      const dir = hemisphereDirection(starRng, 0.03);
      starPositions.push(dir.x * DOME_RADIUS * 0.98, dir.y * DOME_RADIUS * 0.98, dir.z * DOME_RADIUS * 0.98);
      const b = 0.5 + starRng() * 0.5; // 亮度差
      const warm = starRng();
      starColors.push(b * (0.86 + warm * 0.14), b * (0.88 + starRng() * 0.1), b);
    }
    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
    starGeometry.setAttribute('color', new THREE.Float32BufferAttribute(starColors, 3));
    this.starMaterial = new THREE.PointsMaterial({
      size: 2.2,
      sizeAttenuation: false,
      vertexColors: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false,
    });
    const stars = new THREE.Points(starGeometry, this.starMaterial);
    stars.name = 'sky/stars-900';
    stars.renderOrder = -49;
    stars.frustumCulled = false;
    stars.visible = false;
    this.root.add(stars);

    const galaxyPositions: number[] = [];
    const galaxyColors: number[] = [];
    const galaxyRng = mulberry32(hashString('sky/galaxy'));
    const axisA = new THREE.Vector3(0, 1, 0).cross(GALAXY_BAND_NORMAL).normalize();
    const axisB = GALAXY_BAND_NORMAL.clone().cross(axisA).normalize();
    for (let i = 0; i < 300; i++) {
      const ang = galaxyRng() * Math.PI * 2;
      const off = (galaxyRng() + galaxyRng() + galaxyRng() - 1.5) * 0.22; // 近高斯横向散布
      const dir = axisA.clone().multiplyScalar(Math.cos(ang)).add(axisB.clone().multiplyScalar(Math.sin(ang)))
        .add(GALAXY_BAND_NORMAL.clone().multiplyScalar(off)).normalize();
      if (dir.y < 0.02) continue; // 只留地平线上（暗点允许少量缺失）
      galaxyPositions.push(dir.x * DOME_RADIUS * 0.985, dir.y * DOME_RADIUS * 0.985, dir.z * DOME_RADIUS * 0.985);
      const b = 0.16 + galaxyRng() * 0.22; // 暗点
      galaxyColors.push(b * 0.78, b * 0.85, b); // #7f92c0 系
    }
    const galaxyGeometry = new THREE.BufferGeometry();
    galaxyGeometry.setAttribute('position', new THREE.Float32BufferAttribute(galaxyPositions, 3));
    galaxyGeometry.setAttribute('color', new THREE.Float32BufferAttribute(galaxyColors, 3));
    this.galaxyMaterial = new THREE.PointsMaterial({
      size: 1.4,
      sizeAttenuation: false,
      vertexColors: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false,
    });
    const galaxy = new THREE.Points(galaxyGeometry, this.galaxyMaterial);
    galaxy.name = 'sky/galaxy-300';
    galaxy.renderOrder = -48;
    galaxy.frustumCulled = false;
    galaxy.visible = false;
    this.root.add(galaxy);

    // ③ 月面 billboard + 月晕 ×2.4（Sprite 自公告板；月向=主光方向）
    this.moonMaterial = new THREE.SpriteMaterial({
      map: paintMoonTexture(),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false,
    });
    this.moon = new THREE.Sprite(this.moonMaterial);
    this.moon.name = 'sky/moon';
    this.moon.scale.setScalar(MOON_SIZE);
    this.moon.renderOrder = -47;
    this.moon.visible = false;
    this.root.add(this.moon);
    this.haloMaterial = new THREE.SpriteMaterial({
      map: paintHaloTexture(),
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    this.halo = new THREE.Sprite(this.haloMaterial);
    this.halo.name = 'sky/moon-halo';
    this.halo.scale.setScalar(MOON_SIZE * 2.4); // 月晕 ×2.4（§4.3.3-⑧）
    this.halo.renderOrder = -46;
    this.halo.visible = false;
    this.root.add(this.halo);
  }

  /** 挂入场景（幂等；随 Director start/ dispose 走）。 */
  attach(scene: THREE.Scene): void {
    this.detach();
    scene.add(this.root);
    this.attachedScene = scene;
  }

  detach(): void {
    if (!this.attachedScene) return;
    this.attachedScene.remove(this.root);
    this.attachedScene = null;
  }

  /**
   * 每帧推进（Director 帧序 systems 段；frame=最近一次 TimeLightFrame 帧汇转接值）：
   * 颜色/uniform 直写（连续量随过渡已插值）；skyExtra 离散值变更→0.2s 双层淡变。
   */
  update(dt: number, frame: SkyFrame | null): void {
    if (frame) {
      this.lastFrame = frame;
      this.domeUniforms.uZenith.value.copy(frame.zenith);
      this.domeUniforms.uHorizon.value.copy(frame.horizon);
      const mode = BAND_MODE[frame.skyExtra] ?? BAND_MODE.duskBands;
      if (mode !== this.currMode) {
        this.prevMode = this.currMode;
        this.currMode = mode;
        this.fadeT = 0; // 启动 0.2s 交叉淡变（D5）
      }
      // 月向=主光方向（night 档即月向；过渡期随插值方向平滑移动）
      this.moonPos.copy(frame.lightDir).normalize().multiplyScalar(DOME_RADIUS * 0.93);
      this.moon.position.copy(this.moonPos);
      this.halo.position.copy(this.moonPos);
    }
    this.domeUniforms.uTime.value += dt;
    if (this.fadeT < 1) {
      this.fadeT = Math.min(1, this.fadeT + dt / SKY_FADE_S);
      const f = this.fadeT * this.fadeT * (3 - 2 * this.fadeT); // easeInOut（D5 同款平滑）
      this.domeUniforms.uBandFade.value = f;
      this.domeUniforms.uBandModePrev.value = this.prevMode;
      this.domeUniforms.uBandModeCurr.value = this.currMode;
    }
    const nightTarget = this.lastFrame?.skyExtra === 'nightStarsMoon' ? 1 : 0;
    if (this.nightFade !== nightTarget) {
      this.nightFade = THREE.MathUtils.clamp(
        this.nightFade + (nightTarget - this.nightFade >= 0 ? 1 : -1) * (dt / SKY_FADE_S),
        0, 1,
      );
      if (Math.abs(this.nightFade - nightTarget) < 0.001) this.nightFade = nightTarget;
    }
    const nightOn = this.nightFade > 0.001;
    this.starMaterial.opacity = 0.95 * this.nightFade;
    this.galaxyMaterial.opacity = 0.85 * this.nightFade;
    this.moonMaterial.opacity = this.nightFade;
    this.haloMaterial.opacity = 0.32 * this.nightFade; // 月晕柔光（×2.4 尺度在 scale 上）
    this.setNightGroupVisible(nightOn);
  }

  private setNightGroupVisible(visible: boolean): void {
    for (const child of this.root.children) {
      if (child.name !== 'sky/dome') child.visible = visible;
    }
  }

  /** 释放（Director dispose 路径）。 */
  dispose(): void {
    this.detach();
    this.root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const material = mesh.material as THREE.Material | undefined;
      if (material) {
        const map = (material as THREE.SpriteMaterial).map;
        if (map) map.dispose();
        material.dispose();
      }
    });
  }
}
