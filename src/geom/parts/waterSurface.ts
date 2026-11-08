// docs/01-整体架构.md §3.2 geom/parts/waterSurface.ts —— 可复用部件库 waterSurface（海面/溪流面）。
// docs/02-场景模块.md §4.1.0 复用清单：海崖首创，松林溪流复用；§4.1.1 2.1.1「海面 waterSurface
// （近岸渐变顶点色+2 层 additive 波光面）」；docs/04-三渲二渲染.md §5.2 原型表 #11 water（自定义 shader、
// 1 平面 1 DC、无顶点波动）+ §5.8「两层噪声阈值高光带，uv 反向滚动」。
// 纪律：水本体一律经 ToonMaterialFactory 'water' 原型（内容模块禁私搭 ShaderMaterial，§5.2）；
// 波光叠加层属 §5.3「halo/贴花」类无描边加性层（docs/04 §5.8 光束/光斑同族），用 MeshBasicMaterial
// + additive + 噪声 alpha 贴图——静态贴图 + 运行期 uv offset（「贴图不动原则」，docs/04 §5.4）。
// ★ 禁止人形/人物几何（一.6）。T18 落点。
import * as THREE from 'three';
import type { SharedAssets } from '@/systems/handles';
import { toonMaterials } from '@/render/toonMaterial';
import { hashStringToSeed, createFbm2D } from '@/tex/canvasTex';

/* ============================ 水面本体（water 原型，1 平面 1 DC） ============================ */

export interface WaterSurfaceParams {
  readonly assets: SharedAssets;
  /** 缓存/日志名（几何 id 前缀） */
  readonly name: string;
  /** 世界尺寸（x × z），平面已转平（+y 朝上），高度由调用方 position.y 摆放 */
  readonly width: number;
  readonly depth: number;
  /** 水体基色（海=seaDeep/溪=streamBlue，docs/02 4.1.x 通道定值） */
  readonly color: string;
  /** 波光色（海崖黄昏金橙 / 溪流日光白），§5.8 波光条 */
  readonly glintColor: string;
  /** 噪声密度（默认海 9 / 溪 6）与流速（默认 0.06） */
  readonly waveScale?: number;
  readonly waveSpeed?: number;
  /** 不透明度（默认 0.88；浅湾可降） */
  readonly opacity?: number;
}

/** 生成一块平铺水面网格（water 原型；uv 偏移动效归场景 SceneAnimation/公共 uWaterTime，本件不动画）。 */
export function createWaterSurface(params: WaterSurfaceParams): THREE.Mesh {
  const { assets, name } = params;
  const geometry = assets.geometry(`${name}/plane`, () => {
    const plane = new THREE.PlaneGeometry(params.width, params.depth, 1, 1);
    plane.rotateX(-Math.PI / 2); // +y 朝上
    return plane;
  });
  const material = toonMaterials.get('water', {
    color: params.color,
    glintColor: params.glintColor,
    waveScale: params.waveScale ?? 9,
    waveSpeed: params.waveSpeed ?? 0.06,
    fresnelPower: 2.2,
    opacity: params.opacity ?? 0.88,
    name: `${name}/water`,
  });
  ensureFogUniforms(material);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.userData.noOutline = true; // §5.3：水面关描边
  mesh.receiveShadow = false;
  return mesh;
}

/**
 * ★ 修复登记（T18 实现期发现，待 T05/T43 评审后回写工厂）：toonMaterial.buildWater 的
 * ShaderMaterial 虽声明 `fog: true` 且着色器含 fog_pars/fog chunks，但 uniforms 未并入
 * UniformsLib.fog——内建材质由 getUniforms() 从 ShaderLib 克隆（自带 fog 组），ShaderMaterial
 * 直接取 material.uniforms，缺 fogColor/fogDensity 时 renderer.refreshFogUniforms 首帧即抛
 * TypeError（scene.fog 挂载后必现）。本帮手按引用补齐标准 fog uniforms（不重建材质、不动工厂文件）。
 */
function ensureFogUniforms(material: THREE.Material): void {
  const shaderMaterial = material as THREE.ShaderMaterial;
  if (!shaderMaterial.isShaderMaterial || shaderMaterial.uniforms.fogColor) return;
  const lib: Record<string, THREE.IUniform> = THREE.UniformsLib.fog;
  for (const key of ['fogColor', 'fogDensity', 'fogNear', 'fogFar']) {
    const source = lib[key];
    if (!source) continue;
    shaderMaterial.uniforms[key] = {
      value: source.value instanceof THREE.Color ? source.value.clone() : source.value,
    };
  }
}

/* ============================ 波光叠加层（additive 噪声贴花，§4.1.1「2 层」） ============================ */

export interface GlintLayerParams {
  readonly assets: SharedAssets;
  readonly name: string;
  readonly width: number;
  readonly depth: number;
  /** 波光色（贴图近白中值，色相走材质 color） */
  readonly color: string;
  /** 基础不透明度（运行期由场景动画写 opacity：§7.2.1-③「α=0.22+0.08·sin(0.7t)」） */
  readonly opacity: number;
  /** 噪声条带密度（默认 7）与噪声种子名（默认随 name 确定，同组合可复现） */
  readonly streakScale?: number;
}

/**
 * 一层 additive 波光面：静态噪声 alpha 贴图（水平细条带，模拟掠射光粼光），
 * 运行期仅写 map.offset 与 material.opacity（docs/05 §7.2.1-③「每帧仅写 map.offset 与 opacity」）。
 * 返回 mesh；调用方经 (mesh.material as THREE.MeshBasicMaterial) 取 offset/opacity 驱动。
 */
export function createGlintLayer(params: GlintLayerParams): THREE.Mesh {
  const { assets, name } = params;
  const texture = assets.texture(`${name}/noise`, () => paintGlintNoiseTexture(name, params.streakScale ?? 7));
  const geometry = assets.geometry(`${name}/plane`, () => {
    const plane = new THREE.PlaneGeometry(params.width, params.depth, 1, 1);
    plane.rotateX(-Math.PI / 2);
    return plane;
  });
  const material = new THREE.MeshBasicMaterial({
    color: params.color,
    map: texture,
    transparent: true,
    opacity: params.opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: true,
  });
  material.name = `${name}/glint`;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.userData.noOutline = true;
  mesh.renderOrder = 20; // §5.6：halo/光斑/贴花层
  mesh.receiveShadow = false;
  mesh.castShadow = false;
  return mesh;
}

/** 波光噪声 alpha 贴图：水平细条带 × fbm 扰动（近白中值纪律不适用——alpha 承载形状，色相走材质）。 */
function paintGlintNoiseTexture(seedName: string, streakScale: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error(`[waterSurface] 无法获取 2d 上下文 ${seedName}`);
  const fbm = createFbm2D(hashStringToSeed(`water/glint/${seedName}`), 4);
  const image = ctx.createImageData(size, size);
  const data = image.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      // 水平拉伸的细条带：v 方向高频、u 方向低频 + fbm 断裂
      const band = Math.sin(v * Math.PI * 2 * streakScale + fbm(u * 3, v * 9) * 5.5) * 0.5 + 0.5;
      const mod = fbm(u * 6 + 11, v * 24);
      const a = Math.max(0, band * 1.45 - 0.62) * (0.35 + 0.65 * mod);
      const i = (y * size + x) * 4;
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = Math.round(Math.min(1, a) * 255);
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.name = `water/glint/${seedName}`;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}
