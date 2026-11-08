// docs/01-整体架构.md §3.2 geom/parts/vehicleKit/wheel.ts —— 部件库首批：车轮工厂。
// docs/03-车型模块.md §4.2.0 vehicleKit 部件库表「wheel(r,w,kind)：胎=Cylinder+毂+5 辐条盒；
//   kind:'at' 加 18 只绕周凸块」；SharedAssets 引用计数跨车复用（同 id 共享，八.3）。
// 几何按材质分两组返回（胎/毂），调用方各自取材质并按 §5.6「同类 ≥3 必实例化」配 InstancedGroup。
// 轮轴朝向：本工厂输出轴 = 局部 Z（车宽向，docs/03 §4.2.0「+X=车头、+Z=左」），直接按轴向摆位。
// ★ 禁止人形/人物几何（一.6）。
import * as THREE from 'three';
import type { SharedAssets } from '@/systems/handles';
import { hardenEdges, mergeGeometries } from '@/geom/primitives';

export interface WheelParams {
  /** 胎外半径（u≈m；C 型 0.42 / 越野 0.50） */
  readonly radius: number;
  /** 胎宽（C 型 0.26 / 越野 0.34） */
  readonly width: number;
  /** 'road' 公路胎 / 'at' 全地形胎（18 只绕周凸块，docs/03 §4.2.0） */
  readonly kind?: 'road' | 'at';
  /** AT 凸块数（缺省 18——docs/03 定值） */
  readonly lugCount?: number;
}

export interface WheelGeometries {
  /** 胎体（含 AT 凸块；深灰胎面材质由调用方给） */
  readonly tire: THREE.BufferGeometry;
  /** 毂盘+5 辐条（银色毂材质由调用方给） */
  readonly hub: THREE.BufferGeometry;
}

/**
 * 车轮几何工厂：按 id 经 assets.geometry 缓存（同参数跨车共享同一份几何）。
 * 分段纪律（docs/04 §5.7「部件分段数在工厂写死」）：胎 20 段、毂 12 段，全低配。
 */
export function createWheelGeometries(assets: SharedAssets, id: string, params: WheelParams): WheelGeometries {
  const { radius, width } = params;
  const kind = params.kind ?? 'road';
  const lugCount = params.lugCount ?? 18;
  const cacheId = `${id}|${radius}|${width}|${kind}|${lugCount}`;

  const tire = assets.geometry(`${cacheId}/tire`, () => {
    const parts: THREE.BufferGeometry[] = [hardenEdges(new THREE.CylinderGeometry(radius, radius, width, 20))];
    if (kind === 'at') {
      // 18 只绕周凸块（T27 修复：Cylinder 轴=Y 时圆周在 XZ 面——凸块先沿 +Z 径向外推再绕 Y 均布；
      //  原实现沿轴向 +Y 平移导致 18 只同位堆叠在轴端，不构成绕周胎纹）
      const lugHeight = radius * 0.16;
      for (let i = 0; i < lugCount; i++) {
        const angle = (i / lugCount) * Math.PI * 2;
        const lug = new THREE.BoxGeometry(radius * 0.13, width * 0.92, lugHeight);
        lug.translate(0, 0, radius + lugHeight * 0.32);
        lug.rotateY(angle);
        parts.push(hardenEdges(lug)); // 全部件统一 toNonIndexed（mergeGeometries 索引一致性）
      }
    }
    const merged = mergeGeometries(parts);
    if (!merged) throw new Error(`[vehicleKit/wheel] 胎体合并失败：${cacheId}`);
    merged.rotateX(Math.PI / 2); // 轴 Y → 轴 Z（车宽向）
    return hardenEdges(merged);
  });

  const hub = assets.geometry(`${cacheId}/hub`, () => {
    const hubRadius = radius * 0.45;
    const parts: THREE.BufferGeometry[] = [hardenEdges(new THREE.CylinderGeometry(hubRadius, hubRadius, width * 0.72, 12))];
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2;
      const spoke = new THREE.BoxGeometry(hubRadius * 0.96, width * 0.34, radius * 0.11);
      spoke.translate(hubRadius * 0.48, 0, 0);
      spoke.rotateY(angle);
      parts.push(hardenEdges(spoke)); // 全部件统一 toNonIndexed（mergeGeometries 索引一致性）
    }
    const merged = mergeGeometries(parts);
    if (!merged) throw new Error(`[vehicleKit/wheel] 毂体合并失败：${cacheId}`);
    merged.rotateX(Math.PI / 2);
    return hardenEdges(merged);
  });

  return { tire, hub };
}
