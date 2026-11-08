// docs/01-整体架构.md §3.2 geom/parts/vehicles/overlandTruck/ —— T27 越野皮卡专用部件：LED 灯串。
// docs/03-车型模块.md §4.2.0 vehicleKit 表「ledString(points[], bulbs)：TubeGeometry 灯线(0.008)+
//   灯泡 InstancedMesh 球(0.03)」；draft 12-车型模块 §7.1「帐篷边 LED 灯串沿下壳外缘 10 灯」（§7.4 灯光主角）。
// 输出约定：灯线沿 points 折线扫掠（平滑 CatmullRom）；灯泡几何+逐灯矩阵返回——灯泡 InstancedMesh 由
//   调用方配 emissive 材质组装（authored 基值/LampHandle 归车型模块，部件不持灯材质）。
// ★ 禁止人形/人物几何（一.6）。
import * as THREE from 'three';
import type { SharedAssets } from '@/systems/handles';
import { tube } from '@/geom/primitives';

export interface LedStringParams {
  /** 灯线路径途经点（首尾相接由调用方保证形状） */
  readonly points: readonly THREE.Vector3[];
  /** 灯泡数（10——draft 定值） */
  readonly bulbs: number;
  /** 灯线半径（缺省 0.008） */
  readonly wireRadius?: number;
  /** 灯泡半径（缺省 0.032） */
  readonly bulbRadius?: number;
}

export interface LedStringParts {
  /** 灯线管几何（深灰线材材质由调用方给） */
  readonly wireGeometry: THREE.BufferGeometry;
  /** 灯泡球几何（emissive 材质由调用方给） */
  readonly bulbGeometry: THREE.BufferGeometry;
  /** 逐灯矩阵（沿折线均匀分布，泡心略低于线） */
  readonly bulbMatrices: readonly THREE.Matrix4[];
}

/** LED 灯串：灯线 Tube + 灯泡球与逐灯矩阵。 */
export function createLedStringParts(assets: SharedAssets, id: string, params: LedStringParams): LedStringParts {
  const { points, bulbs } = params;
  const wireRadius = params.wireRadius ?? 0.008;
  const bulbRadius = params.bulbRadius ?? 0.032;
  const cacheId = `${id}|${bulbs}|${wireRadius}|${bulbRadius}|${points.length}`;
  const wireGeometry = assets.geometry(`${cacheId}/wire`, () =>
    tube({ pointsOrCurve: [...points], radius: wireRadius, tubularSegments: Math.max(16, points.length * 6), radialSegments: 6 }),
  );
  const bulbGeometry = assets.geometry(`${cacheId}/bulb`, () => new THREE.SphereGeometry(bulbRadius, 8, 6));
  // 逐灯矩阵：按折线累计弧长均匀取样，泡心垂坠 0.02（灯线挂灯读法）
  const curve = new THREE.CatmullRomCurve3([...points], false, 'catmullrom', 0.5);
  const matrices: THREE.Matrix4[] = [];
  for (let i = 0; i < bulbs; i++) {
    const t = bulbs === 1 ? 0.5 : i / (bulbs - 1);
    const p = curve.getPointAt(Math.min(0.999, Math.max(0.001, t)));
    const matrix = new THREE.Matrix4().makeTranslation(p.x, p.y - 0.024, p.z);
    matrices.push(matrix);
  }
  return { wireGeometry, bulbGeometry, bulbMatrices: matrices };
}
