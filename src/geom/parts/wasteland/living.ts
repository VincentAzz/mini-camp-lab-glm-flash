// docs/01-整体架构.md §3.2 geom/parts/wasteland/living.ts —— 2.3.2-⑪ 油桶烧烤架火堆 / ⑫ 晾衣绳工装×3 / ⑬ 城市剪影窗灯。
// docs/02-场景模块.md §4.1.3-⑪「campfire 变体：半砖圈+油桶剖半半筒横架+烤网；火光点光 P3+spark」
//   / -⑫「ShapeGeometry 剪影双面；ClothHandle ×3」/ -⑬「窗灯 shopPower×0.6 抽样点亮 20%/35%，★统一」。
// 布料裁定注记：⑫「ShapeGeometry 剪影」以 clothMicro 12×8 分段 Plane + alpha 剪影贴图实现（等观感）——
//   保留 WindSystem 顶点位移链（wind.ts 契约要求 PlaneGeometry+uv 固定边约定）；双面 ✓（见 drawGarmentSilhouette）。
// ★ 禁止人形/人物几何（一.6）——衣物为剪影非人形。T20 落点。
import * as THREE from 'three';
import type { ClothHandle, SharedAssets } from '@/systems/handles';
import { toonMaterials } from '@/render/toonMaterial';
import { mergeGeometries, hardenEdges, roundedBox, tube } from '@/geom/primitives';
import { createMicroCloth } from '@/geom/parts/clothMicro';
import { paintCanvasTexture, drawGarmentSilhouette } from './texPaint';
import { makeDotHaloTexture } from './utilities';

/* ============================== ⑪ 油桶改造烧烤架火堆 ============================== */

export interface BarrelGrillResult {
  readonly group: THREE.Group;
  /** 余烬材质（场景 lightHooks 写 emissiveIntensity = 基值 × emberPower × 闪烁——campfire 同口径） */
  readonly coalMaterial: THREE.MeshToonMaterial;
  /** 火星发射挂点（半筒中心上方） */
  readonly sparkAnchor: THREE.Object3D;
}

/** 油桶烧烤架：半砖圈 + 油桶剖半半筒横架 + 烤网 + 余烬炭堆。原点=地面中心。 */
export function createBarrelGrill(assets: SharedAssets, id: string): BarrelGrillResult {
  const group = new THREE.Group();
  group.name = id;
  const brickMaterial = toonMaterials.get('concrete', { color: '#8a6a58', name: `${id}/brick` });
  const drumMaterial = toonMaterials.get('metal', { color: '#7c5a48', name: `${id}/drum` });

  // —— 半砖圈（砖块沿半圆弧 ×7，1 DC）——
  const ringGeometry = assets.geometry(`${id}/ring`, () => {
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 7; i++) {
      const angle = -Math.PI * 0.5 + (i / 6) * Math.PI; // 半圆开口朝后（−z 侧背风）
      const brick = roundedBox({ width: 0.2, height: 0.11, depth: 0.09, radius: 0.008 });
      brick.rotateY(-angle);
      brick.translate(Math.sin(angle) * 0.42, 0.055 + (i % 2) * 0.02, Math.cos(angle) * 0.42);
      parts.push(hardenEdges(brick));
    }
    const merged = mergeGeometries(parts);
    if (!merged) throw new Error(`[wasteland] 半砖圈合并失败 ${id}`);
    return merged;
  });
  const ring = new THREE.Mesh(ringGeometry, brickMaterial);
  ring.name = `${id}/ring`;
  ring.castShadow = true;
  group.add(ring);

  // —— 油桶剖半半筒横架（半筒开口朝上，轴向沿 x；1 DC）+ 4 腿 ——
  const drumGeometry = assets.geometry(`${id}/drum`, () => {
    const parts: THREE.BufferGeometry[] = [];
    const half = new THREE.CylinderGeometry(0.3, 0.3, 0.92, 12, 1, false, 0, Math.PI);
    half.rotateZ(Math.PI / 2); // 轴向 x；开口半圆朝上
    parts.push(hardenEdges(half));
    // 两端半圆封板
    for (const sx of [-0.46, 0.46]) {
      const cap = new THREE.CircleGeometry(0.3, 12, 0, Math.PI);
      cap.rotateY(sx > 0 ? Math.PI / 2 : -Math.PI / 2);
      cap.translate(sx, 0, 0);
      parts.push(hardenEdges(cap));
    }
    // （腿件亦 hardenEdges——全部非索引后再合并）
    for (const [lx, lz] of [
      [-0.34, 0.22],
      [0.34, 0.22],
      [-0.34, -0.22],
      [0.34, -0.22],
    ] as const) {
      const leg = new THREE.CylinderGeometry(0.018, 0.022, 0.4, 6);
      leg.translate(lx, 0.2, lz);
      parts.push(hardenEdges(leg));
    }
    const merged = mergeGeometries(parts);
    if (!merged) throw new Error(`[wasteland] 油桶半筒合并失败 ${id}`);
    return merged;
  });
  const drum = new THREE.Mesh(drumGeometry, drumMaterial);
  drum.name = `${id}/drum`;
  drum.position.y = 0.4;
  drum.castShadow = true;
  group.add(drum);

  // —— 烤网（横杆 ×6，1 DC）——
  const grillGeometry = assets.geometry(`${id}/grill`, () => {
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 6; i++) {
      const bar = new THREE.CylinderGeometry(0.008, 0.008, 0.84, 5);
      bar.rotateZ(Math.PI / 2);
      bar.translate(0, 0.6, -0.22 + i * 0.088);
      parts.push(hardenEdges(bar));
    }
    const merged = mergeGeometries(parts);
    if (!merged) throw new Error(`[wasteland] 烤网合并失败 ${id}`);
    return merged;
  });
  const grill = new THREE.Mesh(grillGeometry, toonMaterials.get('metal', { color: '#3a3d44', name: `${id}/grill` }));
  grill.name = `${id}/grill`;
  grill.position.y = 0.02;
  grill.castShadow = true;
  group.add(grill);

  // —— 余烬炭堆（半筒内；emissive 材质交场景驱动——campfire 口径）——
  const coalGeometry = assets.geometry(`${id}/coal`, () => {
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 5; i++) {
      const chunk = new THREE.IcosahedronGeometry(0.06 + (i % 3) * 0.012, 0);
      chunk.translate(Math.sin(i * 2.2) * 0.14, 0.44 + (i % 2) * 0.04, Math.cos(i * 1.9) * 0.12);
      parts.push(hardenEdges(chunk));
    }
    const merged = mergeGeometries(parts);
    if (!merged) throw new Error(`[wasteland] 烧烤架炭堆合并失败 ${id}`);
    return merged;
  });
  const coalMaterial = toonMaterials.getToon('matteProp', {
    color: '#2c2622',
    emissive: '#FF5A20',
    emissiveIntensity: 0, // 场景 lightHooks 按 emberPower 驱动
    name: `${id}/coal`,
  });
  const coal = new THREE.Mesh(coalGeometry, coalMaterial);
  coal.name = `${id}/coal`;
  group.add(coal);

  const sparkAnchor = new THREE.Object3D();
  sparkAnchor.name = `${id}/spark-anchor`;
  sparkAnchor.position.y = 0.62;
  group.add(sparkAnchor);

  return { group, coalMaterial, sparkAnchor };
}

