// docs/01-整体架构.md §3.2 tex/canvasTex.ts —— Canvas/SVG 程序化贴图基础设施（八.2 红线：全部现场生成，零贴图文件、零运行时网络）。
// docs/04-三渲二渲染.md §5.4：
//   - createCanvasTexture(key, w, h, draw, opts) 命中 key 返回缓存；引用计数经 SharedAssets（core/assets.ts 门面）acquire/release；
//   - 默认 SRGBColorSpace、anisotropy=min(4,max)、ClampToEdge；halo/噪声小图/ramp 无 mipmaps；
//   - 全局常驻层（ramp×5、噪声库、木纹、halo 径向渐变）以 permanent 标记永不清零；
//   - SVG 矢量光栅化异步 → preloadAll(): Promise，场景装配前 await；
//   - 贴图不动原则：创建期一次性绘制，运行期零 canvas 重绘、零纹理上传；
//   - 噪声库：自写 value noise / fbm（§5.4 策略②），以内容 id 为种子，同组合完全一致。
import * as THREE from 'three';
import { clamp } from '@/shared/math';

// ---------------------------------------------------------------------------
// 模块级默认配置：anisotropy 上限由持有 renderer 的一方注入（engine/Director 初始化期调用一次）
// ---------------------------------------------------------------------------

export interface CanvasTextureDefaults {
  maxAnisotropy: number;
}

let defaults: CanvasTextureDefaults = { maxAnisotropy: 4 };

export function configureCanvasTextures(next: Partial<CanvasTextureDefaults>): void {
  if (next.maxAnisotropy !== undefined) {
    defaults = { maxAnisotropy: Math.max(1, Math.floor(next.maxAnisotropy)) };
  }
}

// ---------------------------------------------------------------------------
// 选项与缓存
// ---------------------------------------------------------------------------

export interface CanvasTextureOptions {
  /** 默认 SRGBColorSpace（ramp 等光照空间数据图显式传 NoColorSpace，§5.2） */
  colorSpace?: THREE.ColorSpace;
  /** 默认 true；halo/噪声小图/ramp 显式传 false（§5.4） */
  generateMipmaps?: boolean;
  minFilter?: THREE.MinificationTextureFilter;
  magFilter?: THREE.MagnificationTextureFilter;
  /** 默认 ClampToEdge（§5.4 UV 规范：一律 ClampToEdge 或显式 Repeat） */
  wrapS?: THREE.Wrapping;
  wrapT?: THREE.Wrapping;
  /** 默认 min(4, maxAnisotropy) */
  anisotropy?: number;
  /** 全局常驻层：release 归零也不 dispose（§5.4 永不清零） */
  permanent?: boolean;
}

export type CanvasDrawFn = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
export type TextureFactoryFn = () => THREE.Texture;
export type SvgBuilderFn = (w: number, h: number) => string;

interface CacheEntry {
  texture: THREE.Texture;
  refs: number;
  permanent: boolean;
  /** SVG 等异步光栅化的落定承诺；preloadAll 等待全部 pending */
  pending?: Promise<void>;
}

const cache = new Map<string, CacheEntry>();

function applyTextureOptions(texture: THREE.Texture, opts: CanvasTextureOptions, canvasDefaults: boolean): void {
  if (canvasDefaults) {
    texture.colorSpace = opts.colorSpace ?? THREE.SRGBColorSpace;
    texture.generateMipmaps = opts.generateMipmaps ?? true;
    texture.minFilter = opts.minFilter ?? THREE.LinearMipmapLinearFilter;
    texture.magFilter = opts.magFilter ?? THREE.LinearFilter;
    texture.wrapS = opts.wrapS ?? THREE.ClampToEdgeWrapping;
    texture.wrapT = opts.wrapT ?? THREE.ClampToEdgeWrapping;
    texture.anisotropy = opts.anisotropy ?? Math.min(4, defaults.maxAnisotropy);
  } else {
    // 通用工厂路径：只应用显式给出的选项，不覆盖工厂自带的纹理设置
    if (opts.colorSpace !== undefined) texture.colorSpace = opts.colorSpace;
    if (opts.generateMipmaps !== undefined) texture.generateMipmaps = opts.generateMipmaps;
    if (opts.minFilter !== undefined) texture.minFilter = opts.minFilter;
    if (opts.magFilter !== undefined) texture.magFilter = opts.magFilter;
    if (opts.wrapS !== undefined) texture.wrapS = opts.wrapS;
    if (opts.wrapT !== undefined) texture.wrapT = opts.wrapT;
    if (opts.anisotropy !== undefined) texture.anisotropy = opts.anisotropy;
  }
  texture.needsUpdate = true;
}

