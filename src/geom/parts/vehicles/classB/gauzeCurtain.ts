// docs/01-整体架构.md §3.2 geom/parts/vehicles/classB/ —— T26 B型面包车专用部件：后掀尾门纱帘。
// docs/03-车型模块.md §4.2.4「纱帘（texGauze 网格 alpha，opacity 0.5，ClothHandle 微摆）」+
//   draft 12-车型模块 §6.1「舱口内侧 Plane+texGauze alpha；opacity0.5；ClothHandle(0.35) 微摆；
//   透光 emissive」+ docs/05 §7.1.2 布料总表「B 型纱帘 0.35/0.12（车内微风）/sag 0」。
// 布料 UV 约定（wind.ts 定点）：固定边=uv.x 0——纱帘上缘挂舱口上框（固端），下摆自由（uv.x→1）；
//   织网贴图 uv 另行重排（uv.y=横向、uv.x=竖向挂载权重），网格在竖向随高度重复。
// ★ 禁止人形/人物几何（一.6）。
import * as THREE from 'three';
import type { ClothHandle, SharedAssets } from '@/systems/handles';
import { toonMaterials } from '@/render/toonMaterial';
import { createGauzeTexture } from './retroTextures';

export interface GauzeCurtainParams {
  readonly assets: SharedAssets;
  /** 缓存/日志 id */
  readonly id: string;
  /** 帘宽（沿车宽 Z）与垂高 */
  readonly width: number;
  readonly height: number;
  /** 织网纵向重复次数（网格密度） */
  readonly repeatY?: number;
  /** 透光 emissive 色（钩子写 0.5×power） */
  readonly glowColor: string;
  /** ClothHandle.stiffness（docs/05 §7.1.2 纱帘行 0.35） */
  readonly stiffness: number;
  /** ClothHandle.windFactor（车内微风 0.12） */
  readonly windFactor?: number;
  /** 工厂材质 name（缓存键） */
  readonly name: string;
}

export interface GauzeCurtainResult {
  /** 纱帘网格（Plane 8×6 分段；挂舱口内侧，上缘对齐挂框） */
  readonly mesh: THREE.Mesh;
  /** 纱帘材质（glowTag 透光由车型钩子写入 emissiveIntensity；WindSystem 克隆后双写同步由车型钩子承担） */
  readonly material: THREE.MeshToonMaterial;
  /** 布料句柄（WindSystem 统一驱动；车辆零布料代码） */
  readonly handle: ClothHandle;
}

/** 纱帘：texGauze 网格 alpha + opacity 0.5 + 上缘固定/下摆自由 UV。原点=帘面中心。 */
export function createGauzeCurtain(params: GauzeCurtainParams): GauzeCurtainResult {
  const { assets, id, width, height, glowColor, name } = params;
  const repeatY = params.repeatY ?? 3;

  const texture = createGauzeTexture(assets, id);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, repeatY);

  const material = toonMaterials.getToon('cloth', {
    color: '#fff8ea',
    map: texture,
    opacity: 0.5, // docs/03 §4.2.4 定值（opacity<1 → 工厂自动 transparent + depthWrite false）
    emissive: glowColor,
    emissiveIntensity: 0, // authored 0：glowTag 由 applyInteriorLight 写 0.5×power
    outline: false,
    name: `${name}/mat`,
  });
  material.side = THREE.DoubleSide; // 工厂无 side 参数——唯一 name 缓存键内设置（帘两面可见）

  const mesh = new THREE.Mesh(
    assets.geometry(`${id}/mesh|${width}|${height}`, () => {
      const plane = new THREE.PlaneGeometry(width, height, 8, 6);
      const position = plane.getAttribute('position') as THREE.BufferAttribute;
      const uv = plane.getAttribute('uv') as THREE.BufferAttribute;
      for (let i = 0; i < position.count; i++) {
        const u = uv.getX(i); // 0..1 沿宽
        const v = uv.getY(i); // 0..1 沿高（1=上缘）
        // wind 定点：固定边=uv.x 0（上缘挂框）→ uv.x=1−v（上缘 0、下摆 1）；贴图横向=uv.y
        uv.setX(i, 1 - v);
        uv.setY(i, u);
        // 上缘微波浪预弯（挂环读法；静态形变烘焙进顶点）
        position.setZ(i, Math.sin(u * Math.PI * 3) * 0.012 * (1 - v));
      }
      position.needsUpdate = true;
      uv.needsUpdate = true;
      plane.computeVertexNormals();
      plane.computeBoundingSphere();
      return plane;
    }),
    material,
  );
  mesh.name = `${id}/mesh`;
  mesh.userData.noOutline = true; // 帘布小件 noOutline（透窗防描边碎线，docs/03 §4.2.0）
  mesh.renderOrder = 14; // 帘布透光层（玻璃 20 之下、贴花 6 之上）

  const handle: ClothHandle = {
    mesh,
    swayAxes: ['x', 'z'], // 固定边在上：下摆横向 x 与纵深 z 微摆（车内微风）
    stiffness: params.stiffness,
    windFactor: params.windFactor ?? 0.12,
    sagAmp: 0, // docs/05 §7.1.2 纱帘行 sag 0
  };

  return { mesh, material, handle };
}
