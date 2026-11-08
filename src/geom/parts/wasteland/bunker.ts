// docs/01-整体架构.md §3.2 geom/parts/wasteland/bunker.ts —— 2.3.2-① 混凝土掩体+防爆门。
// docs/02-场景模块.md §4.1.3-①「3 段 Box+顶斜板；门+门轴+轮盘 Torus+辐条；hazardStripes 贴条，
//   干净秩序感」+ 2.3.3 concreteGray #9aa0a2。原点=地面中心，门面朝 +z。
// ★ 禁止人形/人物几何（一.6）。T20 落点。
import * as THREE from 'three';
import type { SharedAssets } from '@/systems/handles';
import { toonMaterials } from '@/render/toonMaterial';
import { mergeGeometries, hardenEdges, roundedBox } from '@/geom/primitives';
import { paintCanvasTexture, drawHazardStripes } from './texPaint';

export interface BunkerParams {
  readonly assets: SharedAssets;
  /** 缓存 id */
  readonly id: string;
  /** 掩体总宽（3 段合计，默认 4.6） */
  readonly width?: number;
  /** 墙体高（默认 2.1） */
  readonly height?: number;
  /** 进深（默认 2.3） */
  readonly depth?: number;
}

export interface BunkerResult {
  readonly group: THREE.Group;
  /** 墙体混凝土材质（roofTop 天气面注册用） */
  readonly material: THREE.Material;
  /** 顶斜板顶面中心（roofTop 雪壳挂点用） */
  readonly roofY: number;
  /** 顶斜板尺寸（雪壳用） */
  readonly roofSize: { readonly w: number; readonly d: number };
}