/**
 * Canvas 贴图工厂主入口（§5.4）：命中 key 直接返回缓存并 +1 引用；
 * 未命中现场绘制一次后登记。绘制异常不阻断装配——降级为近白底（中值原则，避免死黑泄漏）。
 */
export function createCanvasTexture(
  key: string,
  w: number,
  h: number,
  draw: CanvasDrawFn,
  opts: CanvasTextureOptions = {},
): THREE.CanvasTexture {
  const hit = cache.get(key);
  if (hit) {
    hit.refs += 1;
    return hit.texture as THREE.CanvasTexture;
  }
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(w));
  canvas.height = Math.max(1, Math.floor(h));
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error(`[canvasTex] 无法获取 2d 上下文 key=${key}`);
  }
  try {
    draw(ctx, canvas.width, canvas.height);
  } catch (err) {
    console.warn(`[canvasTex] 绘制失败，降级近白底 key=${key}`, err);
    ctx.fillStyle = '#dddddd';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.name = key;
  applyTextureOptions(texture, opts, true);
  cache.set(key, { texture, refs: 1, permanent: opts.permanent ?? false });
  return texture;
}

/** 通用贴图工厂路径：非 Canvas 2D 来源（未来天空渐变板等）同 key 共享同一份缓存与引用计数。 */
export function getOrCreateTexture(key: string, factory: TextureFactoryFn, opts: CanvasTextureOptions = {}): THREE.Texture {
  const hit = cache.get(key);
  if (hit) {
    hit.refs += 1;
    return hit.texture;
  }
  const texture = factory();
  texture.name = key;
  applyTextureOptions(texture, opts, false);
  cache.set(key, { texture, refs: 1, permanent: opts.permanent ?? false });
  return texture;
}

/**
 * SVG 矢量贴图（§5.4 策略③）：SVG 字符串 → data URI → Image → Canvas。
 * 先以透明底登记（材质可立即引用），光栅化异步进行，preloadAll() 落定后 needsUpdate；
 * 解码失败降级为透明贴图，不阻断场景装配。
 */
export function createSvgTexture(
  key: string,
  w: number,
  h: number,
  buildSvg: SvgBuilderFn,
  opts: CanvasTextureOptions = {},
): THREE.CanvasTexture {
  const hit = cache.get(key);
  if (hit) {
    hit.refs += 1;
    return hit.texture as THREE.CanvasTexture;
  }
  const texture = createCanvasTexture(key, w, h, () => undefined, {
    generateMipmaps: false,
    ...opts,
  });
  const entry = cache.get(key);
  if (entry && !entry.pending) {
    entry.pending = rasterizeSvg(texture, buildSvg(canvasWidth(texture), canvasHeight(texture)));
  }
  return texture;
}

function canvasWidth(texture: THREE.CanvasTexture): number {
  const image = texture.image;
  return image instanceof HTMLCanvasElement ? image.width : 1;
}

function canvasHeight(texture: THREE.CanvasTexture): number {
  const image = texture.image;
  return image instanceof HTMLCanvasElement ? image.height : 1;
}

