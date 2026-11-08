// docs/01-整体架构.md §3.2 geom/parts/servicearea/ —— 便利店店体（分商店段/食堂段）+ 发光招牌 + 餐饮大玻璃窗。
// docs/02-场景模块.md §4.1.4-②「便利店+发光招牌（店体 7.6×2.4×3.0 分商店段/食堂段；招牌灯箱
//   signText:stationHayabusa「STATION HAYABUSA／道の駅 はやぶさ」J6；LampHandle breath 6s depth 0.12
//   循环微闪+偶发双闪（EventScheduler 平均 20s±8s），均乘 shopPower）」；
// -⑤「餐饮区明亮大玻璃窗（大窗 3.0×1.5+分格条；窗内暖光内衬 emissive+吊灯 3 点+桌椅剪影 alpha 贴图，
//   无人形（一.6））」。
// 贴图：Canvas 2D 语义文字/图形（docs/04 §5.4 中值原则例外项）。★ 禁止人形/人物几何。T21 落点。
import * as THREE from 'three';
import type { SharedAssets } from '@/systems/handles';
import { toonMaterials } from '@/render/toonMaterial';
import { InstancedGroup } from '@/geom/instanced';
import { mergeGeometries, hardenEdges, roundedBox, lathe } from '@/geom/primitives';

export interface StoreBuildingParams {
  readonly assets: SharedAssets;
  /** 缓存 id 前缀（'store/servicearea'） */
  readonly id: string;
  /** 店体尺寸（2.4.2-② 定值 7.6×2.4×3.0） */
  readonly width?: number;
  readonly depth?: number;
  readonly height?: number;
  /** 招牌主文案（J6，signText:stationHayabusa） */
  readonly signLines?: readonly string[];
}

export interface StoreBuildingResult {
  readonly group: THREE.Group;
  /** 发光招牌灯箱面板材质（LampHandle breath 6s depth 0.12 的 emissiveMat；正面/窗内衬/吊灯共用） */
  readonly signMaterial: THREE.MeshToonMaterial;
  /** 餐饮大玻璃窗玻璃（α0.18 内衬暖光） */
  readonly diningWindow: THREE.Group;
  /** 雨棚/店檐（檐口滴水 drip 锚点世界坐标返回） */
  readonly eaveAnchors: readonly THREE.Vector3[];
  /** 店体顶板 mesh（roofTop 雪壳作用面挂点） */
  readonly roofMesh: THREE.Mesh;
  /** 侧门位置（送货小车清晨落位参考，世界局部坐标） */
  readonly sideDoorPosition: THREE.Vector3;
}

