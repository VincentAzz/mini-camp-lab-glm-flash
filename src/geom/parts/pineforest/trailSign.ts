// docs/01-整体架构.md §3.2 geom/parts/pineforest/trailSign.ts —— 指路木牌（松林首创）。
// docs/02-场景模块.md §4.1.2 2.2.2-⑤：「指路木牌（3 块箭头板「滝の道 0.8km／山小屋 2.5km／
//   キャンプ場」J6）」——3 板异高交错（signBoard 双板对置版不适用，本件为木柱+木箭头板变体）；
//   文字 Canvas 2D（docs/04 §5.4 ①，系统字体栈，J6 日文）。
// ★ 禁止人形/人物几何（一.6）；警示牌不用骷髅图形（本件为指路牌）。T19 落点。
import * as THREE from 'three';
import type { SharedAssets } from '@/systems/handles';
import { toonMaterials } from '@/render/toonMaterial';
import { hardenEdges, roundedBox } from '@/geom/primitives';

export interface TrailSignArrow {
  /** 主文案（如「滝の道 0.8km」） */
  readonly text: string;
  /** 箭头方向 */
  readonly arrow: 'left' | 'right';
  /** 板离地高 */
  readonly height: number;
}

export interface TrailSignParams {
  readonly assets: SharedAssets;
  readonly id: string;
  readonly arrows: readonly TrailSignArrow[];
  /** 柱高（默认 1.5） */
  readonly postHeight?: number;
  /** 板宽（默认 0.6） */
  readonly boardWidth?: number;
}

/** 指路木牌：单木柱 + 3 块异高箭头板（板面法线 ±z 交错）。原点=地面中心。 */
export function createTrailSign(params: TrailSignParams): THREE.Group {
  const { assets, id } = params;
  const postHeight = params.postHeight ?? 1.5;
  const boardWidth = params.boardWidth ?? 0.6;
  const group = new THREE.Group();
  group.name = id;

  const post = new THREE.Mesh(
    assets.geometry(`${id}/post`, () => {
      const geo = new THREE.CylinderGeometry(0.032, 0.04, postHeight, 7);
      geo.translate(0, postHeight / 2, 0);
      return hardenEdges(geo);
    }),
    toonMaterials.get('wood', { color: '#8a6a48', name: `${id}/post` }),
  );
  post.name = `${id}/post`;
  post.castShadow = true;
  group.add(post);

  params.arrows.forEach((arrow, i) => {
    const boardHeight = 0.17;
    const body = new THREE.Mesh(
      assets.geometry(`${id}/board-body-${i}`, () => {
        const slab = roundedBox({ width: boardWidth, height: boardHeight, depth: 0.035, radius: 0.01 });
        slab.translate(0, arrow.height, 0);
        return hardenEdges(slab);
      }),
      toonMaterials.get('wood', { color: '#b08a5e', name: `${id}/board-body` }),
    );
    body.name = `${id}/board-body-${i}`;
    body.castShadow = true;
    // 箭头板形：绕柱微转（左箭头板朝左前方）
    body.rotation.y = (arrow.arrow === 'right' ? -1 : 1) * 0.22;
    group.add(body);

    const texture = assets.texture(`${id}/board-tex-${i}`, () => paintArrowTextTexture(id, i, arrow.text, arrow.arrow, boardWidth, boardHeight));
    const plateGeometry = assets.geometry(`${id}/board-plate-${i}`, () => {
      const plane = new THREE.PlaneGeometry(boardWidth * 0.94, boardHeight * 0.8);
      plane.translate(0, arrow.height, 0.019);
      return plane;
    });
    const plate = new THREE.Mesh(
      plateGeometry,
      toonMaterials.get('matteProp', {
        color: '#ffffff',
        map: texture,
        opacity: 0.999, // transparent 开（map alpha 承载圆角底形）
        name: `${id}/board-plate-${i}`,
      }),
    );
    plate.name = `${id}/board-plate-${i}`;
    plate.rotation.y = body.rotation.y;
    group.add(plate);
    // 背面素板（板背无字）
    const back = new THREE.Mesh(
      assets.geometry(`${id}/board-back-${i}`, () => {
        const plane = new THREE.PlaneGeometry(boardWidth * 0.94, boardHeight * 0.8);
        plane.translate(0, arrow.height, -0.019);
        plane.rotateY(Math.PI);
        return plane;
      }),
      toonMaterials.get('wood', { color: '#a8825c', name: `${id}/board-back` }),
    );
    back.name = `${id}/board-back-${i}`;
    back.rotation.y = body.rotation.y;
    group.add(back);
  });

  return group;
}

/** 板面贴图：木底色 + 深棕文字 + 箭头（语义文字可烘色，docs/04 §5.4）。 */
function paintArrowTextTexture(id: string, index: number, text: string, arrow: 'left' | 'right', wU: number, hU: number): THREE.CanvasTexture {
  const w = 256;
  const h = Math.max(48, Math.round((hU / wU) * w));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error(`[trailSign] 无法获取 2d 上下文 ${id}`);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#d8b98a';
  ctx.beginPath();
  ctx.roundRect(2, 2, w - 4, h - 4, h * 0.22);
  ctx.fill();
  ctx.strokeStyle = 'rgba(90,62,38,0.5)';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = '#4a3423';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const fontSize = Math.min(h * 0.52, w * 0.14);
  ctx.font = `bold ${fontSize}px "Hiragino Sans", "Yu Gothic", "Noto Sans JP", sans-serif`;
  const dir = arrow === 'right' ? 1 : -1;
  ctx.fillText(text, w * 0.54 - dir * w * 0.05, h * 0.52);
  // 箭头（语义符号，J6）
  const ax = w * 0.5 + dir * w * 0.4;
  const ay = h * 0.52;
  const ah = h * 0.26;
  ctx.strokeStyle = '#4a3423';
  ctx.lineWidth = Math.max(4, h * 0.1);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(ax - dir * w * 0.09, ay);
  ctx.lineTo(ax + dir * w * 0.02, ay);
  ctx.moveTo(ax + dir * w * 0.02, ay);
  ctx.lineTo(ax + dir * w * 0.02 - dir * ah * 0.7, ay - ah * 0.5);
  ctx.moveTo(ax + dir * w * 0.02, ay);
  ctx.lineTo(ax + dir * w * 0.02 - dir * ah * 0.7, ay + ah * 0.5);
  ctx.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  texture.name = `${id}/board-tex-${index}`;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}
