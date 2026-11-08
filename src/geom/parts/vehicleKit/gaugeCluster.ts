// docs/01-整体架构.md §3.2 geom/parts/vehicleKit/gaugeCluster.ts —— 部件库首批：仪表组+方向盘。
// docs/03-车型模块.md §4.2.0 vehicleKit 表「gaugeCluster(style)：圆角盒面板+texDash 自发光贴图
//   +方向盘（torus+3 辐条）」；C 型 'warm'（§4.2.1）/ 拖挂皮卡 'cool'（§4.2.3）等复用。
// 输出约定：面板正对局部 +Z；方向盘环面正对 +Z（环面在 XY 平面）；screenMaterial 交
//   applyInteriorLight 调 color 标量（draft 12-车型模块 §2.4，D2 唯一驱动链）。
// ★ 禁止人形/人物几何（一.6）。
import * as THREE from 'three';
import { toonMaterials } from '@/render/toonMaterial';
import { roundedBox, hardenEdges } from '@/geom/primitives';

export interface GaugeClusterParams {
  /** 'warm' 暖橙刻度（C 型）/'cool' 冷青刻度（皮卡仪表，texDash 色相参数化由贴图承担） */
  readonly style?: 'warm' | 'cool';
  /** 仪表贴图（texDash，调用方经 assets.texture 生成；色相按 style 参数化） */
  readonly map: THREE.Texture;
  /** 工厂材质 name（缓存键） */
  readonly name: string;
  /** 面板尺寸（缺省 0.34×0.16，docs/03 C 型定值） */
  readonly panel?: { readonly width: number; readonly height: number };
  /** 方向盘半径（缺省 0.09，docs/03 C 型定值） */
  readonly wheelRadius?: number;
}

export interface GaugeClusterResult {
  /** 面板组（仪表面板+屏面+方向盘+转向柱；正对 +Z，原点在面板中心） */
  readonly group: THREE.Group;
  /** 仪表屏材质（MeshBasicMaterial+texDash；applyInteriorLight 调 color 标量） */
  readonly screenMaterial: THREE.MeshBasicMaterial;
}

export function createGaugeCluster(params: GaugeClusterParams): GaugeClusterResult {
  const { map, name } = params;
  const panelW = params.panel?.width ?? 0.34;
  const panelH = params.panel?.height ?? 0.16;
  const wheelR = params.wheelRadius ?? 0.09;
  const group = new THREE.Group();
  group.name = `${name}/cluster`;

  const bezelMaterial = toonMaterials.get('matteProp', { color: '#2e3238', outline: false, name: `${name}/bezel` });
  const panel = new THREE.Mesh(roundedBox({ width: panelW, height: panelH, depth: 0.045, radius: 0.015 }), bezelMaterial);
  panel.name = `${name}/panel`;
  panel.userData.noOutline = true; // 小件 noOutline（docs/03 §4.2.0）
  group.add(panel);

  // emissiveLamp 原型恒返回 MeshBasicMaterial（toonMaterial.ts buildEmissive）——收窄标注
  const screenMaterial = toonMaterials.get('emissiveLamp', { color: '#ffffff', map, name: `${name}/screen` }) as THREE.MeshBasicMaterial;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(panelW * 0.86, panelH * 0.74), screenMaterial);
  screen.name = `${name}/screen`;
  screen.position.set(0, panelH * 0.06, 0.024);
  screen.userData.noOutline = true;
  screen.renderOrder = 5;
  group.add(screen);

  // —— 方向盘：torus 环 + 3 辐条 + 中心毂 + 转向柱（柱向后下斜，被座椅区遮挡无妨）——
  const wheelMaterial = toonMaterials.get('matteProp', { color: '#3a3d42', outline: false, name: `${name}/wheel` });
  const rim = new THREE.Mesh(hardenEdges(new THREE.TorusGeometry(wheelR, wheelR * 0.13, 6, 14)), wheelMaterial);
  rim.name = `${name}/rim`;
  rim.position.set(0, -panelH * 0.85, 0.055); // 环面在 XY 平面（正对 +Z），悬于面板下前方
  rim.userData.noOutline = true;
  group.add(rim);
  const spokeGeometry = hardenEdges(new THREE.BoxGeometry(wheelR * 1.72, wheelR * 0.13, wheelR * 0.13));
  for (const angle of [Math.PI / 2, Math.PI / 2 + (Math.PI * 2) / 3, Math.PI / 2 + (Math.PI * 4) / 3]) {
    const spoke = new THREE.Mesh(spokeGeometry, wheelMaterial);
    spoke.name = `${name}/spoke`;
    spoke.position.copy(rim.position);
    spoke.rotation.z = angle;
    spoke.userData.noOutline = true;
    group.add(spoke);
  }
  const hub = new THREE.Mesh(hardenEdges(new THREE.CylinderGeometry(wheelR * 0.22, wheelR * 0.22, wheelR * 0.2, 8)), wheelMaterial);
  hub.name = `${name}/hub`;
  hub.rotation.x = Math.PI / 2;
  hub.position.copy(rim.position);
  hub.userData.noOutline = true;
  group.add(hub);
  const column = new THREE.Mesh(hardenEdges(new THREE.CylinderGeometry(wheelR * 0.14, wheelR * 0.16, wheelR * 1.5, 8)), wheelMaterial);
  column.name = `${name}/column`;
  column.position.set(0, rim.position.y - wheelR * 0.6, -wheelR * 0.4);
  column.rotation.x = 1.05; // 柱向后下斜
  column.userData.noOutline = true;
  group.add(column);

  void params.style; // style 语义由贴图色相承担（texDash 参数化），几何无分支
  return { group, screenMaterial };
}
