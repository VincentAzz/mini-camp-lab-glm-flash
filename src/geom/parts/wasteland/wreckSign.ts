// docs/01-整体架构.md §3.2 geom/parts/wasteland/wreckSign.ts —— 2.3.2-⑥ 废旧汽车残骸+轮胎堆 / ⑦ 油桶+手写警示牌。
// docs/02-场景模块.md §4.1.3-⑥「侧影 Extrude+窗洞贴片+缺 1 轮；无任何乘员/骸骨几何（一·6）；
//   轮胎 Torus ×5 金字塔；顶面 roofTop」+ -⑦「drumBarrel 立3倒1；牌面白底红字「立入禁止／危ない！」
//   手写笔迹 Canvas，不用骷髅图形，板微歪 4°，J6」。
// ★ 一·6 红线：残骸内部无任何乘员/骸骨/人形几何；警示牌无骷髅图形。T20 落点。
import * as THREE from 'three';
import type { SharedAssets } from '@/systems/handles';
import { toonMaterials } from '@/render/toonMaterial';
import { mergeGeometries, hardenEdges, roundedBox, lathe } from '@/geom/primitives';
import { InstancedGroup } from '@/geom/instanced';
import { paintCanvasTexture, drawRustMetal, drawWarningSignFace } from './texPaint';

/* ============================== ⑥ 废旧汽车残骸 + 轮胎堆 ============================== */

export interface WreckResult {
  readonly group: THREE.Group;
  /** 车体材质（roofTop 天气面注册用） */
  readonly material: THREE.Material;
  /** 车顶 y（roofTop 雪壳用） */
  readonly roofY: number;
  /** 轮胎堆材质 */
  readonly tireMaterial: THREE.Material;
  /** 轮胎堆顶雪壳挂高 */
  readonly tireTopY: number;
}

/** 废旧汽车残骸：侧影 Extrude 车体 + 窗洞贴片 + 3 轮（缺 1 轮露轮毂）+ 掀起引擎盖。原点=地面中心，车头朝 +x。 */
export function createWreck(assets: SharedAssets, id: string): WreckResult {
  const group = new THREE.Group();
  group.name = id;

  const bodyMaterial = toonMaterials.get('metal', { color: '#7c5a48', name: `${id}/body` });
  const rimMaterial = toonMaterials.get('metal', { color: '#5a5650', name: `${id}/rim` });

  // —— 侧影 Extrude（车体剖面沿 z 挤出 1.72 宽）——
  const bodyGeometry = assets.geometry(`${id}/body`, () => {
    // 车头朝 +x：引擎盖低位、座舱拱起、车尾厢位（剪影轮廓，y 从 0.3 离地）
    const profile: readonly [number, number][] = [
      [-2.05, 0.32],
      [-2.1, 0.62],
      [-1.9, 0.78],
      [-1.15, 0.82], // 尾厢顶
      [-0.95, 1.24],
      [-0.2, 1.38], // 座舱顶
      [0.62, 1.26],
      [0.95, 0.86], // 引擎盖
      [1.85, 0.8],
      [2.05, 0.6],
      [2.0, 0.32],
    ];
    const shape = new THREE.Shape(profile.map(([x, y]) => new THREE.Vector2(x, y)));
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: 1.72, bevelEnabled: false, curveSegments: 4, steps: 1 });
    geometry.translate(0, 0, -0.86);
    geometry.computeVertexNormals();
    return geometry;
  });
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
  body.name = `${id}/body`;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // —— 窗洞贴片（座舱两侧深色玻璃缺口，1 DC ×2 面）+ 缺轮侧轮毂 ——
  const glassMaterial = toonMaterials.get('glass', { color: '#2e3a42', opacity: 0.72, name: `${id}/glass` });
  for (const sz of [-1, 1]) {
    const window = new THREE.Mesh(
      assets.geometry(`${id}/window-${sz < 0 ? 'l' : 'r'}`, () => {
        const shape = new THREE.Shape([
          new THREE.Vector2(-0.88, 0.92),
          new THREE.Vector2(-0.16, 1.28),
          new THREE.Vector2(0.52, 1.18),
          new THREE.Vector2(0.7, 0.92),
        ]);
        const geometry = new THREE.ShapeGeometry(shape);
        geometry.translate(0, 0, sz * 0.87);
        if (sz < 0) geometry.scale(1, 1, -1); // 翻面保证法线朝外
        return geometry;
      }),
      glassMaterial,
    );
    window.name = `${id}/window-${sz < 0 ? 'l' : 'r'}`;
    window.userData.noOutline = true;
    group.add(window);
  }
  // 缺 1 轮（右前）：轮毂盘残留
  const hub = new THREE.Mesh(
    assets.geometry(`${id}/hub`, () => {
      const disc = new THREE.CylinderGeometry(0.2, 0.2, 0.1, 10);
      disc.rotateX(Math.PI / 2);
      disc.translate(1.28, 0.33, 0.88);
      return hardenEdges(disc);
    }),
    rimMaterial,
  );
  hub.name = `${id}/hub`;
  group.add(hub);

  // —— 在场 3 轮（左前/左后/右后；Torus 胎体 + 辐条盘，1 DC/轮共享）——
  const wheelGeometry = assets.geometry(`${id}/wheel`, () => {
    const tire = new THREE.TorusGeometry(0.33, 0.13, 8, 14);
    tire.rotateY(Math.PI / 2);
    const discPart = new THREE.CylinderGeometry(0.17, 0.17, 0.1, 10);
    discPart.rotateX(Math.PI / 2);
    const merged = mergeGeometries([hardenEdges(tire), hardenEdges(discPart)]);
    if (!merged) throw new Error(`[wasteland] 残骸车轮合并失败 ${id}`);
    return merged;
  });
  const tireMaterial = toonMaterials.get('matteProp', { color: '#3a3a3e', name: `${id}/tire` });
  const wheels = new InstancedGroup(wheelGeometry, tireMaterial, { capacity: 3, withShell: true, name: `${id}/wheels` });
  const matrix = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  const pos = new THREE.Vector3();
  for (const [wx, wz] of [
    [1.28, -0.88],
    [-1.32, -0.88],
    [-1.32, 0.88],
  ] as const) {
    pos.set(wx, 0.33, wz);
    quat.identity();
    matrix.compose(pos, quat, one);
    wheels.add(matrix, '#3a3a3e');
  }
  group.add(wheels.group);

  return { group, material: bodyMaterial, roofY: 1.38, tireMaterial, tireTopY: 0.46 };
}