/* ============================== ⑫ 晾衣绳工装 ×3 ============================== */

export interface ClotheslineResult {
  readonly group: THREE.Group;
  /** 工装布料句柄 ×3（stiffness 0.45 / windFactor 1.0 / sagAmp 0.02——§7.1.2 布料总表） */
  readonly cloths: ClothHandle[];
}

/** 晾衣绳：双 T 桩 + 下垂绳 + 工装 ×3（alpha 剪影布料，挂点=绳侧顶边；双面）。原点=地面，绳沿局部 x。 */
export function createClothesline(assets: SharedAssets, id: string, ropeLength = 3.4): ClotheslineResult {
  const group = new THREE.Group();
  group.name = id;
  const woodMaterial = toonMaterials.get('wood', { color: '#6a5a48', name: `${id}/post` });

  // —— 双 T 桩（1 DC 合并）——
  const postsGeometry = assets.geometry(`${id}/posts`, () => {
    const parts: THREE.BufferGeometry[] = [];
    for (const px of [-ropeLength / 2, ropeLength / 2]) {
      const pole = new THREE.CylinderGeometry(0.03, 0.038, 1.78, 8);
      pole.translate(px, 0.89, 0);
      parts.push(hardenEdges(pole));
      const cross = new THREE.CylinderGeometry(0.022, 0.022, 0.56, 6);
      cross.rotateZ(Math.PI / 2);
      cross.translate(px, 1.72, 0);
      parts.push(hardenEdges(cross));
    }
    const merged = mergeGeometries(parts);
    if (!merged) throw new Error(`[wasteland] 晾衣桩合并失败 ${id}`);
    return merged;
  });
  const posts = new THREE.Mesh(postsGeometry, woodMaterial);
  posts.name = `${id}/posts`;
  posts.castShadow = true;
  group.add(posts);

  // —— 下垂绳（CatmullRom 悬链，1 DC）——
  const ropeY = 1.68;
  const rope = new THREE.Mesh(
    assets.geometry(`${id}/rope`, () =>
      tube({
        pointsOrCurve: [
          new THREE.Vector3(-ropeLength / 2, ropeY, 0),
          new THREE.Vector3(-ropeLength / 6, ropeY - 0.09, 0),
          new THREE.Vector3(ropeLength / 6, ropeY - 0.09, 0),
          new THREE.Vector3(ropeLength / 2, ropeY, 0),
        ],
        radius: 0.009,
        tubularSegments: 16,
      }),
    ),
    toonMaterials.get('matteProp', { color: '#8a7c62', name: `${id}/rope` }),
  );
  rope.name = `${id}/rope`;
  group.add(rope);

  // —— 工装 ×3（alpha 剪影布料；mesh.rotation.z=−π/2 使固定边 uv.x=0 落在挂绳侧顶边）——
  const cloths: ClothHandle[] = [];
  const kinds: readonly ('jacket' | 'overalls' | 'tee')[] = ['jacket', 'overalls', 'tee'];
  const spots: readonly number[] = [-ropeLength * 0.28, 0.02, ropeLength * 0.3];
  kinds.forEach((kind, i) => {
    const garmentTexture = assets.texture(`${id}/tex-${kind}`, () =>
      paintCanvasTexture(`${id}/tex-${kind}`, 128, 128, (ctx, w, h) => drawGarmentSilhouette(ctx, w, h, kind), true),
    );
    const drop = kind === 'overalls' ? 0.62 : 0.54;
    const cloth = createMicroCloth({
      assets,
      id: `${id}/${kind}`,
      width: drop, // 局部 x=落水方向（挂高）
      height: 0.4, // 局部 y=沿绳横向
      color: '#ffffff',
      stiffness: 0.45, // docs/05 §7.1.2「晾衣绳工装 ×3」
      windFactor: 1.0,
      sagAmp: 0.02,
      swayAxes: ['z'],
      preset: null,
      map: garmentTexture,
      doubleSided: true,
    });
    cloth.mesh.rotation.z = -Math.PI / 2; // 固定边（uv.x=0）转至顶边挂点
    cloth.mesh.position.set(spots[i] ?? 0, ropeY - (kind === 'overalls' ? 0.31 : 0.27) - 0.09, 0);
    cloth.mesh.castShadow = false; // alpha 剪影投影会暴露整块矩形，关投影（ OutlineSystem 反壳仍参与轮廓）
    group.add(cloth.mesh);
    cloths.push(cloth.handle);
  });

  return { group, cloths };
}

