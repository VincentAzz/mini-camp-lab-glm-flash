// docs/01-整体架构.md §3.2 geom/parts/vehicles/overlandTruck/ —— T27 越野皮卡专用部件：睡袋。
// docs/03-车型模块.md §4.2.0 vehicleKit 表「sleepingBag(state)：半卷态 Cylinder(0.14,0.7)+摊开舌 Plane」；
// draft 12-车型模块 §7.3「sleepingBag('half') 摊一半——后座床台上」。
// 输出约定：局部原点=袋体中心（躺平面内 X 长向），卷筒轴向沿 X；调用方给布料材质。
// ★ 禁止人形/人物几何（一.6）。
import * as THREE from 'three';
import type { SharedAssets } from '@/systems/handles';
import { hardenEdges, mergeGeometries } from '@/geom/primitives';

export type SleepingBagState = 'rolled' | 'half';

export interface SleepingBagParams {
  /** 摊开态：'half' 半卷（卷筒+摊开舌）/ 'rolled' 全卷 */
  readonly state?: SleepingBagState;
  /** 摊开舌长（缺省 0.62） */
  readonly tongueLength?: number;
  /** 卷筒长（缺省 0.7） */
  readonly rollLength?: number;
}

/** 睡袋几何：'half' = 半卷筒（Cylinder 半弧+平底）+摊开舌（微弯 Plane）。 */
export function createSleepingBagGeometry(assets: SharedAssets, id: string, params: SleepingBagParams = {}): THREE.BufferGeometry {
  const state = params.state ?? 'half';
  const rollLength = params.rollLength ?? 0.7;
  const tongueLength = params.tongueLength ?? 0.62;
  const cacheId = `${id}|${state}|${rollLength}|${tongueLength}`;
  return assets.geometry(cacheId, () => {
    const parts: THREE.BufferGeometry[] = [];
    if (state === 'rolled') {
      const roll = new THREE.CylinderGeometry(0.14, 0.14, rollLength, 12);
      roll.rotateZ(Math.PI / 2);
      parts.push(hardenEdges(roll));
    } else {
      // 半卷筒：上半弧 Cylinder（thetaLength π，轴向 X），平底由舌面衔接
      const roll = new THREE.CylinderGeometry(0.14, 0.14, rollLength, 12, 1, false, 0, Math.PI);
      roll.rotateZ(Math.PI / 2); // 轴 Y → 轴 X
      roll.rotateX(Math.PI); // 弧口朝下
      roll.translate(-tongueLength / 2 + 0.02, 0.14, 0);
      parts.push(hardenEdges(roll)); // 与摊开舌同为非索引几何（mergeGeometries 属性一致性，§5.6）
      // 摊开舌：微弯薄盒（比 Plane 厚一点有布感），从卷筒下缘伸出
      const tongue = hardenEdges(new THREE.BoxGeometry(tongueLength, 0.02, 0.52));
      tongue.translate(tongueLength / 2 - 0.02, 0.012, 0);
      parts.push(tongue);
    }
    const merged = mergeGeometries(parts);
    if (!merged) throw new Error(`[overlandTruck/sleepingBag] 合并失败：${cacheId}`);
    return merged;
  });
}
