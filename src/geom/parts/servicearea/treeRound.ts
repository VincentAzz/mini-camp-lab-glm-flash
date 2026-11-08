// docs/01-整体架构.md §3.2 geom/parts/servicearea/ —— 行道树 treeRound（圆冠树）。
// docs/02-场景模块.md §4.1.4-⑦「行道树 ×5+绿化带（treeRound 冠 2–3 球叠；叶片轻摆=P2 植被通道
//   7-4-⑤；树冠顶 roofTop）」+ §4.1.0 复用清单「treeRound（服务区）」。
// P2 植被风摆由场景装配层对 foliage 材质 injectVegetationWind（摆幅 ×0.8——行道树较规整，7.2.4-⑤）。
// 树冠积雪走 foliage 原型 snow:'up' 材质级遮罩（五-5「树枝 snowable」）。
// ★ 禁止人形/人物几何（一.6）。T21 落点。
import * as THREE from 'three';
import type { SharedAssets } from '@/systems/handles';
import { mergeGeometries, hardenEdges } from '@/geom/primitives';

export interface TreeRoundParams {
  readonly assets: SharedAssets;
  /** 缓存 id（'treeRound/servicearea'） */
  readonly id: string;
  /** 树高（默认 2.1） */
  readonly height?: number;
  /** 冠球叠数（2–3，默认 3） */
  readonly crownBalls?: 2 | 3;
  /** 随机形变种子（同 id 可复现的确定性形） */
  readonly seed: number;
}

export interface TreeRoundGeometryResult {
  /** 干（wood 材质实例组用） */
  readonly trunkGeometry: THREE.BufferGeometry;
  /** 冠（foliage 材质 + P2 植被风摆注入用；snowable='up' 树冠积雪走材质级遮罩） */
  readonly crownGeometry: THREE.BufferGeometry;
  /** 冠顶高（P2 heightU 与 roofTop 雪壳参考） */
  readonly crownTopY: number;
}

/**
 * 圆冠行道树几何：干（圆锥台）与冠（2–3 球叠，自下而上渐小、微偏移）拆两件——
 * 干 wood / 冠 foliage 分材质（P2 风摆只注冠材质，摆幅 ×0.8 由调用方传参）。
 */
export function createTreeRoundGeometry(params: TreeRoundParams): TreeRoundGeometryResult {
  const { assets, id } = params;
  const height = params.height ?? 2.1;
  const balls = params.crownBalls ?? 3;
  const trunkGeometry = assets.geometry(`${id}/trunk`, () => {
    const trunkH = height * 0.44;
    const trunk = new THREE.CylinderGeometry(height * 0.035, height * 0.055, trunkH, 7);
    trunk.translate(0, trunkH / 2, 0);
    return trunk; // 平滑圆锥台保持共享法线（§5.3）
  });
  const crownGeometry = assets.geometry(`${id}/crown`, () => {
    // 确定性形变（mulberry32——与 shared/rng 同式，本文件局部使用）
    let s = params.seed >>> 0;
    const rand = (): number => {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const parts: THREE.BufferGeometry[] = [];
    const crownBase = height * 0.4;
    const crownR = height * 0.3;
    for (let i = 0; i < balls; i++) {
      const f = i / Math.max(1, balls - 1); // 0 底 → 1 顶
      const r = crownR * (1 - f * 0.38);
      const ball = new THREE.IcosahedronGeometry(r, 1);
      // 顶点微扰（确定性）——树冠不求规整
      const pos = ball.getAttribute('position') as THREE.BufferAttribute;
      for (let v = 0; v < pos.count; v++) {
        const k = 1 + (rand() - 0.5) * 0.16;
        pos.setXYZ(v, pos.getX(v) * k, pos.getY(v) * k, pos.getZ(v) * k);
      }
      ball.computeVertexNormals();
      ball.translate(
        Math.sin(f * 2.6) * crownR * 0.18,
        crownBase + f * crownR * 0.95,
        Math.cos(f * 2.1) * crownR * 0.14,
      );
      parts.push(ball);
    }
    const merged = mergeGeometries(parts);
    if (!merged) throw new Error(`[treeRound] 冠几何合并失败 ${id}`);
    return hardenEdges(merged);
  });
  const crownTopY = height * 0.4 + height * 0.3 * 0.95 + height * 0.3 * (1 - 0.38); // 底球心+顶球心抬升+顶球半径
  return { trunkGeometry, crownGeometry, crownTopY };
}
