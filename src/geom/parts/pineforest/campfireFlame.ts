// docs/01-整体架构.md §3.2 geom/parts/pineforest/campfireFlame.ts —— 篝火三层火焰（松林首创）。
// docs/02-场景模块.md §4.1.2 2.2.2-②「火焰 SceneAnimation+EmitterSpec spark 6×emberPower/s+火光点光
//   挂点 P3+LampHandle 呼吸快相位」；docs/05-时间天气动效.md §7.2.2-⑥「三层 cone 火焰（uv 噪声滚动+
//   顶点摆动+scale 脉冲）」；docs/04-三渲二渲染.md §5.8「一切材质级动效=静态贴图+时间相位 uniform」
//   ——贴图静态 Canvas 噪声 alpha，运行期仅写 map.offset/scale/位置（场景 SceneAnimation 驱动），
//   不私搭 ShaderMaterial（§5.2 纪律，additive MeshBasic 贴花族）。
// 火光点光挂点：真点光仅 2 预算位（docs/05 §7.1.4「车内暖光、篝火/火光」），点光本体由 Director/
//   render 点光池仲裁——本件只交出 named 挂点 Object3D（'…/fire-light-anchor'）。
// ★ 禁止人形/人物几何（一.6）。T19 落点。
import * as THREE from 'three';
import type { SharedAssets } from '@/systems/handles';
import { toonMaterials } from '@/render/toonMaterial';

export interface FlameLayerSpec {
  readonly radius: number;
  readonly height: number;
  readonly color: string;
  readonly opacity: number;
  /** uv 上滚速度（贴图 v /s，内层最快） */
  readonly scrollSpeed: number;
}

/** 三层定值（外/中/内，7-2-⑥「三层 cone」）：外橙内白，内层滚速最快=火苗上窜观感。 */
export const FLAME_LAYERS: readonly FlameLayerSpec[] = [
  { radius: 0.17, height: 0.46, color: '#ff8a3a', opacity: 0.5, scrollSpeed: 0.55 },
  { radius: 0.115, height: 0.36, color: '#ffb35c', opacity: 0.68, scrollSpeed: 0.78 },
  { radius: 0.062, height: 0.24, color: '#ffe9a8', opacity: 0.85, scrollSpeed: 1.05 },
];

export interface CampfireFlameResult {
  /** 火焰组（原点=柴堆中心地面；可见度/缩放由场景 SceneAnimation 按 emberPower 驱动） */
  readonly group: THREE.Group;
  /** 各层材质（场景写 map.offset.y 滚动与 opacity） */
  readonly materials: THREE.MeshBasicMaterial[];
  /** 火光点光挂点（P3 预算位；Object3D，Director/render 点光池取用） */
  readonly fireLightAnchor: THREE.Object3D;
  /** 炊烟发射挂点（碗口上方；EmitterSpec steam 锚点语义位） */
  readonly smokeAnchor: THREE.Object3D;
}

