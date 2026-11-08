// docs/01-整体架构.md §3.2 geom/parts/clothMicro.ts —— 可复用部件库 clothMicro（微布料快捷工厂）。
// docs/02-场景模块.md §4.1.0 复用清单「clothMicro（微布料快捷工厂）」：
//   海崖 2.1.2-④ 野餐垫纸巾（ClothHandle stiffness 0.85，7-1-⑦）/ ① 遮阳天幕（0.35，预置下垂）；
//   松林晾晒毛巾/避难所工装/服务区小旗后续复用。
// 契约（docs/05 §7.1.2）：PlaneGeometry 12×8 分段；固定边约定 uv.x=0（wind.ts 定点说明）；
//   顶点位移归 WindSystem（场景零布料代码，docs/01 §3.4 归属裁定），本件只出网格+句柄+静态预置形。
// ★ 禁止人形/人物几何（一.6）。T18 落点。
import * as THREE from 'three';
import type { ClothHandle, SharedAssets } from '@/systems/handles';
import { toonMaterials } from '@/render/toonMaterial';

export interface MicroClothParams {
  readonly assets: SharedAssets;
  /** 缓存/日志 id（同 id 几何共享） */
  readonly id: string;
  /** 布面尺寸（x × y，竖挂布；canopy 预置形时 x × z 水平铺） */
  readonly width: number;
  readonly height: number;
  /** 布色（cloth 原型 rampSoft，§5.2 原型表 #12） */
  readonly color: string;
  /** ClothHandle.stiffness（天幕 0.35 / 纸巾 0.85 / 小旗 0.25，§7.1.2 布料总表） */
  readonly stiffness: number;
  /** 风力系数（默认 1；纸巾 0.8） */
  readonly windFactor?: number;
  /** 积水下凹幅度 m（天幕 0.06，§7.1.2） */
  readonly sagAmp?: number;
  /** 摆动轴集合（默认 ['z']） */
  readonly swayAxes?: readonly ('x' | 'y' | 'z')[];
  /** 静态预置形：'canopy'（水平天幕，中心下垂）/ 'hang'（竖布自由边垂坠）/ null */
  readonly preset?: 'canopy' | 'hang' | null;
  /** canopy 下垂量（m，预置下垂——2.1.2-①「预置下垂」；区别于运行期 uSag 积水下凹） */
  readonly droop?: number;
  /** 布檐滴水锚点（局部坐标；M1 字段，T13/天气侧消费） */
  readonly dripAnchors?: readonly THREE.Vector3[];
  /** 贴图（gingham 格纹等；默认无） */
  readonly map?: THREE.Texture;
  /** 双面（默认 false——风吹单面即可，旗帜/纸巾建议 true） */
  readonly doubleSided?: boolean;
}

export interface MicroClothResult {
  readonly mesh: THREE.Mesh;
  readonly handle: ClothHandle;
}

/**
 * 微布料快捷工厂：网格（12×8 分段 Plane）+ ClothHandle（WindSystem 统一驱动，场景零代码）。
 * 水平天幕传 preset:'canopy'（几何已转平，+y 朝上）；竖挂布默认竖直平面（固定边在上沿 uv.y=1 处
 * —— uv.x=0 为固定边约定不变，竖布以侧边固定时调用方自行旋转网格）。
 */
export function createMicroCloth(params: MicroClothParams): MicroClothResult {
  const { assets, id } = params;
  const geometry = assets.geometry(`${id}/cloth`, () => {
    const plane = new THREE.PlaneGeometry(params.width, params.height, 12, 8);
    if (params.preset === 'canopy') {
      plane.rotateX(-Math.PI / 2); // 水平天幕：+y 朝上
      bakeDroop(plane, params.droop ?? 0.09, 'canopy');
    } else if (params.preset === 'hang') {
      bakeDroop(plane, params.droop ?? 0.04, 'hang');
    }
    plane.computeBoundingSphere();
    return plane;
  });
  const material = toonMaterials.get('cloth', {
    color: params.color,
    map: params.map ?? null,
    name: `${id}/cloth`,
  });
  if (params.doubleSided) {
    material.side = THREE.DoubleSide; // 工厂无 side 参数（ToonMaterialParams 契约）——唯一 name 缓存键内设置
  }
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = id;
  mesh.castShadow = true; // §4.3.3-⑤：天幕布 castShadow（customDepthMaterial 由 WindSystem 注册时挂）
  mesh.receiveShadow = false;
  const handle: ClothHandle = {
    mesh,
    swayAxes: params.swayAxes ?? ['z'],
    stiffness: params.stiffness,
    windFactor: params.windFactor ?? 1,
    sagAmp: params.sagAmp ?? 0,
    dripAnchors: params.dripAnchors,
  };
  return { mesh, handle };
}

/** 预置形烘焙：canopy=中心下垂（四角支撑天幕） / hang=自由边（uv.x→1）垂坠。 */
function bakeDroop(geometry: THREE.BufferGeometry, amount: number, kind: 'canopy' | 'hang'): void {
  if (amount <= 0) return;
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < position.count; i++) {
    const u = uv.getX(i);
    const v = uv.getY(i);
    if (kind === 'canopy') {
      // 四角拉紧、中心下垂；边中点半垂（ sin×sin 曲面）
      const sag = Math.sin(Math.PI * u) * Math.sin(Math.PI * v);
      position.setY(i, position.getY(i) - amount * sag);
    } else {
      // 竖布自由边下垂：固定边 uv.x=0，自由边按 u² 加权
      position.setY(i, position.getY(i) - amount * u * u);
    }
  }
  position.needsUpdate = true;
}
