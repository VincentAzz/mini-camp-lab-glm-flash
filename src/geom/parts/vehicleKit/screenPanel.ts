// docs/01-整体架构.md §3.2 geom/parts/vehicleKit/screenPanel.ts —— 部件库首批：车载屏幕面板。
// docs/03-车型模块.md §4.2.0 vehicleKit 表「screenPanel：薄盒+MeshBasicMaterial(CanvasTexture)」；
// draft 12-车型模块 §2.4「屏幕类统一 MeshBasicMaterial+CanvasTexture（不受光照、天然『亮着』），
//   钩子只调制 material.color 标量」——screenMaterial 交车型 applyInteriorLight 消费（D2 唯一驱动链）。
// 输出约定：面板正对局部 +Z（调用方旋转朝向）；屏幕面为 emissiveLamp 原型（工厂 MeshBasicMaterial）。
// ★ 禁止人形/人物几何（一.6）。
import * as THREE from 'three';
import { toonMaterials } from '@/render/toonMaterial';
import { roundedBox } from '@/geom/primitives';

export interface ScreenPanelParams {
  /** 屏幕显示区宽（不含边框） */
  readonly width: number;
  /** 屏幕显示区高 */
  readonly height: number;
  /** 屏面贴图（CanvasTexture，texScreenNav/texScreenMap 等，调用方经 assets.texture 生成） */
  readonly map: THREE.Texture;
  /** 边框色（缺省仪表深灰） */
  readonly bezelColor?: string;
  /** 工厂材质 name（缓存键；同屏跨车共享由调用方保证唯一） */
  readonly name: string;
}

export interface ScreenPanelResult {
  /** 面板组（边框薄盒+屏面；正对 +Z，原点在屏面中心） */
  readonly group: THREE.Group;
  /** 屏面材质（MeshBasicMaterial+map；applyInteriorLight 调 color 标量，draft §2.4） */
  readonly screenMaterial: THREE.MeshBasicMaterial;
}

export function createScreenPanel(params: ScreenPanelParams): ScreenPanelResult {
  const { width, height, map, name } = params;
  const group = new THREE.Group();
  group.name = `${name}/panel`;

  const bezelMaterial = toonMaterials.get('matteProp', { color: params.bezelColor ?? '#2e3238', outline: false, name: `${name}/bezel` });
  const bezel = new THREE.Mesh(roundedBox({ width: width + 0.05, height: height + 0.05, depth: 0.04, radius: 0.012 }), bezelMaterial);
  bezel.name = `${name}/bezel`;
  bezel.userData.noOutline = true; // 小件 noOutline（docs/03 §4.2.0「内饰小件一律 noOutline」）
  group.add(bezel);

  // emissiveLamp 原型恒返回 MeshBasicMaterial（toonMaterial.ts buildEmissive）——收窄标注
  const screenMaterial = toonMaterials.get('emissiveLamp', { color: '#ffffff', map, name: `${name}/screen` }) as THREE.MeshBasicMaterial;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(width, height), screenMaterial);
  screen.name = `${name}/screen`;
  screen.position.z = 0.021;
  screen.userData.noOutline = true;
  screen.renderOrder = 5; // 屏面自发光面（§5.6：不透明本体 0 与玻璃 10 之间）
  group.add(screen);

  return { group, screenMaterial };
}