/** 火焰噪声 alpha 贴图：竖向条带 × fbm 断裂（底亮顶透），静态绘制 + 运行期 offset 滚动。 */
export function paintFlameNoiseTexture(seedName: string): THREE.CanvasTexture {
  const w = 64;
  const h = 128;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error(`[campfireFlame] 无法获取 2d 上下文 ${seedName}`);
  const image = ctx.createImageData(w, h);
  const data = image.data;
  // 确定性伪随机（同 seedName 复现，§3.3.2）
  let seed = 0x9e3779b9;
  for (let i = 0; i < seedName.length; i++) seed = (Math.imul(seed ^ seedName.charCodeAt(i), 0x01000193) >>> 0);
  const rand = (): number => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  // 竖向火舌条带（8 根，底部宽顶部收）
  const tongues: { cx: number; w: number; lean: number }[] = [];
  for (let i = 0; i < 8; i++) {
    tongues.push({ cx: rand(), w: 0.06 + rand() * 0.1, lean: (rand() - 0.5) * 0.5 });
  }
  for (let y = 0; y < h; y++) {
    const v = y / h; // 0 顶 → 1 底（Canvas y 向下）
    for (let x = 0; x < w; x++) {
      const u = x / w;
      let a = 0;
      for (const t of tongues) {
        const dx = Math.abs(u - (t.cx + t.lean * (1 - v) * 0.5));
        const halfW = t.w * (0.35 + 0.65 * v); // 底部宽、顶部收尖
        a = Math.max(a, Math.max(0, 1 - dx / halfW));
      }
      // 竖向包络：底部实、顶部渐隐 + 微噪断边
      a *= Math.pow(v, 0.55) * (0.82 + 0.18 * Math.sin(u * 41 + v * 23));
      const idx = (y * w + x) * 4;
      data[idx] = 255;
      data[idx + 1] = 255;
      data[idx + 2] = 255;
      data[idx + 3] = Math.round(Math.min(1, Math.max(0, a)) * 255);
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.name = `pineforest/flame/${seedName}`;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.RepeatWrapping; // v 方向滚动（7-2-⑥「uv 噪声滚动」）
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

/**
 * 三层 cone 火焰（additive 贴花族：MeshBasic+噪声 alpha，无描边）。
 * 运行期驱动（场景 SceneAnimation）：map.offset.y 滚动、scale 脉冲、可见度=emberPower。
 */
export function createCampfireFlame(assets: SharedAssets, id: string): CampfireFlameResult {
  const group = new THREE.Group();
  group.name = id;
  const materials: THREE.MeshBasicMaterial[] = [];
  FLAME_LAYERS.forEach((layer, i) => {
    // 每层独立贴图+独立材质（独立 offset 滚动速度；同 id 层间异形防复印）
    const layerTexture = assets.texture(`pineforest/flame/tex-${i}`, () => paintFlameNoiseTexture(`${id}/${i}`));
    const material = new THREE.MeshBasicMaterial({
      color: layer.color,
      map: layerTexture,
      transparent: true,
      opacity: layer.opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    material.name = `${id}/layer-${i}`;
    const geometry = assets.geometry(`${id}/cone-${i}`, () => {
      const cone = new THREE.ConeGeometry(layer.radius, layer.height, 8, 1, true); // 开口锥（贴花族无底面）
      cone.translate(0, layer.height / 2 + 0.06, 0);
      return cone;
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `${id}/layer-${i}`;
    mesh.userData.noOutline = true; // §5.3：additive 贴花层关描边
    mesh.renderOrder = 20; // §5.6：halo/光斑/贴花层
    mesh.frustumCulled = false;
    group.add(mesh);
    materials.push(material);
  });

  const fireLightAnchor = new THREE.Object3D();
  fireLightAnchor.name = `${id}/fire-light-anchor`; // P3 点光挂点（docs/05 §7.1.4 篝火/火光预算位）
  fireLightAnchor.position.y = 0.5;
  group.add(fireLightAnchor);

  const smokeAnchor = new THREE.Object3D();
  smokeAnchor.name = `${id}/smoke-anchor`;
  smokeAnchor.position.y = 0.85;
  group.add(smokeAnchor);

  return { group, materials, fireLightAnchor, smokeAnchor };
}

/** 火光呼吸灯芯（LampHandle.emissiveMat 用：呼吸快相位=breath 1.5s，功率=emberPower 由场景映射）。 */
export function createFireGlowCore(assets: SharedAssets, id: string): { mesh: THREE.Mesh; material: THREE.MeshToonMaterial } {
  const material = toonMaterials.getToon('matteProp', {
    color: '#f5e6c8',
    emissive: '#ff9a4a',
    emissiveIntensity: 1.4, // authored 基值：LightBreath 注册期快照后按 emberPower×breath 波形倍乘
    name: `${id}/glow-core`,
  });
  const mesh = new THREE.Mesh(assets.geometry(`${id}/glow-core`, () => new THREE.SphereGeometry(0.075, 8, 6)), material);
  mesh.name = `${id}/glow-core`;
  return { mesh, material };
}
