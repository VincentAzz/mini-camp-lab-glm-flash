// docs/01-整体架构.md §3.2 geom/parts/vehicles/trailerRig/sleepingBag.ts —— T25 部件：后座睡袋（半卷态）。
// docs/03-车型模块.md §4.2.0 vehicleKit 表「sleepingBag(state)」+ §4.2.3【3.3-11】「rearSleepingBag 后座
//   睡袋（半卷态）」；draft 12-车型模块 §5.4 行「sleepingBag('half') 横放后座」。
// 输出约定：原点=睡袋底面中心，长轴沿局部 X；'half'=平铺段+半卷筒（卷轴 X）+双扎带。
// ★ 禁止人形/人物几何（一.6）。
import * as THREE from 'three';
import type { Rng } from '@/shared/rng';
import type { SharedAssets } from '@/systems/handles';
import { toonMaterials } from '@/render/toonMaterial';
import { hardenEdges, mergeGeometries, roundedBox } from '@/geom/primitives';

export interface SleepingBagParams {
  /** 'half'=半卷态（本车）；保留 state 形参对齐 vehicleKit 表 sleepingBag(state) 签名 */
  readonly state?: 'half' | 'flat';
  /** 平铺段长（缺省 0.52） */
  readonly flatLength?: number;
  /** 卷筒半径（缺省 0.09） */
  readonly rollRadius?: number;
  /** 工厂几何/材质缓存键前缀 */
  readonly name: string;
}

/** 睡袋（半卷态）：平铺段+半卷筒+双扎带；原点底面中心，长轴 +X（卷筒在 −X 端）。 */
export function createSleepingBag(assets: SharedAssets, rng: Rng, params: SleepingBagParams): THREE.Group {
  const { name } = params;
  const flatLength = params.flatLength ?? 0.52;
  const rollRadius = params.rollRadius ?? 0.09;
  void params.state; // 几何按 'half' 构建（本部件唯一使用形态），签名保留对齐 vehicleKit 表

  const group = new THREE.Group();
  group.name = `${name}/sleeping-bag`;
  const shellMaterial = toonMaterials.get('cloth', { color: '#5a7d8a', name: `${name}/bag-shell` });
  const strapMaterial = toonMaterials.get('matteProp', { color: '#3a3d42', outline: false, name: `${name}/bag-strap` });

  const bodyGeometry = assets.geometry(`${name}|bag-body`, () => {
    const flat = roundedBox({ width: flatLength, height: 0.075, depth: 0.34, radius: 0.03 });
    flat.translate(flatLength / 2 - 0.02, 0.0375, 0); // 平铺段（+X 侧）
    // 半卷筒（−X 端）：Cylinder 轴 X + 内藏卷芯
    const roll = new THREE.CylinderGeometry(rollRadius, rollRadius, 0.34, 12);
    roll.rotateZ(Math.PI / 2); // 轴 Y → X
    roll.translate(-rollRadius * 0.9, rollRadius, 0);
    const flap = roundedBox({ width: 0.1, height: 0.02, depth: 0.34, radius: 0.008 });
    flap.translate(-rollRadius * 1.6, rollRadius * 0.4, 0);
    const merged = mergeGeometries([hardenEdges(flat), hardenEdges(roll), hardenEdges(flap)]);
    if (!merged) throw new Error(`[trailerRig/sleepingBag] 睡袋合并失败：${name}`);
    return merged;
  });
  const body = new THREE.Mesh(bodyGeometry, shellMaterial);
  body.name = `${name}/sleeping-bag/body`;
  body.castShadow = true;
  group.add(body);

  const strapGeometry = assets.geometry(`${name}|bag-strap`, () => hardenEdges(new THREE.TorusGeometry(rollRadius * 1.08, 0.012, 6, 12)));
  for (const x of [-rollRadius * 0.55, -rollRadius * 1.45]) {
    const strap = new THREE.Mesh(strapGeometry, strapMaterial);
    strap.name = `${name}/sleeping-bag/strap/${x.toFixed(2)}`;
    strap.rotation.y = Math.PI / 2; // 环面 YZ → 箍住 X 向卷筒
    strap.position.set(x, rollRadius, 0);
    strap.rotation.y += rng.range(-0.04, 0.04);
    group.add(strap);
  }
  return group;
}
