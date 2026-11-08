// docs/01-整体架构.md §3.2 geom/parts/pineforest/treePine.ts —— 可复用部件库 treePine（松林首创）。
// docs/02-场景模块.md §4.1.0 复用清单「treePine（松林首创，服务区/海崖复用）」；§4.1.2 2.2.1：
//   「松林环带 treePine ×38（3 档高 3.2/4.2/5.2u ×3 色档，单树=干+3–4 层叠 Cone 树冠「树冠层叠」
//   落实，按档位分 3 组实例化）」。docs/04-三渲二渲染.md §5.6 实例化清单「松林=松树(38，干/冠分组)」、
//   §5.7 三角预算「松树 ≤900 tri」、§5.5 松林差异「foliage 层叠+rim（逆光剪影）」——冠材质走工厂
//   'foliage' 原型（自带 rim），干走 'wood'。
// 干/冠分组：本件按档位产出 trunk/canopy 两个几何（局部原点=树根），场景层分别实例化（§5.6 分组），
//   冠材质由场景 injectVegetationWind（7-2-① 松针 P2 通道，wind.ts 用法注记点名 T19）。
// ★ 禁止人形/人物几何（一.6）。T19 落点。
import * as THREE from 'three';
import type { SharedAssets } from '@/systems/handles';
import { hardenEdges, mergeGeometries } from '@/geom/primitives';

/** 三档定值（2.2.1「3 档高 3.2/4.2/5.2u」）。 */
export const PINE_TIERS = [
  { id: 's', height: 3.2, layers: 3 },
  { id: 'm', height: 4.2, layers: 4 },
  { id: 'l', height: 5.2, layers: 4 },
] as const;

export type PineTierId = (typeof PINE_TIERS)[number]['id'];

export interface PineTierGeometries {
  /** 树干几何（局部原点=树根，+y 向上） */
  readonly trunk: THREE.BufferGeometry;
  /** 层叠树冠几何（3–4 层 Cone 合并；局部原点=树根） */
  readonly canopy: THREE.BufferGeometry;
  /** 树冠顶局部高度（injectVegetationWind heightU 用） */
  readonly canopyTopY: number;
}

/** 档位几何缓存 id（SharedAssets 跨场景共享：'pineforest/pine/m/{trunk|canopy}'）。 */
export function pineTierGeometryId(tier: PineTierId, part: 'trunk' | 'canopy'): string {
  return `pineforest/pine/${tier}/${part}`;
}

/**
 * 生成一档松树的干/冠几何（确定性形，同 id 复现）。
 * 冠=自下而上 radii 递减的 3–4 层 Cone（「树冠层叠」逐字落实）；干=收腰 Cylinder。
 * 三角预算：冠 ≤4×(7 侧+7 底)=56 + 干 ≤32 ≈ 90 tri ≪ §5.7 松树 ≤900 ✓。
 */
export function createPineTierGeometries(assets: SharedAssets, tier: PineTierId): PineTierGeometries {
  const spec = PINE_TIERS.find((t) => t.id === tier) ?? PINE_TIERS[1]!;
  const trunk = assets.geometry(pineTierGeometryId(tier, 'trunk'), () => {
    const h = spec.height * 0.42;
    const geo = new THREE.CylinderGeometry(0.055, 0.085, h, 7);
    geo.translate(0, h / 2, 0);
    return hardenEdges(geo);
  });

  const canopy = assets.geometry(pineTierGeometryId(tier, 'canopy'), () => {
    const parts: THREE.BufferGeometry[] = [];
    const topY = spec.height;
    const bottomY = spec.height * 0.3;
    const layers = spec.layers;
    for (let i = 0; i < layers; i++) {
      const t = i / (layers - 1); // 0 底层 → 1 顶层（档位层数 3/4，恒 ≥2）
      const y = bottomY + (topY - bottomY) * t;
      const layerH = (topY - bottomY) / layers + spec.height * 0.16;
      const radius = 1.05 * (1 - t * 0.62) * (0.72 + spec.height * 0.065);
      const cone = new THREE.ConeGeometry(radius, layerH, 7);
      cone.translate(0, y + layerH * 0.32, 0);
      parts.push(hardenEdges(cone));
    }
    const merged = mergeGeometries(parts);
    if (!merged) throw new Error(`[treePine] 树冠合并失败 ${tier}`);
    merged.computeVertexNormals();
    return merged;
  });

  const topY = spec.height;
  return { trunk, canopy, canopyTopY: topY };
}