async function rasterizeSvg(texture: THREE.CanvasTexture, svg: string): Promise<void> {
  try {
    const image = new Image();
    image.decoding = 'async';
    const loaded = new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('SVG Image 解码失败'));
    });
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    await loaded;
    const canvas = texture.image;
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new Error('SVG 贴图载体不是 canvas');
    }
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    }
    texture.needsUpdate = true;
  } catch (err) {
    console.warn('[canvasTex] SVG 光栅化失败，降级为透明贴图', err);
  }
}

// ---------------------------------------------------------------------------
// 引用计数与统计
// ---------------------------------------------------------------------------

export function getTexture(key: string): THREE.Texture | undefined {
  return cache.get(key)?.texture;
}

export function textureRefCount(key: string): number {
  return cache.get(key)?.refs ?? 0;
}

/**
 * 引用计数释放（经 SharedAssets 门面调用）：归零即 dispose；
 * permanent 常驻层由缓存自持 1 个引用，永不清零（§5.4）。
 */
export function releaseTexture(key: string): number {
  const entry = cache.get(key);
  if (!entry) {
    console.warn(`[canvasTex] release 未登记的贴图 key=${key}`);
    return 0;
  }
  entry.refs = Math.max(0, entry.refs - 1);
  if (entry.refs === 0) {
    if (entry.permanent) {
      entry.refs = 1;
      return 1;
    }
    entry.texture.dispose();
    cache.delete(key);
    return 0;
  }
  return entry.refs;
}

export interface TextureCacheStats {
  count: number;
  permanent: number;
  pending: number;
  refs: number;
}

export function textureCacheStats(): TextureCacheStats {
  let permanent = 0;
  let pending = 0;
  let refs = 0;
  for (const entry of cache.values()) {
    if (entry.permanent) permanent += 1;
    if (entry.pending) pending += 1;
    refs += entry.refs;
  }
  return { count: cache.size, permanent, pending, refs };
}

/** 非常驻贴图全量释放（SharedAssets 整体收尾用）；常驻层保留。 */
export function disposeTransientTextures(): number {
  let disposed = 0;
  for (const [key, entry] of [...cache.entries()]) {
    if (!entry.permanent) {
      entry.texture.dispose();
      cache.delete(key);
      disposed += 1;
    }
  }
  return disposed;
}

/** SVG 光栅化等待口（§5.4 ③）：场景装配前 await；全部落定即 resolve（失败项已降级，不阻塞）。 */
export function preloadAll(): Promise<void> {
  const pendings: Promise<void>[] = [];
  for (const entry of cache.values()) {
    if (entry.pending) pendings.push(entry.pending);
  }
  if (pendings.length === 0) return Promise.resolve();
  return Promise.allSettled(pendings).then(() => undefined);
}

// ---------------------------------------------------------------------------
// ramp 色阶贴图（§5.2：256×4 RGBA8、无 mipmap、LinearFilter、本体灰度；RGB ramp 用 color 档）
// ---------------------------------------------------------------------------

export interface RampStop {
  /** 位置 0..1（dotNL*0.5+0.5 映射后的 coord.x） */
  t: number;
  /** 灰度 0..1（无 color 时使用） */
  v?: number;
  /** 可选颜色档（可选增强补丁① RGB ramp：海面/逆光剪影强色相偏移场合，§5.2） */
  color?: string;
}

export interface RampOptions {
  /** NearestFilter 留作工厂参数（§5.2），默认 Linear（色带边缘自然抗锯齿） */
  nearest?: boolean;
}

function parseHexColor(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const s = m[1] as string;
  if (s.length === 3) {
    return [
      parseInt(s.charAt(0) + s.charAt(0), 16),
      parseInt(s.charAt(1) + s.charAt(1), 16),
      parseInt(s.charAt(2) + s.charAt(2), 16),
    ];
  }
  return [
    parseInt(s.slice(0, 2), 16),
    parseInt(s.slice(2, 4), 16),
    parseInt(s.slice(4, 6), 16),
  ];
}

