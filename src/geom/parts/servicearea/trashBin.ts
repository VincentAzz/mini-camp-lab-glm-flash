// docs/01-整体架构.md §3.2 geom/parts/servicearea/ —— 分类垃圾桶。
// docs/02-场景模块.md §4.1.4-⑩「分类垃圾桶 ×2（分类色环）」。
// 分类色环=Canvas 语义色环贴图（蓝/绿回收环带，docs/04 §5.4 中值原则例外项——语义图形可烘色）。
// ★ 禁止人形/人物几何（一.6）。T21 落点。
import * as THREE from 'three';
import type { SharedAssets } from '@/systems/handles';
import { toonMaterials } from '@/render/toonMaterial';
import { mergeGeometries, hardenEdges, roundedBox } from '@/geom/primitives';

export interface TrashBinParams {
  readonly assets: SharedAssets;
  /** 缓存 id（'trashBin/servicearea'——同 id 几何/贴图共享，×2 实例摆位） */
  readonly id: string;
  /** 高（默认 0.72） */
  readonly height?: number;
}

/** 桶身贴图：暖灰底 + 蓝/绿分类色环 + 投放口暗示缝（语义图形）。 */
function paintBinTexture(id: string, hU: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = Math.round((hU / 0.42) * 128);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error(`[trashBin] 无法获取 2d 上下文 ${id}`);
  ctx.fillStyle = '#c9cdd2';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const bandH = canvas.height * 0.14;
  ctx.fillStyle = '#4a8ad6';
  ctx.fillRect(0, canvas.height * 0.3, canvas.width, bandH);
  ctx.fillStyle = '#58b46a';
  ctx.fillRect(0, canvas.height * 0.52, canvas.width, bandH);
  ctx.fillStyle = 'rgba(40,44,48,0.4)';
  ctx.fillRect(canvas.width * 0.2, canvas.height * 0.14, canvas.width * 0.6, canvas.height * 0.05);
  const texture = new THREE.CanvasTexture(canvas);
  texture.name = `${id}/bin-tex`;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

/** 分类垃圾桶：桶身（色环贴图）+ 顶盖（含投放缝），原点=桶底。 */
export function createTrashBin(params: TrashBinParams): THREE.Group {
  const { assets, id } = params;
  const h = params.height ?? 0.72;
  const group = new THREE.Group();
  group.name = id;

  const texture = assets.texture(`${id}/bin-tex`, () => paintBinTexture(id, h));
  const bodyMaterial = toonMaterials.get('matteProp', { color: '#c9cdd2', map: texture, name: `${id}/body` });
  const body = new THREE.Mesh(
    assets.geometry(`${id}/body`, () => {
      const body = new THREE.CylinderGeometry(0.19, 0.16, h - 0.1, 12);
      body.translate(0, (h - 0.1) / 2, 0);
      return body;
    }),
    bodyMaterial,
  );
  body.name = `${id}/body`;
  body.castShadow = true;
  group.add(body);

  const lidGeometry = assets.geometry(`${id}/lid`, () => {
    const lid = roundedBox({ width: 0.42, height: 0.09, depth: 0.34, radius: 0.03 });
    lid.translate(0, h - 0.05, 0);
    const slot = roundedBox({ width: 0.26, height: 0.03, depth: 0.08, radius: 0.008 });
    slot.translate(0, h + 0.005, 0);
    return hardenEdges(mergeGeometries([lid, slot])!);
  });
  const lidMaterial = toonMaterials.get('metal', { color: '#5a6168', name: `${id}/lid` });
  const lid = new THREE.Mesh(lidGeometry, lidMaterial);
  lid.name = `${id}/lid`;
  lid.castShadow = true;
  group.add(lid);

  return group;
}
