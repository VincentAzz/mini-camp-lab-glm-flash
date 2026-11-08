// docs/01-整体架构.md §3.2 geom/parts/servicearea/ —— 高速路牌（门架式绿牌 + 单柱式出口预告牌）。
// docs/02-场景模块.md §4.1.4-⑨「高速路牌+出口指示牌（门架式绿牌「出口 12 ↑ E-1」+单柱式
//   「出口 E-28 まもなく」J6；牌面夜间微 emissive，LampHandle steady×shopPower×0.3）」。
// 贴图：Canvas 2D 绿底白字（高速牌语义图形——docs/04 §5.4 中值原则例外项）；emissiveMap 复用同贴图。
// ★ 禁止人形/人物几何（一.6）。T21 落点。
import * as THREE from 'three';
import type { SharedAssets } from '@/systems/handles';
import { toonMaterials } from '@/render/toonMaterial';
import { mergeGeometries, hardenEdges, roundedBox } from '@/geom/primitives';

export interface HighwaySignsParams {
  readonly assets: SharedAssets;
  /** 缓存 id 前缀（'hwsign/servicearea'） */
  readonly id: string;
  /** 门架式绿牌文案（J6：主行+副行） */
  readonly gantryLines?: readonly string[];
  /** 单柱式预告牌文案 */
  readonly poleLines?: readonly string[];
  /** 门架横梁高（默认 3.3） */
  readonly gantryHeight?: number;
  /** 门架跨度（z 向，跨公路；默认 2.35） */
  readonly gantrySpan?: number;
  /** 单柱式牌板高（默认 2.1） */
  readonly poleHeight?: number;
}

export interface HighwaySignsResult {
  readonly group: THREE.Group;
  /** 两块牌面共享的微 emissive 材质（LampHandle steady×shopPower×0.3） */
  readonly faceMaterial: THREE.MeshToonMaterial;
}

