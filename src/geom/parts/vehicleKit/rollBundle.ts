// docs/01-整体架构.md §3.2 geom/parts/vehicleKit/rollBundle.ts —— 部件库首批：收拢布卷。
// docs/03-车型模块.md §4.2.0 vehicleKit 表「rollBundle：收拢布卷=Cylinder+两端扎带 torus」；
// 使用者：C 型升顶收拢卷帘 ×2（§4.2.1「楔前角，俯视可见升顶内」）/ B 型升顶（T26 复用）。
// 输出约定：卷轴沿局部 X（调用方按需 rotateY 转到车宽向）；卷中心在原点。
// ★ 禁止人形/人物几何（一.6）。
import * as THREE from 'three';
import type { SharedAssets } from '@/systems/handles';
import { mergeGeometries } from '@/geom/primitives';

export interface RollBundleParams {
  /** 卷长（局部 X 向） */
  readonly len: number;
  /** 卷半径（缺省 0.05，docs/03 定值） */
  readonly radius?: number;
  /** 扎带数（缺省 2，两端各一） */
  readonly straps?: number;
}

/** 收拢布卷几何（卷轴 X 向；布卷本体+两端扎带），经 assets.geometry 缓存。 */
export function createRollBundleGeometry(assets: SharedAssets, id: string, params: RollBundleParams): THREE.BufferGeometry {
  const len = params.len;
  const radius = params.radius ?? 0.05;
  const straps = params.straps ?? 2;
  return assets.geometry(`${id}|rollBundle|${len}|${radius}|${straps}`, () => {
    const parts: THREE.BufferGeometry[] = [];
    const body = new THREE.CylinderGeometry(radius, radius, len, 10);
    body.rotateZ(Math.PI / 2); // 轴 Y → 轴 X
    parts.push(body);
    for (let i = 0; i < straps; i++) {
      const t = straps === 1 ? 0.5 : i / (straps - 1);
      const strap = new THREE.TorusGeometry(radius * 1.12, radius * 0.14, 6, 12);
      strap.rotateY(Math.PI / 2); // 环轴 Z → 环轴 X（箍住卷体）
      strap.translate((t - 0.5) * len * 0.86, 0, 0);
      parts.push(strap);
    }
    const merged = mergeGeometries(parts);
    if (!merged) throw new Error(`[vehicleKit/rollBundle] 布卷合并失败：${id}`);
    return merged;
  });
}
