// docs/01-整体架构.md §3.2 geom/parts/vehicles/classB/ —— T26 B型面包车专用部件：冲浪板（含双绑带）。
// docs/03-车型模块.md §4.2.4「车顶行李架+冲浪板（roofRack+surfboard 斜置 6°+双绑带，青绿 #7fb5a3）」+
//   draft 12-车型模块 §6.1「surfboard(1.9) 斜置 6°+双绑带 torus；板色青绿 #7fb5a3」。
// 板身=Extrude 椭圆长轮廓（bevel 出透镜断面）+尾鳍；双绑带=扁 torus 环绕板与架面（vanlife 读法锚点）。
// 斜置 6° 由调用方施加（rotation.z=0.105）；本件输出平置板（长轴沿局部 X）。
// ★ 禁止人形/人物几何（一.6）。
import * as THREE from 'three';
import type { SharedAssets } from '@/systems/handles';
import { toonMaterials } from '@/render/toonMaterial';
import { hardenEdges } from '@/geom/primitives';

export interface SurfboardParams {
  readonly assets: SharedAssets;
  /** 缓存/日志 id */
  readonly id: string;
  /** 板长（1.9——draft 定值） */
  readonly length?: number;
  /** 板色（青绿 #7fb5a3） */
  readonly color?: string;
  /** 板面条纹色（缺省奶油白） */
  readonly stripeColor?: string;
  /** 绑带数（双绑带=2——draft 定值） */
  readonly straps?: number;
  /** 绑带色 */
  readonly strapColor?: string;
  /** 工厂材质 name 前缀（缓存键） */
  readonly name: string;
}

export interface SurfboardResult {
  /** 板组（板身+尾鳍+条纹贴面+双绑带；长轴沿局部 X、板面朝 +Y） */
  readonly group: THREE.Group;
  /** 板身网格（smoke 勾验斜置角用） */
  readonly boardMesh: THREE.Mesh;
}

/** 冲浪板（平置）：板身 Extrude 透镜断面 + 尾鳍 + 板面条纹 + 双绑带 torus。原点=板底面中心。 */
export function createSurfboard(params: SurfboardParams): SurfboardResult {
  const { assets, id, name } = params;
  const length = params.length ?? 1.9;
  const halfL = length / 2;
  const halfW = length * 0.115; // 板宽 ≈0.22
  const straps = params.straps ?? 2;

  const group = new THREE.Group();
  group.name = `${id}/surfboard`;

  const boardColor = params.color ?? '#7fb5a3';

  // —— 板身：长椭圆轮廓（尖鼻圆尾）Extrude 0.045 + bevel 0.02 → 透镜断面；长轴 X、板面朝 +Y ——
  const boardShape = new THREE.Shape();
  boardShape.moveTo(-halfL + halfW * 0.4, 0);
  boardShape.quadraticCurveTo(-halfL * 0.55, halfW, 0, halfW * 0.82);
  boardShape.quadraticCurveTo(halfL * 0.72, halfW * 0.5, halfL, 0); // 尖鼻
  boardShape.quadraticCurveTo(halfL * 0.72, -halfW * 0.5, 0, -halfW * 0.82);
  boardShape.quadraticCurveTo(-halfL * 0.55, -halfW, -halfL + halfW * 0.4, 0);
  const boardMesh = new THREE.Mesh(
    assets.geometry(`${id}/board|${length}`, () => {
      const geometry = new THREE.ExtrudeGeometry(boardShape, {
        depth: 0.045,
        bevelEnabled: true,
        bevelThickness: 0.02,
        bevelSize: halfW * 0.55,
        bevelSegments: 2,
        curveSegments: 10,
        steps: 1,
      });
      geometry.rotateX(Math.PI / 2); // (u,v,t)→轮廓 XY 落 XZ 平面、厚度向 −Y……校正：板面朝 +Y
      geometry.translate(0, 0.045, 0);
      geometry.computeVertexNormals();
      return geometry;
    }),
    toonMaterials.get('paintCar', { color: boardColor, name: `${name}/board` }),
  );
  boardMesh.name = `${id}/board`;
  boardMesh.castShadow = true;
  group.add(boardMesh);

  // —— 板面条纹（中央奶油纵条——retro 读法，薄贴面）——
  const stripe = new THREE.Mesh(
    assets.geometry(`${id}/stripe|${length}`, () => {
      const shape = new THREE.Shape();
      shape.moveTo(-halfL + halfW * 0.6, 0);
      shape.quadraticCurveTo(-halfL * 0.5, halfW * 0.3, 0, halfW * 0.24);
      shape.quadraticCurveTo(halfL * 0.6, halfW * 0.15, halfL - halfW * 0.3, 0);
      shape.quadraticCurveTo(halfL * 0.6, -halfW * 0.15, 0, -halfW * 0.24);
      shape.quadraticCurveTo(-halfL * 0.5, -halfW * 0.3, -halfL + halfW * 0.6, 0);
      return new THREE.ShapeGeometry(shape, 8);
    }),
    toonMaterials.get('paintCar', { color: params.stripeColor ?? '#fdf6e6', name: `${name}/stripe` }),
  );
  stripe.name = `${id}/stripe`;
  stripe.rotation.x = -Math.PI / 2;
  stripe.position.y = 0.068;
  stripe.userData.noOutline = true;
  group.add(stripe);

  // —— 尾鳍（板尾下方小弧鳍，深色）——
  const finShape = new THREE.Shape();
  finShape.moveTo(-halfL + halfW * 0.55, 0);
  finShape.quadraticCurveTo(-halfL + halfW * 0.2, -0.075, -halfL + halfW * 0.75, -0.085);
  finShape.quadraticCurveTo(-halfL + halfW * 0.9, -0.04, -halfL + halfW * 0.9, 0);
  const fin = new THREE.Mesh(
    assets.geometry(`${id}/fin`, () => {
      const geometry = new THREE.ExtrudeGeometry(finShape, { depth: 0.014, bevelEnabled: false, curveSegments: 6, steps: 1 });
      geometry.rotateX(Math.PI / 2);
      geometry.translate(0, -0.014, 0);
      geometry.computeVertexNormals();
      return geometry;
    }),
    toonMaterials.get('matteProp', { color: '#3a3d42', outline: false, name: `${name}/fin` }),
  );
  fin.name = `${id}/fin`;
  fin.position.z = halfW * 0.55;
  group.add(fin);

  // —— 双绑带（扁 torus 环绕板面+架面；torus 环绕 X 轴——套住板断面）——
  const strapMaterial = toonMaterials.get('cloth', { color: params.strapColor ?? '#c2564a', name: `${name}/strap` });
  const strapGeometry = assets.geometry(`${id}/strap|${length}`, () => {
    const torus = new THREE.TorusGeometry(0.16, 0.016, 6, 14);
    torus.rotateY(Math.PI / 2); // 环绕 X 轴
    torus.scale(1, 1, 0.55); // 断面椭圆压扁（板厚向）
    return hardenEdges(torus);
  });
  for (let i = 0; i < straps; i++) {
    const strap = new THREE.Mesh(strapGeometry, strapMaterial);
    strap.name = `${id}/strap/${i}`;
    strap.position.set(-halfL * 0.42 + (i * length * 0.5) / Math.max(1, straps - 1), 0.055, 0);
    strap.scale.set(1, 1, (halfW + 0.05) / 0.16); // 环径对位板宽
    group.add(strap);
  }

  return { group, boardMesh };
}