/** 招牌灯箱贴图：暖白底 + 深绿文字两行（EN/JP）+ emissiveMap 用同一张（文字亮、底微光）。 */
function paintSignTexture(id: string, lines: readonly string[], w: number, h: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = Math.round((h / w) * 512);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error(`[storeBuilding] 无法获取 2d 上下文 ${id}`);
  ctx.fillStyle = '#f2ead8';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#1f6e46';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold ${Math.round(canvas.height * 0.3)}px "Helvetica Neue", Arial, sans-serif`;
  ctx.fillText(lines[0] ?? 'STATION HAYABUSA', canvas.width / 2, canvas.height * 0.32);
  ctx.font = `${Math.round(canvas.height * 0.24)}px "Hiragino Sans", "Yu Gothic", "Noto Sans JP", sans-serif`;
  ctx.fillText(lines[1] ?? '道の駅 はやぶさ', canvas.width / 2, canvas.height * 0.7);
  ctx.strokeStyle = 'rgba(31,110,70,0.5)';
  ctx.lineWidth = 6;
  ctx.strokeRect(6, 6, canvas.width - 12, canvas.height - 12);
  const texture = new THREE.CanvasTexture(canvas);
  texture.name = `${id}/sign-tex`;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

/** 餐饮窗内桌椅剪影 alpha 贴图（无人形——只有桌面/椅背几何剪影，一.6 红线自查点）。 */
function paintCafeSilhouetteTexture(id: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error(`[storeBuilding] 无法获取 2d 上下文 ${id}`);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(58,44,36,0.82)';
  // 3 组「桌+两椅」剪影：桌面横条 + 桌腿 + 椅背竖条（几何剪影，无人体轮廓）
  for (const cx of [0.2, 0.5, 0.8]) {
    const x = cx * canvas.width;
    const tableY = canvas.height * 0.52;
    ctx.fillRect(x - 26, tableY, 52, 7); // 桌面
    ctx.fillRect(x - 3, tableY + 7, 6, canvas.height * 0.3); // 桌腿
    ctx.fillRect(x - 24, tableY - 20, 7, 30); // 左椅背
    ctx.fillRect(x + 17, tableY - 20, 7, 30); // 右椅背
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.name = `${id}/cafe-silhouette-tex`;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/**
 * 便利店店体：商店段（左半，玻璃门+橱窗）/ 食堂段（右半，餐饮大玻璃窗 3.0×1.5）。
 * 原点=店体底面中心；店体正面朝 +z。
 */
export function createStoreBuilding(params: StoreBuildingParams): StoreBuildingResult {
  const { assets, id } = params;
  const w = params.width ?? 7.6;
  const d = params.depth ?? 2.4;
  const h = params.height ?? 3.0;
  const group = new THREE.Group();
  group.name = id;

  const wallMaterial = toonMaterials.get('matteProp', { color: '#e9e5da', name: `${id}/wall` });
  const trimMaterial = toonMaterials.get('metal', { color: '#4a7fb5', name: `${id}/trim` });

  // —— 店体（墙板+檐口+雨棚窄条，1 DC；顶板单独 mesh 供 roofTop）——
  const roofGeometry = assets.geometry(`${id}/roof`, () =>
    hardenEdges(roundedBox({ width: w + 0.24, height: 0.16, depth: d + 0.2, radius: 0.03 })),
  );
  const roofMaterial = toonMaterials.get('concrete', { color: '#6e747c', name: `${id}/roof` });
  const roof = new THREE.Mesh(roofGeometry, roofMaterial);
  roof.name = `${id}/roof`;
  roof.position.y = h + 0.08;
  roof.castShadow = true;
  group.add(roof);

  const bodyGeometry = assets.geometry(`${id}/body`, () => {
    const parts: THREE.BufferGeometry[] = [];
    // 后墙/左右墙/正面上下墙裙（门窗开洞以贴面玻璃承担——不开真洞，正面上部 1.5 以下为贴面）
    const back = roundedBox({ width: w, height: h, depth: 0.12, radius: 0.01 });
    back.translate(0, h / 2, -d / 2 + 0.06);
    parts.push(hardenEdges(back));
    for (const side of [-1, 1]) {
      const wall = roundedBox({ width: 0.12, height: h, depth: d, radius: 0.01 });
      wall.translate(side * (w / 2 - 0.06), h / 2, 0);
      parts.push(hardenEdges(wall));
    }
    const frontLow = roundedBox({ width: w, height: 0.5, depth: 0.12, radius: 0.01 });
    frontLow.translate(0, 0.25, d / 2 - 0.06);
    parts.push(hardenEdges(frontLow));
    const frontTop = roundedBox({ width: w, height: h - 2.1, depth: 0.12, radius: 0.01 });
    frontTop.translate(0, (h + 2.1) / 2, d / 2 - 0.06);
    parts.push(hardenEdges(frontTop));
    // 分段立柱（商店段/食堂段分界 + 两端 3 根）
    for (const px of [-w / 2 + 0.14, -0.05, w / 2 - 0.14]) {
      const pier = roundedBox({ width: 0.2, height: h, depth: 0.16, radius: 0.015 });
      pier.translate(px, h / 2, d / 2 - 0.03);
      parts.push(hardenEdges(pier));
    }
    // 檐口条（正面）
    const eave = roundedBox({ width: w + 0.2, height: 0.14, depth: 0.3, radius: 0.02 });
    eave.translate(0, h - 0.07, d / 2 + 0.04);
    parts.push(hardenEdges(eave));
    const merged = mergeGeometries(parts);
    if (!merged) throw new Error(`[storeBuilding] 店体合并失败 ${id}`);
    return merged;
  });
  const body = new THREE.Mesh(bodyGeometry, wallMaterial);
  body.name = `${id}/body`;
  body.castShadow = true;
  group.add(body);

  // —— 商店段玻璃门+橱窗（glass 原型 α0.24 静态基准）——
  const glassMaterial = toonMaterials.get('glass', { color: '#9ab8c8', name: `${id}/glass` });
  const doorGeometry = assets.geometry(`${id}/door-glass`, () =>
    new THREE.PlaneGeometry(1.05, 1.6).translate(0, 1.05, 0),
  );
  const doorGlass = new THREE.Mesh(doorGeometry, glassMaterial);
  doorGlass.name = `${id}/door-glass`;
  doorGlass.position.set(-2.4, 0.5, d / 2 + 0.005);
  doorGlass.userData.noOutline = true;
  group.add(doorGlass);
  const shopWindowGeometry = assets.geometry(`${id}/shop-window`, () =>
    new THREE.PlaneGeometry(2.6, 1.35).translate(0, 1.0, 0),
  );
  const shopWindow = new THREE.Mesh(shopWindowGeometry, glassMaterial);
  shopWindow.name = `${id}/shop-window`;
  shopWindow.position.set(0.05, 0.5, d / 2 + 0.005);
  shopWindow.userData.noOutline = true;
  group.add(shopWindow);
  const doorFrameGeometry = assets.geometry(`${id}/door-frame`, () => {
    const parts: THREE.BufferGeometry[] = [];
    for (const px of [-0.56, 0.56]) {
      const stile = roundedBox({ width: 0.06, height: 1.66, depth: 0.05, radius: 0.01 });
      stile.translate(px, 1.05, 0);
      parts.push(hardenEdges(stile));
    }
    const head = roundedBox({ width: 1.2, height: 0.06, depth: 0.05, radius: 0.01 });
    head.translate(0, 1.9, 0);
    parts.push(hardenEdges(head));
    const merged = mergeGeometries(parts);
    if (!merged) throw new Error(`[storeBuilding] 门框合并失败 ${id}`);
    return merged;
  });
  const doorFrame = new THREE.Mesh(doorFrameGeometry, trimMaterial);
  doorFrame.name = `${id}/door-frame`;
  doorFrame.position.set(-2.4, 0.5, d / 2 + 0.01);
  group.add(doorFrame);

  // —— 餐饮区明亮大玻璃窗（3.0×1.5+分格条；窗内暖光内衬 emissive+吊灯 3 点+桌椅剪影，⑤）——
  const diningWindow = new THREE.Group();
  diningWindow.name = `${id}/dining-window`;
  diningWindow.position.set(w / 4, 0, d / 2 + 0.01);
  const diningGlassGeometry = assets.geometry(`${id}/dining-glass`, () =>
    new THREE.PlaneGeometry(3.0, 1.5).translate(0, 1.15, 0),
  );
  const diningGlassMaterial = toonMaterials.get('glass', { color: '#a8c4d0', opacity: 0.18, name: `${id}/dining-glass` });
  const diningGlass = new THREE.Mesh(diningGlassGeometry, diningGlassMaterial);
  diningGlass.name = `${id}/dining-glass`;
  diningGlass.userData.noOutline = true;
  diningWindow.add(diningGlass);
  const mullionGeometry = assets.geometry(`${id}/dining-mullions`, () => {
    const parts: THREE.BufferGeometry[] = [];
    for (const px of [-1.0, 0.0, 1.0]) {
      const bar = roundedBox({ width: 0.045, height: 1.5, depth: 0.04, radius: 0.008 });
      bar.translate(px, 1.15, 0.01);
      parts.push(hardenEdges(bar));
    }
    const bar = roundedBox({ width: 3.0, height: 0.045, depth: 0.04, radius: 0.008 });
    bar.translate(0, 1.15, 0.01);
    parts.push(hardenEdges(bar));
    const merged = mergeGeometries(parts);
    if (!merged) throw new Error(`[storeBuilding] 分格条合并失败 ${id}`);
    return merged;
  });
  const mullions = new THREE.Mesh(mullionGeometry, trimMaterial);
  mullions.name = `${id}/dining-mullions`;
  diningWindow.add(mullions);
  // 窗内暖光内衬（emissive——独立 name 键材质，同色同步由场景 lightHooks 按招牌灯输出驱动，均乘 shopPower）
  const innerGlowGeometry = assets.geometry(`${id}/dining-inner`, () =>
    new THREE.PlaneGeometry(2.9, 1.4).translate(0, 1.15, 0),
  );
  const innerGlowMaterial = toonMaterials.getToon('matteProp', {
    color: '#f2ead8',
    emissive: '#ffd9a0',
    emissiveIntensity: 1.5, // authored 基值：场景 update 按 signLamp 输出 × shopPower 同步（与招牌同源）
    name: `${id}/inner-glow`,
  });
  const innerGlow = new THREE.Mesh(innerGlowGeometry, innerGlowMaterial);
  innerGlow.name = `${id}/dining-inner`;
  innerGlow.position.z = -0.32;
  innerGlow.userData.noOutline = true;
  diningWindow.add(innerGlow);
  // 桌椅剪影 alpha 贴图（无人形）
  const silhouetteTexture = assets.texture(`${id}/cafe-silhouette-tex`, () => paintCafeSilhouetteTexture(id));
  const silhouetteMaterial = toonMaterials.get('matteProp', {
    color: '#3a2c24',
    map: silhouetteTexture,
    opacity: 0.999,
    name: `${id}/cafe-silhouette`,
  });
  const silhouette = new THREE.Mesh(
    assets.geometry(`${id}/cafe-silhouette`, () => new THREE.PlaneGeometry(2.9, 1.45).translate(0, 1.15, 0)),
    silhouetteMaterial,
  );
  silhouette.name = `${id}/cafe-silhouette`;
  silhouette.position.z = -0.24;
  silhouette.userData.noOutline = true;
  diningWindow.add(silhouette);
  // 吊灯 3 点（小 Lathe 灯罩+发光芯，与内衬同材质；InstancedGroup 1 DC）
  const pendantGeometry = assets.geometry(`${id}/pendant`, () => {
    const shade = lathe({
      profile: [
        [0.055, 0.07],
        [0.075, 0.035],
        [0.07, 0.0],
      ],
      segments: 10,
    });
    shade.translate(0, 1.95, 0);
    const stem = new THREE.CylinderGeometry(0.008, 0.008, 0.35, 6);
    stem.translate(0, 2.16, 0);
    return mergeGeometries([shade, stem])!;
  });
  const pendants = new InstancedGroup(pendantGeometry, innerGlow.material, {
    capacity: 3,
    name: `${id}/pendants`,
  });
  const tmpMatrix = new THREE.Matrix4();
  for (const px of [-0.9, 0.0, 0.9]) {
    tmpMatrix.identity().setPosition(px, 0, -0.28);
    pendants.add(tmpMatrix);
  }
  diningWindow.add(pendants.group);
  group.add(diningWindow);

  // —— 发光招牌灯箱（正面上方商店段；breath 6s depth 0.12）——
  const signW = 2.5;
  const signH = 0.58;
  const signTexture = assets.texture(`${id}/sign-tex`, () => paintSignTexture(id, params.signLines ?? ['STATION HAYABUSA', '道の駅 はやぶさ'], signW, signH));
  const signMaterial = toonMaterials.getToon('matteProp', {
    color: '#f2ead8',
    emissive: '#ffd9a0',
    emissiveIntensity: 1.5, // authored 基值：LightBreath 注册期快照后按 shopPower × breath 波形倍乘
    name: `${id}/sign-face`,
  });
  signMaterial.map = signTexture; // 唯一 name 缓存键实例 → 挂语义文字贴图（docs/04 §5.4）
  signMaterial.emissiveMap = signTexture; // 灯箱文字夜间透亮（发光文字）
  signMaterial.needsUpdate = true;
  const signBox = new THREE.Mesh(
    assets.geometry(`${id}/sign-box`, () => hardenEdges(roundedBox({ width: signW + 0.1, height: signH + 0.1, depth: 0.16, radius: 0.03 }))),
    toonMaterials.get('metal', { color: '#3c4650', name: `${id}/sign-box` }),
  );
  signBox.name = `${id}/sign-box`;
  signBox.position.set(-w / 4, 2.62, d / 2 + 0.06);
  signBox.castShadow = true;
  group.add(signBox);
  const signFace = new THREE.Mesh(
    assets.geometry(`${id}/sign-face`, () => new THREE.PlaneGeometry(signW, signH).translate(0, 2.62, 0)),
    signMaterial,
  );
  signFace.name = `${id}/sign-face`;
  signFace.position.set(-w / 4, 0, d / 2 + 0.15);
  signFace.userData.noOutline = true;
  group.add(signFace);

  // 檐口滴水锚点 ×2（雨棚檐——五-3「檐口 drip」；场景 emitter area 覆盖两锚点）
  const eaveAnchors = [
    new THREE.Vector3(-w / 2 + 0.4, h - 0.12, d / 2 + 0.12),
    new THREE.Vector3(w / 2 - 0.4, h - 0.12, d / 2 + 0.12),
  ];

  // 侧门（商店段西墙；送货小车清晨落位）
  const sideDoorPosition = new THREE.Vector3(-w / 2 - 0.02, 0, -0.3);
  const sideDoor = new THREE.Mesh(
    assets.geometry(`${id}/side-door`, () => new THREE.PlaneGeometry(0.9, 1.6).rotateY(-Math.PI / 2).translate(0, 1.05, 0)),
    glassMaterial,
  );
  sideDoor.name = `${id}/side-door`;
  sideDoor.position.set(-w / 2 + 0.01, 0.5, -0.3);
  sideDoor.userData.noOutline = true;
  group.add(sideDoor);

  return { group, signMaterial, diningWindow, eaveAnchors, roofMesh: roof, sideDoorPosition };
}