/** 高速绿牌贴图（绿底+白字+白色描边框；emissiveMap 同图——夜间微光沿字形）。 */
function paintGuideSignTexture(id: string, key: string, lines: readonly string[], wU: number, hU: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = Math.round((hU / wU) * 512);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error(`[highwaySigns] 无法获取 2d 上下文 ${id}/${key}`);
  ctx.fillStyle = '#1f6e46';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#f0f4f2';
  ctx.lineWidth = 8;
  ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);
  ctx.fillStyle = '#f0f4f2';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const mainH = (canvas.height * 0.56) / Math.max(1, lines.length);
  lines.forEach((line, li) => {
    const isLast = li === lines.length - 1;
    const fontSize = isLast && lines.length > 1 ? canvas.height * 0.3 : mainH * 0.78;
    ctx.font = `bold ${Math.round(fontSize)}px "Hiragino Sans", "Yu Gothic", "Noto Sans JP", "Helvetica Neue", sans-serif`;
    ctx.fillText(line, canvas.width / 2, canvas.height * (lines.length > 1 ? 0.3 : 0.5) + li * mainH);
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.name = `${id}/${key}`;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

/**
 * 门架式绿牌 + 单柱式预告牌组合。原点=门架地面中心（跨公路长轴沿 z）；
 * 门架牌面朝 −x（+x 向车流读牌）；单柱牌面朝 +x（−x 向车流读牌）——调用方摆位。
 */
export function createHighwaySigns(params: HighwaySignsParams): HighwaySignsResult {
  const { assets, id } = params;
  const group = new THREE.Group();
  group.name = id;
  const span = params.gantrySpan ?? 2.35;
  const gantryH = params.gantryHeight ?? 3.3;
  const poleH = params.poleHeight ?? 2.1;

  const steelMaterial = toonMaterials.get('metal', { color: '#7d858d', name: `${id}/steel` });

  // —— 牌面共享材质（夜间微 emissive；emissiveMap 挂各自贴图需独立实例——两块牌共用底色不同贴图：
  //    emissive 统一按同色微光，文字亮感由 emissiveMap=同贴图给出。两牌贴图不同 → 两实例，
  //    场景以主牌材质注册 LampHandle，update 同步副牌 emissiveIntensity。）——
  const gantryTexture = assets.texture(`${id}/gantry-tex`, () =>
    paintGuideSignTexture(id, 'gantry-tex', params.gantryLines ?? ['出口 12 ↑', 'E-1'], 2.6, 0.85),
  );
  const gantryFaceMaterial = toonMaterials.getToon('matteProp', {
    color: '#1f6e46',
    map: gantryTexture,
    emissive: '#bfd8c8',
    emissiveIntensity: 0.4, // authored 基值：LightBreath 按 shopPower×0.3 倍乘（夜间微光）
    name: `${id}/gantry-face`,
  });
  gantryFaceMaterial.emissiveMap = gantryTexture; // 字形微光（唯一 name 键实例，装配期改动安全）
  gantryFaceMaterial.needsUpdate = true;

  // —— 门架（双立柱+横梁，1 DC；立柱立于公路两侧路缘）——
  const gantryFrameGeometry = assets.geometry(`${id}/gantry-frame`, () => {
    const parts: THREE.BufferGeometry[] = [];
    for (const side of [-1, 1]) {
      const post = new THREE.CylinderGeometry(0.055, 0.07, gantryH, 10);
      post.translate(0, gantryH / 2, side * (span / 2 - 0.12));
      parts.push(post);
      const foot = roundedBox({ width: 0.26, height: 0.08, depth: 0.26, radius: 0.015 });
      foot.translate(0, 0.04, side * (span / 2 - 0.12));
      parts.push(hardenEdges(foot));
    }
    const beam = roundedBox({ width: 0.14, height: 0.16, depth: span, radius: 0.02 });
    beam.translate(0, gantryH - 0.35, 0);
    parts.push(hardenEdges(beam));
    const brace = roundedBox({ width: 0.1, height: 0.1, depth: span - 0.4, radius: 0.015 });
    brace.translate(0, gantryH - 0.62, 0);
    parts.push(hardenEdges(brace));
    // 索引/非索引混合不可合并——统一 non-indexed（cylinder 保共享平滑法线）
    const flatten = (geometry: THREE.BufferGeometry): THREE.BufferGeometry => (geometry.index !== null ? geometry.toNonIndexed() : geometry);
    const merged = mergeGeometries(parts.map(flatten));
    if (!merged) throw new Error(`[highwaySigns] 门架合并失败 ${id}`);
    return merged;
  });
  const gantryFrame = new THREE.Mesh(gantryFrameGeometry, steelMaterial);
  gantryFrame.name = `${id}/gantry-frame`;
  gantryFrame.castShadow = true;
  group.add(gantryFrame);

  // —— 门架牌（板体厚 0.07 沿 x、长 3.1 沿 z：牌面法线朝 ±x，长轴跨公路；双面贴图板面）——
  const gantryBoardGeometry = assets.geometry(`${id}/gantry-board`, () =>
    hardenEdges(roundedBox({ width: 0.07, height: 0.95, depth: 3.1, radius: 0.03 })),
  );
  const gantryBoard = new THREE.Mesh(gantryBoardGeometry, gantryFaceMaterial);
  gantryBoard.name = `${id}/gantry-board`;
  gantryBoard.position.set(0, gantryH - 0.9, 0);
  gantryBoard.castShadow = true;
  group.add(gantryBoard);
  const gantryFaceGeometry = assets.geometry(`${id}/gantry-face`, () => {
    const plane = new THREE.PlaneGeometry(3.1, 0.95);
    plane.rotateY(-Math.PI / 2); // 法线朝 −x（+x 向车流读牌）
    return plane;
  });
  const gantryFace = new THREE.Mesh(gantryFaceGeometry, gantryFaceMaterial);
  gantryFace.name = `${id}/gantry-face`;
  gantryFace.position.set(-0.042, gantryH - 0.9, 0);
  gantryFace.userData.noOutline = true;
  group.add(gantryFace);
  const gantryFaceBack = new THREE.Mesh(gantryFaceGeometry, gantryFaceMaterial);
  gantryFaceBack.name = `${id}/gantry-face-back`;
  gantryFaceBack.rotation.y = Math.PI; // 背面同图（−x 向车流读牌，文字不镜像）
  gantryFaceBack.position.set(0.042, gantryH - 0.9, 0);
  gantryFaceBack.userData.noOutline = true;
  group.add(gantryFaceBack);

  // —— 单柱式预告牌（立柱+0.85×0.5 板，牌面朝 +x）——
  const poleSignTexture = assets.texture(`${id}/pole-tex`, () =>
    paintGuideSignTexture(id, 'pole-tex', params.poleLines ?? ['出口 E-28', 'まもなく'], 1.6, 0.62),
  );
  const poleFaceMaterial = toonMaterials.getToon('matteProp', {
    color: '#1f6e46',
    map: poleSignTexture,
    emissive: '#bfd8c8',
    emissiveIntensity: 0.4,
    name: `${id}/pole-face`,
  });
  poleFaceMaterial.emissiveMap = poleSignTexture;
  poleFaceMaterial.needsUpdate = true;
  const polePost = new THREE.Mesh(
    assets.geometry(`${id}/pole-post`, () => {
      const post = new THREE.CylinderGeometry(0.045, 0.055, poleH, 8);
      post.translate(0, poleH / 2, 0);
      return post;
    }),
    steelMaterial,
  );
  polePost.name = `${id}/pole-post`;
  polePost.castShadow = true;
  group.add(polePost);
  const poleBoardGeometry = assets.geometry(`${id}/pole-board`, () =>
    hardenEdges(roundedBox({ width: 0.05, height: 0.62, depth: 1.6, radius: 0.02 })),
  );
  const poleBoard = new THREE.Mesh(poleBoardGeometry, poleFaceMaterial);
  poleBoard.name = `${id}/pole-board`;
  poleBoard.position.set(0, poleH - 0.38, 0);
  poleBoard.castShadow = true;
  group.add(poleBoard);
  const poleFaceGeometry = assets.geometry(`${id}/pole-face`, () => {
    const plane = new THREE.PlaneGeometry(1.6, 0.62);
    plane.rotateY(Math.PI / 2); // 法线朝 +x（−x 向车流读牌）
    return plane;
  });
  const poleFace = new THREE.Mesh(poleFaceGeometry, poleFaceMaterial);
  poleFace.name = `${id}/pole-face`;
  poleFace.position.set(0.03, poleH - 0.38, 0);
  poleFace.userData.noOutline = true;
  group.add(poleFace);

  return { group, faceMaterial: gantryFaceMaterial };
}