function stopColor(stop: RampStop): [number, number, number] {
  if (stop.color !== undefined) {
    const parsed = parseHexColor(stop.color);
    if (parsed) return parsed;
    console.warn(`[canvasTex] ramp 色档无法解析，回退白 ${stop.color}`);
    return [255, 255, 255];
  }
  const g = Math.round(clamp(stop.v ?? 1, 0, 1) * 255);
  return [g, g, g];
}

function sampleRampStop(sorted: readonly RampStop[], t: number): [number, number, number] {
  if (sorted.length === 0) return [255, 255, 255];
  const first = sorted[0] as RampStop;
  const last = sorted[sorted.length - 1] as RampStop;
  if (t <= first.t) return stopColor(first);
  if (t >= last.t) return stopColor(last);
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i] as RampStop;
    const b = sorted[i + 1] as RampStop;
    if (t >= a.t && t <= b.t) {
      const span = b.t - a.t;
      const f = span > 0 ? (t - a.t) / span : 0;
      const ca = stopColor(a);
      const cb = stopColor(b);
      return [
        Math.round(ca[0] + (cb[0] - ca[0]) * f),
        Math.round(ca[1] + (cb[1] - ca[1]) * f),
        Math.round(ca[2] + (cb[2] - ca[2]) * f),
      ];
    }
  }
  return stopColor(last);
}

/** ramp 生成 API（§5.2）：按 key 缓存进 SharedAssets 贴图缓存，permanent 永不清零。 */
export function buildRampTexture(key: string, steps: readonly RampStop[], opts: RampOptions = {}): THREE.CanvasTexture {
  const sorted = [...steps].sort((a, b) => a.t - b.t);
  return createCanvasTexture(key, 256, 4, (ctx, w, h) => {
    const image = ctx.createImageData(w, h);
    const data = image.data;
    for (let x = 0; x < w; x++) {
      const t = (x + 0.5) / w;
      const rgb = sampleRampStop(sorted, t);
      for (let y = 0; y < h; y++) {
        const i = (y * w + x) * 4;
        data[i] = rgb[0];
        data[i + 1] = rgb[1];
        data[i + 2] = rgb[2];
        data[i + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
  }, {
    // ramp 在线性光照空间采样（getGradientIrradiance），色阶值不做 sRGB 反变换
    colorSpace: THREE.NoColorSpace,
    generateMipmaps: false,
    minFilter: opts.nearest ? THREE.NearestFilter : THREE.LinearFilter,
    magFilter: opts.nearest ? THREE.NearestFilter : THREE.LinearFilter,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
    anisotropy: 1,
    permanent: true,
  });
}

// ---------------------------------------------------------------------------
// 噪声库（§5.4 策略②：自写 value noise / fbm，以内容 id 为种子，同组合完全一致）
// ---------------------------------------------------------------------------

/** FNV-1a 32bit：字符串 id → 数值种子 */
export function hashStringToSeed(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export type Noise2D = (x: number, y: number) => number; // 返回 0..1

export function createValueNoise2D(seed: number): Noise2D {
  const lattice = (ix: number, iy: number): number => {
    let h = seed | 0;
    h = Math.imul(h ^ (ix | 0), 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h ^ (iy | 0), 0xc2b2ae35);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
  const fade = (t: number): number => t * t * (3 - 2 * t);
  return (x: number, y: number): number => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const u = fade(x - ix);
    const v = fade(y - iy);
    const a = lattice(ix, iy);
    const b = lattice(ix + 1, iy);
    const c = lattice(ix, iy + 1);
    const d = lattice(ix + 1, iy + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}

export function createFbm2D(seed: number, octaves = 4, lacunarity = 2, gain = 0.5): Noise2D {
  const layers: { noise: Noise2D; amp: number; freq: number }[] = [];
  let amp = 1;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    layers.push({ noise: createValueNoise2D((seed + i * 0x9e37) | 0), amp, freq });
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return (x: number, y: number): number => {
    let sum = 0;
    for (const o of layers) {
      sum += o.noise(x * o.freq, y * o.freq) * o.amp;
    }
    return norm > 0 ? sum / norm : 0;
  };
}
