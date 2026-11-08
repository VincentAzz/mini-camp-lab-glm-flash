// docs/01-整体架构.md §3.2 geom/parts/bicycle.ts —— 可复用部件库 bicycle（小型折叠自行车）。
// docs/02-场景模块.md §4.1.0 复用清单「bicycle（03-车型模块.md 3.2/3.3 经 assets 取用）」；
// 海崖 2.1.2-⑧「小型折叠自行车」。docs/04 §5.7：细件分段低配；§5.6 合并减 DC。
// 建模：Torus 车轮 ×2（+辐条）+ 管架（Tube/Cylinder）+ 车把/车座/脚蹬/支架；无人物（骑车者不入画）。
// ★ 禁止人形/人物几何（一.6）。T18 落点。
import * as THREE from 'three';
import type { SharedAssets } from '@/systems/handles';
import { toonMaterials } from '@/render/toonMaterial';
import { mergeGeometries, hardenEdges, roundedBox } from '@/geom/primitives';

export interface FoldBicycleParams {
  readonly assets: SharedAssets;
  /** 缓存 id（跨场景共享几何与贴图；'bicycle/folding'） */
  readonly id: string;
  /** 车架色（默认海崖蓝 #3f6fa8） */
  readonly frameColor?: string;
  /** 拐立姿态：true 时车身略右倾靠支架（默认 true，停靠感） */
  readonly parked?: boolean;
}

