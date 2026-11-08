// docs/01-整体架构.md §3.2 geom/parts/vehicleKit/bikeFolding.ts —— 部件库二批：折叠自行车（已折叠态）。
// docs/03-车型模块.md §4.2.0 vehicleKit 表「bikeFolding：折叠自行车」；
// 使用者：A 型车尾自行车架载折叠自行车（§4.2.2【3.2-6】，架由调用方自建、本件只出车）。
// 折叠态读法：双轮并拢贴地、车架 Z 形折起、座管放倒、车把下折——「叠好的小包」而非骑行态。
// 输出约定：局部原点在双轮触地点中点；车长沿局部 X（折叠后约 0.62 长），竖直 +Y。
// ★ 禁止人形/人物几何（一.6）。
import * as THREE from 'three';
import { toonMaterials } from '@/render/toonMaterial';
import { hardenEdges, mergeGeometries } from '@/geom/primitives';

export interface BikeFoldingParams {
  /** 工厂材质/缓存 name 前缀 */
  readonly name: string;
  /** 车架色（缺省车橙 #d97b3f——draft 12 §4.1「架深灰/车橙」） */
  readonly frameColor?: string;
  /** 车轮半径（缺省 0.16，20 寸折叠车比例） */
  readonly wheelR?: number;
}

/** 折叠自行车组（双轮并拢+Z 形折架+放倒座管+下折车把），原点在轮触地点中点。 */
export function createBikeFolding(params: BikeFoldingParams): THREE.Group {
  const { name } = params;
  const wheelR = params.wheelR ?? 0.16;
  const group = new THREE.Group();
  group.name = `${name}/bike`;

  const frameMaterial = toonMaterials.get('paintTrim', { color: params.frameColor ?? '#d97b3f', name: `${name}/frame` });
  const darkMaterial = toonMaterials.get('matteProp', { color: '#3a3d42', outline: false, name: `${name}/dark` });
  const tireMaterial = toonMaterials.get('matteProp', { color: '#2b2b30', outline: false, name: `${name}/tire` });
  const seatMaterial = toonMaterials.get('matteProp', { color: '#4a4d52', outline: false, name: `${name}/seat` });

  /* —— 双轮并拢（同平面双轮沿车长向贴排，torus 环面 XY=竖直滚向面）—— */
  const wheelGeometry = mergeParts(`${name}/wheel`, [
    new THREE.TorusGeometry(wheelR, wheelR * 0.16, 6, 16),
    hubDisk(wheelR),
  ]);
  for (const x of [-wheelR * 0.9, wheelR * 0.9]) {
    const wheel = new THREE.Mesh(wheelGeometry, tireMaterial);
    wheel.name = `${name}/wheel/${x.toFixed(2)}`;
    wheel.position.set(x, wheelR, 0);
    wheel.castShadow = true;
    group.add(wheel);
  }

  /* —— Z 形折架：下管斜贴轮组 + 立管放倒 + 折叠铰链节点（单件合并=1 DC）—— */
  const frameGeometry = mergeParts(`${name}/frame`, [
    bar(0.34, 0.032, 1.25, -0.06, wheelR + 0.05), // 下管（贴轮组斜置）
    bar(0.30, 0.03, 0.5, 0.12, wheelR + 0.10), // 立管（放倒 60°+）
    bar(0.22, 0.028, -0.9, -0.16, wheelR + 0.14), // 后叉折回
    hingeNode(-0.06, wheelR + 0.16), // 折叠铰链块
    hingeNode(0.22, wheelR + 0.14), // 立管折点
  ]);
  const frame = new THREE.Mesh(frameGeometry, frameMaterial);
  frame.name = `${name}/folded-frame`;
  frame.castShadow = true;
  group.add(frame);

  /* —— 放倒座管 + 下折车把 + 脚踏（小件，noOutline）—— */
  const seatPost = new THREE.Mesh(bar(0.20, 0.024, 1.9, 0.16, wheelR + 0.22), darkMaterial);
  seatPost.name = `${name}/seat-post`; // 座管几乎放平（叠在车架上）
  seatPost.castShadow = true;
  group.add(seatPost);
  const saddle = new THREE.Mesh(hardenEdges(new THREE.BoxGeometry(0.16, 0.045, 0.075)), seatMaterial);
  saddle.name = `${name}/saddle`;
  saddle.position.set(0.22, wheelR + 0.26, 0);
  saddle.rotation.z = 0.5;
  saddle.castShadow = true;
  group.add(saddle);
  const stem = new THREE.Mesh(bar(0.16, 0.026, 2.2, -0.22, wheelR + 0.20), darkMaterial);
  stem.name = `${name}/stem`; // 车把立管下折贴前轮
  stem.castShadow = true;
  group.add(stem);
  const handlebar = new THREE.Mesh(hardenEdges(new THREE.CylinderGeometry(0.014, 0.014, 0.30, 8).rotateZ(Math.PI / 2)), darkMaterial);
  handlebar.name = `${name}/handlebar`;
  handlebar.position.set(-0.30, wheelR + 0.18, 0);
  handlebar.rotation.z = 0.9;
  handlebar.castShadow = true;
  group.add(handlebar);
  const pedalGeometry = hardenEdges(new THREE.BoxGeometry(0.02, 0.02, 0.09));
  for (const x of [-0.02, 0.08]) {
    const pedal = new THREE.Mesh(pedalGeometry, darkMaterial);
    pedal.name = `${name}/pedal/${x.toFixed(2)}`;
    pedal.position.set(x, wheelR + 0.03, 0.055);
    pedal.userData.noOutline = true; // 微小件 noOutline（§5.3 防碎线）
    group.add(pedal);
  }
  return group;
}

/** 圆盘毂（薄盘轴向 Z，配 torus 环面 XY）。 */
function hubDisk(wheelR: number): THREE.CylinderGeometry {
  return new THREE.CylinderGeometry(wheelR * 0.22, wheelR * 0.22, wheelR * 0.2, 8).rotateX(Math.PI / 2);
}

/** 圆截面杆件（长 len 沿局部 Y，绕 Z 斜置 eulerZ 后平移到 x/y）。 */
function bar(len: number, radius: number, eulerZ: number, x: number, y: number): THREE.CylinderGeometry {
  return new THREE.CylinderGeometry(radius, radius, len, 8).rotateZ(eulerZ).translate(x, y, 0);
}

function hingeNode(x: number, y: number): THREE.BoxGeometry {
  return new THREE.BoxGeometry(0.06, 0.06, 0.05).translate(x, y, 0);
}

/** 同构索引几何合并（Cylinder/Torus/Box 同 position/normal/uv 属性）+ 硬边。 */
function mergeParts(id: string, parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts);
  if (!merged) throw new Error(`[vehicleKit/bikeFolding] 合并失败：${id}`);
  return hardenEdges(merged);
}