/** 轮胎堆（Torus ×5 金字塔 3+2+1；实例化 1+1 DC；顶面 roofTop 雪壳）。原点=地面中心。 */
export function createTirePyramid(assets: SharedAssets, id: string, tireMaterial: THREE.Material): { group: THREE.Group; topY: number } {
  const tireGeometry = assets.geometry(`${id}/tire`, () => {
    const tire = new THREE.TorusGeometry(0.36, 0.14, 8, 14);
    tire.rotateX(Math.PI / 2);
    return hardenEdges(tire);
  });
  const tires = new InstancedGroup(tireGeometry, tireMaterial, { capacity: 5, withShell: true, name: `${id}/tires` });
  const matrix = new THREE.Matrix4();
  const euler = new THREE.Euler();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const spots: readonly [number, number, number, number][] = [
    // [x, y, z, 微旋]——底 3 + 顶 2 = ×5 金字塔（2.3.2-⑥ 定数）
    [-0.38, 0.15, 0.1, 0.2],
    [0.36, 0.15, -0.08, -0.35],
    [0.02, 0.15, 0.42, 0.9],
    [-0.14, 0.45, 0.12, 0.5],
    [0.22, 0.45, -0.16, -0.7],
  ];
  spots.forEach(([x, y, z, rot], i) => {
    pos.set(x, y, z);
    euler.set(0, rot, i >= 3 ? 0.1 : 0);
    quat.setFromEuler(euler);
    scale.setScalar(1);
    matrix.compose(pos, quat, scale);
    tires.add(matrix, '#3a3a3e');
  });
  const group = new THREE.Group();
  group.name = id;
  group.add(tires.group);
  return { group, topY: 0.62 };
}

/* ============================== ⑦ 油桶 + 手写警示牌 ============================== */