/** 折叠自行车（整车 3 DC：轮组/车架/座把附件；原点=地面两轮接地点中点，车头朝 +z）。 */
export function createFoldBicycle(params: FoldBicycleParams): THREE.Group {
  const { assets, id } = params;
  const frameColor = params.frameColor ?? '#3f6fa8';
  const group = new THREE.Group();
  group.name = id;

  // —— 轮组（1 DC：前轮+后轮，Torus 胎 ×2 + 辐条盘 ×2 + 花鼓）——
  const wheelGeometry = assets.geometry(`${id}/wheels`, () => {
    const parts: THREE.BufferGeometry[] = [];
    for (const side of [-1, 1]) {
      const tire = new THREE.TorusGeometry(0.24, 0.038, 8, 22);
      tire.translate(side * 0.62, 0.27, 0);
      parts.push(hardenEdges(tire));
      const hub = new THREE.CylinderGeometry(0.045, 0.045, 0.08, 8);
      hub.rotateX(Math.PI / 2);
      hub.translate(side * 0.62, 0.27, 0);
      parts.push(hardenEdges(hub));
      for (let s = 0; s < 4; s++) {
        const spoke = new THREE.BoxGeometry(0.012, 0.4, 0.012);
        spoke.translate(0, 0, 0);
        spoke.rotateZ((s / 4) * Math.PI);
        spoke.translate(side * 0.62, 0.27, 0);
        parts.push(hardenEdges(spoke));
      }
    }
    const merged = mergeGeometries(parts);
    if (!merged) throw new Error(`[bicycle] 轮组合并失败 ${id}`);
    return merged;
  });
  const wheels = new THREE.Mesh(wheelGeometry, toonMaterials.get('metal', { color: '#33363c', name: `${id}/wheels` }));
  wheels.name = `${id}/wheels`;
  wheels.castShadow = true;
  group.add(wheels);

  // —— 车架（1 DC：折叠加固三角架）——
  const frameGeometry = assets.geometry(`${id}/frame`, () => {
    const parts: THREE.BufferGeometry[] = [];
    // 下管：五通 → 后轮
    const down = new THREE.CylinderGeometry(0.02, 0.018, 0.62, 8);
    down.translate(0, 0.31, 0);
    down.rotateZ(-1.06);
    down.translate(0.06, 0.28, 0);
    parts.push(hardenEdges(down));
    // 座管
    const seatTube = new THREE.CylinderGeometry(0.018, 0.02, 0.5, 8);
    seatTube.translate(0, 0.25, 0);
    seatTube.rotateZ(-0.28);
    seatTube.translate(-0.12, 0.24, 0);
    parts.push(hardenEdges(seatTube));
    // 头管 + 前叉
    const head = new THREE.CylinderGeometry(0.022, 0.022, 0.34, 8);
    head.translate(0, 0.17, 0);
    head.rotateZ(0.32);
    head.translate(-0.46, 0.16, 0);
    parts.push(hardenEdges(head));
    const fork = new THREE.CylinderGeometry(0.014, 0.014, 0.3, 8);
    fork.translate(0, 0.15, 0);
    fork.rotateZ(0.1);
    fork.translate(-0.62, 0.14, 0);
    parts.push(hardenEdges(fork));
    // 后上叉：座管顶 → 后轮
    const stay = new THREE.CylinderGeometry(0.014, 0.014, 0.72, 8);
    stay.translate(0, 0.36, 0);
    stay.rotateZ(1.18);
    stay.translate(-0.3, 0.32, 0);
    parts.push(hardenEdges(stay));
    // 折叠铰链块（中管中点小方块）
    const hinge = roundedBox({ width: 0.09, height: 0.07, depth: 0.06, radius: 0.012 });
    hinge.translate(0.02, 0.42, 0);
    parts.push(hardenEdges(hinge));
    const merged = mergeGeometries(parts);
    if (!merged) throw new Error(`[bicycle] 车架合并失败 ${id}`);
    return merged;
  });
  const frame = new THREE.Mesh(frameGeometry, toonMaterials.get('paintTrim', { color: frameColor, name: `${id}/frame` }));
  frame.name = `${id}/frame`;
  frame.castShadow = true;
  group.add(frame);

  // —— 座/把/蹬/支架（1 DC）——
  const trimGeometry = assets.geometry(`${id}/trim`, () => {
    const parts: THREE.BufferGeometry[] = [];
    // 车把横管 + 把立
    const bar = new THREE.CylinderGeometry(0.016, 0.016, 0.42, 8);
    bar.rotateZ(Math.PI / 2);
    bar.translate(-0.48, 0.66, 0);
    parts.push(hardenEdges(bar));
    const stem = new THREE.CylinderGeometry(0.016, 0.016, 0.18, 8);
    stem.translate(0, 0.09, 0);
    stem.rotateZ(0.32);
    stem.translate(-0.46, 0.52, 0);
    parts.push(hardenEdges(stem));
    // 车座
    const saddle = roundedBox({ width: 0.1, height: 0.035, depth: 0.24, radius: 0.014 });
    saddle.translate(-0.16, 0.55, 0);
    parts.push(hardenEdges(saddle));
    // 脚蹬 ×2 + 曲柄
    for (const phase of [0, Math.PI]) {
      const crank = new THREE.CylinderGeometry(0.01, 0.01, 0.16, 6);
      crank.translate(0, 0.08, 0);
      crank.rotateZ(Math.sin(phase) * 0.9);
      crank.translate(0.05, 0.27, 0);
      parts.push(hardenEdges(crank));
      const pedal = roundedBox({ width: 0.035, height: 0.02, depth: 0.09, radius: 0.006 });
      pedal.translate(0.05 + Math.sin(phase) * 0.07, 0.27 + Math.cos(phase) * 0.08, 0.06);
      parts.push(hardenEdges(pedal));
    }
    // 边支架（停靠斜杆）
    const kick = new THREE.CylinderGeometry(0.01, 0.01, 0.3, 6);
    kick.translate(0, 0.15, 0);
    kick.rotateZ(0.5);
    kick.translate(0.1, 0.02, 0.03);
    parts.push(hardenEdges(kick));
    const merged = mergeGeometries(parts);
    if (!merged) throw new Error(`[bicycle] 座把附件合并失败 ${id}`);
    return merged;
  });
  const trim = new THREE.Mesh(trimGeometry, toonMaterials.get('matteProp', { color: '#2f333a', name: `${id}/trim` }));
  trim.name = `${id}/trim`;
  trim.castShadow = true;
  group.add(trim);

  if (params.parked ?? true) {
    group.rotation.z = -0.09; // 停靠微倾
  }
  return group;
}
