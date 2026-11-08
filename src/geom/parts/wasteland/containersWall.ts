// docs/01-整体架构.md §3.2 geom/parts/wasteland/containersWall.ts —— 2.3.2-④ 锈蚀集装箱×2+波纹铁皮围墙。
// docs/02-场景模块.md §4.1.3-④「Plane 顶点 sin 波纹板 ×14 实例化；rustPatch 褪色蓝绿+锈 blotch；
//   箱顶/墙顶 roofTop」+ 2.3.3 containerBlue #4a6a72。原点=地面。
// ★ 禁止人形/人物几何（一.6）。T20 落点。
import * as THREE from 'three';
import type { SharedAssets } from '@/systems/handles';
import { toonMaterials } from '@/render/toonMaterial';
import { mergeGeometries, hardenEdges, roundedBox } from '@/geom/primitives';
import { InstancedGroup } from '@/geom/instanced';
import { paintCanvasTexture, drawRustMetal } from './texPaint';

export interface ContainerParams {
  readonly assets: SharedAssets;
  readonly id: string;
  /** 长轴长（默认 5.4） */
  readonly length?: number;
  /** 高（默认 2.5） */
  readonly height?: number;
  /** 宽（默认 2.35） */
  readonly width?: number;
}

export interface ContainerResult {
  readonly group: THREE.Group;
  /** 锈蚀面板材质（roofTop 天气面注册用） */
  readonly material: THREE.Material;
  /** 顶板 y（roofTop 雪壳用） */
  readonly roofY: number;
}

/**
 * 锈蚀集装箱：角柱/顶底梁框（1 DC）+ 两长侧 sin 波纹板（各 1 DC，顶点位移波纹）+
 * 两端端板（1 DC）。长轴沿局部 x。
 */
export function createContainer(params: ContainerParams): ContainerResult {
  const { assets, id } = params;
  const length = params.length ?? 5.4;
  const height = params.height ?? 2.5;
  const width = params.width ?? 2.35;
  const group = new THREE.Group();
  group.name = id;

  const rustTexture = assets.texture(`${id}/tex-rust`, () =>
    paintCanvasTexture(`${id}/tex-rust`, 256, 128, (ctx, w, h) => drawRustMetal(ctx, w, h, `${id}/rust`, '#4a6a72')),
  );
  rustTexture.repeat.set(length / 4, height / 2);
  const rustMaterial = toonMaterials.get('metal', { color: '#ffffff', map: rustTexture, name: `${id}/rust` });
  const frameMaterial = toonMaterials.get('metal', { color: '#5c5650', name: `${id}/frame` });

  // —— 框（4 角柱 + 顶底梁，合并 1 DC）——
  const frameGeometry = assets.geometry(`${id}/frame`, () => {
    const parts: THREE.BufferGeometry[] = [];
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const post = roundedBox({ width: 0.12, height, depth: 0.12, radius: 0.01 });
        post.translate((sx * length) / 2, height / 2, (sz * width) / 2);
        parts.push(hardenEdges(post));
      }
    }
    for (const y of [0.06, height - 0.06]) {
      for (const sz of [-1, 1]) {
        const beam = roundedBox({ width: length, height: 0.12, depth: 0.1, radius: 0.01 });
        beam.translate(0, y, (sz * width) / 2);
        parts.push(hardenEdges(beam));
      }
      for (const sx of [-1, 1]) {
        const beam = roundedBox({ width: 0.1, height: 0.12, depth: width, radius: 0.01 });
        beam.translate((sx * length) / 2, y, 0);
        parts.push(hardenEdges(beam));
      }
    }
    const merged = mergeGeometries(parts);
    if (!merged) throw new Error(`[wasteland] 集装箱框合并失败 ${id}`);
    return merged;
  });
  const frame = new THREE.Mesh(frameGeometry, frameMaterial);
  frame.name = `${id}/frame`;
  frame.castShadow = true;
  group.add(frame);

  // —— sin 波纹侧板 ×2（顶点位移波纹；各 1 DC）——
  const corrugate = (plane: THREE.PlaneGeometry): THREE.PlaneGeometry => {
    const position = plane.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < position.count; i++) {
      const px = position.getX(i);
      position.setZ(i, Math.sin((px / length) * Math.PI * 2 * 9) * 0.035); // 9 道波
    }
    plane.computeVertexNormals();
    return plane;
  };
  for (const [side, sz] of [
    ['side-l', -1],
    ['side-r', 1],
  ] as const) {
    const sideGeometry = assets.geometry(`${id}/${side}`, () =>
      corrugate(new THREE.PlaneGeometry(length - 0.1, height - 0.12, 36, 2)),
    );
    const sideMesh = new THREE.Mesh(sideGeometry, rustMaterial);
    sideMesh.name = `${id}/${side}`;
    sideMesh.position.set(0, height / 2, (sz * (width - 0.06)) / 2);
    if (sz < 0) sideMesh.rotation.y = Math.PI;
    sideMesh.castShadow = true;
    sideMesh.receiveShadow = true;
    group.add(sideMesh);
  }
  // 端板 ×2（1 DC 合并）
  const endGeometry = assets.geometry(`${id}/ends`, () => {
    const a = new THREE.PlaneGeometry(width - 0.1, height - 0.12);
    a.rotateY(Math.PI / 2);
    a.translate((length - 0.06) / 2, height / 2, 0);
    const b = new THREE.PlaneGeometry(width - 0.1, height - 0.12);
    b.rotateY(-Math.PI / 2);
    b.translate(-(length - 0.06) / 2, height / 2, 0);
    const merged = mergeGeometries([a, b]);
    if (!merged) throw new Error(`[wasteland] 集装箱端板合并失败 ${id}`);
    return merged;
  });
  const ends = new THREE.Mesh(endGeometry, rustMaterial);
  ends.name = `${id}/ends`;
  ends.castShadow = true;
  group.add(ends);

  return { group, material: rustMaterial, roofY: height };
}