export interface BarrelSignResult {
  readonly group: THREE.Group;
  /** 油桶材质（roofTop 倒桶雪壳可注册用） */
  readonly barrelMaterial: THREE.Material;
}

/**
 * 油桶群：立 ×3（Lathe 桶身双箍线）+ 倒 ×1（横躺）。锈桶共面配方（rustRed 基色）。
 * 警示牌：木柱 + 白底红字手写牌（微歪 4°，J6；无骷髅图形——一·5 红线）。
 */
export function createBarrelSign(assets: SharedAssets, id: string): BarrelSignResult {
  const group = new THREE.Group();
  group.name = id;

  const barrelTexture = assets.texture(`${id}/tex-barrel`, () =>
    paintCanvasTexture(`${id}/tex-barrel`, 128, 128, (ctx, w, h) => drawRustMetal(ctx, w, h, `${id}/rust`, '#a05238')),
  );
  barrelTexture.repeat.set(2, 1);
  const barrelMaterial = toonMaterials.get('metal', { color: '#ffffff', map: barrelTexture, name: `${id}/barrel` });

  // 桶身（Lathe：直筒 + 双箍凸缘 + 卷沿）
  const barrelGeometry = assets.geometry(`${id}/barrel`, () =>
    lathe({
      profile: [
        [0.0, 0.02],
        [0.27, 0.0],
        [0.3, 0.03],
        [0.3, 0.24],
        [0.32, 0.27],
        [0.3, 0.3],
        [0.3, 0.52],
        [0.32, 0.55],
        [0.3, 0.58],
        [0.3, 0.82],
        [0.31, 0.86],
        [0.28, 0.88],
        [0.24, 0.88],
      ],
      segments: 14,
    }),
  );
  const standing = new InstancedGroup(barrelGeometry, barrelMaterial, { capacity: 3, withShell: true, name: `${id}/standing` });
  const matrix = new THREE.Matrix4();
  const euler = new THREE.Euler();
  const quat = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  const pos = new THREE.Vector3();
  for (const [bx, bz, rot] of [
    [0, 0, 0.3],
    [0.68, 0.18, -0.5],
    [0.28, 0.72, 1.2],
  ] as const) {
    pos.set(bx, 0.0, bz);
    euler.set(0, rot, 0);
    quat.setFromEuler(euler);
    matrix.compose(pos, quat, one);
    standing.add(matrix, '#a05238');
  }
  group.add(standing.group);
  // 倒桶 ×1（横躺，桶口朝外）
  const lying = new THREE.Mesh(barrelGeometry, barrelMaterial);
  lying.name = `${id}/lying`;
  lying.position.set(-0.62, 0.3, 0.5);
  lying.rotation.set(0, 0.7, Math.PI / 2);
  lying.castShadow = true;
  group.add(lying);

  // —— 手写警示牌（木柱 + 微歪 4° 牌面；J6 手写笔迹 Canvas）——
  const signTexture = assets.texture(`${id}/tex-sign`, () =>
    paintCanvasTexture(`${id}/tex-sign`, 256, 192, drawWarningSignFace),
  );
  const woodMaterial = toonMaterials.get('wood', { color: '#6a5a48', name: `${id}/post` });
  const post = new THREE.Mesh(
    assets.geometry(`${id}/post`, () => {
      const pole = new THREE.CylinderGeometry(0.035, 0.042, 1.15, 8);
      pole.translate(0, 0.575, 0);
      return hardenEdges(pole);
    }),
    woodMaterial,
  );
  post.name = `${id}/post`;
  post.castShadow = true;
  group.add(post);
  const boardMaterial = toonMaterials.get('wood', { color: '#ece7da', map: signTexture, name: `${id}/board` });
  const board = new THREE.Mesh(
    assets.geometry(`${id}/board`, () => {
      const slab = roundedBox({ width: 0.78, height: 0.58, depth: 0.035, radius: 0.012 });
      slab.translate(0, 1.34, 0);
      return hardenEdges(slab);
    }),
    boardMaterial,
  );
  board.name = `${id}/board`;
  board.rotation.z = (4 * Math.PI) / 180; // 板微歪 4°（2.3.2-⑦ 定值）
  board.castShadow = true;
  group.add(board);

  return { group, barrelMaterial };
}
