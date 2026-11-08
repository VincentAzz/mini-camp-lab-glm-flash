// docs/01-整体架构.md §3.2 geom/parts/signBoard.ts —— 可复用部件库 signBoard（路牌/立式指示牌）。
// docs/02-场景模块.md §4.1.0 复用清单「signBoard」；海崖 2.1.2-⑫「路牌 signBoard 双板；
//   文字「潮見岬／Shiomi-misaki」「Sea Cliff Camp →」（J6）」。
// 贴图：Canvas 2D 文字（docs/04 §5.4 ①「图案绘制类——招牌灯箱、路牌」用系统字体栈；文案由场景传入，
//   后续场景增多时集中 tex/signageTexts.ts 常量表）。语义图形（文字）可烘色，底面近白中值。
// ★ 禁止人形/人物几何（一.6）；警示牌不用骷髅图形。T18 落点。
import * as THREE from 'three';
import type { SharedAssets } from '@/systems/handles';
import { toonMaterials } from '@/render/toonMaterial';
import { hardenEdges, roundedBox } from '@/geom/primitives';

export interface SignBoardFace {
  /** 主文案行（如「潮見岬」） */
  readonly lines: readonly string[];
  /** 副文案行（如「Shiomi-misaki」，更小字号） */
  readonly subLines?: readonly string[];
  /** 箭头方向（'left'|'right'|null，默认无） */
  readonly arrow?: 'left' | 'right' | null;
  /** 板底色（默认近白 #f0ede4） */
  readonly ground?: string;
  /** 文字色（默认深灰蓝 #35404e） */
  readonly ink?: string;
}

export interface SignBoardParams {
  readonly assets: SharedAssets;
  /** 缓存 id（同 id 几何/贴图共享） */
  readonly id: string;
  /** 各面板文案（数量=板数，海崖双板） */
  readonly faces: readonly SignBoardFace[];
  /** 立柱高（默认 1.35） */
  readonly postHeight?: number;
  /** 面板尺寸（默认 0.72×0.34×0.05） */
  readonly faceWidth?: number;
  readonly faceHeight?: number;
}