export interface CorrugatedWallSegment {
  /** 墙段起点（局部 s=0 端） */
  readonly x: number;
  readonly z: number;
  /** 墙段方向（s 轴的方位角 rad：dx=cos, dz=−sin） */
  readonly dirRad: number;
  /** 墙段长（决定该段铺几块板） */
  readonly length: number;
}

export interface CorrugatedWallResult {
  readonly group: THREE.Group;
  /** 波纹板材质（roofTop 雪壳注册用——墙顶与箱体共用锈铁材质时同面注册） */
  readonly panelMaterial: THREE.Material;
  /** 各墙段顶梁雪壳（visible=false 预建） */
  readonly snowShells: THREE.Mesh[];
  /** 全部板数（与 2.3.2-④「×14 实例化」核对用） */
  readonly panelCount: number;
}

/**
 * 波纹铁皮围墙：sin 波纹板母版（1 板几何）沿墙线实例化（板数由段长自动铺满，合计 ×14）+
 * 顶梁角铁随板同批实例化（合并进板几何）。板面法线朝墙段行进方向的左侧（营地内）。
 */
export function createCorrugatedWall(assets: SharedAssets, id: string, segments: readonly CorrugatedWallSegment[], height = 1.9): CorrugatedWallResult {
  const panelW = 1.06;
  const rustTexture = assets.texture(`${id}/tex-rust`, () =>
    paintCanvasTexture(`${id}/tex-rust`, 256, 128, (ctx, w, h) => drawRustMetal(ctx, w, h, `${id}/rust`, '#6a6a60')),
  );
  rustTexture.repeat.set(1.2, 1.1);
  const panelMaterial = toonMaterials.get('metal', { color: '#ffffff', map: rustTexture, name: `${id}/panel` });
  const panelGeometry = assets.geometry(`${id}/panel`, () => {
    const plane = new THREE.PlaneGeometry(panelW, height, 10, 2);
    const position = plane.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < position.count; i++) {
      const px = position.getX(i);
      position.setZ(i, Math.sin((px / panelW) * Math.PI * 2 * 3) * 0.03); // 每板 3 道波
    }
    const topRail = new THREE.BoxGeometry(panelW + 0.04, 0.07, 0.05);
    topRail.translate(0, height / 2 + 0.035, 0.02);
    const bottomRail = new THREE.BoxGeometry(panelW + 0.04, 0.06, 0.04);
    bottomRail.translate(0, -height / 2 + 0.03, 0.02);
    const merged = mergeGeometries([plane, topRail, bottomRail]);
    if (!merged) throw new Error(`[wasteland] 波纹板母版合并失败 ${id}`);
    merged.computeVertexNormals();
    return merged;
  });
  // 铺板：逐段按长度取整板数（总量对齐 ×14）
  const placements: { x: number; z: number; rotY: number }[] = [];
  for (const seg of segments) {
    const count = Math.max(1, Math.round(seg.length / panelW));
    const step = seg.length / count;
    const cos = Math.cos(seg.dirRad);
    const sin = Math.sin(seg.dirRad);
    for (let i = 0; i < count; i++) {
      const s = (i + 0.5) * step;
      placements.push({ x: seg.x + cos * s, z: seg.z - sin * s, rotY: seg.dirRad });
    }
  }
  const panels = new InstancedGroup(panelGeometry, panelMaterial, {
    capacity: placements.length,
    withShell: true,
    name: `${id}/panels`,
    jitter: { hue: 0.004, saturation: 0.02, lightness: 0.04 },
  });
  const matrix = new THREE.Matrix4();
  const euler = new THREE.Euler();
  const quat = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  const pos = new THREE.Vector3();
  for (const p of placements) {
    pos.set(p.x, height / 2, p.z);
    euler.set(0, p.rotY, 0);
    quat.setFromEuler(euler);
    matrix.compose(pos, quat, one);
    panels.add(matrix, '#ffffff');
  }
  // 墙段顶雪壳（roofTop）
  const snowMaterial = toonMaterials.get('matteProp', { color: '#edf2f9', snow: 'off', opacity: 0.999, name: `${id}/snow` });
  const snowShells: THREE.Mesh[] = [];
  segments.forEach((seg, i) => {
    const shell = new THREE.Mesh(
      assets.geometry(`${id}/snow-${i}`, () => new THREE.BoxGeometry(seg.length, 0.05, 0.1)),
      snowMaterial,
    );
    shell.name = `${id}/snow-${i}`;
    const cos = Math.cos(seg.dirRad);
    const sin = Math.sin(seg.dirRad);
    shell.position.set(seg.x + (cos * seg.length) / 2, height / 2 + 0.06, seg.z - (sin * seg.length) / 2);
    shell.rotation.y = seg.dirRad;
    shell.userData.noOutline = true;
    shell.visible = false;
    snowShells.push(shell);
  });
  const group = new THREE.Group();
  group.name = id;
  group.add(panels.group);
  for (const shell of snowShells) group.add(shell);
  return { group, panelMaterial, snowShells, panelCount: placements.length };
}
