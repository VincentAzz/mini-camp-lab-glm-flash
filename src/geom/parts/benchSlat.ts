// docs/01-整体架构.md §3.2 geom/parts/benchSlat.ts —— 可复用部件库 benchSlat（板条长椅）。
// docs/02-场景模块.md §4.1.0：海崖首创，服务区复用（⑩「长椅 ×2 benchSlat 无靠背变体」）；
// 海崖 2.1.2-⑪「观景长椅（benchSlat，面海放置）」。
// 建模：座面 5 板条 + 靠背 3 板条（可关）+ 2 侧板架；板条各自 hardenEdges 后合并（mergeGeometries，
// §5.6「一次性异形小件同材质合并」）；材质经 ToonMaterialFactory wood/metal。
// ★ 禁止人形/人物几何（一.6）。T18 落点。
import * as THREE from 'three';
import type { SharedAssets } from '@/systems/handles';
import { toonMaterials } from '@/render/toonMaterial';
import { mergeGeometries, hardenEdges, roundedBox } from '@/geom/primitives';

export interface BenchParams {
  readonly assets: SharedAssets;
  /** 缓存 id（跨场景共享几何：'benchSlat/view'、'benchSlat/backless'…） */
  readonly id: string;
  /** 座面长（默认 1.7） */
  readonly length?: number;
  /** 带靠背（海崖观景长椅 true / 服务区无靠背变体 false） */
  readonly withBackrest?: boolean;
  /** 板条木色（默认海崖崖木 #a8825c） */
  readonly slatColor?: string;
  /** 板架金属色（默认深灰 #4a4a50） */
  readonly frameColor?: string;
}

/** 观景长椅（条板+侧架；原点在座面中心地面投影，面朝 +z 为靠背反向=观景方向）。 */
export function createBench(params: BenchParams): THREE.Group {
  const { assets, id } = params;
  const length = params.length ?? 1.7;
  const withBackrest = params.withBackrest ?? true;
  const group = new THREE.Group();
  group.name = id;

  // —— 板条组（单几何 1 DC；座 5 + 背 3）——
  const slatGeometries: THREE.BufferGeometry[] = [];
  const slatCount = 5;
  const slatDepth = 0.09;
  const slatGap = 0.022;
  const seatWidth = slatCount * slatDepth + (slatCount - 1) * slatGap; // ≈0.54
  for (let i = 0; i < slatCount; i++) {
    const slat = roundedBox({ width: length, height: 0.035, depth: slatDepth, radius: 0.008 });
    slat.translate(0, 0.42, -seatWidth / 2 + slatDepth / 2 + i * (slatDepth + slatGap));
    slatGeometries.push(hardenEdges(slat));
  }
  if (withBackrest) {
    for (let i = 0; i < 3; i++) {
      const slat = roundedBox({ width: length, height: 0.075, depth: 0.028, radius: 0.008 });
      slat.translate(0, 0.58 + i * 0.13, seatWidth / 2 + 0.05);
      slat.rotateX(-0.12);
      slatGeometries.push(hardenEdges(slat));
    }
  }
  const slatsMerged = mergeGeometries(slatGeometries);
  if (!slatsMerged) throw new Error(`[benchSlat] 板条合并失败 ${id}`);
  const slatMaterial = toonMaterials.get('wood', { color: params.slatColor ?? '#a8825c', name: `${id}/slats` });
  const slats = new THREE.Mesh(assets.geometry(`${id}/slats`, () => slatsMerged), slatMaterial);
  slats.name = `${id}/slats`;
  slats.castShadow = true;
  group.add(slats);

  // —— 侧板架（单几何 1 DC；两侧各 1 竖板 + 底横板 + 背撑）——
  const frameGeometries: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    const leg = roundedBox({ width: 0.05, height: 0.44, depth: seatWidth, radius: 0.01 });
    leg.translate(side * (length / 2 - 0.09), 0.22, 0);
    frameGeometries.push(hardenEdges(leg));
    const foot = roundedBox({ width: 0.06, height: 0.04, depth: seatWidth + 0.06, radius: 0.01 });
    foot.translate(side * (length / 2 - 0.09), 0.02, 0);
    frameGeometries.push(hardenEdges(foot));
    if (withBackrest) {
      const backProp = roundedBox({ width: 0.05, height: 0.5, depth: 0.045, radius: 0.01 });
      backProp.translate(side * (length / 2 - 0.09), 0.52, seatWidth / 2 + 0.05);
      backProp.rotateX(-0.12);
      frameGeometries.push(hardenEdges(backProp));
    }
  }
  const frameMerged = mergeGeometries(frameGeometries);
  if (!frameMerged) throw new Error(`[benchSlat] 板架合并失败 ${id}`);
  const frameMaterial = toonMaterials.get('metal', { color: params.frameColor ?? '#4a4a50', name: `${id}/frame` });
  const frame = new THREE.Mesh(assets.geometry(`${id}/frame`, () => frameMerged), frameMaterial);
  frame.name = `${id}/frame`;
  frame.castShadow = true;
  group.add(frame);

  return group;
}