/** 混凝土掩体（3 段 Box 合并 1 DC）+ 顶斜板（1 DC）+ 防爆门组（门体/轮盘/辐条 2 DC）。 */
export function createBunker(params: BunkerParams): BunkerResult {
  const { assets, id } = params;
  const width = params.width ?? 4.6;
  const height = params.height ?? 2.1;
  const depth = params.depth ?? 2.3;
  const group = new THREE.Group();
  group.name = id;

  const concreteMaterial = toonMaterials.get('concrete', { color: '#9aa0a2', name: `${id}/concrete` });
  const metalMaterial = toonMaterials.get('metal', { color: '#4a4a50', name: `${id}/door-metal` });

  // —— 3 段墙体 + 门框侧柱（合并 1 DC；中段留门洞 1.1 宽）——
  const doorW = 1.1;
  const sideW = (width - doorW) / 2 - 0.12; // 两侧墙段（留门框柱）
  const frameW = 0.12;
  const bodyGeometry = assets.geometry(`${id}/body`, () => {
    const parts: THREE.BufferGeometry[] = [];
    const segSpecs: readonly [number, number][] = [
      // [段中心 x, 段宽]——左墙/右墙 + 2 门框柱
      [-(doorW / 2 + frameW + sideW / 2), sideW],
      [doorW / 2 + frameW + sideW / 2, sideW],
      [-(doorW / 2 + frameW / 2), frameW],
      [doorW / 2 + frameW / 2, frameW],
    ];
    for (const [sx, sw] of segSpecs) {
      const seg = roundedBox({ width: sw, height, depth, radius: 0.03 });
      seg.translate(sx, height / 2, 0);
      parts.push(hardenEdges(seg));
    }
    // 门楣（门洞上方横梁）
    const lintel = roundedBox({ width: doorW + frameW * 2, height: 0.34, depth, radius: 0.02 });
    lintel.translate(0, height - 0.17, 0);
    parts.push(hardenEdges(lintel));
    const merged = mergeGeometries(parts);
    if (!merged) throw new Error(`[wasteland] 掩体墙体合并失败 ${id}`);
    return merged;
  });
  const body = new THREE.Mesh(bodyGeometry, concreteMaterial);
  body.name = `${id}/body`;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // —— 顶斜板（前高后低 6° 排水坡，1 DC；roofTop 雪壳挂点）——
  const roofGeometry = assets.geometry(`${id}/roof`, () => {
    const slab = roundedBox({ width: width + 0.24, height: 0.16, depth: depth + 0.2, radius: 0.02 });
    slab.rotateX(-0.105); // ≈6° 前倾排水
    return hardenEdges(slab);
  });
  const roofY = height + 0.1;
  const roof = new THREE.Mesh(roofGeometry, concreteMaterial);
  roof.name = `${id}/roof`;
  roof.position.y = roofY;
  roof.castShadow = true;
  group.add(roof);

  // —— 防爆门（门体 1 DC：门板 + 门轴 ×2 + 加强筋；hazardStripes 贴条面）——
  const hazardTexture = assets.texture(`${id}/tex-hazard`, () => paintCanvasTexture(`${id}/tex-hazard`, 128, 32, drawHazardStripes));
  hazardTexture.repeat.set(1, 1);
  const doorMaterial = toonMaterials.get('metal', { color: '#6a6a62', name: `${id}/door` });
  const stripeMaterial = toonMaterials.get('matteProp', { color: '#d8d2c0', map: hazardTexture, name: `${id}/door-stripe` });
  const doorGeometry = assets.geometry(`${id}/door`, () => {
    const parts: THREE.BufferGeometry[] = [];
    const slab = roundedBox({ width: doorW - 0.04, height: height - 0.42, depth: 0.09, radius: 0.015 });
    slab.translate(0, 0.19 + (height - 0.42) / 2, 0);
    parts.push(hardenEdges(slab));
    // 门轴 ×2（铰链凸缘）
    for (const hy of [0.34, height - 0.3]) {
      const hinge = new THREE.CylinderGeometry(0.045, 0.045, 0.14, 8);
      hinge.rotateX(Math.PI / 2);
      hinge.translate(-doorW / 2 + 0.02, hy, 0.02);
      parts.push(hardenEdges(hinge));
    }
    // 横向加强筋 ×2
    for (const ry of [0.62, 1.32]) {
      const rib = roundedBox({ width: doorW - 0.12, height: 0.09, depth: 0.04, radius: 0.01 });
      rib.translate(0, ry, 0.055);
      parts.push(hardenEdges(rib));
    }
    const merged = mergeGeometries(parts);
    if (!merged) throw new Error(`[wasteland] 防爆门合并失败 ${id}`);
    return merged;
  });
  const door = new THREE.Mesh(doorGeometry, doorMaterial);
  door.name = `${id}/door`;
  door.position.set(0, 0.05, depth / 2 + 0.045);
  door.castShadow = true;
  group.add(door);
  // hazardStripes 贴条（门底一条 + 门楣一条；贴图烘色）
  const stripe = new THREE.Mesh(
    assets.geometry(`${id}/door-stripe`, () => new THREE.PlaneGeometry(doorW - 0.1, 0.13)),
    stripeMaterial,
  );
  stripe.name = `${id}/door-stripe`;
  stripe.position.set(0, 0.34, depth / 2 + 0.093);
  group.add(stripe);
  const lintelStripe = new THREE.Mesh(
    assets.geometry(`${id}/lintel-stripe`, () => new THREE.PlaneGeometry(doorW + frameW * 2 - 0.06, 0.1)),
    stripeMaterial,
  );
  lintelStripe.name = `${id}/lintel-stripe`;
  lintelStripe.position.set(0, height - 0.28, depth / 2 + 0.02);
  group.add(lintelStripe);

  // —— 轮盘 Torus + 辐条 ×4（开闭手轮；1 DC 合并）——
  const wheelGeometry = assets.geometry(`${id}/wheel`, () => {
    const parts: THREE.BufferGeometry[] = [];
    const wheel = new THREE.TorusGeometry(0.17, 0.024, 6, 16);
    wheel.translate(0, 0, 0.07);
    parts.push(hardenEdges(wheel));
    const hub = new THREE.CylinderGeometry(0.035, 0.035, 0.1, 8);
    hub.rotateX(Math.PI / 2);
    hub.translate(0, 0, 0.05);
    parts.push(hardenEdges(hub));
    for (let i = 0; i < 4; i++) {
      const spoke = new THREE.CylinderGeometry(0.014, 0.014, 0.3, 6);
      spoke.rotateZ((i / 4) * Math.PI * 2 + Math.PI / 4);
      spoke.translate(0, 0, 0.07);
      parts.push(hardenEdges(spoke));
    }
    const merged = mergeGeometries(parts);
    if (!merged) throw new Error(`[wasteland] 轮盘合并失败 ${id}`);
    return merged;
  });
  const wheel = new THREE.Mesh(wheelGeometry, metalMaterial);
  wheel.name = `${id}/wheel`;
  wheel.position.set(doorW / 2 - 0.24, 0.92, depth / 2 + 0.14);
  wheel.castShadow = true;
  group.add(wheel);

  return { group, material: concreteMaterial, roofY: roofY + 0.1, roofSize: { w: width + 0.24, d: depth + 0.2 } };
}