/** 立式路牌：单柱 + 双向面板（板面沿 ±x 朝外）。原点=地面中心。 */
export function createSignBoard(params: SignBoardParams): THREE.Group {
  const { assets, id } = params;
  const faceWidth = params.faceWidth ?? 0.72;
  const faceHeight = params.faceHeight ?? 0.34;
  const postHeight = params.postHeight ?? 1.35;
  const group = new THREE.Group();
  group.name = id;

  // —— 立柱（金属细管，1 DC）——
  const postGeometry = assets.geometry(`${id}/post`, () => {
    const post = new THREE.CylinderGeometry(0.028, 0.032, postHeight, 8);
    post.translate(0, postHeight / 2, 0);
    return hardenEdges(post);
  });
  const postMaterial = toonMaterials.get('metal', { color: '#5a5f66', name: `${id}/post` });
  const post = new THREE.Mesh(postGeometry, postMaterial);
  post.name = `${id}/post`;
  post.castShadow = true;
  group.add(post);

  // —— 面板（每板 1 DC：板体 + 同尺寸 Canvas 文字贴图面）——
  const bodyMaterial = toonMaterials.get('matteProp', { color: '#e8e2d4', name: `${id}/body` });
  params.faces.forEach((face, i) => {
    const side = i === 0 ? 1 : -1; // 第一板朝 +x，其余朝 −x（双板对置）
    const bodyGeometry = assets.geometry(`${id}/face-body`, () => {
      const slab = roundedBox({ width: faceWidth, height: faceHeight, depth: 0.05, radius: 0.015 });
      slab.translate(0, postHeight - 0.08, 0);
      return hardenEdges(slab);
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.name = `${id}/face-${i}`;
    body.castShadow = true;
    const faceRoot = new THREE.Group();
    faceRoot.name = `${id}/face-root-${i}`;
    faceRoot.rotation.y = side * Math.PI * 0.5; // 板面法线朝 ±x
    faceRoot.position.x = side * 0.026;
    faceRoot.add(body);

    const texture = assets.texture(`${id}/face-tex-${i}`, () =>
      paintSignFaceTexture(id, i, face, faceWidth, faceHeight),
    );
    const plateGeometry = assets.geometry(`${id}/face-plate`, () => {
      const plane = new THREE.PlaneGeometry(faceWidth * 0.94, faceHeight * 0.86);
      plane.translate(0, postHeight - 0.08, 0.028);
      return plane;
    });
    const plateMaterial = toonMaterials.get('matteProp', {
      color: '#ffffff',
      map: texture,
      opacity: 0.999, // 借 opacity<1 打开 transparent，map alpha 承载圆角底形
      name: `${id}/face-plate-${i}`,
    });
    const plate = new THREE.Mesh(plateGeometry, plateMaterial);
    plate.name = `${id}/face-plate-${i}`;
    faceRoot.add(plate);
    group.add(faceRoot);
  });

  return group;
}

/** 牌面贴图：近白底 + 语义文字（中值原则例外项，docs/04 §5.4；系统字体栈）。 */
function paintSignFaceTexture(id: string, index: number, face: SignBoardFace, wU: number, hU: number): THREE.CanvasTexture {
  const w = 256;
  const h = Math.round((hU / wU) * w);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error(`[signBoard] 无法获取 2d 上下文 ${id}`);
  const ground = face.ground ?? '#f0ede4';
  const ink = face.ink ?? '#35404e';
  ctx.clearRect(0, 0, w, h);
  // 圆角底板
  const radius = h * 0.12;
  ctx.fillStyle = ground;
  ctx.beginPath();
  ctx.roundRect(2, 2, w - 4, h - 4, radius);
  ctx.fill();
  ctx.strokeStyle = 'rgba(52,64,78,0.35)';
  ctx.lineWidth = 3;
  ctx.stroke();
  // 主文案（日文/英文共用系统字体栈；居中逐行排布）
  const lines = face.lines;
  const subLines = face.subLines ?? [];
  const mainH = (h * 0.62) / Math.max(1, lines.length);
  ctx.fillStyle = ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const arrowSpace = face.arrow ? w * 0.16 : 0;
  const cx = (w - arrowSpace * (face.arrow === 'right' ? -1 : 1)) / 2 + arrowSpace * (face.arrow === 'left' ? 0.6 : 0);
  lines.forEach((line, li) => {
    const fontSize = Math.min(mainH * 0.8, w * 0.2);
    ctx.font = `bold ${fontSize}px "Hiragino Sans", "Yu Gothic", "Noto Sans JP", sans-serif`;
    ctx.fillText(line, cx, h * 0.32 + li * mainH);
  });
  subLines.forEach((line, li) => {
    const fontSize = Math.min(h * 0.16, w * 0.09);
    ctx.font = `${fontSize}px "Helvetica Neue", Arial, sans-serif`;
    ctx.fillText(line, cx, h * 0.32 + lines.length * mainH + h * 0.1 + li * h * 0.16);
  });
  // 箭头（语义符号，J6）
  if (face.arrow) {
    const dir = face.arrow === 'right' ? 1 : -1;
    const ax = w / 2 + dir * w * 0.3;
    const ay = h / 2;
    const ah = h * 0.16;
    ctx.strokeStyle = ink;
    ctx.lineWidth = Math.max(4, h * 0.07);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(ax - dir * w * 0.1, ay);
    ctx.lineTo(ax + dir * w * 0.06, ay);
    ctx.moveTo(ax + dir * w * 0.06, ay);
    ctx.lineTo(ax + dir * w * 0.06 - dir * ah * 0.8, ay - ah * 0.55);
    ctx.moveTo(ax + dir * w * 0.06, ay);
    ctx.lineTo(ax + dir * w * 0.06 - dir * ah * 0.8, ay + ah * 0.55);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.name = `${id}/face-tex-${index}`;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}
