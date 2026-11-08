// docs/01-整体架构.md §3.2 geom/parts/vehicles/classB/ —— T26 B型面包车专用部件：可变床结构（半展态）。
// docs/03-车型模块.md §4.2.4「bedCushionExt 可变床结构半展（座垫滑出 60%+靠背放倒衔接——
//   一车同现『桌半折+垫半展』）」+ draft 12-车型模块 §6.3「座垫盒向外滑出 60%+靠背垫放倒衔接；
//   另一侧保持卡座态」。
// 输出约定：局部原点=卡座座框中心（座框向局部 −Z 为展开方向——调用方把 −Z 对准车厢内/桌位）；
//   座垫盒滑出 60% 停在半途、靠背垫放倒平铺与座垫衔接（床板半成读法）；物件带 2~4° 随机偏角。
// ★ 禁止人形/人物几何（一.6）。
import * as THREE from 'three';
import type { SharedAssets } from '@/systems/handles';
import { toonMaterials } from '@/render/toonMaterial';
import { hardenEdges, roundedBox } from '@/geom/primitives';
import type { Rng } from '@/shared/rng';

export interface BedCushionExtParams {
  readonly assets: SharedAssets;
  /** 缓存/日志 id */
  readonly id: string;
  /** 座框长（沿 X）与座深（−Z 展开向）；对坐卡座单侧位 0.8×0.5 */
  readonly width?: number;
  readonly depth?: number;
  /** 滑出比例（60%——draft 定值） */
  readonly slideRatio?: number;
  /** 随机源（偏角/色相；种子由车型模块 fork 下发） */
  readonly rng: Rng;
  /** 软装色（芥末黄座垫 / 奶油靠背垫；3.4-12 色板） */
  readonly cushionColor: string;
  readonly backColor: string;
  /** 工厂材质 name 前缀（缓存键） */
  readonly name: string;
}

export interface BedCushionExtResult {
  /** 可变床组（座框+滑出座垫+放倒靠背垫+衔接枕；原点=座框中心，展开向局部 −Z） */
  readonly group: THREE.Group;
  /** 滑出座垫网格（smoke 勾验滑出量用） */
  readonly seatMesh: THREE.Mesh;
  /** 实际滑出比例（诊断） */
  readonly slideRatio: number;
}

/**
 * 可变床结构（半展）：座框固定、座垫盒沿 −Z 滑出 60%（半途悬停——床板未全抽出读法）、
 * 靠背垫自直立翻倒 90° 平铺与滑出座垫衔接、衔接枕一枚搭在接缝上；全部小件 noOutline。
 */
export function createBedCushionExt(params: BedCushionExtParams): BedCushionExtResult {
  const { assets, id, rng, name } = params;
  const width = params.width ?? 0.8;
  const depth = params.depth ?? 0.5;
  const slideRatio = params.slideRatio ?? 0.6;

  const group = new THREE.Group();
  group.name = `${id}/bed-cushion-ext`;

  // —— 座框（固定部分，木盒；滑轨读法：框沿两条亮轨条）——
  const frameMaterial = toonMaterials.get('wood', { color: '#a87e46', name: `${name}/frame` });
  const frameMesh = new THREE.Mesh(
    assets.geometry(`${id}/frame|${width}|${depth}`, () => hardenEdges(roundedBox({ width, height: 0.16, depth, radius: 0.02 }))),
    frameMaterial,
  );
  frameMesh.name = `${id}/frame`;
  frameMesh.position.y = -0.08;
  group.add(frameMesh);

  // —— 滑出座垫（芥末黄；滑出 60%——座垫中心自座框中心向 −Z 平移 0.6×depth）——
  const cushionMaterial = toonMaterials.get('cloth', { color: params.cushionColor, name: `${name}/seat` });
  const seatMesh = new THREE.Mesh(
    assets.geometry(`${id}/seat|${width}|${depth}`, () => hardenEdges(roundedBox({ width: width - 0.04, height: 0.11, depth, radius: 0.03 }))),
    cushionMaterial,
  );
  seatMesh.name = `${id}/seat`;
  seatMesh.position.set(rng.range(-0.015, 0.015), 0.035, -slideRatio * depth);
  seatMesh.rotation.y = rng.range(0.035, 0.07) * (rng.bool() ? 1 : -1); // 2~4° 手摆偏角
  group.add(seatMesh);

  // —— 靠背垫（放倒平铺：自靠背位翻倒 90°，平铺在座框靠墙侧向滑出座垫衔接）——
  const backMaterial = toonMaterials.get('cloth', { color: params.backColor, name: `${name}/back` });
  const backMesh = new THREE.Mesh(
    assets.geometry(`${id}/back|${width}`, () => hardenEdges(roundedBox({ width: width - 0.06, height: 0.1, depth: depth * 0.62, radius: 0.03 }))),
    backMaterial,
  );
  backMesh.name = `${id}/back`;
  // 本组约定 −Z 为展开向、+Z 为靠墙侧：放倒的靠背垫躺平在座框 +Z 侧（原靠背位），微倾衔接滑出座垫
  backMesh.position.set(rng.range(-0.012, 0.012), 0.1, depth * 0.34);
  backMesh.rotation.x = 0.12; // 放倒未完全贴平（半展读法差 7°）
  backMesh.rotation.z = rng.range(0.035, 0.07) * (rng.bool() ? 1 : -1);
  group.add(backMesh);

  // —— 衔接枕（搭在座垫与靠背垫接缝上，「垫半展」的视觉锚点）——
  const pillowMaterial = toonMaterials.get('cloth', { color: '#f3ead8', name: `${name}/pillow` });
  const pillow = new THREE.Mesh(
    assets.geometry(`${id}/pillow`, () => hardenEdges(roundedBox({ width: 0.3, height: 0.09, depth: 0.2, radius: 0.03 }))),
    pillowMaterial,
  );
  pillow.name = `${id}/pillow`;
  pillow.position.set(rng.range(-0.1, 0.1), 0.14, -slideRatio * depth + 0.14);
  pillow.rotation.y = rng.range(0.035, 0.07) * (rng.bool() ? 1 : -1);
  group.add(pillow);

  // —— 滑轨 ×2（座框沿外露亮轨条，滑出读法）——
  const railMaterial = toonMaterials.get('metal', { color: '#8a8f96', outline: false, name: `${name}/rail` });
  const railGeometry = assets.geometry(`${id}/rail`, () => hardenEdges(new THREE.BoxGeometry(0.03, 0.02, depth * (1 + slideRatio))));
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(railGeometry, railMaterial);
    rail.name = `${id}/rail/${side}`;
    rail.position.set((side * (width - 0.12)) / 2, -0.06, -depth * slideRatio * 0.5);
    group.add(rail);
  }

  group.traverse((object) => {
    object.userData.noOutline = true; // 内饰小件 noOutline（透窗防描边碎线）
  });

  return { group, seatMesh, slideRatio };
}