/* ============================== ⑬ 城市剪影窗灯 ============================== */

export interface CityWindowsResult {
  readonly group: THREE.Group;
  /** 窗灯材质（场景按 shopPower×0.6×档位写 opacity） */
  readonly material: THREE.MeshBasicMaterial;
  /** 抽样点亮：visibleCount = round(total × frac)（实例序已 shuffle） */
  readonly total: number;
  setFraction(frac: number): void;
}

/** 城市窗灯（剪影板前的小窗 quad 实例层；楼群分列布置对齐 skyline 板 8~10 栋口径；z 由场景传入）。 */
export function createCityWindows(assets: SharedAssets, id: string, z: number): CityWindowsResult {
  const group = new THREE.Group();
  group.name = id;
  // 楼群分列（与 baseAssembler skyline 8-10 栋、2:1 高低差、无尖塔口径对位）
  const buildings: { x: number; w: number; top: number }[] = [];
  let bx = -8.9;
  let seed = 0x51ed;
  const rand = (): number => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  while (bx < 8.6 && buildings.length < 10) {
    const w = 1.1 + rand() * 1.3;
    const top = rand() < 0.5 ? 1.6 + rand() * 0.7 : 3.0 + rand() * 1.1; // 2:1 高低差
    buildings.push({ x: bx + w / 2, w, top });
    bx += w + 0.16 + rand() * 0.5;
  }
  const positions: { x: number; y: number }[] = [];
  for (const b of buildings) {
    const cols = Math.max(2, Math.floor(b.w / 0.34));
    const rows = Math.max(2, Math.floor(b.top / 0.5));
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        if (rand() < 0.42) continue; // 并非每窗都有（剪影板留黑窗）
        positions.push({
          x: b.x - (b.w / 2) * 0.72 + (c * (b.w * 0.72)) / Math.max(1, cols - 1),
          y: 0.55 + r * ((b.top - 0.7) / Math.max(1, rows - 1)),
        });
      }
    }
  }
  // 实例序 shuffle（抽样点亮=前 count 个；同 id 可复现由 rand 序保证）
  for (let i = positions.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = positions[i];
    positions[i] = positions[j]!;
    positions[j] = tmp!;
  }
  const material = new THREE.MeshBasicMaterial({
    color: '#ffd9a0',
    map: makeDotHaloTexture(assets, `${id}/win-tex`),
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  });
  material.name = `${id}/windows`;
  const quad = assets.geometry(`${id}/quad`, () => new THREE.PlaneGeometry(0.13, 0.19));
  const mesh = new THREE.InstancedMesh(quad, material, positions.length);
  mesh.name = `${id}/windows`;
  const matrix = new THREE.Matrix4();
  positions.forEach((p, i) => {
    matrix.identity().setPosition(p.x, p.y, z);
    mesh.setMatrixAt(i, matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.renderOrder = 19;
  mesh.userData.noOutline = true;
  group.add(mesh);
  return {
    group,
    material,
    total: positions.length,
    setFraction(frac: number): void {
      mesh.count = Math.round(positions.length * Math.max(0, Math.min(1, frac)));
    },
  };
}
