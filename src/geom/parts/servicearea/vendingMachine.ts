// docs/01-整体架构.md §3.2 geom/parts/servicearea/ —— 自动售货机（货道排列可见）。
// docs/02-场景模块.md §4.1.4-③「自动售货机 ×2（货道排列可见）（正面玻璃 α0.18；货道=3×4=12 商品盒
//   真实小几何 4 色随机实例化 J3；顶部灯带 LampHandle steady max(shopPower,0.7) 常亮 B5）」。
// J3 落点：商品盒为真实 Box 小几何（非贴图假货道），4 色（含 vendingCyan 通道）经 InstancedGroup
//   instanceColor 微差取色。★ 禁止人形/人物几何（一.6）。T21 落点。
import * as THREE from 'three';
import type { SharedAssets } from '@/systems/handles';
import { toonMaterials } from '@/render/toonMaterial';
import { InstancedGroup } from '@/geom/instanced';
import { mergeGeometries, hardenEdges, roundedBox } from '@/geom/primitives';

export interface VendingMachineParams {
  readonly assets: SharedAssets;
  /** 缓存 id（'vending/servicearea-a'） */
  readonly id: string;
  /** 机体尺寸（默认 0.62 宽 × 0.52 深 × 1.15 高） */
  readonly width?: number;
  readonly depth?: number;
  readonly height?: number;
  /** 货道商品盒 4 色（默认含 vendingCyan） */
  readonly itemColors?: readonly string[];
  /** 商品盒随机取色种子（同组合可复现） */
  readonly seed: number;
}

export interface VendingMachineResult {
  readonly group: THREE.Group;
  /** 顶部灯带 emissive 材质（LampHandle steady + floor 0.7；两台共用同一材质则只建一台的本件返回，
   *  场景侧以同参数+同 name 缓存键复用） */
  readonly stripMaterial: THREE.MeshToonMaterial;
  /** 正面玻璃（α0.18） */
  readonly glassMesh: THREE.Mesh;
}

/** 机体尺寸常量（货道排布按机体等比推定）。 */
const W = 0.62;
const D = 0.52;
const H = 1.15;

/** 售货机：机体（壳+取货口+投币面板）1 DC + 正面玻璃 + 顶部灯带 + 货道商品盒 ×12（实例化）。 */
export function createVendingMachine(params: VendingMachineParams): VendingMachineResult {
  const { assets, id, seed } = params;
  const group = new THREE.Group();
  group.name = id;

  // —— 机体（1 DC：壳体+取货口凹槽+侧商标板）——
  const bodyGeometry = assets.geometry(`${id}/body`, () => {
    const parts: THREE.BufferGeometry[] = [];
    const shell = roundedBox({ width: W, height: H, depth: D, radius: 0.045 });
    shell.translate(0, H / 2, 0);
    parts.push(hardenEdges(shell));
    const slot = roundedBox({ width: 0.34, height: 0.2, depth: 0.05, radius: 0.02 });
    slot.translate(0, 0.24, D / 2 - 0.01);
    parts.push(hardenEdges(slot));
    const flap = roundedBox({ width: 0.3, height: 0.02, depth: 0.06, radius: 0.008 });
    flap.translate(0, 0.2, D / 2 + 0.01);
    parts.push(hardenEdges(flap));
    const coinPanel = roundedBox({ width: 0.14, height: 0.2, depth: 0.02, radius: 0.008 });
    coinPanel.translate(W / 2 - 0.12, 0.62, D / 2 + 0.005);
    parts.push(hardenEdges(coinPanel));
    const merged = mergeGeometries(parts);
    if (!merged) throw new Error(`[vendingMachine] 机体合并失败 ${id}`);
    return merged;
  });
  const bodyMaterial = toonMaterials.get('metal', { color: '#d64a3f', name: `${id}/body` });
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
  body.name = `${id}/body`;
  body.castShadow = true;
  group.add(body);

  // —— 正面玻璃（α0.18，货道透出）——
  const glassMaterial = toonMaterials.get('glass', { color: '#b8d0dc', opacity: 0.18, name: `${id}/front-glass` });
  const glassMesh = new THREE.Mesh(
    assets.geometry(`${id}/front-glass`, () => new THREE.PlaneGeometry(0.4, 0.62).translate(0, 0.71, 0)),
    glassMaterial,
  );
  glassMesh.name = `${id}/front-glass`;
  glassMesh.position.z = D / 2 + 0.006;
  glassMesh.userData.noOutline = true;
  group.add(glassMesh);

  // —— 货道 3×4=12 商品盒（J3 真实小几何；4 色随机实例化，instanceColor ±5% 微差关）——
  const itemGeometry = assets.geometry(`${id}/item`, () =>
    hardenEdges(roundedBox({ width: 0.09, height: 0.13, depth: 0.06, radius: 0.006 })),
  );
  const itemMaterial = toonMaterials.get('matteProp', { color: '#ffffff', name: `${id}/item` });
  const items = new InstancedGroup(itemGeometry, itemMaterial, {
    capacity: 12,
    name: `${id}/items`,
    jitter: { hue: 0, saturation: 0, lightness: 0.04 }, // 同色盒 ±4% 明度微差（防复印感）
  });
  const colors = params.itemColors ?? ['#d64a3f', '#e8b83a', '#4a8ad6', '#6ad0e8']; // vendingCyan #6ad0e8 收尾
  // 确定性伪随机（mulberry32 内联等价——Math.imul 核心，同 seed 可复现）
  let s = seed >>> 0;
  const rand = (): number => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const matrix = new THREE.Matrix4();
  for (let col = 0; col < 3; col++) {
    for (let row = 0; row < 4; row++) {
      const x = -0.13 + col * 0.13;
      const y = 0.42 + row * 0.155;
      matrix.identity().setPosition(x, y, D / 2 - 0.09);
      const color = colors[Math.floor(rand() * colors.length) % colors.length] ?? '#d64a3f';
      items.add(matrix, color);
    }
  }
  group.add(items.group);

  // —— 顶部灯带（emissive 长条；LampHandle steady + floor 0.7 → max(shopPower,0.7) 常亮 B5）——
  const stripMaterial = toonMaterials.getToon('matteProp', {
    color: '#f0f4f6',
    emissive: '#cfeef2', // vendingCyan 冷白青（B5 售货机灯带）
    emissiveIntensity: 1.3, // authored 基值：LightBreath 按 max(shopPower,0.7) 倍乘
    name: `${id}/strip`,
  });
  const strip = new THREE.Mesh(
    assets.geometry(`${id}/strip`, () => hardenEdges(roundedBox({ width: W - 0.1, height: 0.045, depth: 0.1, radius: 0.012 }))),
    stripMaterial,
  );
  strip.name = `${id}/strip`;
  strip.position.set(0, H - 0.045, D / 2 - 0.12);
  group.add(strip);

  return { group, stripMaterial, glassMesh };
}
