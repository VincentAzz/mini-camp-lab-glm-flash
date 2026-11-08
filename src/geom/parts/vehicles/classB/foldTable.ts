// docs/01-整体架构.md §3.2 geom/parts/vehicles/classB/ —— T26 B型面包车专用部件：翻折小桌（半展开态）。
// docs/03-车型模块.md §4.2.4「foldTable 翻折小桌（半展开态：绕墙侧铰链转 85° 至水平=床板位）」+
//   draft 12-车型模块 §6.3「桌板 roundedBox(0.55,0.04,0.4) 绕墙侧铰链转 85° 至水平=床板位；
//   铰链支臂 2；卡座之间，一侧已放平」。
// 半展开=3.4-7 原文明确指定状态：桌板自竖直收拢位转过 85°（距水平差 5°，微垂未锁定读法），
//   与 bedCushionExt 半展同车呈现（「桌半折+垫半展」一车同现）。
// 输出约定：局部原点=铰链轴中点（贴墙）；桌板沿局部 −Z 展开（调用方把 −Z 对准车厢内）。
// ★ 禁止人形/人物几何（一.6）。
import * as THREE from 'three';
import type { SharedAssets } from '@/systems/handles';
import { toonMaterials } from '@/render/toonMaterial';
import { hardenEdges, roundedBox, tube } from '@/geom/primitives';

export interface FoldTableParams {
  readonly assets: SharedAssets;
  /** 缓存/日志 id */
  readonly id: string;
  /** 桌板长（沿铰链轴 X）与展开深（−Z）；draft 0.55×0.4 */
  readonly width?: number;
  readonly depth?: number;
  /** 半展开角（自竖直收拢位起转；85°=距水平差 5°，draft 定值） */
  readonly deployRad?: number;
  /** 工厂材质 name 前缀（缓存键） */
  readonly name: string;
}

export interface FoldTableResult {
  /** 桌组（铰链轴条+桌板+支臂 ×2+收拢桌腿 ×2；原点=铰链轴中点，桌板向局部 −Z 展开） */
  readonly group: THREE.Group;
  /** 桌板网格（smoke 勾验桌板近水平用） */
  readonly topMesh: THREE.Mesh;
  /** 半展开角 rad（诊断） */
  readonly deployRad: number;
}

/**
 * 翻折小桌（半展开）：铰链条贴墙（局部 +Z 为墙面）、桌板绕铰链轴转出 85°（水平差 5° 微垂）、
 * 两根折叠支臂斜撑桌板前缘、两条收拢桌腿叠贴桌板底（未支开——半展开读法）。
 */
export function createFoldTable(params: FoldTableParams): FoldTableResult {
  const { assets, id, name } = params;
  const width = params.width ?? 0.55;
  const depth = params.depth ?? 0.4;
  // 85° 自竖直位：桌板面法线自 +Z（贴墙竖直）转向 −Y 上方差 5°——桌板面向上、外缘微垂
  const deployRad = params.deployRad ?? ((85 * Math.PI) / 180);

  const group = new THREE.Group();
  group.name = `${id}/fold-table`;

  // —— 铰链条（贴墙横杆，沿 X）——
  const hingeMaterial = toonMaterials.get('metal', { color: '#6a6f76', outline: false, name: `${name}/hinge` });
  const hinge = new THREE.Mesh(
    assets.geometry(`${id}/hinge`, () => hardenEdges(new THREE.CylinderGeometry(0.022, 0.022, width, 8).rotateZ(Math.PI / 2))),
    hingeMaterial,
  );
  hinge.name = `${id}/hinge`;
  hinge.position.z = 0.02;
  group.add(hinge);

  // —— 桌板：绕铰链轴（X）转出 85°。以枢轴子组建模：桌板几何在「展开平态」（桌面朝上、
  //      外缘向 −Z），枢轴 rotation.x = −(π/2 − deployRad)·（自竖直位起算）——竖直收拢位时桌板
  //      面法线 +Z（贴墙）；转 85° 后法线接近 +Y（向上）差 5°。半展开=外缘略低于铰链端（微垂）。
  const topPivot = new THREE.Group();
  topPivot.name = `${id}/top-pivot`;
  topPivot.rotation.x = Math.PI / 2 - deployRad; // 竖直位（0）→ 水平位（π/2）；85° ⇒ 差 5° 微垂
  const topMesh = new THREE.Mesh(
    assets.geometry(`${id}/top|${width}|${depth}`, () => hardenEdges(roundedBox({ width, height: 0.035, depth, radius: 0.012 }))),
    toonMaterials.get('wood', { color: '#c9974f', name: `${name}/top` }),
  );
  topMesh.name = `${id}/top`;
  topMesh.position.set(0, 0.012, -depth / 2);
  topPivot.add(topMesh);

  // 收拢桌腿 ×2（叠贴桌板底、未支开——半展开读法）
  const legGeometry = assets.geometry(`${id}/leg`, () =>
    hardenEdges(roundedBox({ width: 0.045, height: 0.03, depth: depth - 0.08, radius: 0.01 })));
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(legGeometry, hingeMaterial);
    leg.name = `${id}/leg/${side}`;
    leg.position.set((side * (width - 0.1)) / 2, -0.024, -depth / 2 + 0.04);
    leg.rotation.x = Math.PI / 2 - 0.22; // 折叠上翻 12° 未落地的收拢态
    topPivot.add(leg);
  }
  group.add(topPivot);

  // —— 折叠支臂 ×2（墙座 → 桌板底前缘；随桌板同斜）——
  const armMaterial = hingeMaterial;
  for (const side of [-1, 1]) {
    const anchorY = -0.09;
    const anchorZ = 0.04;
    const tipY = Math.sin(Math.PI / 2 - deployRad) * -0.06 - 0.02; // 桌板底前缘近似点
    const tipZ = -depth + 0.05;
    const arm = new THREE.Mesh(
      assets.geometry(`${id}/arm`, () =>
        hardenEdges(
          tube({
            pointsOrCurve: [
              new THREE.Vector3(0, anchorY, anchorZ),
              new THREE.Vector3(0, (anchorY + tipY) / 2 + 0.015, (anchorZ + tipZ) / 2),
              new THREE.Vector3(0, tipY, tipZ),
            ],
            radius: 0.014,
            tubularSegments: 6,
          }),
        )),
      armMaterial,
    );
    arm.name = `${id}/arm/${side}`;
    arm.position.x = (side * (width - 0.12)) / 2;
    group.add(arm);
    // 墙座
    const mount = new THREE.Mesh(
      assets.geometry(`${id}/mount`, () => hardenEdges(new THREE.BoxGeometry(0.05, 0.07, 0.04))),
      armMaterial,
    );
    mount.name = `${id}/mount/${side}`;
    mount.position.set((side * (width - 0.12)) / 2, anchorY, anchorZ);
    group.add(mount);
  }

  return { group, topMesh, deployRad };
}
